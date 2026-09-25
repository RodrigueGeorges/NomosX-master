/**
 * SAFE Verifier — Search-Augmented Factuality Evaluation.
 *
 * Implements the DeepMind SAFE method (arXiv 2403.18802, NeurIPS 2024):
 * for each atomic claim, generate search queries, retrieve LIVE evidence
 * from the web, then rate the claim against that evidence with NLI.
 *
 * Why this exists: groundClaimsWithNLI verifies claims against the STORED
 * sources only. A claim can be perfectly true yet "unsupported" because its
 * cited source is a thin abstract. SAFE rescues genuinely-true claims and
 * catches genuinely-false ones by checking against fresh web evidence —
 * 72% agreement with human raters in the paper (superhuman on disagreements).
 *
 * Pipeline per claim:
 *   1. QUERY GEN: one batched LLM call generates 2 targeted queries per claim
 *   2. RETRIEVE: Tavily live search (top 4 per query)
 *   3. RATE: local NLI (Xenova DeBERTa) classifies claim vs concatenated evidence
 *   4. VERDICT: supported / contradicted / unverifiable
 *
 * Bounded: max claims, max queries/claim, max evidence chars — cost is
 * ~$0.001/claim (one shared LLM call + free local NLI + metered Tavily).
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { searchTavily } from '../providers/tavily-provider';
import { searchExa } from '../providers/exa-provider';
import { searchSearxng } from '../providers/searxng';
import { classifyNLI } from './nli-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SafeVerdict = 'supported' | 'contradicted' | 'unverifiable';

export interface SafeClaimResult {
  claim: string;
  verdict: SafeVerdict;
  confidence: number;          // NLI confidence for the verdict
  queries: string[];           // queries actually issued
  evidenceUrls: string[];      // urls that provided the decisive evidence
  evidenceSnippet: string | null;
  nliSource: 'local-nli' | 'embedding-fallback';
}

export interface SafeVerificationReport {
  results: SafeClaimResult[];
  supported: number;
  contradicted: number;
  unverifiable: number;
  total: number;
  /** supported / (supported + contradicted) — precision on decidable claims */
  precision: number;
  costUsd: number;
  searchCalls: number;
  durationMs: number;
}

export interface SafeVerifyOptions {
  maxClaims?: number;          // cap escalated claims (default 12)
  queriesPerClaim?: number;    // queries generated per claim (default 2)
  resultsPerQuery?: number;    // search hits per query (default 4)
  entailmentThreshold?: number;// NLI entailment → supported (default 0.55)
  contradictionThreshold?: number;
  timeoutMs?: number;          // whole-operation budget (default 120s)
}

// ─── Query generation (batched, one LLM call) ───────────────────────────────

const QUERY_GEN_PROMPT = `You are a fact-checking research assistant. For each numbered claim below, write {qpc} web search queries that would find independent evidence confirming or refuting it.

Rules:
- Queries must be self-contained (resolve pronouns, include key entities/dates).
- Prefer queries that target authoritative sources (reports, official data, academic).
- Return STRICT JSON only: {"queries": {"1": ["q1","q2"], "2": ["q1","q2"], ...}}

CLAIMS:
{claims}`;

async function generateVerificationQueries(
  claims: string[],
  queriesPerClaim: number,
): Promise<{ queries: Map<number, string[]>; costUsd: number }> {
  const map = new Map<number, string[]>();
  const numbered = claims.map((c, i) => `${i + 1}. ${c.slice(0, 300)}`).join('\n');

  try {
    const res = await callLLM({
      messages: [{
        role: 'user',
        content: QUERY_GEN_PROMPT
          .replace('{qpc}', String(queriesPerClaim))
          .replace('{claims}', numbered),
      }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 2500,
      enableCache: false,
      task: 'reader_v3', // cheap fast model — this is query rewriting, not reasoning
    });

    const parsed = parseJson<{ queries: Record<string, string[]> }>(res.content);
    if (parsed?.queries) {
      for (const [k, v] of Object.entries(parsed.queries)) {
        const idx = parseInt(k, 10);
        if (Number.isFinite(idx) && Array.isArray(v)) {
          map.set(idx - 1, v.filter(q => typeof q === 'string' && q.length > 5).slice(0, queriesPerClaim));
        }
      }
    }
    return { queries: map, costUsd: typeof res.costUsd === 'number' ? res.costUsd : 0 };
  } catch (err) {
    console.warn('[SAFE] Query generation failed, falling back to claim-as-query:', String(err).slice(0, 120));
    // Fallback: use the claim itself as the query
    claims.forEach((c, i) => map.set(i, [c.slice(0, 200)]));
    return { queries: map, costUsd: 0 };
  }
}

// ─── Evidence retrieval ─────────────────────────────────────────────────────

interface EvidenceHit {
  title: string;
  abstract: string;
  url: string;
  provider: string;
}

async function retrieveEvidence(queries: string[], resultsPerQuery: number): Promise<{ hits: EvidenceHit[]; calls: number }> {
  const hits: EvidenceHit[] = [];
  let calls = 0;

  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      // Tavily primary, Exa secondary, SearXNG as zero-cost floor —
      // both paid providers can be exhausted simultaneously (402/432),
      // metasearch keeps verification alive at lower precision.
      const [tav, exa] = await Promise.all([
        searchTavily(q, resultsPerQuery).catch(() => []),
        searchExa(q, Math.max(2, resultsPerQuery - 1)).catch(() => []),
      ]);
      calls += 2;
      let batch = [...(tav || []), ...(exa || [])];
      if (batch.length === 0) {
        const sx = await searchSearxng(q, resultsPerQuery).catch(() => []);
        calls += 1;
        batch = sx || [];
      }
      return batch;
    }),
  );

  const seenUrls = new Set<string>();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      const url = item?.url || '';
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      const text = item.abstract || item.content || item.snippet || '';
      if (text.length < 40) continue;
      hits.push({
        title: item.title || '',
        abstract: String(text).slice(0, 1200),
        url,
        provider: item.provider || 'web',
      });
    }
  }

  return { hits, calls };
}

// ─── LLM arbitration (SAFE's rating step) ───────────────────────────────────

const ARBITER_PROMPT = `You are a fact-check arbiter. Decide whether the EVIDENCE supports the CLAIM.

CLAIM: "{claim}"

EVIDENCE:
{evidence}

Rules:
- The evidence must ASSERT the claim itself. A source that merely reports that others claim it, or that debunks it, does NOT support it.
- Numbers/dates/entities must match; approximate agreement counts as partial support.
- Answer STRICT JSON: {"verdict": "supported" | "contradicted" | "unverifiable", "reason": "one sentence"}`;

async function arbitrateWithLLM(
  claim: string,
  nliVerdict: SafeVerdict,
  evidenceTexts: string[],
): Promise<SafeVerdict | null> {
  try {
    const res = await callLLM({
      messages: [{
        role: 'user',
        content: ARBITER_PROMPT
          .replace('{claim}', claim.slice(0, 400))
          .replace('{evidence}', evidenceTexts.map(e => `- ${e.slice(0, 900)}`).join('\n')),
      }],
      temperature: 0,
      jsonMode: true,
      maxTokens: 300,
      enableCache: false,
      task: 'reader_v3',
    });
    const parsed = parseJson<{ verdict: string }>(res.content);
    const v = parsed?.verdict;
    if (v === 'supported' || v === 'contradicted' || v === 'unverifiable') {
      if (v !== nliVerdict) {
        console.log(`[SAFE] Arbiter overrode NLI: ${nliVerdict} → ${v} for "${claim.slice(0, 60)}"`);
      }
      return v;
    }
  } catch {
    // Arbiter failure → keep the NLI verdict
  }
  return null;
}

// ─── Per-claim rating ───────────────────────────────────────────────────────

async function rateClaim(
  claim: string,
  queries: string[],
  opts: Required<Pick<SafeVerifyOptions, 'resultsPerQuery' | 'entailmentThreshold' | 'contradictionThreshold'>>,
): Promise<{ result: SafeClaimResult; calls: number }> {
  const { hits, calls } = await retrieveEvidence(queries, opts.resultsPerQuery);

  if (hits.length === 0) {
    return {
      result: {
        claim, verdict: 'unverifiable', confidence: 0.3,
        queries, evidenceUrls: [], evidenceSnippet: null, nliSource: 'local-nli',
      },
      calls,
    };
  }

  // Rate the claim against each evidence hit; keep the strongest verdict.
  // SAFE rates against aggregated evidence — we take the best entailment
  // and worst contradiction independently (a single strong contradiction
  // outweighs weak entailments).
  let bestEntailment = 0;
  let bestEntailmentIdx = -1;
  let bestContradiction = 0;
  let bestContradictionIdx = -1;
  let nliSource: 'local-nli' | 'embedding-fallback' = 'local-nli';
  let snippet: string | null = null;

  // Bound NLI calls: top 6 hits by abstract length (denser = more informative)
  const rankedHits = [...hits].sort((a, b) => b.abstract.length - a.abstract.length).slice(0, 6);
  const nliResults = await Promise.allSettled(
    rankedHits.map(h => classifyNLI(claim, `${h.title}. ${h.abstract}`)),
  );

  nliResults.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const nli = r.value;
    nliSource = nli.source;
    if (nli.scores.entailment > bestEntailment) {
      bestEntailment = nli.scores.entailment;
      bestEntailmentIdx = i;
      snippet = nli.evidenceSnippet ?? rankedHits[i].abstract.slice(0, 200);
    }
    if (nli.scores.contradiction > bestContradiction) {
      bestContradiction = nli.scores.contradiction;
      bestContradictionIdx = i;
    }
  });

  const bestEntailmentHit = bestEntailmentIdx >= 0 ? rankedHits[bestEntailmentIdx] : null;
  const bestContradictionHit = bestContradictionIdx >= 0 ? rankedHits[bestContradictionIdx] : null;

  let verdict: SafeVerdict = 'unverifiable';
  let confidence = Math.max(bestEntailment, bestContradiction);

  // Contradiction wins only when clearly stronger than any support
  if (bestContradiction >= opts.contradictionThreshold && bestContradiction > bestEntailment + 0.15) {
    verdict = 'contradicted';
    snippet = bestContradictionHit ? bestContradictionHit.abstract.slice(0, 200) : snippet;
  } else if (bestEntailment >= opts.entailmentThreshold) {
    verdict = 'supported';
  }

  // LLM arbitration (SAFE's actual design): NLI alone cannot distinguish
  // "the source ASSERTS X" from "the source REPORTS that someone claims X" —
  // debunking pages contain the claim text and trigger entailment. When NLI
  // produced a decisive verdict, one cheap LLM call confirms it by reasoning
  // over the claim + decisive evidence (this is what the paper does end-to-end).
  if (verdict !== 'unverifiable') {
    const decisive = verdict === 'contradicted' ? bestContradictionHit : bestEntailmentHit;
    if (decisive) {
      const arbiter = await arbitrateWithLLM(claim, verdict, [
        `${decisive.title}. ${decisive.abstract}`,
      ]);
      if (arbiter) {
        verdict = arbiter;
        if (verdict === 'unverifiable') confidence = Math.min(confidence, 0.5);
      }
    }
  }

  const evidenceUrls = [
    ...(bestEntailmentHit ? [bestEntailmentHit.url] : []),
    ...(bestContradictionHit && verdict === 'contradicted' ? [bestContradictionHit.url] : []),
  ];

  return {
    result: {
      claim, verdict, confidence, queries,
      evidenceUrls, evidenceSnippet: snippet, nliSource,
    },
    calls,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Verify a set of atomic claims against LIVE web search (SAFE method).
 * Use for claims that stored-source grounding could not confirm —
 * the point is not to re-check what is already supported, but to
 * rescue or condemn the doubtful tail.
 */
export async function verifyClaimsWithLiveSearch(
  claims: string[],
  options?: SafeVerifyOptions,
): Promise<SafeVerificationReport> {
  const start = Date.now();
  const maxClaims = options?.maxClaims ?? 12;
  const queriesPerClaim = options?.queriesPerClaim ?? 2;
  const resultsPerQuery = options?.resultsPerQuery ?? 4;
  const entailmentThreshold = options?.entailmentThreshold ?? 0.55;
  const contradictionThreshold = options?.contradictionThreshold ?? 0.6;
  const timeoutMs = options?.timeoutMs ?? 120_000;

  const bounded = claims.slice(0, maxClaims);
  if (bounded.length === 0) {
    return {
      results: [], supported: 0, contradicted: 0, unverifiable: 0, total: 0,
      precision: 0, costUsd: 0, searchCalls: 0, durationMs: 0,
    };
  }

  console.log(`[SAFE] Verifying ${bounded.length}/${claims.length} claims against live search`);

  // Step 1: batched query generation (single LLM call)
  const { queries: queryMap, costUsd } = await generateVerificationQueries(bounded, queriesPerClaim);

  // Step 2+3: retrieve + rate each claim, with an overall time budget
  const results: SafeClaimResult[] = [];
  let searchCalls = 0;

  const deadline = start + timeoutMs;
  const pending = bounded.map((claim, i) => ({ claim, i }));

  // Process with bounded concurrency (4 claims at a time)
  const CONCURRENCY = 4;
  while (pending.length > 0) {
    if (Date.now() > deadline) {
      console.warn(`[SAFE] Timeout budget reached — ${pending.length} claims left unverified`);
      for (const p of pending) {
        results.push({
          claim: p.claim, verdict: 'unverifiable', confidence: 0.2,
          queries: [], evidenceUrls: [], evidenceSnippet: null, nliSource: 'local-nli',
        });
      }
      break;
    }
    const slice = pending.splice(0, CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map(async ({ claim, i }) => {
        const queries = queryMap.get(i) ?? [claim.slice(0, 200)];
        return rateClaim(claim, queries, { resultsPerQuery, entailmentThreshold, contradictionThreshold });
      }),
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        results.push(r.value.result);
        searchCalls += r.value.calls;
      }
    }
  }

  const supported = results.filter(r => r.verdict === 'supported').length;
  const contradicted = results.filter(r => r.verdict === 'contradicted').length;
  const unverifiable = results.filter(r => r.verdict === 'unverifiable').length;
  const decidable = supported + contradicted;
  const precision = decidable > 0 ? supported / decidable : 0;

  console.log(`[SAFE] ${supported} supported, ${contradicted} contradicted, ${unverifiable} unverifiable → precision ${(precision * 100).toFixed(0)}% (${searchCalls} search calls, $${costUsd.toFixed(4)}, ${((Date.now() - start) / 1000).toFixed(1)}s)`);

  return {
    results, supported, contradicted, unverifiable,
    total: results.length, precision, costUsd, searchCalls,
    durationMs: Date.now() - start,
  };
}
