/**
 * QUESTION VERIFIERS — P0-A entry gate (FutureSearch-style), hardened per
 * Claude §1.2 after run-12 accepted 6 bad questions (past horizon "end of
 * 2024", off-signal ICJ question, unresolvable Gaza-climate).
 *
 * Every dispatch candidate must carry a forecastQuestion that survives
 * verification BEFORE any pipeline spend: quality, ambiguity, resolvability
 * (named source + date), difficulty, anti-bias, PLUS deterministic guards —
 * future dated horizon (today+1mo … today+5y), signal-term anchoring, and a
 * cheap base-rate estimate p ∈ [0.10, 0.90] with one reformulation retry.
 *
 * Generation and grading are separate calls on DIFFERENT task routes so the
 * verifier family can differ from the producer family once §2 routing lands
 * (today both may degrade to glm — the contract is in the task table).
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
    baseRate?: number;      // cheap p estimate — outside [0.10,0.90] = trivial band
  };
  /** Machine-readable rejection motif for stats — never empty on !pass. */
  motif?: string;
  costUsd?: number;
}

const VERIFY_SYSTEM = `You are the commissioning editor of a forecasting desk. TODAY'S DATE is {{TODAY}}. Given a news signal (headline + context) and optionally a research framing, produce ONE falsifiable forecast question and grade it.

The forecast question MUST be anchored on the SIGNAL — its metric, actors and horizon come from what the signal reports, not from the academic research framing. A question about a different event than the signal's is off_signal.

Output strict JSON:
{
  "forecastQuestion": "<one falsifiable question a third party could resolve from public data — MUST name a checkable horizon date in the future relative to {{TODAY}}>",
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
- resolvable: true ONLY if a named public source and a checkable FUTURE date exist (a horizon already in the past is unresolvable).
- difficulty: 50 = ideal forecast difficulty; <20 = trivial (already decided news); >85 = cannot be resolved by any foreseeable data.
- antiBiasRisk: true when the question is so hyper-specific that the obvious answer is "no" (e.g. "will country X sign treaty Y on exact date Z") — forecasting "no" on trivia is not analysis.
- verdict=reject with motif in {low_quality, ambiguous, unresolvable, trivial, anti_bias_trivial_no, off_signal} when the topic cannot yield a real forecast question.`;

const VERIFY_ONLY_SYSTEM = `You are an independent verifier at a forecasting desk — you did NOT write the question below and must grade it skeptically. TODAY'S DATE is {{TODAY}}.

Grade the forecast question on:
- resolvable: true ONLY if a named public source AND a checkable FUTURE resolution date exist (a horizon already in the past is unresolvable; "within N months/years" counts only if it lands in the future);
- ambiguity: 0 = perfectly defined metric+actor+horizon; 1 = unanswerable mush;
- onSignal: does the question stay anchored on the SIGNAL provided, not drift to a different event;
- trivial: true when the honest answer is already obvious (~0% or ~100%) or the question is mere current-affairs recap with no forecast content.

Output strict JSON:
{"verdict":"pass"|"reject","motif":"<low_quality|ambiguous|unresolvable|trivial|off_signal|stale_horizon|anti_bias_trivial_no|>","resolvable":true|false,"ambiguity":0.0-1.0,"trivial":true|false}`;

const P_ESTIMATE_SYSTEM = `You are a superforecaster giving a quick base-rate estimate. TODAY'S DATE is {{TODAY}}.
Output strict JSON: {"p": 0.0-1.0, "reason": "<one clause>"}
p = your honest probability the question resolves YES. Use outside-view base rates, not inside narrative.`;

const MOTIF_RE = /low_quality|ambiguous|unresolvable|trivial|anti_bias|off_signal|verifier_error|stale_horizon|off_signal_terms|anti_bias_trivial/;

const STOPWORDS = new Set(('the a an and or of to in for on at by with from as is are was were be been it its this that these those will would could should can may might do does did have has had not no yes what which who whom whose when where why how than then there their they them he she we you i our your his her its'.split(' ')));

/** Extract candidate horizon dates from a forecast question. Returns the
 *  latest plausible resolution date or null. Handles "by 2030", "in 2027",
 *  "within 18 months", "end of 2024", "Q3 2026", "by end of 2025". */
export function extractHorizonDate(text: string, today = new Date()): Date | null {
  const t = text.toLowerCase();
  const now = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let best: Date | null = null;
  const consider = (d: Date | null) => { if (d && (!best || d > best)) best = d; };
  // explicit year
  const y = t.match(/\b(20[2-4]\d)\b/);
  if (y) consider(new Date(Date.UTC(Number(y[1]), 11, 31)));
  // quarter
  const q = t.match(/\bq([1-4])\s*(?:of\s*)?(20[2-4]\d)?/);
  if (q) {
    const yr = q[2] ? Number(q[2]) : now.getUTCFullYear() + (Number(q[1]) <= now.getUTCMonth() / 3 + 1 ? 1 : 0);
    consider(new Date(Date.UTC(yr, Number(q[1]) * 3, 0)));
  }
  // "within|in N months|weeks|days"
  const rel = t.match(/\b(?:within|in)\s+(\d{1,3})\s+(month|week|day)s?\b/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const d = new Date(now);
    if (unit.startsWith('month')) d.setUTCMonth(d.getUTCMonth() + n);
    else if (unit.startsWith('week')) d.setUTCDate(d.getUTCDate() + n * 7);
    else d.setUTCDate(d.getUTCDate() + n);
    consider(d);
  }
  return best;
}

/** Salient-term anchoring: at least one content word (len≥5, non-stopword)
 *  from the signal headline must appear in the forecast question — the
 *  anti-drift guard against questions about a different event. */
export function signalAnchored(forecastQuestion: string, signalTitle?: string, signalContext?: string): boolean {
  if (!signalTitle && !signalContext) return true; // nothing to anchor on
  const corpus = `${forecastQuestion} ${signalContext ?? ''}`.toLowerCase();
  const titleWords = `${signalTitle ?? ''}`.toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length >= 5 && !STOPWORDS.has(w));
  if (titleWords.length === 0) return true;
  const hits = titleWords.filter(w => corpus.includes(w)).length;
  return hits >= 1;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function estimateBaseRate(forecastQuestion: string, runId?: string): Promise<{ p: number; costUsd?: number } | null> {
  try {
    const raw = await callLLM({
      task: 'query_reformulation',
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 120,
      maxCostUsd: 0.005,
      runId,
      messages: [
        { role: 'system', content: P_ESTIMATE_SYSTEM.replaceAll('{{TODAY}}', todayISO()) },
        { role: 'user', content: `QUESTION: ${forecastQuestion}` },
      ],
    });
    const content = typeof raw === 'string' ? raw : String((raw as { content?: string })?.content ?? '');
    const parsed = parseJson<{ p?: number }>(content);
    if (typeof parsed?.p !== 'number') return null;
    return { p: Math.min(1, Math.max(0, parsed.p)), costUsd: (raw as { costUsd?: number })?.costUsd };
  } catch {
    return null; // estimate unavailable → guard skipped, never fabricates
  }
}

/**
 * Verify one dispatch candidate BEFORE spend. Returns pass + forecastQuestion
 * on success; pass=false + motif on rejection or verifier failure.
 * Frozen via captureInput for record/replay parity.
 */
export async function verifyDispatchQuestion(input: {
  question: string;
  topicTitle?: string;
  signalContext?: string;
  runId?: string;
}): Promise<QuestionVerification> {
  const { question, topicTitle, signalContext, runId } = input;
  const reject = (motif: string, costUsd?: number, checks?: QuestionVerification['checks']): QuestionVerification => ({
    pass: false,
    checks: checks ?? { quality: 0, ambiguity: 1, resolvable: false, difficulty: 0, antiBiasRisk: false },
    motif, costUsd,
  });
  if (!question || question.trim().length < 15) return reject('low_quality');

  const today = todayISO();
  let totalCost = 0;
  const addCost = (c?: number) => { if (typeof c === 'number') totalCost += c; };

  // ── Stage 1: GENERATE forecastQuestion + grade (signal-anchored). ──
  let fq = '';
  let checks: QuestionVerification['checks'] = { quality: 0, ambiguity: 1, resolvable: false, difficulty: 0, antiBiasRisk: false };
  try {
    const raw = await captureInput(`question:verify:${question.slice(0, 120)}`, async () => {
      return callLLM({
        task: 'query_reformulation',
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 600,
        maxCostUsd: 0.015,
        runId,
        messages: [
          { role: 'system', content: VERIFY_SYSTEM.replaceAll('{{TODAY}}', today) },
          {
            role: 'user',
            content: `SIGNAL HEADLINE: ${topicTitle ?? '(none)'}\nSIGNAL CONTEXT: ${signalContext ?? '(none)'}\nRESEARCH FRAMING (secondary — do NOT copy its wording): ${question}`,
          },
        ],
      });
    });
    addCost((raw as { costUsd?: number })?.costUsd);
    const content = typeof raw === 'string' ? raw : String((raw as { content?: string })?.content ?? '');
    const parsed = parseJson<Record<string, unknown>>(content);
    if (!parsed) return reject('verifier_error', totalCost);

    fq = typeof parsed.forecastQuestion === 'string' ? parsed.forecastQuestion.trim() : '';
    checks = {
      quality: clamp01to100(parsed.quality),
      ambiguity: typeof parsed.ambiguity === 'number' ? Math.min(1, Math.max(0, parsed.ambiguity)) : 0.5,
      resolvable: parsed.resolvable === true,
      difficulty: clamp01to100(parsed.difficulty),
      antiBiasRisk: parsed.antiBiasRisk === true,
    };
    const llmVerdict = parsed.verdict === 'pass' ? 'pass' : 'reject';
    const llmMotif = typeof parsed.motif === 'string' && MOTIF_RE.test(parsed.motif) ? parsed.motif : '';
    if (llmVerdict === 'reject') {
      return { pass: false, checks, motif: llmMotif || 'low_quality', costUsd: totalCost };
    }
  } catch (err) {
    console.warn('[QUESTION-VERIFY] generator failed (non-blocking):', err);
    return reject('verifier_error');
  }

  // ── Deterministic guards on the generated question. ──
  if (fq.length < 25 || fq.length > 400 || !fq.includes('?')) {
    return reject('low_quality', totalCost, checks);
  }
  if (checks.ambiguity > 0.7) return { pass: false, checks, motif: 'ambiguous', costUsd: totalCost };
  if (!checks.resolvable) return { pass: false, checks, motif: 'unresolvable', costUsd: totalCost };
  if (checks.antiBiasRisk) return { pass: false, checks, motif: 'anti_bias_trivial_no', costUsd: totalCost };
  if (checks.difficulty < 20) return { pass: false, checks, motif: 'trivial', costUsd: totalCost };
  if (checks.difficulty > 85) return { pass: false, checks, motif: 'unresolvable', costUsd: totalCost };
  if (checks.quality < 50) return { pass: false, checks, motif: 'low_quality', costUsd: totalCost };

  // Horizon must parse to a FUTURE date within [today+1mo, today+5y].
  // Run-12 accepted "by the end of 2024" — already past.
  const horizon = extractHorizonDate(fq);
  const now = new Date();
  const minH = new Date(now); minH.setUTCMonth(minH.getUTCMonth() + 1);
  const maxH = new Date(now); maxH.setUTCFullYear(maxH.getUTCFullYear() + 5);
  if (!horizon || horizon < minH || horizon > maxH) {
    return { pass: false, checks, motif: 'stale_horizon', costUsd: totalCost };
  }

  // Anti-drift: the forecast question must stay anchored on the signal.
  if (!signalAnchored(fq, topicTitle, signalContext)) {
    return { pass: false, checks, motif: 'off_signal_terms', costUsd: totalCost };
  }

  // ── Stage 1b: INDEPENDENT verification — the generator (glm-4.5-air)
  // never grades itself. fact_check routes to the verification family
  // (DeepSeek V4 Pro); one bounded call, fail-open on error (the
  // deterministic guards above already ran). ──
  try {
    const ver = await captureInput(`question:verify-ind:${fq.slice(0, 120)}`, () => callLLM({
      task: 'fact_check',
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 200,
      maxCostUsd: 0.008,
      runId,
      messages: [
        { role: 'system', content: VERIFY_ONLY_SYSTEM.replaceAll('{{TODAY}}', today) },
        { role: 'user', content: `SIGNAL HEADLINE: ${topicTitle ?? '(none)'}\nSIGNAL CONTEXT: ${signalContext ?? '(none)'}\nFORECAST QUESTION TO VERIFY: ${fq}` },
      ],
    }));
    addCost((ver as { costUsd?: number })?.costUsd);
    const vc = typeof ver === 'string' ? ver : String((ver as { content?: string })?.content ?? '');
    const vp = parseJson<Record<string, unknown>>(vc);
    if (vp) {
      if (vp.verdict === 'reject') {
        const motif = typeof vp.motif === 'string' && MOTIF_RE.test(vp.motif) ? vp.motif : 'low_quality';
        return { pass: false, checks, motif: `verifier_${motif}`, costUsd: totalCost };
      }
      if (vp.resolvable === false) {
        return { pass: false, checks, motif: 'verifier_unresolvable', costUsd: totalCost };
      }
      if (vp.trivial === true) {
        return { pass: false, checks, motif: 'verifier_trivial', costUsd: totalCost };
      }
      if (typeof vp.ambiguity === 'number' && vp.ambiguity > 0.7) {
        return { pass: false, checks, motif: 'verifier_ambiguous', costUsd: totalCost };
      }
    }
  } catch (verErr) {
    console.warn('[QUESTION-VERIFY] independent verifier failed (fail-open):', verErr);
  }

  // ── Stage 2: base-rate estimate — trivially-decidable questions (p≈0 or
  // p≈1) are not forecasts. One cheap call; one reformulation retry, then
  // abandon (motif anti_bias_trivial). ──
  let est = await estimateBaseRate(fq, runId);
  addCost(est?.costUsd);
  if (est && (est.p < 0.10 || est.p > 0.90)) {
    // One reformulation attempt toward the decision-relevant middle.
    try {
      const reform = await callLLM({
        task: 'query_reformulation',
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 300,
        maxCostUsd: 0.01,
        runId,
        messages: [
          { role: 'system', content: `Reformulate this forecast question so its honest probability is meaningfully uncertain (not ~0% or ~100%). Keep it anchored on the same signal and a FUTURE dated horizon. Output strict JSON: {"forecastQuestion":"..."}` },
          { role: 'user', content: `SIGNAL: ${topicTitle ?? question}\nCONTEXT: ${signalContext ?? ''}\nTRIVIAL QUESTION (p≈${est.p.toFixed(2)}): ${fq}` },
        ],
      });
      addCost((reform as { costUsd?: number })?.costUsd);
      const rc = typeof reform === 'string' ? reform : String((reform as { content?: string })?.content ?? '');
      const rp = parseJson<{ forecastQuestion?: string }>(rc);
      const fq2 = typeof rp?.forecastQuestion === 'string' ? rp.forecastQuestion.trim() : '';
      if (fq2.length >= 25 && fq2.length <= 400 && fq2.includes('?')) {
        const h2 = extractHorizonDate(fq2);
        const okH2 = h2 && h2 >= minH && h2 <= maxH;
        if (okH2 && signalAnchored(fq2, topicTitle, signalContext)) {
          const est2 = await estimateBaseRate(fq2, runId);
          addCost(est2?.costUsd);
          if (est2 && est2.p >= 0.10 && est2.p <= 0.90) {
            checks.baseRate = est2.p;
            return { pass: true, forecastQuestion: fq2, checks, costUsd: totalCost };
          }
        }
      }
    } catch { /* fall through to abandon */ }
    checks.baseRate = est.p;
    return { pass: false, checks, motif: 'anti_bias_trivial', costUsd: totalCost };
  }
  if (est) checks.baseRate = est.p;

  return { pass: true, forecastQuestion: fq, checks, costUsd: totalCost };
}

function clamp01to100(v: unknown): number {
  const n = typeof v === 'number' ? v : 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}
