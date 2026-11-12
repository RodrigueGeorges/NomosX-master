/**
 * EDITORIAL ARBITER — Institute position after evidence, debate, and foresight.
 * Output is position-first: verdict + scenario distribution + traceability.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { composeIntelligentStyleGuide } from './style-judge';
import { NOMOS_EDITORIAL_MANIFESTO, NOMOS_WRITING_RULES } from './nomos-voice';
import type { DebateResult } from './debate-agent';
import type {
  CastingResult,
  InstitutePosition,
  ScenarioOutlook,
  EditorialDimension,
} from './editorial-types';
import { collisionLabel, dimensionsFromClassification } from './editorial-types';
import type { TopicClassification } from './topic-classifier';

export interface ArbiterInput {
  question: string;
  classification: TopicClassification;
  casting: CastingResult;
  analysis: Record<string, unknown>;
  sources: Array<{ title?: string; provider?: string; year?: number | null }>;
  debate?: DebateResult | null;
  /** When false, the arbiter runs on the mid-tier reasoning model instead of
   *  the apex model — used when upstream quality signals (critic score,
   *  groundedness) indicate the artifact is unlikely to pass the gates, so
   *  the premium scenario-writing spend would be wasted on a held piece. */
  premium?: boolean;
  /** OT-6: the swarm-elected scenario cell. When present, the arbiter writes
   *  the narrative FOR this branch — it may not change the probability. */
  election?: {
    scenarioId: string;
    probability: number;
    confidenceInterval: [number, number];
    contested: boolean;
    runnerUpId?: string;
    electedName?: string;
    electedDescription?: string;
  } | null;
}

function confidenceLabel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function extractScenariosFromAnalysis(analysis: Record<string, unknown>): ScenarioOutlook[] {
  const raw = analysis.scenarios as Array<Record<string, unknown>> | undefined;
  if (!raw?.length) return [];

  return raw.slice(0, 5).map((s) => ({
    name: String(s.name ?? 'Scenario'),
    probability: String(s.probability ?? s.empiricalProbability ?? '—'),
    description: String(s.description ?? s.implications ?? ''),
    signals: Array.isArray(s.signals) ? s.signals.map(String) : undefined,
    empiricalProbability:
      typeof s.empiricalProbability === 'number'
        ? s.empiricalProbability
        : typeof s._simulation === 'object' && s._simulation
          ? (s._simulation as { empiricalProbability?: number }).empiricalProbability
          : undefined,
  }));
}

function buildFallbackPosition(input: ArbiterInput): InstitutePosition {
  const { question, analysis, debate, casting } = input;
  const scenarios = extractScenariosFromAnalysis(analysis);
  const summary = String(analysis.summary ?? analysis.executiveSummary ?? '');
  const verdict =
    String(analysis.consensus ?? '').slice(0, 500) ||
    debate?.dominantThesis ||
    summary.slice(0, 400) ||
    'Evidence supports a provisional institute view pending further verification.';

  const confidence = debate?.confidenceInDominant ?? 65;

  return {
    headline: casting.collisionSummary || question.slice(0, 120),
    verdict,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    scenarios:
      scenarios.length > 0
        ? scenarios
        : [
            {
              name: 'Base case',
              // OT-cleanup: fixed 50/30 templates removed — an arbiter outage
              // must not fabricate probabilities. '—' parses to undefined
              // downstream, so no invented distribution reaches the gate.
              probability: '—',
              description: verdict.slice(0, 280),
            },
            {
              name: 'Adverse case',
              probability: '—',
              description: debate?.position2?.label ?? 'Material downside if counterevidence dominates.',
            },
          ],
    dominantScenario: scenarios[0]?.name,
    objections: debate?.position2?.arguments?.slice(0, 3).map((a) => a.claim) ?? [],
    whatChangesMind: debate?.whatWouldChangeOurMind?.slice(0, 3) ?? [],
    costUsd: 0,
  };
}

/**
 * Produce the institute position — explicit verdict, not balanced literature review.
 */
export async function editorialArbiter(input: ArbiterInput): Promise<InstitutePosition> {
  const fallback = buildFallbackPosition(input);
  const dimensions = dimensionsFromClassification(input.classification);
  const scenarios = extractScenariosFromAnalysis(input.analysis);

  const sourceList = input.sources
    .slice(0, 12)
    .map((s, i) => `[SRC-${i + 1}] ${s.title ?? 'Source'} (${s.year ?? 'n/a'}, ${s.provider ?? 'unknown'})`)
    .join('\n');

  const scenarioBlock =
    scenarios.length > 0
      ? scenarios.map((s) => `- ${s.name}: ${s.probability} — ${s.description.slice(0, 200)}`).join('\n')
      : 'No structured scenarios — infer 2-3 plausible futures from evidence.';

  const teamBlock = input.casting.team
    .map((t) => `- ${t.role.toUpperCase()}: ${t.domain} — ${t.mandate}`)
    .join('\n');

  try {
    const { guide: style } = await composeIntelligentStyleGuide({
      question: input.question,
      domain: input.classification?.detectedSubject,
      audience: 'policymaker',
      sources: input.sources,
    });

    const { getLatestPrompt } = await import('./self-evolver');
    const evolvedInstructions = await getLatestPrompt('editorial_arbiter', style.promptBlock);

    // ── SCENARIO ARCHITECT (Shell method) — design the uncertainty matrix
    // BEFORE prose. Separating structure from writing is what prevents the
    // classic failure: three shades of the same future. ──
    let architectBlock = '';
    let architectCost = 0;
    let architectResult: import('./scenario-architect').ScenarioArchitecture | null = null;
    try {
      const { architectScenarioMatrix, architectureToPromptBlock } = await import('./scenario-architect');
      architectResult = await architectScenarioMatrix(
        input.question,
        String(input.analysis.verdict ?? input.analysis.summary ?? input.analysis.executiveSummary ?? ''),
        input.sources.map(s => s.title ?? '').filter(Boolean),
      );
      if (architectResult) {
        architectBlock = architectureToPromptBlock(architectResult);
        architectCost = architectResult.costUsd;
        console.log(`[EDITORIAL ARBITER] Scenario architecture: ${architectResult.skeletons.length} slots, axes "${architectResult.criticalUncertainties[0].name}" × "${architectResult.criticalUncertainties[1].name}"`);
      }
    } catch { /* non-blocking — arbiter generates free-form scenarios */ }

    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the editorial arbiter at NomosX — the institute's final decision voice. Voice: ${style.combinedVoice}.

${NOMOS_EDITORIAL_MANIFESTO}

${evolvedInstructions}

ADDITIONAL INSTRUCTIONS (apply strictly):

TONE AND VOICE:
1. WRITE LIKE AN ESSAY, NOT A REPORT — Use flowing prose with varied sentence rhythm. Mix short punchy sentences with longer subordinate clauses. Never write two consecutive sentences of the same length. This is an argument, not a form.
2. NARRATIVE ARC — Structure your output as a story: the problem (why it matters now), the evidence (what we found), the futures (where this goes), the action (what to do). Each section should flow into the next with a transition, not a header break.
3. LITERARY JUDGMENT — Make directional claims. "China's processing dominance will persist" is better than "China's processing dominance may continue." Commit to a position. Express uncertainty through confidence scores and explicit caveats, not through hedging prose.
4. ACTIVE, PRECISE LANGUAGE — "We assess...", "The evidence shows...", "The priority is...", not "It has been suggested..." or "The literature indicates..."
5. PROBLEM FIRST, NOT TOPIC — Open by defining the specific policy problem, not the general issue. "The U.S. lacks tools to protect its mineral supply chains" is a problem; "The geopolitics of critical minerals are shifting" is a topic.
6. B.L.U.F. — In the first 100 words: the problem, the stakes, the finding, the recommended action.
7. ANALYZE, DON'T JUST PRESENT — Explain how the evidence supports the conclusion. Show reasoning, not assertion.
8. CAREFUL CONCLUSIONS — Draw conclusions the data can bear. Do not overstate. Distinguish correlation from causation.
9. SCOPE IS WIDE — Cover geopolitical, institutional, legal, social, technological, and economic dimensions where relevant.
10. EVERY CLAIM needs [SRC-N] citations. Use confidence score to express uncertainty, not hedging prose.
11. AUDIENCE-AWARE — Assume a smart, busy reader with policy expertise but not deep subject-matter expertise.

SCENARIO WRITING (critical):
- Write each scenario as a NARRATIVE PARAGRAPH (80-150 words), not a factual summary.
- Use the future tense and imaginative language: "By 2030,...", "Imagine a world where...", "The alliance has settled into..."
- Tell the reader what LIVING IN that future looks like — the texture, not just the variables.
- Do NOT write "This scenario involves..." or "In this scenario...". Write AS IF you are observing that future.
- The scenario name should be evocative, not clinical: "Fragmented Stalemate" not "Scenario A".
- Signals, drivers, and blockers are separate fields — do not repeat them in the description.

IN BRIEF (new):
- Provide 3-5 bullet points that capture the ESSENCE of the entire analysis.
- A busy reader should understand the whole argument from these bullets alone.
- Each bullet is a complete thought, not a label. "China controls 60-90% of midstream processing and will retain that grip through 2030" not "Chinese dominance".

SECTION TITLES (new):
- Each section title must be an ACTION TITLE — a complete sentence stating the conclusion, not a topic label.
- "The mineral chokepoint no one can bypass" not "Supply Chain Analysis".
- "Decoupling is a fantasy, fragmentation is the reality" not "Market Outlook".
- These titles appear as section headers in the final report.

STYLE-SPECIFIC RECOMMENDATIONS (apply based on the voice above):
- If France Stratégie voice: Use impersonal "il convient de", "il ressort de". Label recommendations as "Orientations". Use cautious qualifiers.
- If Institut Montaigne voice: Use "nous" inclusively. Use direct imperative "il faut", "il est impératif". Structure recommendations as "Objectif N → Proposition N". Make them "actionnables, chiffrées et mesurables".
- If Harvard Kennedy School voice: Include explicit fallback positions ("If the preferred option fails, the fallback is..."). Present options with criteria, not just a single recommendation.
- If CAPS voice: Structure around "Analyser / Agir / Anticiper". Present "futurs possibles" not predictions. Use diplomatic, forward-looking language.
- If McKinsey voice: Lead every recommendation with a number. Use "so what" after each data point.
- If RAND voice: Distinguish findings from conclusions from recommendations. Include limitations explicitly.
- If Chatham House voice: Present options and trade-offs, not single prescriptions. Use "realistic ambition" framing.

${NOMOS_WRITING_RULES}

REMEMBER: The style profile above adapts the TONE. The NomosX DNA above defines the VOICE. The voice is constant; the tone adapts. Never let the style profile override the DNA — a France Stratégie report is still a NomosX report, just with an impersonal French register. A Harvard report is still a NomosX report, just with fallback positions. The DNA (positions not opinions, chaos to nomos, scenarios as narratives, anti-novlangue, skin in the game) is non-negotiable.`,

        },
        {
          role: 'user',
          content: `INQUIRY: ${input.question}

DETECTED COLLISION: ${collisionLabel(dimensions)}
${dimensions.map((d) => `• ${d.label}: ${d.angle}`).join('\n')}

DEDICATED TEAM:
${teamBlock}
FRICTION: ${input.casting.productiveFriction}

ANALYSIS SUMMARY:
${String(input.analysis.verdict ?? input.analysis.summary ?? input.analysis.executiveSummary ?? '').slice(0, 2500)}

THROUGH LINE:
${String(input.analysis.throughLine ?? '').slice(0, 200)}

CAUSAL CHAIN (full typed chain — OT-3: scenarios must derive from THESE links, not a summary):
${Array.isArray(input.analysis.causalChain) ? (input.analysis.causalChain as any[]).slice(0, 15).map((link: any) => `#${link.id} [${link.temporalStatus}]${link.derivesFrom != null ? ` ←#${link.derivesFrom}` : ''} ${link.claim}`).join('\n') : 'N/A'}

DEBATE (if any):
Dominant: ${input.debate?.dominantThesis ?? 'n/a'}
Counter: ${input.debate?.position2?.label ?? 'n/a'}
Confidence in dominant: ${input.debate?.confidenceInDominant ?? 'n/a'}

SCENARIOS:
${scenarioBlock}

${input.election ? `SWARM-ELECTED SCENARIO (computed by independent-voter swarm + Monte Carlo — authoritative, do NOT alter its probability):
- Elected branch: ${input.election.electedName ?? input.election.scenarioId} — p=${(input.election.probability * 100).toFixed(1)}% CI=[${(input.election.confidenceInterval[0] * 100).toFixed(0)}%, ${(input.election.confidenceInterval[1] * 100).toFixed(0)}%]${input.election.contested ? ` CONTESTED — runner-up: ${input.election.runnerUpId ?? 'n/a'}` : ''}
- Branch content: ${input.election.electedDescription ?? ''}
Write the verdict and scenarios AS IF this branch is the central forecast. Present the runner-up (when contested) as the live alternative with the signals that would flip the call. Every probability you write must match the computed values above — never invent new ones.` : ''}

${architectBlock}

SOURCES:
${sourceList}

Return JSON:
{
  "headline": "Short collision headline (A × B style)",
  "lede": "The opening sentence or short paragraph of the piece — ONE striking concrete detail, scene, or number that makes a busy reader stop. Economist discipline: the first sentence must earn the second. Not a summary, not a topic announcement — a hook grounded in the evidence.",
  "inBrief": [
    "3-5 bullets capturing the essence of the entire analysis — each a complete thought with a key finding",
    "Second key point with a specific number or claim",
    "Third key point about the trajectory or recommendation"
  ],
  "sectionTitles": {
    "problem": "Action title for the problem section — a complete sentence stating the core tension",
    "evidence": "Action title for the evidence section — what the data shows",
    "futures": "Action title for the futures section — where this is heading",
    "action": "Action title for the action section — what must be done"
  },
  "verdict": "Institute position — 200-400 words of flowing prose with [SRC-N] citations. State what NomosX believes and why. Write as an argumentative essay paragraph, not a list. Vary sentence length. Use transitions between ideas.",
  "confidence": 0-100,
  "prospectiveFramework": {
    "horizon": "The time frame and why it matters — e.g. 'We look to 2030 because three independent cycles (demographic, technological, geopolitical) converge within that window.'",
    "baseRateContext": "Historical reference class and analogue. What happened in similar situations historically? Cite the base rate with [SRC-N].",
    "fermiDecomposition": "How the question breaks into sub-questions, each estimated independently. Reduces anchoring bias.",
    "predeterminedElements": ["what is already certain in every scenario — locked-in facts (demographics, signed treaties, deployed capital). If an architecture was provided, carry these over verbatim or sharpen them", "..."],
    "criticalUncertainties": [{"name": "axis name", "poleA": "one extreme", "poleB": "opposite extreme"}, {"name": "axis name", "poleA": "...", "poleB": "..."}],
    "keyUncertainties": ["what we don't know that matters", "second key uncertainty", "..."],
    "crossImpactSummary": "How the scenarios interact and constrain each other. If scenario A happens, what happens to B?",
    "snowLeopards": ["underappreciated phenomenon that could have outsized impact", "second snow leopard", "..."],
    "methodologyNote": "Brief note on how probabilities were derived (Delphi, Monte Carlo, base rates, etc.) — 1-2 sentences, italic style."
  },
  "scenarios": [
    {
      "name": "Evocative scenario name (not clinical)",
      "probability": "35%",
      "axisPosition": "Position on the uncertainty matrix, e.g. 'Axis1-poleA × Axis2-poleB' — required if an architecture was provided",
      "signatureMoment": "One vivid concrete scene from INSIDE this future — a headline, a meeting room, a number on a screen. Max 2 sentences. This is what makes the scenario memorable.",
      "isWildcard": false,
      "narrative": "80-150 word NARRATIVE paragraph imagining this future. Write in FUTURE TENSE, as if observing that world from inside it. 'By 2030, the alliance has settled into...' NOT 'This scenario involves...'",
      "description": "Short factual description of the scenario (used if narrative is not available)",
      "keyDrivers": ["what moves probability UP by 10+pp", "second driver"],
      "blockers": ["what moves probability DOWN by 10+pp", "second blocker"],
      "uncertaintyDrivers": ["what makes this scenario uncertain", "second uncertainty"],
      "tippingPoint": "What would tip the probability dramatically — a specific, observable event or threshold",
      "crossImpact": "How this scenario is affected by the other scenarios",
      "signals": ["observable early warning indicator 1", "..."]
    }
  ],
  "dominantScenario": "EXACT name of ONE scenario above: NomosX's central editorial forecast, selected on evidence rather than simulation rank alone",
  "centralScenarioRationale": "Explain why this scenario is our central forecast rather than the strongest alternative, with directly supporting [SRC-N] citations. Distinguish observations from inference. Required.",
  "centralScenarioImplications": ["Concrete consequence of this central forecast for decision-makers", "Second consequence"],
  "objections": ["strongest counter-argument, written as a prose paragraph (2-3 sentences each)", "..."],
  "whatChangesMind": ["falsifiable trigger that would reverse our position", "..."],
  "recommendations": {
    "immediate": ["actionable recommendation for 0-3 months with [SRC-N]", "..."],
    "shortTerm": ["recommendation for 3-12 months", "..."],
    "longTerm": ["recommendation for 1-5 years", "..."],
    "riskMitigation": ["how to mitigate the key risk", "..."]
  }
}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 8000,
      jsonMode: true,
      enableCache: false,
      task: input.premium === false ? 'strategic_analyst' : 'editorial_arbiter',
    });

    const parsed = parseJson<any>(response.content);
    if (!parsed) throw new SyntaxError('Editorial arbiter: failed to parse LLM JSON');
    const conf = Math.max(0, Math.min(100, Number(parsed.confidence) || fallback.confidence));

    const outScenarios: ScenarioOutlook[] = (parsed.scenarios ?? []).slice(0, 5).map((s: ScenarioOutlook) => ({
      name: String(s.name ?? 'Scenario'),
      probability: String(s.probability ?? '—'),
      description: String(s.description ?? ''),
      narrative: s.narrative ? String(s.narrative) : undefined,
      signals: Array.isArray(s.signals) ? s.signals.map(String) : undefined,
      keyDrivers: Array.isArray(s.keyDrivers) ? s.keyDrivers.map(String) : undefined,
      blockers: Array.isArray(s.blockers) ? s.blockers.map(String) : undefined,
      uncertaintyDrivers: Array.isArray(s.uncertaintyDrivers) ? s.uncertaintyDrivers.map(String) : undefined,
      tippingPoint: s.tippingPoint ? String(s.tippingPoint) : undefined,
      crossImpact: s.crossImpact ? String(s.crossImpact) : undefined,
      axisPosition: s.axisPosition ? String(s.axisPosition) : undefined,
      signatureMoment: s.signatureMoment ? String(s.signatureMoment) : undefined,
      isWildcard: s.isWildcard === true ? true : undefined,
    }));

    // Fill in axis positions from the architect skeletons when the arbiter
    // omitted them — keeps the matrix structure visible even on lazy output.
    if (architectResult) {
      for (const s of outScenarios) {
        if (!s.axisPosition) {
          const skel = architectResult.skeletons.find(k =>
            k.name.toLowerCase() === s.name.toLowerCase() ||
            s.name.toLowerCase().includes(k.name.toLowerCase().slice(0, 12))
          );
          if (skel) {
            s.axisPosition = skel.axisPosition;
            if (skel.isWildcard) s.isWildcard = true;
          }
        }
      }
    }

    // ── Prospective Framework (PhD-level foresight architecture) ──
    const pf = parsed.prospectiveFramework;
    const prospectiveFramework = (pf || architectResult) ? {
      horizon: pf?.horizon ? String(pf.horizon) : undefined,
      baseRateContext: pf?.baseRateContext ? String(pf.baseRateContext) : undefined,
      fermiDecomposition: pf?.fermiDecomposition ? String(pf.fermiDecomposition) : undefined,
      // Architect values are the fallback — the matrix is the source of truth
      predeterminedElements: (Array.isArray(pf?.predeterminedElements) && pf.predeterminedElements.length > 0
        ? pf.predeterminedElements.map(String)
        : architectResult?.predeterminedElements),
      criticalUncertainties: (Array.isArray(pf?.criticalUncertainties) && pf.criticalUncertainties.length >= 2
        ? pf.criticalUncertainties.slice(0, 2).map((u: any) => ({ name: String(u.name ?? ''), poleA: String(u.poleA ?? ''), poleB: String(u.poleB ?? '') }))
        : architectResult?.criticalUncertainties),
      keyUncertainties: Array.isArray(pf?.keyUncertainties) ? pf.keyUncertainties.map(String) : undefined,
      crossImpactSummary: pf?.crossImpactSummary ? String(pf.crossImpactSummary) : undefined,
      snowLeopards: Array.isArray(pf?.snowLeopards) ? pf.snowLeopards.map(String) : undefined,
      methodologyNote: pf?.methodologyNote ? String(pf.methodologyNote) : undefined,
    } : undefined;

    // ── OT-6 enforcement: when the swarm elector ran, its distribution is
    // authoritative. Pin the elected branch's probability, rescale the
    // runner-ups proportionally so percentages still sum to 100, and force
    // dominantScenario to the elected branch — the LLM narrates, it does
    // not re-decide. ──
    let dominantScenario = parsed.dominantScenario ? String(parsed.dominantScenario) : undefined;
    if (input.election) {
      const electedName = input.election.electedName ?? input.election.scenarioId;
      const electedPctValue = Math.round(input.election.probability * 100);
      const norm = (s: string) => s.toLowerCase().trim();
      const electedNorm = norm(electedName);
      let elected = outScenarios.find(s =>
        norm(s.name) === electedNorm ||
        electedNorm.includes(norm(s.name)) ||
        norm(s.name).includes(electedNorm.slice(0, 20))
      );
      if (!elected) {
        elected = {
          name: electedName,
          probability: `${electedPctValue}%`,
          description: input.election.electedDescription ?? '',
          empiricalProbability: Math.round(input.election.probability * 10000) / 10000,
        };
        outScenarios.unshift(elected);
      } else {
        elected.probability = `${electedPctValue}%`;
        elected.empiricalProbability = Math.round(input.election.probability * 10000) / 10000;
      }
      elected.confidenceInterval = input.election.confidenceInterval;
      dominantScenario = elected.name;

      // Rescale the remaining scenarios so the set still sums to 100%.
      const parsePct = (p: string) => {
        const m = p.match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : 0;
      };
      const others = outScenarios.filter(s => s !== elected);
      const otherSum = others.reduce((acc, s) => acc + parsePct(s.probability), 0);
      const remaining = Math.max(0, 100 - electedPctValue);
      if (others.length > 0 && otherSum > 0) {
        const scale = remaining / otherSum;
        for (const s of others) {
          s.probability = `${Math.max(1, Math.round(parsePct(s.probability) * scale))}%`;
        }
      } else if (others.length > 0) {
        const each = Math.floor(remaining / others.length);
        others.forEach((s, i) => { s.probability = `${i === others.length - 1 ? remaining - each * (others.length - 1) : each}%`; });
      }
    }

    // ── Delphi foresight: multi-expert scenario calibration ──
    // Skipped entirely when the swarm elector ran — Delphi's job IS
    // probability derivation, and applying its calibrated probabilities
    // would silently overwrite the election (OT-6 violation).
    let delphiCostUsd = 0;
    let delphiMeta: { convergence: number; brierEstimate: number; baseRateAnalysis: string } | undefined;
    if (!input.election && outScenarios.length >= 2 && input.sources.length >= 5) {
      try {
        const { runDelphiForesight } = await import('./foresight-delphi');
        // Build rich evidence snippets — include abstracts when available
        const evidenceSnippets = input.sources
          .slice(0, 20)
          .map((s: any) => {
            const parts = [s.title ?? ''];
            if (s.year) parts.push(`(${s.year})`);
            if (s.provider) parts.push(`— ${s.provider}`);
            // Include abstract snippet if available (truncated)
            const abstract = s.abstract ?? s.raw?.abstract ?? '';
            if (abstract) parts.push(`: ${abstract.slice(0, 200)}`);
            return parts.join(' ');
          });
        const contextStr = String(
          input.analysis.verdict ?? input.analysis.summary ?? input.analysis.executiveSummary ?? input.question
        ).slice(0, 2000);
        const delphiResult = await runDelphiForesight(
          input.question,
          outScenarios.map(s => s.name),
          outScenarios.map(s => s.description),
          evidenceSnippets,
          contextStr
        );
        delphiCostUsd = delphiResult.costUsd;
        delphiMeta = {
          convergence: delphiResult.convergenceScore,
          brierEstimate: delphiResult.brierScoreEstimate,
          baseRateAnalysis: delphiResult.baseRateAnalysis,
        };
        // Apply calibrated probabilities with confidence intervals
        // Use largest remainder rounding so percentages sum to exactly 100
        const delphiProbs = outScenarios.map(s =>
          delphiResult.scenarios.find(d => d.name === s.name)?.calibratedProbability ?? 0
        );
        const { roundPercentages } = await import('./pipeline-foresight');
        const roundedPcts = roundPercentages(delphiProbs);
        for (let si = 0; si < outScenarios.length; si++) {
          const scenario = outScenarios[si];
          const delphiScenario = delphiResult.scenarios.find(d => d.name === scenario.name);
          if (delphiScenario) {
            scenario.probability = `${roundedPcts[si]}%`;
            scenario.empiricalProbability = delphiScenario.calibratedProbability;
            scenario.confidenceInterval = delphiScenario.confidenceInterval;
            scenario.baseRate = delphiScenario.baseRate;
            scenario.calibratedProbability = delphiScenario.calibratedProbability;
            scenario.sensitivityScore = delphiScenario.sensitivityScore;
            scenario.keyDrivers = delphiScenario.keyDrivers;
            scenario.blockers = delphiScenario.blockers;
            // Enrich signals with Delphi-extracted signals
            const delphiSignals = [...delphiScenario.signals];
            if (delphiSignals.length > 0) {
              scenario.signals = delphiSignals.slice(0, 5);
            }
          }
        }
        console.log(`[EDITORIAL ARBITER] Delphi: ${outScenarios.length} scenarios, convergence=${(delphiResult.convergenceScore * 100).toFixed(0)}%, Brier est=${delphiResult.brierScoreEstimate.toFixed(3)}, cost=$${delphiCostUsd.toFixed(4)}`);
      } catch (delphiErr) {
        console.warn('[EDITORIAL ARBITER] Delphi foresight failed (non-blocking):', delphiErr);
      }
    }

    return {
      headline: String(parsed.headline || fallback.headline),
      lede: parsed.lede ? String(parsed.lede).slice(0, 600) : undefined,
      verdict: String(parsed.verdict || fallback.verdict),
      confidence: conf,
      confidenceLabel: confidenceLabel(conf),
      scenarios: outScenarios.length ? outScenarios : fallback.scenarios,
      dominantScenario,
      centralScenarioRationale: typeof parsed.centralScenarioRationale === 'string' ? parsed.centralScenarioRationale : undefined,
      centralScenarioImplications: Array.isArray(parsed.centralScenarioImplications) ? parsed.centralScenarioImplications.map(String).slice(0, 5) : undefined,
      objections: (parsed.objections ?? []).map(String).slice(0, 5),
      whatChangesMind: (parsed.whatChangesMind ?? []).map(String).slice(0, 5),
      recommendations: parsed.recommendations ? {
        immediate: Array.isArray(parsed.recommendations.immediate) ? parsed.recommendations.immediate.map(String).slice(0, 5) : undefined,
        shortTerm: Array.isArray(parsed.recommendations.shortTerm) ? parsed.recommendations.shortTerm.map(String).slice(0, 5) : undefined,
        longTerm: Array.isArray(parsed.recommendations.longTerm) ? parsed.recommendations.longTerm.map(String).slice(0, 5) : undefined,
        riskMitigation: Array.isArray(parsed.recommendations.riskMitigation) ? parsed.recommendations.riskMitigation.map(String).slice(0, 5) : undefined,
      } : undefined,
      inBrief: Array.isArray(parsed.inBrief) ? parsed.inBrief.map(String).slice(0, 5) : undefined,
      sectionTitles: parsed.sectionTitles ? {
        problem: String(parsed.sectionTitles.problem ?? ''),
        evidence: String(parsed.sectionTitles.evidence ?? ''),
        futures: String(parsed.sectionTitles.futures ?? ''),
        action: String(parsed.sectionTitles.action ?? ''),
      } : undefined,
      prospectiveFramework,
      costUsd: response.costUsd + delphiCostUsd + architectCost,
    };
  } catch (err) {
    console.warn('[EDITORIAL ARBITER] failed, using fallback position:', err);
    return fallback;
  }
}
