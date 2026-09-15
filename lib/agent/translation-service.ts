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

  // Generate translation via GPT
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
  }
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
async function translateArticle(
  title: string,
  html: string,
  targetLocale: string
): Promise<{ title: string; html: string }> {
  const localeName = targetLocale === 'fr' ? 'French' : targetLocale;

  const systemPrompt = `You are a professional translator for a strategic intelligence think tank (NomosX). Translate the given content from English to ${localeName}.

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
10. If a term has no good translation (e.g. "Devil's Advocate", "Brier score"), keep it in English with the translation in parentheses on first use.`;

  const userPrompt = `Translate the following article to ${localeName}.

TITLE:
${title}

HTML BODY:
${html}

Return the result as JSON:
{"title": "translated title", "html": "translated html"}

Return ONLY the JSON, no markdown fences, no commentary.`;

  const response = await callLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 16000,
    task: 'translation',
  });

  const content = response.content;
  if (!content) throw new Error('Empty response from LLM');

  const parsed = JSON.parse(content);
  return {
    title: parsed.title || title,
    html: parsed.html || html,
  };
}
