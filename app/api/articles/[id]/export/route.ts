import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withAuth, withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';
import { generatePrintHTML } from '@/lib/agent/pdf-export';

/**
 * POST /api/articles/[id]/export
 *
 * Export an article as print-optimized HTML (download as .html, print-to-PDF in browser).
 * Requires RESEARCHER or STUDIO subscription.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.upload,
      async (req) => {
        try {
          const session = await getSession();
          if (!session) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
          }

          const { id } = await params;
          const idValidation = commonSchemas.id.safeParse({ id });
          if (!idValidation.success) {
            return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
          }

          // Check subscription tier
          const user = await prisma.user.findUnique({
            where: { id: session.id },
            include: { subscription: true },
          });

          const plan = user?.subscription?.plan || 'ANALYST';
          if (plan === 'TRIAL' || plan === 'ANALYST') {
            return NextResponse.json(
              { error: 'RESEARCHER or STUDIO subscription required for PDF export' },
              { status: 403 }
            );
          }

          // Fetch article
          const article = await prisma.thinkTankPublication.findUnique({
            where: { id: idValidation.data.id },
            select: { id: true, title: true, html: true, publishedAt: true, wordCount: true },
          });

          if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
          }

          // Generate print-optimized HTML using the pdf-export agent
          const printHtml = generatePrintHTML(article.html);

          const safeFilename = article.title
            .replace(/[^a-z0-9\s-]/gi, '')
            .replace(/\s+/g, '_')
            .toLowerCase()
            .slice(0, 80);

          return new NextResponse(printHtml, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Disposition': `attachment; filename="${safeFilename}.html"`,
            },
          });
        } catch (error: any) {
          console.error('[API/Articles/[id]/Export] Error:', error);
          return NextResponse.json({ error: 'Failed to export article' }, { status: 500 });
        }
      }
    )
  )(req);
}
