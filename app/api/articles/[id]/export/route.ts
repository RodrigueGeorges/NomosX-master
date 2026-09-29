import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';
import { generatePrintHTML } from '@/lib/agent/pdf-export';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { buildPrintDocument } from '@/lib/export/print-document';

/**
 * GET /api/articles/[id]/export
 *
 * Export a public article as print-optimized HTML — full NomosX chrome:
 * engraved lockup, mythological domain cover + artwork credit, APA block.
 * Browser downloads as .html — user can File → Print → Save as PDF.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRateLimit(
    rateLimitConfigs.api,
    async (req) => {
      try {
        const session = await getSession();
        if (!session?.id) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const { id } = await params;
        const idValidation = commonSchemas.id.safeParse({ id });
        if (!idValidation.success) {
          return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
        }

        const article = await prisma.thinkTankPublication.findFirst({
          where: publicPublicationWhere({ id: idValidation.data.id }),
          select: {
            id: true, title: true, html: true, type: true, publishedAt: true,
            sourceIds: true, trustScore: true,
            vertical: { select: { slug: true, name: true } },
          },
        });

        if (!article) {
          return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const rawHtml = (article.html || '').replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();

        const fullDocument = buildPrintDocument({
          id: article.id,
          title: article.title,
          html: rawHtml,
          type: article.type,
          publishedAt: article.publishedAt,
          sourceCount: article.sourceIds?.length,
          trustScore: article.trustScore,
          verticalSlug: article.vertical?.slug ?? null,
          domainName: article.vertical?.name ?? null,
        });

        const printHtml = generatePrintHTML(fullDocument);

        const safeFilename = `nomosx-${article.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60)}.html`;

        return new NextResponse(printHtml, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `attachment; filename="${safeFilename}"`,
            'Cache-Control': 'private, no-store',
          },
        });
      } catch (error: unknown) {
        console.error('[API/Articles/Export] Error:', error);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
      }
    }
  )(req);
}
