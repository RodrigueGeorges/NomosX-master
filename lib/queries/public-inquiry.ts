import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationFormat } from '@/lib/publication-formats';
import { getPublicationInLocale } from '@/lib/agent/translation-service';
import { getResearcherForDomain, RESEARCHERS } from '@/lib/researchers';
import { resolveDomainKey } from '@/lib/brand/god-fields';

const TOPIC_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'climate', 'regulation',
  'economy', 'technology', 'policy', 'health', 'energy', 'finance', 'innovation',
  'sustainability', 'digital', 'geopolitics', 'cybersecurity', 'biotechnology',
  'renewable energy', 'supply chain', 'fintech', 'trade', 'security', 'law',
];

export function extractTopics(title: string): string[] {
  const t = title.toLowerCase();
  return TOPIC_KEYWORDS
    .filter(kw => t.includes(kw))
    .map(kw => kw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
    .slice(0, 5);
}

function looksLikeMarkdown(content: string): boolean {
  return /^#{1,3}\s|\*\*[^*]+\*\*|^[-*] /m.test(content) && !/<[a-z][\s\S]*>/i.test(content);
}

function inlineMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^### (.+)/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${line.slice(4)}</h3>`);
    } else if (/^## (.+)/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${line.slice(3)}</h2>`);
    } else if (/^# (.+)/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${line.slice(2)}</h1>`);
    } else if (/^[-*] (.+)/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
    } else if (line === '') {
      if (inList) { out.push('</ul>'); inList = false; }
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function linkifyCitations(html: string): string {
  let out = html.replace(/<li>(\[SRC-(\d+)\])/g, '<li id="src-$2">$1');
  out = out.replace(/\[SRC-(\d+)\]/g, '<a href="#src-$1" class="citation-ref">[SRC-$1]</a>');
  return out;
}

const INLINE_IMG_RE = /src="data:image\/[a-zA-Z0-9.+-]+;base64,[^"]+"/g;

/**
 * Publications embed images as base64 data URIs — they can weigh several MB
 * inside the HTML payload. Replace each src with a deterministic URL that the
 * media route resolves by index; bytes are served once, cacheable forever.
 * Order must match the extractor in app/api/articles/[id]/media/[n]/route.ts.
 */
export function externalizeInlineImages(html: string, articleRef: string): string {
  let n = 0;
  return html.replace(INLINE_IMG_RE, () => `src="/api/articles/${articleRef}/media/${n++}"`);
}

export interface InquiryDeskAttribution {
  id: string;
  name: string;
  initials: string;
  colorHex: string;
  /** The desk that signed off on publication, when the pipeline recorded one. */
  signedBy?: string;
  signDecision?: string;
}

export interface InquiryData {
  id: string;
  publicId: string | null;
  title: string;
  content: string;
  type: string;
  format: ReturnType<typeof getPublicationFormat>;
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  domain: string;
  verticalSlug: string | null;
  heroImageUrl: string | null;
  trustScore: number | null;
  /** Owning council desk — resolved from vertical/domain → DESK_FOR_DOMAIN. */
  desk: InquiryDeskAttribution | null;
}

export interface RelatedInquiryData {
  id: string;
  title: string;
  type: string;
  publishedAt: string;
  readTime: number;
}

export async function fetchInquiryData(slug: string, locale: string = 'en'): Promise<{
  inquiry: InquiryData | null;
  related: RelatedInquiryData[];
}> {
  try {
    const article = await prisma.thinkTankPublication.findFirst({
      where: publicPublicationWhere({ OR: [{ id: slug }, { publicId: slug }] }),
      select: {
        id: true,
        publicId: true,
        title: true,
        html: true,
        type: true,
        publishedAt: true,
        wordCount: true,
        sourceIds: true,
        trustScore: true,
        language: true,
        heroImageUrl: true,
        vertical: { select: { name: true, slug: true, color: true } },
        criticalLoopResult: true,
      },
    });

    if (!article) {
      return { inquiry: null, related: [] };
    }

    // If a non-default locale is requested, get the translated version.
    // Bounded wait: a cold translation can cascade across provider timeouts
    // (glm 180s → openai 120s → kimi 300s) — the page must not hang. On
    // timeout we serve the original language; the abandoned call keeps
    // running and caches the translation for the next visit.
    let articleTitle = article.title;
    let articleHtml = article.html;
    if (locale !== 'en' && locale !== (article.language || 'en')) {
      const TRANSLATION_WAIT_MS = 60_000;
      const translated = await Promise.race([
        getPublicationInLocale(article.id, locale),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TRANSLATION_WAIT_MS)),
      ]);
      if (translated) {
        articleTitle = translated.title;
        articleHtml = translated.html;
      }
    }

    const rawHtml = (articleHtml || '')
      .replace(/^```html?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    const content = externalizeInlineImages(
      linkifyCitations(
        looksLikeMarkdown(rawHtml) ? markdownToHtml(rawHtml) : rawHtml
      ),
      article.publicId || article.id,
    );

    const relSelect = {
      id: true, title: true, type: true, publishedAt: true, wordCount: true,
    } as const;

    // Prefer same-domain (vertical) pieces, fill with same-format ones.
    const sameVertical = article.vertical?.slug
      ? await prisma.thinkTankPublication.findMany({
          where: {
            id: { not: article.id },
            vertical: { is: { slug: article.vertical.slug } },
            ...publicPublicationWhere(),
          },
          select: relSelect,
          orderBy: { publishedAt: 'desc' },
          take: 5,
        })
      : [];

    const relatedArticles = sameVertical.length >= 4
      ? sameVertical
      : [
          ...sameVertical,
          ...(await prisma.thinkTankPublication.findMany({
            where: {
              id: { not: article.id, notIn: sameVertical.map((r) => r.id) },
              type: article.type,
              ...publicPublicationWhere(),
            },
            select: relSelect,
            orderBy: { publishedAt: 'desc' },
            take: 5 - sameVertical.length,
          })),
        ];

    return {
      inquiry: {
        id: article.id,
        publicId: article.publicId ?? null,
        title: articleTitle,
        content,
        type: article.type,
        format: getPublicationFormat(article.type),
        publishedAt: article.publishedAt?.toISOString() || new Date().toISOString(),
        readTime: Math.max(1, Math.ceil(article.wordCount / 200)),
        sources: article.sourceIds?.length || 0,
        topics: extractTopics(articleTitle || ''),
        domain: article.vertical?.name ?? article.vertical?.slug ?? 'general',
        verticalSlug: article.vertical?.slug ?? null,
        heroImageUrl: article.heroImageUrl ?? null,
        trustScore: article.trustScore,
        desk: (() => {
          const clr = (article.criticalLoopResult ?? {}) as Record<string, any>;
          const signedBy: string | undefined = clr?.signOff?.researcher;
          // Prefer the signing desk (authoritative), else the vertical's owning desk.
          const signed = signedBy ? RESEARCHERS.find((x) => x.name === signedBy) : undefined;
          const domainKey = resolveDomainKey(article.vertical?.slug ?? clr?.domain ?? article.vertical?.name);
          const owner = signed ?? (domainKey ? getResearcherForDomain(domainKey) : undefined);
          if (!owner) return null;
          return {
            id: owner.id,
            name: owner.name,
            initials: owner.initials,
            colorHex: owner.colorHex,
            signedBy,
            signDecision: clr?.signOff?.decision,
          };
        })(),
      },
      related: relatedArticles.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        publishedAt: r.publishedAt?.toISOString() || new Date().toISOString(),
        readTime: Math.max(1, Math.ceil(r.wordCount / 200)),
      })),
    };
  } catch (error: any) {
    console.error('[fetchInquiryData] Error:', error);
    return { inquiry: null, related: [] };
  }
}
