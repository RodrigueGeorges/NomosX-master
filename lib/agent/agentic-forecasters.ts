/**
 * AGENTIC FORECASTERS — Lot 1 replacement for card votes.
 *
 * Instead of 15 one-shot ballots on evidence cards, THREE forecasters on
 * three distinct model families each run a bounded belief-update loop
 * (schemas adapted from Metaculus forecasting-tools / nostreambot, MIT):
 *
 *   iteration i: prior belief state + next evidence batch → updated
 *   BeliefState JSON {p, confidence, evidenceFor, evidenceAgainst,
 *   openQuestions, links{}}
 *
 * The prompt contract forces superforecasting discipline every iteration:
 * base rate + reference class, similar resolved questions, actor
 * incentives and credibility of commitments, and a pre-mortem. Max 10
 * iterations; early stop after 2 consecutive stable beliefs with no open
 * questions. "Research" = the run's evidence corpus dealt in batches —
 * the same cards the swarm saw, consumed incrementally.
 *
 * Output shape mirrors SwarmResult so the elector, health check, binary
 * gate and stats plumbing consume it unchanged. Falls back per-forecaster:
 * a family that cannot produce valid JSON contributes no votes — a null
 * forecast, never a guessed one.
 */

import { callLLM, getAvailableProviders, getSuspendedProviders, type LLMProvider } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { poolForecasts, type ForecastVote } from './leap-aggregation';
import { applyPlatt, getFamilyPlatt } from './platt-calibration';
import type { LinkForecast, SwarmSourceCard, UncertainLink } from './swarm-forecaster';
import type { QuestionSpec } from './question-spec';
import { QUESTION_LINK_ID } from './question-spec';

export const AGENTIC_MAX_ITERATIONS = 10;
/** Early stop: this many consecutive iterations with |Δp| below threshold. */
const STABLE_ITERS = 2;
const STABLE_DELTA = 0.02;

export interface BeliefState {
  /** P(the operationalized question resolves YES). */
  p: number;
  confidence: 'low' | 'medium' | 'high';
  evidenceFor: string[];
  evidenceAgainst: string[];
  openQuestions: string[];
  baseRate?: string;
  referenceClass?: string;
  preMortem?: string;
  /** Per-link probabilities for the causal-chain uncertainties. */
  links: Record<number, number>;
}

export interface AgenticForecastResult {
  forecasts: LinkForecast[];
  questionForecast?: { probability: number; iqr: number; validVotes: number; families: number; contested: boolean };
  forecasters: Array<{ family: string; provider: string; iterations: number; finalP?: number; costUsd: number; error?: string }>;
  validVotes: number;
  familiesUsed: string[];
  costUsd: number;
  skipped?: string;
  /** Spec supervisor: fired when question IQR > 0.20 — one targeted
   *  adjudication pass on the disagreement point, then re-pool. */
  supervisor?: { triggered: boolean; iqrBefore: number; revised: number; iqrAfter?: number };
}

const FAMILY_OF: Record<string, string> = {
  glm: 'glm', kimi: 'kimi', google: 'google', deepseek: 'deepseek',
  cohere: 'cohere', mistral: 'mistral', meta: 'meta-llama', qwen: 'qwen', openai: 'openai',
};

export function familyOfProvider(provider: string, model?: string): string {
  const m = String(model ?? '').toLowerCase();
  if (/llama|mixtral/.test(m)) return 'meta-llama';
  if (/qwen/.test(m)) return 'qwen';
  if (/gemini/.test(m)) return 'google';
  if (/command|cohere/.test(m)) return 'cohere';
  if (/mistral/.test(m)) return 'mistral';
  if (/deepseek/.test(m)) return 'deepseek';
  if (/glm|chatglm/.test(m)) return 'glm';
  if (/gpt|o\d/.test(m)) return 'openai';
  if (/kimi|moonshot/.test(m)) return 'kimi';
  // Unknown freepool model: the model id tail is more informative than
  // the shared 'freepool' bucket (mirrors swarm-forecaster.familyOf).
  return FAMILY_OF[provider] ?? (m.split('/').pop() || provider);
}

export function parseBelief(content: string): BeliefState | null {
  const parsed = parseJson<Partial<BeliefState>>(content);
  if (!parsed || typeof parsed.p !== 'number' || !Number.isFinite(parsed.p)) return null;
  const p = Math.min(0.98, Math.max(0.02, parsed.p));
  const links: Record<number, number> = {};
  if (parsed.links && typeof parsed.links === 'object') {
    for (const [k, v] of Object.entries(parsed.links as Record<string, unknown>)) {
      const id = Number(k), pv = Number(v);
      if (Number.isFinite(id) && Number.isFinite(pv)) links[id] = Math.min(0.98, Math.max(0.02, pv));
    }
  }
  return {
    p,
    confidence: ['low', 'medium', 'high'].includes(String(parsed.confidence)) ? (parsed.confidence as BeliefState['confidence']) : 'low',
    evidenceFor: Array.isArray(parsed.evidenceFor) ? parsed.evidenceFor.slice(0, 6).map(String) : [],
    evidenceAgainst: Array.isArray(parsed.evidenceAgainst) ? parsed.evidenceAgainst.slice(0, 6).map(String) : [],
    openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.slice(0, 6).map(String) : [],
    baseRate: typeof parsed.baseRate === 'string' ? parsed.baseRate.slice(0, 300) : undefined,
    referenceClass: typeof parsed.referenceClass === 'string' ? parsed.referenceClass.slice(0, 300) : undefined,
    preMortem: typeof parsed.preMortem === 'string' ? parsed.preMortem.slice(0, 300) : undefined,
    links,
  };
}

const SYSTEM = `You are an elite superforecaster running a bounded agentic research loop on a live question.
Each iteration you receive your CURRENT BELIEF STATE plus the next batch of evidence. Update the state — do not restart from scratch.

Every iteration MUST engage, in this order:
1. BASE RATE + REFERENCE CLASS: the outside-view frequency for this class of event, and the closest resolved analogues you know.
2. Actor incentives and credibility of commitments (who benefits, who can defect, are commitments binding?).
3. Evidence FOR and AGAINST from THIS batch — cite card ids.
4. PRE-MORTEM: assume the resolution fails; what killed it?
5. Open questions that would most move your estimate.

Output ONLY JSON:
{"p":<0-1 probability the QUESTION resolves YES>,"confidence":"low|medium|high","evidenceFor":["<card-id>: <what it shows>"],"evidenceAgainst":["<card-id>: <what it shows>"],"openQuestions":["<question that would move p>"],"baseRate":"<one line>","referenceClass":"<one line>","preMortem":"<one line>","links":{"<linkId>":<0-1 probability the link claim holds>}}`;

/**
 * Run the three agentic forecasters. `cards` are the run's evidence deck;
 * each forecaster consumes it in batches across iterations (private slices
 * dealt like the swarm, shared pool always visible). `uncertainties`
 * includes the question pseudo-link (QUESTION_LINK_ID) when a spec exists.
 */
export async function runAgenticForecasters(input: {
  question: string;
  questionSpec?: QuestionSpec | null;
  uncertainties: UncertainLink[];
  cards: SwarmSourceCard[];
  horizon?: string;
  marketContext?: string;
  runId?: string;
}): Promise<AgenticForecastResult> {
  const empty: AgenticForecastResult = {
    forecasts: [], validVotes: 0, familiesUsed: [], costUsd: 0, forecasters: [],
  };
  if (input.cards.length < 4) return { ...empty, skipped: 'insufficient_evidence_cards' };

  // Three forecasters on three DISTINCT families — pick the first alive
  // provider of each preferred family.
  let alive: LLMProvider[] = [];
  try {
    const suspended = await getSuspendedProviders();
    alive = getAvailableProviders().filter(p => !suspended.includes(p));
  } catch { /* fall through to defaults */ }
  const preferred: LLMProvider[] = ['glm', 'kimi', 'google', 'deepseek', 'freepool'];
  const pool = [...preferred.filter(p => alive.includes(p)), ...alive.filter(p => !preferred.includes(p)), ...preferred];
  const chosen: LLMProvider[] = [];
  const usedFamilies = new Set<string>();
  for (const p of pool) {
    const fam = familyOfProvider(p);
    if (usedFamilies.has(fam)) continue;
    usedFamilies.add(fam);
    chosen.push(p);
    if (chosen.length === 3) break;
  }
  if (chosen.length < 2) return { ...empty, skipped: 'insufficient_model_families' };

  // Evidence batches: shared top cards always visible; the rest dealt in
  // iteration-sized slices per forecaster.
  const rank = (c: SwarmSourceCard) => (c.relevance ?? 0) * 60 + c.qualityScore * 0.4;
  const sorted = [...input.cards].sort((a, b) => rank(b) - rank(a));
  const sharedCount = Math.max(3, Math.ceil(sorted.length * 0.35));
  const shared = sorted.slice(0, sharedCount);
  const rest = sorted.slice(sharedCount);
  const batchSize = Math.max(3, Math.ceil(rest.length / AGENTIC_MAX_ITERATIONS));
  const linkList = input.uncertainties.slice(0, 6)
    .map(u => `LINK #${u.linkId}${u.dependsOn != null ? ` (conditional on #${u.dependsOn})` : ''}: ${u.claim}`)
    .join('\n');
  const questionBlock = input.questionSpec?.resolvable !== false && input.questionSpec
    ? `OPERATIONALIZED RESOLUTION (the p you forecast): ${input.questionSpec.resolution}\nMETRIC: ${input.questionSpec.metric ?? 'n/a'} | SOURCE: ${input.questionSpec.dataSource ?? 'n/a'} | THRESHOLD: ${input.questionSpec.threshold ?? 'n/a'} | HORIZON: ${input.questionSpec.horizon ?? input.horizon ?? 'n/a'}\n`
    : '';
  const fmt = (cards: SwarmSourceCard[]) => cards.map(c => `[${c.id.slice(-6)}] (${c.qualityScore}/100) ${c.title}\n  ${c.excerpt.slice(0, 400)}`).join('\n');

  const forecasters: AgenticForecastResult['forecasters'] = [];
  // Per-forecaster vote buckets — the supervisor pass replaces one
  // forecaster's votes wholesale, so pooling needs provenance.
  const fvotes: Array<{ q?: ForecastVote; links: Array<{ linkId: number; vote: ForecastVote }> }> =
    chosen.map(() => ({ links: [] }));
  const finalBeliefs: Array<BeliefState | null> = chosen.map(() => null);
  let costUsd = 0;

  await Promise.allSettled(chosen.map(async (provider, fi) => {
    const family = familyOfProvider(provider);
    const myRest = rest.filter((_, i) => i % chosen.length === fi);
    const batches: SwarmSourceCard[][] = [];
    for (let i = 0; i < myRest.length; i += batchSize) batches.push(myRest.slice(i, i + batchSize));
    if (!batches.length) batches.push([]);

    let belief: BeliefState | null = null;
    let stable = 0;
    let iterations = 0;
    let lastP = -1;
    const rec: AgenticForecastResult['forecasters'][number] = { family, provider, iterations: 0, costUsd: 0 };

    for (let it = 0; it < AGENTIC_MAX_ITERATIONS; it++) {
      iterations = it + 1;
      const batch = batches[Math.min(it, batches.length - 1)];
      const user = [
        `RESEARCH QUESTION: ${input.question}\nHORIZON: ${input.horizon ?? 'see links'}\n${questionBlock}`,
        `UNCERTAIN LINKS:\n${linkList}`,
        `ITERATION ${it + 1}/${AGENTIC_MAX_ITERATIONS} — evidence batch ${Math.min(it + 1, batches.length)}/${batches.length}`,
        belief ? `CURRENT BELIEF STATE:\n${JSON.stringify({ p: belief.p, confidence: belief.confidence, evidenceFor: belief.evidenceFor, evidenceAgainst: belief.evidenceAgainst, openQuestions: belief.openQuestions, baseRate: belief.baseRate, referenceClass: belief.referenceClass, preMortem: belief.preMortem })}` : 'CURRENT BELIEF STATE: none — this is iteration 1, establish your prior from base rates first.',
        input.marketContext ? `MARKET REFERENCE (crowd price — information, NOT evidence):\n${input.marketContext}` : '',
        `SHARED EVIDENCE:\n${fmt(shared)}`,
        batch.length ? `NEW EVIDENCE BATCH:\n${fmt(batch)}` : '(no new evidence — final consolidation)',
      ].filter(Boolean).join('\n\n');

      try {
        const res = await callLLM({
          provider,
          task: 'fact_check',
          temperature: it === 0 ? 0.5 : 0.3,
          maxTokens: 1600,
          jsonMode: true,
          runId: input.runId,
          traceName: 'agentic_forecast',
          maxCostUsd: 0.04,
          messages: [
            { role: 'system', content: SYSTEM + (fi === 1 ? '\n\nYOUR PERSONA: geopolitical/institutional analyst — weight actor incentives and commitment credibility heavily.' : fi === 2 ? '\n\nYOUR PERSONA: quantitative analyst — weight base rates, reference classes and measurable series heavily.' : '') },
            { role: 'user', content: user },
          ],
        });
        rec.costUsd += res.costUsd ?? 0;
        costUsd += res.costUsd ?? 0;
        const next = parseBelief(res.content);
        if (!next) { rec.error = 'malformed_belief'; break; }
        if (belief && Math.abs(next.p - belief.p) < STABLE_DELTA && next.openQuestions.length === 0) stable++;
        else stable = 0;
        belief = next;
        lastP = next.p;
        if (stable >= STABLE_ITERS) break;
      } catch (err) {
        rec.error = err instanceof Error ? err.message.slice(0, 120) : 'call_failed';
        break;
      }
    }

    rec.iterations = iterations;
    rec.finalP = belief?.p;
    forecasters.push(rec);
    finalBeliefs[fi] = belief ?? null;
    if (!belief) return;

    // Question vote (confidence maps low/med/high → 50/75/95 pool scale).
    const conf = belief.confidence === 'high' ? 95 : belief.confidence === 'medium' ? 75 : 50;
    fvotes[fi].q = { claim: 'question', probability: belief.p, confidence: conf, origin: family };
    // Link votes.
    for (const u of input.uncertainties) {
      if (u.linkId === QUESTION_LINK_ID) continue;
      const p = belief.links[u.linkId];
      if (p == null) continue;
      fvotes[fi].links.push({
        linkId: u.linkId,
        vote: { claim: `link-${u.linkId}`, probability: p, confidence: conf, origin: family },
      });
    }
  }));

  // Pool per link into LinkForecast shape (same contract as the card swarm).
  const poolAll = () => {
    const questionVotes: ForecastVote[] = [];
    const linkVotes = new Map<number, ForecastVote[]>();
    for (const fv of fvotes) {
      if (fv.q) questionVotes.push(fv.q);
      for (const { linkId, vote } of fv.links) {
        const arr = linkVotes.get(linkId) ?? [];
        arr.push(vote);
        linkVotes.set(linkId, arr);
      }
    }
    const forecasts: LinkForecast[] = [];
    for (const u of input.uncertainties) {
      if (u.linkId === QUESTION_LINK_ID) continue;
      const votes = linkVotes.get(u.linkId);
      if (!votes?.length) continue;
      const calibrated = votes.map(v => ({
        ...v,
        probability: applyPlatt(v.probability, getFamilyPlatt(v.origin)),
      }));
      const pooled = poolForecasts(calibrated);
      if (!pooled) continue;
      const probs = votes.map(v => v.probability).sort((a, b) => a - b);
      const q1 = probs[Math.floor(probs.length * 0.25)] ?? probs[0];
      const q3 = probs[Math.floor(probs.length * 0.75)] ?? probs[probs.length - 1];
      forecasts.push({
        linkId: u.linkId,
        claim: u.claim,
        probability: Math.min(0.95, Math.max(0.05, pooled.pooled)),
        variance: probs.reduce((a, p) => a + (p - probs.reduce((s, x) => s + x, 0) / probs.length) ** 2, 0) / probs.length,
        iqr: q3 - q1,
        validVotes: votes.length,
        families: new Set(votes.map(v => v.origin)).size,
        contested: pooled.contested || q3 - q1 > 0.20,
      });
    }

    // Question forecast: pooled across the (≤3) forecasters.
    let questionForecast: AgenticForecastResult['questionForecast'];
    if (questionVotes.length) {
      const pooled = poolForecasts(questionVotes.map(v => ({
        ...v,
        probability: applyPlatt(v.probability, getFamilyPlatt(v.origin)),
      })));
      if (pooled) {
        const probs = questionVotes.map(v => v.probability).sort((a, b) => a - b);
        const iqr = (probs[Math.min(probs.length - 1, Math.floor(probs.length * 0.75))] ?? 0.5) - (probs[Math.floor(probs.length * 0.25)] ?? 0.5);
        questionForecast = {
          probability: Math.min(0.95, Math.max(0.05, pooled.pooled)),
          iqr,
          validVotes: questionVotes.length,
          families: new Set(questionVotes.map(v => v.origin)).size,
          contested: pooled.contested || iqr > 0.20,
        };
      }
    }
    return { forecasts, questionForecast };
  };

  let { forecasts, questionForecast } = poolAll();

  // SUPERVISOR (spec): question IQR > 0.20 → name the disagreement point,
  // one targeted adjudication call per forecaster, then a single re-pool.
  // Bounded: exactly one extra call per forecaster, best-effort.
  let supervisor: AgenticForecastResult['supervisor'];
  const iqrBefore = questionForecast?.iqr ?? 0;
  if (questionForecast && iqrBefore > 0.20 && finalBeliefs.some(Boolean)) {
    const ps = fvotes.map(fv => fv.q?.probability).filter((p): p is number => p != null);
    const lo = Math.min(...ps), hi = Math.max(...ps);
    const spread = `VOTER DISAGREEMENT: forecaster probabilities range ${lo.toFixed(2)}–${hi.toFixed(2)} (IQR ${iqrBefore.toFixed(2)}).`;
    let revised = 0;
    await Promise.allSettled(chosen.map(async (provider, fi) => {
      const prior = finalBeliefs[fi];
      if (!prior) return;
      const family = familyOfProvider(provider);
      try {
        const res = await callLLM({
          provider,
          task: 'fact_check',
          temperature: 0.2,
          maxTokens: 1600,
          jsonMode: true,
          runId: input.runId,
          traceName: 'agentic_forecast_supervisor',
          maxCostUsd: 0.04,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: [
              `RESEARCH QUESTION: ${input.question}\nHORIZON: ${input.horizon ?? 'see links'}\n${questionBlock}`,
              `UNCERTAIN LINKS:\n${linkList}`,
              `PRIOR BELIEF STATE:\n${JSON.stringify(prior)}`,
              spread,
              'ADJUDICATION PASS — final, one only: name the single most decision-relevant open question or evidence gap behind the disagreement, resolve it from your prior reasoning and the evidence you saw, then output your REVISED belief JSON. Keep base rates honest; do not anchor on the crowd.',
            ].filter(Boolean).join('\n\n') },
          ],
        });
        costUsd += res.costUsd ?? 0;
        const next = parseBelief(res.content);
        if (!next) return;
        finalBeliefs[fi] = next;
        revised++;
        const conf = next.confidence === 'high' ? 95 : next.confidence === 'medium' ? 75 : 50;
        fvotes[fi] = { links: [] };
        fvotes[fi].q = { claim: 'question', probability: next.p, confidence: conf, origin: family };
        for (const u of input.uncertainties) {
          if (u.linkId === QUESTION_LINK_ID) continue;
          const p = next.links[u.linkId];
          if (p == null) continue;
          fvotes[fi].links.push({
            linkId: u.linkId,
            vote: { claim: `link-${u.linkId}`, probability: p, confidence: conf, origin: family },
          });
        }
      } catch { /* supervisor pass is best-effort — prior votes stand */ }
    }));
    if (revised > 0) {
      ({ forecasts, questionForecast } = poolAll());
      supervisor = { triggered: true, iqrBefore, revised, iqrAfter: questionForecast?.iqr };
      console.log(`[agentic-forecasters] SUPERVISOR: IQR ${iqrBefore.toFixed(2)} > 0.20 — ${revised} forecaster(s) revised, IQR now ${(questionForecast?.iqr ?? 0).toFixed(2)}`);
    } else {
      supervisor = { triggered: true, iqrBefore, revised: 0, iqrAfter: iqrBefore };
    }
  }

  const totalVotes = forecasts.reduce((a, f) => a + f.validVotes, 0)
    + fvotes.filter(fv => fv.q).length;
  return {
    forecasts,
    questionForecast,
    forecasters,
    validVotes: totalVotes,
    familiesUsed: [...new Set(forecasters.map(f => f.family))],
    costUsd,
    supervisor,
  };
}
