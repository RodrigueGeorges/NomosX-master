import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';
import { getPublicationFormat } from '@/lib/publication-formats';
import { publicPublicationWhere } from '@/lib/publication-visibility';

const TOPIC_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'climate', 'regulation',
  'economy', 'technology', 'policy', 'health', 'energy', 'finance', 'innovation',
  'sustainability', 'digital', 'geopolitics', 'cybersecurity', 'biotechnology',
  'renewable energy', 'supply chain', 'fintech', 'trade', 'security', 'law',
];

function looksLikeMarkdown(content: string): boolean {
  return /^#{1,3}\s|\*\*[^*]+\*\*|^[-*] /m.test(content) && !/<[a-z][\s\S]*>/i.test(content);
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
  // Add id anchors to bibliography <li> items: <li>[SRC-3] → <li id="src-3">[SRC-3]
  let out = html.replace(/<li>(\[SRC-(\d+)\])/g, '<li id="src-$2">$1');
  // Convert all inline [SRC-N] references to anchor links
  out = out.replace(/\[SRC-(\d+)\]/g, '<a href="#src-$1" class="citation-ref">[SRC-$1]</a>');
  return out;
}

function inlineMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function extractTopics(title: string): string[] {
  const t = title.toLowerCase();
  return TOPIC_KEYWORDS
    .filter(kw => t.includes(kw))
    .map(kw => kw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
    .slice(0, 5);
}

/**
 * GET /api/articles/[id]
 * 
 * Fetch a single article by ID
 * Returns article content and related articles
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRateLimit(
    rateLimitConfigs.api,
    async (req) => {
      try {
        const { id } = await params;
        
        // Validate ID format
        const idValidation = commonSchemas.id.safeParse({ id });
        if (!idValidation.success) {
          return NextResponse.json(
            { error: 'Invalid article ID format' },
            { status: 400 }
          );
        }
        
        // Public publications are open-read. Auth is only used by adjacent
        // actions such as export or commissioning follow-up research.
        const { searchParams } = new URL(req.url);
        const devPreview = process.env.NODE_ENV === 'development' && searchParams.get('devPreview') === '1';
        if (devPreview) await getSession();

        // Fetch the article
        const article = await prisma.thinkTankPublication.findFirst({
          where: publicPublicationWhere({ id: idValidation.data.id }),
          select: {
            id: true,
            title: true,
            html: true,
            type: true,
            publishedAt: true,
            wordCount: true,
            sourceIds: true,
            trustScore: true,
          }
        });

        if (!article) {
          return NextResponse.json(
            { error: 'Article not found' },
            { status: 404 }
          );
        }

        const rawHtml = (article.html || '').replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        const content: string = linkifyCitations(looksLikeMarkdown(rawHtml) ? markdownToHtml(rawHtml) : rawHtml);

        // Fetch related articles (same type, published recently)
        const relatedArticles = await prisma.thinkTankPublication.findMany({
          where: {
            id: { not: idValidation.data.id },
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

        // Transform data
        const transformedArticle = {
          id: article.id,
          title: article.title,
          content,
          type: article.type,
          format: getPublicationFormat(article.type),
          publishedAt: article.publishedAt?.toISOString() || new Date().toISOString(),
          readTime: Math.max(1, Math.ceil(article.wordCount / 200)),
          sources: article.sourceIds?.length || 0,
          topics: extractTopics(article.title || ''),
          trustScore: article.trustScore,
        };

        const transformedRelated = relatedArticles.map(related => ({
          id: related.id,
          title: related.title,
          type: related.type,
          publishedAt: related.publishedAt?.toISOString() || new Date().toISOString(),
          readTime: Math.max(1, Math.ceil(related.wordCount / 200)),
        }));

        return NextResponse.json({
          article: transformedArticle,
          relatedArticles: transformedRelated,
        });

      } catch (error: unknown) {
        console.error('[API/Articles/[id]] Error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch article' },
          { status: 500 }
        );
      }
    }
  )(req);
}
