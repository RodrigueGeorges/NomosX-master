/**
 * Publication Translation Service
 *
 * On-demand translation of published articles using GPT-4.
 * Translations are cached in the `PublicationTranslation` table.
 *
 * Flow:
 * 1. User visits /fr/inquiry/[slug]
 * 2. Look up existing translation in DB
 * 3. If found → return cached translation
 * 4. If not → call GPT to translate, store in DB, return
 *
 * The original article is never modified. Translations are linked via
 * the `PublicationTranslation` model (publicationId + locale unique).
 */

import { prisma } from '@/lib/db';
import { callLLM } from '@/lib/llm/unified-llm';

export interface TranslationResult {
  title: string;
  html: string;
  locale: string;
  cached: boolean;
}

/** In-flight translation dedup — one LLM run per (publication, locale). */
const IN_FLIGHT_TRANSLATIONS = new Map<string, Promise<TranslationResult | null>>();

/**
 * Get a publication in the requested locale.
 *
 * - If the publication's original language matches the locale, return as-is.
 * - Otherwise, look up or generate a translation.
 *
 * Returns { title, html, locale, cached } or null on failure.
 */
export async function getPublicationInLocale(
  publicationId: string,
  locale: string
): Promise<TranslationResult | null> {
  const publication = await prisma.thinkTankPublication.findUnique({
    where: { id: publicationId },
    select: {
      id: true,
      title: true,
      html: true,
      language: true,
    },
  });

  if (!publication) return null;

  // If the original is already in the requested locale, return it
  if (publication.language === locale) {
    return {
      title: publication.title,
      html: publication.html,
      locale,
      cached: true,
    };
  }

  // Look up cached translation
  const existing = await prisma.publicationTranslation.findUnique({
    where: {
      publicationId_locale: { publicationId, locale },
    },
    select: { title: true, html: true },
  });

  if (existing) {
    return {
      title: existing.title,
      html: existing.html,
      locale,
      cached: true,
    };
  }

  // Generate translation — dedupe in-flight calls so concurrent page
  // loads (or abandoned bounded waits) don't stack identical LLM runs.
  const inFlightKey = `${publicationId}:${locale}`;
  const inFlight = IN_FLIGHT_TRANSLATIONS.get(inFlightKey);
  if (inFlight) return inFlight;

  const run = (async (): Promise<TranslationResult | null> => {
    try {
      const translated = await translateArticle(
        publication.title,
        publication.html,
        locale
      );

      // Cache in DB
      await prisma.publicationTranslation.create({
        data: {
          publicationId,
          locale,
          title: translated.title,
          html: translated.html,
          model: 'gpt-4-turbo',
          quality: 'machine',
        },
      });

      return {
        title: translated.title,
        html: translated.html,
        locale,
        cached: false,
      };
    } catch (err) {
      console.error(`[Translation] Failed to translate ${publicationId} to ${locale}:`, err);
      // Fallback: return original
      return {
        title: publication.title,
        html: publication.html,
        locale: publication.language || 'en',
        cached: false,
      };
    } finally {
      IN_FLIGHT_TRANSLATIONS.delete(inFlightKey);
    }
  })();

  IN_FLIGHT_TRANSLATIONS.set(inFlightKey, run);
  return run;
}

/**
 * Translate an article's title and HTML body using GPT-4 Turbo.
 *
 * Preserves:
 * - All HTML tags and structure
 * - [SRC-N] citation markers (never translated)
 * - Source titles in original language (academic titles stay original)
 * - Data, numbers, statistics (exactly as-is)
 */
const DATA_URI_SRC_RE = /src="data:image\/[a-zA-Z0-9.+-]+;base64,[^"]+"/g;
const IMG_PLACEHOLDER_RE = /src="\/__nx_img_(\d+)__"/g;

/**
 * Externalize base64-embedded images before translation.
 *
 * A single hero image is ~600KB of base64 — ~1.1M tokens once inside the
 * prompt, which blows through every provider's context limit (observed:
 * glm timeout, openai 400, kimi 400). The bytes carry no translatable
 * content, so we swap each src for an opaque placeholder and restore it
 * verbatim afterwards. The public render path re-externalizes to
 * /api/articles/[id]/media/[n], so order is preserved by index.
 */
function stripInlineImages(html: string): { html: string; srcs: string[] } {
  const srcs: string[] = [];
  const stripped = html.replace(DATA_URI_SRC_RE, (match) => {
    srcs.push(match.slice('src="'.length, -1));
    return `src="/__nx_img_${srcs.length - 1}__"`;
  });
  return { html: stripped, srcs };
}

function restoreInlineImages(html: string, srcs: string[]): string {
  return html.replace(IMG_PLACEHOLDER_RE, (_m, i) => `src="${srcs[Number(i)]}"`);
}

/**
 * Split HTML at block-level tag boundaries into ~CHUNK_SIZE-char pieces.
 * Splits only AFTER a closing block tag so no element is cut mid-way.
 */
const CHUNK_SIZE = 25_000;
const BLOCK_END = /<\/(section|div|p|ul|ol|li|figure|figcaption|article|header|footer|h[1-6]|blockquote|table|details|nav|aside)>/gi;

function chunkHtml(html: string): string[] {
  if (html.length <= CHUNK_SIZE * 1.5) return [html];
  const chunks: string[] = [];
  let start = 0;
  while (start < html.length) {
    const targetEnd = Math.min(start + CHUNK_SIZE, html.length);
    if (targetEnd === html.length) { chunks.push(html.slice(start)); break; }
    // Find the last block-closing tag before targetEnd
    let splitAt = -1;
    BLOCK_END.lastIndex = start;
    let m: RegExpExecArray | null;
    while ((m = BLOCK_END.exec(html)) !== null) {
      if (m.index + m[0].length > targetEnd) break;
      splitAt = m.index + m[0].length;
    }
    if (splitAt === -1 || splitAt <= start) {
      // No boundary found — fall back to the next '>' after targetEnd
      const gt = html.indexOf('>', targetEnd);
      splitAt = gt === -1 ? html.length : gt + 1;
    }
    chunks.push(html.slice(start, splitAt));
    start = splitAt;
  }
  return chunks;
}

const SYSTEM_PROMPT = (localeName: string) => `You are a professional translator for a strategic intelligence think tank (NomosX). Translate the given content from English to ${localeName}.

CRITICAL RULES:
1. Preserve ALL HTML tags exactly — only translate the text content between tags.
2. NEVER translate [SRC-N] citation markers. They must remain exactly as [SRC-1], [SRC-2], etc.
3. NEVER translate source titles, author names, or institutional names in the source list section. Academic paper titles stay in their original language.
4. Preserve all numbers, statistics, dates, percentages, and units EXACTLY as-is.
5. Maintain the same tone: analytical, objective, precise — not colloquial.
6. Do not add or remove content. Translate what exists, nothing more.
7. Preserve CSS classes and inline styles on HTML elements.
8. For the title: translate it fully, keeping it under 100 characters if possible.
9. Keep section headings (h1, h2, h3) concise and impactful in the target language.
10. If a term has no good translation (e.g. "Devil's Advocate", "Brier score"), keep it in English with the translation in parentheses on first use.
11. NEVER modify or remove image placeholders like src="/__nx_img_0__" — they are opaque tokens, preserve them byte-for-byte.`;

async function translateArticle(
  title: string,
  html: string,
  targetLocale: string
): Promise<{ title: string; html: string }> {
  const localeName = targetLocale === 'fr' ? 'French' : targetLocale;
  const { html: strippedHtml, srcs } = stripInlineImages(html);
  const systemPrompt = SYSTEM_PROMPT(localeName);
  const chunks = chunkHtml(strippedHtml);

  // Title travels with the first chunk so it gets translated exactly once.
  const translateOne = async (chunk: string, withTitle: boolean) => {
    const response = await callLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Translate the following ${withTitle ? 'article title and HTML fragment' : 'HTML fragment'} to ${localeName}.${withTitle ? '' : ' It is a contiguous slice of a larger article — do not add opening or closing tags that are not already present.'}

${withTitle ? `TITLE:\n${title}\n\n` : ''}HTML:
${chunk}

Return the result as JSON:
${withTitle ? '{"title": "translated title", "html": "translated html"}' : '{"html": "translated html"}'}

Return ONLY the JSON, no markdown fences, no commentary.`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 16000,
      task: 'translation',
    });
    const parsed = JSON.parse(response.content || '{}');
    if (typeof parsed.html !== 'string' || !parsed.html) {
      throw new Error('Empty html in translation response');
    }
    return parsed as { title?: string; html: string };
  };

  // Small articles: single call, same as before.
  if (chunks.length === 1) {
    const r = await translateOne(chunks[0], true);
    return {
      title: r.title || title,
      html: restoreInlineImages(r.html, srcs),
    };
  }

  // Large articles: chunked translation, sequential to stay under
  // provider rate limits. Each chunk is a contiguous block-aligned slice.
  let translatedTitle = title;
  const out: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const r = await translateOne(chunks[i], i === 0);
    if (i === 0 && r.title) translatedTitle = r.title;
    out.push(r.html);
    console.log(`[Translation] chunk ${i + 1}/${chunks.length} done (${chunks[i].length} chars)`);
  }

  return {
    title: translatedTitle,
    html: restoreInlineImages(out.join(''), srcs),
  };
}
