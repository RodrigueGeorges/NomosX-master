/**
 * QUESTION VERIFIERS — P0-A entry gate (FutureSearch-style).
 *
 * Every dispatch candidate must carry a forecastQuestion that survives
 * verification BEFORE any pipeline spend: quality, ambiguity, resolvability
 * (named source + date), difficulty, and an anti-bias check against
 * trivially-false questions ("will X happen on DATE?" whose obvious answer
 * is no). A rejected question abandons the item with its motif recorded —
 * run-11 dispatched knowledge-graph labels as questions and burned $7.05
 * producing substituted theses.
 *
 * One bounded LLM call produces the forecastQuestion AND the check scores;
 * deterministic guards re-verify the shape afterwards. Never fabricates a
 * pass: any failure returns pass=false with motif 'verifier_unavailable' is
 * WRONG — unavailable means skip-with-motif 'verifier_error', distinct from
 * a substantive rejection.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { captureInput } from './frozen-inputs';

export interface QuestionVerification {
  pass: boolean;
  /** Falsifiable forecast question anchored on the signal — what the swarm
   *  prices and the thesis must answer. Null when rejected. */
  forecastQuestion?: string;
  checks: {
    quality: number;        // 0-100 editorial quality of the question
    ambiguity: number;      // 0-1 lower is better-defined
    resolvable: boolean;    // an observable source + date can settle it
    difficulty: number;     // 0-100 — too easy (trivial) or too hard (unresolvable) both fail
    antiBiasRisk: boolean;  // question so specific its obvious answer is "no"
  };
  /** Machine-readable rejection motif for stats — never empty on !pass. */
  motif?: string;
  costUsd?: number;
}

const VERIFY_SYSTEM = `You are the commissioning editor of a forecasting desk. Given a research topic and its news signal, produce ONE falsifiable forecast question and grade it.

Output strict JSON:
{
  "forecastQuestion": "<one falsifiable question a third party could resolve from public data, anchored on the signal — e.g. 'Will renewable capacity reach 50% of global installed capacity by 2030?'>",
  "quality": 0-100,
  "ambiguity": 0.0-1.0,
  "resolvable": true|false,
  "difficulty": 0-100,
  "antiBiasRisk": true|false,
  "verdict": "pass"|"reject",
  "motif": "<short machine motif when verdict=reject, else empty>"
}

Grading rules:
- quality: is this a question worth a forecast note? Vague themes ("the future of X") score <50.
- ambiguity: 0 = perfectly defined metric+actor+horizon; 1 = unanswerable mush.
- resolvable: true ONLY if a named public source and a checkable date exist.
- difficulty: 50 = ideal forecast difficulty; <20 = trivial (already decided news); >85 = cannot be resolved by any foreseeable data.
- antiBiasRisk: true when the question is so hyper-specific that the obvious answer is "no" (e.g. "will country X sign treaty Y on exact date Z") — forecasting "no" on trivia is not analysis.
- verdict=reject with motif in {low_quality, ambiguous, unresolvable, trivial, anti_bias_trivial_no, off_signal} when the topic cannot yield a real forecast question.`;

const MOTIF_RE = /low_quality|ambiguous|unresolvable|trivial|anti_bias|off_signal|verifier_error/;

/**
 * Verify one dispatch candidate BEFORE spend. Returns pass + forecastQuestion
 * on success; pass=false + motif on rejection or verifier failure.
 * Frozen via captureInput('question:verify:<hash>') for record/replay parity.
 */
export async function verifyDispatchQuestion(input: {
  question: string;
  topicTitle?: string;
  signalContext?: string;
}): Promise<QuestionVerification> {
  const { question, topicTitle, signalContext } = input;
  const reject = (motif: string, costUsd?: number): QuestionVerification => ({
    pass: false, checks: { quality: 0, ambiguity: 1, resolvable: false, difficulty: 0, antiBiasRisk: false }, motif, costUsd,
  });
  if (!question || question.trim().length < 15) return reject('low_quality');

  try {
    const raw = await captureInput(`question:verify:${question.slice(0, 120)}`, async () => {
      return callLLM({
        task: 'query_reformulation',
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 600,
        maxCostUsd: 0.015,
        messages: [
          { role: 'system', content: VERIFY_SYSTEM },
          {
            role: 'user',
            content: `RESEARCH QUESTION: ${question}\nTOPIC HEADLINE: ${topicTitle ?? '(none)'}\nSIGNAL CONTEXT: ${signalContext ?? '(none)'}`,
          },
        ],
      });
    });
    const content = typeof raw === 'string' ? raw : String((raw as { content?: string })?.content ?? '');
    const parsed = parseJson<Record<string, unknown>>(content);
    const costUsd = typeof (raw as { costUsd?: number })?.costUsd === 'number' ? (raw as { costUsd?: number }).costUsd : undefined;
    if (!parsed) return reject('verifier_error', costUsd);

    const fq = typeof parsed.forecastQuestion === 'string' ? parsed.forecastQuestion.trim() : '';
    const checks = {
      quality: clamp01to100(parsed.quality),
      ambiguity: typeof parsed.ambiguity === 'number' ? Math.min(1, Math.max(0, parsed.ambiguity)) : 0.5,
      resolvable: parsed.resolvable === true,
      difficulty: clamp01to100(parsed.difficulty),
      antiBiasRisk: parsed.antiBiasRisk === true,
    };
    const llmVerdict = parsed.verdict === 'pass' ? 'pass' : 'reject';
    const llmMotif = typeof parsed.motif === 'string' && MOTIF_RE.test(parsed.motif) ? parsed.motif : '';

    // Deterministic guards on top of the LLM verdict — the verifier's own
    // output must still satisfy the entry contract.
    if (llmVerdict === 'reject') {
      return { pass: false, checks, motif: llmMotif || 'low_quality', costUsd };
    }
    if (fq.length < 25 || fq.length > 400 || !fq.includes('?')) {
      return reject('low_quality', costUsd);
    }
    if (checks.ambiguity > 0.7) return { pass: false, checks, motif: 'ambiguous', costUsd };
    if (!checks.resolvable) return { pass: false, checks, motif: 'unresolvable', costUsd };
    if (checks.antiBiasRisk) return { pass: false, checks, motif: 'anti_bias_trivial_no', costUsd };
    if (checks.difficulty < 20) return { pass: false, checks, motif: 'trivial', costUsd };
    if (checks.difficulty > 85) return { pass: false, checks, motif: 'unresolvable', costUsd };
    if (checks.quality < 50) return { pass: false, checks, motif: 'low_quality', costUsd };

    return { pass: true, forecastQuestion: fq, checks, costUsd };
  } catch (err) {
    console.warn('[QUESTION-VERIFY] verifier failed (non-blocking):', err);
    return reject('verifier_error');
  }
}

function clamp01to100(v: unknown): number {
  const n = typeof v === 'number' ? v : 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}
