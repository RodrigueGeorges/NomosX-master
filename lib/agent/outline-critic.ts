/**
 * Outline Critic — the WebWeaver (ICLR 2026) / AgentDisCo pattern.
 *
 * Mature deep-research systems iterate on the OUTLINE (the structured
 * intermediate representation) before/while writing — not only on the final
 * text. A critic evaluates whether the analysis structure actually covers
 * the question's dimensions, finds missing angles, and emits targeted
 * retrieval queries to fill structural gaps.
 *
 * NomosX flow: analyst → critic (claim-level) → outline-critic (structure-
 * level) → gap-fill loop → render. This complements the claim-level critic:
 * the critic asks "are these claims true?", the outline critic asks
 * "did we even investigate the right things?"
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

export interface OutlineCritique {
  /** 0-100 — how well the analysis structure covers the question */
  coverageScore: number;
  /** Dimensions of the question the analysis never addresses */
  missingDimensions: string[];
  /** Sections present but thin/under-evidenced */
  weakSections: string[];
  /** Targeted search queries to fill structural gaps (≤3) */
  targetedQueries: string[];
  /** One-sentence rationale */
  rationale: string;
  costUsd: number;
}

const OUTLINE_CRITIC_PROMPT = `You are a research director reviewing the STRUCTURE of an analysis — not its prose, not its citations, but whether the investigation covered the right ground.

RESEARCH QUESTION:
{QUESTION}

ANALYSIS STRUCTURE (sections + opening of each):
{OUTLINE}

EVIDENCE BASE: {NSOURCES} sources available.
{REQUIRED_DIMS}
TASK — evaluate structural coverage:
1. Which dimensions of the question does the analysis fail to address? (e.g. a question about "causes AND consequences" where only causes are analyzed)
2. Which sections exist but are thin relative to their importance?
3. What 2-3 targeted search queries would retrieve the missing evidence? Make them specific — name the angle, the region, the mechanism, or the counter-evidence to look for.

Be strict: a coverageScore of 90+ requires every major dimension of the question to be addressed with evidence.

Return JSON:
{
  "coverageScore": 0-100,
  "missingDimensions": ["string"],
  "weakSections": ["string"],
  "targetedQueries": ["string"],
  "rationale": "one sentence"
}`;

/**
 * Summarize an analysis object into a structural outline for the critic.
 * We send section names + openings, not full text — keeps the call cheap
 * and focuses the LLM on coverage, not wording.
 */
function summarizeStructure(analysis: unknown): string {
  const obj = typeof analysis === 'string'
    ? (() => { try { return JSON.parse(analysis); } catch { return { text: analysis }; } })()
    : (analysis as Record<string, unknown>);

  const SKIP = new Set(['_meta', '_deliberationContext', '_harvardCouncil']);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP.has(key) || value == null) continue;
    let preview: string;
    if (typeof value === 'string') {
      preview = value.slice(0, 220);
    } else if (Array.isArray(value)) {
      preview = `${value.length} items — ` + value.slice(0, 2).map(v =>
        typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v).slice(0, 80)
      ).join(' | ');
    } else if (typeof value === 'object') {
      preview = Object.keys(value as object).join(', ').slice(0, 150);
    } else {
      preview = String(value).slice(0, 80);
    }
    lines.push(`• ${key}: ${preview.replace(/\s+/g, ' ')}`);
    if (lines.length >= 25) break;
  }
  return lines.join('\n');
}

/**
 * Critique the analysis outline. Returns null on failure (non-blocking).
 */
export async function critiqueOutline(
  question: string,
  analysis: unknown,
  sourceCount: number,
  requiredDimensions?: string[],
): Promise<OutlineCritique | null> {
  const outline = summarizeStructure(analysis);
  if (outline.length < 100) return null;

  // When the deep planner's decomposition is available, the coverage check is
  // anchored on the plan's branches — deterministic scope contract, not the
  // LLM's guess at what the question requires.
  const requiredBlock = requiredDimensions && requiredDimensions.length > 0
    ? `\nREQUIRED DIMENSIONS (from the research plan — each MUST be addressed):\n${requiredDimensions.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n`
    : '';

  const prompt = OUTLINE_CRITIC_PROMPT
    .replace('{QUESTION}', question.slice(0, 500))
    .replace('{OUTLINE}', outline.slice(0, 4500))
    .replace('{NSOURCES}', String(sourceCount))
    .replace('{REQUIRED_DIMS}', requiredBlock);

  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 900,
      enableCache: true,
      task: 'critique',
    });

    const parsed = parseJson<Partial<OutlineCritique>>(response.content);
    if (!parsed || typeof parsed.coverageScore !== 'number') return null;

    return {
      coverageScore: Math.max(0, Math.min(100, Math.round(parsed.coverageScore))),
      missingDimensions: (parsed.missingDimensions || []).slice(0, 5),
      weakSections: (parsed.weakSections || []).slice(0, 5),
      targetedQueries: (parsed.targetedQueries || [])
        .filter(q => typeof q === 'string' && q.length > 10)
        .slice(0, 3),
      rationale: parsed.rationale || '',
      costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0,
    };
  } catch (err) {
    console.warn('[OutlineCritic] failed (non-blocking):', String(err).slice(0, 80));
    return null;
  }
}
