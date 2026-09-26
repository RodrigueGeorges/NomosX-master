import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationFormat } from '@/lib/publication-formats';
import { getPublicationInLocale } from '@/lib/agent/translation-service';

const TOPIC_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'climate', 'regulation',
  'economy', 'technology', 'policy', 'health', 'energy', 'finance', 'innovation',
  'sustainability', 'digital', 'geopolitics', 'cybersecurity', 'biotechnology',
  'renewable energy', 'supply chain', 'fintech', 'trade', 'security', 'law',
];

function extractTopics(title: string): string[] {
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

export interface InquiryData {
  id: string;
  title: string;
  content: string;
  type: string;
  format: ReturnType<typeof getPublicationFormat>;
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  domain: string;
  heroImageUrl: string | null;
  trustScore: number | null;
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
      },
    });

    if (!article) {
      return { inquiry: null, related: [] };
    }

    // If a non-default locale is requested, get the translated version
    let articleTitle = article.title;
    let articleHtml = article.html;
    if (locale !== 'en' && locale !== (article.language || 'en')) {
      const translated = await getPublicationInLocale(article.id, locale);
      if (translated) {
        articleTitle = translated.title;
        articleHtml = translated.html;
      }
    }

    const rawHtml = (articleHtml || '')
      .replace(/^```html?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    const content = linkifyCitations(
      looksLikeMarkdown(rawHtml) ? markdownToHtml(rawHtml) : rawHtml
    );

    const relatedArticles = await prisma.thinkTankPublication.findMany({
      where: {
        id: { not: article.id },
        type: article.type,
        ...publicPublicationWhere(),
      },
      select: {
        id: true,
        title: true,
        type: true,
        publishedAt: true,
        wordCount: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    });

    return {
      inquiry: {
        id: article.id,
        title: articleTitle,
        content,
        type: article.type,
        format: getPublicationFormat(article.type),
        publishedAt: article.publishedAt?.toISOString() || new Date().toISOString(),
        readTime: Math.max(1, Math.ceil(article.wordCount / 200)),
        sources: article.sourceIds?.length || 0,
        topics: extractTopics(articleTitle || ''),
        domain: article.vertical?.name ?? article.vertical?.slug ?? 'general',
        heroImageUrl: article.heroImageUrl ?? null,
        trustScore: article.trustScore,
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
