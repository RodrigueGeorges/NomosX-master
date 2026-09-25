/**
 * Scenario Architect — the Shell method, made structural.
 *
 * The classic failure mode of LLM scenarios: three variants of the same
 * future (optimistic/base/pessimistic on one implicit dimension). Shell's
 * method avoids this by construction:
 *
 *   1. PREDETERMINED ELEMENTS — what is already certain ("it has rained in
 *      the mountains, so it will flood in the plains"). These belong in
 *      EVERY scenario and must not be treated as uncertainties.
 *   2. CRITICAL UNCERTAINTIES — exactly two axes, each high-impact AND
 *      genuinely unresolved. The 2×2 crossing produces structurally
 *      DIFFERENT futures, not shades of the same one.
 *   3. A WILDCARD — one surprising-but-plausible scenario outside the
 *      matrix's expected quadrants (Shell always includes one).
 *   4. SIGNATURE MOMENTS — a concrete scene from inside each future that
 *      makes it vivid ("a vignette, not a variable").
 *
 * This module produces the ARCHITECTURE (skeleton). The editorial arbiter
 * then writes the full narratives on this scaffold — separating structure
 * from prose is what keeps the scenarios from collapsing into mush.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

export interface CriticalUncertainty {
  /** Short axis name, e.g. "Alliance cohesion" */
  name: string;
  /** One pole, e.g. "NATO holds and integrates" */
  poleA: string;
  /** Opposite pole, e.g. "Transactional fragmentation" */
  poleB: string;
}

export interface ScenarioSkeleton {
  name: string;
  /** Position on the two axes, e.g. "Axis1-poleA × Axis2-poleB" or "wildcard" */
  axisPosition: string;
  /** The core tension this scenario dramatizes — one sentence */
  coreTension: string;
  isWildcard?: boolean;
}

export interface ScenarioArchitecture {
  /** Certainties that hold in every scenario — the "rained in the mountains" facts */
  predeterminedElements: string[];
  /** Exactly two axes structuring the matrix */
  criticalUncertainties: CriticalUncertainty[];
  /** 3-4 scenario skeletons covering the matrix + optionally one wildcard */
  skeletons: ScenarioSkeleton[];
  costUsd: number;
}

const ARCHITECT_PROMPT = `You are a scenario architect trained in the Shell/GBN method (Pierre Wack, Peter Schwartz). Your job is to design the STRUCTURE of a scenario set — not to write the scenarios.

RESEARCH QUESTION:
{QUESTION}

WHAT THE ANALYSIS FOUND (key claims):
{ANALYSIS}

EVIDENCE BASE (titles):
{SOURCES}

METHOD — follow strictly:

1. PREDETERMINED ELEMENTS (3-5): facts already locked in — demographic curves, signed treaties, deployed capital, exhausted resources, ratified technologies. These are the "it has rained in the mountains" elements: whatever scenario unfolds, these will be true. NOT trends that could reverse — only near-certainties.

2. CRITICAL UNCERTAINTIES (exactly 2): the two factors that are BOTH high-impact AND genuinely unresolved. A factor that is important but predictable is NOT an uncertainty — it belongs in predetermined elements. Each axis gets two poles (named as short phrases).

3. SCENARIO SKELETONS (3-4): scenarios produced by CROSSING the two axes. Each skeleton must occupy a different quadrant — if two skeletons sit in the same quadrant, one of them is redundant; fix it. Give each an evocative name (not "Scenario A") and state its core tension in one sentence. Optionally include ONE wildcard: a surprising-but-plausible future the matrix doesn't cleanly contain (mark isWildcard: true).

RULES:
- The axes must be about DIFFERENT things (not two formulations of the same uncertainty).
- Scenario names must be evocative and distinct in KIND, not degree. "Fragmented Stalemate" vs "Managed Decoupling" vs "The Wild East" — not "Optimistic"/"Base"/"Pessimistic".
- Do not assign probabilities — that is the arbiter's job.

Return JSON:
{
  "predeterminedElements": ["...", "..."],
  "criticalUncertainties": [
    { "name": "axis name", "poleA": "one extreme", "poleB": "opposite extreme" },
    { "name": "axis name", "poleA": "one extreme", "poleB": "opposite extreme" }
  ],
  "skeletons": [
    { "name": "Evocative Name", "axisPosition": "Axis1-poleA × Axis2-poleB", "coreTension": "one sentence" }
  ]
}`;

/**
 * Design the scenario matrix for a question. Returns null on failure —
 * the arbiter falls back to unstructured scenario generation.
 */
export async function architectScenarioMatrix(
  question: string,
  analysisSummary: string,
  sourceTitles: string[],
): Promise<ScenarioArchitecture | null> {
  const prompt = ARCHITECT_PROMPT
    .replace('{QUESTION}', question.slice(0, 500))
    .replace('{ANALYSIS}', analysisSummary.slice(0, 3000))
    .replace('{SOURCES}', sourceTitles.slice(0, 15).map((t, i) => `${i + 1}. ${t}`).join('\n'));

  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      jsonMode: true,
      maxTokens: 1400,
      task: 'strategic_analyst',
    });

    const parsed = parseJson<Partial<ScenarioArchitecture>>(response.content);
    if (!parsed?.criticalUncertainties || parsed.criticalUncertainties.length < 2) {
      return null;
    }

    const uncertainties = parsed.criticalUncertainties
      .filter(u => u.name && u.poleA && u.poleB)
      .slice(0, 2);
    if (uncertainties.length < 2) return null;

    const skeletons = (parsed.skeletons || [])
      .filter(s => s.name && s.axisPosition && s.coreTension)
      .slice(0, 4);
    if (skeletons.length < 2) return null;

    return {
      predeterminedElements: (parsed.predeterminedElements || [])
        .filter(e => typeof e === 'string' && e.length > 15)
        .slice(0, 5),
      criticalUncertainties: uncertainties,
      skeletons,
      costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0,
    };
  } catch (err) {
    console.warn('[ScenarioArchitect] failed (non-blocking):', String(err).slice(0, 80));
    return null;
  }
}

/**
 * Render the architecture as a prompt block for the editorial arbiter.
 */
export function architectureToPromptBlock(arch: ScenarioArchitecture): string {
  const [u1, u2] = arch.criticalUncertainties;
  return [
    'SCENARIO ARCHITECTURE (mandatory scaffold — your scenarios MUST occupy these matrix positions):',
    '',
    'PREDETERMINED ELEMENTS (true in every scenario — weave them into all narratives):',
    ...arch.predeterminedElements.map(e => `- ${e}`),
    '',
    'CRITICAL UNCERTAINTIES (the two axes structuring the futures):',
    `- Axis 1 "${u1.name}": ${u1.poleA} ⟷ ${u1.poleB}`,
    `- Axis 2 "${u2.name}": ${u2.poleA} ⟷ ${u2.poleB}`,
    '',
    'SCENARIO SLOTS (write one narrative per slot; keep the name, honor the axis position and core tension):',
    ...arch.skeletons.map(s =>
      `- "${s.name}" [${s.axisPosition}]${s.isWildcard ? ' WILDCARD' : ''} — ${s.coreTension}`),
    '',
    'For each scenario you must also write a signatureMoment: one concrete, vivid scene observed from inside that future — a headline, a room, a number on a screen — that makes the reader feel what living in that world is like. Max 2 sentences.',
  ].join('\n');
}
