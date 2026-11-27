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
  /** EiC-supplied forecast question — evaluated BEFORE generation; the EiC
   *  selected this topic partly on that question's strength. */
  candidateForecastQuestion?: string;
}): Promise<QuestionVerification> {
  const { question, topicTitle, signalContext, runId, candidateForecastQuestion } = input;
  const reject = (motif: string, costUsd?: number, checks?: QuestionVerification['checks'], fqOut?: string): QuestionVerification => ({
    pass: false,
    checks: checks ?? { quality: 0, ambiguity: 1, resolvable: false, difficulty: 0, antiBiasRisk: false },
    motif, costUsd,
    forecastQuestion: fqOut || undefined,
  });
  if (!question || question.trim().length < 15) return reject('low_quality');

  const today = todayISO();
  let totalCost = 0;
  const addCost = (c?: number) => { if (typeof c === 'number') totalCost += c; };

  // ── Stage 1: GENERATE forecastQuestion + grade (signal-anchored). ──
  let fq = '';
  let checks: QuestionVerification['checks'] = { quality: 0, ambiguity: 1, resolvable: false, difficulty: 0, antiBiasRisk: false };

  // ── Agentic retry: evaluate() runs the deterministic guards + the
  // independent verifier + the base-rate band on ONE candidate. A
  // recoverable rejection buys exactly ONE reformulation carrying the
  // motif as feedback — the generator adapts instead of the item dying
  // (run-13/14: every EiC pick died on a first-rejection motif). ──
  // anti_bias_trivial_no is deliberately absent: an anti-bias flag is a
  // content judgment, not a form defect — the base-rate band below owns
  // the p≈0/p≈1 case and one cheap rewrite rarely cures a trivial-no.
  const RETRYABLE_MOTIFS = new Set([
    'low_quality', 'ambiguous', 'unresolvable', 'trivial',
    'anti_bias_trivial', 'stale_horizon', 'off_signal_terms',
    'verifier_low_quality', 'verifier_ambiguous', 'verifier_unresolvable',
    'verifier_trivial', 'verifier_anti_bias_trivial_no',
    // Independent-verifier wrappers — run-16 showed verifier_off_signal /
    // verifier_stale_horizon rejections dying WITHOUT a reformulation attempt
    // because the wrapped motifs were missing from this set.
    'verifier_off_signal', 'verifier_stale_horizon', 'verifier_off_signal_terms',
  ]);

  interface EvalResult {
    pass: boolean;
    motif?: string;
    forecastQuestion?: string;
    addedCost: number;
  }

  const evaluate = async (candidate: string, graded: boolean): Promise<EvalResult> => {
    let added = 0;
    const fail = (motif: string): EvalResult => ({ pass: false, motif, addedCost: added });
    if (candidate.length < 25 || candidate.length > 400 || !candidate.includes('?')) return fail('low_quality');
    if (graded) {
      // Stage-1 grades describe the FIRST candidate only — a reformulated
      // question is re-judged by the independent verifier + base-rate below.
      if (checks.ambiguity > 0.7) return fail('ambiguous');
      if (!checks.resolvable) return fail('unresolvable');
      if (checks.antiBiasRisk) return fail('anti_bias_trivial_no');
      if (checks.difficulty < 20) return fail('trivial');
      if (checks.difficulty > 85) return fail('unresolvable');
      if (checks.quality < 50) return fail('low_quality');
    }
    // Horizon must parse to a FUTURE date within [today+1mo, today+5y].
    const horizon = extractHorizonDate(candidate);
    const now = new Date();
    const minH = new Date(now); minH.setUTCMonth(minH.getUTCMonth() + 1);
    const maxH = new Date(now); maxH.setUTCFullYear(maxH.getUTCFullYear() + 5);
    if (!horizon || horizon < minH || horizon > maxH) return fail('stale_horizon');
    // Anti-drift: the forecast question must stay anchored on the signal.
    if (!signalAnchored(candidate, topicTitle, signalContext)) return fail('off_signal_terms');

    // ── Independent verification — the generator never grades itself.
    try {
      const ver = await captureInput(`question:verify-ind:${candidate.slice(0, 120)}`, () => callLLM({
        task: 'fact_check',
        jsonMode: true,
        temperature: 0.1,
        maxTokens: 200,
        maxCostUsd: 0.008,
        runId,
        messages: [
          { role: 'system', content: VERIFY_ONLY_SYSTEM.replaceAll('{{TODAY}}', today) },
          { role: 'user', content: `SIGNAL HEADLINE: ${topicTitle ?? '(none)'}
SIGNAL CONTEXT: ${signalContext ?? '(none)'}
FORECAST QUESTION TO VERIFY: ${candidate}` },
        ],
      }));
      added += (ver as { costUsd?: number })?.costUsd ?? 0;
      const vc = typeof ver === 'string' ? ver : String((ver as { content?: string })?.content ?? '');
      const vp = parseJson<Record<string, unknown>>(vc);
      if (vp) {
        if (vp.verdict === 'reject') {
          const motif = typeof vp.motif === 'string' && MOTIF_RE.test(vp.motif) ? vp.motif : 'low_quality';
          return fail(`verifier_${motif}`);
        }
        if (vp.resolvable === false) return fail('verifier_unresolvable');
        if (vp.trivial === true) return fail('verifier_trivial');
        if (typeof vp.ambiguity === 'number' && vp.ambiguity > 0.7) return fail('verifier_ambiguous');
      }
    } catch (verErr) {
      console.warn('[QUESTION-VERIFY] independent verifier failed (fail-open):', verErr);
    }

    // ── Base-rate band — trivially-decidable questions are not forecasts.
    const est = await estimateBaseRate(candidate, runId);
    added += est?.costUsd ?? 0;
    if (est) {
      checks.baseRate = est.p;
      if (est.p < 0.10 || est.p > 0.90) return fail('anti_bias_trivial');
    }
    return { pass: true, forecastQuestion: candidate, addedCost: added };
  };


  // ── EiC candidate first: evaluate before paying for generation. The EiC
  // picked this topic partly on its forecastQuestion — when it survives the
  // same guards + independent verifier + base-rate band, we skip stage-1
  // entirely. A rejection is non-fatal: generation still gets its shot. ──
  const eicCandidate = typeof candidateForecastQuestion === 'string' ? candidateForecastQuestion.trim() : '';
  if (eicCandidate) {
    const eicRes = await evaluate(eicCandidate, false);
    addCost(eicRes.addedCost);
    if (eicRes.pass) {
      console.log(`[QUESTION-VERIFY] EiC candidate accepted → "${eicCandidate.slice(0, 90)}"`);
      return { pass: true, forecastQuestion: eicCandidate, checks, costUsd: totalCost };
    }
    console.log(`[QUESTION-VERIFY] EiC candidate rejected (${eicRes.motif}) — generating fresh`);
  }
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
      return { pass: false, checks, motif: llmMotif || 'low_quality', costUsd: totalCost, forecastQuestion: fq || undefined };
    }
  } catch (err) {
    console.warn('[QUESTION-VERIFY] generator failed (non-blocking):', err);
    return reject('verifier_error');
  }

  let result = await evaluate(fq, true);
  addCost(result.addedCost);

  // One motif-guided reformulation for recoverable rejections — the
  // generator sees WHY it failed and must fix exactly that.
  if (!result.pass && fq && RETRYABLE_MOTIFS.has(result.motif ?? '')) {
    try {
      const reform = await callLLM({
        task: 'query_reformulation',
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 300,
        maxCostUsd: 0.01,
        runId,
        messages: [
          { role: 'system', content: `You are the commissioning editor of a forecasting desk. TODAY'S DATE is ${today}. A forecast question was REJECTED by the verifier with motif "${result.motif}". Produce ONE corrected falsifiable forecast question anchored on the SAME signal with a checkable FUTURE dated horizon. Fix exactly what the motif flags: off_signal_terms → stay on the signal's actors/metric; stale_horizon → pick a future date; verifier_unresolvable/verifier_ambiguous → make it concretely resolvable from public data; anti_bias_trivial → target the decision-relevant middle probability. Output strict JSON: {"forecastQuestion":"..."}` },
          { role: 'user', content: `SIGNAL HEADLINE: ${topicTitle ?? '(none)'}
SIGNAL CONTEXT: ${signalContext ?? '(none)'}
RESEARCH FRAMING: ${question}
REJECTED QUESTION: ${fq}
REJECTION MOTIF: ${result.motif}` },
        ],
      });
      addCost((reform as { costUsd?: number })?.costUsd);
      const rc = typeof reform === 'string' ? reform : String((reform as { content?: string })?.content ?? '');
      const rp = parseJson<{ forecastQuestion?: string }>(rc);
      const fq2 = typeof rp?.forecastQuestion === 'string' ? rp.forecastQuestion.trim() : '';
      if (fq2) {
        const firstMotif = result.motif;
        const r2 = await evaluate(fq2, false);
        addCost(r2.addedCost);
        if (r2.pass) {
          console.log(`[QUESTION-VERIFY] reformulated after ${firstMotif} → "${fq2.slice(0, 90)}"`);
          return { pass: true, forecastQuestion: fq2, checks, costUsd: totalCost };
        }
        // Report the SECOND failure — it describes the final candidate.
        console.log(`[QUESTION-VERIFY] reformulation after ${firstMotif} still rejected (${r2.motif}) → "${fq2.slice(0, 90)}"`);
        result = { ...r2, forecastQuestion: fq2 };
      }
    } catch { /* fall through to the original rejection */ }
  }

  if (result.pass) {
    return { pass: true, forecastQuestion: result.forecastQuestion, checks, costUsd: totalCost };
  }
  return reject(result.motif ?? 'low_quality', totalCost, checks, result.forecastQuestion ?? fq);
}

function clamp01to100(v: unknown): number {
  const n = typeof v === 'number' ? v : 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}
