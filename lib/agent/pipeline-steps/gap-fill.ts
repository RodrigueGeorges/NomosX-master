/**
 * GAP FILL — orchestrator RE_ANALYZE + gap-aware evidence append + typed
 * research gaps + the blackboard `processGapRequests` consumer +
 * post-analyst enrichment checkpoint.
 *
 * All mutable cross-step state lives in `GapFillState` — the same object is
 * shared with the critic block so a gap-fill re-analysis triggered from
 * CRITIC/OUTLINE is actually adopted by the caller (a stale local copy would
 * otherwise clobber it on return).
 */

import { reAnalyzeAfterGapFill } from '../self-correction-integration';
import type { PipelineStep } from '../pipeline-progress';
import { assertExecutionActive } from '../../worker/execution-scope';
import { readerAgentV3 } from '../reader-agent-v3';
import { isFreeRun } from '../../free-run';
import { hasRunHeadroom, remainingRunMs } from './time-budget';

export interface GapFillState {
  analysis: any;
  allSourceIds: string[];
  reAnalysisBudget: number;
}

export interface GapFillDeps {
  state: GapFillState;
  query: string;
  topSources: any[];
  readings: any[];
  slimReadings: any[];
  detectedDomain: string;
  isStrategic: boolean;
  fullContextBlock: string | undefined;
  providers: any[];
  rankOpts: Record<string, any>;
  stats: Record<string, any>;
  label: string;
  pipelineRunId: string;
  pipelineStart?: number;
  analystDecision: any;
  orchState: {
    iteration: number;
    maxIterations: number;
    citationCoverage?: number | null;
  };
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  addCost: (usd: number | undefined, step: string) => void;
  isBudgetConstrained: () => boolean;
  /** Regen mode: the corpus is fixed — never scout new sources. Gap requests
   * are still drained/resolved so late-stage agents don't stall. */
  skipRetrieval?: boolean;
  bumpAnalysisArtifact: () => void;
  /** Optional pre-adoption witness: scores a candidate re-analysis with the
   * same critic pipeline used post-hoc. When a prior critic score exists and
   * the candidate regresses materially, the swap is refused — citations alone
   * proved to be a Goodhart-prone witness (a +6-citation candidate once
   * rescored 16 vs a 44-scored original). */
  criticScoreFn?: (candidateAnalysis: any) => Promise<{ score: number; verdict: string; costUsd?: number } | null>;
  analystMultipass: (query: string, topSources: any[], readings: any[], opts: any) => Promise<any>;
  rank: (query: string, opts: any) => Promise<any[]>;
  scout: (query: string, providers: any, limit?: number) => Promise<any>;
  /** Late-addition relevance screen: gap-fill merges bypass the rank-phase
   * topical screen, so newly retrieved sources are vetted here before they
   * reach the analyst/render corpus. Returns the ids to drop; null means the
   * screen was unavailable — keep everything (fail-open). */
  screenAdditions?: (query: string, candidates: any[]) => Promise<Set<string> | null>;
  ctx: {
    hasGapRequests: () => boolean;
    getPendingGapRequests: () => any[];
    clearGapRequests: () => void;
    requestSourceGap: (query: string, reason: string, agent: string, providers?: string[], minResults?: number) => void;
    addFinding: (agent: string, type: 'gap' | 'warning' | 'insight' | 'recommendation', content: string, metadata?: Record<string, unknown>) => void;
    setAnalystOutput: (analysis: any) => void;
    signals: { resolveSignalsByType: (type: string, agent: string, reason: string) => void };
  };
}

/**
 * BLACKBOARD gap-request consumer. Any agent (ANALYST, CRITIC,
 * OUTLINE-CRITIC, GAP_ANALYSIS) can push evidence requests onto the
 * blackboard via ctx.requestSourceGap(); this consumer scouts them,
 * re-ranks the pool, and re-analyzes. Called at its original post-analyst
 * position AND again after the critic/outline-critic so late-stage agents
 * have the same actuator.
 */
export function createGapRequestProcessor(deps: GapFillDeps) {
  const {
    state, query, topSources, readings, detectedDomain, isStrategic,
    fullContextBlock, rankOpts, stats, label, pipelineRunId,
    emitProgress, addCost, bumpAnalysisArtifact, analystMultipass, rank, scout, ctx,
  } = deps;

  return async function processGapRequests(origin: string): Promise<void> {
    assertExecutionActive();
    if (!ctx.hasGapRequests()) return;
    // Wall-clock guard: gap-fill only pays off when the enriched corpus can
    // feed a re-analysis (~10min) — new sources never reach the analyst or
    // the render corpus without one (topSources only mutates inside the
    // reAnalyzed block). Scouting inside the deadline tail is pure waste
    // (S34 timeout finding), so requests defer exactly like a budget stop.
    const reHeadroomMs = Number(process.env.GAPFILL_REANALYSIS_HEADROOM_MS ?? 1_800_000);
    const reHasTime = hasRunHeadroom(deps.pipelineStart, isStrategic, reHeadroomMs);
    if (deps.skipRetrieval || state.reAnalysisBudget <= 0 || deps.isBudgetConstrained() || !reHasTime) {
      // Fixed-corpus regen: drain the requests and resolve their signals —
      // scouting new sources would invalidate priorReadings and blow the
      // bounded regen window.
      const drained = ctx.getPendingGapRequests().length;
      const reason = deps.skipRetrieval ? 'fixed_corpus'
        : !reHasTime ? 'insufficient_headroom'
        : state.reAnalysisBudget <= 0 ? 'reanalysis_budget_exhausted'
        : 'budget_exhausted';
      // Persist the queries, not just the count: a HELD outcome carries these
      // into the diagnostic so the 20h retry scouts the exact missing evidence
      // instead of repeating the broad sweep that produced the gap.
      stats.deferredGapRequests = {
        count: drained, origin, reason,
        queries: ctx.getPendingGapRequests()
          .map((r: any) => String(r?.query ?? '').slice(0, 200))
          .filter((q: string) => q.length > 10)
          .slice(0, 6),
      };
      console.log(`${label} BLACKBOARD: ${drained} gap requests from ${origin} deferred (${reason})`);
      return;
    }
    const gapReqs = ctx.getPendingGapRequests();
    console.log(`${label} BLACKBOARD: processing ${gapReqs.length} gap requests from ${origin}`);
    emitProgress(pipelineRunId, "GAP_FILL", "started", `Filling ${gapReqs.length} evidence gaps identified by ${origin}...`);
    try {
      const gapResults = await Promise.allSettled(
        gapReqs.slice(0, 2).map(req => scout(req.query, req.providers?.length ? req.providers : ['crossref', 'semanticscholar', 'europepmc'], req.minResults || 10))
      );
      assertExecutionActive();
      let gapNewCount = 0;
      const suppliedEvidence = new Set<number>();
      for (const [requestIndex, r] of gapResults.entries()) {
        if (r.status === 'fulfilled') {
          const newIds = Array.isArray(r.value) ? r.value.map((s: any) => s.id) : (r.value.sourceIds || []);
          const before = state.allSourceIds.length;
          state.allSourceIds = [...new Set([...state.allSourceIds, ...newIds])];
          gapNewCount += state.allSourceIds.length - before;
          if (state.allSourceIds.length > before) suppliedEvidence.add(requestIndex);
        }
      }
      if (gapNewCount > 0) {
        if (stats.gapAnalysis) stats.gapAnalysis.newSources = (stats.gapAnalysis.newSources ?? 0) + gapNewCount;
        console.log(`${label} BLACKBOARD: +${gapNewCount} sources from ${origin} gap requests — re-ranking`);
        const gapRankOpts = { ...rankOpts, sourceIds: state.allSourceIds, limit: (rankOpts.limit ?? 12) + 3 };
        const ranked = await rank(query, gapRankOpts);
        const sourceIds = new Set(topSources.map(s => s.id));
        const additions = ranked.filter(s => !sourceIds.has(s.id) && !!sourceIds.add(s.id));
        // These docs bypassed the rank-phase topical screen — vet them
        // before they feed the re-analysis and the render corpus.
        let keptAdditions = additions;
        if (deps.screenAdditions && additions.length > 0) {
          const drop = await deps.screenAdditions(query, additions);
          if (drop && drop.size > 0) {
            keptAdditions = additions.filter(s => !drop.has(s.id));
            console.log(`${label} BLACKBOARD GAP-FILL: relevance screen dropped ${additions.length - keptAdditions.length}/${additions.length} off-topic additions`);
          }
        }
        const gapEnriched = [...topSources, ...keptAdditions];
        ctx.addFinding('BLACKBOARD', 'insight', `Retrieved ${gapNewCount} candidate sources for ${gapReqs.length} gaps (${origin}); reassessment required`);

        // ── CRITICAL FIX: Re-execute ANALYST with gap-filled sources ──
        // Before this fix, the ANALYST identified gaps, SCOUT filled them,
        // but the ANALYST was NEVER re-run with the new sources. Only the HTML
        // renderer benefited. This is like a researcher asking for documents,
        // receiving them, but continuing to write without reading them.
        // BUDGET: each re-analysis is a full 3-pass (~7min on reasoning models).
        // Cap total re-analyses per run — brief runs get 1, strategic 2.
        if (keptAdditions.length > 0 && state.reAnalysisBudget > 0) {
          state.reAnalysisBudget--;
          assertExecutionActive();
          const fresh = await readerAgentV3(keptAdditions, { domain: detectedDomain, maxConcurrency: isFreeRun() ? 2 : 4 });
          assertExecutionActive();
          emitProgress(pipelineRunId, "GAP_FILL", "started", `Re-analyzing with ${gapEnriched.length} enriched sources...`);
          const gapReReadings = [...readings, ...fresh].map((r: any) => ({
            sourceId: r.sourceId,
            claims: r.claims || [],
            methods: r.methods || [],
            results: r.results || [],
            limitations: r.limitations || [],
            confidence: r.confidence || 'medium',
          }));
          // Critic/panel/structural defects documented before the gap-fill are
          // folded into the re-analysis context — one enriched pass integrates
          // the new evidence AND fixes the flagged defects (vs two passes).
          const repairCtx = typeof (stats as any).repairInstructionsComposed === 'string' &&
              (stats as any).repairInstructionsComposed.length > 0
            ? '\n\n## CRITIC REPAIR INSTRUCTIONS (mandatory)\nThe critic and review panel identified defects in the previous analysis that MUST be fixed in this pass:\n' +
              (stats as any).repairInstructionsComposed
            : '';
          const expertLens = typeof (stats as any).domainExpertLens === 'string' ? (stats as any).domainExpertLens : '';
          const reResult = await reAnalyzeAfterGapFill(
            query,
            state.analysis,
            gapEnriched,
            gapReReadings,
            analystMultipass,
            { contextBlock: (fullContextBlock || '') + expertLens + repairCtx, domain: detectedDomain, depth: isStrategic ? "strategic" : "brief" }
          );
          assertExecutionActive();
          addCost(reResult.costUsd, 'GAP-FILL RE-ANALYSIS');
          if (reResult.reAnalyzed) {
            // Enriched sources are appended regardless of the adoption
            // outcome: [SRC-N] indices 1..N stay valid, and downstream stages
            // (render, DA) still benefit from the retrieved evidence.
            topSources.push(...keptAdditions);
            readings.push(...fresh);
            deps.slimReadings.push(...gapReReadings.filter(r => fresh.some(f => f.sourceId === r.sourceId)));
            // Pre-adoption witness: citation delta alone is Goodhart-prone —
            // when a critic already scored the current analysis, a candidate
            // that rescored materially lower must not replace it.
            const priorCriticScore = typeof stats.critic?.overallScore === 'number' ? stats.critic.overallScore : null;
            let candidateScore: number | null = null;
            let adopt = true;
            if (priorCriticScore != null && deps.criticScoreFn && !deps.isBudgetConstrained()) {
              const rescore = await deps.criticScoreFn(reResult.analysis);
              if (rescore) {
                addCost(rescore.costUsd, 'GAPFILL_RESCORE');
                candidateScore = rescore.score;
                adopt = rescore.score >= priorCriticScore - 5;
              }
            }
            if (adopt) {
              state.analysis = reResult.analysis;
              bumpAnalysisArtifact();
              ctx.setAnalystOutput(state.analysis);
              stats.gapFillReAnalysis = {
                triggered: true,
                citationDelta: reResult.improvementDelta,
                ...(candidateScore != null ? { criticRescore: candidateScore, criticPrior: priorCriticScore } : {}),
              };
              console.log(`${label} GAP-FILL RE-ANALYSIS: analysis updated (+${reResult.improvementDelta} citations)`);
              emitProgress(pipelineRunId, "GAP_FILL", "completed", `Re-analysis: +${reResult.improvementDelta} citations`);
            } else {
              stats.gapFillReAnalysis = {
                triggered: false, citationDelta: reResult.improvementDelta,
                rejectedByRescore: true, criticRescore: candidateScore, criticPrior: priorCriticScore,
              };
              console.log(`${label} GAP-FILL RE-ANALYSIS: candidate rejected by critic rescore (${candidateScore} < prior ${priorCriticScore}-5) — original kept, enriched pool retained`);
              emitProgress(pipelineRunId, "GAP_FILL", "completed", `Re-analysis candidate rejected by critic rescore`);
            }
          } else {
            stats.gapFillReAnalysis = { triggered: false, citationDelta: 0 };
          }
        }
      }
      if (gapNewCount > 0) {
        const remaining = ctx.getPendingGapRequests().filter((_req, i) => !suppliedEvidence.has(i));
        ctx.clearGapRequests();
        for (const req of remaining) {
          ctx.requestSourceGap(req.query, req.reason, req.requestedBy ?? origin, req.providers, req.minResults);
        }
      }
      // Close the corresponding coverage_gap signals — the legacy queue and
      // the signal bus carry the same need; resolving one resolves both.
      stats.gapRetrieval = { origin, newSources: gapNewCount, requiresReassessment: true };
      const pending = ctx.getPendingGapRequests();
      if (pending.length > 0) {
        stats.deferredGapRequests = {
          count: pending.length, origin, reason: 'retrieval_incomplete',
          queries: [...new Set(pending.map((req: any) => String(req.query ?? '').slice(0, 200)).filter((q: string) => q.length > 10))].slice(0, 6),
        };
      }
      emitProgress(pipelineRunId, "GAP_FILL", "completed", `Gap fill: +${gapNewCount} sources`);
    } catch (err) {
      assertExecutionActive();
      console.warn(`${label} BLACKBOARD: gap fill failed (non-blocking):`, err);
      stats.gapRetrieval = { origin, failed: true, requiresReassessment: true };
    }
  };
}

/**
 * The full post-analyst gap stage: orchestrator RE_ANALYZE → gap-aware
 * evidence append → typed research gaps → processGapRequests('ANALYST') →
 * post-analyst enrichment checkpoint. Mutates deps.state in place.
 */
export async function runGapFillStage(deps: GapFillDeps): Promise<void> {
  const {
    state, query, topSources, slimReadings, detectedDomain, isStrategic,
    providers, rankOpts, stats, label, pipelineRunId, analystDecision, orchState,
    fullContextBlock, skipRetrieval,
    emitProgress, addCost, isBudgetConstrained, bumpAnalysisArtifact,
    analystMultipass, rank, scout, ctx,
  } = deps;

  // ── ORCHESTRATOR ACTION: RE_ANALYZE — was logged but never acted upon. NOW ACTED. ──
  // Same wall-clock guard as the blackboard re-analysis: a 3-pass started
  // inside the deadline tail never reaches the evaluators.
  const orchHeadroomMs = Number(process.env.GAPFILL_REANALYSIS_HEADROOM_MS ?? 1_800_000);
  const orchHasTime = hasRunHeadroom(deps.pipelineStart, isStrategic, orchHeadroomMs);
  if (analystDecision.action === "RE_ANALYZE" && !orchHasTime) {
    console.log(`${label} ORCHESTRATOR: RE_ANALYZE skipped — ${Math.round(remainingRunMs(deps.pipelineStart, isStrategic) / 60000)}min left, re-analysis would overrun the deadline tail`);
  }
  if (analystDecision.action === "RE_ANALYZE" && orchHasTime && orchState.iteration < orchState.maxIterations && state.reAnalysisBudget > 0) {
    state.reAnalysisBudget--;
    console.log(`${label} ORCHESTRATOR: RE_ANALYZE — ${analystDecision.reason}`);
    emitProgress(pipelineRunId, "ANALYST", "started", `Re-analyzing with strengthened requirements...`);
    try {
      const reAnalysis = await analystMultipass(query, topSources, slimReadings, {
        contextBlock: fullContextBlock + '\n\n## STRENGTHENED REQUIREMENT (orchestrator-triggered re-analysis)\nThe previous analysis was deemed insufficient. ' + (analystDecision.reason || 'Improve citation coverage and analytical depth.') + '\nEvery claim MUST have a [SRC-N] citation. Uncited claims will be rejected.',
        domain: detectedDomain,
        depth: isStrategic ? "strategic" : "brief",
        boundThesis: (stats as any).thesisBinding?.statement,
      });
      // Compare: keep the better version
      const reStr = typeof reAnalysis === 'string' ? reAnalysis : JSON.stringify(reAnalysis);
      const reCitations = new Set((reStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      const origStr = typeof state.analysis === 'string' ? state.analysis : JSON.stringify(state.analysis);
      const origCitations = new Set((origStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      let adopt = reCitations > origCitations;
      // Same pre-adoption witness as the blackboard path — a prior critic
      // score floors the swap when the candidate rescored materially worse.
      const priorCriticScore = typeof stats.critic?.overallScore === 'number' ? stats.critic.overallScore : null;
      if (adopt && priorCriticScore != null && deps.criticScoreFn && !isBudgetConstrained()) {
        const rescore = await deps.criticScoreFn(reAnalysis);
        if (rescore) {
          addCost(rescore.costUsd, 'GAPFILL_RESCORE');
          adopt = rescore.score >= priorCriticScore - 5;
          if (!adopt) console.log(`${label} RE_ANALYZE: candidate rejected by critic rescore (${rescore.score} < prior ${priorCriticScore}-5)`);
        }
      }
      if (adopt) {
        state.analysis = reAnalysis;
        bumpAnalysisArtifact();
        ctx.setAnalystOutput(state.analysis);
        addCost(typeof reAnalysis._meta?.totalCostUsd === "number" ? reAnalysis._meta.totalCostUsd : 0, 'RE_ANALYZE');
        console.log(`${label} RE_ANALYZE: improved citations ${origCitations} → ${reCitations}`);
        stats.orchestrator.reAnalyzeTriggered = true;
        stats.orchestrator.reAnalyzeCitationDelta = reCitations - origCitations;
        orchState.citationCoverage = reCitations / Math.max(1, topSources.length);
      } else {
        console.log(`${label} RE_ANALYZE: no improvement (${origCitations} → ${reCitations}), keeping original`);
      }
      orchState.iteration++;
      emitProgress(pipelineRunId, "ANALYST", "completed", `Re-analysis complete`);
    } catch (err) {
      console.warn(`${label} RE_ANALYZE: failed (non-blocking):`, err);
    }
  }

  // ── STEP 5c: GAP-AWARE EVIDENCE APPEND — detect citation gaps, feed the
  // BLACKBOARD gap-fill loop below (scout → re-rank → re-analyze). ──
  try {
    const { analyzeCitationGaps, generateGapQueries } = await import('../gap-aware-append');
    const gaps = await analyzeCitationGaps(state.analysis as Record<string, unknown>, topSources.length);
    if (gaps.length > 0) {
      console.log(`${label} GAP ANALYSIS: ${gaps.length} sections with low citation coverage`);
      gaps.forEach(g => console.log(`  - ${g.section}: ${Math.round(g.coverage * 100)}% (${g.citationCount}/${g.sentenceCount})`));
      stats.gapAnalysis = { gapsFound: gaps.length, queriesGenerated: 0, newSources: 0 };

      // AUTONOMY: convert coverage gaps into targeted re-search requests.
      // Previously these were only logged — now they feed the gap-fill loop.
      // Skipped in fixed-corpus regen — the requests could never be scouted.
      if (!skipRetrieval && !isBudgetConstrained() && orchState.iteration < orchState.maxIterations) {
        try {
          const gapQueries = await generateGapQueries(query, gaps.slice(0, 3));
          let queued = 0;
          for (const gq of gapQueries.slice(0, 3)) {
            if (gq && gq.length > 10) {
              ctx.requestSourceGap(
                gq.slice(0, 300),
                `Citation gap in analysis (${gaps.map(g => g.section).join(', ')})`,
                'GAP_ANALYSIS',
                ['crossref', 'semanticscholar', 'openalex', 'europepmc', 'internet-archive', 'jstor'],
                10,
              );
              queued++;
            }
          }
          stats.gapAnalysis.queriesGenerated = queued;
          if (queued > 0) {
            console.log(`${label} GAP ANALYSIS: ${queued} targeted re-search queries queued for gap-fill`);
          }
        } catch { /* non-blocking — gap queries are best-effort */ }
      }
    } else {
      console.log(`${label} GAP ANALYSIS: all sections have adequate citation coverage`);
    }
  } catch (err) {
    console.warn(`${label} GAP ANALYSIS: failed (non-blocking):`, err);
  }

  // LOT 2.6: Typed research gaps — classify what's missing from the evidence
  try {
    const analysisObj = state.analysis as Record<string, unknown>;
    const openQuestions = (analysisObj?.openQuestions as string) || '';
    const researchGaps: { type: 'NOT_REACHED' | 'RESTRICTED' | 'INEXISTANT'; description: string }[] = [];

    // NOT_REACHED: the analysis didn't cover something it should have
    if (topSources.length < (isStrategic ? 15 : 8)) {
      researchGaps.push({ type: 'NOT_REACHED', description: `Only ${topSources.length} sources — insufficient coverage for ${isStrategic ? 'strategic' : 'standard'} depth` });
    }

    // RESTRICTED: sources exist but were inaccessible (paywalled, classified, etc.)
    const noAbstractCount = topSources.filter((s: any) => !s.abstract || s.abstract.length < 100).length;
    if (noAbstractCount > topSources.length * 0.3) {
      researchGaps.push({ type: 'RESTRICTED', description: `${noAbstractCount} sources lack full abstracts — evidence base may be constrained` });
    }

    // INEXISTANT: the research literature doesn't cover this yet
    if (openQuestions.toLowerCase().includes('no studies') || openQuestions.toLowerCase().includes('no research') || openQuestions.toLowerCase().includes('gap in') || openQuestions.toLowerCase().includes('remains unexplored')) {
      researchGaps.push({ type: 'INEXISTANT', description: 'Analysis identifies areas with no existing research' });
    }

    if (researchGaps.length > 0) {
      stats.researchGaps = researchGaps;
      console.log(`${label} RESEARCH GAPS: ${researchGaps.length} typed gaps identified`);
      researchGaps.forEach(g => console.log(`  - [${g.type}] ${g.description.slice(0, 80)}`));
    }
  } catch (err) {
    console.warn(`${label} RESEARCH GAPS: classification failed (non-blocking):`, err);
  }

  const processGapRequests = createGapRequestProcessor(deps);

  // Original consumption point — ANALYST + GAP_ANALYSIS requests
  await processGapRequests('ANALYST');

  // ── POST-ANALYST ENRICHMENT CHECKPOINT ──
  // If the analysis revealed critical evidence gaps (NOT_REACHED type),
  // attempt one final targeted search to fill them before rendering.
  // This is adaptive — only triggers when gaps are critical, not on every run.
  if (stats.researchGaps && Array.isArray(stats.researchGaps)) {
    const criticalGaps = (stats.researchGaps as Array<{ type: string; description: string }>)
      .filter(g => g.type === 'NOT_REACHED');
    if (criticalGaps.length > 0 && !skipRetrieval && topSources.length < (isStrategic ? 20 : 12)) {
      console.log(`${label} POST-ANALYST ENRICHMENT: ${criticalGaps.length} critical gaps — attempting targeted search`);
      try {
        // Generate targeted queries from gap descriptions + original query
        const gapQueries = criticalGaps.slice(0, 3).map(g => {
          // Extract key terms from gap description
          const desc = g.description.replace(/only.*sources.*depth/i, '').trim();
          return desc.length > 10 ? `${query} ${desc}`.slice(0, 200) : query;
        });
        const enrichmentProviders = Array.from(new Set([...providers, 'linkup', 'tavily', 'openalex', 'crossref', 'springer', 'osti', 'datacite', 'google-books'] as any)) as any;
        const postEnrichResults = await Promise.allSettled(
          gapQueries.map(q => scout(q, enrichmentProviders, 15))
        );
        let postNewCount = 0;
        for (const r of postEnrichResults) {
          if (r.status === 'fulfilled') {
            const newIds = Array.isArray(r.value) ? r.value.map((s: any) => s.id) : (r.value.sourceIds || []);
            const before = state.allSourceIds.length;
            state.allSourceIds = [...new Set([...state.allSourceIds, ...newIds])];
            postNewCount += state.allSourceIds.length - before;
          }
        }
        if (postNewCount > 0) {
          console.log(`${label} POST-ANALYST ENRICHMENT: +${postNewCount} sources from gap-targeted search`);
          // Re-rank and merge new sources
          const postRankOpts = { ...rankOpts, sourceIds: state.allSourceIds, limit: (rankOpts.limit ?? 12) + 3 };
          let postEnriched = await rank(query, postRankOpts);
          // Screen only newcomers — docs already in topSources passed the
          // rank-phase or gap-fill screen.
          if (deps.screenAdditions && postEnriched.length > 0) {
            const oldIds = new Set(topSources.map(s => s.id));
            const newcomers = postEnriched.filter(s => !oldIds.has(s.id));
            if (newcomers.length > 0) {
              const drop = await deps.screenAdditions(query, newcomers);
              if (drop && drop.size > 0) {
                postEnriched = postEnriched.filter(s => !drop.has(s.id));
                console.log(`${label} POST-ANALYST ENRICHMENT: relevance screen dropped ${drop.size}/${newcomers.length} off-topic additions`);
              }
            }
          }
          // Compare quality, not just count — use average compositeScore of top sources
          const oldAvgQuality = topSources.length > 0
            ? topSources.reduce((sum: number, s: any) => sum + (s.compositeScore ?? s.qualityScore ?? 50), 0) / topSources.length
            : 0;
          const newAvgQuality = postEnriched.length > 0
            ? postEnriched.reduce((sum: number, s: any) => sum + (s.compositeScore ?? s.qualityScore ?? 50), 0) / postEnriched.length
            : 0;
          if (postEnriched.length >= topSources.length && newAvgQuality >= oldAvgQuality) {
            const oldLen = topSources.length;
            topSources.length = 0;
            topSources.push(...postEnriched);
            for (let i = 0; i < topSources.length; i++) {
              (topSources[i] as any).loadBearing = i < 3;
            }
            console.log(`${label} POST-ANALYST ENRICHMENT: sources ${oldLen} → ${topSources.length}, quality ${oldAvgQuality.toFixed(0)} → ${newAvgQuality.toFixed(0)}`);
          } else {
            console.log(`${label} POST-ANALYST ENRICHMENT: kept original sources (quality ${oldAvgQuality.toFixed(0)} ≥ ${newAvgQuality.toFixed(0)})`);
          }
          // Update enrichment stats
          if (stats.enrichmentReasoner) {
            (stats.enrichmentReasoner as any).postAnalystNewSources = postNewCount;
          }
        }
      } catch (err) {
        console.warn(`${label} POST-ANALYST ENRICHMENT: failed (non-blocking):`, err);
      }
    }
  }
}
