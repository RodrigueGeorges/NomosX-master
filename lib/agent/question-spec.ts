/**
 * QUESTION SPEC — Lot 1 "question link".
 *
 * A forecast note must publish a probability ON THE QUESTION ASKED, not on
 * a scenario the swarm happened to like. This module operationalizes the
 * research question into a resolvable statement (metric, data source,
 * threshold, horizon) that the swarm votes on as pseudo-link QUESTION_LINK_ID,
 * and later checks whether a corpus-derived thesis actually answers it —
 * the v10 failure mode (thesis on costs, question on 2030 emissions).
 *
 * Everything degrades gracefully: no spec → no question ballot, no
 * substitution check. A flake never fabricates a HOLD.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { captureInput } from './frozen-inputs';

/** Pseudo linkId carrying the operationalized question through the swarm.
 *  Not a causal-chain link: the elector never conditions on it, the binary
 *  gate excludes it from per-link health. */
export const QUESTION_LINK_ID = 0;

export interface QuestionSpec {
  /** Falsifiable resolution statement — what "yes" means, observable. */
  resolution: string;
  metric?: string;
  dataSource?: string;
  threshold?: string;
  horizon?: string;
  /** False when the question cannot be resolved by observable data
   *  (purely normative/definitional). The note may still publish, but no
   *  question probability is claimed. */
  resolvable: boolean;
  costUsd?: number;
}

const SPEC_SYSTEM = `You operationalize research questions for a forecasting desk.
Given a question, output strict JSON:
{"resolution":"<one falsifiable statement: what observable outcome would make the answer YES>","metric":"<the quantity measured, or empty>","dataSource":"<the authoritative data source expected to resolve it, or empty>","threshold":"<the numeric/qualitative threshold, or empty>","horizon":"<the date/period the resolution is checked at, or empty>","resolvable":true|false}

Rules:
- resolution must be checkable against public data by a third party — never "depends on politics".
- resolvable=false ONLY when no observable resolution exists (e.g. "what is the meaning of…").
- Keep the question's own entities, numbers and dates. Do not broaden or narrow the mandate.`;

/**
 * One bounded call → operationalized question, or null on any failure.
 * Frozen via captureInput so record/replay serves the same spec.
 */
export async function extractQuestionSpec(
  question: string,
  horizonHint?: string,
): Promise<QuestionSpec | null> {
  try {
    const raw = await captureInput('question:spec', async () => {
      const res = await callLLM({
        task: 'query_reformulation',
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 500,
        maxCostUsd: 0.01,
        messages: [
          { role: 'system', content: SPEC_SYSTEM },
          {
            role: 'user',
            content: `QUESTION: ${question}${horizonHint ? `\nSTATED HORIZON: ${horizonHint}` : ''}`,
          },
        ],
      });
      return res;
    });
    const content = typeof raw === 'string' ? raw : String((raw as { content?: string })?.content ?? '');
    const parsed = parseJson<Partial<QuestionSpec>>(content) ?? {};
    const resolution = typeof parsed.resolution === 'string' ? parsed.resolution.trim() : '';
    if (resolution.length < 20 || resolution.length > 800) return null;
    return {
      resolution,
      metric: typeof parsed.metric === 'string' ? parsed.metric.slice(0, 200) : undefined,
      dataSource: typeof parsed.dataSource === 'string' ? parsed.dataSource.slice(0, 200) : undefined,
      threshold: typeof parsed.threshold === 'string' ? parsed.threshold.slice(0, 200) : undefined,
      horizon: typeof parsed.horizon === 'string' ? parsed.horizon.slice(0, 120) : horizonHint || undefined,
      resolvable: parsed.resolvable !== false,
      costUsd: typeof (raw as { costUsd?: number })?.costUsd === 'number' ? (raw as { costUsd?: number }).costUsd : undefined,
    };
  } catch (err) {
    console.warn('[QuestionSpec] extraction failed (non-blocking):', err);
    return null;
  }
}

export interface QuestionSubstitution {
  /** True → the note answers a different question than the one asked. */
  substituted: boolean;
  reason: string;
  costUsd?: number;
}

/**
 * Does the shipped thesis answer the operationalized question?
 * Runs ONLY for corpus-derived theses (registered hypotheses answered by
 * construction) and only when a resolvable spec exists. Returns null on
 * any failure — an unavailable check is telemetry, never a fabricated
 * substitution verdict.
 */
export async function checkQuestionSubstitution(input: {
  question: string;
  spec: QuestionSpec | null | undefined;
  verdict: string;
  throughLine?: string;
}): Promise<QuestionSubstitution | null> {
  const { question, spec, verdict, throughLine } = input;
  // spec may be absent (extraction flake, regen without arbiter-foresight) —
  // run-11 crashed here on `spec.resolvable` when the caller's `?.` guard
  // passed undefined through (`undefined !== false` is true).
  if (!spec?.resolvable || verdict.trim().length < 20) return null;
  try {
    const res = await captureInput('question:answered', async () => {
      const r = await callLLM({
        task: 'fact_check',
        jsonMode: true,
        temperature: 0.1,
        maxTokens: 400,
        maxCostUsd: 0.01,
        messages: [
          {
            role: 'system',
            content: `You check whether a research note answers the question it was asked.
Output strict JSON: {"answers":true|false,"reason":"<one sentence>"}
answers=false when EITHER:
- the note's central claim addresses a materially different question (different metric, different outcome, different horizon) — topically adjacent is NOT substitution; OR
- the note never commits to a position on the asked outcome — a purely descriptive backdrop ("the transition does not follow a uniform trajectory") that states no probability, likelihood, forecast or explicit stance on the resolution is a SUBSTITUTED thesis, not an answer. A forecast note's thesis IS "P(resolution)=x because [engines]" — descriptive scene-setting alone does not answer "will X happen".
Partial but honest answers still count as answers=true — the stance may be "unlikely", "too close to call", or a wide interval; what matters is that the note TAKES a position on the asked outcome.`,
          },
          {
            role: 'user',
            content: `QUESTION ASKED: ${question}\n\nOPERATIONALIZED RESOLUTION: ${spec.resolution}\n\nNOTE'S CENTRAL CLAIM (verdict):\n${verdict.slice(0, 2500)}\n\nTHROUGH-LINE: ${String(throughLine ?? '').slice(0, 800)}`,
          },
        ],
      });
      return r;
    });
    const content = typeof res === 'string' ? res : String((res as { content?: string })?.content ?? '');
    const parsed = parseJson<{ answers?: boolean; reason?: string }>(content);
    if (typeof parsed?.answers !== 'boolean') return null;
    return {
      substituted: !parsed.answers,
      reason: String(parsed.reason ?? '').slice(0, 300),
      costUsd: typeof (res as { costUsd?: number })?.costUsd === 'number' ? (res as { costUsd?: number }).costUsd : undefined,
    };
  } catch (err) {
    console.warn('[QuestionSpec] substitution check failed (non-blocking):', err);
    return null;
  }
}
