/**
 * Position-first brief renderer — Editorial V2 public format.
 * Structure: Detected subject → Team → Scenarios → Institute position → Evidence trace.
 */

import { formatAPA, renderAPAHtml } from './pipeline-types';
import type { PositionFirstBriefInput } from './editorial-types';
import { collisionLabel, dimensionsFromClassification } from './editorial-types';
import { POSITION_FIRST_BRIEF_CSS } from './position-first-brief.css';
import { dedupeCitations } from './strategic-report-renderer';
import { getPublicationFormat } from '../publication-formats';

function esc(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string)
  );
}

function replaceCitations(text: string, sourceCount?: number): string {
  let normalized = text
    .replace(/\(SRC-(\d+)(?:\s*,\s*SRC-(\d+))*\)/g, (match, ...nums) => {
      const refs = match.match(/SRC-(\d+)/g) || [];
      return refs.map(r => `[${r}]`).join('');
    })
    .replace(/(?<!\[)SRC-(\d+)(?!\])/g, '[SRC-$1]');
  // Deduplicate before rendering so [SRC-13][SRC-13] doesn't render as "1313".
  normalized = dedupeCitations(normalized);
  // Fix broken abbreviations: "e [SRC-N] g." → "e.g. [SRC-N]"
  // LLM sometimes inserts citations inside common abbreviations
  normalized = normalized
    .replace(/\be\s*\[SRC-(\d+)\]\s*g\./gi, 'e.g. [SRC-$1]')
    .replace(/\bi\s*\[SRC-(\d+)\]\s*e\./gi, 'i.e. [SRC-$1]')
    .replace(/\be\s*<sup[^>]*>.*?<\/sup>\s*g\./gi, 'e.g.')
    .replace(/\bi\s*<sup[^>]*>.*?<\/sup>\s*e\./gi, 'i.e.')
    // Remove [LIVE-DATA] placeholders that LLM left in text
    .replace(/\[LIVE-DATA\]/gi, '');
  return normalized.replace(/\[SRC-(\d+)\]/g, (_, n) => {
    const num = parseInt(n, 10);
    if (sourceCount && (num < 1 || num > sourceCount)) {
      return ''; // Remove out-of-range citation
    }
    return `<sup class="cite"><a href="#ref-${n}" title="Source ${n}">${n}</a></sup>`;
  });
}

function renderParagraphs(text: string, sourceCount?: number): string {
  if (!text) return '';
  return String(text)
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${replaceCitations(esc(p).replace(/\n/g, '<br>'), sourceCount)}</p>`)
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

  // ── Format badge + minimal metadata line ──
  const providers = [...new Set(sources.map((s) => s.provider).filter(Boolean))];
  const publicationType = isStrategic ? 'STRATEGIC_REPORT' : 'ARTICLE';
  const fmt = getPublicationFormat(publicationType);
  const formatBadgeHtml = `<span class="format-badge" title="${esc(fmt.description)}">${esc(fmt.label)}</span>`;
  const metaLine = `${formatBadgeHtml} ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ${sources.length} sources · ${providers.length} providers · Confidence: ${position.confidence}/100`;

  // ── Structured policy recommendations ──
  // Prefer position.recommendations (from arbiter), fall back to analysis.recommendations
  const recommendations = position.recommendations ?? (analysis as Record<string, unknown>).recommendations as Record<string, unknown> | undefined;
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
    <ul>${immediateRecs.map((r) => `<li>${replaceCitations(esc(r), sources.length)}</li>`).join('')}</ul>
  </div>` : ''}
  ${shortTermRecs.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:var(--text,#222);margin-bottom:4px;">Short-term (3–12 months)</p>
    <ul>${shortTermRecs.map((r) => `<li>${replaceCitations(esc(r), sources.length)}</li>`).join('')}</ul>
  </div>` : ''}
  ${longTermRecs.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:var(--text,#222);margin-bottom:4px;">Long-term (1–5 years)</p>
    <ul>${longTermRecs.map((r) => `<li>${replaceCitations(esc(r), sources.length)}</li>`).join('')}</ul>
  </div>` : ''}
  ${riskMitigation.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:#c0392b;margin-bottom:4px;">Risk mitigation</p>
    <ul>${riskMitigation.map((r) => `<li>${replaceCitations(esc(r), sources.length)}</li>`).join('')}</ul>
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
      (s) => {
        const signalsHtml = s.signals && s.signals.length > 0
          ? `<div class="scenario-signals"><span class="signal-label">Signals to watch:</span> ${s.signals.map(sig => `<span class="signal-tag">${esc(sig)}</span>`).join('')}</div>`
          : '';
        return `
    <div class="scenario-row">
      <div class="scenario-head">
        <span class="scenario-name">${esc(s.name)}${position.dominantScenario === s.name ? ' · base' : ''}</span>
        <span class="scenario-prob">${esc(s.probability)}</span>
      </div>
      <div class="scenario-desc">${replaceCitations(esc(s.description), sources.length)}</div>
      ${signalsHtml}
    </div>`;
      }
    )
    .join('');

  const objectionsHtml =
    position.objections.length > 0
      ? `<section class="nx-block objections">
      <p class="nx-eyebrow">Strongest objections</p>
      <ul>${position.objections.map((o) => `<li>${replaceCitations(esc(o), sources.length)}</li>`).join('')}</ul>
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
        if (claim) parts.push(`<p class="chain-claim">${renderParagraphs(claim, sources.length)}</p>`);
        if (evidence && evidence !== claim) parts.push(`<p class="chain-evidence"><span class="chain-label">Evidence:</span> ${renderParagraphs(evidence, sources.length)}</p>`);
        if (warrant) parts.push(`<p class="chain-warrant"><span class="chain-label">Mechanism:</span> ${renderParagraphs(warrant, sources.length)}</p>`);
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
      ${renderParagraphs(String(trajectory.state), sources.length)}${renderParagraphs(String(trajectory.assumptions), sources.length)}
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
          ${scenario ? `<p class="rejected-scenario">${renderParagraphs(scenario, sources.length)}</p>` : ''}
          ${why ? `<p class="rejected-why"><span class="chain-label">Why rejected:</span> ${renderParagraphs(why, sources.length)}</p>` : ''}
          ${risk ? `<p class="rejected-risk"><span class="chain-label">Residual risk:</span> ${renderParagraphs(risk, sources.length)}</p>` : ''}
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
        ? `<ul>${whatToWatch.signals.map((s: string) => `<li>${replaceCitations(esc(s), sources.length)}</li>`).join('')}</ul>`
        : ''}
      ${whatToWatch.whatWouldChangeMind ? `<p class="change-mind"><span class="chain-label">What would change our mind:</span> ${renderParagraphs(String(whatToWatch.whatWouldChangeMind), sources.length)}</p>` : ''}
      ${whatToWatch.horizonCheck ? `<p class="horizon"><span class="chain-label">Revisit by:</span> ${replaceCitations(esc(String(whatToWatch.horizonCheck)), sources.length)}</p>` : ''}
    </section>`
    : '';

  // ── Evidence assessment as structured section ──
  const evidenceAssessment = analysis.evidenceAssessment as any;
  const evidenceHtml = evidenceAssessment
    ? `<section class="nx-block evidence-assessment">
      <p class="nx-eyebrow">Evidence assessment</p>
      ${Array.isArray(evidenceAssessment.strongestLinks) && evidenceAssessment.strongestLinks.length > 0
        ? `<div><p style="font-weight:600;margin-bottom:4px;">Strongest links</p><ul>${evidenceAssessment.strongestLinks.map((l: string) => `<li>${replaceCitations(esc(l), sources.length)}</li>`).join('')}</ul></div>`
        : ''}
      ${evidenceAssessment.weakestLink ? `<p class="weakest-link"><span class="chain-label">Weakest link:</span> ${renderParagraphs(String(evidenceAssessment.weakestLink), sources.length)}</p>` : ''}
      ${Array.isArray(evidenceAssessment.gaps) && evidenceAssessment.gaps.length > 0
        ? `<div><p style="font-weight:600;margin-bottom:4px;">Evidence gaps</p><ul>${evidenceAssessment.gaps.map((g: string) => `<li>${esc(g)}</li>`).join('')}</ul></div>`
        : ''}
      ${evidenceAssessment.sourceDiversity ? `<p class="source-diversity"><span class="chain-label">Source diversity:</span> ${renderParagraphs(String(evidenceAssessment.sourceDiversity), sources.length)}</p>` : ''}
    </section>`
    : '';

  // ── Key findings as structured section ──
  const keyFindings = (analysis.keyFindings as string[]) || [];
  const keyFindingsHtml = keyFindings.length > 0
    ? `<section class="nx-block key-findings">
      <p class="nx-eyebrow">Key findings</p>
      <ul>${keyFindings.map((f) => `<li>${replaceCitations(esc(f), sources.length)}</li>`).join('')}</ul>
    </section>`
    : '';

  // ── Build structured body: verdict first, then chain, then sections ──
  const verdictText = String(analysis.verdict || position.verdict || '');
  const throughLine = String(analysis.throughLine || '');
  const anchoringBasis = String(analysis.anchoringBasis || '');

  const bodyHtml = [
    // Verdict first — no section header
    verdictText ? `<section class="nx-block verdict"><p class="nx-eyebrow">Institute position</p><div class="verdict-block">${renderParagraphs(verdictText, sources.length)}</div></section>` : '',
    // Through line as a lead paragraph
    throughLine ? `<p class="through-line" style="font-size:1.1em;font-weight:500;color:var(--muted);margin:1.5em 0">${replaceCitations(esc(throughLine), sources.length)}</p>` : '',
    // Anchoring basis
    anchoringBasis ? `<section class="nx-block anchoring"><p class="nx-eyebrow">Anchoring basis</p><div class="verdict-block">${renderParagraphs(anchoringBasis, sources.length)}</div></section>` : '',
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
  <title>${esc(title)}</title>
  ${CSS}
</head>
<body>
  <article class="nomosx-brief">
    <h1>${esc(title)}</h1>
    <div class="brief-meta">${esc(metaLine)}</div>

    <section class="nx-block detected-subject-block">
      <p class="nx-eyebrow">Detected subject</p>
      <p class="detected-subject">${esc(detectedReason)}</p>
    </section>

    <section class="nx-block dedicated-team-block">
      <p class="nx-eyebrow">Dedicated team</p>
      <div class="dedicated-team">${teamHtml}</div>
    </section>

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
  </article>
</body>
</html>`;
}
