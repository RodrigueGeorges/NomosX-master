/**
 * EDITOR AGENT — Publication-Grade HTML Rendering
 * 
 * Produces think-tank quality HTML publications with:
 * - Branded header with metadata bar (date, sources, trust score, reading time)
 * - Executive summary card with key findings
 * - Professional typography and spacing
 * - APA 7th edition citations with DOI links
 * - Source distribution visualization
 * - Responsive design for print and screen
 * - [SRC-N] → clickable superscript references
 * 
 * Output quality benchmark: McKinsey Quarterly, Brookings Policy Brief, RAND Research Report
 */

import { formatAPA, renderAPAHtml } from './pipeline-types';
import { computeEvidenceTiers, summarizeEvidenceTiers, type EvidenceTiers } from './evidence-tiering';

// ============================================================================
// HTML ESCAPING
// ============================================================================

function esc(s: string): string {
  return String(s || "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] as string));
}

// ============================================================================
// CITATION DEDUPLICATION — shared helper
// ============================================================================

/**
 * Deduplicate and normalize [SRC-N] citation tags produced by the LLM.
 *
 * Fixes three common LLM artifacts:
 *  1. Doubled prefix:  [SRC-SRC-2] → [SRC-2]
 *  2. Adjacent identical citations (with optional whitespace between):
 *     [SRC-13][SRC-13] → [SRC-13]  (renders as "1313" otherwise)
 *  3. Repeated citations within the same sentence: keep only the first
 *     occurrence of each [SRC-N] per sentence.
 *
 * Exported so other renderers (strategic-report-renderer, pipeline-v2) can reuse it.
 */
export function dedupeCitations(text: string): string {
  if (!text) return text;
  let result = text;
  // 1. Fix doubled prefix: [SRC-SRC-N] → [SRC-N]
  result = result.replace(/\[SRC-SRC-(\d+)\]/g, '[SRC-$1]');
  // 2. Collapse adjacent identical citations (allow whitespace between them).
  //    Loop so triples like [SRC-1][SRC-1][SRC-1] fully collapse.
  let prev: string;
  do {
    prev = result;
    result = result.replace(/\[SRC-(\d+)\]\s*\[SRC-\1\]/g, '[SRC-$1]');
  } while (result !== prev);
  // 3. Within a single sentence, keep only the first occurrence of each [SRC-N].
  result = result.replace(/[^.!?]*[.!?]|[^.!?]+$/g, (sentence) => {
    const seen = new Set<string>();
    return sentence.replace(/\[SRC-(\d+)\]/g, (m, n) => {
      if (seen.has(n)) return '';
      seen.add(n);
      return m;
    });
  });
  return result;
}

// ============================================================================
// CITATION REPLACEMENT — [SRC-N] → clickable superscript
// ============================================================================

function replaceCitations(text: string): string {
  // Normalize LLM citation variants to [SRC-N] format:
  // "(SRC-2, SRC-8)" → "[SRC-2][SRC-8]", "SRC-3" → "[SRC-3]"
  let normalized = text
    .replace(/\(SRC-(\d+)(?:\s*,\s*SRC-(\d+))*\)/g, (match, ...nums) => {
      const refs = match.match(/SRC-(\d+)/g) || [];
      return refs.map(r => `[${r}]`).join('');
    })
    .replace(/(?<!\[)SRC-(\d+)(?!\])/g, '[SRC-$1]');
  // Deduplicate before rendering so [SRC-13][SRC-13] doesn't render as "1313".
  normalized = dedupeCitations(normalized);
  return normalized.replace(/\[SRC-(\d+)\]/g, (_, n) =>
    `<sup class="cite"><a href="#ref-${n}" title="Source ${n}">${n}</a></sup>`
  );
}

// ============================================================================
// PARAGRAPH RENDERING — double newline → <p>, single newline → <br>
// ============================================================================

function renderParagraphs(text: string): string {
  if (!text) return "";
  return String(text)
    .split(/\n\n+/)
    .filter(Boolean)
    .map(p => `<p>${replaceCitations(esc(p).replace(/\n/g, '<br>'))}</p>`)
    .join("\n");
}

// ============================================================================
// SECTION RENDERERS
// ============================================================================

/**
 * Extract the governing thought (first key sentence) from section content.
 * McKinsey principle: every section opens with its key message.
 */
function extractGoverningThought(content: string): string {
  if (!content || typeof content !== 'string') return '';
  // Take the first sentence that contains a citation or is substantive (>40 chars)
  const sentences = content.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 40);
  return sentences[0]?.slice(0, 200) || '';
}

function section(heading: string, content: any): string {
  if (!content) return "";
  return `
    <section class="brief-section">
      <h2>${esc(heading)}</h2>
      ${renderParagraphs(String(content))}
    </section>`;
}

function debateSection(debate: any): string {
  if (!debate) return "";

  // Support both brief (pro/con) and strategic (position1/position2) debate structures
  const proLabel = debate.position1?.label || "Arguments For";
  const conLabel = debate.position2?.label || "Arguments Against";
  const proContent = debate.position1?.arguments
    ? (Array.isArray(debate.position1.arguments) ? debate.position1.arguments.join('\n\n') : String(debate.position1.arguments))
    : (debate.pro || "");
  const conContent = debate.position2?.arguments
    ? (Array.isArray(debate.position2.arguments) ? debate.position2.arguments.join('\n\n') : String(debate.position2.arguments))
    : (debate.con || "");
  const synthesis = debate.synthesis || "";
  const nuances = debate.nuances || "";

  return `
    <section class="brief-section debate-section">
      <h2>Debate</h2>
      <div class="debate-grid">
        <div class="debate-pro">
          <h3>${esc(proLabel)}</h3>
          ${renderParagraphs(proContent)}
          ${debate.position1?.evidence ? `<p class="evidence-tag"><em>Evidence: ${esc(debate.position1.evidence)}</em></p>` : ""}
        </div>
        <div class="debate-con">
          <h3>${esc(conLabel)}</h3>
          ${renderParagraphs(conContent)}
          ${debate.position2?.evidence ? `<p class="evidence-tag"><em>Evidence: ${esc(debate.position2.evidence)}</em></p>` : ""}
        </div>
      </div>
      <div class="debate-synthesis">
        <h3>Synthesis</h3>
        ${renderParagraphs(synthesis)}
        ${nuances ? `<p class="debate-nuances"><em>${replaceCitations(esc(nuances))}</em></p>` : ""}
      </div>
    </section>`;
}

// ============================================================================
// KEY FINDINGS CARD
// ============================================================================

function keyFindingsCard(analysis: any): string {
  // Extract key findings from summary (first 3 sentences with citations)
  const summary = String(analysis.summary || "");
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(s => s.length > 20).slice(0, 4);
  if (sentences.length === 0) return "";

  return `
    <div class="key-findings-card">
      <h3>Key Findings</h3>
      <ul>
        ${sentences.map(s => `<li>${replaceCitations(esc(s))}</li>`).join("\n")}
      </ul>
    </div>`;
}

// ============================================================================
// SOURCE DISTRIBUTION SVG
// ============================================================================

function sourceDistributionSVG(sources: any[]): string {
  const providerCounts: Record<string, number> = {};
  sources.forEach(s => {
    const p = s.provider || "unknown";
    providerCounts[p] = (providerCounts[p] || 0) + 1;
  });

  const entries = Object.entries(providerCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "";

  const maxCount = Math.max(...entries.map(e => e[1]));
  const barWidth = 200;
  const barHeight = 18;
  const gap = 4;
  const labelWidth = 120;
  const svgHeight = entries.length * (barHeight + gap) + 10;

  const colors = ["#ffffff", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

  const bars = entries.map(([provider, count], i) => {
    const width = Math.max(8, (count / maxCount) * barWidth);
    const y = i * (barHeight + gap) + 5;
    const color = colors[i % colors.length];
    return `
      <text x="${labelWidth - 8}" y="${y + 13}" text-anchor="end" fill="#94A3B8" font-size="11" font-family="system-ui">${esc(provider)}</text>
      <rect x="${labelWidth}" y="${y}" width="${width}" height="${barHeight}" rx="3" fill="${color}" opacity="0.85"/>
      <text x="${labelWidth + width + 6}" y="${y + 13}" fill="#CBD5E1" font-size="11" font-family="system-ui">${count}</text>`;
  }).join("");

  return `<svg width="${labelWidth + barWidth + 50}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

// ============================================================================
// METADATA BAR
// ============================================================================

function metadataBar(sources: any[], wordCount: number): string {
  const providers = [...new Set(sources.map(s => s.provider))];
  const years = sources.map(s => s.year).filter(Boolean);
  const minYear = years.length > 0 ? Math.min(...years) : null;
  const maxYear = years.length > 0 ? Math.max(...years) : null;
  const readingTime = Math.max(1, Math.round(wordCount / 250));
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <div class="metadata-bar">
      <span class="meta-item"><strong>${dateStr}</strong></span>
      <span class="meta-sep">·</span>
      <span class="meta-item">${sources.length} sources</span>
      <span class="meta-sep">·</span>
      <span class="meta-item">${providers.length} providers</span>
      ${minYear && maxYear ? `<span class="meta-sep">·</span><span class="meta-item">${minYear}–${maxYear}</span>` : ""}
      <span class="meta-sep">·</span>
      <span class="meta-item">${readingTime} min read</span>
    </div>`;
}

// ============================================================================
// BRAND HEADER — NomosX logo + tagline
// ============================================================================

const BRAND_HEADER = `<div class="nx-brand-header">
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 32 32" fill="none" aria-label="NomosX" role="img" style="flex-shrink:0;">
    <line x1="7" y1="7" x2="25" y2="25" stroke="#f0f0fa" stroke-width="2.6" stroke-linecap="round"/>
    <line x1="25" y1="7" x2="7" y2="25" stroke="#f0f0fa" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="2.6" fill="#f0f0fa" stroke="none"/>
  </svg>
  <span class="nx-brand-mark">NOMOS<span class="x-glyph">X</span></span>
  <span class="nx-brand-tag">From Chaos to Nomos</span>
</div>`;

// ============================================================================
// CSS STYLESHEET
// ============================================================================

const BRIEF_CSS = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --nx-bg: #000000;
    --nx-bg-elevated: #0a0a0a;
    --nx-bg-panel: #111111;
    --nx-text-hero: #f0f0fa;
    --nx-text-primary: #f0f0fa;
    --nx-text-secondary: rgba(240, 240, 250, 0.62);
    --nx-text-tertiary: rgba(240, 240, 250, 0.35);
    --nx-text-quaternary: rgba(240, 240, 250, 0.25);
    --nx-border-subtle: rgba(240, 240, 250, 0.08);
    --nx-border-medium: rgba(240, 240, 250, 0.14);
    --nx-border-cta: rgba(240, 240, 250, 0.35);
    --nx-read-color: rgba(240, 240, 250, 0.78);
    --nx-radius: 4px;
    --font-sans: 'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-display: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--nx-bg);
    color: var(--nx-text-primary);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  article.nomosx-brief {
    max-width: 42rem;
    margin: 0 auto;
    padding: 3rem 2rem 5rem;
    font-family: var(--font-sans);
    color: var(--nx-read-color);
    font-size: 1.0625rem;
    line-height: 1.75;
    background: var(--nx-bg);
    position: relative;
  }

  /* NomosX grid background */
  article.nomosx-brief::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(240, 240, 250, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(240, 240, 250, 0.025) 1px, transparent 1px);
    background-size: 72px 72px;
    -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 70%);
    mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 70%);
    z-index: 0;
  }

  article.nomosx-brief > * { position: relative; z-index: 1; }

  /* Brand header */
  .nx-brand-header {
    display: flex;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-bottom: 3rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--nx-border-subtle);
  }
  .nx-brand-mark {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--nx-text-hero);
    letter-spacing: -0.01em;
    text-transform: uppercase;
  }
  .nx-brand-mark .x-glyph { color: var(--nx-text-hero); }
  .nx-brand-tag {
    font-family: var(--font-mono);
    font-size: 0.5625rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--nx-text-tertiary);
  }

  h1 {
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 700;
    line-height: 0.92;
    letter-spacing: -0.01em;
    text-transform: uppercase;
    color: var(--nx-text-hero);
    margin-bottom: 1rem;
  }

  .brief-meta {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--nx-text-tertiary);
    margin-bottom: 3rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--nx-border-subtle);
    letter-spacing: 0.04em;
  }

  .brief-section {
    margin: 2.5rem 0;
  }

  .brief-section h2 {
    font-family: var(--font-sans);
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--nx-text-primary);
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--nx-border-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .brief-section h3 {
    font-family: var(--font-sans);
    font-size: 1rem;
    font-weight: 600;
    color: var(--nx-text-secondary);
    margin: 1.5rem 0 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .brief-section p {
    margin-bottom: 1.25rem;
    color: var(--nx-read-color);
  }

  .brief-section strong {
    color: var(--nx-text-primary);
    font-weight: 600;
  }

  .brief-section a {
    color: var(--nx-text-primary);
    text-decoration: none;
    border-bottom: 1px solid var(--nx-border-medium);
  }

  .prose-block { margin: 1.5rem 0; }
  .prose-block p { margin-bottom: 1.25rem; }

  .through-line {
    font-size: 1.1em;
    font-weight: 500;
    color: var(--nx-text-secondary);
    margin: 1.5em 0;
    padding-left: 1rem;
    border-left: 2px solid var(--nx-border-medium);
  }

  .debate-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    margin: 1.5rem 0;
  }

  .debate-pro, .debate-con {
    background: rgba(240, 240, 250, 0.02);
    border: 1px solid var(--nx-border-subtle);
    border-radius: var(--nx-radius);
    padding: 1.25rem;
  }

  .debate-pro { border-top: 2px solid var(--nx-text-secondary); }
  .debate-con { border-top: 2px solid var(--nx-text-quaternary); }

  .debate-pro h3, .debate-con h3 {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--nx-text-tertiary);
    margin-bottom: 0.75rem;
  }

  .debate-synthesis {
    background: rgba(240, 240, 250, 0.02);
    border: 1px solid var(--nx-border-subtle);
    border-top: 2px solid var(--nx-text-primary);
    border-radius: var(--nx-radius);
    padding: 1.25rem;
    margin-top: 1rem;
  }

  .debate-synthesis h3 {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--nx-text-secondary);
    margin-bottom: 0.75rem;
  }

  .key-findings-card {
    background: rgba(240, 240, 250, 0.015);
    border: 1px solid var(--nx-border-subtle);
    border-left: 2px solid var(--nx-text-primary);
    border-radius: var(--nx-radius);
    padding: 1.25rem 1.5rem;
    margin: 1.75rem 0;
  }
  .key-findings-card h3 {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--nx-text-tertiary);
    margin-bottom: 0.75rem;
  }
  .key-findings-card ul { padding-left: 1.25rem; }
  .key-findings-card li { margin-bottom: 0.5rem; color: var(--nx-read-color); }

  sup.cite a, sup.citation {
    color: var(--nx-text-secondary);
    text-decoration: none;
    font-size: 0.75em;
    font-weight: 600;
    font-family: var(--font-mono);
    padding: 0 1px;
    vertical-align: super;
  }

  sup.cite a:hover { color: var(--nx-text-primary); }

  .references-section {
    margin-top: 4rem;
    padding-top: 2rem;
    border-top: 1px solid var(--nx-border-subtle);
  }

  .references-section h2 {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--nx-text-tertiary);
    margin-bottom: 1.25rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--nx-border-subtle);
  }

  .apa-ref {
    display: block;
    padding: 0.5rem 0 0.5rem 2rem;
    text-indent: -2rem;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--nx-text-secondary);
    border-bottom: 1px solid var(--nx-border-subtle);
  }

  .apa-ref:last-child { border-bottom: none; }

  .ref-num {
    font-family: var(--font-mono);
    font-weight: 500;
    color: var(--nx-text-tertiary);
    min-width: 1.75rem;
    display: inline-block;
  }

  .apa-ref em { color: var(--nx-text-primary); }

  /* Hero image */
  .hero-image {
    margin: 0 0 2rem 0;
    width: 100%;
    overflow: hidden;
    border: 1px solid var(--nx-border-subtle);
    border-radius: var(--nx-radius);
  }
  .hero-image img {
    width: 100%;
    height: auto;
    display: block;
    object-fit: cover;
  }

  @media print {
    article.nomosx-brief { padding: 1.5rem; max-width: 100%; }
    .debate-grid { grid-template-columns: 1fr; }
    article.nomosx-brief::before { display: none; }
  }

  @media (max-width: 640px) {
    article.nomosx-brief { padding: 1.5rem 1rem; }
    h1 { font-size: 1.5rem; }
    .debate-grid { grid-template-columns: 1fr; }
  }
</style>`;

// ============================================================================
// MAIN RENDER: BRIEF HTML
// ============================================================================

export function renderProfessionalBriefHTML(analysis: any, sources: any[]): string {
  // Format APA citations
  const apaCitations = sources.map((s, i) => formatAPA(s, i + 1));

  // Check if this is the new ProspectiveNote schema
  const isProspective = Array.isArray(analysis.causalChain) && analysis.causalChain.length > 0;

  if (isProspective) {
    // ── New schema: prose-continuous, verdict-first ──
    const verdictText = String(analysis.verdict || '');
    const throughLine = String(analysis.throughLine || '');
    const anchoringBasis = String(analysis.anchoringBasis || '');
    const chain = (analysis.causalChain || []) as any[];
    const chainProse = chain.map((link: any) => {
      const claim = String(link.claim || '');
      const evidence = String(link.evidence || '');
      const warrant = String(link.warrant || '');
      const parts = [claim];
      if (evidence && evidence !== claim) parts.push(evidence);
      if (warrant) parts.push(`The mechanism: ${warrant}`);
      return parts.join(' ');
    }).join(' ');

    const trajectory = analysis.trajectory as any;
    const trajectoryProse = trajectory
      ? [trajectory.state, trajectory.assumptions].filter(Boolean).map(String).join(' ')
      : '';

    const rejectedAlts = (analysis.rejectedAlternatives as any[]) || [];
    const rejectedProse = rejectedAlts.length > 0
      ? rejectedAlts.map((ra: any) => [ra.scenario, ra.whyRejected, ra.residualRisk].filter(Boolean).join(' — ')).join(' ')
      : '';

    const whatToWatch = analysis.whatToWatch as any;
    const watchProse = whatToWatch
      ? [Array.isArray(whatToWatch.signals) ? whatToWatch.signals.join(' ') : '', String(whatToWatch.whatWouldChangeMind || ''), String(whatToWatch.horizonCheck || '')].filter(Boolean).join(' ')
      : '';

    const evidenceAssessment = analysis.evidenceAssessment as any;
    const evidenceProse = evidenceAssessment
      ? [Array.isArray(evidenceAssessment.strongestLinks) ? evidenceAssessment.strongestLinks.join(' ') : '', String(evidenceAssessment.weakestLink || ''), Array.isArray(evidenceAssessment.gaps) ? evidenceAssessment.gaps.join(' ') : '', String(evidenceAssessment.sourceDiversity || '')].filter(Boolean).join(' ')
      : '';

    const keyFindings = (analysis.keyFindings as string[]) || [];
    const keyFindingsProse = keyFindings.length > 0 ? keyFindings.join(' ') : '';

    const allText = [verdictText, throughLine, anchoringBasis, chainProse, trajectoryProse, rejectedProse, watchProse, evidenceProse, keyFindingsProse].filter(Boolean).join(' ');
    const wordCount = allText.split(/\s+/).length;

    const proseHtml = [
      verdictText ? `<div class="prose-block">${renderParagraphs(replaceCitations(verdictText))}</div>` : '',
      throughLine ? `<p class="through-line" style="font-size:1.1em;font-weight:500;opacity:0.8;margin:1.5em 0">${replaceCitations(esc(throughLine))}</p>` : '',
      anchoringBasis ? `<div class="prose-block">${renderParagraphs(replaceCitations(anchoringBasis))}</div>` : '',
      chainProse ? `<div class="prose-block">${renderParagraphs(replaceCitations(chainProse))}</div>` : '',
      trajectoryProse ? `<div class="prose-block">${renderParagraphs(replaceCitations(trajectoryProse))}</div>` : '',
      rejectedProse ? `<div class="prose-block">${renderParagraphs(replaceCitations(rejectedProse))}</div>` : '',
      watchProse ? `<div class="prose-block">${renderParagraphs(replaceCitations(watchProse))}</div>` : '',
      evidenceProse ? `<div class="prose-block">${renderParagraphs(replaceCitations(evidenceProse))}</div>` : '',
      keyFindingsProse ? `<div class="prose-block">${renderParagraphs(replaceCitations(keyFindingsProse))}</div>` : '',
    ].filter(Boolean).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(analysis.title || "NomosX Brief")}</title>
  ${BRIEF_CSS}
</head>
<body>
  <article class="nomosx-brief">
    ${BRAND_HEADER}
    <h1>${esc((analysis.title || "Brief").replace(/\[SRC-\d+\]/g, '').replace(/\[E\d+\]/g, '').trim())}</h1>
    <div class="brief-meta">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ${sources.length} sources</div>

    ${proseHtml}

    <section class="references-section">
      <h2>Sources</h2>
      ${apaCitations.map(c => renderAPAHtml(c)).join("\n")}
    </section>
  </article>
</body>
</html>`;
  }

  // ── Legacy schema fallback ──
  const allText = [
    analysis.summary, analysis.consensus, analysis.disagreements,
    analysis.debate?.pro, analysis.debate?.con, analysis.debate?.synthesis,
    analysis.evidence, analysis.implications, analysis.risks,
    analysis.open_questions, analysis.what_changes_mind,
  ].filter(Boolean).join(" ");
  const wordCount = allText.split(/\s+/).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(analysis.title || "NomosX Brief")}</title>
  ${BRIEF_CSS}
</head>
<body>
  <article class="nomosx-brief">
    ${BRAND_HEADER}
    <h1>${esc((analysis.title || "Brief").replace(/\[SRC-\d+\]/g, '').replace(/\[E\d+\]/g, '').trim())}</h1>
    <div class="brief-meta">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ${sources.length} sources</div>

    ${section("Executive Summary", analysis.summary)}
    ${section("Consensus", analysis.consensus)}
    ${section("Disagreements", analysis.disagreements)}
    ${debateSection(analysis.debate)}
    ${section("Evidence Quality", analysis.evidence)}
    ${section("Strategic Implications", analysis.implications)}
    ${section("Risks & Limitations", analysis.risks)}
    ${section("Open Questions", analysis.open_questions)}
    ${section("What Would Change Our Mind", analysis.what_changes_mind)}

    <section class="references-section">
      <h2>Sources</h2>
      ${apaCitations.map(c => renderAPAHtml(c)).join("\n")}
    </section>
  </article>
</body>
</html>`;
}

// ============================================================================
// MAIN RENDER: STRATEGIC REPORT HTML
// ============================================================================

export function renderProfessionalStrategicHTML(analysis: any, sources: any[]): string {
  // Count words from actual text content (not JSON)
  const textForCount = [
    analysis.executiveSummary, analysis.literatureOverview, analysis.theoreticalFrameworks,
    analysis.methodologicalApproaches, analysis.consensus, analysis.controversies,
    analysis.emergingTrends, analysis.conclusion, analysis.whatChangesMind,
    ...(Array.isArray(analysis.keyFindings) ? analysis.keyFindings : []),
    analysis.debate?.position1?.arguments, analysis.debate?.position2?.arguments,
    analysis.debate?.synthesis, analysis.debate?.nuances,
  ].filter(Boolean).join(' ').replace(/\[SRC-\d+\]/g, '').replace(/\s+/g, ' ').trim();
  const wordCount = textForCount ? textForCount.split(' ').filter(Boolean).length : 0;
  const apaCitations = sources.map((s, i) => formatAPA(s, i + 1));

  const strategicSections = [
    { key: 'executiveSummary', heading: 'Executive Summary' },
    { key: 'literatureOverview', heading: 'Literature Review' },
    { key: 'theoreticalFrameworks', heading: 'Theoretical Frameworks' },
    { key: 'methodologicalApproaches', heading: 'Methodological Approaches' },
    { key: 'consensus', heading: 'Consensus' },
    { key: 'controversies', heading: 'Controversies' },
    { key: 'emergingTrends', heading: 'Emerging Trends' },
  ];

  // Key findings list
  const keyFindings = Array.isArray(analysis.keyFindings) ? analysis.keyFindings : [];
  const keyFindingsHtml = keyFindings.length > 0 ? `
    <div class="key-findings-card">
      <h3>Key Findings</h3>
      <ul>
        ${keyFindings.map((f: string) => `<li>${replaceCitations(esc(f))}</li>`).join("\n")}
      </ul>
    </div>` : "";

  // Urgency + confidence badges
  const badges = [];
  if (analysis.urgencyLevel) badges.push(`<span class="badge badge-${analysis.urgencyLevel}">${esc(analysis.urgencyLevel)} urgency</span>`);
  if (analysis.confidenceLevel) badges.push(`<span class="badge badge-conf">${esc(analysis.confidenceLevel)} confidence</span>`);
  const badgeHtml = badges.length > 0 ? `<div class="badges">${badges.join(" ")}</div>` : "";

  // Normalize LLM fields that may arrive as objects instead of arrays
  const asArray = (v: any): any[] => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);

  // Themes / Thematic analysis
  const themes = asArray(analysis.themes);
  const themesHtml = themes.length > 0 ? `
    <section class="brief-section">
      <h2>Thematic Analysis</h2>
      ${themes.map((t: any) => `
        <div class="theme-entry">
          <strong>${esc(t.name || '')}</strong>
          ${t.evidence ? `<span style="font-family:var(--font-mono);font-size:0.5625rem;color:var(--nx-text-tertiary);margin-left:0.5rem;text-transform:uppercase;letter-spacing:0.1em;">${esc(t.evidence)}</span>` : ""}
          ${t.description ? `<p style="margin-top:0.5rem;font-size:0.875rem;">${replaceCitations(esc(t.description))}</p>` : ""}
        </div>`).join("")}
    </section>` : "";

  // Key studies
  const keyStudies = asArray(analysis.keyStudies);
  const keyStudiesHtml = keyStudies.length > 0 ? `
    <section class="brief-section">
      <h2>Key Studies</h2>
      ${keyStudies.map((ks: any) => `
        <div style="margin:0.625rem 0;padding:0.625rem 0.875rem;background:rgba(240,240,250,0.015);border:1px solid var(--nx-border-subtle);border-radius:var(--nx-radius);font-size:0.875rem;">
          <strong>${replaceCitations(esc(ks.citation || ''))}</strong>
          ${ks.contribution ? ` — ${esc(ks.contribution)}` : ""}
          ${ks.limitations ? `<br><em style="color:var(--nx-text-tertiary);font-size:0.8125rem;">Limitation: ${esc(ks.limitations)}</em>` : ""}
        </div>`).join("")}
    </section>` : "";

  // Stakeholder analysis
  const stakeholders = asArray(analysis.stakeholderAnalysis);
  const stakeholderHtml = stakeholders.length > 0 ? `
    <section class="brief-section">
      <h2>Stakeholder Impact</h2>
      <table class="stakeholder-table">
        <thead><tr><th>Stakeholder</th><th>Impact</th><th>Magnitude</th><th>Details</th></tr></thead>
        <tbody>
          ${stakeholders.map((s: any) => `<tr>
            <td><strong>${esc(s.stakeholder || '')}</strong></td>
            <td>${esc(s.impact || '')}</td>
            <td>${esc(String(s.magnitude || ''))}</td>
            <td>${replaceCitations(esc(s.details || ''))}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>` : "";

  // Scenarios
  const scenarios = asArray(analysis.scenarios);
  const scenarioHtml = scenarios.length > 0 ? `
    <section class="brief-section">
      <h2>Scenario Planning</h2>
      ${scenarios.map((s: any) => {
        const probLabel = s.probability ? String(s.probability) : '';
        const probValue = typeof s.probabilityValue === 'number'
          ? `${Math.round(s.probabilityValue * 100)}%`
          : (typeof s.probability === 'number' ? `${s.probability}%` : probLabel);
        return `
        <div class="scenario-card">
          <div class="scenario-header">
            <strong>${esc(s.name || '')}</strong>
            <span class="scenario-prob">${probValue}</span>
          </div>
          ${renderParagraphs(s.description || '')}
          ${s.implications ? `<div class="scenario-implications"><strong>Implications:</strong> ${replaceCitations(esc(s.implications))}</div>` : ''}
          ${s.signals ? `<div class="scenario-implications"><strong>Early warning signals:</strong> ${replaceCitations(esc(s.signals))}</div>` : ''}
        </div>`;
      }).join("")}
    </section>` : "";

  // Recommendations
  const recsRaw = analysis.recommendations || {};
  const recs = {
    immediate: asArray(recsRaw.immediate),
    shortTerm: asArray(recsRaw.shortTerm),
    longTerm: asArray(recsRaw.longTerm),
    riskMitigation: asArray(recsRaw.riskMitigation),
    costOfInaction: typeof recsRaw.costOfInaction === 'string' ? recsRaw.costOfInaction : '',
  };
  const recsHtml = (recs.immediate.length || recs.shortTerm.length || recs.longTerm.length) ? `
    <section class="brief-section">
      <h2>Recommendations</h2>
      ${recs.immediate.length ? `<h3>Immediate (0-6 months)</h3><ul>${recs.immediate.map((r: string) => `<li>${replaceCitations(esc(r))}</li>`).join("")}</ul>` : ""}
      ${recs.shortTerm.length ? `<h3>Short-Term (6-24 months)</h3><ul>${recs.shortTerm.map((r: string) => `<li>${replaceCitations(esc(r))}</li>`).join("")}</ul>` : ""}
      ${recs.longTerm.length ? `<h3>Long-Term (2-5 years)</h3><ul>${recs.longTerm.map((r: string) => `<li>${replaceCitations(esc(r))}</li>`).join("")}</ul>` : ""}
      ${recs.riskMitigation.length ? `<h3>Risk Mitigation</h3><ul>${recs.riskMitigation.map((r: string) => `<li>${replaceCitations(esc(r))}</li>`).join("")}</ul>` : ""}
      ${recs.costOfInaction ? `<div style="border-left:2px solid var(--nx-text-primary);background:rgba(240,240,250,0.02);padding:1rem 1.25rem;margin:1rem 0;border-radius:0 var(--nx-radius) var(--nx-radius) 0;"><h3 style="margin:0 0 0.5rem;">Cost of Inaction</h3><p style="margin:0;line-height:1.6;">${replaceCitations(esc(recs.costOfInaction))}</p></div>` : ""}
    </section>` : "";

  // ─── CAUSAL ARCHITECTURE ───
  // Explicit causal chains with confidence, counterfactuals, and alternative explanations
  const causalArch = asArray(analysis.causalArchitecture);
  const causalArchitectureHtml = causalArch.length > 0 ? `
    <section class="brief-section">
      <h2>Causal Architecture</h2>
      <p style="color:var(--nx-text-tertiary);font-size:0.8125rem;margin-bottom:1rem;">Each major causal claim is decomposed into its chain, confidence level, falsification condition, and alternative explanation. This is the NomosX method for causal transparency.</p>
      ${causalArch.map((c: any, idx: number) => {
        const confColor = c.confidence === 'high' ? 'var(--nx-text-primary)' : c.confidence === 'medium' ? 'var(--nx-text-secondary)' : 'var(--nx-text-tertiary)';
        const epiBadge = c.epistemicLevel ? `<span class="epistemic-badge epistemic-${c.epistemicLevel}">${esc(c.epistemicLevel)}</span>` : '';
        return `
        <div class="causal-card">
          <div class="causal-header">
            <strong>Claim ${idx + 1}:</strong> ${replaceCitations(esc(c.claim || ''))}
            ${epiBadge}
            <span class="causal-conf" style="color:${confColor};">${esc(c.confidence || '')} confidence</span>
          </div>
          ${c.chain ? `<div class="causal-chain"><strong>Causal chain:</strong> ${replaceCitations(esc(c.chain))}</div>` : ''}
          ${c.counterfactual ? `<div class="causal-counterfactual"><strong>Falsified if:</strong> ${replaceCitations(esc(c.counterfactual))}</div>` : ''}
          ${c.alternativeExplanation ? `<div class="causal-alt"><strong>Alternative explanation:</strong> ${replaceCitations(esc(c.alternativeExplanation))}</div>` : ''}
          ${c.sources?.length ? `<div class="causal-sources">${c.sources.map((s: string) => replaceCitations(esc(s))).join(' ')}</div>` : ''}
        </div>`;
      }).join("")}
    </section>` : "";

  // ─── EVIDENCE TIERS ───
  // 5-tier classification of sources (computed post-hoc, not LLM-generated)
  const evidenceTiersData: EvidenceTiers | null = analysis._evidenceTiers || null;
  let evidenceTiersHtml = "";
  if (evidenceTiersData) {
    const tierRows = [
      { label: "Tier 1 — Empirical", desc: "Controlled studies, datasets, quantitative research", items: evidenceTiersData.tier1_empirical, color: "var(--nx-text-primary)" },
      { label: "Tier 2 — Institutional", desc: "Official documents from governments, IGOs, religious institutions", items: evidenceTiersData.tier2_institutional, color: "var(--nx-text-secondary)" },
      { label: "Tier 3 — Academic", desc: "Peer-reviewed papers and systematic reviews", items: evidenceTiersData.tier3_academic, color: "var(--nx-text-secondary)" },
      { label: "Tier 4 — Policy", desc: "EU AI Act, OECD, UNESCO, ISO standards, regulatory frameworks", items: evidenceTiersData.tier4_policy, color: "var(--nx-text-tertiary)" },
      { label: "Tier 5 — Emerging", desc: "Preprints, working papers, exploratory research", items: evidenceTiersData.tier5_emerging, color: "var(--nx-text-tertiary)" },
    ].filter(t => t.items.length > 0);

    if (tierRows.length > 0) {
      evidenceTiersHtml = `
      <section class="brief-section">
        <h2>Evidence Base — Source Hierarchy</h2>
        <p style="color:var(--nx-text-tertiary);font-size:0.8125rem;margin-bottom:1rem;">Sources are classified into 5 evidence tiers, from strongest (empirical) to emerging (exploratory). This hierarchy shows what is established vs what is exploratory in the evidence base.</p>
        <table class="evidence-tier-table">
          <thead><tr><th>Tier</th><th>Description</th><th>Count</th><th>Sources</th></tr></thead>
          <tbody>
            ${tierRows.map(t => `<tr>
              <td><strong style="color:${t.color};">${esc(t.label)}</strong></td>
              <td style="font-size:0.8125rem;color:var(--nx-text-secondary);">${esc(t.desc)}</td>
              <td style="font-family:var(--font-mono);font-size:0.75rem;">${t.items.length}</td>
              <td style="font-size:0.75rem;color:var(--nx-text-tertiary);">${t.items.slice(0, 8).map((i: any) => replaceCitations(esc(i.src))).join(' ')}${t.items.length > 8 ? ` <em>+${t.items.length - 8} more</em>` : ''}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </section>`;
    }
  }

  // ─── ADVERSARIAL TRANSPARENCY ───
  // Exposes the Critic agent's objections, downgrades, and preprint penalties
  const advTrans = analysis._adversarialTransparency;
  let adversarialTransparencyHtml = "";
  if (advTrans && (advTrans.criticObjections?.length || advTrans.preprintDowngrades?.length)) {
    adversarialTransparencyHtml = `
    <section class="brief-section">
      <h2>Adversarial Transparency — Critic Audit</h2>
      <p style="color:var(--nx-text-tertiary);font-size:0.8125rem;margin-bottom:1rem;">This section exposes the objections raised by the NomosX Critic agent during validation. No other think tank exposes its internal peer review. This is our commitment to intellectual honesty.</p>
      ${advTrans.criticScore ? `<div style="margin-bottom:1rem;font-family:var(--font-mono);font-size:0.875rem;">Critic overall score: <strong>${advTrans.criticScore}/100</strong></div>` : ''}
      ${advTrans.criticObjections?.length ? `
        <h3 style="font-size:0.875rem;">Objections Raised</h3>
        <ul style="font-size:0.8125rem;">
          ${advTrans.criticObjections.map((o: any) => `<li>
            <strong>${esc(o.severity || 'medium')} severity</strong> ${o.resolved ? '<span style="color:var(--nx-text-secondary);">✓ resolved</span>' : '<span style="color:var(--nx-text-primary);">⚠ unresolved</span>'}: ${replaceCitations(esc(o.claim || ''))} — <em>${replaceCitations(esc(o.objection || ''))}</em>
          </li>`).join("")}
        </ul>` : ''}
      ${advTrans.preprintDowngrades?.length ? `
        <h3 style="font-size:0.875rem;">Preprint Downgrades</h3>
        <ul style="font-size:0.8125rem;">
          ${advTrans.preprintDowngrades.map((d: any) => `<li>
            Claim: ${replaceCitations(esc(d.claim || ''))} — Sources: ${d.sources?.map((s: string) => replaceCitations(esc(s))).join(' ') || 'N/A'} — Reason: <em>${esc(d.reason || '')}</em>
          </li>`).join("")}
        </ul>` : ''}
    </section>`;
  }

  // ─── MULTI-LENS CONVERGENCE MAP ───
  // Shows where CANA, SCATTER, and weak signals converge or diverge
  const multiLens = analysis._multiLensConvergence;
  let multiLensConvergenceHtml = "";
  if (multiLens && (multiLens.convergencePoints?.length || multiLens.divergencePoints?.length)) {
    multiLensConvergenceHtml = `
    <section class="brief-section">
      <h2>Multi-Lens Convergence Map</h2>
      <p style="color:var(--nx-text-tertiary);font-size:0.8125rem;margin-bottom:1rem;">This analysis was enriched by three complementary analytical lenses: CANA (causal mechanisms), SCATTER (divergent hypotheses), and Weak Signals (emerging evidence). Convergence across lenses indicates robustness; divergence indicates genuine uncertainty.</p>
      ${multiLens.convergencePoints?.length ? `
        <h3 style="font-size:0.875rem;color:var(--nx-text-secondary);">Convergence Points (robust findings)</h3>
        <ul style="font-size:0.8125rem;">
          ${multiLens.convergencePoints.map((p: string) => `<li>${replaceCitations(esc(p))}</li>`).join("")}
        </ul>` : ''}
      ${multiLens.divergencePoints?.length ? `
        <h3 style="font-size:0.875rem;color:var(--nx-text-primary);">Divergence Points (genuine uncertainty)</h3>
        <ul style="font-size:0.8125rem;">
          ${multiLens.divergencePoints.map((p: string) => `<li>${replaceCitations(esc(p))}</li>`).join("")}
        </ul>` : ''}
      ${multiLens.canaMechanisms?.length ? `
        <h3 style="font-size:0.8125rem;">CANA Causal Mechanisms</h3>
        <ul style="font-size:0.8125rem;color:var(--nx-text-secondary);">
          ${multiLens.canaMechanisms.map((m: string) => `<li>${replaceCitations(esc(m))}</li>`).join("")}
        </ul>` : ''}
      ${multiLens.scatterHypotheses?.length ? `
        <h3 style="font-size:0.8125rem;">SCATTER Divergent Hypotheses</h3>
        <ul style="font-size:0.8125rem;color:var(--nx-text-secondary);">
          ${multiLens.scatterHypotheses.map((h: string) => `<li>${replaceCitations(esc(h))}</li>`).join("")}
        </ul>` : ''}
      ${multiLens.weakSignals?.length ? `
        <h3 style="font-size:0.8125rem;">Weak Signals Detected</h3>
        <ul style="font-size:0.8125rem;color:var(--nx-text-tertiary);">
          ${multiLens.weakSignals.map((s: string) => `<li>${replaceCitations(esc(s))}</li>`).join("")}
        </ul>` : ''}
    </section>`;
  }

  const STRATEGIC_EXTRA_CSS = `
  <style>
    .badges { margin: 0.75rem 0 2rem; display: flex; gap: 0.5rem; }
    .badge {
      display: inline-block; padding: 0.25rem 0.75rem; border-radius: var(--nx-radius);
      font-family: var(--font-mono); font-size: 0.5625rem; font-weight: 500;
      text-transform: uppercase; letter-spacing: 0.14em;
      border: 1px solid var(--nx-border-subtle);
    }
    .badge-critical { color: var(--nx-text-primary); border-color: var(--nx-border-cta); }
    .badge-high { color: var(--nx-text-secondary); border-color: var(--nx-border-medium); }
    .badge-medium { color: var(--nx-text-tertiary); }
    .badge-low { color: var(--nx-text-quaternary); }
    .badge-conf { color: var(--nx-text-tertiary); }

    .stakeholder-table {
      width: 100%; border-collapse: collapse; font-size: 0.8125rem; margin: 1rem 0;
    }
    .stakeholder-table th {
      text-align: left; padding: 0.5rem 0.75rem;
      color: var(--nx-text-tertiary); font-weight: 500; font-size: 0.5625rem;
      font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.14em;
      border-bottom: 1px solid var(--nx-border-medium);
    }
    .stakeholder-table td {
      padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--nx-border-subtle);
      color: var(--nx-read-color); vertical-align: top;
    }

    .scenario-card {
      background: rgba(240, 240, 250, 0.015);
      border: 1px solid var(--nx-border-subtle);
      border-radius: var(--nx-radius);
      padding: 1rem 1.25rem; margin: 0.75rem 0;
    }
    .scenario-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;
    }
    .scenario-prob {
      font-family: var(--font-mono); font-size: 0.625rem; font-weight: 500;
      color: var(--nx-text-secondary); padding: 0.125rem 0.5rem;
      border: 1px solid var(--nx-border-medium); border-radius: var(--nx-radius);
    }
    .scenario-implications {
      margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--nx-border-subtle);
      font-size: 0.8125rem; color: var(--nx-text-secondary);
    }

    .theme-entry {
      margin: 0.75rem 0; padding: 0.75rem 1rem;
      background: rgba(240, 240, 250, 0.015);
      border-left: 2px solid var(--nx-text-secondary);
      border-radius: 0 var(--nx-radius) var(--nx-radius) 0;
    }

    .causal-card {
      background: rgba(240, 240, 250, 0.015);
      border: 1px solid var(--nx-border-subtle);
      border-radius: var(--nx-radius);
      padding: 1rem 1.25rem; margin: 0.75rem 0;
      font-size: 0.875rem;
    }
    .causal-header {
      margin-bottom: 0.5rem; line-height: 1.5;
    }
    .causal-chain, .causal-counterfactual, .causal-alt {
      margin-top: 0.5rem; padding-top: 0.5rem;
      border-top: 1px solid var(--nx-border-subtle);
      color: var(--nx-text-secondary); font-size: 0.8125rem;
    }
    .causal-counterfactual { color: var(--nx-text-primary); }
    .causal-sources {
      margin-top: 0.5rem; font-family: var(--font-mono); font-size: 0.75rem;
      color: var(--nx-text-tertiary);
    }
    .causal-conf {
      font-family: var(--font-mono); font-size: 0.625rem; font-weight: 500;
      padding: 0.125rem 0.5rem; margin-left: 0.5rem;
      border: 1px solid var(--nx-border-medium); border-radius: var(--nx-radius);
    }
    .epistemic-badge {
      display: inline-block; padding: 0.125rem 0.5rem; margin-left: 0.5rem;
      font-family: var(--font-mono); font-size: 0.5625rem; font-weight: 500;
      text-transform: uppercase; letter-spacing: 0.1em;
      border-radius: var(--nx-radius);
    }
    .epistemic-demonstrated { background: rgba(94, 234, 212, 0.1); color: #5EEAD4; border: 1px solid rgba(94, 234, 212, 0.3); }
    .epistemic-suggested { background: rgba(167, 139, 250, 0.1); color: #A78BFA; border: 1px solid rgba(167, 139, 250, 0.3); }
    .epistemic-proposed { background: rgba(251, 191, 36, 0.1); color: #FBBF24; border: 1px solid rgba(251, 191, 36, 0.3); }
    .epistemic-projected { background: rgba(251, 113, 133, 0.1); color: #FB7185; border: 1px solid rgba(251, 113, 133, 0.3); }

    .evidence-tier-table {
      width: 100%; border-collapse: collapse; font-size: 0.8125rem; margin: 1rem 0;
    }
    .evidence-tier-table th {
      text-align: left; padding: 0.5rem 0.75rem;
      color: var(--nx-text-tertiary); font-weight: 500; font-size: 0.5625rem;
      font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.14em;
      border-bottom: 1px solid var(--nx-border-medium);
    }
    .evidence-tier-table td {
      padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--nx-border-subtle);
      vertical-align: top;
    }
  </style>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc((analysis.title || "NomosX Strategic Report").replace(/\[SRC-\d+\]/g, '').replace(/\[E\d+\]/g, '').trim())}</title>
  ${BRIEF_CSS}
  ${STRATEGIC_EXTRA_CSS}
</head>
<body>
  <article class="nomosx-brief">
    ${BRAND_HEADER}
    <h1>${esc((analysis.title || "Strategic Report").replace(/\[SRC-\d+\]/g, '').replace(/\[E\d+\]/g, '').trim())}</h1>
    <div class="brief-meta">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ${sources.length} sources</div>

    ${keyFindingsHtml}

    ${strategicSections.map(s => section(s.heading, analysis[s.key])).join("")}
    ${themesHtml}
    ${keyStudiesHtml}
    ${debateSection(analysis.debate)}

    ${analysis.evidenceQuality ? section("Evidence Quality", typeof analysis.evidenceQuality === 'object'
      ? [
          analysis.evidenceQuality.overallScore != null ? `Overall score: ${analysis.evidenceQuality.overallScore}/10` : '',
          analysis.evidenceQuality.methodology || '',
          analysis.evidenceQuality.gaps || '',
        ].filter(Boolean).join('\n\n')
      : analysis.evidenceQuality) : ''}

    ${stakeholderHtml}
    ${scenarioHtml}
    ${recsHtml}

    ${section("Implementation Roadmap", typeof analysis.implementation === 'object'
      ? [
          analysis.implementation.timeline ? `Timeline: ${analysis.implementation.timeline}` : '',
          analysis.implementation.resources ? `Resources: ${analysis.implementation.resources}` : '',
          analysis.implementation.obstacles?.length ? `Obstacles: ${analysis.implementation.obstacles.join('; ')}` : '',
        ].filter(Boolean).join('\n\n')
      : analysis.implementation)}

    ${causalArchitectureHtml}
    ${evidenceTiersHtml}
    ${adversarialTransparencyHtml}
    ${multiLensConvergenceHtml}

    ${section("Conclusion", analysis.conclusion)}
    ${section("Open Questions", Array.isArray(analysis.openQuestions) ? analysis.openQuestions.join('\n\n') : analysis.openQuestions || analysis.open_questions)}
    ${section("What Would Change Our Mind", analysis.whatChangesMind || analysis.what_changes_mind)}

    <section class="references-section">
      <h2>Sources</h2>
      ${apaCitations.map(c => renderAPAHtml(c)).join("\n")}
    </section>
  </article>
</body>
</html>`;
}
