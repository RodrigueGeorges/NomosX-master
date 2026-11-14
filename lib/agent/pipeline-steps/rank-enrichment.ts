/**
 * RANK + ENRICHMENT — STEP 4: rank → pertinence selection (quality bar +
 * elbow detection) → source-quality rerank → domain relevance filter →
 * abort-on-empty → adaptive enrichment reasoning (targeted re-scout,
 * refusal-retry with reformulation) → orchState source stats → evidence
 * registry.
 *
 * Refusal paths return `{ refused: true }`; the caller performs the early
 * pipeline return (idempotency cleanup + result object). `topSources` is
 * mutated in place (loadBearing tags, composite rerank, enriched push).
 */

import { rankSourcesByQuality } from '../source-quality';
import { createHash } from 'node:crypto';
import { assessEvidenceSufficiency } from '../enrichment-reasoner';
import type { PipelineStep } from '../pipeline-progress';
import type { Providers } from './provider-lists';
import type { RankOptions } from '../pipeline-v2';
import { recordDegradedStep } from '../degraded-steps';

export interface RankEnrichmentDeps {
  query: string;
  allSourceIds: string[];
  isStrategic: boolean;
  rankOptions: RankOptions | undefined;
  providers: Providers;
  stats: Record<string, any>;
  label: string;
  pipelineStart: number;
  runningCostUsd: number;
  skipRetrieval?: boolean;
  pipelineRunId: string;
  rank: (query: string, opts: any) => Promise<any[]>;
  scout: (q: string, provs: Providers, perProv: number) => Promise<any>;
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  addCost: (usd: number | undefined, step: string) => void;
  ctx: {
    setRankedSources: (ids: string[]) => void;
    recordAgentTiming: (agent: string, ms: number) => void;
    getSummary: () => any;
    addFinding: (agent: string, type: 'gap' | 'warning' | 'insight' | 'recommendation', content: string, metadata?: Record<string, unknown>) => void;
  };
  orchState: {
    sourcesFound: number;
    avgQualityScore: number;
  };
}

export interface RankEnrichmentResult {
  refused: boolean;
  topSources: any[];
  allSourceIds: string[];
  evidenceRegistry: any;
  /** spread base for downstream gap-fill re-ranks */
  rankOpts: RankOptions;
}

export async function runRankAndEnrichment(deps: RankEnrichmentDeps): Promise<RankEnrichmentResult> {
  const {
    query, isStrategic, rankOptions, providers, stats, label, pipelineStart,
    runningCostUsd, pipelineRunId, rank, scout, emitProgress, addCost, ctx,
    orchState,
  } = deps;
  let allSourceIds = deps.allSourceIds;

  // ── STEP 4: RANK (scoped to current SCOUT sourceIds) ──
  // Adaptive diversity: relax constraints when source pool is small (niche/emerging topics)
  const sourcePoolSize = allSourceIds.length;
  const adaptiveMaxPerProvider = isStrategic
    ? (sourcePoolSize < 30 ? 20 : sourcePoolSize < 100 ? 15 : 12)
    : (sourcePoolSize < 15 ? 12 : sourcePoolSize < 30 ? 8 : 8);
  const adaptiveMinDiversity = sourcePoolSize < 10 ? 1 : sourcePoolSize < 30 ? 2 : 3;
  const adaptiveMaxPerYear = isStrategic ? 15 : 8;
  const rankOpts: RankOptions = isStrategic ? {
    limit: 300, // technical ceiling, NOT a target — pertinence selection cuts where quality drops
    mode: "balanced",
    sourceIds: allSourceIds,
    requireAbstract: false,
    minAbstractLength: 0,
    minQuality: 0,
    maxPerProvider: adaptiveMaxPerProvider,
    maxPerYear: adaptiveMaxPerYear,
    minProviderDiversity: adaptiveMinDiversity,
    ...rankOptions,
  } : {
    limit: 100, // technical ceiling — pertinence selection cuts where quality drops
    mode: "quality",
    sourceIds: allSourceIds,
    minQuality: 0,
    requireAbstract: sourcePoolSize >= 20,
    minAbstractLength: sourcePoolSize >= 20 ? 150 : 0,
    maxPerProvider: adaptiveMaxPerProvider,
    maxPerYear: adaptiveMaxPerYear,
    minProviderDiversity: adaptiveMinDiversity,
  };

  emitProgress(pipelineRunId, "RANK", "started", `Ranking candidates from ${allSourceIds.length} SCOUT sources...`);
  console.log(`${label} RANK: scoring candidates from ${allSourceIds.length} SCOUT sources (ceiling ${rankOpts.limit})`);
  const rankedCandidates = await rank(query, rankOpts);

  // ── PERTINENCE SELECTION — keep exactly what is relevant, no arbitrary cut ──
  // The system's role: take ALL sources that are genuinely pertinent, drop the rest.
  // Deterministic: relative quality bar + elbow detection on the score distribution.
  let topSources = rankedCandidates;
  const rejectedSourceIds = new Set<string>();
  // Fixed-corpus mode (regen): the seeds are ALREADY the curated topSources of
  // the prior attempt — re-applying the pertinence cut silently shrinks the
  // rewrite's evidence base (observed: 49 seeds → 25 kept → regen critic 68→26).
  if (!deps.skipRetrieval && rankedCandidates.length > 0) {
    const scores = rankedCandidates.map((s: any) => s.compositeScore ?? 0);
    const topScore = scores[0];
    // Quality bar: a source is pertinent if it holds at least 55% of the best score
    // (and an absolute floor of 30/100 to never keep junk on weak pools)
    const qualityBar = Math.max(30, topScore * 0.55);
    let cutIndex = scores.findIndex((sc: number) => sc < qualityBar);
    if (cutIndex === -1) cutIndex = rankedCandidates.length; // everything is pertinent

    // Elbow detection: if the score drops >25% between two consecutive sources
    // (after a minimum of 20 kept), the pertinence cliff is there — cut at the cliff.
    const minKeep = Math.min(20, rankedCandidates.length);
    for (let i = minKeep; i < cutIndex; i++) {
      if (scores[i - 1] > 0 && (scores[i - 1] - scores[i]) / scores[i - 1] > 0.25) {
        cutIndex = i;
        break;
      }
    }

    topSources = rankedCandidates.slice(0, cutIndex);
    console.log(`${label} PERTINENCE SELECTION: kept ${topSources.length}/${rankedCandidates.length} candidates (bar=${qualityBar.toFixed(1)}, top=${topScore.toFixed(1)}, cutoff score=${scores[Math.min(cutIndex, scores.length - 1)]?.toFixed(1) ?? 'n/a'})`);

    // ── SOURCE QUALITY RERANK — boost top sources by reliability, recency, richness ──
    try {
      const qualityScored = await rankSourcesByQuality(topSources);
      for (const qs of qualityScored) {
        const match = topSources.find((s: any) => s.id === qs.source.id);
        if (match) {
          (match as any).sourceQuality = qs.score;
          (match as any).compositeScore = ((match as any).compositeScore ?? 0) * 0.6 + qs.score.overall * 0.4;
          // Backfill: sources whose provider score is missing/zero otherwise
          // average into every pool metric as 0 (the 50% blend term reads
          // s.qualityScore everywhere) despite a richer score existing here.
          if (!match.qualityScore) (match as any).qualityScore = qs.score.overall;
        }
      }
      // Same deterministic tie-break as enhanced-ranker: composite ties keep
      // input order otherwise, and input order is not stable across DB writes.
      topSources.sort((a: any, b: any) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0)
        || String(a.id ?? '').localeCompare(String(b.id ?? '')));
      console.log(`${label} SOURCE QUALITY: re-ranked ${topSources.length} by composite (relevance 60% + quality 40%)`);
    } catch (err) {
      console.warn(`${label} SOURCE QUALITY: re-rank failed (non-blocking):`, err);
      recordDegradedStep(stats, 'SOURCE_QUALITY_RERANK', err);
    }

    // ── QUALITY TAIL TRIM — drop the low-quality tail on abundant corpora ──
    // The pertinence cut filters on RELEVANCE, not quality — a 49-source pool
    // keeps a long tail of <40-quality sources that (a) drags the pool average
    // (50% of the quality blend), (b) hands the critic weak-evidence targets,
    // and (c) burns reader extraction budget. Sources are composite-sorted, so
    // the tail is the least relevant anyway — trimming it is pure gain when
    // the corpus is abundant. Floors: keep ≥20, never drop above floor 40.
    if (topSources.length > 25) {
      const QUALITY_TAIL_FLOOR = 40;
      const MIN_KEEP = 20;
      const before = topSources.length;
      const kept: any[] = [];
      // Provider-singleton guard: a low-quality source that is the ONLY
      // representative of its provider still carries diversity — dropping it
      // would shrink providerDiversity (a trust term) and hand the critic a
      // confirmation-bias finding. Keep singletons regardless of score.
      const providerCounts = new Map<string, number>();
      for (const s of topSources) {
        const p = String(s.provider ?? 'unknown');
        providerCounts.set(p, (providerCounts.get(p) ?? 0) + 1);
      }
      let droppedTail = 0;
      for (const s of topSources) {
        const effectiveQ = (s.qualityScore || 0) > 0 ? s.qualityScore : ((s as any).sourceQuality?.overall ?? 0);
        const canDrop = topSources.length - droppedTail > MIN_KEEP;
        const isProviderSingleton = (providerCounts.get(String(s.provider ?? 'unknown')) ?? 0) <= 1;
        if (canDrop && !isProviderSingleton && effectiveQ > 0 && effectiveQ < QUALITY_TAIL_FLOOR) {
          droppedTail++;
          continue;
        }
        kept.push(s);
      }
      if (droppedTail > 0) {
        topSources = kept;
        stats.qualityTailTrim = { dropped: droppedTail, floor: QUALITY_TAIL_FLOOR, before, after: topSources.length };
        console.log(`${label} QUALITY TAIL TRIM: dropped ${droppedTail} sources <${QUALITY_TAIL_FLOOR}/100 quality — ${topSources.length} remain (avg improves)`);
      }
    }
  }

  // ── DOMAIN RELEVANCE FILTER — remove off-topic sources ──
  // Energy/electricity sources should not appear in finance reports, and vice versa.
  // This prevents the QUANT agent's data providers from polluting non-energy reports.
  const queryLower = query.toLowerCase();
  const isFinanceQuery = /\b(debt|fiscal|treasury|budget|deficit|spending|tax|bond|yield|interest rate|monetary|banking|finance|leverage|systemic|credit|central bank|fed|ecb|basel|inflation|currency|exchange rate|financial)\b/.test(queryLower);
  const isEnergyQuery = /\b(energy|electricity|power|grid|datacenter|data center|nuclear|renewable|solar|wind|gas|oil|petroleum|coal|hydrogen)\b/.test(queryLower);
  const isClimateQuery = /\b(co2|carbon|emission|climate|greenhouse|warming|pollution)\b/.test(queryLower);
  const offTopicProviders = new Set<string>();
  if (isFinanceQuery && !isEnergyQuery) {
    ['energy-charts', 'smard', 'rte-france', 'energi-data', 'fingrid', 'entsoe', 'entsog', 'iea', 'irena', 'acea'].forEach(p => offTopicProviders.add(p));
  }
  if (isFinanceQuery && !isClimateQuery) {
    ['energi-data', 'eea', 'ademe'].forEach(p => offTopicProviders.add(p));
  }
  if (isEnergyQuery && !isFinanceQuery) {
    ['treasury-fiscal', 'fred', 'ecb', 'eib', 'bis', 'imf', 'worldbank', 'oecd'].forEach(p => offTopicProviders.add(p));
  }
  if (offTopicProviders.size > 0 && topSources.length > 0) {
    const before = topSources.length;
    topSources = topSources.filter((s: any) => !offTopicProviders.has(s.provider));
    if (topSources.length < before) {
      console.log(`${label} DOMAIN FILTER: removed ${before - topSources.length} off-topic sources (${[...offTopicProviders].join(', ')})`);
    }
  }

  // ── SEMANTIC RELEVANCE SCREEN — LLM topical-fit pass before the reader ──
  // Keyword-overlap ranking lets semantically drifted sources through (a live
  // run measured 5.9% relevant under the critic's keyword check). One cheap
  // batch call scores each candidate 0-3; off-topic sources are dropped
  // BEFORE they consume a reader extraction slot — saves tokens AND lifts
  // corpus precision (the Elicit pattern: screen before extract).
  // Skipped in fixed-corpus mode: seeds were screened during the original run.
  // screenedSourceIds tracks every doc the screen has judged — later
  // enrichment merges (CRAG, enrichment, refusal-retry, snowball) add UNSCREENED
  // docs that get one bounded late screen before the reader (audit item:
  // screening new additions across every later enrichment path).
  const screenedSourceIds = new Set<string>();
  let lateAdditions = false;
  if (!deps.skipRetrieval && topSources.length > 25) {
    try {
      const { callLLM } = await import('../../llm/unified-llm');
      const { parseJson } = await import('../json-utils');
      const screened = topSources.slice(0, 60);
      for (const s of screened) screenedSourceIds.add(s.id);
      const listing = screened
        .map((s: any, i: number) => `${i}: ${(s.title || 'untitled').slice(0, 120)} — ${(s.abstract || '').replace(/\s+/g, ' ').slice(0, 160)}`)
        .join('\n');
      const rel = await callLLM({
        messages: [
          { role: 'system', content: 'You are a research librarian. Score topical relevance precisely. Output JSON only.' },
          {
            role: 'user',
            content: `RESEARCH QUESTION: "${query}"\n\nScore each numbered source:\n0 = off-topic (does not inform the question)\n1 = tangential (related domain, no usable evidence)\n2 = relevant\n3 = core evidence\nReturn {"scores":{"0":2,"1":0,...}} covering every index 0-${screened.length - 1}.\n\n${listing}`,
          },
        ],
        temperature: 0,
        jsonMode: true,
        maxTokens: 1200,
        enableCache: true,
        task: 'topic_classification',
      });
      addCost(rel.costUsd, 'RELEVANCE_SCREEN');
      const parsed = parseJson<{ scores?: Record<string, number> }>(rel.content);
      if (parsed?.scores && Object.keys(parsed.scores).length > 0) {
        const dropIdx = new Set<number>();
        const tangIdx = new Set<number>();
        let correctEarly = 0;
        screened.forEach((s: any, i: number) => {
          const sc = parsed.scores?.[String(i)];
          if (sc === 0) {
            dropIdx.add(i);
            rejectedSourceIds.add(s.id);
          } else if (sc === 1) {
            tangIdx.add(i);
          } else if (typeof sc === 'number' && sc >= 2) {
            correctEarly++;
          }
        });
        // Strict triage (CTO lever 2): tangential sources carry no usable
        // evidence — drop them once the corpus holds ≥8 core sources.
        // Below that floor they stay: evidence mass beats precision.
        const TANGENTIAL_FLOOR = 8;
        const dropTangential = correctEarly >= TANGENTIAL_FLOOR;
        if (dropTangential) {
          screened.forEach((s: any, i: number) => { if (tangIdx.has(i) && s?.id) rejectedSourceIds.add(s.id); });
        }
        const effectiveDrop = dropTangential ? new Set([...dropIdx, ...tangIdx]) : dropIdx;
        // Safety floor: insufficient relevant evidence must trigger enrichment,
        // never restoration of documents explicitly judged off-topic.
        const mustRestore = 0;
        if (effectiveDrop.size > 0) {
          const wasDrop0 = dropIdx.size;
          const wasDrop1 = dropTangential ? tangIdx.size : 0;
          topSources = topSources.filter((_s: any, i: number) => !effectiveDrop.has(i));
          stats.relevanceScreen = { screened: screened.length, dropped: wasDrop0, tangentialDropped: wasDrop1, restoredAtFloor: mustRestore, costUsd: rel.costUsd };
          console.log(`${label} RELEVANCE SCREEN: dropped ${wasDrop0} off-topic${wasDrop1 > 0 ? ` + ${wasDrop1} tangential` : ''} sources — ${topSources.length} proceed to reader`);
          ctx.addFinding('RANK', 'insight', `Semantic relevance screen removed ${wasDrop0 + wasDrop1}/${screened.length} low-relevance candidates before extraction`);
        } else {
          stats.relevanceScreen = { screened: screened.length, dropped: 0, costUsd: rel.costUsd };
          console.log(`${label} RELEVANCE SCREEN: all ${screened.length} screened candidates topically relevant`);
        }

        // ── CRAG gradation (Yan et al. 2024) — the screen distinguishes
        // correct (≥2) from ambiguous (1, tangential) evidence. A corpus
        // dominated by ambiguous docs must not sail through as if relevant:
        // one bounded re-scout for core evidence, merged through re-rank.
        const ambiguousCount = screened.filter((_s, i) => parsed.scores?.[String(i)] === 1).length;
        const correctCount = screened.filter((_s, i) => Number(parsed.scores?.[String(i)]) >= 2).length;
        stats.relevanceScreen = { ...(stats.relevanceScreen ?? {}), correct: correctCount, ambiguous: ambiguousCount };
        if (!deps.skipRetrieval && ambiguousCount >= Math.max(5, correctCount)) {
          const cragQuery = `${query} — primary evidence, official records, empirical data`;
          console.log(`${label} RELEVANCE SCREEN: corpus dominated by tangential evidence (${ambiguousCount} ambiguous vs ${correctCount} core) — CRAG re-scout for core evidence`);
          ctx.addFinding('RANK', 'warning', `Corpus dominated by tangential evidence: ${ambiguousCount} ambiguous vs ${correctCount} core after screening`);
          try {
            const res = await scout(cragQuery, providers, isStrategic ? 15 : 10);
            const newIds = Array.isArray(res) ? res.map((s: any) => s.id) : (res?.sourceIds || []);
            const fresh = newIds.filter((id: string) => !allSourceIds.includes(id) && !rejectedSourceIds.has(id));
            if (fresh.length > 0) {
              allSourceIds = [...allSourceIds, ...fresh];
              lateAdditions = true;
              const reranked = (await rank(query, { ...rankOpts, sourceIds: allSourceIds }))
                .filter((s: any) => !rejectedSourceIds.has(s.id) && !offTopicProviders.has(s.provider));
              if (reranked.length > topSources.length) {
                topSources.length = 0;
                topSources.push(...reranked);
              }
            }
            stats.relevanceScreen.cragRescout = { added: fresh.length };
          } catch (cragErr) {
            console.warn(`${label} RELEVANCE SCREEN: CRAG re-scout failed (non-blocking):`, cragErr);
            recordDegradedStep(stats, 'CRAG_RESCOUT', cragErr);
          }
        }
      }
    } catch (err) {
      console.warn(`${label} RELEVANCE SCREEN: failed (non-blocking):`, err);
      recordDegradedStep(stats, 'RELEVANCE_SCREEN', err);
    }
  }

  ctx.setRankedSources(topSources.map((s: any) => s.id));
  ctx.recordAgentTiming('RANK', Date.now() - pipelineStart);
  // Record rank stats for qualityScore extraction (extractPipelineScores reads rank.avgQuality)
  const rankAvgQuality = topSources.length > 0
    ? topSources.reduce((sum: number, s: any) => sum + ((s.qualityScore || 0) > 0 ? s.qualityScore : (s.sourceQuality?.overall || 0)), 0) / topSources.length
    : 0;
  stats.rank = { count: topSources.length, avgQuality: Math.round(rankAvgQuality) };
  emitProgress(pipelineRunId, "RANK", "completed", `Ranked ${topSources.length} sources (avgQuality ${Math.round(rankAvgQuality)})`, { blackboard: ctx.getSummary() });

  // LOT 2.5: Tag load-bearing sources (top 3) vs context sources
  for (let i = 0; i < topSources.length; i++) {
    (topSources[i] as any).loadBearing = i < 3;
  }
  console.log(`${label} LOAD BEARING: ${Math.min(3, topSources.length)} sources tagged as load_bearing`);

  // CRITICAL: Abort if no usable sources (prevents hallucinated briefs)
  if (topSources.length === 0) {
    console.error(`${label} ABORT: RANK returned 0 sources from ${allSourceIds.length} SCOUT results — nothing to analyze`);
    throw new Error(`No relevant sources found for "${query.slice(0, 80)}" (${allSourceIds.length} scouted, 0 ranked). Try different providers or broader query.`);
  }

  // P3.9: ADAPTIVE ENRICHMENT REASONING — replaces rigid structured refusal
  // Instead of a fixed threshold (minEvidenceCount), an LLM reasons about
  // whether the evidence is sufficient for this specific topic/domain/format.
  // If gaps are identifiable and fillable, it generates targeted queries
  // and we re-SCOUT. Only refuses if evidence is fundamentally insufficient.
  emitProgress(pipelineRunId, "ENRICHMENT", "started", `Assessing evidence sufficiency: ${topSources.length} sources...`);
  const sourceSummaries = topSources.map((s: any) => ({
    title: s.title || s.id || '',
    provider: s.provider || 'unknown',
    qualityScore: s.qualityScore || 0,
    hasAbstract: !!(s.abstract && s.abstract.length > 50),
    hasFullText: !!(s.fullTextUrl || s.openAccessPdf),
    year: s.year || s.publishedDate?.slice(0, 4) || null,
  }));

  const enrichmentAssessment = await assessEvidenceSufficiency(
    query,
    'general',
    isStrategic,
    sourceSummaries,
    allSourceIds.length,
  );
  addCost(enrichmentAssessment.costUsd, 'ENRICHMENT_REASONER');

  if (deps.skipRetrieval) {
    stats.enrichmentReasoner = {
      ...enrichmentAssessment, newSourcesAdded: 0, retrievalSkipped: true,
    };
    if (enrichmentAssessment.verdict === 'refuse') {
      stats.structuredRefusal = { reason: 'insufficient_evidence', sourceCount: topSources.length, missing: enrichmentAssessment.gaps };
      return { refused: true, topSources, allSourceIds, evidenceRegistry: null, rankOpts };
    }
    const { createEvidenceRegistry } = await import('../evidence-registry');
    return { refused: false, topSources, allSourceIds, evidenceRegistry: createEvidenceRegistry(topSources), rankOpts };
  }

  if (enrichmentAssessment.verdict === 'enrich' && enrichmentAssessment.enrichmentQueries.length > 0) {
    console.log(`${label} ENRICHMENT: ${enrichmentAssessment.gaps.length} gaps identified — searching with ${enrichmentAssessment.enrichmentQueries.length} targeted queries`);
    emitProgress(pipelineRunId, "ENRICHMENT", "started", `Filling ${enrichmentAssessment.gaps.length} evidence gaps...`);

    // Run targeted enrichment searches
    const enrichmentProviders = enrichmentAssessment.suggestedProviders.length > 0
      ? Array.from(new Set([...providers, ...enrichmentAssessment.suggestedProviders])) as Providers
      : providers;
    const enrichmentResults = await Promise.allSettled(
      enrichmentAssessment.enrichmentQueries.slice(0, 3).map(q => scout(q, enrichmentProviders, isStrategic ? 25 : 20))
    );
    let newSourceCount = 0;
    for (const r of enrichmentResults) {
      if (r.status === 'fulfilled') {
        const newIds = Array.isArray(r.value) ? r.value.map((s: any) => s.id) : (r.value.sourceIds || []);
        const beforeLen = allSourceIds.length;
        allSourceIds = [...new Set([...allSourceIds, ...newIds])];
        newSourceCount += allSourceIds.length - beforeLen;
      }
    }

    if (newSourceCount > 0) {
      lateAdditions = true;
      console.log(`${label} ENRICHMENT: +${newSourceCount} new sources from targeted queries — re-ranking`);

      // S15-09/S16-fix: NestBrowse — deep web extraction for sources with URLs but no abstracts
      try {
        const { exploreUrl } = await import('../nestbrowse');
        const { captureInput } = await import('../frozen-inputs');
        const sourcesNeedingExtraction = topSources.filter((s: any) => s.url && (!s.abstract || s.abstract.length < 100));
        if (sourcesNeedingExtraction.length > 0 && sourcesNeedingExtraction.length <= 5) {
          console.log(`${label} NESTBROWSE: extracting content from ${sourcesNeedingExtraction.length} sources with missing abstracts`);
          for (const s of sourcesNeedingExtraction) {
            try {
              const result = await captureInput(`nestbrowse:${s.url}`, () => exploreUrl(s.url || '', { extractDepth: 'shallow' }));
              if (result?.content && result.content.length > 200) {
                s.abstract = result.content.slice(0, 2000);
                console.log(`${label} NESTBROWSE: extracted ${result.content.length} chars from ${s.url}`);
              }
            } catch { /* non-blocking per source */ }
          }
        }
      } catch { /* non-blocking */ }

      // Re-rank with enriched source pool
      const enrichedRankOpts = isStrategic ? {
        ...rankOpts,
        sourceIds: allSourceIds,
        // Keep the same ceiling as the original rank — enrichment adds sources, shouldn't shrink the funnel
        limit: rankOpts.limit ?? 300,
      } : {
        ...rankOpts,
        sourceIds: allSourceIds,
        limit: rankOpts.limit ?? 100,
      };
      const enrichedTop = (await rank(query, enrichedRankOpts))
        .filter(s => !rejectedSourceIds.has(s.id) && !offTopicProviders.has(s.provider));
      // Replace topSources with enriched version if it's better
      if (enrichedTop.length > topSources.length) {
        topSources.length = 0;
        topSources.push(...enrichedTop);
        for (let i = 0; i < topSources.length; i++) {
          (topSources[i] as any).loadBearing = i < 3;
        }
      }
    }

    stats.enrichmentReasoner = {
      verdict: 'enrich',
      sufficiencyScore: enrichmentAssessment.sufficiencyScore,
      gapsFound: enrichmentAssessment.gaps.length,
      enrichmentQueries: enrichmentAssessment.enrichmentQueries,
      newSourcesAdded: newSourceCount,
      costUsd: enrichmentAssessment.costUsd,
    };
    emitProgress(pipelineRunId, "ENRICHMENT", "completed", `Enriched: +${newSourceCount} sources, ${topSources.length} total ranked`);
  } else if (enrichmentAssessment.verdict === 'refuse') {
    console.warn(`${label} REFUSAL: Evidence fundamentally insufficient — ${enrichmentAssessment.reasoning}`);

    // ── REFORMULATION RETRY — instead of giving up, try broadening the query ──
    // The enrichment reasoner identified gaps. Use its enrichmentQueries as reformulations
    // and re-scout with them. If we find enough aligned sources, proceed.
    const reformulationQueries = enrichmentAssessment.enrichmentQueries?.length > 0
      ? enrichmentAssessment.enrichmentQueries.slice(0, 3)
      : [query]; // fallback to original if no enrichment queries

    if (reformulationQueries.length > 0 && reformulationQueries[0] !== query) {
      console.log(`${label} REFUSAL RETRY: Re-scouting with ${reformulationQueries.length} reformulated queries...`);
      emitProgress(pipelineRunId, "ENRICHMENT", "started", `Retrying with reformulated queries...`);

      const retryScoutResults = await Promise.allSettled(
        reformulationQueries.map(q => scout(q, providers, isStrategic ? 30 : 20))
      );
      let retryNewSourceIds: string[] = [];
      for (const r of retryScoutResults) {
        if (r.status === 'fulfilled') {
          const newIds = Array.isArray(r.value) ? r.value.map((s: any) => s.id) : (r.value.sourceIds || []);
          retryNewSourceIds = [...new Set([...retryNewSourceIds, ...newIds])];
        }
      }

      if (retryNewSourceIds.length > 0) {
        lateAdditions = true;
        // Re-rank with the new sources — MUST scope to retryNewSourceIds
        // (without sourceIds, rank queries the entire DB and won't find the new sources)
        const retryRanked = (await rank(query, { limit: isStrategic ? 25 : 15, mode: 'balanced', sourceIds: retryNewSourceIds } as any))
          .filter(s => !rejectedSourceIds.has(s.id) && !offTopicProviders.has(s.provider));
        if (retryRanked.length > 0) {
          console.log(`${label} REFUSAL RETRY: Found ${retryRanked.length} sources (was ${topSources.length}). Proceeding with enriched corpus.`);
          topSources = retryRanked;
          // Re-assess sufficiency with the new sources
          const retrySourceSummaries = topSources.slice(0, 15).map((s: any) => ({
            title: s.title || '',
            provider: s.provider || '',
            year: s.year,
            qualityScore: s.qualityScore || 0,
            hasAbstract: !!(s.abstract || s.summary),
            hasFullText: !!s.fullTextUrl,
          }));
          const retryAssessment = await assessEvidenceSufficiency(query, 'general', isStrategic, retrySourceSummaries, topSources.length);
          addCost(retryAssessment.costUsd, 'ENRICHMENT_REASONER_RETRY');

          if (retryAssessment.verdict !== 'refuse') {
            // Success — proceed with the enriched corpus
            console.log(`${label} REFUSAL RETRY: ✅ Sufficiency reassessed as ${retryAssessment.verdict} (score ${retryAssessment.sufficiencyScore}/100)`);
            stats.enrichmentReasoner = {
              verdict: retryAssessment.verdict,
              sufficiencyScore: retryAssessment.sufficiencyScore,
              gapsFound: retryAssessment.gaps.length,
              enrichmentQueries: reformulationQueries,
              newSourcesAdded: retryNewSourceIds.length,
              costUsd: enrichmentAssessment.costUsd + retryAssessment.costUsd,
              retryAttempted: true,
              retrySucceeded: true,
            } as any;
            // Skip to analysis with the new sources
          } else {
            // Still refused after retry — give up
            console.warn(`${label} REFUSAL RETRY: ❌ Still insufficient after reformulation. Giving up.`);
            stats.structuredRefusal = {
              reason: 'insufficient_evidence',
              sourceCount: topSources.length,
              required: 0,
              missing: enrichmentAssessment.gaps.map(g => `${g.type}: ${g.description}`),
              retryAttempted: true,
              retryQueries: reformulationQueries,
            };
            stats.enrichmentReasoner = {
              verdict: 'refuse',
              sufficiencyScore: retryAssessment.sufficiencyScore,
              gapsFound: retryAssessment.gaps.length,
              enrichmentQueries: [],
              newSourcesAdded: 0,
              costUsd: enrichmentAssessment.costUsd + retryAssessment.costUsd,
              retryAttempted: true,
              retrySucceeded: false,
            } as any;
            emitProgress(pipelineRunId, "ENRICHMENT", "completed", `Refusal after retry: evidence still insufficient`);
            stats.totalCostUsd = runningCostUsd;
            return { refused: true, topSources, allSourceIds, evidenceRegistry: null, rankOpts };
          }
        } else {
          console.warn(`${label} REFUSAL RETRY: Reformulation didn't find more sources. Giving up.`);
          stats.structuredRefusal = {
            reason: 'insufficient_evidence',
            sourceCount: topSources.length,
            required: 0,
            missing: enrichmentAssessment.gaps.map(g => `${g.type}: ${g.description}`),
            retryAttempted: true,
            retrySucceeded: false,
          };
          stats.enrichmentReasoner = {
            verdict: 'refuse',
            sufficiencyScore: enrichmentAssessment.sufficiencyScore,
            gapsFound: enrichmentAssessment.gaps.length,
            enrichmentQueries: [],
            newSourcesAdded: 0,
            costUsd: enrichmentAssessment.costUsd,
            retryAttempted: true,
            retrySucceeded: false,
          } as any;
          emitProgress(pipelineRunId, "ENRICHMENT", "completed", `Refusal after retry: no new sources found`);
          stats.totalCostUsd = runningCostUsd;
          return { refused: true, topSources, allSourceIds, evidenceRegistry: null, rankOpts };
        }
      } else {
        // No new sources from reformulation
        stats.structuredRefusal = {
          reason: 'insufficient_evidence',
          sourceCount: topSources.length,
          required: 0,
          missing: enrichmentAssessment.gaps.map(g => `${g.type}: ${g.description}`),
          retryAttempted: true,
          retrySucceeded: false,
        };
        stats.enrichmentReasoner = {
          verdict: 'refuse',
          sufficiencyScore: enrichmentAssessment.sufficiencyScore,
          gapsFound: enrichmentAssessment.gaps.length,
          enrichmentQueries: [],
          newSourcesAdded: 0,
          costUsd: enrichmentAssessment.costUsd,
          retryAttempted: true,
          retrySucceeded: false,
        } as any;
        emitProgress(pipelineRunId, "ENRICHMENT", "completed", `Refusal: reformulation found no sources`);
        stats.totalCostUsd = runningCostUsd;
        return { refused: true, topSources, allSourceIds, evidenceRegistry: null, rankOpts };
      }
    } else {
      // No reformulation queries available — give up
      stats.structuredRefusal = {
        reason: 'insufficient_evidence',
        sourceCount: topSources.length,
        required: 0,
        missing: enrichmentAssessment.gaps.map(g => `${g.type}: ${g.description}`),
      };
      stats.enrichmentReasoner = {
        verdict: 'refuse',
        sufficiencyScore: enrichmentAssessment.sufficiencyScore,
        gapsFound: enrichmentAssessment.gaps.length,
        enrichmentQueries: [],
        newSourcesAdded: 0,
        costUsd: enrichmentAssessment.costUsd,
      };
      emitProgress(pipelineRunId, "ENRICHMENT", "completed", `Refusal: evidence insufficient (score ${enrichmentAssessment.sufficiencyScore}/100)`);
      stats.totalCostUsd = runningCostUsd;
      return { refused: true, topSources, allSourceIds, evidenceRegistry: null, rankOpts };
    }
  } else {
    stats.enrichmentReasoner = {
      verdict: 'proceed',
      sufficiencyScore: enrichmentAssessment.sufficiencyScore,
      gapsFound: enrichmentAssessment.gaps.length,
      enrichmentQueries: [],
      newSourcesAdded: 0,
      costUsd: enrichmentAssessment.costUsd,
    };
    emitProgress(pipelineRunId, "ENRICHMENT", "completed", `Proceed: sufficiency score ${enrichmentAssessment.sufficiencyScore}/100, ${topSources.length} sources`);
    console.log(`${label} ENRICHMENT: Proceed with ${topSources.length} sources (sufficiency: ${enrichmentAssessment.sufficiencyScore}/100)`);
    ctx.addFinding('ENRICHMENT', 'insight', `Evidence sufficiency: ${enrichmentAssessment.sufficiencyScore}/100 with ${topSources.length} sources`);
  }
  // ── CITATION SNOWBALL — the recall lever PaperQA2 documented: keyword
  // search finds what the query names; the strongest supporting/contrary
  // evidence is often what the best sources CITE or what CITES them.
  // Bounded traversal on the top-ranked seeds → persist → merge → re-rank.
  // Skipped on fixed-corpus paths (skipRetrieval) — curated corpora must
  // not mutate; rejectedSourceIds still apply to the merged re-rank.
  if (!deps.skipRetrieval && process.env.NOMOSX_SNOWBALL !== '0' && topSources.length > 0) {
    try {
      const { snowballFromSeeds } = await import('../../providers/openalex-snowball');
      const { captureInput } = await import('../frozen-inputs');
      const seedsKey = createHash('sha1').update(topSources.slice(0, 8).map((s: any) => s.id).join(',')).digest('hex');
      const snow = await captureInput(`snowball:${seedsKey}`, () => snowballFromSeeds(topSources.slice(0, 8), { perSeed: 4, cap: 24 }));
      const fresh = snow.addedIds.filter(id => !allSourceIds.includes(id) && !rejectedSourceIds.has(id));
      if (fresh.length > 0) {
        allSourceIds = [...allSourceIds, ...fresh];
        lateAdditions = true;
        const merged = (await rank(query, { ...rankOpts, sourceIds: allSourceIds }))
          .filter((s: any) => !rejectedSourceIds.has(s.id) && !offTopicProviders.has(s.provider));
        if (merged.length > topSources.length) {
          topSources.length = 0;
          topSources.push(...merged);
        }
        console.log(`${label} SNOWBALL: +${fresh.length} sources via citation traversal (${snow.seedsUsed} seeds, ${snow.candidatesFetched} candidates)`);
      }
      stats.snowball = { seedsUsed: snow.seedsUsed, candidatesFetched: snow.candidatesFetched, newSourcesAdded: fresh.length };
    } catch (err) {
      console.warn(`${label} SNOWBALL failed (non-blocking): ${err instanceof Error ? err.message : err}`);
      recordDegradedStep(stats, 'SNOWBALL', err);
    }
  }

  // ── LATE RELEVANCE SCREEN — docs added by post-screen merges were never
  // scored. One bounded batch call over the unscreened survivors; score-0
  // docs are dropped and join rejectedSourceIds so no later re-rank
  // restores them. Only runs when a merge actually added sources.
  if (!deps.skipRetrieval && lateAdditions && topSources.length > 0) {
    const unscreened = topSources.filter((s: any) => !screenedSourceIds.has(s.id));
    if (unscreened.length > 0) {
      const { screenSourcesForRelevance } = await import('./relevance-screen');
      const res = await screenSourcesForRelevance({ query, candidates: unscreened, label, addCost });
      if (res) {
        unscreened.forEach((s: any) => screenedSourceIds.add(s.id));
        // Same strict triage as the main screen: tangential late additions
        // drop once ≥8 core sources exist among the screened batch.
        const dropLate = new Set(res.dropIds);
        if (res.correctCount >= 8) {
          res.tangentialIds.forEach((id: string) => { dropLate.add(id); rejectedSourceIds.add(id); });
        }
        if (dropLate.size > 0) {
          dropLate.forEach((id: string) => rejectedSourceIds.add(id));
          topSources = topSources.filter((s: any) => !dropLate.has(s.id));
          topSources.forEach((s: any, i: number) => { s.loadBearing = i < 3; });
          stats.relevanceScreen = { ...(stats.relevanceScreen ?? {}), lateScreened: res.screened, lateDropped: dropLate.size, lateTangentialDropped: res.correctCount >= 8 ? res.tangentialIds.size : 0, lateCostUsd: res.costUsd };
          console.log(`${label} LATE RELEVANCE SCREEN: dropped ${dropLate.size}/${res.screened} low-relevance late additions — ${topSources.length} proceed to reader`);
          ctx.addFinding('RANK', 'insight', `Late relevance screen removed ${dropLate.size}/${res.screened} off-topic/tangential sources added by enrichment merges`);
        } else {
          stats.relevanceScreen = { ...(stats.relevanceScreen ?? {}), lateScreened: res.screened, lateDropped: 0, lateCostUsd: res.costUsd };
          console.log(`${label} LATE RELEVANCE SCREEN: all ${res.screened} late additions topically relevant`);
        }
      }
    }
  }

  orchState.sourcesFound = topSources.length;
  orchState.avgQualityScore = topSources.length > 0
    ? Math.round(topSources.reduce((sum: number, s: any) => sum + ((s.qualityScore || 0) > 0 ? s.qualityScore : (s.sourceQuality?.overall || 0)), 0) / topSources.length)
    : 0;
  stats.rank = { count: topSources.length, avgQuality: orchState.avgQualityScore };

  // P3.8: Create stable evidence registry — assigns [E1], [E2]... to sources
  const { createEvidenceRegistry } = await import('../evidence-registry');
  const evidenceRegistry = createEvidenceRegistry(topSources);

  return { refused: false, topSources, allSourceIds, evidenceRegistry, rankOpts };
}
