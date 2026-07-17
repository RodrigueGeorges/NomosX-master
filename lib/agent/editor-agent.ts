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
import { inlineLockupSvg } from '@/lib/brand/logo-inline';

// ============================================================================
// HTML ESCAPING
// ============================================================================

function esc(s: string): string {
  return String(s || "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] as string));
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

function section(heading: string, content: any, icon?: string, governingThought?: string): string {
  if (!content) return "";
  const iconHtml = icon ? `<span class="section-icon">${icon}</span> ` : "";
  const gtHtml = governingThought ? `
      <div class="governing-thought">${replaceCitations(esc(governingThought))}</div>` : "";
  return `
    <section class="brief-section">
      <h2>${iconHtml}${esc(heading)}</h2>
      ${gtHtml}
      ${renderParagraphs(String(content))}
    </section>`;
}

function debateSection(debate: any): string {
  if (!debate) return "";

  // Support both brief (pro/con) and strategic (position1/position2) debate structures
  const proLabel = debate.position1?.label || "Arguments For";
  const conLabel = debate.position2?.label || "Arguments Against";
  const proContent = debate.position1?.arguments
    ? debate.position1.arguments.join('\n\n')
    : (debate.pro || "");
  const conContent = debate.position2?.arguments
    ? debate.position2.arguments.join('\n\n')
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

  const colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

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
// CSS STYLESHEET
// ============================================================================

const BRIEF_CSS = `
<style>
  :root {
    --bg: #000000;
    --bg-card: #0a0a0a;
    --bg-elevated: #141414;
    --text: #e4e4e7;
    --text-muted: #a1a1aa;
    --text-dim: #52525b;
    --accent: #ffffff;
    --accent-green: #10B981;
    --accent-red: #F87171;
    --accent-amber: #F59E0B;
    --border: rgba(255,255,255,0.08);
    --font: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --font-serif: 'Merriweather', 'Georgia', serif;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --bg: #ffffff;
      --bg-card: #fafafa;
      --bg-elevated: #f4f4f5;
      --text: #18181b;
      --text-muted: #52525b;
      --text-dim: #71717a;
      --accent: #000000;
      --border: rgba(0,0,0,0.08);
    }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  article.nomosx-brief {
    max-width: 780px;
    margin: 0 auto;
    padding: 48px 32px;
    font-family: var(--font);
    color: var(--text);
    line-height: 1.7;
    background: var(--bg);
  }

  .brief-header {
    margin-bottom: 40px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 24px;
  }

  .brief-brand {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-bottom: 16px;
    color: var(--text);
  }

  .brief-brand-tag {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 400;
  }

  h1 {
    font-family: var(--font-serif);
    font-size: 2em;
    font-weight: 700;
    line-height: 1.25;
    margin-bottom: 16px;
    color: var(--text);
  }

  .metadata-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    align-items: center;
    font-size: 13px;
    color: var(--text-muted);
  }

  .meta-item { padding: 0 4px; }
  .meta-sep { color: var(--text-dim); padding: 0 6px; }

  .key-findings-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: 8px;
    padding: 20px 24px;
    margin: 24px 0 32px;
  }

  .key-findings-card h3 {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
    margin-bottom: 12px;
  }

  .key-findings-card ul {
    list-style: none;
    padding: 0;
  }

  .key-findings-card li {
    padding: 6px 0 6px 20px;
    position: relative;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text);
  }

  .key-findings-card li::before {
    content: "→";
    position: absolute;
    left: 0;
    color: var(--accent);
    font-weight: 700;
  }

  .brief-section {
    margin: 32px 0;
  }

  .brief-section h2 {
    font-family: var(--font);
    font-size: 1.3em;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--accent);
    display: inline-block;
  }

  .brief-section p {
    margin-bottom: 12px;
    font-size: 15px;
    color: var(--text);
  }

  .debate-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin: 16px 0;
  }

  .debate-pro, .debate-con {
    background: var(--bg-card);
    border-radius: 8px;
    padding: 20px;
    border: 1px solid var(--border);
  }

  .debate-pro { border-top: 3px solid var(--accent-green); }
  .debate-con { border-top: 3px solid var(--accent-red); }

  .debate-pro h3 { color: var(--accent-green); font-size: 14px; margin-bottom: 12px; }
  .debate-con h3 { color: var(--accent-red); font-size: 14px; margin-bottom: 12px; }

  .debate-synthesis {
    background: var(--bg-card);
    border-radius: 8px;
    padding: 20px;
    border: 1px solid var(--border);
    border-top: 3px solid var(--accent-amber);
    margin-top: 16px;
  }

  .debate-synthesis h3 { color: var(--accent-amber); font-size: 14px; margin-bottom: 12px; }

  sup.cite a {
    color: var(--accent);
    text-decoration: none;
    font-size: 10px;
    font-weight: 700;
    padding: 0 1px;
  }

  sup.cite a:hover { text-decoration: underline; }

  .references-section {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 2px solid var(--border);
  }

  .references-section h2 {
    font-size: 1.2em;
    margin-bottom: 16px;
    border-bottom: none;
  }

  .apa-ref {
    display: block;
    padding: 8px 0 8px 40px;
    text-indent: -40px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .apa-ref:last-child { border-bottom: none; }

  .ref-num {
    font-weight: 700;
    color: var(--accent);
    min-width: 32px;
    display: inline-block;
  }

  .apa-ref em { color: var(--text); }

  .source-distribution {
    margin: 16px 0;
  }

  .governing-thought {
    background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(16,185,129,0.08));
    border-left: 4px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 14px 18px;
    margin: 0 0 20px;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--text);
  }

  .so-what-callout {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent-green);
    border-radius: 0 8px 8px 0;
    padding: 14px 18px;
    margin: 20px 0 0;
    font-size: 14px;
    color: var(--text-muted);
  }
  .so-what-callout strong { color: var(--accent-green); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }

  .brief-footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-dim);
    text-align: center;
  }

  @media print {
    article.nomosx-brief { padding: 24px; max-width: 100%; }
    .debate-grid { grid-template-columns: 1fr; }
    sup.cite a { color: #000; }
  }

  @media (max-width: 640px) {
    article.nomosx-brief { padding: 24px 16px; }
    h1 { font-size: 1.5em; }
    .debate-grid { grid-template-columns: 1fr; }
  }
</style>`;

// ============================================================================
// MAIN RENDER: BRIEF HTML
// ============================================================================

export function renderProfessionalBriefHTML(analysis: any, sources: any[]): string {
  // Count words for metadata
  const allText = [
    analysis.summary, analysis.consensus, analysis.disagreements,
    analysis.debate?.pro, analysis.debate?.con, analysis.debate?.synthesis,
    analysis.evidence, analysis.implications, analysis.risks,
    analysis.open_questions, analysis.what_changes_mind,
  ].filter(Boolean).join(" ");
  const wordCount = allText.split(/\s+/).length;

  // Format APA citations
  const apaCitations = sources.map((s, i) => formatAPA(s, i + 1));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="NomosX Agentic Think Tank">
  <title>${esc(analysis.title || "NomosX Research Brief")}</title>
  ${BRIEF_CSS}
</head>
<body>
  <article class="nomosx-brief">
    <header class="brief-header">
      <div class="brief-brand">${inlineLockupSvg(16, { mono: true })}<span class="brief-brand-tag">Agentic Think Tank</span></div>
      <h1>${esc(analysis.title || "Research Brief")}</h1>
      ${metadataBar(sources, wordCount)}
    </header>

    ${keyFindingsCard(analysis)}

    ${section("Executive Summary", analysis.summary, undefined, extractGoverningThought(analysis.summary))}
    ${section("Consensus", analysis.consensus, undefined, extractGoverningThought(analysis.consensus))}
    ${section("Disagreements", analysis.disagreements, undefined, extractGoverningThought(analysis.disagreements))}
    ${debateSection(analysis.debate)}
    ${section("Evidence Quality", analysis.evidence, undefined, extractGoverningThought(analysis.evidence))}
    ${section("Strategic Implications", analysis.implications, undefined, extractGoverningThought(analysis.implications))}
    ${section("Risks & Limitations", analysis.risks, undefined, extractGoverningThought(analysis.risks))}
    ${section("Open Questions", analysis.open_questions)}
    ${section("What Would Change Our Mind", analysis.what_changes_mind)}

    <section class="references-section">
      <h2>References</h2>
      <div class="source-distribution">
        ${sourceDistributionSVG(sources)}
      </div>
      ${apaCitations.map(c => renderAPAHtml(c)).join("\n")}
    </section>

    <footer class="brief-footer">
      NomosX — Every claim sourced. Every source verified. ${sources.length} sources from ${[...new Set(sources.map(s => s.provider))].length} providers.
    </footer>
  </article>
</body>
</html>`;
}

// ============================================================================
// MAIN RENDER: STRATEGIC REPORT HTML
// ============================================================================

export function renderProfessionalStrategicHTML(analysis: any, sources: any[]): string {
  const allText = JSON.stringify(analysis || {});
  const wordCount = allText.split(/\s+/).length;
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
  const keyFindings = analysis.keyFindings || [];
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

  // Themes / Thematic analysis
  const themes = analysis.themes || [];
  const themesHtml = themes.length > 0 ? `
    <section class="brief-section">
      <h2>Thematic Analysis</h2>
      ${themes.map((t: any) => `
        <div class="theme-entry" style="margin:12px 0;padding:12px 16px;background:var(--bg-card);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;">
          <strong>${esc(t.name || '')}</strong>
          ${t.evidence ? `<span style="font-size:12px;color:var(--accent-green);margin-left:8px;">${esc(t.evidence)}</span>` : ""}
          ${t.description ? `<p style="margin-top:6px;font-size:14px;">${replaceCitations(esc(t.description))}</p>` : ""}
        </div>`).join("")}
    </section>` : "";

  // Key studies
  const keyStudies = analysis.keyStudies || [];
  const keyStudiesHtml = keyStudies.length > 0 ? `
    <section class="brief-section">
      <h2>Key Studies</h2>
      ${keyStudies.map((ks: any) => `
        <div style="margin:10px 0;padding:10px 14px;background:var(--bg-card);border-radius:6px;font-size:14px;">
          <strong>${replaceCitations(esc(ks.citation || ''))}</strong>
          ${ks.contribution ? ` — ${esc(ks.contribution)}` : ""}
          ${ks.limitations ? `<br><em style="color:var(--text-muted)">Limitation: ${esc(ks.limitations)}</em>` : ""}
        </div>`).join("")}
    </section>` : "";

  // Stakeholder analysis
  const stakeholders = analysis.stakeholderAnalysis || [];
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
  const scenarios = analysis.scenarios || [];
  const scenarioHtml = scenarios.length > 0 ? `
    <section class="brief-section">
      <h2>Scenario Planning</h2>
      ${scenarios.map((s: any) => `
        <div class="scenario-card">
          <div class="scenario-header">
            <strong>${esc(s.name || '')}</strong>
            <span class="scenario-prob">${s.probability ? `${s.probability}%` : ''}</span>
          </div>
          ${renderParagraphs(s.description || '')}
          ${s.implications ? `<div class="scenario-implications"><strong>Implications:</strong> ${replaceCitations(esc(s.implications))}</div>` : ''}
        </div>`).join("")}
    </section>` : "";

  // Recommendations
  const recs = analysis.recommendations || {};
  const recsHtml = (recs.immediate?.length || recs.shortTerm?.length || recs.longTerm?.length) ? `
    <section class="brief-section">
      <h2>Recommendations</h2>
      ${recs.immediate?.length ? `<h3 style="color:var(--accent-green);">Immediate (0-6 months)</h3><ul>${recs.immediate.map((r: string) => `<li>${replaceCitations(esc(r))}</li>`).join("")}</ul>` : ""}
      ${recs.shortTerm?.length ? `<h3 style="color:var(--accent-amber);">Short-Term (6-24 months)</h3><ul>${recs.shortTerm.map((r: string) => `<li>${replaceCitations(esc(r))}</li>`).join("")}</ul>` : ""}
      ${recs.longTerm?.length ? `<h3 style="color:var(--accent);">Long-Term (2-5 years)</h3><ul>${recs.longTerm.map((r: string) => `<li>${replaceCitations(esc(r))}</li>`).join("")}</ul>` : ""}
      ${recs.riskMitigation?.length ? `<h3 style="color:var(--accent-red);">Risk Mitigation</h3><ul>${recs.riskMitigation.map((r: string) => `<li>${replaceCitations(esc(r))}</li>`).join("")}</ul>` : ""}
    </section>` : "";

  const STRATEGIC_EXTRA_CSS = `
  <style>
    .badges { margin: 12px 0 24px; display: flex; gap: 8px; }
    .badge {
      display: inline-block; padding: 4px 12px; border-radius: 4px;
      font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .badge-critical { background: #7F1D1D; color: #FCA5A5; }
    .badge-high { background: #78350F; color: #FCD34D; }
    .badge-medium { background: #1E3A5F; color: #93C5FD; }
    .badge-low { background: #14532D; color: #86EFAC; }
    .badge-conf { background: var(--bg-elevated); color: var(--text-muted); }

    .stakeholder-table {
      width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0;
    }
    .stakeholder-table th {
      text-align: left; padding: 8px 12px; background: var(--bg-elevated);
      color: var(--text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase;
      border-bottom: 2px solid var(--border);
    }
    .stakeholder-table td {
      padding: 8px 12px; border-bottom: 1px solid var(--border); color: var(--text);
    }

    .scenario-card {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
      padding: 16px 20px; margin: 12px 0;
    }
    .scenario-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
    }
    .scenario-prob {
      background: var(--accent); color: white; padding: 2px 10px; border-radius: 12px;
      font-size: 12px; font-weight: 700;
    }
    .scenario-implications {
      margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);
      font-size: 13px; color: var(--text-muted);
    }
  </style>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="NomosX Agentic Think Tank">
  <title>${esc(analysis.title || "NomosX Strategic Report")}</title>
  ${BRIEF_CSS}
  ${STRATEGIC_EXTRA_CSS}
</head>
<body>
  <article class="nomosx-brief">
    <header class="brief-header">
      <div class="brief-brand">${inlineLockupSvg(16, { mono: true })}<span class="brief-brand-tag">Strategic Report</span></div>
      <h1>${esc(analysis.title || "Strategic Report")}</h1>
      ${metadataBar(sources, wordCount)}
      ${badgeHtml}
    </header>

    ${keyFindingsHtml}

    ${strategicSections.map(s => section(s.heading, analysis[s.key], undefined, extractGoverningThought(analysis[s.key]))).join("")}
    ${themesHtml}
    ${keyStudiesHtml}
    ${debateSection(analysis.debate)}

    ${section("Evidence Quality", typeof analysis.evidenceQuality === 'object' 
      ? `Overall score: ${analysis.evidenceQuality.overallScore || 'N/A'}/10\n\n${analysis.evidenceQuality.methodology || ''}\n\n${analysis.evidenceQuality.gaps || ''}`
      : analysis.evidenceQuality, undefined, typeof analysis.evidenceQuality === 'string' ? extractGoverningThought(analysis.evidenceQuality) : undefined)}

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

    ${section("Conclusion", analysis.conclusion, undefined, extractGoverningThought(analysis.conclusion))}
    ${section("Open Questions", Array.isArray(analysis.openQuestions) ? analysis.openQuestions.join('\n\n') : analysis.openQuestions || analysis.open_questions)}
    ${section("What Would Change Our Mind", analysis.whatChangesMind || analysis.what_changes_mind)}

    <section class="references-section">
      <h2>References</h2>
      <div class="source-distribution">
        ${sourceDistributionSVG(sources)}
      </div>
      ${apaCitations.map(c => renderAPAHtml(c)).join("\n")}
    </section>

    <footer class="brief-footer">
      NomosX Strategic Report — ${sources.length} sources, ${[...new Set(sources.map(s => s.provider))].length} providers — Every claim sourced. Every source verified.
    </footer>
  </article>
</body>
</html>`;
}
