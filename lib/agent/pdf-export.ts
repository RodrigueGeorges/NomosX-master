/**
 * PDF EXPORT — Convert HTML briefs/reports to publication-grade PDFs
 * 
 * Strategy:
 * 1. Primary: Puppeteer (headless Chrome) — best quality, needs chromium
 * 2. Fallback: Return HTML with print-optimized CSS (user can Ctrl+P)
 * 
 * The PDF includes:
 * - Cover page with title, date, source count
 * - Table of contents (strategic reports only)
 * - Professional typography
 * - Page numbers
 * - NomosX branding in footer
 */

let puppeteerAvailable: boolean | null = null;

/**
 * Generate PDF buffer from HTML content
 * Returns null if Puppeteer is not available (graceful degradation)
 */
export async function generatePDF(
  html: string,
  options: {
    format?: 'brief' | 'strategic';
    title?: string;
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
  } = {}
): Promise<Buffer | null> {
  // Lazy-check Puppeteer availability
  if (puppeteerAvailable === null) {
    try {
      // @ts-ignore — puppeteer is optional, may not be installed
      await import('puppeteer');
      puppeteerAvailable = true;
    } catch {
      try {
        // @ts-ignore — puppeteer-core is optional, may not be installed
        await import('puppeteer-core');
        puppeteerAvailable = true;
      } catch {
        puppeteerAvailable = false;
        console.warn('[PDF] Puppeteer not available — PDF export disabled. Install: npm i puppeteer');
      }
    }
  }

  if (!puppeteerAvailable) return null;

  try {
    // Dynamic import to avoid build errors when not installed
    let puppeteer: any;
    try {
      // @ts-ignore
      puppeteer = await import('puppeteer');
    } catch {
      // @ts-ignore
      puppeteer = await import('puppeteer-core');
    }

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();

    // Inject print-optimized overrides
    const printCSS = `
      <style>
        @media print {
          body { background: white !important; color: black !important; }
          article.nomosx-brief { max-width: 100% !important; padding: 0 !important; }
          .debate-grid { grid-template-columns: 1fr !important; }
          .key-findings-card { background: #F8FAFC !important; border-color: #E2E8F0 !important; }
          .brief-section h2 { border-color: #1E293B !important; }
          .apa-ref { color: #374151 !important; }
          sup.cite a { color: #1D4ED8 !important; }
          a { color: #1D4ED8 !important; }
        }

        @page {
          size: A4;
          margin: ${options.margin?.top || '25mm'} ${options.margin?.right || '20mm'} ${options.margin?.bottom || '25mm'} ${options.margin?.left || '20mm'};
        }

        @page:first { margin-top: 40mm; }
      </style>`;

    // Add print CSS before closing </head>
    const fullHtml = html.replace('</head>', `${printCSS}</head>`);

    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:9px;color:#94A3B8;width:100%;text-align:center;padding:0 20mm;">
        <span style="font-weight:600;">NomosX</span> — ${options.title ? options.title.slice(0, 60) : 'Research Brief'}
      </div>`,
      footerTemplate: `<div style="font-size:9px;color:#94A3B8;width:100%;display:flex;justify-content:space-between;padding:0 20mm;">
        <span>Every claim sourced. Every source verified.</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
      margin: {
        top: options.margin?.top || '25mm',
        bottom: options.margin?.bottom || '25mm',
        left: options.margin?.left || '20mm',
        right: options.margin?.right || '20mm',
      },
    });

    await browser.close();

    console.log(`[PDF] Generated ${(pdfBuffer.length / 1024).toFixed(0)}KB PDF for "${options.title?.slice(0, 40) || 'brief'}"`);
    return Buffer.from(pdfBuffer);
  } catch (err: any) {
    console.error(`[PDF] Generation failed: ${err.message}`);
    return null;
  }
}

/**
 * Generate a print-optimized HTML string (fallback when Puppeteer unavailable)
 * Users can save as PDF via browser print dialog
 */
export function generatePrintHTML(html: string): string {
  const printOverrides = `
    <style>
      @media print {
        body { background: white !important; color: black !important; font-size: 11pt !important; }
        article.nomosx-brief { max-width: 100% !important; padding: 16px !important; }
        h1 { font-size: 18pt !important; }
        h2 { font-size: 14pt !important; }
        .debate-grid { grid-template-columns: 1fr !important; }
        .key-findings-card, .debate-pro, .debate-con, .debate-synthesis, .scenario-card {
          background: #F8FAFC !important;
          border-color: #CBD5E1 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        sup.cite a { color: #1D4ED8 !important; text-decoration: none !important; }
        .apa-ref a { color: #1D4ED8 !important; }
        .brief-footer { page-break-before: auto; }
      }
      @page { size: A4; margin: 20mm; }
    </style>`;

  return html.replace('</head>', `${printOverrides}</head>`);
}
