import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';

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
        
        // Determine subscription access
        const { searchParams } = new URL(req.url);
        const devPreview = process.env.NODE_ENV === 'development' && searchParams.get('devPreview') === '1';
        const session = await getSession();
        let isPaidUser = devPreview;
        if (!devPreview && session?.id) {
          const user = await prisma.user.findUnique({
            where: { id: session.id },
            include: { subscription: true },
          });
          const plan = user?.subscription?.plan || 'ANALYST';
          isPaidUser = plan !== 'TRIAL' && plan !== 'ANALYST';
        }

        // Fetch the article
        const article = await prisma.thinkTankPublication.findUnique({
          where: { id: idValidation.data.id },
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

        // Server-side paywall: free users get a clean teaser from first paragraphs
        const rawHtml = (article.html || '').replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        let content: string = rawHtml;
        if (!isPaidUser && rawHtml) {
          const paragraphMatches = [...rawHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
          const paragraphTexts = paragraphMatches
            .map(m => m[1].replace(/<[^>]*>/g, '').replace(/\[SRC-\d+\]/g, '').replace(/\s+/g, ' ').trim())
            .filter(t => t.length > 40);
          if (paragraphTexts.length > 0) {
            const teaser = paragraphTexts.slice(0, 3).join('\n\n');
            content = teaser.length > 800 ? teaser.substring(0, 800) + '\u2026' : teaser;
          } else {
            const plain = rawHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            content = plain.length > 600 ? plain.substring(0, 600) + '\u2026' : plain;
          }
        }

        // Fetch related articles (same type, published recently)
        const relatedArticles = await prisma.thinkTankPublication.findMany({
          where: {
            id: { not: idValidation.data.id },
            type: article.type,
            status: 'PUBLISHED',
            publishedAt: { not: null },
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

      } catch (error: any) {
        console.error('[API/Articles/[id]] Error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch article' },
          { status: 500 }
        );
      }
    }
  )(req);
}
