/**
 * Position-first brief renderer — Editorial V2 public format.
 * Structure: Detected subject → Team → Scenarios → Institute position → Evidence trace.
 */

import { formatAPA, renderAPAHtml } from './pipeline-types';
import type { PositionFirstBriefInput } from './editorial-types';
import { collisionLabel, dimensionsFromClassification } from './editorial-types';
import { POSITION_FIRST_BRIEF_CSS } from './position-first-brief.css';
import { inlineLockupSvg } from '@/lib/brand/logo-inline';
import { BRAND_BRIEF_FOOTER, NOMOS_PHILOSOPHY_STATEMENT, BRAND_MANIFESTO } from '@/lib/brand/public-copy';

function esc(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string)
  );
}

function replaceCitations(text: string): string {
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

function renderParagraphs(text: string): string {
  if (!text) return '';
  return String(text)
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${replaceCitations(esc(p).replace(/\n/g, '<br>'))}</p>`)
    .join('\n');
}

const CSS = `<style>${POSITION_FIRST_BRIEF_CSS}</style>`;

export function renderPositionFirstBriefHTML(input: PositionFirstBriefInput): string {
  const { question, classification, casting, position, analysis, sources, isStrategic } = input;
  const dimensions = dimensionsFromClassification(classification);
  const collision = collisionLabel(dimensions);
  const apaCitations = sources.map((s, i) => formatAPA(s, i + 1));
  const title = String(analysis.title ?? position.headline ?? question);
  const detectedReason = classification.detectedSubject ?? classification.reasoning ?? question;

  // ── Methodology box ──
  const providers = [...new Set(sources.map((s) => s.provider).filter(Boolean))];
  const years = sources.map((s) => s.year).filter((y): y is number => typeof y === 'number' && y > 1900);
  const yearRange = years.length > 0
    ? years.length === 1 ? `${years[0]}` : `${Math.min(...years)}–${Math.max(...years)}`
    : 'n.d.';
  const methodologyHtml = `
<section class="nx-block methodology-box" style="background:var(--bg-alt,#f8f9fa);border-radius:8px;padding:16px 20px;margin:24px 0;font-size:13px;color:var(--muted,#666);">
  <p class="nx-eyebrow" style="margin-bottom:8px;">Methodology</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
    <div><strong>Sources:</strong> ${sources.length} ranked from ${providers.length} providers</div>
    <div><strong>Providers:</strong> ${providers.join(', ')}</div>
    <div><strong>Evidence period:</strong> ${yearRange}</div>
    <div><strong>Analysis depth:</strong> ${isStrategic ? 'Strategic (multi-pass)' : 'Brief (multi-pass)'}</div>
    <div><strong>Confidence:</strong> ${position.confidence}/100 (${position.confidenceLabel})</div>
    <div><strong>Cross-domain:</strong> ${classification.isCrossDomain ? 'Yes' : 'No'}</div>
  </div>
</section>`;

  // ── Structured policy recommendations ──
  const recommendations = (analysis as Record<string, unknown>).recommendations as Record<string, unknown> | undefined;
  const immediateRecs = Array.isArray(recommendations?.immediate) ? (recommendations!.immediate as string[]) : [];
  const shortTermRecs = Array.isArray(recommendations?.shortTerm) ? (recommendations!.shortTerm as string[]) : [];
  const longTermRecs = Array.isArray(recommendations?.longTerm) ? (recommendations!.longTerm as string[]) : [];
  const riskMitigation = Array.isArray(recommendations?.riskMitigation) ? (recommendations!.riskMitigation as string[]) : [];

  const hasRecs = immediateRecs.length > 0 || shortTermRecs.length > 0 || longTermRecs.length > 0 || riskMitigation.length > 0;
  const recommendationsHtml = hasRecs ? `
<section class="nx-block recommendations">
  <p class="nx-eyebrow">Policy recommendations</p>
  ${immediateRecs.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:var(--text,#222);margin-bottom:4px;">Immediate (0–3 months)</p>
    <ul>${immediateRecs.map((r) => `<li>${replaceCitations(esc(r))}</li>`).join('')}</ul>
  </div>` : ''}
  ${shortTermRecs.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:var(--text,#222);margin-bottom:4px;">Short-term (3–12 months)</p>
    <ul>${shortTermRecs.map((r) => `<li>${replaceCitations(esc(r))}</li>`).join('')}</ul>
  </div>` : ''}
  ${longTermRecs.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:var(--text,#222);margin-bottom:4px;">Long-term (1–5 years)</p>
    <ul>${longTermRecs.map((r) => `<li>${replaceCitations(esc(r))}</li>`).join('')}</ul>
  </div>` : ''}
  ${riskMitigation.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:#c0392b;margin-bottom:4px;">Risk mitigation</p>
    <ul>${riskMitigation.map((r) => `<li>${replaceCitations(esc(r))}</li>`).join('')}</ul>
  </div>` : ''}
</section>` : '';

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

  // ── Transform causalChain into structured sections ──
  const causalChain = (analysis.causalChain as any[]) || [];
  const chainHtml = causalChain.length > 0
    ? causalChain.map((link, idx) => {
        const claim = String(link.claim || '');
        const evidence = String(link.evidence || '');
        const warrant = String(link.warrant || '');
        const status = String(link.temporalStatus || '');
        const statusLabel = status === 'present_fact' ? 'Present Fact' : status === 'active_mechanism' ? 'Active Mechanism' : status === 'future_extrapolation' ? 'Future Projection' : '';
        const parts: string[] = [];
        if (claim) parts.push(`<p class="chain-claim">${renderParagraphs(claim)}</p>`);
        if (evidence && evidence !== claim) parts.push(`<p class="chain-evidence"><span class="chain-label">Evidence:</span> ${renderParagraphs(evidence)}</p>`);
        if (warrant) parts.push(`<p class="chain-warrant"><span class="chain-label">Mechanism:</span> ${renderParagraphs(warrant)}</p>`);
        return `<div class="chain-link${idx < causalChain.length - 1 ? ' chain-connected' : ''}">
          ${statusLabel ? `<span class="chain-status chain-status-${status}">${statusLabel}</span>` : ''}
          ${parts.join('')}
        </div>`;
      }).join('\n')
    : '';

  // ── Trajectory as prose ──
  const trajectory = analysis.trajectory as any;
  const trajectoryHtml = trajectory
    ? `<section class="nx-block trajectory">
      <p class="nx-eyebrow">Trajectory</p>
      ${renderParagraphs(String(trajectory.state))}${renderParagraphs(String(trajectory.assumptions))}
    </section>`
    : '';

  // ── Rejected alternatives as structured section ──
  const rejectedAlts = (analysis.rejectedAlternatives as any[]) || [];
  const rejectedHtml = rejectedAlts.length > 0
    ? `<section class="nx-block rejected-alternatives">
      <p class="nx-eyebrow">Rejected alternatives</p>
      ${rejectedAlts.map((ra) => {
        const scenario = String(ra.scenario || '');
        const why = String(ra.whyRejected || '');
        const risk = String(ra.residualRisk || '');
        return `<div class="rejected-alt">
          ${scenario ? `<p class="rejected-scenario">${renderParagraphs(scenario)}</p>` : ''}
          ${why ? `<p class="rejected-why"><span class="chain-label">Why rejected:</span> ${renderParagraphs(why)}</p>` : ''}
          ${risk ? `<p class="rejected-risk"><span class="chain-label">Residual risk:</span> ${renderParagraphs(risk)}</p>` : ''}
        </div>`;
      }).join('\n')}
    </section>`
    : '';

  // ── What to watch as structured section ──
  const whatToWatch = analysis.whatToWatch as any;
  const watchHtml = whatToWatch
    ? `<section class="nx-block what-to-watch">
      <p class="nx-eyebrow">Signals to watch</p>
      ${Array.isArray(whatToWatch.signals) && whatToWatch.signals.length > 0
        ? `<ul>${whatToWatch.signals.map((s: string) => `<li>${replaceCitations(esc(s))}</li>`).join('')}</ul>`
        : ''}
      ${whatToWatch.whatWouldChangeMind ? `<p class="change-mind"><span class="chain-label">What would change our mind:</span> ${renderParagraphs(String(whatToWatch.whatWouldChangeMind))}</p>` : ''}
      ${whatToWatch.horizonCheck ? `<p class="horizon"><span class="chain-label">Revisit by:</span> ${replaceCitations(esc(String(whatToWatch.horizonCheck)))}</p>` : ''}
    </section>`
    : '';

  // ── Evidence assessment as structured section ──
  const evidenceAssessment = analysis.evidenceAssessment as any;
  const evidenceHtml = evidenceAssessment
    ? `<section class="nx-block evidence-assessment">
      <p class="nx-eyebrow">Evidence assessment</p>
      ${Array.isArray(evidenceAssessment.strongestLinks) && evidenceAssessment.strongestLinks.length > 0
        ? `<div><p style="font-weight:600;margin-bottom:4px;">Strongest links</p><ul>${evidenceAssessment.strongestLinks.map((l: string) => `<li>${replaceCitations(esc(l))}</li>`).join('')}</ul></div>`
        : ''}
      ${evidenceAssessment.weakestLink ? `<p class="weakest-link"><span class="chain-label">Weakest link:</span> ${renderParagraphs(String(evidenceAssessment.weakestLink))}</p>` : ''}
      ${Array.isArray(evidenceAssessment.gaps) && evidenceAssessment.gaps.length > 0
        ? `<div><p style="font-weight:600;margin-bottom:4px;">Evidence gaps</p><ul>${evidenceAssessment.gaps.map((g: string) => `<li>${esc(g)}</li>`).join('')}</ul></div>`
        : ''}
      ${evidenceAssessment.sourceDiversity ? `<p class="source-diversity"><span class="chain-label">Source diversity:</span> ${renderParagraphs(String(evidenceAssessment.sourceDiversity))}</p>` : ''}
    </section>`
    : '';

  // ── Key findings as structured section ──
  const keyFindings = (analysis.keyFindings as string[]) || [];
  const keyFindingsHtml = keyFindings.length > 0
    ? `<section class="nx-block key-findings">
      <p class="nx-eyebrow">Key findings</p>
      <ul>${keyFindings.map((f) => `<li>${replaceCitations(esc(f))}</li>`).join('')}</ul>
    </section>`
    : '';

  // ── Build structured body: verdict first, then chain, then sections ──
  const verdictText = String(analysis.verdict || position.verdict || '');
  const throughLine = String(analysis.throughLine || '');
  const anchoringBasis = String(analysis.anchoringBasis || '');

  const bodyHtml = [
    // Verdict first — no section header
    verdictText ? `<section class="nx-block verdict"><p class="nx-eyebrow">Position</p><div class="verdict-block">${renderParagraphs(verdictText)}</div></section>` : '',
    // Through line as a lead paragraph
    throughLine ? `<p class="through-line" style="font-size:1.1em;font-weight:500;color:var(--muted);margin:1.5em 0">${replaceCitations(esc(throughLine))}</p>` : '',
    // Anchoring basis
    anchoringBasis ? `<section class="nx-block anchoring"><p class="nx-eyebrow">Anchoring basis</p><div class="verdict-block">${renderParagraphs(anchoringBasis)}</div></section>` : '',
    // Causal chain as structured section
    chainHtml ? `<section class="nx-block causal-chain"><p class="nx-eyebrow">Causal chain</p>${chainHtml}</section>` : '',
    // Trajectory
    trajectoryHtml,
    // Rejected alternatives
    rejectedHtml,
    // What to watch
    watchHtml,
    // Evidence assessment
    evidenceHtml,
    // Key findings
    keyFindingsHtml,
  ].filter(Boolean).join('\n');

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
    <header class="brief-hero">
      <div class="brief-brand">${inlineLockupSvg(16, { mono: true })}<span class="brief-brand-tag">Agentic Think Tank</span></div>
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

    ${methodologyHtml}

    <section class="nx-block">
      <p class="nx-eyebrow">Probable futures</p>
      ${scenariosHtml || '<p class="scenario-desc">Scenario distribution pending further evidence.</p>'}
    </section>

    ${bodyHtml}

    ${recommendationsHtml}

    ${objectionsHtml}
    ${changeMindHtml}

    <section class="references-section">
      <h2>Sources</h2>
      ${apaCitations.map((c) => renderAPAHtml(c)).join('\n')}
    </section>

    <footer class="brief-footer">
      ${BRAND_BRIEF_FOOTER}
      <div style="margin-top:0.75rem;font-size:0.5rem;letter-spacing:0.08em;color:rgba(240,240,250,0.15);text-transform:none;line-height:1.6;">${BRAND_MANIFESTO.replace(/\n/g, '<br/>')}</div>
    </footer>
  </article>
</body>
</html>`;
}
