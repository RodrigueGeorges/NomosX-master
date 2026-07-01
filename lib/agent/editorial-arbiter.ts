/**
 * EDITORIAL ARBITER — Institute position after evidence, debate, and foresight.
 * Output is position-first: verdict + scenario distribution + traceability.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
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
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the editorial arbiter at NomosX — the institute's final decision voice.
You publish a POSITION, not a literature review. Every claim needs [SRC-N] citations.
Be decisive. Acknowledge uncertainty via confidence score, not vague balance.`,
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
${String(input.analysis.summary ?? input.analysis.executiveSummary ?? '').slice(0, 2500)}

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
  "whatChangesMind": ["falsifiable trigger 1", "..."]
}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 2000,
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

    return {
      headline: String(parsed.headline ?? fallback.headline),
      verdict: String(parsed.verdict ?? fallback.verdict),
      confidence: conf,
      confidenceLabel: confidenceLabel(conf),
      scenarios: outScenarios.length ? outScenarios : fallback.scenarios,
      dominantScenario: parsed.dominantScenario ? String(parsed.dominantScenario) : outScenarios[0]?.name,
      objections: (parsed.objections ?? []).map(String).slice(0, 5),
      whatChangesMind: (parsed.whatChangesMind ?? []).map(String).slice(0, 5),
      costUsd: response.costUsd,
    };
  } catch (err) {
    console.warn('[EDITORIAL ARBITER] failed, using fallback position:', err);
    return fallback;
  }
}
