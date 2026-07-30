/**
 * Position-first brief renderer — Editorial V2 public format.
 * Structure: Detected subject → Team → Scenarios → Institute position → Evidence trace.
 */

import { formatAPA, renderAPAHtml } from './pipeline-types';
import type { PositionFirstBriefInput } from './editorial-types';
import { collisionLabel, dimensionsFromClassification } from './editorial-types';
import { POSITION_FIRST_BRIEF_CSS } from './position-first-brief.css';
import { inlineLockupSvg } from '@/lib/brand/logo-inline';
import { BRAND_BRIEF_FOOTER } from '@/lib/brand/public-copy';

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

  // ── Transform causalChain into continuous prose ──
  const causalChain = (analysis.causalChain as any[]) || [];
  const chainProse = causalChain.length > 0
    ? causalChain.map((link) => {
        const claim = String(link.claim || '');
        const evidence = String(link.evidence || '');
        const warrant = String(link.warrant || '');
        const parts = [claim];
        if (evidence && evidence !== claim) parts.push(evidence);
        if (warrant) parts.push(`The mechanism: ${warrant}`);
        return parts.join(' ');
      }).join(' ')
    : '';

  // ── Trajectory as prose ──
  const trajectory = analysis.trajectory as any;
  const trajectoryProse = trajectory
    ? [trajectory.state, trajectory.assumptions].filter(Boolean).map(String).join(' ')
    : '';

  // ── Rejected alternatives as prose ──
  const rejectedAlts = (analysis.rejectedAlternatives as any[]) || [];
  const rejectedProse = rejectedAlts.length > 0
    ? rejectedAlts.map((ra) => {
        const scenario = String(ra.scenario || '');
        const why = String(ra.whyRejected || '');
        const risk = String(ra.residualRisk || '');
        return [scenario, why, risk].filter(Boolean).join(' — ');
      }).join(' ')
    : '';

  // ── What to watch as prose ──
  const whatToWatch = analysis.whatToWatch as any;
  const watchProse = whatToWatch
    ? [
        Array.isArray(whatToWatch.signals) ? whatToWatch.signals.join(' ') : '',
        String(whatToWatch.whatWouldChangeMind || ''),
        String(whatToWatch.horizonCheck || ''),
      ].filter(Boolean).join(' ')
    : '';

  // ── Evidence assessment as prose ──
  const evidenceAssessment = analysis.evidenceAssessment as any;
  const evidenceProse = evidenceAssessment
    ? [
        Array.isArray(evidenceAssessment.strongestLinks) ? evidenceAssessment.strongestLinks.join(' ') : '',
        String(evidenceAssessment.weakestLink || ''),
        Array.isArray(evidenceAssessment.gaps) ? evidenceAssessment.gaps.join(' ') : '',
        String(evidenceAssessment.sourceDiversity || ''),
      ].filter(Boolean).join(' ')
    : '';

  // ── Key findings as prose ──
  const keyFindings = (analysis.keyFindings as string[]) || [];
  const keyFindingsProse = keyFindings.length > 0 ? keyFindings.join(' ') : '';

  // ── Build prose-continuous body: verdict first, then chain, then trajectory, then rest ──
  const verdictText = String(analysis.verdict || position.verdict || '');
  const throughLine = String(analysis.throughLine || '');
  const anchoringBasis = String(analysis.anchoringBasis || '');

  const proseBodyHtml = [
    // Verdict first — no section header
    verdictText ? `<div class="verdict-block">${renderParagraphs(verdictText)}</div>` : '',
    // Through line as a lead paragraph
    throughLine ? `<p class="through-line" style="font-size:1.1em;font-weight:500;color:var(--muted);margin:1.5em 0">${replaceCitations(esc(throughLine))}</p>` : '',
    // Anchoring basis
    anchoringBasis ? `<div class="verdict-block">${renderParagraphs(anchoringBasis)}</div>` : '',
    // Causal chain as continuous prose — no visible section break
    chainProse ? `<div class="verdict-block">${renderParagraphs(chainProse)}</div>` : '',
    // Trajectory flows naturally
    trajectoryProse ? `<div class="verdict-block">${renderParagraphs(trajectoryProse)}</div>` : '',
    // Rejected alternatives
    rejectedProse ? `<div class="verdict-block">${renderParagraphs(rejectedProse)}</div>` : '',
    // What to watch
    watchProse ? `<div class="verdict-block">${renderParagraphs(watchProse)}</div>` : '',
    // Evidence assessment
    evidenceProse ? `<div class="verdict-block">${renderParagraphs(evidenceProse)}</div>` : '',
    // Key findings
    keyFindingsProse ? `<div class="verdict-block">${renderParagraphs(keyFindingsProse)}</div>` : '',
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

    ${proseBodyHtml}

    ${recommendationsHtml}

    ${objectionsHtml}
    ${changeMindHtml}

    <section class="references-section">
      <h2>Sources</h2>
      ${apaCitations.map((c) => renderAPAHtml(c)).join('\n')}
    </section>

    <footer class="brief-footer">
      ${BRAND_BRIEF_FOOTER}
    </footer>
  </article>
</body>
</html>`;
}
