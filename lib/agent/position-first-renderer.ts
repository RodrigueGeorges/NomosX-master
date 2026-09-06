/**
 * Position-first brief renderer — Editorial V2 public format.
 *
 * The NomosX DNA: "From Chaos to Nomos" — every report performs the movement
 * from disorder to order. The 4-act structure maps to our method:
 *   I.   The Question   (Map)     — define the question, show the chaos
 *   II.  The Evidence   (Confront)— our position, the evidence, the counter-argument
 *   III. The Futures    (Quantify)— scenarios as narratives, not bullet points
 *   IV.  The Decision   (Decide)  — a position worth defending, with the receipts
 *
 * The voice is NomosX: positions not opinions, confident but not dogmatic,
 * literary but not decorative, anti-novlangue, skin in the game.
 * Style profiles (Montaigne, France Stratégie, Harvard, etc.) adapt the TONE;
 * the DNA is constant.
 *
 * Inspired by: The Economist (prose rhythm), Montaigne (essayistic skepticism),
 * Atlantic Council (narrative scenarios), Isaiah Berlin (metaphorical precision),
 * Raymond Aron (French clarity + Anglo-Saxon rigor).
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

/**
 * Strip ALL citation markers from a string — used for narrative elements
 * that should never contain citations: act titles, through-lines, eyebrows,
 * section labels. These are editorial/narrative voice, not academic claims.
 *
 * Strips both raw [SRC-N] tags and rendered <sup class="cite">...</sup> tags.
 */
function stripCitations(s: string): string {
  return String(s || '')
    // Remove rendered <sup class="cite">...</sup> tags (with optional attributes)
    .replace(/<sup\b[^>]*class="[^"]*cite[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    // Remove raw [SRC-N] tags (single or comma-separated)
    .replace(/\[SRC-\d+(?:\s*,\s*SRC-\d+)*\]/gi, '')
    // Remove (SRC-N, SRC-M) parenthetical citations
    .replace(/\(SRC-\d+(?:\s*,\s*SRC-\d+)*\)/gi, '')
    // Clean up trailing whitespace left by removed citations
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
    // Fix geopolitical abbreviations: "U [SRC-N] S." → "U.S. [SRC-N]"
    .replace(/\bU\s*\[SRC-(\d+)\]\s*S\./g, 'U.S. [SRC-$1]')
    .replace(/\bE\s*\[SRC-(\d+)\]\s*U\./g, 'E.U. [SRC-$1]')
    .replace(/\bU\s*\[SRC-(\d+)\]\s*K\./g, 'U.K. [SRC-$1]')
    .replace(/\bU\s*\[SRC-(\d+)\]\s*N\./g, 'U.N. [SRC-$1]')
    .replace(/\bP\s*\[SRC-(\d+)\]\s*R\./g, 'P.R. [SRC-$1]')
    // General fix: single capital letter + citation + single capital letter + period
    .replace(/\b([A-Z])\s*\[SRC-(\d+)\]\s*([A-Z]\.)/g, '$1$3 [SRC-$2]')
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

/**
 * Render a list of strings as flowing prose instead of bullet points.
 * Each item becomes a sentence in a paragraph, connected by transitions.
 * Falls back to bullets if items are too short for prose.
 */
function renderAsProse(items: string[], sourceCount?: number): string {
  if (!items || items.length === 0) return '';
  // If items are long enough (60+ chars), render as connected prose
  const longItems = items.filter(i => i.length > 60);
  if (longItems.length >= 2) {
    const rendered = items.map(item => replaceCitations(esc(item), sourceCount));
    return `<p>${rendered.join(' ')}</p>`;
  }
  // Short items — keep as bullets
  return `<ul>${items.map((item) => `<li>${replaceCitations(esc(item), sourceCount)}</li>`).join('')}</ul>`;
}

const CSS = `<style>${POSITION_FIRST_BRIEF_CSS}</style>`;

export function renderPositionFirstBriefHTML(input: PositionFirstBriefInput): string {
  const { question, classification, casting, position, analysis, sources, isStrategic } = input;
  const dimensions = dimensionsFromClassification(classification);
  const collision = collisionLabel(dimensions);
  const apaCitations = sources.map((s, i) => formatAPA(s, i + 1));
  const title = String(analysis.title ?? position.headline ?? question);
  const detectedReason = classification.detectedSubject ?? classification.reasoning ?? question;

  // ── Style-adaptive labels ──
  // Different think tank styles use different vocabulary for the same sections.
  const style = input.styleProfile ?? 'default';
  const LABELS: Record<string, Record<string, string>> = {
    default: {
      inBrief: 'The Position', problem: 'The Question', lenses: 'The Lenses',
      judgment: 'Our Position', whyBelieve: 'The Evidence', howWeGotHere: 'The Logic',
      howStrong: 'Confidence and Limits', threeFutures: 'Three Futures', roadAhead: 'The Trajectory',
      dismissed: 'What We Ruled Out', watchFor: 'Signals to Watch',
      action: 'The Decision', counterArg: 'The Strongest Objection', changeMind: 'What Would Change Our Position',
    },
    montaigne: {
      inBrief: 'En bref', problem: 'La question', lenses: 'Lentilles analytiques',
      judgment: 'Notre jugement', whyBelieve: 'Pourquoi nous le croyons', howWeGotHere: 'Comment on en est arrivé là',
      howStrong: 'La solidité de notre analyse', threeFutures: 'Trois futurs', roadAhead: 'La route ahead',
      dismissed: 'Ce que nous avons écarté', watchFor: 'Ce qu\'il faut surveiller',
      action: 'Que faire', counterArg: 'Le meilleur contre-argument', changeMind: 'Ce qui changerait notre avis',
    },
    'france-strategie': {
      inBrief: 'En bref', problem: 'La question', lenses: 'Lentilles d\'analyse',
      judgment: 'Notre position', whyBelieve: 'Le fondement de notre analyse', howWeGotHere: 'La chaîne causale',
      howStrong: 'Confiance et limites', threeFutures: 'Scénarios prospectifs', roadAhead: 'Trajectoire',
      dismissed: 'Hypothèses écartées', watchFor: 'Signaux à surveiller',
      action: 'Orientations', counterArg: 'La principale objection', changeMind: 'Ce qui infirmerait notre analyse',
    },
    mckinsey: {
      inBrief: 'In brief', problem: 'The problem', lenses: 'Analytical lenses',
      judgment: 'The core finding', whyBelieve: 'The evidence base', howWeGotHere: 'The causal mechanism',
      howStrong: 'Evidence quality', threeFutures: 'Scenario analysis', roadAhead: 'The outlook',
      dismissed: 'Alternatives considered', watchFor: 'Signals to monitor',
      action: 'Imperatives for leaders', counterArg: 'The strongest counter-argument', changeMind: 'What would change our view',
    },
    rand: {
      inBrief: 'Key findings', problem: 'Research question', lenses: 'Analytical approach',
      judgment: 'Our assessment', whyBelieve: 'Evidence and reasoning', howWeGotHere: 'Causal analysis',
      howStrong: 'Confidence and limitations', threeFutures: 'Plausible futures', roadAhead: 'Projections',
      dismissed: 'Alternative hypotheses', watchFor: 'Indicators to track',
      action: 'Recommendations', counterArg: 'Counter-arguments', changeMind: 'Conditions that would alter our conclusions',
    },
    chatham: {
      inBrief: 'In brief', problem: 'The strategic context', lenses: 'Analytical lenses',
      judgment: 'Our assessment', whyBelieve: 'The evidence', howWeGotHere: 'The mechanism',
      howStrong: 'Confidence and gaps', threeFutures: 'Long-term scenarios', roadAhead: 'The trajectory',
      dismissed: 'Alternatives weighed', watchFor: 'What to watch',
      action: 'Options and trade-offs', counterArg: 'The counter-argument', changeMind: 'What would change our assessment',
    },
    harvard: {
      inBrief: 'Bottom line', problem: 'The problem', lenses: 'Analytical lenses',
      judgment: 'Recommendation', whyBelieve: 'The case', howWeGotHere: 'The logic',
      howStrong: 'Confidence level', threeFutures: 'Scenario analysis', roadAhead: 'Projection',
      dismissed: 'Options rejected', watchFor: 'Decision triggers',
      action: 'Next steps', counterArg: 'The counter-argument', changeMind: 'What would change this recommendation',
    },
    caps: {
      inBrief: 'Synthèse', problem: 'Analyser', lenses: 'Lentilles d\'analyse',
      judgment: 'Notre lecture', whyBelieve: 'Le raisonnement', howWeGotHere: 'La chaîne causale',
      howStrong: 'Confiance et limites', threeFutures: 'Futurs possibles', roadAhead: 'Trajectoire',
      dismissed: 'Hypothèses écartées', watchFor: 'Signaux à surveiller',
      action: 'Agir', counterArg: 'Le contre-argument', changeMind: 'Ce qui infirmerait notre analyse',
    },
  };
  const L = LABELS[style] ?? LABELS.default;

  // ── Format badge + minimal metadata line ──
  const providers = [...new Set(sources.map((s) => s.provider).filter(Boolean))];
  const publicationType = isStrategic ? 'STRATEGIC_REPORT' : 'ARTICLE';
  const fmt = getPublicationFormat(publicationType);
  const formatBadgeHtml = `<span class="format-badge" title="${esc(fmt.description)}">${esc(fmt.label)}</span>`;
  const metaLine = `${formatBadgeHtml} ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ${sources.length} sources · ${providers.length} providers · Confidence: ${position.confidence}/100`;

  // ── Action titles (from arbiter, with fallbacks) ──
  // Strip citations from titles — they are narrative acts, not academic claims.
  const titles = position.sectionTitles ?? {};
  const problemTitle = stripCitations(titles.problem || 'The question');
  const evidenceTitle = stripCitations(titles.evidence || 'The assessment');
  const futuresTitle = stripCitations(titles.futures || 'What comes next');
  const actionTitle = stripCitations(titles.action || 'What should be done');

  // ── In Brief (McKinsey-style 3-5 bullets at the top) ──
  const inBrief = position.inBrief ?? [];
  const inBriefHtml = inBrief.length > 0
    ? `<section class="nx-block in-brief">
  <p class="nx-eyebrow">${esc(L.inBrief)}</p>
  <ul class="in-brief-list">${inBrief.map((b) => `<li>${replaceCitations(esc(b), sources.length)}</li>`).join('')}</ul>
</section>`
    : '';

  // ── Structured policy recommendations ──
  const recommendations = position.recommendations ?? (analysis as Record<string, unknown>).recommendations as Record<string, unknown> | undefined;
  const immediateRecs = Array.isArray(recommendations?.immediate) ? (recommendations!.immediate as string[]) : [];
  const shortTermRecs = Array.isArray(recommendations?.shortTerm) ? (recommendations!.shortTerm as string[]) : [];
  const longTermRecs = Array.isArray(recommendations?.longTerm) ? (recommendations!.longTerm as string[]) : [];
  const riskMitigation = Array.isArray(recommendations?.riskMitigation) ? (recommendations!.riskMitigation as string[]) : [];

  const hasRecs = immediateRecs.length > 0 || shortTermRecs.length > 0 || longTermRecs.length > 0 || riskMitigation.length > 0;
  const recommendationsHtml = hasRecs ? `
<section class="nx-block recommendations">
  ${immediateRecs.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:var(--text,#222);margin-bottom:4px;">Immediate (0–3 months)</p>
    ${renderAsProse(immediateRecs, sources.length)}
  </div>` : ''}
  ${shortTermRecs.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:var(--text,#222);margin-bottom:4px;">Short-term (3–12 months)</p>
    ${renderAsProse(shortTermRecs, sources.length)}
  </div>` : ''}
  ${longTermRecs.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:var(--text,#222);margin-bottom:4px;">Long-term (1–5 years)</p>
    ${renderAsProse(longTermRecs, sources.length)}
  </div>` : ''}
  ${riskMitigation.length > 0 ? `
  <div style="margin:12px 0;">
    <p style="font-weight:600;color:#c0392b;margin-bottom:4px;">Risk mitigation</p>
    ${renderAsProse(riskMitigation, sources.length)}
  </div>` : ''}
</section>` : '';

  // ── Team (compact, integrated into Act I) ──
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

  // ── Scenarios (narrative format — Act III) ──
  const scenariosHtml = position.scenarios
    .map(
      (s) => {
        const signalsHtml = s.signals && s.signals.length > 0
          ? `<div class="scenario-signals"><span class="signal-label">Signals to watch:</span> ${s.signals.map(sig => `<span class="signal-tag">${esc(sig)}</span>`).join('')}</div>`
          : '';

        // Delphi foresight metrics (sidebar/footer, not mid-text)
        const metaParts: string[] = [];
        if (s.confidenceInterval && Array.isArray(s.confidenceInterval)) {
          metaParts.push(`<span>90% CI: [${Math.round(s.confidenceInterval[0] * 100)}%, ${Math.round(s.confidenceInterval[1] * 100)}%]</span>`);
        }
        if (typeof s.baseRate === 'number') {
          metaParts.push(`<span>Base rate: ${Math.round(s.baseRate * 100)}%</span>`);
        }
        if (typeof s.calibratedProbability === 'number') {
          metaParts.push(`<span>Calibrated: ${Math.round(s.calibratedProbability * 100)}%</span>`);
        }
        if (typeof s.sensitivityScore === 'number') {
          const label = s.sensitivityScore < 0.3 ? 'robust' : s.sensitivityScore < 0.6 ? 'moderate' : 'fragile';
          metaParts.push(`<span>Sensitivity: ${label}</span>`);
        }
        const metaHtml = metaParts.length > 0
          ? `<div class="scenario-meta">${metaParts.join('')}</div>`
          : '';

        const driversHtml = s.keyDrivers && s.keyDrivers.length > 0
          ? `<div class="scenario-drivers"><span class="signal-label">Key drivers:</span> ${s.keyDrivers.map(d => `<span class="driver-tag">${esc(d)}</span>`).join('')}</div>`
          : '';
        const blockersHtml = s.blockers && s.blockers.length > 0
          ? `<div class="scenario-drivers"><span class="signal-label">Blockers:</span> ${s.blockers.map(b => `<span class="blocker-tag">${esc(b)}</span>`).join('')}</div>`
          : '';

        // PhD-level: narrative set in future tense (preferred over description)
        const narrativeHtml = s.narrative
          ? `<div class="scenario-narrative">${renderParagraphs(s.narrative, sources.length)}</div>`
          : '';

        // PhD-level: tipping point
        const tippingHtml = s.tippingPoint
          ? `<p class="scenario-tipping"><span class="chain-label">Tipping point:</span> ${renderParagraphs(s.tippingPoint, sources.length)}</p>`
          : '';

        // PhD-level: uncertainty drivers
        const uncertaintyHtml = s.uncertaintyDrivers && s.uncertaintyDrivers.length > 0
          ? `<div class="scenario-uncertainty"><span class="signal-label">What makes this uncertain:</span> ${s.uncertaintyDrivers.map(u => `<span class="uncertainty-tag">${esc(u)}</span>`).join('')}</div>`
          : '';

        // PhD-level: cross-impact
        const crossImpactHtml = s.crossImpact
          ? `<p class="scenario-cross-impact"><span class="chain-label">Cross-impact:</span> ${renderParagraphs(s.crossImpact, sources.length)}</p>`
          : '';

        return `
    <div class="scenario-row">
      <div class="scenario-head">
        <span class="scenario-name">${esc(s.name)}${position.dominantScenario === s.name ? ' · central' : ''}</span>
        <span class="scenario-prob">${esc(s.probability)}</span>
      </div>
      ${narrativeHtml || `<div class="scenario-desc">${replaceCitations(esc(s.description), sources.length)}</div>`}
      ${metaHtml}
      ${driversHtml}
      ${blockersHtml}
      ${uncertaintyHtml}
      ${tippingHtml}
      ${crossImpactHtml}
      ${signalsHtml}
    </div>`;
      }
    )
    .join('');

  // ── Prospective Framework (PhD-level foresight architecture) ──
  const pf = position.prospectiveFramework;
  const prospectiveFrameworkHtml = pf ? `
    <section class="nx-block prospective-framework">
      <p class="nx-eyebrow">The Foresight Framework</p>
      ${pf.horizon ? `<p class="pf-horizon"><span class="chain-label">Horizon:</span> ${renderParagraphs(pf.horizon, sources.length)}</p>` : ''}
      ${pf.baseRateContext ? `<p class="pf-base-rate"><span class="chain-label">Base rate context:</span> ${renderParagraphs(pf.baseRateContext, sources.length)}</p>` : ''}
      ${pf.fermiDecomposition ? `<p class="pf-fermi"><span class="chain-label">Fermi decomposition:</span> ${renderParagraphs(pf.fermiDecomposition, sources.length)}</p>` : ''}
      ${pf.keyUncertainties && pf.keyUncertainties.length > 0
        ? `<div class="pf-uncertainties"><span class="signal-label">Key uncertainties:</span> ${pf.keyUncertainties.map(u => `<span class="uncertainty-tag">${esc(u)}</span>`).join('')}</div>`
        : ''}
      ${pf.crossImpactSummary ? `<p class="pf-cross-impact"><span class="chain-label">Cross-impact:</span> ${renderParagraphs(pf.crossImpactSummary, sources.length)}</p>` : ''}
      ${pf.snowLeopards && pf.snowLeopards.length > 0
        ? `<div class="pf-snow-leopards"><span class="signal-label">Snow leopards (underappreciated phenomena):</span> ${pf.snowLeopards.map(sl => `<span class="snow-leopard-tag">${esc(sl)}</span>`).join('')}</div>`
        : ''}
      ${pf.methodologyNote ? `<p class="pf-methodology" style="font-size:0.85em;color:var(--muted);font-style:italic;margin-top:0.75rem;">${renderParagraphs(pf.methodologyNote, sources.length)}</p>` : ''}
    </section>` : '';

  // ── Causal chain ──
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
    ? `${renderParagraphs(String(trajectory.state), sources.length)}${renderParagraphs(String(trajectory.assumptions), sources.length)}`
    : '';

  // ── Rejected alternatives ──
  const rejectedAlts = (analysis.rejectedAlternatives as any[]) || [];
  const rejectedHtml = rejectedAlts.length > 0
    ? rejectedAlts.map((ra) => {
        const scenario = String(ra.scenario || '');
        const why = String(ra.whyRejected || '');
        const risk = String(ra.residualRisk || '');
        return `<div class="rejected-alt">
          ${scenario ? `<p class="rejected-scenario">${renderParagraphs(scenario, sources.length)}</p>` : ''}
          ${why ? `<p class="rejected-why"><span class="chain-label">Why rejected:</span> ${renderParagraphs(why, sources.length)}</p>` : ''}
          ${risk ? `<p class="rejected-risk"><span class="chain-label">Residual risk:</span> ${renderParagraphs(risk, sources.length)}</p>` : ''}
        </div>`;
      }).join('\n')
    : '';

  // ── What to watch ──
  const whatToWatch = analysis.whatToWatch as any;
  const watchSignalsHtml = whatToWatch && Array.isArray(whatToWatch.signals) && whatToWatch.signals.length > 0
    ? `<div class="scenario-signals" style="margin-top:0.5rem">${whatToWatch.signals.map((s: string) => `<span class="signal-tag">${replaceCitations(esc(s), sources.length)}</span>`).join('')}</div>`
    : '';
  const watchChangeMindHtml = whatToWatch?.whatWouldChangeMind
    ? `<p class="change-mind" style="margin-top:0.75rem"><span class="chain-label">What would change our mind:</span> ${renderParagraphs(String(whatToWatch.whatWouldChangeMind), sources.length)}</p>`
    : '';
  const watchHorizonHtml = whatToWatch?.horizonCheck
    ? `<p class="horizon" style="margin-top:0.5rem"><span class="chain-label">Revisit by:</span> ${replaceCitations(esc(String(whatToWatch.horizonCheck)), sources.length)}</p>`
    : '';

  // ── Evidence assessment ──
  const evidenceAssessment = analysis.evidenceAssessment as any;
  const evidenceAssessmentHtml = evidenceAssessment
    ? `${Array.isArray(evidenceAssessment.strongestLinks) && evidenceAssessment.strongestLinks.length > 0
        ? `<div style="margin-bottom:0.75rem"><p style="font-weight:600;margin-bottom:4px;">Strongest links</p>${renderAsProse(evidenceAssessment.strongestLinks, sources.length)}</div>`
        : ''}${evidenceAssessment.weakestLink ? `<p class="weakest-link" style="margin-bottom:0.75rem"><span class="chain-label">Weakest link:</span> ${renderParagraphs(String(evidenceAssessment.weakestLink), sources.length)}</p>` : ''}${Array.isArray(evidenceAssessment.gaps) && evidenceAssessment.gaps.length > 0
        ? `<div style="margin-bottom:0.75rem"><p style="font-weight:600;margin-bottom:4px;">Evidence gaps</p>${renderAsProse(evidenceAssessment.gaps)}</div>`
        : ''}${evidenceAssessment.sourceDiversity ? `<p class="source-diversity"><span class="chain-label">Source diversity:</span> ${renderParagraphs(String(evidenceAssessment.sourceDiversity), sources.length)}</p>` : ''}`
    : '';

  // ── Key findings (integrated into In Brief, not separate section) ──

  // ── Verdict and through line ──
  const verdictText = String(analysis.verdict || position.verdict || '');
  const throughLine = String(analysis.throughLine || '');
  const anchoringBasis = String(analysis.anchoringBasis || '');

  // ════════════════════════════════════════════════════════════════════════
  // BUILD 4-ACT NARRATIVE STRUCTURE
  // ════════════════════════════════════════════════════════════════════════

  // ── ACT I: THE QUESTION (Map) ──
  // data-no-cite marks "protected zones" — citation-repair will NEVER inject
  // citations into these elements. They are narrative/editorial voice, not
  // academic claims. This is structural protection, not regex post-processing.
  const actI = `
<section class="nx-act" data-act="1">
  <p class="act-method-label" data-no-cite>Map</p>
  <h2 class="act-title" data-no-cite>${esc(problemTitle)}</h2>
  <section class="nx-block detected-subject-block">
    <p class="nx-eyebrow" data-no-cite>${esc(L.problem)}</p>
    <p class="detected-subject" data-no-cite>${esc(detectedReason)}</p>
  </section>
  <section class="nx-block dedicated-team-block">
    <p class="nx-eyebrow" data-no-cite>${esc(L.lenses)}</p>
    <div class="dedicated-team">${teamHtml}</div>
  </section>
</section>`;

  // ── ACT II: THE EVIDENCE (Confront) ──
  const actIIParts: string[] = [];
  actIIParts.push(`<h2 class="act-title" data-no-cite>${esc(evidenceTitle)}</h2>`);
  if (verdictText) {
    actIIParts.push(`<section class="nx-block verdict"><p class="nx-eyebrow" data-no-cite>${esc(L.judgment)}</p><div class="verdict-block">${renderParagraphs(verdictText, sources.length)}</div></section>`);
  }
  if (throughLine) {
    // Through-line is the editorial voice of NomosX — never contains citations
    actIIParts.push(`<p class="through-line" data-no-cite style="font-size:1.1em;font-weight:500;color:var(--muted);margin:1.5em 0">${esc(stripCitations(throughLine))}</p>`);
  }
  if (anchoringBasis) {
    actIIParts.push(`<section class="nx-block anchoring"><p class="nx-eyebrow" data-no-cite>${esc(L.whyBelieve)}</p><div class="verdict-block">${renderParagraphs(anchoringBasis, sources.length)}</div></section>`);
  }
  if (chainHtml) {
    actIIParts.push(`<section class="nx-block causal-chain"><p class="nx-eyebrow" data-no-cite>${esc(L.howWeGotHere)}</p>${chainHtml}</section>`);
  }
  if (evidenceAssessmentHtml) {
    actIIParts.push(`<section class="nx-block evidence-assessment"><p class="nx-eyebrow" data-no-cite>${esc(L.howStrong)}</p>${evidenceAssessmentHtml}</section>`);
  }
  const actII = `<section class="nx-act" data-act="2"><p class="act-method-label" data-no-cite>Confront</p>${actIIParts.join('\n')}</section>`;

  // Nomos Arc transition: Act II → Act III
  const transitionIItoIII = `<p class="nx-act-transition" data-no-cite style="text-align:center;font-style:italic;color:var(--muted);margin:1.5em 0;font-size:0.95em;">The evidence points to one conclusion. But the future has not yet been written.</p>`;

  // ── ACT III: THE FUTURES (Quantify) — Prospective PhD space ──
  const actIIIParts: string[] = [];
  actIIIParts.push(`<h2 class="act-title" data-no-cite>${esc(futuresTitle)}</h2>`);

  // 1. Foresight Framework (the architecture behind the scenarios)
  if (prospectiveFrameworkHtml) {
    actIIIParts.push(prospectiveFrameworkHtml);
  }

  // 2. The Scenarios (narrative format)
  actIIIParts.push(`<section class="nx-block scenarios-block"><p class="nx-eyebrow" data-no-cite>${esc(L.threeFutures)}</p>${scenariosHtml || '<p class="scenario-desc">Scenario distribution pending further evidence.</p>'}</section>`);

  // 3. The Trajectory (where things are heading)
  if (trajectoryHtml) {
    actIIIParts.push(`<section class="nx-block trajectory"><p class="nx-eyebrow" data-no-cite>${esc(L.roadAhead)}</p>${trajectoryHtml}</section>`);
  }

  // 4. What We Ruled Out (rejected alternatives)
  if (rejectedHtml) {
    actIIIParts.push(`<section class="nx-block rejected-alternatives"><p class="nx-eyebrow" data-no-cite>${esc(L.dismissed)}</p>${rejectedHtml}</section>`);
  }

  // 5. Signals to Watch (early warning indicators)
  if (watchSignalsHtml || watchChangeMindHtml || watchHorizonHtml) {
    actIIIParts.push(`<section class="nx-block what-to-watch"><p class="nx-eyebrow" data-no-cite>${esc(L.watchFor)}</p>${watchSignalsHtml}${watchChangeMindHtml}${watchHorizonHtml}</section>`);
  }
  const actIII = `<section class="nx-act" data-act="3" data-prospective="true"><p class="act-method-label" data-no-cite>Quantify</p>${actIIIParts.join('\n')}</section>`;

  // Nomos Arc transition: Act III → Act IV
  const transitionIIItoIV = `<p class="nx-act-transition" data-no-cite style="text-align:center;font-style:italic;color:var(--muted);margin:1.5em 0;font-size:0.95em;">Three futures, one decision.</p>`;

  // ── ACT IV: THE DECISION (Decide) ──
  const actIVParts: string[] = [];
  actIVParts.push(`<h2 class="act-title" data-no-cite>${esc(actionTitle)}</h2>`);
  if (recommendationsHtml) actIVParts.push(recommendationsHtml);
  if (position.objections.length > 0) actIVParts.push(`<section class="nx-block objections"><p class="nx-eyebrow" data-no-cite>${esc(L.counterArg)}</p>${renderAsProse(position.objections, sources.length)}</section>`);
  if (position.whatChangesMind.length > 0) actIVParts.push(`<section class="nx-block trace"><p class="nx-eyebrow" data-no-cite>${esc(L.changeMind)}</p>${renderAsProse(position.whatChangesMind, sources.length)}</section>`);
  const actIV = `<section class="nx-act" data-act="4"><p class="act-method-label" data-no-cite>Decide</p>${actIVParts.join('\n')}</section>`;

  const rawHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  ${CSS}
</head>
<body>
  <article class="nomosx-brief">
    <h1 data-no-cite>${esc(title)}</h1>
    <div class="brief-meta" data-no-cite>${esc(metaLine)}</div>

    ${inBriefHtml}

    ${actI}
    ${actII}
    ${transitionIItoIII}
    ${actIII}
    ${transitionIIItoIV}
    ${actIV}

    <section class="references-section">
      <h2>Sources</h2>
      ${apaCitations.map((c) => renderAPAHtml(c)).join('\n')}
    </section>

    <footer class="nx-brief-footer" style="margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--border);text-align:center;font-size:0.85em;color:var(--muted);">
      NomosX — From Chaos to Nomos.
    </footer>
  </article>
</body>
</html>`;

  // ── POST-RENDER SAFETY NET ──
  // The primary protection is the data-no-cite attribute, which citation-repair
  // respects during injection (see citation-repair.ts). This post-render pass
  // is a SAFETY NET ONLY — it catches any citations that slipped through via
  // edge cases (e.g., LLM-generated [SRC-N] in titles that the renderer's esc()
  // preserved, or citations injected by other pipeline stages).
  //
  // Strategy: strip ALL <sup> and [SRC-N] from ANY element with data-no-cite.
  // This is tag-agnostic — works for h1, h2, p, div, span, etc.
  return rawHtml.replace(
    /<(\w+)\b([^>]*\bdata-no-cite\b[^>]*)>([\s\S]*?)<\/\1>/gi,
    (m, tag, attrs, inner) => {
      const cleaned = inner
        .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
        .replace(/\[SRC-\d+(?:\s*,\s*SRC-\d+)*\]/gi, '')
        .replace(/\s+([.,;:!?])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return `<${tag}${attrs}>${cleaned}</${tag}>`;
    }
  );
}
