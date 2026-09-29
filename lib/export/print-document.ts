/**
 * Shared print-document builder for article exports (HTML download, PDF).
 *
 * Applies the NomosX editorial DA to a publication body: engraved-lockup
 * header, mythological domain cover with artwork credit, format/domain
 * meta line, APA citation block, print stylesheet. Same chrome as the
 * inquiry page, flattened into one standalone HTML document.
 */

import { getPublicationFormat } from "@/lib/publication-formats";
import { inlineLockupSvg } from "@/lib/brand/logo-inline";
import { domainFigureUrl, domainCoverCredit } from "@/lib/brand/domain-figures";
import { extractTopics } from "@/lib/queries/public-inquiry";
import { inquiryUrl } from "@/lib/public-urls";

const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://nomosx.com";

export interface PrintDocumentInput {
  id: string;
  title: string;
  html: string;
  type: string;
  publishedAt?: Date | null;
  sourceCount?: number;
  trustScore?: number | null;
  verticalSlug?: string | null;
  domainName?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildPrintDocument(input: PrintDocumentInput): string {
  const format = getPublicationFormat(input.type);
  const title = escapeHtml(input.title);
  const publishedDate = input.publishedAt
    ? new Date(input.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const year = input.publishedAt ? new Date(input.publishedAt).getFullYear() : new Date().getFullYear();

  // Resolve the mythological cover — vertical/domain first, topic hints as fallback
  const topics = extractTopics(input.title);
  const coverRel =
    domainFigureUrl(input.verticalSlug ?? input.domainName) ??
    topics.map((t) => domainFigureUrl(t)).find(Boolean);
  const coverMeta =
    domainCoverCredit(input.verticalSlug ?? input.domainName) ??
    topics.map((t) => domainCoverCredit(t)).find(Boolean);

  const apaCitation = `NomosX Research Desk. (${year}). ${title}. NomosX. ${inquiryUrl(input.id, true)}`;

  const coverFigure = coverRel
    ? `<figure class="export-cover">
    <img src="${SITE}${coverRel}" alt="${coverMeta ? escapeHtml(`${coverMeta.title} — ${coverMeta.credit}`) : "NomosX cover artwork"}" />
    ${coverMeta ? `<figcaption>${escapeHtml(coverMeta.title)} — ${escapeHtml(coverMeta.credit)}</figcaption>` : ""}
  </figure>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — NomosX</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.7; color: #1a1a2e; max-width: 720px; margin: 0 auto; padding: 40px; background: #FAF8F4; }

    /* ── Cover page — report-style title page, page-breaks before body ── */
    .cover-page { min-height: 92vh; display: flex; flex-direction: column; page-break-after: always; }
    .cover-page .brand { display: flex; align-items: center; color: #000; margin-bottom: 64px; }
    .cover-page .format-line { font-family: 'Courier New', monospace; font-size: 8.5pt; letter-spacing: 0.22em; text-transform: uppercase; color: #000; border: 1px solid #000; display: inline-block; align-self: flex-start; padding: 5px 12px; margin-bottom: 28px; }
    .cover-page h1 { font-size: 26pt; line-height: 1.18; margin: 0 0 18px; letter-spacing: -0.01em; }
    .cover-page .cover-domain { font-family: 'Courier New', monospace; font-size: 9pt; letter-spacing: 0.16em; text-transform: uppercase; color: #666; margin-bottom: 36px; }
    .cover-page .export-cover { margin: 0 0 12px; }
    .cover-page .export-cover img { width: 100%; height: auto; display: block; }
    .cover-page .export-cover figcaption { font-family: 'Courier New', monospace; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: #777; margin-top: 8px; }
    .cover-page .cover-meta { margin-top: auto; padding-top: 28px; border-top: 1px solid #d8d2c4; font-family: 'Courier New', monospace; font-size: 8pt; letter-spacing: 0.1em; text-transform: uppercase; color: #555; }
    .cover-page .cover-meta span + span::before { content: ' · '; }

    /* ── Body ── */
    h2 { font-family: Arial, sans-serif; font-size: 14pt; border-bottom: 1px solid #d8d2c4; padding-bottom: 4px; margin-top: 28px; page-break-after: avoid; }
    h3 { font-family: Arial, sans-serif; font-size: 12pt; margin-top: 20px; page-break-after: avoid; }
    section { page-break-inside: avoid; }
    article section { page-break-inside: auto; }
    figure, blockquote, table { page-break-inside: avoid; }
    a.citation-ref { color: #4f46e5; font-size: 0.78em; vertical-align: super; text-decoration: none; }
    .key-findings-card, .debate-pro, .debate-con, .debate-synthesis, .scenario-card { background: #f4f1ea; border: 1px solid #d8d2c4; border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; }
    .export-cite { margin-top: 36px; padding: 14px 16px; border: 1px solid #d8d2c4; background: #f4f1ea; page-break-inside: avoid; }
    .export-cite .cite-label { font-family: 'Courier New', monospace; font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase; color: #555; margin: 0 0 6px; }
    .export-cite .cite-text { font-family: 'Courier New', monospace; font-size: 8pt; color: #333; margin: 0; }
    .export-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #d8d2c4; font-family: 'Courier New', monospace; font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="brand">${inlineLockupSvg(14, { mono: true })}</div>
    <div class="format-line">${format.label}</div>
    <h1>${title}</h1>
    ${input.domainName && input.domainName !== "general" ? `<div class="cover-domain">${escapeHtml(input.domainName)}</div>` : ""}
    ${coverFigure}
    <div class="cover-meta">
      <span>NomosX Research Desk</span>${publishedDate ? `<span>${publishedDate}</span>` : ""}${input.sourceCount ? `<span>${input.sourceCount} sources</span>` : ""}${input.trustScore != null ? `<span>Trust ${input.trustScore}</span>` : ""}
    </div>
  </div>

  <article class="nomosx-brief">${input.html}</article>
  <div class="export-cite">
    <p class="cite-label">Cite this publication</p>
    <p class="cite-text">${apaCitation}</p>
  </div>
  <div class="export-footer">NomosX — From Chaos to Nomos · nomosx.com</div>
</body>
</html>`;
}
