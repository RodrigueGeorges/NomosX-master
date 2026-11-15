/**
 * Evidence-bounded question reformulation (held-retry last resort).
 *
 * Live defect (2026-11-15, 1.5°C memo): two full attempts on "strategic
 * implications of nations abandoning the 1.5°C target" ended HELD at
 * trust 40. The evidence-mission retry DID repair the corpus (41 sources,
 * core evidence PASS, citations 57%, thesis adherence PASS) — but the DA
 * kill shot identified a framing/category error: the question presupposes
 * a discrete political event ("nations abandoning the target") while the
 * evidence supports a continuous trajectory (NDCs → ~2.5°C+). No amount
 * of retrieval fixes a presupposition the corpus contradicts; the analyst
 * keeps building cascade extrapolations on it.
 *
 * This module generates ONE narrower research question for the retry,
 * bounded by the evidence actually found (the persisted evidenceQueries
 * + the DA failure feedback). Deterministic validation decides acceptance:
 * the reformulation must retain the original's anchor content (numbers,
 * named entities, domain terms) so it can never drift to a different
 * story — it narrows the mandate, it does not replace it.
 *
 * Lineage: the caller persists {originalQuestion, reformulatedQuestion,
 * rationale} into dispatch metadata → criticalLoopResult, so the
 * publication records both questions and why the rewrite happened.
 * A refused/absent reformulation falls back to the original question —
 * the mechanism can only ever add optionality, never block a retry.
 */

import { callLLM } from '@/lib/llm/unified-llm';
import { captureInput } from './frozen-inputs';

const MIN_LEN = 40;
const MAX_LEN = 280;

const STOPWORDS = new Set(
  ('a an the and or of to in on for with by from at as is are was were be been being ' +
   'what which who whom whose when where why how do does did can could should would will ' +
   'their its his her our your my this that these those it its they them he she we you i ' +
   'not no nor but if then than so such into over under between about against through ' +
   'during before after above below up down out off again further once here there all ' +
   'any both each few more most other some only own same too very just also').split(' ')
);

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z\-]{3,}/g) ?? [];
  return new Set(words.filter(w => !STOPWORDS.has(w)));
}

function wordsRelated(a: string, b: string): boolean {
  // Substring either direction — catches morphological variants
  // (adapt ↔ adaptation, policy ↔ policymakers) that strict equality misses.
  return a.includes(b) || b.includes(a);
}

/**
 * Cheap deterministic gate: does the reformulated question stay materially
 * on the original topic? Two conditions:
 *  1. ANCHOR — at least one original content word survives (substring match).
 *     Blocks drift to an unrelated story.
 *  2. BREADTH — ≥40% of the candidate's content words live in the topic
 *     vocabulary = original question ∪ persisted evidence queries. The
 *     evidence queries are on-topic by construction (they were distilled
 *     from this run's own corpus gaps), so they legitimately widen the
 *     vocabulary a narrowing may draw from — while still rejecting a
 *     candidate that invents new domains.
 * Narrowing MUST drop framing words, so raw retention against the original
 * alone is the wrong metric (observed: a valid 2.5°C/NDCs reframing kept
 * only ~11% of original tokens).
 */
export function reformulationOnTopic(
  original: string,
  candidate: string,
  evidenceQueries: string[] = [],
): boolean {
  const candWords = [...contentWords(candidate)];
  if (candWords.length === 0) return false;
  const origWords = [...contentWords(original)];
  const vocab = new Set([...origWords, ...contentWords(evidenceQueries.join(' '))]);
  const anchorKept = origWords.some(w => candWords.some(c => wordsRelated(w, c)));
  if (!anchorKept) return false;
  const inVocab = candWords.filter(c => [...vocab].some(v => wordsRelated(v, c))).length;
  return inVocab / candWords.length >= 0.4;
}

export interface ReformulationDecision {
  /** True when the held-retry failure signature indicates a framing problem
   *  that retrieval alone cannot fix. Conservative: requires BOTH deep
   *  failure (trust < 50) AND an adversarial verdict signal in the feedback —
   *  a plain evidence gap retries on the same question. */
  attempt: boolean;
  reason: string;
}

export function shouldAttemptQuestionReformulation(input: {
  lastTrust?: number;
  feedback?: string;
  evidenceQueries?: string[];
}): ReformulationDecision {
  if (!input.evidenceQueries?.length) {
    return { attempt: false, reason: 'no evidence queries persisted' };
  }
  if ((input.lastTrust ?? 100) >= 50) {
    return { attempt: false, reason: `trust ${input.lastTrust} not in deep-failure band` };
  }
  const fb = input.feedback ?? '';
  const adversarial = /DA kill shot|devils_advocate|adversarial|fatal challenge/i.test(fb);
  if (!adversarial) {
    return { attempt: false, reason: 'no adversarial/framing failure signal in hold feedback' };
  }
  return { attempt: true, reason: 'deep trust failure + adversarial framing signal + evidence plan' };
}

export interface QuestionReformulation {
  question: string;
  rationale: string;
}

/**
 * One bounded LLM call → narrowed question, or null. Never throws: every
 * failure mode (LLM error, bad JSON, off-topic drift, identical rewrite)
 * degrades to "keep the original question".
 */
export async function reformulateHeldQuestion(input: {
  originalQuestion: string;
  feedback: string;
  evidenceQueries: string[];
}): Promise<QuestionReformulation | null> {
  const { originalQuestion, feedback, evidenceQueries } = input;
  try {
    const result = await captureInput('reformulate:question', async () => {
      const res = await callLLM({
        task: 'query_reformulation',
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 400,
        maxCostUsd: 0.01,
        messages: [
          {
            role: 'system',
            content: `You are the research editor of a think tank. A research question was attempted twice and held by the publication gate — not for lack of sources, but because the QUESTION'S FRAMING presupposes something the evidence contradicts.

Your job: propose ONE narrower research question that (a) stays on the same topic and mandate, (b) asks only what the retrieved evidence can actually support, (c) drops or corrects the flawed presupposition instead of inheriting it.

Rules:
- Output strict JSON: {"question": "...", "rationale": "..."}
- The question must be a single interrogative sentence (end with ?), 40-280 chars.
- Keep the specific entities, numbers, dates and domain terms of the original — narrow the CLAIM, never switch the topic.
- If the original presupposes an event/outcome the evidence contradicts, reframe to the evidenced trajectory (e.g. "implications of X" → "what the evidenced path of X implies").
- The rationale (1-2 sentences) must name the presupposition being dropped and the evidence basis for the narrower framing.`,
          },
          {
            role: 'user',
            content: `ORIGINAL QUESTION:\n${originalQuestion}\n\nWHY IT WAS HELD (adversarial verdict + gate feedback):\n${feedback.slice(0, 1500)}\n\nEVIDENCE THE RETRIEVAL PLAN TARGETS (what the corpus can support):\n${evidenceQueries.slice(0, 6).map(q => `- ${q}`).join('\n')}`,
          },
        ],
      });
      return res.content;
    });

    const text = typeof result === 'string' ? result : String((result as { content?: string })?.content ?? '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { question?: unknown; rationale?: unknown };
    const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '';

    if (question.length < MIN_LEN || question.length > MAX_LEN) return null;
    if (!question.includes('?')) return null;
    if (question.toLowerCase() === originalQuestion.trim().toLowerCase()) return null;
    if (!reformulationOnTopic(originalQuestion, question, evidenceQueries)) {
      console.log(`[Reformulator] REJECTED off-topic drift: "${question.slice(0, 80)}"`);
      return null;
    }
    console.log(`[Reformulator] NARROWED: "${originalQuestion.slice(0, 60)}…" → "${question.slice(0, 80)}…" (${rationale.slice(0, 100)})`);
    return { question, rationale };
  } catch (err) {
    console.warn('[Reformulator] failed (non-blocking, keeping original question):', err);
    return null;
  }
}
