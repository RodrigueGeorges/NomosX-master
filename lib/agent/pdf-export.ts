/**
 * PDF EXPORT — Convert HTML briefs/reports to print-optimized HTML
 *
 * Note: Puppeteer-based PDF generation is disabled for Netlify builds.
 * Users can Ctrl+P the HTML output to save as PDF.
 *
 * The HTML includes:
 * - Professional typography
 * - Print-optimized layout
 * - Color preservation
 */

/**
 * Generate a print-optimized HTML string
 * Users can save as PDF via browser print dialog (Ctrl+P)
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
