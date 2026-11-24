/**
 * BINARY CRITERIA JUDGE — think-tank final-control grid (Claude review, lot E).
 *
 * Eight yes/no criteria graded ONE BY ONE by an LLM from a DIFFERENT family
 * than the producer (self-preference bias: a judge favors its own family up
 * to ~50% on rubric criteria). Runs in SHADOW mode by default — verdicts are
 * persisted to stats.binaryCriteriaJudge for measurement; enforcement is
 * opt-in via NOMOSX_BINARY_JUDGE=enforce once shadow data justifies it.
 *
 * The deterministic binary-gate (binary-gate.ts) keeps owning the hard
 * evidence checks; this judge grades what only a reader can assess —
 * thesis falsifiability, argument quality, decision usefulness, format.
 */

import { callLLM } from '../llm/unified-llm';
import type { LLMFamily } from '../llm/unified-llm';
import { parseJson } from './json-utils';

export interface CriteriaJudgment {
  id: string;
  label: string;
  passed: boolean;
  reason: string;
}

export interface BinaryJudgeResult {
  criteria: CriteriaJudgment[];
  passedCount: number;
  total: number;
  allPassed: boolean;
  costUsd: number;
  judgeFamily?: string;
  judgeProvider?: string;
  error?: string;
}

export const CRITERIA_LABELS: Record<string, string> = {
  falsifiable_thesis: 'Thesis is a falsifiable, dated claim (not a topic)',
  scenario_probability: 'Central scenario carries a probability and an interval',
  required_elements: 'The mandatory analytical elements are present (base rate, quantitative core, actor map, tipping points, watch indicators, decision consequences)',
  ranked_sources: 'Each substantive section rests on at least one high-authority source',
  counter_evidence: 'Contrary sources are discussed, not merely cited',
  conclusions_bounded: 'Conclusions do not exceed the evidence; projections are labeled',
  decision_ready: 'A decision-maker knows what to do or watch',
  format_style: 'Fixed format and style rules respected',
};

const JUDGE_SYSTEM = `You are a hostile acquisition editor at a top-tier think tank. You grade a finished research note on EIGHT binary criteria — one verdict each, no partial credit, no averages.

Rules:
- Grade ONLY what the text actually contains. If evidence for a criterion is absent, the answer is NO — absence of proof is a fail, not a pass.
- You did not write this note and owe it nothing. Your job is to find the reason to kill it.
- For each criterion output {"id": "<criterion_id>", "pass": true|false, "reason": "<one sentence>"}.
- Output ONLY valid JSON: {"criteria": [...8 objects in the given order...], "overall_note": "<one sentence>"}`;

/** Strip HTML to judgeable prose, bounded to keep the call cheap. */
function htmlToProse(html: string, maxChars = 14000): string {
  const prose = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return prose.length > maxChars ? `${prose.slice(0, maxChars)}…[truncated]` : prose;
}

export async function judgeBinaryCriteria(input: {
  html: string;
  question: string;
  /** Family that produced the note — the judge MUST come from another family. */
  producerFamily?: LLMFamily;
  /** Compact run telemetry the judge may use as context (not as proof). */
  context?: Record<string, unknown>;
  runId?: string;
}): Promise<BinaryJudgeResult | null> {
  const criteriaIds = Object.keys(CRITERIA_LABELS);
  const contextLines = input.context
    ? Object.entries(input.context)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v).slice(0, 300)}`)
        .join('\n')
    : '';

  try {
    const res = await callLLM({
      task: 'fact_check', // verification task → opposite-family routing applies
      producerFamily: input.producerFamily,
      jsonMode: true,
      temperature: 0,
      maxTokens: 1200,
      runId: input.runId,
      traceName: 'binary_criteria_judge',
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        {
          role: 'user',
          content: `RESEARCH QUESTION: ${input.question}\n\n${contextLines ? `RUN TELEMETRY (context only — verify against the text):\n${contextLines}\n\n` : ''}CRITERIA (grade each, in order):\n${criteriaIds.map((id, i) => `${i + 1}. ${id} — ${CRITERIA_LABELS[id]}`).join('\n')}\n\nNOTE TO GRADE:\n${htmlToProse(input.html)}`,
        },
      ],
    });

    const parsed = parseJson(res.content) as { criteria?: Array<{ id?: string; pass?: boolean; reason?: string }>; overall_note?: string } | null;
    const byId = new Map((parsed?.criteria ?? []).map(c => [c.id, c]));
    const criteria: CriteriaJudgment[] = criteriaIds.map(id => {
      const c = byId.get(id);
      return {
        id,
        label: CRITERIA_LABELS[id],
        // Missing/unparseable criterion = fail-closed.
        passed: c?.pass === true,
        reason: typeof c?.reason === 'string' ? c.reason.slice(0, 300) : 'no verdict returned',
      };
    });
    const passedCount = criteria.filter(c => c.passed).length;
    return {
      criteria,
      passedCount,
      total: criteria.length,
      allPassed: passedCount === criteria.length,
      costUsd: res.costUsd ?? 0,
      judgeFamily: res.family,
      judgeProvider: res.provider,
    };
  } catch (err) {
    return {
      criteria: [],
      passedCount: 0,
      total: criteriaIds.length,
      allPassed: false,
      costUsd: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
