/**
 * SWARM FORECASTER — OT-4.
 *
 * Independent LLM forecasters vote per uncertain causal-chain link — never
 * on the narrative. Diversity comes from three crossed axes (silicon-crowd
 * lesson: correlated errors kill naive ensembles):
 *   - model family (glm / google / deepseek rotation, provider override)
 *   - evidence slice (shared pool + disjoint private slice per voter)
 *   - lens (economic / geopolitical / technological / social framing)
 *   - formulation (half the voters assess the negation — cancels the
 *     acquiescence bias documented for LLM ensembles)
 *
 * Aggregation is confidence-weighted log-odds pooling (leap-aggregation) —
 * no deliberation, per the KalshiBench finding that independent aggregation
 * beats consensus. Output is a mean + variance per link; the Monte Carlo
 * elector (OT-5) consumes these as Beta parameters.
 *
 * A malformed vote is a null vote — strict JSON, no repair, no guessing.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { poolForecasts, type ForecastVote } from './leap-aggregation';
import type { LLMProvider } from '../llm/unified-llm';

export interface SwarmSourceCard {
  id: string;
  title: string;
  excerpt: string;
  qualityScore: number;
}

export interface UncertainLink {
  linkId: number;
  claim: string;
}

export interface LinkForecast {
  linkId: number;
  claim: string;
  /** P(link resolves as claimed) — pooled, pre-calibration. */
  probability: number;
  /** Variance of raw vote probabilities — feeds the Beta fit. */
  variance: number;
  iqr: number;
  validVotes: number;
  families: number;
  contested: boolean;
}

export interface SwarmResult {
  forecasts: LinkForecast[];
  rawVotes: number;
  validVotes: number;
  familiesUsed: string[];
  costUsd: number;
  skipped?: string;
}

const VOTER_PROVIDERS: LLMProvider[] = ['glm', 'google', 'deepseek'];
const LENSES = [
  'economic incentives and resource constraints',
  'geopolitical alignment and institutional capacity',
  'technological feasibility and adoption curves',
  'social adoption and behavioral responses',
] as const;

interface RawVote {
  linkId: number;
  probability: number; // already sign-corrected (negation inverted)
  confidence: number;  // 1 | 1.5 | 2
  voterId: string;
  family: string;
  negated: boolean;
}

function formatCards(cards: SwarmSourceCard[], tag: string): string {
  return cards.map(c => `[${tag}-${c.id.slice(-6)}] (${c.qualityScore}/100 q) ${c.title}\n  ${c.excerpt.slice(0, 350)}`).join('\n');
}

/** Shared pool = top-quality cards; private slices dealt round-robin. */
function partition(cards: SwarmSourceCard[], voters: number) {
  const sorted = [...cards].sort((a, b) => b.qualityScore - a.qualityScore);
  const sharedCount = Math.max(2, Math.ceil(sorted.length * 0.4));
  const shared = sorted.slice(0, sharedCount);
  const rest = sorted.slice(sharedCount);
  const slices: SwarmSourceCard[][] = Array.from({ length: voters }, () => []);
  rest.forEach((c, i) => slices[i % voters].push(c));
  return { shared, slices };
}

async function loadCards(sourceIds: string[]): Promise<SwarmSourceCard[]> {
  if (!sourceIds.length) return [];
  try {
    const { prisma } = await import('../db');
    const rows = await prisma.source.findMany({
      where: { id: { in: sourceIds.slice(0, 40) } },
      select: { id: true, title: true, abstract: true, qualityScore: true },
      orderBy: { qualityScore: 'desc' },
    });
    return rows.map(s => ({
      id: s.id,
      title: s.title,
      excerpt: (s.abstract ?? s.title ?? '').slice(0, 400),
      qualityScore: s.qualityScore ?? 50,
    }));
  } catch {
    return [];
  }
}

/**
 * Run the independent-voter swarm over the uncertain links.
 * Bounded: `voters` calls per link, short prompts, cheap providers.
 */
export async function runSwarmVote(input: {
  question: string;
  uncertainties: UncertainLink[];
  sourceIds: string[];
  horizon?: string;
  voters?: number;
  runId?: string;
}): Promise<SwarmResult> {
  const voterCount = Math.min(25, Math.max(8, input.voters ?? 15));
  const cards = await loadCards(input.sourceIds);
  if (cards.length < 4) {
    return { forecasts: [], rawVotes: 0, validVotes: 0, familiesUsed: [], costUsd: 0, skipped: 'insufficient_evidence_cards' };
  }
  const { shared, slices } = partition(cards, voterCount);
  const sharedBlock = formatCards(shared, 'SHARED');

  // Rotate over providers that are actually alive — the hardcoded trio
  // (glm/google/deepseek) silently routes 2/3 of ballots through fallback
  // chains whenever google/deepseek are suspended (the production default),
  // which both slows the vote and fakes family diversity that isn't there.
  let voterProviders: LLMProvider[] = VOTER_PROVIDERS;
  try {
    const { getAvailableProviders, getSuspendedProviders } = await import('../llm/unified-llm');
    const suspended = await getSuspendedProviders();
    const alive = getAvailableProviders().filter(p => !suspended.includes(p));
    if (alive.length > 0) {
      // Prefer the canonical trio when alive, then fill with any other
      // alive provider so the rotation always spans real families.
      const preferred = VOTER_PROVIDERS.filter(p => alive.includes(p));
      const extras = alive.filter(p => !preferred.includes(p));
      voterProviders = [...preferred, ...extras];
      if (voterProviders.length === 0) voterProviders = VOTER_PROVIDERS;
    }
  } catch { /* keep canonical rotation */ }

  const votes: RawVote[] = [];
  let costUsd = 0;
  let rawVotes = 0;

  {
    // One call per voter covers ALL uncertain links — cheaper than
    // link×voter and keeps votes comparable across the chain.
    const tasks = input.uncertainties.slice(0, 4)
      .map(u => `LINK #${u.linkId}: ${u.claim}`)
      .join('\n');

    const settled = await Promise.allSettled(
      Array.from({ length: voterCount }, async (_, i) => {
        const provider = voterProviders[i % voterProviders.length];
        const negated = i % 2 === 1;
        const lens = LENSES[i % LENSES.length];
        const privateBlock = formatCards(slices[i], `V${i}-PRIVATE`);
        const subject = negated
          ? `For EACH link below, estimate the probability that the OPPOSITE of the claim occurs (i.e., the claim FAILS).`
          : `For EACH link below, estimate the probability that the claim as stated comes to pass.`;

        const res = await callLLM({
          provider,
          task: 'fact_check',
          temperature: 0.4,
          maxTokens: 500,
          jsonMode: true,
          runId: input.runId,
          traceName: 'swarm_forecast_vote',
          maxCostUsd: 0.02,
          messages: [
            {
              role: 'system',
              content: `You are an independent superforecaster. ${subject}
Method (mandatory order):
1. State the base rate for this CLASS of event from general knowledge.
2. Weigh the evidence cards FOR and AGAINST, citing card ids.
3. Emit a probability strictly between 0.02 and 0.98 and a confidence in {1, 1.5, 2}.
Lens for this ballot: ${lens}.
Return ONLY JSON: {"votes":[{"linkId":<number>,"probability":<0-1>,"confidence":<1|1.5|2>,"citedCards":["<card-id>",...],"baseRate":<0-1>}],"reasoning":"<2 sentences>"}`,
            },
            {
              role: 'user',
              content: `QUESTION: ${input.question}\nHORIZON: ${input.horizon ?? 'see links'}\n\nUNCERTAIN LINKS:\n${tasks}\n\nSHARED EVIDENCE:\n${sharedBlock}\n\nYOUR PRIVATE EVIDENCE SLICE:\n${privateBlock || '(none — rely on shared pool and base rates)'}`,
            },
          ],
        });
        costUsd += res.costUsd ?? 0;
        rawVotes++;
        const parsed = parseJson<{ votes?: Array<{ linkId?: number; probability?: number; confidence?: number; citedCards?: string[] }> }>(res.content);
        const arr = parsed?.votes;
        if (!Array.isArray(arr)) return;
        for (const v of arr) {
          const linkId = Number(v.linkId);
          const p = Number(v.probability);
          if (!Number.isFinite(linkId) || !Number.isFinite(p) || p <= 0 || p >= 1) continue;
          const corrected = negated ? 1 - p : p;
          votes.push({
            linkId,
            probability: Math.min(0.98, Math.max(0.02, corrected)),
            confidence: [1, 1.5, 2].includes(Number(v.confidence)) ? Number(v.confidence) : 1,
            voterId: `v${i}`,
            family: res.provider ?? provider,
            negated,
          });
        }
      })
    );
    void settled; // per-voter failures are tolerated — a null vote, not a crash
  }

  // Aggregate per link: confidence-weighted log-odds pooling + spread stats.
  const forecasts: LinkForecast[] = [];
  const familiesUsed = [...new Set(votes.map(v => v.family))];
  for (const link of input.uncertainties.slice(0, 4)) {
    const linkVotes = votes.filter(v => v.linkId === link.linkId);
    if (!linkVotes.length) continue;
    const fv: ForecastVote[] = linkVotes.map(v => ({
      claim: `link-${link.linkId}`,
      probability: v.probability,
      // confidence {1,1.5,2} → poolForecasts scale [20,95]
      confidence: v.confidence === 2 ? 95 : v.confidence === 1.5 ? 75 : 50,
      origin: v.voterId,
    }));
    const pooled = poolForecasts(fv);
    if (!pooled) continue;
    const probs = linkVotes.map(v => v.probability).sort((a, b) => a - b);
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    const variance = probs.reduce((a, b) => a + (b - mean) ** 2, 0) / probs.length;
    const q1 = probs[Math.floor(probs.length * 0.25)] ?? mean;
    const q3 = probs[Math.floor(probs.length * 0.75)] ?? mean;
    forecasts.push({
      linkId: link.linkId,
      claim: link.claim,
      probability: pooled.pooled,
      variance,
      iqr: q3 - q1,
      validVotes: linkVotes.length,
      families: new Set(linkVotes.map(v => v.family)).size,
      contested: pooled.contested,
    });
  }

  return {
    forecasts,
    rawVotes,
    validVotes: votes.length,
    familiesUsed,
    costUsd,
  };
}
