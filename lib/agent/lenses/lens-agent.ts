/**
 * Lens Agent — gives each search lens its own PhD-level intelligence.
 *
 * A lens is no longer a query template. The lens agent:
 *   1. Receives the question + its knowledge profile + the sources found
 *   2. Judges whether its knowledge suffices (self-assessment)
 *   3. If not, generates targeted fetch queries for ITS providers/canon
 *   4. Produces a lens insight — a mini-analysis in its disciplinary voice
 *
 * Runs one LLM call per lens (bounded), only for strategic/dossier formats.
 */

import { callLLM } from '../../llm/unified-llm';
import { parseJson } from '../json-utils';
import { LENS_KNOWLEDGE, type LensKnowledge } from './lens-knowledge';
import type { LensType, SearchLens } from '../intelligent-scout';
import { CANON } from '../canon/canon-matcher';

export interface LensInsight {
  lensType: LensType;
  /** The lens's own mini-analysis — its disciplinary reading of the question */
  analysis: string;
  /** What the lens found that the mainstream missed */
  keyContribution: string;
  /** Knowledge gaps the lens identified — what it could NOT answer */
  knowledgeGaps: string[];
  /** Canon frameworks the lens recommends applying */
  recommendedCanon: string[];
  /** Extra fetch queries if the lens deemed its knowledge insufficient */
  fetchQueries: string[];
  /** Whether the lens self-assessed its sources as sufficient */
  sufficient: boolean;
  costUsd: number;
}

const LENS_AGENT_PROMPT = `You are the {LENS_NAME} lens — {PERSONA}

METHODOLOGY YOU APPLY:
{METHODOLOGY}

YOUR SIGNATURE QUESTIONS:
{SIGNATURE}

YOUR KNOWN BLIND SPOTS (guard against them):
{BLINDSPOTS}

RESEARCH QUESTION: {QUESTION}

SOURCES YOUR LENS RETRIEVED ({NSOURCES}):
{SOURCES}

CANON WORKS IN YOUR TRADITION (available as interpretive frameworks):
{CANON}

TASK — respond as this lens, in its disciplinary voice:
1. ANALYZE: what does your lens see in these sources that other lenses miss? (3-5 sentences, dense, no filler)
2. KEY CONTRIBUTION: the single most important thing only your lens catches (1 sentence)
3. SELF-ASSESS: is your knowledge sufficient for a doctoral-grade reading? If not, what is missing?
4. If insufficient: produce up to 3 targeted fetch queries that would fill the gap (aim at YOUR field's sources — {PROVIDERS})
5. Recommend up to 2 canon works to apply as interpretive frameworks

Return JSON:
{
  "analysis": "string",
  "keyContribution": "string",
  "knowledgeGaps": ["string"],
  "sufficient": true/false,
  "fetchQueries": ["string"],
  "recommendedCanon": ["canon-id"]
}`;

/**
 * Run the lens agent: apply PhD-level lens intelligence to found sources,
 * self-assess knowledge gaps, and emit fetch queries when insufficient.
 */
export async function runLensAgent(
  lens: SearchLens,
  question: string,
  sources: Array<{ title: string; abstract?: string | null; provider?: string; year?: number | null }>,
): Promise<LensInsight | null> {
  const knowledge = LENS_KNOWLEDGE[lens.type];
  if (!knowledge) return null;

  const canonRefs = knowledge.canonIds
    .map(id => CANON.find(c => c.id === id))
    .filter(Boolean)
    .map(c => `- ${c!.author}, ${c!.work} (${c!.year}) [id: ${c!.id}]\n  ${c!.thesis}`)
    .join('\n');

  const sourceList = sources.length > 0
    ? sources.slice(0, 15).map((s, i) => `${i + 1}. ${s.title}${s.year ? ` (${s.year})` : ''} [${s.provider || '?'}]`).join('\n')
    : '(no sources retrieved — self-fetch is likely needed)';

  const prompt = LENS_AGENT_PROMPT
    .replace('{LENS_NAME}', lens.name)
    .replace('{PERSONA}', knowledge.persona)
    .replace('{METHODOLOGY}', knowledge.methodology)
    .replace('{SIGNATURE}', knowledge.signatureQuestions.map(q => `- ${q}`).join('\n'))
    .replace('{BLINDSPOTS}', knowledge.blindSpots.map(b => `- ${b}`).join('\n'))
    .replace('{QUESTION}', question.slice(0, 500))
    .replace('{NSOURCES}', String(sources.length))
    .replace('{SOURCES}', sourceList)
    .replace('{CANON}', canonRefs || '(none mapped)')
    .replace('{PROVIDERS}', knowledge.preferredProviders.join(', '));

  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 1200,
      enableCache: true,
      task: 'strategic_analyst', // lens agents are analysts, not readers
    });

    const parsed = parseJson<{
      analysis?: string;
      keyContribution?: string;
      knowledgeGaps?: string[];
      sufficient?: boolean;
      fetchQueries?: string[];
      recommendedCanon?: string[];
    }>(response.content);

    if (!parsed?.analysis) return null;

    const needsFetch = sources.length < knowledge.minSourcesForConfidence || parsed.sufficient === false;

    return {
      lensType: lens.type,
      analysis: parsed.analysis,
      keyContribution: parsed.keyContribution || '',
      knowledgeGaps: (parsed.knowledgeGaps || []).slice(0, 3),
      recommendedCanon: (parsed.recommendedCanon || []).filter(id => CANON.some(c => c.id === id)).slice(0, 2),
      fetchQueries: needsFetch ? (parsed.fetchQueries || []).slice(0, 3) : [],
      sufficient: !needsFetch,
      costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0,
    };
  } catch (err) {
    console.warn(`[LensAgent:${lens.type}] failed (non-blocking):`, String(err).slice(0, 80));
    return null;
  }
}

/** Provider set the lens agent may fetch from — its own preferred providers. */
export function lensFetchProviders(lensType: LensType): string[] {
  return LENS_KNOWLEDGE[lensType]?.preferredProviders ?? [];
}

// ============================================================================
// INTER-LENS CONSISTENCY — surface genuine tensions between disciplinary
// readings. Different lenses SHOULD disagree (the ontological lens questions
// the frame the historical lens takes for granted). The failure mode is not
// contradiction — it is contradiction that nobody notices. One bounded LLM
// call, strategic/dossier only.
// ============================================================================

export interface LensTension {
  /** e.g. "historical vs ontological" */
  between: string;
  /** What the disagreement is about */
  tension: string;
  /** Which reading the analyst should weight more, and why */
  resolution: string;
}

const TENSION_PROMPT = `You are reviewing mini-analyses produced by different disciplinary lenses on the same research question. Each lens applies a different methodology — they SHOULD disagree, and those disagreements are analytically valuable.

QUESTION: {QUESTION}

LENS READINGS:
{READINGS}

TASK — identify genuine tensions BETWEEN lenses (not gaps, not noise):
- Two lenses drawing incompatible conclusions from the same evidence
- One lens's core assumption being challenged by another's finding
- Disagreement about what the central mechanism/actor/stakes even is

For each tension: name the lenses, state the disagreement precisely, and advise the synthesis writer which reading deserves more weight and why (or whether both should be presented as a genuine axis of debate).

Return JSON: { "tensions": [{ "between": "lensA vs lensB", "tension": "...", "resolution": "..." }] }
If readings are merely complementary (no real disagreement), return an empty array — do NOT manufacture conflict.`;

/**
 * Detect contradictions between lens insights before they reach the analyst.
 * Returns tensions (≤3) — null on failure or when fewer than 2 insights.
 */
export async function checkLensTensions(
  question: string,
  insights: Array<{ lensType: string; analysis: string; keyContribution: string }>,
): Promise<{ tensions: LensTension[]; costUsd: number } | null> {
  if (insights.length < 2) return null;

  const readings = insights
    .map(i => `### ${i.lensType.toUpperCase()}\n${i.analysis}\nKey contribution: ${i.keyContribution}`)
    .join('\n\n')
    .slice(0, 5000);

  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: TENSION_PROMPT
          .replace('{QUESTION}', question.slice(0, 400))
          .replace('{READINGS}', readings),
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 800,
      enableCache: true,
      task: 'critique',
    });

    const parsed = parseJson<{ tensions?: LensTension[] }>(response.content);
    const tensions = (parsed?.tensions || [])
      .filter(t => t.between && t.tension)
      .slice(0, 3);
    return {
      tensions,
      costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0,
    };
  } catch {
    return null;
  }
}
