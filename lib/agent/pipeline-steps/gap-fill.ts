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
  analystDecision: any;
  orchState: {
    iteration: number;
    maxIterations: number;
    citationCoverage?: number | null;
  };
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  addCost: (usd: number | undefined, step: string) => void;
  isBudgetConstrained: () => boolean;
  bumpAnalysisArtifact: () => void;
  analystMultipass: (query: string, topSources: any[], readings: any[], opts: any) => Promise<any>;
  rank: (query: string, opts: any) => Promise<any[]>;
  scout: (query: string, providers: any, limit?: number) => Promise<any>;
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
    if (!ctx.hasGapRequests()) return;
    const gapReqs = ctx.getPendingGapRequests();
    console.log(`${label} BLACKBOARD: processing ${gapReqs.length} gap requests from ${origin}`);
    emitProgress(pipelineRunId, "GAP_FILL", "started", `Filling ${gapReqs.length} evidence gaps identified by ${origin}...`);
    try {
      const gapProviders = gapReqs[0].providers as string[] || ['crossref', 'semanticscholar', 'europepmc'];
      const gapResults = await Promise.allSettled(
        gapReqs.slice(0, 2).map(req => scout(req.query, gapProviders as any, req.minResults || 10))
      );
      let gapNewCount = 0;
      for (const r of gapResults) {
        if (r.status === 'fulfilled') {
          const newIds = Array.isArray(r.value) ? r.value.map((s: any) => s.id) : (r.value.sourceIds || []);
          const before = state.allSourceIds.length;
          state.allSourceIds = [...new Set([...state.allSourceIds, ...newIds])];
          gapNewCount += state.allSourceIds.length - before;
        }
      }
      if (gapNewCount > 0) {
        if (stats.gapAnalysis) stats.gapAnalysis.newSources = (stats.gapAnalysis.newSources ?? 0) + gapNewCount;
        console.log(`${label} BLACKBOARD: +${gapNewCount} sources from ${origin} gap requests — re-ranking`);
        const gapRankOpts = { ...rankOpts, sourceIds: state.allSourceIds, limit: (rankOpts.limit ?? 12) + 3 };
        const gapEnriched = await rank(query, gapRankOpts);
        if (gapEnriched.length >= topSources.length) {
          topSources.length = 0;
          topSources.push(...gapEnriched);
          for (let i = 0; i < topSources.length; i++) {
            (topSources[i] as any).loadBearing = i < 3;
          }
          console.log(`${label} BLACKBOARD: sources enriched from gap requests → ${topSources.length} total`);
        }
        ctx.addFinding('BLACKBOARD', 'insight', `Filled ${gapReqs.length} gaps with ${gapNewCount} new sources (${origin})`);

        // ── CRITICAL FIX: Re-execute ANALYST with gap-filled sources ──
        // Before this fix, the ANALYST identified gaps, SCOUT filled them,
        // but the ANALYST was NEVER re-run with the new sources. Only the HTML
        // renderer benefited. This is like a researcher asking for documents,
        // receiving them, but continuing to write without reading them.
        // BUDGET: each re-analysis is a full 3-pass (~7min on reasoning models).
        // Cap total re-analyses per run — brief runs get 1, strategic 2.
        if (gapEnriched.length > 0 && state.reAnalysisBudget > 0) {
          state.reAnalysisBudget--;
          emitProgress(pipelineRunId, "GAP_FILL", "started", `Re-analyzing with ${gapEnriched.length} enriched sources...`);
          const gapReReadings = readings.map((r: any) => ({
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
          const reResult = await reAnalyzeAfterGapFill(
            query,
            state.analysis,
            topSources,
            gapReReadings,
            analystMultipass,
            { contextBlock: (fullContextBlock || '') + repairCtx, domain: detectedDomain, depth: isStrategic ? "strategic" : "brief" }
          );
          if (reResult.reAnalyzed) {
            state.analysis = reResult.analysis;
            bumpAnalysisArtifact();
            ctx.setAnalystOutput(state.analysis);
            stats.gapFillReAnalysis = {
              triggered: true,
              citationDelta: reResult.improvementDelta,
            };
            addCost(typeof state.analysis._meta?.totalCostUsd === "number" ? state.analysis._meta.totalCostUsd : 0, 'GAP-FILL RE-ANALYSIS');
            console.log(`${label} GAP-FILL RE-ANALYSIS: analysis updated (+${reResult.improvementDelta} citations)`);
            emitProgress(pipelineRunId, "GAP_FILL", "completed", `Re-analysis: +${reResult.improvementDelta} citations`);
          } else {
            stats.gapFillReAnalysis = { triggered: false, citationDelta: 0 };
          }
        }
      }
      ctx.clearGapRequests();
      // Close the corresponding coverage_gap signals — the legacy queue and
      // the signal bus carry the same need; resolving one resolves both.
      ctx.signals.resolveSignalsByType('coverage_gap', 'SCOUT', `gap fill from ${origin}: +${gapNewCount} sources`);
      emitProgress(pipelineRunId, "GAP_FILL", "completed", `Gap fill: +${gapNewCount} sources`);
    } catch (err) {
      console.warn(`${label} BLACKBOARD: gap fill failed (non-blocking):`, err);
      ctx.clearGapRequests();
      ctx.signals.resolveSignalsByType('coverage_gap', 'SCOUT', `gap fill attempted (${origin})`);
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
    fullContextBlock,
    emitProgress, addCost, isBudgetConstrained, bumpAnalysisArtifact,
    analystMultipass, rank, scout, ctx,
  } = deps;

  // ── ORCHESTRATOR ACTION: RE_ANALYZE — was logged but never acted upon. NOW ACTED. ──
  if (analystDecision.action === "RE_ANALYZE" && orchState.iteration < orchState.maxIterations && state.reAnalysisBudget > 0) {
    state.reAnalysisBudget--;
    console.log(`${label} ORCHESTRATOR: RE_ANALYZE — ${analystDecision.reason}`);
    emitProgress(pipelineRunId, "ANALYST", "started", `Re-analyzing with strengthened requirements...`);
    try {
      const reAnalysis = await analystMultipass(query, topSources, slimReadings, {
        contextBlock: fullContextBlock + '\n\n## STRENGTHENED REQUIREMENT (orchestrator-triggered re-analysis)\nThe previous analysis was deemed insufficient. ' + (analystDecision.reason || 'Improve citation coverage and analytical depth.') + '\nEvery claim MUST have a [SRC-N] citation. Uncited claims will be rejected.',
        domain: detectedDomain,
        depth: isStrategic ? "strategic" : "brief",
      });
      // Compare: keep the better version
      const reStr = typeof reAnalysis === 'string' ? reAnalysis : JSON.stringify(reAnalysis);
      const reCitations = new Set((reStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      const origStr = typeof state.analysis === 'string' ? state.analysis : JSON.stringify(state.analysis);
      const origCitations = new Set((origStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
      if (reCitations > origCitations) {
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
      if (!isBudgetConstrained() && orchState.iteration < orchState.maxIterations) {
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
    if (criticalGaps.length > 0 && topSources.length < (isStrategic ? 20 : 12)) {
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
          const postEnriched = await rank(query, postRankOpts);
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
