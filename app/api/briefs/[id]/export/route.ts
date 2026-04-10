
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';
import { generatePrintHTML } from '@/lib/agent/pdf-export';

// Export options schema
const ExportSchema = z.object({
  format: z.enum(['pdf', 'html']).default('pdf'),
  includeSources: z.boolean().default(true),
  includeMetadata: z.boolean().default(true),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.upload,
      async (req) => {
        try {
          const { id } = await params;
          
          // Validate ID format
          const idValidation = commonSchemas.id.safeParse({ id });
          if (!idValidation.success) {
            return NextResponse.json(
              { error: 'Invalid brief ID format' },
              { status: 400 }
            );
          }

          // Parse and validate request body
          let exportOptions;
          try {
            const body = await req.json().catch(() => ({}));
            const validation = ExportSchema.safeParse(body);
            if (!validation.success) {
              return NextResponse.json(
                { 
                  error: 'Invalid export options',
                  details: validation.error.errors 
                },
                { status: 400 }
              );
            }
            exportOptions = validation.data;
          } catch (error) {
            // If body parsing fails, use defaults
            exportOptions = { format: 'pdf', includeSources: true, includeMetadata: true };
          }

          // Check user's subscription for PDF export
          const session = await getSession();
          if (!session?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const user = await prisma.user.findUnique({
            where: { email: session.email },
            include: { subscription: true },
          });

          if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
          }

          // Check if user can export PDF
          if (exportOptions.format === 'pdf' && !user.subscription?.canExportPdf) {
            return NextResponse.json(
              { error: 'PDF export requires premium subscription' },
              { status: 403 }
            );
          }

          // Fetch brief
          const brief = await prisma.brief.findUnique({
            where: { id: idValidation.data.id },
          });

          if (!brief) {
            return NextResponse.json(
              { error: 'Brief not found' },
              { status: 404 }
            );
          }

          // Handle different export formats
          if (exportOptions.format === 'html') {
            const htmlContent = generateHtmlExport(brief, exportOptions);
            return new NextResponse(htmlContent, {
              headers: {
                'Content-Type': 'text/html',
                'Content-Disposition': 'attachment; filename=nomosx-brief.html',
              },
            });
          }

          // Generate PDF using the brief's professional HTML directly
          const browser = await puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true,
          });

          try {
            const page = await browser.newPage();
            // Use the brief's stored HTML (already professional from editor-agent)
            // with print-optimized CSS injected
            const printHtml = brief.html?.includes('nomosx-brief')
              ? generatePrintHTML(brief.html) // New professional template
              : generateHtmlExport(brief, exportOptions); // Legacy fallback
            
            await page.setContent(printHtml, { waitUntil: 'networkidle0' });
            const pdf = await page.pdf({
              format: 'A4',
              printBackground: true,
              displayHeaderFooter: true,
              headerTemplate: `<div style="font-size:9px;color:#999;width:100%;text-align:center;padding:0 20mm;">
                <span style="font-weight:600;">NomosX</span> — ${brief.question?.slice(0, 60) || 'Research Brief'}
              </div>`,
              footerTemplate: `<div style="font-size:9px;color:#999;width:100%;display:flex;justify-content:space-between;padding:0 20mm;">
                <span>Every claim sourced. Every source verified.</span>
                <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
              </div>`,
              margin: {
                top: '25mm',
                bottom: '25mm',
                left: '20mm',
                right: '20mm',
              },
            });

            return new NextResponse(Buffer.from(pdf as any), {
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename=nomosx-brief.pdf',
              },
            });
          } finally {
            await browser.close();
          }
        } catch (error: any) {
          console.error('[API /briefs/[id]/export POST] Error:', error);
          
          // Handle specific Puppeteer errors
          if (error.message?.includes('Failed to launch browser')) {
            return NextResponse.json(
              { error: 'PDF generation service temporarily unavailable' },
              { status: 503 }
            );
          }
          
          if (error.message?.includes('Navigation timeout')) {
            return NextResponse.json(
              { error: 'Brief too large for PDF generation' },
              { status: 413 }
            );
          }

          return NextResponse.json(
            { error: 'Failed to export brief' },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}

function generateHtmlExport(brief: any, options: any): string {
  let content = `
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>NomosX Brief - ${brief.question}</title>
        <style>
          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            padding: 28px; 
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
          }
          h1 { 
            font-size: 24px; 
            margin: 0 0 10px; 
            color: #1a1a1a;
            font-weight: 700;
          }
          h2 { 
            font-size: 14px; 
            margin: 18px 0 6px; 
            text-transform: uppercase; 
            letter-spacing: 0.08em;
            color: #666;
            font-weight: 600;
          }
          p, li { 
            font-size: 12px; 
            line-height: 1.55; 
          }
          .brand { 
            font-size: 10px; 
            color: #666; 
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .metadata {
            background: #f8f9fa;
            padding: 16px;
            border-radius: 8px;
            margin: 20px 0;
            font-size: 11px;
          }
          .sources {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
          }
          .source-item {
            margin-bottom: 8px;
            font-size: 10px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="brand">NomosX — The agentic think tank</div>
  `;

  if (options.includeMetadata) {
    content += `
        <div class="metadata">
          <strong>Question:</strong> ${brief.question}<br>
          <strong>Type:</strong> ${brief.kind}<br>
          <strong>Created:</strong> ${new Date(brief.createdAt).toLocaleDateString()}<br>
          <strong>ID:</strong> ${brief.publicId || brief.id}
        </div>
    `;
  }

  content += `        ${brief.html}`;

  if (options.includeSources && brief.sources && brief.sources.length > 0) {
    content += `
        <div class="sources">
          <h2>Sources</h2>
          <div class="source-item">
            ${brief.sources.map((sourceId: string, index: number) => 
              `[${index + 1}] Source ID: ${sourceId}`
            ).join('<br>')}
          </div>
        </div>
    `;
  }

  content += `
      </body>
    </html>
  `;

  return content;
}
