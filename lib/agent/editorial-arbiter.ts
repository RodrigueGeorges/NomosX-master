/**
 * EDITORIAL ARBITER — Institute position after evidence, debate, and foresight.
 * Output is position-first: verdict + scenario distribution + traceability.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { composeIntelligentStyleGuide } from './style-judge';
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
              probability: '50%',
              description: verdict.slice(0, 280),
            },
            {
              name: 'Adverse case',
              probability: '30%',
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

    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the editorial arbiter at NomosX — the institute's final decision voice. Voice: ${style.combinedVoice}.

${evolvedInstructions}

ADDITIONAL INSTRUCTIONS (apply strictly):
1. PROBLEM FIRST, NOT TOPIC — open by defining the specific policy problem, not the general issue. (HKS rule: "The geopolitics of X are shifting" is an issue; "The U.S. lacks tools to protect Y" is a problem.)
2. B.L.U.F. — in the first 100 words: the problem, the stakes, the finding, the recommended action.
3. ANALYZE, DON'T JUST PRESENT — explain how the evidence supports the conclusion. Show reasoning, not assertion.
4. CAREFUL CONCLUSIONS — draw conclusions the data can bear. Do not overstate or misrepresent. Distinguish correlation from causation.
5. NUANCED BUT ACTIONABLE RECOMMENDATIONS — give a first choice, a fallback, and who should act. Acknowledge trade-offs and counter-arguments.
6. ACTIVE, PRECISE LANGUAGE — "We recommend...", "The priority should be...", not "It has been suggested..." or "The literature indicates..."
7. SCOPE IS WIDE — cover geopolitical, institutional, legal, social, technological, and economic dimensions where relevant; do not reduce everything to economics.
8. EVERY CLAIM needs [SRC-N] citations. Use confidence score to express uncertainty, not hedging prose.
9. CONCISION — one idea per sentence; cut "somewhat", "could perhaps", "might be considered".
10. AUDIENCE-AWARE — assume a smart, busy reader with policy expertise but not deep subject-matter expertise. Avoid jargon and acronyms unless defined.`,

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

CAUSAL CHAIN SUMMARY:
${Array.isArray(input.analysis.causalChain) ? input.analysis.causalChain.slice(0, 5).map((link: any, i: number) => `${i + 1}. ${link.claim} [${link.temporalStatus}]`).join('\n') : 'N/A'}

DEBATE (if any):
Dominant: ${input.debate?.dominantThesis ?? 'n/a'}
Counter: ${input.debate?.position2?.label ?? 'n/a'}
Confidence in dominant: ${input.debate?.confidenceInDominant ?? 'n/a'}

SCENARIOS:
${scenarioBlock}

SOURCES:
${sourceList}

Return JSON:
{
  "headline": "Short collision headline (A × B style)",
  "verdict": "Institute position — 150-300 words with [SRC-N] citations. State what NomosX believes and why.",
  "confidence": 0-100,
  "scenarios": [
    {"name": "...", "probability": "35%", "description": "...", "signals": ["..."]}
  ],
  "dominantScenario": "name of most likely scenario",
  "objections": ["strongest counter-argument 1", "..."],
  "whatChangesMind": ["falsifiable trigger 1", "..."],
  "recommendations": {
    "immediate": ["actionable recommendation for 0-3 months with [SRC-N]", "..."],
    "shortTerm": ["recommendation for 3-12 months", "..."],
    "longTerm": ["recommendation for 1-5 years", "..."],
    "riskMitigation": ["how to mitigate the key risk", "..."]
  }
}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 4000,
      jsonMode: true,
      enableCache: false,
      task: 'editorial_arbiter',
    });

    const parsed = parseJson<any>(response.content);
    if (!parsed) throw new SyntaxError('Editorial arbiter: failed to parse LLM JSON');
    const conf = Math.max(0, Math.min(100, Number(parsed.confidence) || fallback.confidence));

    const outScenarios: ScenarioOutlook[] = (parsed.scenarios ?? []).slice(0, 5).map((s: ScenarioOutlook) => ({
      name: String(s.name ?? 'Scenario'),
      probability: String(s.probability ?? '—'),
      description: String(s.description ?? ''),
      signals: Array.isArray(s.signals) ? s.signals.map(String) : undefined,
    }));

    // ── Delphi foresight: multi-expert scenario calibration ──
    // Professional-grade forecasting: base rates + Fermi decomposition + 3-round Delphi
    // + extremizing + bootstrap CIs + key drivers + sensitivity analysis
    let delphiCostUsd = 0;
    let delphiMeta: { convergence: number; brierEstimate: number; baseRateAnalysis: string } | undefined;
    if (outScenarios.length >= 2 && input.sources.length >= 5) {
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
        for (const scenario of outScenarios) {
          const delphiScenario = delphiResult.scenarios.find(d => d.name === scenario.name);
          if (delphiScenario) {
            const pct = (delphiScenario.calibratedProbability * 100).toFixed(0);
            const ciLow = (delphiScenario.confidenceInterval[0] * 100).toFixed(0);
            const ciHigh = (delphiScenario.confidenceInterval[1] * 100).toFixed(0);
            scenario.probability = `${pct}%`;
            scenario.empiricalProbability = delphiScenario.calibratedProbability;
            // Enrich signals with Delphi-extracted signals + key drivers
            const delphiSignals = [
              ...delphiScenario.signals,
              ...delphiScenario.keyDrivers.slice(0, 2).map(d => `Driver: ${d}`),
            ];
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
      verdict: String(parsed.verdict || fallback.verdict),
      confidence: conf,
      confidenceLabel: confidenceLabel(conf),
      scenarios: outScenarios.length ? outScenarios : fallback.scenarios,
      dominantScenario: parsed.dominantScenario ? String(parsed.dominantScenario) : outScenarios[0]?.name,
      objections: (parsed.objections ?? []).map(String).slice(0, 5),
      whatChangesMind: (parsed.whatChangesMind ?? []).map(String).slice(0, 5),
      recommendations: parsed.recommendations ? {
        immediate: Array.isArray(parsed.recommendations.immediate) ? parsed.recommendations.immediate.map(String).slice(0, 5) : undefined,
        shortTerm: Array.isArray(parsed.recommendations.shortTerm) ? parsed.recommendations.shortTerm.map(String).slice(0, 5) : undefined,
        longTerm: Array.isArray(parsed.recommendations.longTerm) ? parsed.recommendations.longTerm.map(String).slice(0, 5) : undefined,
        riskMitigation: Array.isArray(parsed.recommendations.riskMitigation) ? parsed.recommendations.riskMitigation.map(String).slice(0, 5) : undefined,
      } : undefined,
      costUsd: response.costUsd + delphiCostUsd,
    };
  } catch (err) {
    console.warn('[EDITORIAL ARBITER] failed, using fallback position:', err);
    return fallback;
  }
}
