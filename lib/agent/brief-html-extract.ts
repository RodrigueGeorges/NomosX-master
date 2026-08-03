/**
 * Extract teasers from brief HTML — legacy executive summary + Editorial V2 position-first.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[SRC-\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max = 320): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function isPositionFirstBrief(html: string): boolean {
  return (
    html.includes('Editorial V2') ||
    html.includes('Institute position') ||
    html.includes('class="verdict-block"')
  );
}

/** Pull institute verdict from position-first template. */
export function extractInstituteVerdict(html: string): string {
  const verdictBlock = html.match(
    /Institute position<\/p>\s*<div class="verdict-block">\s*([\s\S]*?)<\/div>/i
  );
  if (!verdictBlock) return '';

  const paragraphs = [...verdictBlock[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length > 30);

  return paragraphs.join(' ');
}

/** Pull collision / detected subject line from position-first header. */
export function extractDetectedSubject(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const collisionLines = [...html.matchAll(/<p class="collision-line"[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean);

  if (collisionLines.length >= 2) return collisionLines[1];
  if (collisionLines.length === 1) return collisionLines[0];
  return h1 ? stripHtml(h1[1]) : '';
}

/**
 * Best-effort summary for cards / RSS — prefers institute verdict on Editorial V2.
 */
export function extractBriefSummary(html: string): string {
  const raw = (html || '').replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (!raw) return '';

  if (isPositionFirstBrief(raw)) {
    const verdict = extractInstituteVerdict(raw);
    if (verdict.length >= 40) return truncate(verdict);
    const subject = extractDetectedSubject(raw);
    if (subject.length >= 20) return truncate(subject);
  }

  const executiveSummaryMatch = raw.match(
    /<h[1-6][^>]*>\s*(?:Executive Summary|Résumé exécutif|Summary|Synthèse)\s*<\/h[1-6]>\s*<p[^>]*>([\s\S]*?)<\/p>/i
  );
  if (executiveSummaryMatch) {
    const execSummary = stripHtml(executiveSummaryMatch[1]);
    if (execSummary.length > 50) return truncate(execSummary);
  }

  const paragraphTexts = [...raw.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length > 40 && t.length < 500)
    .slice(0, 3);

  if (paragraphTexts.length > 0) {
    return truncate(paragraphTexts.join(' '));
  }

  const plainText = stripHtml(raw);
  const sentences = plainText.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  if (sentences.length > 0) {
    return truncate(`${sentences.slice(0, 3).join('. ').trim()}.`);
  }

  return plainText.length > 300 ? truncate(plainText, 300) : plainText;
}
