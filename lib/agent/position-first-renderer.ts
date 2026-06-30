/**
 * Position-first brief renderer — Editorial V2 public format.
 * Structure: Detected subject → Team → Scenarios → Institute position → Evidence trace.
 */

import { formatAPA, renderAPAHtml } from './pipeline-types';
import type { PositionFirstBriefInput } from './editorial-types';
import { collisionLabel, dimensionsFromClassification } from './editorial-types';

function esc(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string)
  );
}

function replaceCitations(text: string): string {
  return text.replace(/\[SRC-(\d+)\]/g, (_, n) =>
    `<sup class="cite"><a href="#ref-${n}" title="Source ${n}">${n}</a></sup>`
  );
}

function renderParagraphs(text: string): string {
  if (!text) return '';
  return String(text)
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${replaceCitations(esc(p).replace(/\n/g, '<br>'))}</p>`)
    .join('\n');
}

const CSS = `
<style>
  :root {
    --bg: #000000;
    --surface: #0a0a0a;
    --border: rgba(255,255,255,0.08);
    --text: #e4e4e7;
    --muted: #a1a1aa;
    --dim: #52525b;
    --white: #ffffff;
    --font: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
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
  .brief-brand {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 20px;
  }
  .brief-brand span { color: var(--white); font-weight: 700; }
  .nx-eyebrow {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
    margin-bottom: 12px;
  }
  .nx-block {
    border: 1px solid var(--border);
    background: rgba(255,255,255,0.02);
    padding: 24px;
    margin: 24px 0;
  }
  h1 {
    font-size: 1.85em;
    font-weight: 600;
    line-height: 1.2;
    color: var(--white);
    margin-bottom: 12px;
  }
  .collision-line {
    font-size: 14px;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .urgency {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border: 1px solid var(--border);
    padding: 4px 10px;
    color: rgba(255,255,255,0.5);
    margin-top: 8px;
  }
  .team-grid { display: grid; gap: 12px; margin-top: 12px; }
  .team-card {
    border: 1px solid var(--border);
    padding: 14px 16px;
    background: rgba(255,255,255,0.02);
  }
  .team-role {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
    margin-bottom: 4px;
  }
  .team-domain { font-size: 15px; font-weight: 600; color: var(--white); margin-bottom: 6px; }
  .team-mandate { font-size: 13px; color: var(--muted); line-height: 1.55; }
  .scenario-row {
    border-top: 1px solid var(--border);
    padding: 16px 0;
  }
  .scenario-row:first-child { border-top: none; padding-top: 0; }
  .scenario-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
  }
  .scenario-name { font-weight: 600; color: var(--white); }
  .scenario-prob {
    font-family: ui-monospace, monospace;
    font-size: 13px;
    color: rgba(255,255,255,0.75);
  }
  .scenario-desc { font-size: 14px; color: var(--muted); line-height: 1.6; }
  .verdict-block {
    border-left: 3px solid var(--white);
    padding-left: 20px;
    margin: 16px 0;
  }
  .confidence {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    margin-top: 12px;
  }
  .objections li, .trace li { font-size: 14px; color: var(--muted); margin: 8px 0; }
  .objections ul, .trace ul { padding-left: 18px; }
  .metadata-bar {
    font-size: 12px;
    color: var(--dim);
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .references-section { margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); }
  .references-section h2 {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
    margin-bottom: 16px;
  }
  .apa-ref {
    display: block;
    padding: 8px 0 8px 36px;
    text-indent: -36px;
    font-size: 12px;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  sup.cite a { color: rgba(255,255,255,0.65); text-decoration: none; font-size: 10px; font-weight: 700; }
  .brief-footer {
    margin-top: 40px;
    font-size: 11px;
    color: var(--dim);
    text-align: center;
  }
  @media (max-width: 640px) {
    article.nomosx-brief { padding: 28px 16px; }
    h1 { font-size: 1.45em; }
  }
</style>`;

export function renderPositionFirstBriefHTML(input: PositionFirstBriefInput): string {
  const { question, classification, casting, position, analysis, sources } = input;
  const dimensions = dimensionsFromClassification(classification);
  const collision = collisionLabel(dimensions);
  const apaCitations = sources.map((s, i) => formatAPA(s, i + 1));
  const title = String(analysis.title ?? position.headline ?? question);
  const detectedReason = classification.detectedSubject ?? classification.reasoning ?? question;

  const teamHtml = casting.team
    .map(
      (m) => `
    <div class="team-card">
      <div class="team-role">${esc(m.role)} lens</div>
      <div class="team-domain">${esc(m.domain)}</div>
      <div class="team-mandate">${esc(m.mandate)}${m.frictionWith ? ` <span style="opacity:0.5">↔ ${esc(m.frictionWith)}</span>` : ''}</div>
    </div>`
    )
    .join('');

  const scenariosHtml = position.scenarios
    .map(
      (s) => `
    <div class="scenario-row">
      <div class="scenario-head">
        <span class="scenario-name">${esc(s.name)}${position.dominantScenario === s.name ? ' · base' : ''}</span>
        <span class="scenario-prob">${esc(s.probability)}</span>
      </div>
      <div class="scenario-desc">${replaceCitations(esc(s.description))}</div>
    </div>`
    )
    .join('');

  const objectionsHtml =
    position.objections.length > 0
      ? `<section class="nx-block objections">
      <p class="nx-eyebrow">Strongest objections</p>
      <ul>${position.objections.map((o) => `<li>${replaceCitations(esc(o))}</li>`).join('')}</ul>
    </section>`
      : '';

  const changeMindHtml =
    position.whatChangesMind.length > 0
      ? `<section class="nx-block trace">
      <p class="nx-eyebrow">What would change our mind</p>
      <ul>${position.whatChangesMind.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    </section>`
      : '';

  const evidenceTrace = analysis.evidence
    ? `<section class="nx-block">
      <p class="nx-eyebrow">Evidence trace</p>
      ${renderParagraphs(String(analysis.evidence).slice(0, 1200))}
    </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="NomosX Agentic Think Tank — Editorial V2">
  <title>${esc(title)}</title>
  ${CSS}
</head>
<body>
  <article class="nomosx-brief">
    <header>
      <div class="brief-brand">Nomos<span>X</span> — Agentic Think Tank</div>
      <p class="nx-eyebrow">Detected subject</p>
      <h1>${esc(title)}</h1>
      <p class="collision-line">${esc(collision)}</p>
      <p class="collision-line">${replaceCitations(esc(detectedReason))}</p>
      <span class="urgency">${esc(classification.urgency)} signal · ${classification.isCrossDomain ? 'cross-domain' : 'focused'} inquiry</span>
      <div class="metadata-bar">
        ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        · ${sources.length} sources
        · ${[...new Set(sources.map((s) => s.provider).filter(Boolean))].length} providers
      </div>
    </header>

    <section class="nx-block">
      <p class="nx-eyebrow">Dedicated team</p>
      <p style="font-size:13px;color:var(--muted);margin-bottom:4px">${esc(casting.productiveFriction)}</p>
      <div class="team-grid">${teamHtml}</div>
    </section>

    <section class="nx-block">
      <p class="nx-eyebrow">Probable futures</p>
      ${scenariosHtml || '<p class="scenario-desc">Scenario distribution pending further evidence.</p>'}
    </section>

    <section class="nx-block">
      <p class="nx-eyebrow">Institute position</p>
      <div class="verdict-block">
        ${renderParagraphs(position.verdict)}
      </div>
      <p class="confidence">Confidence ${position.confidence}/100 · ${position.confidenceLabel}</p>
    </section>

    ${objectionsHtml}
    ${changeMindHtml}
    ${evidenceTrace}

    <section class="references-section">
      <h2>Sources</h2>
      ${apaCitations.map((c) => renderAPAHtml(c)).join('\n')}
    </section>

    <footer class="brief-footer">
      NomosX — Probable futures. Decisions owned. Evidence verified.
    </footer>
  </article>
</body>
</html>`;
}
