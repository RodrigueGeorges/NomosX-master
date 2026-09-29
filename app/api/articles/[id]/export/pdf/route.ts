import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';
import { generatePrintHTML } from '@/lib/agent/pdf-export';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { buildPrintDocument } from '@/lib/export/print-document';

/**
 * GET /api/articles/[id]/export/pdf
 *
 * Export a public article as a real PDF via Puppeteer + @sparticuz/chromium.
 * Falls back to HTML download if Chromium is not available (e.g. local dev).
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
        const safeFilename = `nomosx-${article.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60)}.pdf`;

        // Try to generate a real PDF via Puppeteer + @sparticuz/chromium
        try {
          const chromiumModule = await import('@sparticuz/chromium');
          const puppeteer = await import('puppeteer-core');

          // @sparticuz/chromium exports the Chromium class as default
          const chromium = (chromiumModule as any).default ?? chromiumModule;
          const executablePath = await chromium.executablePath();
          const browser = await puppeteer.default.launch({
            args: chromium.args,
            executablePath,
            headless: true,
          });

          const page = await browser.newPage();
          await page.setContent(printHtml, { waitUntil: 'load' });
          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: `<div style="width:100%;font-family:'Courier New',monospace;font-size:6.5pt;letter-spacing:0.14em;text-transform:uppercase;color:#999;text-align:center;">NOMOSX · nomosx.com · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
            margin: { top: '16mm', bottom: '18mm', left: '20mm', right: '20mm' },
          });
          await browser.close();

          return new NextResponse(Buffer.from(pdfBuffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${safeFilename}"`,
              'Cache-Control': 'private, no-store',
            },
          });
        } catch (pdfError) {
          // Chromium not available (local dev, or missing binary) — fall back to HTML
          console.warn('[API/Articles/Export/PDF] Chromium not available, falling back to HTML:', pdfError);
          const htmlFilename = safeFilename.replace('.pdf', '.html');
          return new NextResponse(printHtml, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Disposition': `attachment; filename="${htmlFilename}"`,
              'Cache-Control': 'private, no-store',
            },
          });
        }
      } catch (error: unknown) {
        console.error('[API/Articles/Export/PDF] Error:', error);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
      }
    }
  )(req);
}
