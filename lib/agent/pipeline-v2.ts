/** Cohere reranking, batch ops, governance, lineage tracking.
 * 
 * SCOUT â†’ INDEX â†’ RANK â†’ READER â†’ ANALYST â†’ EDITOR â†’ GUARD â†’ PUBLISHER
 */

import {  prisma  } from '../db';
import { randomUUID, createHash } from 'node:crypto';
import { assertExecutionActive, withExecutionDeadline } from '../worker/execution-scope';
import { hasRunHeadroom, hasRunHeadroomWithReserve, remainingRunMs } from './pipeline-steps/time-budget';
import { BRAND_BRIEF_FOOTER, BRAND_MANIFESTO } from '@/lib/brand/public-copy';
import { analystAgentV3 as analystMultipass } from './analyst-multipass';
import { primeContext } from './context-primer';
import { saveDurableStep } from './durable-execution';
import { getLlmCassetteMode } from '../llm/cassette';
import type { PrimarySourceInput } from './think-tank-pack';

// P1-PERF: Optional agents are lazy-loaded via dynamic import() to reduce cold start
// debateAgent, metaAnalysisEngine, runDevilsAdvocate, runHarvardCouncil,
// runEnhancedHarvardCouncil, runCollaborativeDeliberation, buildDeliberationContextBlock
import { emitProgress } from './pipeline-progress';

import { isEditorialV2Enabled, getPipelineMaxBudgetUsd } from './editorial-config';
import { buildAnalysisReviewText } from './analysis-review-text';
import { injectAdversarialSection, runPeerReviewAndPack, applyEvidenceIdsAndProseCleanup } from './pipeline-steps/post-render-extras';
import { runPersistenceTail } from './pipeline-steps/persistence-tail';
import { RESEARCHER_KBS, type KeyConcept, type AnalyticalFramework, type DomainExpertise } from './researcher-kb/index';
import { MULTI_DOMAIN_CORPUS } from '../knowledge/multi-domain-corpus';
import {
  createPipelineState, recordDecision,
  assessAfterScout, assessAfterReader, assessAfterAnalyst, assessAfterCriticalLoop,
  generateExpandedTerms, loadCalibratedThresholds,
  type PipelineState, type OrchestratorDecision,
} from './orchestrator';

// P0 FIX #3: Redis caching for SCOUT
// P2 FIX: Enhanced Redis with reconnection strategy
import type { PipelineStats } from './pipeline-types';
import { createLineageTracker as createLineageTrackerTyped, recordTransformation as recordTransformationTyped } from './pipeline-types';
import { renderProfessionalBriefHTML, renderProfessionalStrategicHTML } from './editor-agent';
import { renderPositionFirstBriefHTML } from './position-first-renderer';
import { computeTrackRecordStats } from './track-record';

import { resolveCentralScenario, type InstitutePosition } from './editorial-types';
import type { DebateResult } from './debate-agent';
import { runDebateMetaBlock, runDevilsAdvocateBlock, type DebateAdvocateDeps } from './pipeline-steps/debate-advocate';
import { runPostRenderCitationAndGrounding as runCitationGroundingStep } from './pipeline-steps/citation-grounding';
import { runReaderBlock } from './pipeline-steps/reader-block';
import { runClassificationGates } from './pipeline-steps/classification-gates';
import { createGapRequestProcessor, runGapFillStage, type GapFillDeps, type GapFillState } from './pipeline-steps/gap-fill';
import { buildAnalystContext, buildRequiredCoverageBlock } from './pipeline-steps/analyst-context';
import { runPostAnalystChecks } from './pipeline-steps/post-analyst-checks';
import { runAnalystExecution } from './pipeline-steps/analyst-run';
import { runScoutBlock } from './pipeline-steps/scout-block';
import { runPipelineInit } from './pipeline-steps/pipeline-init';
import { DEFAULT_ACADEMIC_PROVIDERS } from './pipeline-steps/provider-lists';
import type { Providers } from './pipeline-steps/provider-lists';
import { toJsonSafe } from '../json-safe';

// Re-exports for backward compatibility — provider-lists.ts is the source of truth.
export { SHS_PROVIDERS, AGRICULTURE_PROVIDERS, CRIMINOLOGY_PROVIDERS, EU_SCIENCE_PROVIDERS, ALL_PROVIDERS, NEWS_PROVIDERS, ACADEMIC_PROVIDERS, GOVERNMENT_PROVIDERS, DEFAULT_ACADEMIC_PROVIDERS } from './pipeline-steps/provider-lists';
export type { Providers } from './pipeline-steps/provider-lists';

// Public ops layer extracted to pipeline-steps/public-ops.ts — re-exported
// so scripts, tests and API routes keep importing from pipeline-v2.
import { createLineageTracker, activeRuns, renderBriefHTML, scout, rank, index, validateTopicConsistency, citationGuard, recordTransformation } from './pipeline-steps/public-ops';
import type { RankOptions, DataLineage } from './pipeline-steps/public-ops';
import { PipelineContext } from "./pipeline-context";
import { contradictionDetector } from "./contradiction-detector";
import { trendAnalyzer } from "./trend-analyzer";
import { signalDetector } from "./signal-detector";
export { scout, index, rank, read, analyst, validateTopicConsistency, citationGuard, dedupeCitations, renderBriefHTML, invalidateScoutCache, getCacheStatus } from './pipeline-steps/public-ops';
export type { RankOptions, DataLineage } from './pipeline-steps/public-ops';

// FULL PIPELINE ORCHESTRATION
// ================================

// ———————————————————————————————————————————————————————————————————————————————————
// SHARED PIPELINE CORE — single implementation for brief + strategic
// ———————————————————————————————————————————————————————————————————————————————————

export interface PipelineCoreOptions {
  executionId?: string;
  isStrategic: boolean;
  /** Publication format — drives durable-execution activation (memo/dossier/strategic)
   *  and durable-key derivation. Passed through by runPipeline; was silently
   *  undefined when only read via (opts as any). */
  format?: string;
  providers?: Providers;
  perProvider?: number;
  rankOptions?: RankOptions;
  focusAreas?: string[];
  targetAudience?: string;
  urgencyContext?: string;
  maxSources?: number;
  // Pipeline tier controls — set by auto-publisher based on researcher ownership
  enableHarvardCouncil?: boolean;  // default: true
  enableDebate?: boolean;          // default: true
  enableMetaAnalysis?: boolean;    // default: true (strategic only)
  enableDevilsAdvocate?: boolean;  // default: true
  enableDeliberation?: boolean;    // default: true for strategic, false for standard
  // Enhanced Harvard Council options
  enableEnhancedCouncil?: boolean; // default: false (use legacy for compatibility)
  maxExperts?: number;             // default: 6 for strategic, 4 for standard
  enableHierarchical?: boolean;    // default: true for 15+ experts
  enableInterdisciplinary?: boolean; // default: true
  // P1-FIX: Cost budget guard — abort pipeline if cost exceeds limit
  maxBudgetUsd?: number; // default: 3.0 for brief, 8.0 for strategic
  /** Pre-validated sources — skip SCOUT when len ≥ minSeedSourcesToSkipScout */
  seedSourceIds?: string[];
  minSeedSourcesToSkipScout?: number;
  /** QUANT BRIDGE — deterministic model layer (parametric costing + FIGARO IO). Default: "io" for strategic, "none" for brief */
  quantDepth?: import("../quant/quant-bridge").QuantDepth;
  /** Optional structured costing exercise from StudioX orders */
  parametricInput?: import("../quant/types").ParametricCostInput;
  /** Regeneration loop: feedback from a rejected prior attempt injected into
   * the analyst context as mandatory corrections. */
  priorFailureFeedback?: string;
  /** HELD-retry: targeted retrieval queries the prior attempt's gate/DA
   * distilled for the evidence it lacked — scouted as a bounded mission so
   * the retry repairs the corpus gap. */
  priorEvidenceQueries?: string[];
  /** Regeneration loop: readings extracted by the prior attempt — the reader
   * reuses them for sources it already extracted and only reads NEW sources
   * (e.g. gap-fill additions). Skipping a full re-read saves ~5-8min and the
   * embedding/extraction spend that pushed regens past their 25min cap. */
  priorReadings?: unknown[];
  /** Regeneration loop: the corpus is fixed — gap-fill/post-analyst scouts
   * would mutate it, force re-reads, and blow the bounded regen window. */
  skipGapFillRetrieval?: boolean;
  /** Regeneration loop: briefs created at/after this instant do not count as
   * prior coverage — the previous attempt's own brief must not be fed back
   * to the context primer as "(0 days ago)" institutional memory. */
  primerCoverageCutoff?: Date;
  /** Enable the Witness — metacognitive observer (default: false).
   * The Witness observes each pipeline step, detects anomalies, and can
   * intervene. It also learns across runs to improve prompts and thresholds. */
  useWitness?: boolean;
  /** Enable Mixture of Agents — multiple specialist analysts (default: false) */
  useMixtureOfAgents?: boolean;
  /** Enable World Model — persistent cross-run knowledge (default: false) */
  useWorldModel?: boolean;
  /** Enable Process Reward Model — step-level scoring (default: false) */
  usePRM?: boolean;
  /** Enable adversarial self-play — finds weaknesses post-analysis (default: false) */
  useSelfPlay?: boolean;

  /** Enable output guardrails — structured output validation (default: false) */
  useOutputGuard?: boolean;
  /** Enable local judge — open-source Prometheus 2 / JudgeLM evaluation (default: false) */
  useLocalJudge?: boolean;
  /** Enable STORM + PaperQA2 — perspective-driven research + citation traversal (default: false) */
  useStorm?: boolean;
  /** Enable temporal memory — bi-temporal knowledge tracking (default: false) */
  useTemporalMemory?: boolean;
  /** Enable Think Tank Quality Pack — recommendations, economics, editorial polish (default: false) */
  useThinkTankPack?: boolean;
  /** Enable Feynman-style peer review before editor (default: false) */
  usePeerReview?: boolean;
  /** Enable RAGAS-style RAG evaluation (default: false) */
  useRagasEval?: boolean;
  /** Enable durable execution — lightweight snapshots for long runs (default: false) */
  useDurableExecution?: boolean;
  /** Optional primary data inputs — expert interviews, surveys, datasets, memos to enrich the brief */
  primaryData?: PrimarySourceInput[];
  /** Enable structured scenario modeling & foresight in think tank pack (default: true when useThinkTankPack) */
  scenarioModeling?: boolean;
  /** Maximum number of scenarios to generate (default: 3) */
  maxScenarios?: number;
  /** Enable policy stress test — multi-archetype risk review of recommendations (default: true when useThinkTankPack) */
  stressTest?: boolean;
  /** Enable policy council — multi-perspective deliberation on recommendations (default: true when useThinkTankPack) */
  policyCouncil?: boolean;
  /** Enable self-evolution — auto-improve agent prompts after the run (default: false) */
  useSelfEvolution?: boolean;
  /** Replay freeze (Sprint 42): recorded context-primer + episodic-memory
   * outputs injected instead of live fetches — these pull real-time/DB state
   * that drifts between record and replay and would break cassette keys. */
  frozenContext?: { primed?: unknown; episodic?: { episodes: unknown[]; formatted: string | null } };
}

async function runPipelineCore(query: string, opts: PipelineCoreOptions) {
  assertExecutionActive();
  opts = { ...opts, executionId: opts.executionId ?? randomUUID() };
  // ── INIT — extracted to pipeline-steps/pipeline-init.ts ──
  // Mutable flow state lives in flags/cost/selfCorrect holders so init
  // closures (addCost budget guard) and the body share the same fields.
  // Init may have already created the PipelineRun row — a throw here must
  // still mark it FAILED with the error, otherwise the row stays RUNNING
  // until the sweep and every failure lands as steps:[] / error:null.
  let init: Awaited<ReturnType<typeof runPipelineInit>>;
  try {
    init = await runPipelineInit(query, opts);
  } catch (initErr: any) {
    try {
      const orphan = await prisma.pipelineRun.findFirst({
        where: { id: opts.executionId, status: "RUNNING" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (orphan) {
        await prisma.pipelineRun.update({
          where: { id: orphan.id },
          data: { status: "FAILED", finishedAt: new Date(), error: `INIT: ${String(initErr?.message ?? initErr).slice(0, 500)}` },
        });
      }
    } catch { /* best-effort failure bookkeeping */ }
    throw initErr;
  }
  const {
    isStrategic, useWitness, useMixtureOfAgents, useWorldModel, usePRM, useSelfPlay,
    useOutputGuard, useLocalJudge, useStorm, useTemporalMemory, useThinkTankPack,
    usePeerReview, useRagasEval, useDurableExecution, useSelfEvolution,
    isDossier, isMemo, editorialV2, label, stats, pipelineStart,
    rejectionHandler, selfCorrector, witnessCtx, witnessLearningInjection,
    worldModelInjection, worldModelControversies, selfPlayInjection, prmModel,
    ctx, providers, perProvider, flags, cost, selfCorrect, addCost, isBudgetConstrained,
    pipelineRun, durableKey, durable, idempotencyKey,
  } = init;
  try {
  const briefId = `${isStrategic ? "strategic" : "brief"}-${Date.now()}`;
  const lineage = createLineageTracker(briefId, query);

  if (isStrategic) {
    console.log(`\n${"â•".repeat(60)}`);
    console.log(`  STRATEGIC REPORT PIPELINE`);
    console.log(`  Query: "${query}"`);
    console.log(`  PipelineRun: ${pipelineRun.id}`);
    console.log(`${"â•".repeat(60)}\n`);
  }

  // P2/9: Emit progress events for SSE streaming
  emitProgress(pipelineRun.id, "INIT", "started", "Initializing pipeline...");

  // Initialize Orchestrator state (with calibrated thresholds from AgentMemory)
  const orchState = createPipelineState(query, isStrategic);
  try {
    const calibratedThresholds = await loadCalibratedThresholds();
    orchState.thresholds = calibratedThresholds;
    if (calibratedThresholds.MIN_TRUST_SCORE !== 65) {
      console.log(`${label} ORCHESTRATOR: calibrated trust threshold = ${calibratedThresholds.MIN_TRUST_SCORE} (from AgentMemory)`);
    }
  } catch { /* use static thresholds */ }

  // ── STEP 0: CONTEXT PRIMER + EPISODIC MEMORY — launched concurrently ──
  // Neither is consumed until classification-gates / analyst-context, while
  // SCOUT + enrichment (~60-120s) run between launch and barrier — the
  // primer's real-time pulse fetch (~36-46s) is fully hidden behind scout.
  //
  // Replay freeze (Sprint 42): both blocks pull LIVE inputs (real-time pulse,
  // accumulating episodic memory) that drift between record and replay —
  // downstream LLM prompts would hash differently and miss. opts.frozenContext
  // injects the recorded values instead; record mode persists them into
  // stats.frozenContext so the replay harness can hand them back.
  const frozenContext = (opts as any).frozenContext as
    | { primed?: any; episodic?: { episodes: any[]; formatted: string | null }; inputs?: Record<string, unknown> }
    | undefined;
  // Seed the non-LLM freeze store — channel-keyed inputs (memory injections,
  // guidelines, positioning corpus, prediction markets) that mutate between
  // runs and would otherwise drift the prompts they feed.
  if (frozenContext?.inputs) {
    const { seedFrozenInputs } = await import('./frozen-inputs');
    seedFrozenInputs(frozenContext.inputs);
  }

  // A regeneration pass must see the same institutional memory as the first
  // pass — at record the primer otherwise picks up the brief the run itself
  // just persisted, which replay cannot reproduce. Live: retains nothing.
  const { captureInput } = await import('./frozen-inputs');

  let primedContext: Awaited<ReturnType<typeof primeContext>> | null = null;
  console.log(`${label} CONTEXT PRIMER: ${frozenContext ? 'frozen (replay)' : 'loading institutional memory'}`);
  const primedP = frozenContext
    ? Promise.resolve(frozenContext.primed ?? null)
    : captureInput('primer:context', () => primeContext(query, {
        maxConcepts: isStrategic ? 20 : 15,
        maxPriorBriefs: isStrategic ? 8 : 5,
        excludeCreatedAfter: opts.primerCoverageCutoff,
      }).then((pc) => {
        orchState.contextPrimed = true;
        orchState.knownConceptCount = pc.knownConcepts.length;
        orchState.priorBriefCount = pc.priorBriefs.length;
        stats.contextPrimer = {
          knownConcepts: pc.knownConcepts.length,
          priorBriefs: pc.priorBriefs.length,
          emergingTrends: pc.emergingTrends.length,
          trendBreaks: pc.trendBreaks?.length ?? 0,
          coverageGap: Boolean(pc.coverageGap),
          durationMs: pc.durationMs,
        };
        console.log(`${label} CONTEXT PRIMER: ${pc.knownConcepts.length} concepts, ${pc.priorBriefs.length} prior briefs, ${pc.trendBreaks?.length ?? 0} trend breaks`);
        return pc;
      }).catch((err) => {
        console.error(`${label} CONTEXT PRIMER: FAILED — pipeline continues without institutional memory:`, err);
        stats.contextPrimer = { error: String(err) } as any;
        return null;
      }));

  // ── EPISODIC MEMORY RETRIEVAL (V3.1) — learn from past pipeline runs ──
  let episodicContext: any[] = [];
  let episodicFormatted: string | null = null;
  const episodicP = frozenContext
    ? Promise.resolve(frozenContext.episodic ?? { episodes: [] as any[], formatted: null })
    : captureInput('memory:episodic', async () => {
        try {
          const { retrieveEpisodes, formatEpisodeContext, buildEpisodeContextBlock } = await import('./episodic-memory');
          const episodes = await retrieveEpisodes(query, { limit: isStrategic ? 8 : 5, minSimilarity: 0.55 });
          let formatted: string | null = null;
          if (episodes.length > 0) {
            console.log(`${label} EPISODIC MEMORY: retrieved ${episodes.length} relevant past runs`);
            const ctxBlock = buildEpisodeContextBlock(episodes);
            formatted = formatEpisodeContext(ctxBlock);
          }
          // Telemetry for the A/B protocol — episodic retrieval previously ran
          // every run but wrote no stats key, making its value unmeasurable.
          (stats as Record<string, any>).episodicMemory = { retrieved: episodes.length, injected: Boolean(formatted) };
          return { episodes, formatted };
        } catch (err) {
          console.warn(`${label} EPISODIC MEMORY: retrieval failed (non-blocking):`, err);
          (stats as Record<string, any>).episodicMemory = { retrieved: 0, injected: false, error: String(err) };
          return { episodes: [] as any[], formatted: null };
        }
      });

  // Phase-timing rollup: wall-clock at each major boundary, persisted into
  // stats.phaseTimings so postmortems get a phase breakdown without reading
  // 5k lines of log. Values are cumulative ms since pipelineStart.
  const phaseMarks: Record<string, number> = {};
  const phaseMark = (name: string) => {
    assertExecutionActive();
    phaseMarks[name] = Date.now() - pipelineStart;
  };
  (stats as any).phaseTimings = phaseMarks;

  // -- STEP 1: SCOUT — extracted to pipeline-steps/scout-block.ts --
  // Budget lane 'scout': broad discovery fan-out gets its own sub-cap per
  // upstream (HTTP_LANE_SCOUT_FRACTION, default 70%) so post-analyst
  // retrieval (gap-fill, held-retry evidence queries) keeps budget —
  // live evidence showed scout exhausting OpenAlex and starving repair.
  const { withHttpBudgetLane } = await import('../http-client');
  const scoutOut = await withHttpBudgetLane('scout', () => runScoutBlock({
    query, providers, perProvider, isStrategic, useStorm,
    seedSourceIds: opts.seedSourceIds,
    minSeedSourcesToSkipScout: opts.minSeedSourcesToSkipScout,
    priorEvidenceQueries: opts.priorEvidenceQueries,
    domain: (opts as any).domain, durableKey, scout,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    pipelineStart, emitProgress, isBudgetConstrained, orchState,
    assessAfterScout, recordDecision, recordTransformation, lineage,
    witnessCtx, ctx,
  }));
  let allSourceIds = scoutOut.allSourceIds;
  const planNodesForAudit = scoutOut.planNodesForAudit;
  const scoutCkpt = scoutOut.scoutCkptRestored;
  phaseMark('scout');

  // ── WEB FALLBACK → INTELLIGENT SCOUT → CITATION GRAPH → INDEX/EMBED/DEDUP ──
  // Extracted to pipeline-steps/scout-enrichment-index.ts; web-fallback
  // providers run concurrently (id lists merged in deterministic order).
  //
  // Replay freeze: every post-scout retrieval channel (enrichment scouts,
  // CRAG re-scouts, refusal retries, gap-fill scouts, intelligent-scout
  // searches, gap-filler scouts) hits live providers and mutates the corpus
  // mid-run — a replay cannot reproduce those fetches, and the drift surfaces
  // as cassette misses downstream (observed: "pre-rank: 26 vs 27"). Wrap the
  // scout dep so record captures {sourceIds} per query and replay serves them.
  // Only ids are consumed downstream, so the frozen payload stays compact.
  const { captureInput: captureFrozen } = await import('./frozen-inputs');
  const frozenScout = (q: string, provs: any, per?: number) =>
    captureFrozen(`scout:${createHash('sha1').update(JSON.stringify([q, provs, per])).digest('hex')}`, async () => {
      const r: any = await scout(q, provs, per);
      const ids = Array.isArray(r) ? r.map((s: any) => s.id) : (r?.sourceIds || []);
      return { sourceIds: ids };
    });
  // Corpus as the ranker first saw it — replay seeds THIS set, not the
  // post-run final corpus (enrichment merges grow allSourceIds afterwards).
  // Captured AFTER scout-enrichment-index: intelligent-scout/web-fallback
  // additions are part of the corpus the reasoner assessed.
  {
    const { runScoutEnrichmentAndIndex } = await import('./pipeline-steps/scout-enrichment-index');
    // Same 'scout' lane — enrichment re-scouts/web-fallback are part of the
    // discovery phase and share its sub-cap; the reserve is for repair.
    allSourceIds = await withHttpBudgetLane('scout', () => runScoutEnrichmentAndIndex({
      allSourceIds, query, label,
      stats: stats as Record<string, any>,
      scoutCkpt: !!scoutCkpt,
      skipRetrieval: opts.skipGapFillRetrieval,
      format: isStrategic ? 'strategic' : isDossier ? 'dossier' : isMemo ? 'memo' : 'brief',
      domain: (opts as any).domain || 'general',
      scout: frozenScout, durableKey, saveDurableStep, index,
    }));
    phaseMark('indexEnrich');
  }

  // ── STEP 4: RANK + ENRICHMENT — extracted to pipeline-steps/rank-enrichment.ts ──
  // rank → pertinence selection → quality rerank → domain filter →
  // enrichment reasoner (re-scout / refusal-retry) → evidence registry.
  await captureFrozen('corpus:rank-entry', async () => allSourceIds);
  let topSources: any[];
  let evidenceRegistry: any;
  let rankOpts: RankOptions;
  {
    const { runRankAndEnrichment } = await import('./pipeline-steps/rank-enrichment');
    const rankOut = await runRankAndEnrichment({
      query, allSourceIds, isStrategic,
      rankOptions: opts.rankOptions,
      skipRetrieval: opts.skipGapFillRetrieval,
      providers, stats: stats as Record<string, any>, label, pipelineStart,
      runningCostUsd: cost.runningCostUsd, pipelineRunId: pipelineRun.id,
      rank, scout: frozenScout, emitProgress, addCost, ctx, orchState,
    });
    topSources = rankOut.topSources;
    allSourceIds = rankOut.allSourceIds;
    evidenceRegistry = rankOut.evidenceRegistry;
    rankOpts = rankOut.rankOpts;
    if (rankOut.refused) {
      const reason = `refusal: ${stats.structuredRefusal?.reason ?? 'insufficient_evidence'}`;
      activeRuns.delete(idempotencyKey);
      process.removeListener('unhandledRejection', rejectionHandler);
      await prisma.pipelineRun.update({
        where: { id: pipelineRun.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - pipelineStart,
          error: reason.slice(0, 500),
          steps: toJsonSafe({ ...stats, error: reason }),
        },
      }).catch(() => {});
      return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
    }
  }
  // -- STEP 4b: classification + routing gates (extracted) --
  const gates = await runClassificationGates({
    query, topSources, allSourceIds, providers, scout: frozenScout, stats, label,
    isStrategic, enableEnhancedCouncil: opts.enableEnhancedCouncil,
    useThinkTankPack, editorialV2,
    skipRetrieval: opts.skipGapFillRetrieval,
    runMetaAnalysisStep: flags.runMetaAnalysisStep, runDeliberationStep: flags.runDeliberationStep, runDebateStep: flags.runDebateStep, runDevilsAdvocateStep: flags.runDevilsAdvocateStep,
    ctx,
  });
  const topicClassification = gates.topicClassification;
  const detectedDomain = gates.detectedDomain;
  const castingResult = gates.castingResult;
  const foundationalSources = gates.foundationalSources;
  const gapContextBlock = gates.gapContextBlock;
  allSourceIds = gates.allSourceIds;
  flags.runMetaAnalysisStep = gates.runMetaAnalysisStep;
  flags.runDeliberationStep = gates.runDeliberationStep;
  flags.runDebateStep = gates.runDebateStep;
  flags.runDevilsAdvocateStep = gates.runDevilsAdvocateStep;
  phaseMark('rankGates');

  // ── BRANCH EVIDENCE COVERAGE (deterministic, zero LLM) ──
  // CRAG-style per-branch retrieval evaluation: an aggregate pool can look
  // rich while a required plan branch has near-zero ranked evidence — the
  // analyst then writes unsupported claims on that branch (S33 live failure:
  // 56 ranked sources overall, individual branches at 0-2 → critic reject).
  // Thin branches emit targeted blackboard gap requests (drained by the
  // gap-fill stage post-analyst) and are annotated in the REQUIRED COVERAGE
  // block so the analyst hedges instead of fabricating.
  const { auditBranchCoverage, evidenceNotesFor } = await import('./pipeline-steps/branch-coverage');
  const branchCoverage = auditBranchCoverage(planNodesForAudit, topSources);
  if (branchCoverage.entries.length > 0) {
    stats.branchCoverage = {
      strong: branchCoverage.strong, weak: branchCoverage.weak, unsupported: branchCoverage.unsupported,
      perBranch: branchCoverage.entries.map(e => ({ branch: e.subQuestion.slice(0, 80), rankedSources: e.rankedSources, verdict: e.verdict })),
    };
    console.log(`${label} BRANCH COVERAGE: ${branchCoverage.strong} strong, ${branchCoverage.weak} weak, ${branchCoverage.unsupported} unsupported`);
    // The blackboard drains ≤2 requests per pass — send the weakest first.
    for (const e of branchCoverage.entries.filter(e => e.verdict !== 'strong').slice(0, 2)) {
      ctx.requestSourceGap(e.subQuestion, `thin_branch_evidence: ${e.rankedSources} ranked sources`, 'SCOUT-BRANCH', undefined, 8);
    }
  }

  // CORPUS CAP (S34 live-run finding): the analyst prompt scales ~linearly
  // with sources — 100 sources ≈ 73k input tokens ≈ $0.32/pass ×3 passes ×N
  // candidates, and the S34 run measured only 12% topical relevance in the
  // tail of the pool. Capping the shared corpus at ANALYST_CORPUS_CAP keeps
  // the best-ranked evidence while cutting every downstream analyst/critic
  // call ~40%. Two protections: a planner-bound branch source and a
  // provider singleton can never be cut — the cap saves tokens, it must not
  // destroy branch coverage or diversity. allSourceIds keeps the full pool
  // so gap-fill re-ranks still see everything.
  // Provider-degraded sizing: the pre-flight snapshot (and a live re-check
  // — providers can die mid-run, e.g. kimi credit exhaustion) tells us
  // whether failover headroom exists. With <2 LLMs alive the heavy passes
  // run on a single slow provider; a strategic 60-source corpus pushed
  // P1 past the window and starved P2 entirely (live radar evidence).
  // Shrink the corpus so the essential passes fit — evidence quality per
  // source is preserved by rank order, only tail noise is cut.
  // Frozen-input channel: provider suspension state is live-varying —
  // record captures the verdict, replay serves it so corpus sizing stays
  // deterministic. Old fixtures lack the channel → live fallthrough →
  // any resulting prompt drift still surfaces as a CassetteMissError.
  const { captureInput: captureDegraded } = await import('./frozen-inputs');
  const llmDegraded = await captureDegraded('preflight:llm-degraded', async () => {
    const snapshotSaysDegraded = ((stats as any).preflight?.aliveProviders?.length ?? 99) < 2;
    if (snapshotSaysDegraded) return true;
    try {
      const { getAvailableProviders, getSuspendedProviders } = await import('../llm/unified-llm');
      const suspendedNow = await getSuspendedProviders();
      const aliveNow = getAvailableProviders().filter(p => !suspendedNow.includes(p));
      (stats as any).preflight = { ...(stats as any).preflight, aliveProvidersAtRank: aliveNow };
      return aliveNow.length < 2;
    } catch { return false; }
  });
  const { computeRunPlan } = await import('./run-plan');
  const { getTightestExecutionBudgetMs } = await import('../worker/execution-scope');
  const runPlan = computeRunPlan({
    isStrategic,
    depth: isStrategic ? 'strategic' : isDossier ? 'dossier' : isMemo ? 'memo' : 'brief',
    aliveLlmProviders: (((stats as any).preflight?.aliveProvidersAtRank ?? (stats as any).preflight?.aliveProviders) as unknown[] | undefined)?.length ?? 99,
    scopeBudgetMs: getTightestExecutionBudgetMs(),
  });
  (stats as any).runPlan = runPlan;
  if (runPlan.rationale.length > 0) {
    console.log(`${label} RUN PLAN: ${runPlan.profile} — ${runPlan.rationale.join('; ')}`);
  }
  const corpusCap = Number(process.env.ANALYST_CORPUS_CAP ?? runPlan.corpusCap);
  if (corpusCap > 0 && topSources.length > corpusCap) {
    const branchBound = new Set(planNodesForAudit.flatMap(n => n.sourceIds ?? []));
    const providerCount = new Map<string, number>();
    for (const s of topSources) providerCount.set(s.provider || 'unknown', (providerCount.get(s.provider || 'unknown') ?? 0) + 1);
    const capped = topSources.filter((s, i) =>
      i < corpusCap || branchBound.has(s.id) || (providerCount.get(s.provider || 'unknown') ?? 0) === 1
    );
    stats.corpusCap = {
      before: topSources.length, after: capped.length, cap: corpusCap,
      protectedBranch: capped.filter(s => branchBound.has(s.id)).length,
      protectedSingleton: capped.filter(s => !branchBound.has(s.id) && (providerCount.get(s.provider || 'unknown') ?? 0) === 1).length,
    };
    topSources = capped;
    console.log(`${label} CORPUS CAP: ${stats.corpusCap.before} → ${stats.corpusCap.after} sources (branch-bound and provider-singleton protected${llmDegraded ? ', provider-degraded sizing' : ''})`);
  }

  // Authority-corpus measurement (CTO lever 1): share of ranked sources
  // hosted on reference-editor domains. Target ≥60% on flagship runs.
  {
    const { authorityMatch } = await import('./reference-editors');
    const authority = topSources.filter(s => authorityMatch(s.url)).length;
    stats.authorityCorpus = {
      authoritySources: authority,
      totalSources: topSources.length,
      share: topSources.length ? Math.round((authority / topSources.length) * 1000) / 10 : 0,
      byTier: topSources.reduce((acc: Record<string, number>, s) => {
        const m = authorityMatch(s.url);
        if (m) acc[m.tier] = (acc[m.tier] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }

  // Barrier: context primer + episodic memory (launched pre-scout) must
  // resolve here — first consumers are reader-block and analyst-context.
  {
    const [primed, episodic] = await Promise.all([primedP, episodicP]);
    primedContext = primed;
    episodicContext = episodic.episodes;
    episodicFormatted = episodic.formatted;
  }

  // -- STEP 5: READER V3 + FRAMING + QUANT + enrichment (extracted) --
  const readerBlk = await runReaderBlock({
    topSources, query, detectedDomain, isStrategic, runDeliberationStep: flags.runDeliberationStep,
    primedContext, stats, label, pipelineStart, pipelineRunId: pipelineRun.id,
    durable, emitProgress, addCost, ctx, orchState, assessAfterReader, recordDecision,
    quantDepth: opts.quantDepth, parametricInput: opts.parametricInput,
    priorReadings: opts.priorReadings,
    frozenQuant: (frozenContext as any)?.quant || (frozenContext as any)?.quantBridge
      ? { quant: (frozenContext as any).quant, quantBridge: (frozenContext as any).quantBridge }
      : undefined,
  });
  const readings = readerBlk.readings;
  // Cassette-record companion: persist the live-input snapshot so a replay
  // run can freeze identical primer/episodic/readings/quant (see STEP 0).
  // Record mode only — replay supplies frozenContext + priorReadings.
  // Readings are the big nondeterminism surface (live PDF/news fetches,
  // extraction quirks) and quant embeds live primary-data APIs, so both
  // ride along rather than being re-fetched.
  // When frozenContext was supplied (re-record on top of a previous
  // snapshot) the resolved primed/episodic/readings ARE the frozen values —
  // recording them again is correct and keeps stats.frozenContext populated
  // so mergeInputsIntoStats can flush the captured inputs map.
  if (getLlmCassetteMode() === 'record') {
    (stats as any).frozenContext = {
      primed: primedContext,
      episodic: { episodes: episodicContext, formatted: episodicFormatted },
      readings,
      quant: readerBlk.quant,
      quantBridge: readerBlk.quantBridge,
      allSourceIds,
      topSourceIds: topSources.map((s: any) => s.id),
      inputs: {}, // merged at persistence time — late channels (positioning,
      // markets, memory injections) capture throughout the whole run.
    };
  }
  const framing = readerBlk.framing;
  const quant = readerBlk.quant;
  const quantBridge = readerBlk.quantBridge;
  const readerMemoryBlock = readerBlk.readerMemoryBlock;
  const evidenceBankBlock = readerBlk.evidenceBankBlock;
  const evidenceBankRef = readerBlk.evidenceBankRef;
  const hypothesisVerdictBlock = readerBlk.hypothesisVerdictBlock;
  const dppContextBlock = readerBlk.dppContextBlock;
  const roundTableBlock = readerBlk.roundTableBlock;
  phaseMark('reader');
  // ── CORPUS VIABILITY PRE-GATE ──
  // Deterministic abort BEFORE the analyst (~$0.10/call + downstream burn).
  // Both S30 HELD items paid the full analyst+editorial chain on corpora a
  // cheap metric could have condemned: viability = substantive reader
  // extractions (claims/results/methods) AND extractable-text coverage.
  // A corpus that fails here cannot produce a publishable artifact — refuse
  // and let the dispatcher fall through to the next candidate.
  const substantiveReadings = readings.filter(
    (r: any) => ((r.claims?.length ?? 0) + (r.results?.length ?? 0) + (r.methods?.length ?? 0)) > 0
  ).length;
  const sourcesWithExtractableText = topSources.filter(
    (s: any) => (s.abstract && s.abstract.length > 100) || (s.fullText && s.fullText.length > 200)
  ).length;
  const textCoverageRatio = topSources.length > 0 ? sourcesWithExtractableText / topSources.length : 0;
  const minViableReadings = Number(process.env.VIABILITY_MIN_READINGS ?? (isStrategic ? 15 : 8));
  const minTextCoverage = Number(process.env.VIABILITY_MIN_TEXT_COVERAGE ?? 0.25);
  const corpusViable = substantiveReadings >= minViableReadings && textCoverageRatio >= minTextCoverage;
  stats.viability = {
    substantiveReadings, sourcesWithExtractableText, textCoverage: Math.round(textCoverageRatio * 100) / 100,
    minViableReadings, minTextCoverage, passed: corpusViable,
  };
  if (!corpusViable) {
    const reason = `corpus_insufficient: ${substantiveReadings} substantive readings (need ${minViableReadings}), ${Math.round(textCoverageRatio * 100)}% extractable text (need ${Math.round(minTextCoverage * 100)}%)`;
    console.warn(`${label} REFUSAL: ${reason} — refusing before analyst spend`);
    stats.structuredRefusal = {
      reason,
      sourceCount: topSources.length,
      required: minViableReadings,
      missing: ['reader_extractions'],
    };
    stats.totalCostUsd = cost.runningCostUsd;
    emitProgress(pipelineRun.id, "ANALYST", "failed", `Refused: ${reason}`);
    activeRuns.delete(idempotencyKey);
    process.removeListener('unhandledRejection', rejectionHandler);
    await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - pipelineStart,
        error: reason.slice(0, 500),
        steps: toJsonSafe({ ...stats, error: reason }),
      },
    }).catch(() => {});
    return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
  }

  // ── THESIS SUFFICIENCY (S39) — registered hypotheses inconclusive AND
  // bottom-up corpus derivation found nothing defensible: this corpus cannot
  // yield a position. Spending the analyst/critic/DA tail on it manufactures
  // a HELD at full price. Refuse now — same economics as corpus_insufficient,
  // one level deeper (not "enough sources?" but "enough SUPPORT?").
  if (stats.thesisBinding?.absent === 'no_supportable_thesis' || stats.thesisBinding?.unavailable) {
    const reason = stats.thesisBinding.unavailable
      ? 'thesis_evaluation_unavailable: evidence assessment incomplete — retry assessment before analyst spend'
      : `thesis_insufficient: ${topSources.length} sources read but no defensible central claim derivable — refusing before analyst spend`;
    console.warn(`${label} REFUSAL: ${reason}`);
    stats.structuredRefusal = {
      reason,
      sourceCount: topSources.length,
      required: 0,
      missing: stats.thesisBinding.unavailable ? ['thesis_evaluation'] : ['supportable_thesis'],
    };
    stats.totalCostUsd = cost.runningCostUsd;
    emitProgress(pipelineRun.id, "ANALYST", "failed", `Refused: ${reason}`);
    activeRuns.delete(idempotencyKey);
    process.removeListener('unhandledRejection', rejectionHandler);
    await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - pipelineStart,
        error: reason.slice(0, 500),
        steps: toJsonSafe({ ...stats, error: reason }),
      },
    }).catch(() => {});
    return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
  }

  // STEP 6: ANALYSTSTEP 6: ANALYST (brief = V3 multi-pass, strategic = Strategic Analyst) â”€â”€
  emitProgress(pipelineRun.id, "ANALYST", "started", `${isStrategic ? "Strategic-depth multi-pass analysis" : "Multi-pass analysis"}...`);
  console.log(`${label} ANALYST: V3 multi-pass (depth: ${isStrategic ? 'strategic' : 'brief'})`);
  // -- PRE-ANALYST CONTEXT — extracted to pipeline-steps/analyst-context.ts --
  // memory + synapse -> domain/canon -> north star -> conflict-aware ->
  // scenario engine -> innovator -> assembly -> SARA -> prior-failure ->
  // evidence sufficiency -> positioning -> slimReadings.
  const analystCtx = await buildAnalystContext({
    query, topSources, readings, detectedDomain, isStrategic, isDossier,
    topicClassification, primedContext, gapContextBlock, quant, quantBridge,
    hypothesisVerdictBlock, evidenceBankBlock,
    episodicFormatted: episodicFormatted ?? undefined,
    dppContextBlock, roundTableBlock,
    witnessLearningInjection, worldModelInjection, selfPlayInjection,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    emitProgress, addCost,
    focusAreas: opts.focusAreas, targetAudience: opts.targetAudience,
    urgencyContext: opts.urgencyContext,
    priorFailureFeedback: opts.priorFailureFeedback, ctx,
  });
  const memoryBlock = analystCtx.memoryBlock;
  let fullContextBlock = analystCtx.fullContextBlock;
  // REQUIRED COVERAGE — the deep planner decomposed this question into
  // investigation branches for the scout, but the analyst never saw them:
  // the analysis could silently narrow the question (observed: a "broader
  // patterns" question answered mono-country → DA fatal). The branches ARE
  // the scope contract — inject them as mandatory coverage before the
  // analyst writes a word. (buildRequiredCoverageBlock — tested)
  const requiredBranches = planNodesForAudit
    .filter(n => n.subQuestion && n.status !== 'failed')
    .map(n => n.subQuestion);
  const coverageBlock = buildRequiredCoverageBlock(planNodesForAudit, evidenceNotesFor(branchCoverage));
  if (coverageBlock) {
    fullContextBlock = (fullContextBlock || '') + coverageBlock;
  }
  const positioningBrief = analystCtx.positioningBrief;
  const savedCanaResult = analystCtx.savedCanaResult;
  const savedScatterResult = analystCtx.savedScatterResult;
  const slimReadings = analystCtx.slimReadings;

  let analysis: any;

  // ── ARTIFACT VERSIONING (Sprint 28 / P0/1) ──
  // The S27 bug class: an evaluation stays attached to an artifact that was
  // silently replaced (DA verdict on pre-sweep HTML, critic verdict on
  // pre-repair analysis). Counters bump ONLY on material content replacement —
  // not on enrichment (attaching centralScenario/scenarios metadata post-eval
  // doesn't invalidate what an evaluator judged) nor on cosmetic HTML fixes
  // (e.g./i.e. normalization, badge injection). Each evaluation is tagged with
  // the version it judged; collectStaleEvaluations() marks  on any
  // verdict attached to a replaced artifact — vetoes skip stale evals and the
  // publication gate sees them via stats.evaluationFreshness.
  let analysisArtifactVersion = 0;
  let htmlArtifactVersion = 0;
  const bumpAnalysisArtifact = () => { analysisArtifactVersion++; };
  const bumpHtmlArtifact = () => { htmlArtifactVersion++; };
  const tagEval = <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html'): T => {
    (entry as any).evaluatedArtifact = artifact;
    (entry as any).artifactVersion = artifact === 'analysis' ? analysisArtifactVersion : htmlArtifactVersion;
    return entry;
  };
  // peerReview is deliberately NOT freshness-tracked: it scores the PRE-PACK
  // html by design (post-render-extras), thinkTankPack legitimately mutates
  // the artifact afterward, and nothing consumes its verdict (not trust,
  // not the gate) — tracking it turned every pack-mutating run into a
  // systematic evaluation_freshness HOLD.
  const EVAL_STATS_KEYS = ['critic', 'criticPanel', 'devilsAdvocate', 'structuralEditor', 'claimGrounding', 'citationVerifier', 'factChecker', 'symbolicVerifier'] as const;
  const evalVersionMatches = (e: any): boolean =>
    !e || typeof e !== 'object' || e.skipped || e.error ||
    typeof e.artifactVersion !== 'number' ||
    e.artifactVersion === (e.evaluatedArtifact === 'html' ? htmlArtifactVersion : analysisArtifactVersion);
  const collectStaleEvaluations = (): string[] => {
    const stale: string[] = [];
    for (const key of EVAL_STATS_KEYS) {
      const e = (stats as any)[key];
      if (e && typeof e === 'object' && !e.skipped && !e.error && !evalVersionMatches(e)) {
        e.stale = true;
        e.staleReason = `evaluated ${e.evaluatedArtifact} v${e.artifactVersion}, artifact now at v${e.evaluatedArtifact === 'html' ? htmlArtifactVersion : analysisArtifactVersion}`;
        stale.push(key);
      }
    }
    return stale;
  };
  // -- ANALYST EXECUTION — extracted to pipeline-steps/analyst-run.ts --
  const analystOut = await runAnalystExecution({
    query, topSources, slimReadings, fullContextBlock, detectedDomain,
    isStrategic, useMixtureOfAgents, runningCostUsd: cost.runningCostUsd,
    maxBudgetUsd: opts.maxBudgetUsd,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    pipelineStart, emitProgress, addCost, durable, analystMultipass,
    bumpAnalysisArtifact, ctx,
  });
  analysis = analystOut.analysis;
  const analystCostUsd = analystOut.analystCostUsd;
  phaseMark('analyst');

  // Analysis generation failed outright (e.g. all LLM providers down) — the
  // downstream render/editorial/regen chain cannot produce a publishable
  // artifact from a stub, so refuse here instead of burning the cycle.
  if ((analysis as any)?._meta?.failed) {
    const reason = `analysis_generation_failed: ${String((analysis as any)._meta?.error ?? 'unknown').slice(0, 200)}`;
    console.warn(`${label} REFUSAL: ${reason}`);
    stats.structuredRefusal = {
      reason,
      sourceCount: topSources.length,
      required: 0,
      missing: ['llm_analysis'],
    };
    stats.totalCostUsd = cost.runningCostUsd;
    emitProgress(pipelineRun.id, "ANALYST", "failed", `Refused: ${reason}`);
    activeRuns.delete(idempotencyKey);
    process.removeListener('unhandledRejection', rejectionHandler);
    await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - pipelineStart,
        error: reason.slice(0, 500),
        steps: toJsonSafe({ ...stats, error: reason }),
      },
    }).catch(() => {});
    return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
  }

  // -- POST-ANALYST CHECKS — extracted to pipeline-steps/post-analyst-checks.ts --
  const checks = await runPostAnalystChecks({
    analysis, query, topSources, slimReadings, fullContextBlock, detectedDomain,
    isStrategic, analystCostUsd, stats: stats as Record<string, any>, label,
    pipelineRunId: pipelineRun.id, pipelineStart, emitProgress, addCost,
    useOutputGuard, useLocalJudge, useSelfPlay, usePRM, prmModel, witnessCtx,
    witnessReducedScope: flags.witnessReducedScope, runDevilsAdvocateStep: flags.runDevilsAdvocateStep, runDebateStep: flags.runDebateStep, runDeliberationStep: flags.runDeliberationStep,
    selfCorrector, selfCorrectRetries: selfCorrect.retries, analystMultipass, bumpAnalysisArtifact,
    validateTopicConsistency, assessAfterAnalyst, recordDecision, orchState, ctx,
    requiredDimensions: requiredBranches,
  });
  analysis = checks.analysis;
  let reAnalysisBudget = checks.reAnalysisBudget;
  // ── THESIS BINDING adherence + routed repair — extracted to
  // pipeline-steps/thesis-binding.ts. The central claim was contracted FROM
  // the corpus upstream; a verdict exceeding it is speculation-as-thesis.
  // verifyThesisBinding stays a closure so the 'pre-render' call site below
  // reuses the same deps (getAnalysis reads the live `analysis` variable).
  const { verifyThesisBindingStage, runThesisBindingRepair } = await import('./pipeline-steps/thesis-binding');
  const thesisBindingDeps = {
    stats: stats as Record<string, any>,
    getAnalysis: () => analysis,
    setAnalysis: (a: any) => { analysis = a; },
    addCost, ctx, label, query, topSources, slimReadings,
    fullContextBlock, detectedDomain, isStrategic, pipelineStart,
    analystMultipass, bumpAnalysisArtifact,
  };
  const verifyThesisBinding = (stage: string) => verifyThesisBindingStage(thesisBindingDeps, stage);
  await verifyThesisBinding('post-analyst');
  const tbRepair = await runThesisBindingRepair(thesisBindingDeps, { reAnalysisBudget, verify: verifyThesisBinding });
  reAnalysisBudget = tbRepair.reAnalysisBudget;
  // ── BRANCH CITATION AUDIT (deterministic) — did the analysis actually use
  // each branch's evidence? A plan branch cited 0× is the hard counterpart
  // of the outline critic's missing dimensions; its gap request is drained
  // by the gap-fill stage immediately below (earliest possible retrieval).
  if (branchCoverage.entries.length > 0) {
    const { auditBranchCitations } = await import('./pipeline-steps/branch-coverage');
    const citAudit = auditBranchCitations(planNodesForAudit, topSources, analysis);
    if (citAudit.uncited.length > 0) {
      stats.branchCitations = { cited: citAudit.cited.length, uncited: citAudit.uncited.map(q => q.slice(0, 80)) };
      console.log(`${label} BRANCH CITATIONS: ${citAudit.uncited.length}/${branchCoverage.entries.length} branches uncited — targeted gap requests queued`);
      for (const q of citAudit.uncited.slice(0, 2)) {
        ctx.requestSourceGap(q, 'branch_uncited_in_analysis', 'COVERAGE-AUDIT', undefined, 8);
      }
    }
  }
  // ARGUS-LITE evidence-graph audit: present_fact links the claim→passage
  // contract marked unsupported are missing support edges in the evidence
  // DAG — each becomes a targeted gap request drained by the gap-fill stage
  // below. Deterministic, zero LLM cost; fixed-corpus replay drains the
  // requests without scouting, so the recorded call stream is unchanged.
  {
    const { deriveEvidenceGapRequests } = await import('./pipeline-steps/evidence-graph-gaps');
    const evGaps = deriveEvidenceGapRequests(analysis);
    if (evGaps.length > 0) {
      stats.evidenceGraphGaps = { unsupportedClaims: evGaps.length, queued: evGaps.length };
      console.log(`${label} EVIDENCE-GRAPH: ${evGaps.length} unsupported claims → targeted gap requests`);
      for (const g of evGaps) {
        ctx.requestSourceGap(g.query, `unsupported_claim_evidence (cited SRC-${g.citedSourceRef ?? '?'})`, 'EVIDENCE-GRAPH', undefined, 6);
      }
    }
  }
  // EVIDENCE-INDEPENDENCE audit (deterministic, embedding-based): distinct
  // [SRC-N] citations can be the same underlying study — count effective
  // independent evidence clusters. Frozen channel; old fixtures without it
  // skip the audit entirely (hasFrozenInput guard → no live embedding read).
  {
    const { hasFrozenInputs, hasFrozenInput, captureInput } = await import('./frozen-inputs');
    const replaying = hasFrozenInputs();
    if (!replaying || hasFrozenInput('evidence:independence')) {
      const { auditEvidenceIndependence } = await import('./evidence-independence');
      const analysisText = typeof analysis === 'string' ? analysis : JSON.stringify(analysis ?? {});
      const independence = await captureInput('evidence:independence', () =>
        auditEvidenceIndependence(analysisText, topSources),
      );
      if (independence) {
        stats.evidenceIndependence = independence;
        console.log(`${label} EVIDENCE-INDEPENDENCE: ${independence.effectiveIndependent}/${independence.citedCount} effective clusters (${independence.clusteredPairs} near-dup pairs, maxSim=${independence.maxPairwise}) — ${independence.verdict}`);
        if (independence.verdict === 'collapsed') {
          ctx.addFinding('EVIDENCE-INDEPENDENCE', 'warning',
            `${independence.citedCount} cited sources collapse to ${independence.effectiveIndependent} independent evidence clusters — document count overstates evidence breadth`,
            { effectiveIndependent: independence.effectiveIndependent, citedCount: independence.citedCount });
        }
      }
    }
  }
  const analystDecision = checks.analystDecision;
  flags.witnessReducedScope = checks.witnessReducedScope;
  flags.runDevilsAdvocateStep = checks.runDevilsAdvocateStep;
  flags.runDebateStep = checks.runDebateStep;
  flags.runDeliberationStep = checks.runDeliberationStep;
  selfCorrect.retries = checks.selfCorrectRetries;

  // -- POST-ANALYST GAP FILL — extracted to pipeline-steps/gap-fill.ts --
  // Shared state: the critic block consumes the same object so a gap-fill
  // re-analysis triggered from CRITIC/OUTLINE is adopted, not clobbered.
  const gapFillState: GapFillState = { analysis, allSourceIds, reAnalysisBudget };
  const gapFillDeps: GapFillDeps = {
    state: gapFillState, query, topSources, readings, slimReadings,
    detectedDomain, isStrategic, fullContextBlock, providers, rankOpts,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    pipelineStart,
    analystDecision, orchState, emitProgress, addCost, isBudgetConstrained,
    bumpAnalysisArtifact, analystMultipass, rank, scout: frozenScout, ctx,
    skipRetrieval: opts.skipGapFillRetrieval === true,
    // Gap-fill merges bypass the rank-phase topical screen — vet newcomers
    // before they reach the analyst/render corpus. Only invoked on
    // !skipRetrieval paths, so fixed-corpus replay never calls it.
    screenAdditions: async (q: string, candidates: any[]) => {
      const { screenSourcesForRelevance } = await import('./pipeline-steps/relevance-screen');
      const res = await screenSourcesForRelevance({ query: q, candidates, label, addCost, costStep: 'RELEVANCE_SCREEN_GAPFILL' });
      if (!res) return null;
      // Strict triage parity with rank-enrichment: tangential newcomers drop
      // once the screened batch holds ≥8 core sources.
      const drop = new Set(res.dropIds);
      if (res.correctCount >= 8) res.tangentialIds.forEach((id) => drop.add(id));
      if (drop.size > 0 || res.screened > 0) {
        stats.gapFillScreen = { ...(stats.gapFillScreen ?? {}), screened: res.screened, dropped: drop.size, tangentialDropped: res.correctCount >= 8 ? res.tangentialIds.size : 0, costUsd: res.costUsd };
      }
      return drop;
    },
    // Pre-adoption witness — scores a candidate re-analysis with the same
    // critic preprocessing as eval-rescore so a citation-richer but
    // quality-poorer candidate cannot replace a better-scored analysis.
    criticScoreFn: async (candidateAnalysis: any) => {
      try {
        const { runCritic } = await import('./critic-agent');
        const { criticReviewText } = await import('./analysis-repair');
        const { SPECULATIVE_OR_META_KEYS } = await import('./pipeline-steps/eval-rescore');
        const obj = typeof candidateAnalysis === 'string' ? JSON.parse(candidateAnalysis) : { ...candidateAnalysis };
        const filtered: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (!SPECULATIVE_OR_META_KEYS.has(k)) filtered[k] = v;
        }
        const text = criticReviewText(filtered).replace(/\[E(\d+)\]/g, '[SRC-$1]');
        const readingsById = new Map<string, any>(readings.map((r: any) => [r.sourceId, r]));
        const srcs = topSources.map((s: any, i: number) => ({
          index: i + 1, title: s.title || '', abstract: s.abstract || '',
          fullText: readingsById.get(s.id)?.extractedText || null,
          provider: s.provider || '', year: s.year || undefined,
        }));
        const r = await runCritic(text, srcs, { skipBias: false, skipContradictions: false });
        return { score: r.overallScore, verdict: r.verdict, costUsd: r.costUsd };
      } catch (e) {
        console.warn(`${label} GAPFILL_RESCORE failed (non-blocking):`, e);
        return null;
      }
    },
  };
  const processGapRequests = createGapRequestProcessor(gapFillDeps);
  await runGapFillStage(gapFillDeps);
  analysis = gapFillState.analysis;
  allSourceIds = gapFillState.allSourceIds;
  reAnalysisBudget = gapFillState.reAnalysisBudget;
  // ── EARLY ADHERENCE ABORT (opt-in NOMOSX_EARLY_ADHERENCE_ABORT=1) ──
  // A verdict still breaching the bound thesis after verdict-narrowing +
  // re-analysis repair is a predetermined thesis_adherence gate failure:
  // the hard check reads stats.thesisBinding.adhered and nothing
  // downstream rewrites analysis.verdict. Re-verify first — a gap-fill
  // re-analysis may have produced a new, adherent verdict (the check
  // skips when the verdict is unchanged). Then every remaining stage —
  // pre-critic gates, critic, panel, debate, arbiter, DA, render — is
  // spend on a hold already decided. Abort with the same fail-closed
  // shape as the analysis-failure refusal above.
  const tbPostGap = (stats as any).thesisBinding;
  const earlyAbortEnabled = process.env.NOMOSX_EARLY_ADHERENCE_ABORT === '1';
  if (earlyAbortEnabled && tbPostGap?.statement) {
    await verifyThesisBinding('post-gapfill');
    const tbNow = (stats as any).thesisBinding;
    if (tbNow?.evaluationComplete === true && tbNow.adhered === false) {
      const reason = `thesis_adherence_unrepairable: verdict exceeds bound thesis "${String(tbNow.statement).slice(0, 120)}" after narrowing+re-analysis repair`;
      console.warn(`${label} EARLY ABORT: ${reason}`);
      stats.earlyAbort = { reason: 'thesis_adherence_unrepairable', stage: 'post-gapfill', costUsd: cost.runningCostUsd };
      stats.structuredRefusal = {
        reason,
        sourceCount: topSources.length,
        required: 0,
        missing: ['thesis_adherence'],
      };
      stats.totalCostUsd = cost.runningCostUsd;
      emitProgress(pipelineRun.id, "ANALYST", "failed", `Refused: ${reason}`);
      activeRuns.delete(idempotencyKey);
      process.removeListener('unhandledRejection', rejectionHandler);
      await prisma.pipelineRun.update({
        where: { id: pipelineRun.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - pipelineStart,
          error: reason.slice(0, 500),
          steps: toJsonSafe({ ...stats, error: reason }),
        },
      }).catch(() => {});
      return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
    }
  }
  // Doomed-artifact guard (same flag, no thesis-binding required):
  // mechanisms were mapped but the stress test never ran (repair-reserve
  // skip or failure) AND no causal chain survived — the DA's fatal
  // "empty causal chain / zero surviving mechanisms" challenge is
  // predetermined (observed live: DA reject 0/100 on exactly this
  // shape). Abort before the critic→debate→render tail; the held
  // outcome is identical, the spend is not.
  if (earlyAbortEnabled) {
    const am = (analysis as any)?._meta;
    const chainLen = Array.isArray((analysis as any)?.causalChain) ? (analysis as any).causalChain.length : 0;
    const mechCount = am?.frictionMap?.mechanisms?.length ?? 0;
    const assessed = am?.stressTestMap?.mechanismAssessments?.length ?? 0;
    const surviving = am?.stressTestMap?.survivingMechanisms?.length ?? 0;
    // Unified doomed signature — subsumes both live failure modes:
    //  (a) stress test never ran (reserve skip/failure) → surviving===0
    //  (b) stress test ran and eliminated EVERY mechanism → surviving===0
    // In both, an empty causalChain means the DA's fatal "empty chain /
    // zero surviving mechanisms" challenge is predetermined (observed
    // live: DA reject 0/100 on exactly these shapes). A non-empty chain
    // still proceeds — the DA judges whether it rests on dead mechanisms.
    if (mechCount > 0 && chainLen === 0 && surviving === 0) {
      const reason = `unstressed_analysis: ${mechCount} mechanisms mapped, ${assessed} assessed, 0 survived stress test and causal chain is empty — DA fatal challenge predetermined`;
      console.warn(`${label} EARLY ABORT: ${reason}`);
      stats.earlyAbort = { reason: 'unstressed_analysis', stage: 'post-gapfill', costUsd: cost.runningCostUsd };
      stats.structuredRefusal = {
        reason,
        sourceCount: topSources.length,
        required: 0,
        missing: ['stress_test', 'causal_chain'],
      };
      stats.totalCostUsd = cost.runningCostUsd;
      emitProgress(pipelineRun.id, "ANALYST", "failed", `Refused: ${reason}`);
      activeRuns.delete(idempotencyKey);
      process.removeListener('unhandledRejection', rejectionHandler);
      await prisma.pipelineRun.update({
        where: { id: pipelineRun.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - pipelineStart,
          error: reason.slice(0, 500),
          steps: toJsonSafe({ ...stats, error: reason }),
        },
      }).catch(() => {});
      return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
    }
  }
  // ── STEP 6a/7/7a: PRE-CRITIC GATES — extracted to pipeline-steps/pre-critic-gates.ts ──
  // structural editor → citation guard → claim-binding preflight.
  const preGates = await (async () => {
    const { runPreCriticGates } = await import('./pipeline-steps/pre-critic-gates');
    return runPreCriticGates({
      analysis, topSources, readings,
      stats: stats as Record<string, any>, label, query,
      quantModelCount: quantBridge.models.length,
      fullContextBlock, tagEval, addCost, citationGuard, ctx,
    });
  })();
  fullContextBlock = preGates.fullContextBlock;
  const guard = preGates.guard;

  // ── STEP 7b: CRITIC BLOCK — extracted to pipeline-steps/critic-block.ts ──
  // critic → panel → repair(+recheck) → evidence tool → outline critic →
  // gap requests → self-correct checkpoint → CoVe.
  let savedCriticResult: any = null;
  {
    const { runCriticBlock } = await import('./pipeline-steps/critic-block');
    const criticOut = await runCriticBlock({
      state: gapFillState, topSources, readings, slimReadings,
      stats: stats as Record<string, any>, label, query, detectedDomain,
      positioningBrief, fullContextBlock, isStrategic, isBudgetConstrained,
      orchState,
      analystMultipass, bumpAnalysisArtifact, tagEval, addCost,
      emitProgress, pipelineRunId: pipelineRun.id, pipelineStart, ctx, selfCorrector,
      processGapRequests, requiredDimensions: requiredBranches,
    });
    analysis = criticOut.analysis;
    allSourceIds = gapFillState.allSourceIds;
    reAnalysisBudget = criticOut.reAnalysisBudget;
    savedCriticResult = criticOut.savedCriticResult;
    // STALE-EVALUATOR RE-SCORE: any analysis mutation after the verdicts ran
    // (critic repair adoption, post-critic gap-fill re-analysis) leaves
    // verdict-bearing evals attached to a replaced artifact — they'd go stale
    // and evaluation_freshness hard-fails the run regardless of quality.
    // Re-judge each stale analysis-tagged evaluator ONCE on the adopted
    // analysis (~$0.05 total): the gate then sees verdicts on the artifact
    // actually being rendered, not a replaced draft.
    try {
      const { rescoreStaleAnalysisEvals } = await import('./pipeline-steps/eval-rescore');
      await rescoreStaleAnalysisEvals({
        stats, analysis, analysisArtifactVersion, query, detectedDomain,
        positioningBrief, topSources, readings, label,
        isBudgetConstrained, addCost, tagEval,
        onCriticRescored: r => { savedCriticResult = r; },
      });
    } catch (rescoreErr) {
      console.warn(`${label} EVAL RE-SCORE failed (non-blocking):`, rescoreErr);
    }
    phaseMark('critic');
  }

  // ── TERMINAL-REJECT EARLY EXIT ──
  // A critic reject with a very low score is unrecoverable by the editorial
  // tail: no code path downstream can rewrite the analysis (critic repair only
  // triggers on 'repair' verdicts, regen is decided in the orchestrator). Every
  // stage after this point — debate, arbiter, DA, quality loop, hero image —
  // spends ~$0.27-0.60 and ~10min on an artifact that will persist as HELD
  // regardless. Render once for the admin-facing artifact, then go straight to
  // persistence (institutional memory still wants the record).
  const criticVerdictEarly = (stats.critic as any)?.verdict;
  const criticScoreEarly = (stats.critic as any)?.overallScore;
  const terminalReject =
    criticVerdictEarly === 'reject' &&
    typeof criticScoreEarly === 'number' && criticScoreEarly < 20;
  if (terminalReject) {
    console.warn(`${label} TERMINAL REJECT: critic verdict=reject score=${criticScoreEarly} — skipping editorial tail (debate/arbiter/DA/quality-loop/hero)`);
    (stats as any).terminalReject = { verdict: criticVerdictEarly, score: criticScoreEarly, skippedStages: ['postCriticEnrichment', 'debate', 'arbiterForesight', 'devilsAdvocate', 'peerReviewAndPack', 'styleSweep', 'qualityLoop', 'heroImage'] };
  }

  // ── STEP 7d: SCENARIO ENGINE — MOVED to pre-analyst (Step 6) for context injection ──
  // CANA + SCATTER now run BEFORE the analyst so their outputs enrich the analysis.
  // Stats are already recorded in the pre-analyst step above.

  // ── STEP 7c/7d/7e: POST-CRITIC ENRICHMENT — extracted to
  //    pipeline-steps/post-critic-enrichment.ts. Reflection + cross-model
  //    consensus + inter-paper KG are pure readers → run concurrently. ──
  if (!terminalReject) {
    const { runPostCriticEnrichment } = await import('./pipeline-steps/post-critic-enrichment');
    await runPostCriticEnrichment({
      analysis, topSources, stats: stats as Record<string, any>,
      label, query, citationUsedCount: guard.usedCount,
    });
  }

  // ── POST-HOC DATA INJECTION (extracted to pipeline-steps/post-hoc-injection.ts) ──
  // Evidence Tiers + Adversarial Transparency + Multi-Lens Convergence,
  // computed post-analyst/critic and attached to the analysis object.
  {
    const { runPostHocInjection } = await import('./pipeline-steps/post-hoc-injection');
    await runPostHocInjection({
      isStrategic,
      analysis: analysis as Record<string, any> | undefined,
      topSources,
      criticResult: savedCriticResult,
      canaResult: savedCanaResult,
      scatterResult: savedScatterResult,
      label,
    });
  }

  let html = '';
  let debateContext: string | undefined;
  let debateResult: DebateResult | undefined;
  let institutePosition: InstitutePosition | undefined;

  // EDITOR step — extracted to pipeline-steps/render-editor.ts.
  // debateResult is read at call time (assigned between here and the render call).
  const renderEditorHtml = async (): Promise<string> => {
    const { runRenderEditorStep } = await import('./pipeline-steps/render-editor');
    return runRenderEditorStep({
      label,
      query,
      isStrategic,
      isMemo,
      editorialV2,
      topicClassification,
      castingResult,
      institutePosition,
      analysis: analysis as Record<string, any>,
      topSources,
      debateResult,
      stats: stats as Record<string, any>,
      renderBriefFallback: renderBriefHTML,
    });
  };

  const runPostRenderQualityGates = async () => {
    emitProgress(pipelineRun.id, "QUALITY", "started", "Citation verification and critical review...");

    // Verification chain extracted to pipeline-steps/verification-block.ts
    // (symbolic → NLI → active repair → deep-check → fact-checker).
    {
      const { runVerificationBlock } = await import('./pipeline-steps/verification-block');
      html = await runVerificationBlock({
        html,
        analysis: analysis as Record<string, any>,
        topSources,
        readings,
        stats: stats as Record<string, any>,
        label,
        bumpHtmlArtifact,
        tagEval,
        isBudgetConstrained,
        addCost,
      });
    }

    // Parallel evaluators + deterministic trust scoring extracted to
    // pipeline-steps/evaluators-trust.ts (the evaluators feed the trust calc).
    {
      const { runEvaluatorsAndTrust } = await import('./pipeline-steps/evaluators-trust');
      html = await runEvaluatorsAndTrust({
        html,
        analysis: analysis as Record<string, any>,
        topSources,
        readings,
        stats: stats as Record<string, any>,
        label,
        query,
        briefId,
        evidenceBankRef,
        planNodesForAudit,
        pipelineCtx: ctx,
      });
    }

    orchState.trustScore = stats.criticalLoop?.finalScore ?? null;
    // Deterministic scoring already handles groundedness veto and quality floor.
    // No secondary adjustment needed.
    const criticalDecision = assessAfterCriticalLoop(orchState);
    recordDecision(orchState, criticalDecision);
    stats.orchestrator = stats.orchestrator ?? { decisions: [] };
    stats.orchestrator.decisions.push(criticalDecision);

    // ── ORCHESTRATOR ACTION: DEBATE — was recorded but never executed. NOW ACTED. ──
    // Trust below threshold → force the adversarial debate even if the tier flag
    // disabled it, unless the budget guard already cut it (money wins).
    if (criticalDecision.action === "DEBATE" && !flags.runDebateStep && !cost.budgetDegraded) {
      console.log(`${label} ORCHESTRATOR: DEBATE triggered — trust ${orchState.trustScore} below threshold, enabling adversarial debate`);
      flags.runDebateStep = true;
      stats.orchestrator.debateForcedByOrchestrator = true;
      ctx.addFinding('ORCHESTRATOR', 'recommendation', `DEBATE forced by low trust score (${orchState.trustScore})`);
    }
  };

  // Debate + Devil's Advocate — extracted to pipeline-steps/debate-advocate.ts.
  // `debateResult`/`debateContext` stay owned here (arbiter + render read them
  // at call time); the flags are passed as call-time snapshots since the
  // budget guard, LAS gate, and orchestrator all mutate them upstream.
  const debateAdvocateDeps: DebateAdvocateDeps = {
    query, topSources, readings, detectedDomain, isStrategic, label,
    stats: stats as Record<string, any>, pipelineRunId: pipelineRun.id,
    pipelineCtx: ctx, addCost, tagEval,
  };
  const applyDebateOutcome = (out: import('./pipeline-steps/debate-advocate').DebateOutcome) => {
    if (out.debateResult) { debateResult = out.debateResult; debateContext = out.debateContext; }
  };

  // ── SHARED POST-RENDER QUALITY GATES ──
  // Citation repair → NLI grounding → quant → citation filter extracted to
  // pipeline-steps/citation-grounding.ts. The trailing quality-gates call
  // stays here: it reads the pipeline's own `html`, assigned from the step's
  // return value first.
  const runPostRenderCitationAndGrounding = async () => {
    html = await runCitationGroundingStep({
      html,
      analysis: analysis as Record<string, any>,
      topSources,
      readings,
      stats: stats as Record<string, any>,
      label,
      pipelineCtx: ctx,
      bumpHtmlArtifact,
      tagEval,
      chartData: quant.chartData,
    });
    await runPostRenderQualityGates();
  };

  if (terminalReject) {
    // Minimal held artifact: one render pass so the publication row carries
    // inspectable HTML, none of the paid editorial machinery.
    html = await durable('render', () => renderEditorHtml());
    bumpHtmlArtifact();
  } else if (editorialV2) {
    console.log(`${label} EDITORIAL V2: foresight → debate → devil's advocate → editor → quality gates`);

    // NOTE: Foresight (Monte Carlo) now runs AFTER editorial arbiter, which creates the scenarios.
    // Previously foresight ran before arbiter → 0 scenarios → always skipped.
    // The arbiter generates scenario names/descriptions/priors, then foresight refines probabilities.
    stats.foresight = { skipped: true, reason: 'pending — will run after editorial arbiter creates scenarios' };

    // Debate + meta-analysis reactivated — multi-perspective dialectical analysis
    applyDebateOutcome(await runDebateMetaBlock(debateAdvocateDeps, flags.runDebateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query)));

    // LOT 4.8 / T4: Inflection check on extracted mechanisms (dated, thresholded, attested)
    try {
      const { inflectionCheck } = await import('./chain-probability');
      // Topic gate — drop mechanisms unrelated to this query (off-topic PDFs or
      // reader hallucinations can inject foreign mechanisms, e.g. a Tamil-identity
      // mechanism appearing in a fintech brief).
      const STOP = new Set(['this','that','with','from','which','their','have','been','were','will','would','could','should','into','over','under','between','through','about','against','such','these','those','than','then','them','they','what','when','where','while','also','more','most','other','some','only','very','each','both']);
      const vocab = new Set(
        `${query} ${(topSources || []).map((s: any) => s.title || '').join(' ')}`
          .toLowerCase().split(/[^a-zà-ÿ0-9]+/)
          .filter(w => w.length >= 4 && !STOP.has(w))
      );
      const allMechanismsRaw = readings.flatMap((r: any) => (r.mechanisms || []).map((m: any) => ({ m, sourceId: r.sourceId })));
      const droppedMechanisms: string[] = [];
      const allMechanisms = allMechanismsRaw.filter(({ m, sourceId }: any) => {
        const text = String(m.description || '').toLowerCase();
        const words = text.split(/[^a-zà-ÿ0-9]+/).filter((w: string) => w.length >= 4);
        if (words.some((w: string) => vocab.has(w))) return true;
        droppedMechanisms.push(`${sourceId}: "${text.slice(0, 80)}"`);
        return false;
      }).map(({ m }: any) => m);
      if (droppedMechanisms.length > 0) {
        console.warn(`${label} INFLECTION CHECK: dropped ${droppedMechanisms.length} off-topic mechanisms — ${droppedMechanisms.slice(0, 3).join(' | ')}`);
      }
      if (allMechanisms.length >= 5) {
        const inflection = inflectionCheck(allMechanisms);
        if (inflection.warning) {
          stats.chainProbability = stats.chainProbability || {} as any;
          (stats.chainProbability as any).inflectionWarning = inflection.warning;
          console.warn(`${label} INFLECTION CHECK: ${inflection.warning}`);
        }
        if (inflection.warnings?.length > 0) {
          for (const w of inflection.warnings) {
            console.warn(`${label} INFLECTION DETAIL: ${w}`);
          }
          (stats.chainProbability as any).inflectionDetails = inflection.warnings;
        }
      }
    } catch (err) {
      console.warn(`${label} INFLECTION CHECK: failed (non-blocking):`, err);
    }

    // LOT 7.1: Predictions are registered after brief creation (need briefId for Prediction model)
    // See T10 implementation below — registerPredictions() is called after prisma.brief.create()

    // Arbiter + foresight extracted to pipeline-steps/arbiter-foresight.ts.
    // Ordering is load-bearing: arbiter generates scenarios, then Monte Carlo
    // refines probabilities. Both outputs are reassigned by the caller.
    {
      const { runArbiterForesight } = await import('./pipeline-steps/arbiter-foresight');
      // Cost gate: when the critic already predicts a held artifact (low score,
      // weak groundedness, reject verdict), the apex arbiter model is spent on
      // a piece that won't publish — degrade to mid-tier for this run.
      const criticScore = (stats.critic as any)?.overallScore;
      const criticGroundedness = (stats.critic as any)?.groundedness;
      const arbiterDegraded =
        (typeof criticScore === 'number' && criticScore < 50) ||
        (stats.critic as any)?.verdict === 'reject' ||
        (typeof criticGroundedness === 'number' && criticGroundedness < 0.6);
      const arbiterOut = await runArbiterForesight({
        query, topicClassification, castingResult,
        analysis: analysis as Record<string, any>,
        topSources, debateResult, stats: stats as Record<string, any>,
        label, detectedDomain, isStrategic,
        seedSourceIds: opts.seedSourceIds,
        readings,
        pipelineRunId: pipelineRun.id, addCost,
        degraded: arbiterDegraded,
      });
      institutePosition = arbiterOut.institutePosition;
      analysis = arbiterOut.analysis as typeof analysis;
    }

    stats.centralScenarioRequired = true;
    if (institutePosition) {
      stats.centralScenario ??= resolveCentralScenario(institutePosition);
      stats.institutePosition = institutePosition;
      analysis = { ...analysis, centralScenario: stats.centralScenario, scenarios: institutePosition.scenarios } as typeof analysis;
      console.log(`${label} CENTRAL SCENARIO: ${stats.centralScenario?.name ?? 'missing — publication hold required'}; simulation disagreement=${stats.centralScenario?.simulationDisagrees ?? false}`);
    }
    // ── PRE-RENDER ADVERSARIAL GATE ──
    // The DA judges the analysis BEFORE the render. A gate-failing verdict
    // (reject / veto / publishability <40) means the render below would
    // produce an artifact already condemned — burn ~$0.40 of tail spend on
    // a piece that cannot publish. Instead: ONE bounded rewrite with the
    // kill shot as mandatory correction, re-judged by the DA, adopted only
    // if publishability strictly improves. The render then runs once, on a
    // defensible artifact.
    await runDevilsAdvocateBlock(debateAdvocateDeps, flags.runDevilsAdvocateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query), debateContext);
    const daPre = stats.devilsAdvocate as Record<string, unknown> | undefined;
    const daPreFails = !!daPre && !daPre.error && !daPre.skipped && (
      daPre.verdict === 'reject'
      || (daPre.verdict === 'major_revision' && (daPre.overallStrength as number) < 20)
      || ((daPre.publishabilityScore as number) ?? 100) < 40
    );
    // Wall-clock guard: the mission is a full scout→reader→(re-analysis)
    // cycle — on degraded providers that is 45-90min. Launching it inside
    // the deadline tail guarantees a timeout FATAL instead of a held run
    // (observed live: mission started at ~T-30min, run died mid-reader).
    const daMissionHeadroomMs = Number(process.env.DA_MISSION_HEADROOM_MS ?? 3_000_000);
    const daMissionHasTime = hasRunHeadroom(pipelineStart, isStrategic, daMissionHeadroomMs);
    if (daPreFails && !isBudgetConstrained() && !daMissionHasTime) {
      console.log(`${label} DA EVIDENCE MISSION: skipped — ${Math.round(remainingRunMs(pipelineStart, isStrategic) / 60000)}min left < mission estimate; gap queries persisted for the retry instead`);
      stats.daEvidenceMissionSkipped = 'insufficient_headroom';
    }
    if (daPreFails && !isBudgetConstrained() && daMissionHasTime) {
      // A fatal challenge like "no comparative evidence for X" is EVIDENCE-
      // BOUND — no rewrite can invent the missing sources. First convert the
      // adversary's challenges into retrieval missions: post them as source
      // gap requests and let the gap-fill processor fetch + re-analyze on the
      // enriched corpus. Writing a better argument over the same evidence
      // base is the symptom fix; retrieving the missing evidence is the cure.
      try {
        const challengeTexts = [
          ...((daPre.topChallenges as Array<{ text?: string }> | undefined) ?? []),
        ]
          .map(c => String(c?.text ?? '').trim())
          .filter(t => t.length > 20)
          .slice(0, 3);
        // A 300-char prose objection is a terrible search query — academic
        // retrieval needs distilled topic terms. One cheap call converts the
        // challenges into queries (same pattern as generateGapQueries for
        // citation gaps); on failure the raw texts still get scouted.
        let challengeQueries = challengeTexts;
        try {
          const { callLLM } = await import('../llm/unified-llm');
          const { parseJson } = await import('./json-utils');
          const qResp = await callLLM({
            messages: [{
              role: 'user',
              content: `An adversarial reviewer found these fatal evidence gaps in a research analysis. Convert EACH gap into a focused academic search query (max ~12 words, topical terms only — no prose, no "the analysis fails to").

RESEARCH QUESTION: "${query}"

EVIDENCE GAPS:
${challengeTexts.map((t, i) => `${i + 1}. ${t.slice(0, 300)}`).join('\n')}

Return JSON: {"queries": ["...", "..."]} — one query per gap, same order.`,
            }],
            temperature: 0.2,
            jsonMode: true,
            maxTokens: 400,
            task: 'topic_classification',
          });
          addCost(qResp.costUsd, 'DA_MISSION_QUERY_DISTILL');
          const parsed = parseJson<{ queries?: string[] }>(qResp.content);
          const distilled = (parsed?.queries ?? [])
            .map(q => String(q ?? '').trim())
            .filter(q => q.length > 10)
            .slice(0, 3);
          if (distilled.length > 0) challengeQueries = distilled;
        } catch { /* fall through to raw challenge texts */ }
        if (challengeQueries.length > 0) {
          for (const q of challengeQueries) {
            ctx.requestSourceGap(
              q.slice(0, 300),
              `Adversarial fatal challenge: ${String(daPre.killShot ?? daPre.verdict).slice(0, 150)}`,
              'DEVILS_ADVOCATE',
              ['openalex', 'crossref', 'semanticscholar', 'ssrn', 'jstor', 'internet-archive', 'linkup'],
              12,
            );
          }
          console.log(`${label} DA EVIDENCE MISSION: ${challengeQueries.length} retrieval queries from adversarial challenges`);
          // Persist the distilled queries: on a HELD outcome they ride the
          // diagnostic into the 20h retry, whose scout runs them as a targeted
          // evidence mission — the gap is repaired by retrieval, not rhetoric.
          stats.daEvidenceQueries = challengeQueries.slice(0, 6);
          await processGapRequests('DEVILS_ADVOCATE');
          analysis = gapFillState.analysis;
          reAnalysisBudget = gapFillState.reAnalysisBudget;
          // If the gap-fill adopted a re-analysis, the DA verdict is on a stale
          // artifact — re-judge before deciding whether a rewrite is still
          // needed. Retrieved evidence may have resolved the challenge.
          if ((stats as any).gapFillReAnalysis?.triggered) {
            try {
              const { runDevilsAdvocate } = await import('./devils-advocate');
              const reJudge = await runDevilsAdvocate(
                query,
                buildAnalysisReviewText(analysis as unknown as Record<string, unknown>, query),
                topSources.map((s: any) => ({ title: s.title, provider: s.provider, year: s.year })),
                { mode: isStrategic ? 'strategic' : 'brief', domain: detectedDomain, debateContext },
              );
              addCost(reJudge.costUsd, 'DEVILS_ADVOCATE_POST_MISSION');
              stats.devilsAdvocate = tagEval({
                verdict: reJudge.verdict, overallStrength: reJudge.overallStrength,
                publishabilityScore: reJudge.publishabilityScore,
                fatalChallenges: reJudge.fatalChallenges?.length ?? 0,
                majorChallenges: reJudge.majorChallenges?.length ?? 0,
                killShot: reJudge.killShot?.slice(0, 400) ?? '',
                topChallenges: [...(reJudge.fatalChallenges || []), ...(reJudge.majorChallenges || [])]
                  .slice(0, 3).map((c: any) => ({ type: c.challengeType || c.type || 'challenge', text: String(c.challenge || c.text || '').slice(0, 300) })),
                costUsd: reJudge.costUsd,
              }, 'analysis');
              (stats as any).devilsAdvocateVeto = reJudge.verdict === 'reject'
                || (reJudge.verdict === 'major_revision' && reJudge.overallStrength < 20);
              Object.assign(daPre, { publishabilityScore: reJudge.publishabilityScore, verdict: reJudge.verdict, overallStrength: reJudge.overallStrength });
              console.log(`${label} DA POST-MISSION RECHECK: publishability ${reJudge.publishabilityScore}/100 (veto ${(stats as any).devilsAdvocateVeto ? 'stands' : 'lifted'})`);
            } catch (judgeErr) {
              console.warn(`${label} DA POST-MISSION RECHECK failed (non-blocking):`, judgeErr);
            }
          }
        }
      } catch (missionErr) {
        console.warn(`${label} DA EVIDENCE MISSION failed (non-blocking):`, missionErr);
      }
    }
    // Re-evaluate post-mission: the gap-fill re-judge may have lifted the
    // verdict (evidence resolved the challenge) — rewrite only if the
    // refreshed verdict still fails the gate.
    const daStillFails = !!daPre && !daPre.error && !daPre.skipped && (
      daPre.verdict === 'reject'
      || (daPre.verdict === 'major_revision' && (daPre.overallStrength as number) < 20)
      || ((daPre.publishabilityScore as number) ?? 100) < 40
    );
    // Same wall-clock guard as gap-fill/TTS: a 3-pass adversarial rewrite
    // (~10min) launched inside the deadline tail never reaches the gate —
    // the fatal verdict then stands instead of killing the whole run.
    const daRewriteHeadroomMs = Number(process.env.DA_REWRITE_HEADROOM_MS ?? 1_800_000);
    const daRewriteHasTime = hasRunHeadroom(pipelineStart, isStrategic, daRewriteHeadroomMs);
    if (daStillFails && !daRewriteHasTime) {
      console.log(`${label} DA PRE-RENDER REPAIR: skipped — ${Math.round(remainingRunMs(pipelineStart, isStrategic) / 60000)}min left, rewrite would overrun the deadline tail`);
    }
    if (daStillFails && daRewriteHasTime && reAnalysisBudget > 0 && !isBudgetConstrained()) {
      reAnalysisBudget--;
      try {
        const killShotBlock = `\n\n## ADVERSARIAL REPAIR — FATAL CHALLENGES TO RESOLVE\nThe adversarial reviewer found your analysis structurally indefensible (${daPre.verdict}, publishability ${daPre.publishabilityScore}/100). Your rewrite MUST resolve every challenge below — a rewrite that ignores them fails again:\n${(daPre.topChallenges as Array<{ text?: string }> ?? []).slice(0, 3).map((c, i) => `${i + 1}. ${String(c?.text ?? '').slice(0, 280)}`).join('\n')}\nKill shot: ${String(daPre.killShot ?? '').slice(0, 300)}`;
        const rewrite = await analystMultipass(query, topSources, slimReadings, {
          contextBlock: (fullContextBlock || '') + killShotBlock,
          domain: detectedDomain,
          depth: isStrategic ? "strategic" : "brief",
          boundThesis: (stats as any).thesisBinding?.statement,
        });
        if (rewrite && typeof rewrite === 'object' && !(rewrite as any)?._meta?.failed) {
          const { runDevilsAdvocate } = await import('./devils-advocate');
          const reJudge = await runDevilsAdvocate(
            query,
            buildAnalysisReviewText(rewrite as unknown as Record<string, unknown>, query),
            topSources.map((s: any) => ({ title: s.title, provider: s.provider, year: s.year })),
            { mode: isStrategic ? 'strategic' : 'brief', domain: detectedDomain, debateContext },
          );
          addCost(reJudge.costUsd, 'DEVILS_ADVOCATE_REWRITE_RECHECK');
          const improved = (reJudge.publishabilityScore ?? 0) > ((daPre.publishabilityScore as number) ?? 0);
          (stats as any).devilsAdvocatePreRenderRepair = {
            triggered: true, adopted: improved,
            beforePublishability: daPre.publishabilityScore, afterPublishability: reJudge.publishabilityScore,
          };
          if (improved) {
            analysis = rewrite;
            bumpAnalysisArtifact();
            ctx.setAnalystOutput(analysis);
            stats.devilsAdvocate = tagEval({
              verdict: reJudge.verdict, overallStrength: reJudge.overallStrength,
              publishabilityScore: reJudge.publishabilityScore,
              fatalChallenges: reJudge.fatalChallenges?.length ?? 0,
              majorChallenges: reJudge.majorChallenges?.length ?? 0,
              killShot: reJudge.killShot?.slice(0, 400) ?? '',
              topChallenges: [...(reJudge.fatalChallenges || []), ...(reJudge.majorChallenges || [])]
                .slice(0, 3).map((c: any) => ({ type: c.challengeType || c.type || 'challenge', text: String(c.challenge || c.text || '').slice(0, 300) })),
              costUsd: reJudge.costUsd,
            }, 'analysis');
            (stats as any).devilsAdvocateVeto = reJudge.verdict === 'reject'
              || (reJudge.verdict === 'major_revision' && reJudge.overallStrength < 20);
            console.log(`${label} DA PRE-RENDER REPAIR: publishability ${daPre.publishabilityScore}→${reJudge.publishabilityScore}/100 — rewrite adopted`);
            // The adopted rewrite replaced the analysis artifact — every
            // analysis-tagged verdict (critic/panel/structural) now describes
            // a replaced draft and evaluation_freshness would hard-fail the
            // run regardless of quality. Re-judge them ONCE on the adopted
            // analysis, same contract as the post-critic rescore.
            try {
              const { rescoreStaleAnalysisEvals } = await import('./pipeline-steps/eval-rescore');
              await rescoreStaleAnalysisEvals({
                stats, analysis, analysisArtifactVersion, query, detectedDomain,
                positioningBrief, topSources, readings, label,
                isBudgetConstrained, addCost, tagEval,
                onCriticRescored: r => { savedCriticResult = r; },
              });
            } catch (rescoreErr) {
              console.warn(`${label} DA REWRITE EVAL RE-SCORE failed (non-blocking):`, rescoreErr);
            }
          } else {
            console.log(`${label} DA PRE-RENDER REPAIR: rewrite not better (${reJudge.publishabilityScore}) — original kept`);
          }
        }
      } catch (preErr) {
        console.warn(`${label} DA PRE-RENDER REPAIR failed (non-blocking):`, preErr);
      }
    }

    const renderedHtml = await durable('render', () => renderEditorHtml());
    html = renderedHtml;
    bumpHtmlArtifact();

    // DA section + peer review + think-tank pack extracted to
    // pipeline-steps/post-render-extras.ts (peer review ∥ pack — same input
    // html, only the pack mutates).
    html = injectAdversarialSection(html, stats.devilsAdvocate as any, label);
    html = await runPeerReviewAndPack({
      html, query, topSources, analysisTitle: analysis.title,
      stats: stats as Record<string, any>, label, detectedDomain,
      institutePosition, usePeerReview, useThinkTankPack,
      packOpts: {
        primaryData: opts.primaryData,
        scenarioModeling: opts.scenarioModeling,
        maxScenarios: opts.maxScenarios,
        stressTest: opts.stressTest,
        policyCouncil: opts.policyCouncil,
      },
      addCost, tagEval, bumpHtmlArtifact,
    });
    await runPostRenderCitationAndGrounding();
    // V2: second DA pass on rendered HTML — DISABLED to save ~10min of LLM time
    // The first DA pass already appends fatal challenges as advisory section.
    // Re-running on rendered HTML adds marginal value but costs heavily in LLM timeouts.
    // if (stats.devilsAdvocate && !(stats.devilsAdvocate as any).error && !(stats.devilsAdvocate as any).skipped) {
    //   await runDevilsAdvocateBlock(html, true);
    // }
  } else {
    html = await durable('render', () => renderEditorHtml());
    bumpHtmlArtifact();
    html = await runPeerReviewAndPack({
      html, query, topSources, analysisTitle: analysis.title,
      stats: stats as Record<string, any>, label, detectedDomain,
      institutePosition, usePeerReview, useThinkTankPack,
      packOpts: {
        primaryData: opts.primaryData,
        scenarioModeling: opts.scenarioModeling,
        maxScenarios: opts.maxScenarios,
        stressTest: opts.stressTest,
        policyCouncil: opts.policyCouncil,
      },
      addCost, tagEval, bumpHtmlArtifact,
    });
    await runPostRenderCitationAndGrounding();
    // Debate + meta-analysis reactivated
    applyDebateOutcome(await runDebateMetaBlock(debateAdvocateDeps, flags.runDebateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query)));
    await runDevilsAdvocateBlock(debateAdvocateDeps, flags.runDevilsAdvocateStep, html, debateContext, 'html');
  }

  // Final adherence re-verification — gap-fill re-analysis, critic repair,
  // arbiter merge and DA rewrite can all replace analysis.verdict after the
  // post-analyst check. Zero cost when unchanged (string compare), one cheap
  // call when the shipped verdict differs from the one already verified.
  await verifyThesisBinding('pre-render');

  stats.analysis = analysis;
  stats.editorialV2 = editorialV2;

  // P3.8 + prose cleanup — extracted to pipeline-steps/post-render-extras.ts
  html = await applyEvidenceIdsAndProseCleanup(html, evidenceRegistry, stats as Record<string, any>, label);
  phaseMark('render');

  // ── STYLE GATES → SIGNAL SWEEP → DA RE-CHECK (extracted to
  //    pipeline-steps/style-sweep-recheck.ts — one coupled unit) ──
  if (!terminalReject) {
    const { runStyleSweepRecheck } = await import('./pipeline-steps/style-sweep-recheck');
    const reviewCtx: import('./pipeline-steps/types').TailStepContext = {
      html,
      analysis: analysis as Record<string, any>,
      topSources,
      readings,
      stats: stats as Record<string, any>,
      orchState,
      evidenceRegistry,
      label,
      query,
      topicClassification,
      detectedDomain,
      isStrategic,
      isMemo,
      isDossier,
      selfCorrector,
      bumpHtmlArtifact,
      tagEval,
      collectStaleEvaluations,
      selfCorrectRollbacks: 0,
      pipelineCtx: ctx,
      isBudgetConstrained,
      addCost,
      debateContext,
    };
    await runStyleSweepRecheck(reviewCtx);
    html = reviewCtx.html;
  }

  // ── POST-RENDER TAIL STEPS (extracted to lib/agent/pipeline-steps/) ──
  // Quality loop → self-correct checkpoint → hero image. Each step mutates a
  // shared context (html/stats/orchState); the orchestrator reads it back.
  if (!terminalReject) {
    const { runPostRenderQualityLoop } = await import('./pipeline-steps/quality-loop');
    const { runFinalSelfCorrectCheckpoint } = await import('./pipeline-steps/self-correct-checkpoint');
    const { runHeroImageStep } = await import('./pipeline-steps/hero-image-step');
    const tailCtx: import('./pipeline-steps/types').TailStepContext = {
      html,
      analysis: analysis as Record<string, any>,
      topSources,
      readings,
      stats: stats as Record<string, any>,
      orchState,
      evidenceRegistry,
      label,
      query,
      topicClassification,
      detectedDomain,
      isStrategic,
      isMemo,
      isDossier,
      selfCorrector,
      bumpHtmlArtifact,
      tagEval,
      collectStaleEvaluations,
      selfCorrectRollbacks: 0,
    };
    await runPostRenderQualityLoop(tailCtx);
    await runFinalSelfCorrectCheckpoint(tailCtx);
    await runHeroImageStep(tailCtx);
    html = tailCtx.html;
    selfCorrect.rollbacks += tailCtx.selfCorrectRollbacks;

    // ── POST-REPAIR DA REFRESH — extracted to pipeline-steps/da-post-repair.ts ──
    {
      const { runDaPostRepairRecheck } = await import('./pipeline-steps/da-post-repair');
      await runDaPostRepairRecheck({
        label, query, html, topSources, detectedDomain, isStrategic, debateContext,
        stats: stats as Record<string, any>, htmlArtifactVersion,
        isBudgetConstrained, addCost, tagEval,
      });
    }
    phaseMark('qualityTail');
  }

  // ── STEP 14-17 + POST-RUN LEARNING — extracted to pipeline-steps/persistence-tail.ts ──
  // brief.create → parallel post-publish writes → auditor → reputation →
  // experience bank → eval-freshness assert → pipelineRun.update → durable
  // seal → learning loop → skill bank → parallel post-run learning → MOA.
  const tail = await runPersistenceTail({
    label, isStrategic, query, html,
    stats: stats as Record<string, any>, topSources, analysis, detectedDomain,
    foundationalSources, pipelineRun, orchState, episodicContext, pipelineStart,
    runningCostUsd: cost.runningCostUsd, savedScatterResult, useTemporalMemory, ctx, emitProgress,
    collectStaleEvaluations, analysisArtifactVersion, htmlArtifactVersion,
    durableKey, memoryBlock, readerMemoryBlock, readings,
    witnessCtx, useWorldModel, worldModelControversies, usePRM, prmModel,
    useRagasEval, useSelfEvolution, useMixtureOfAgents, addCost,
    isBudgetConstrained, tagEval,
  });
  html = tail.html;
  phaseMark('persisted');

  // Clean up idempotency token on success
  activeRuns.delete(idempotencyKey);

  // Build structured claims from READER extracts for publication gate (dbClaims path)
  const sourceIdToIndex = new Map<string, number>();
  topSources.forEach((s: any, i: number) => sourceIdToIndex.set(s.id, i + 1));
  const readerClaims = readings
    .filter(r => r.claims && r.claims.length > 0)
    .flatMap(r => r.claims.map((claim: string) => ({
      text: claim,
      sourceRef: sourceIdToIndex.get(r.sourceId) ?? null,
    })));

  // Clean up the rejection handler before returning
  process.removeListener('unhandledRejection', rejectionHandler);

  return {
    briefId: tail.briefId,
    stats,
    pipelineRunId: pipelineRun.id,
    format: (isStrategic ? "strategic" : isMemo ? "memo" : "brief") as ReportFormat,
    readerClaims,
    // Readings are returned so a bounded regeneration can reuse the evidence
    // base instead of re-fetching + re-extracting the whole corpus.
    readings,
  };

  } catch (error: any) {
    // Clean up the rejection handler on failure too
    process.removeListener('unhandledRejection', rejectionHandler);
    // Clean up idempotency token on failure
    activeRuns.delete(idempotencyKey);
    console.error(`${label} FATAL: ${error.message}`);
    emitProgress(pipelineRun.id, "ERROR", "failed", error.message);
    // Spend already incurred must survive the failure: persist it in steps
    // (salvage/reconciliation reads it) and attach it to the error so the
    // orchestrator can bank it instead of reporting a $0 run.
    stats.totalCostUsd = cost.runningCostUsd;
    if ((error as any).costUsd === undefined) (error as any).costUsd = cost.runningCostUsd;
    try { const { mergeInputsIntoStats } = await import('./frozen-inputs'); mergeInputsIntoStats(stats as any); } catch { /* non-blocking */ }
    await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - pipelineStart,
        error: String(error.message ?? error).slice(0, 500),
        steps: toJsonSafe({ ...stats, error: error.message }),
      },
    }).catch(() => {});
    throw error;
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PUBLIC API â€” thin wrappers over the shared core
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * runFullPipeline â€” thin wrapper over runPipelineCore (brief mode)
 * Kept for backward compatibility with existing callers.
 */
export async function runFullPipeline(
  query: string,
  providers: Providers = DEFAULT_ACADEMIC_PROVIDERS,
  options: {
    mode?: "brief" | "strategic";
    maxSources?: number;
    timeout?: number;
    enableCaching?: boolean;
  } = {}
) {
  return runPipelineCore(query, {
    isStrategic: options.mode === "strategic",
    providers: providers.length > 0 ? providers : undefined,
    maxSources: options.maxSources,
  });
}

// (legacy functions removed — see runPipelineCore() above)

// ================================
// STRATEGIC REPORT PIPELINE (10-15 pages)
// ================================

export type ReportFormat = "brief" | "memo" | "strategic" | "dossier";

export interface StrategicPipelineOptions {
  executionId?: string;
  providers?: Providers;
  perProvider?: number;
  rankOptions?: RankOptions;
  /** Hard pipeline timeout in ms. Default: 75min strategic/dossier, 65min brief/memo. */
  timeoutMs?: number;
  focusAreas?: string[];
  targetAudience?: string;
  urgencyContext?: string;
  // Tier controls — set by auto-publisher based on researcher ownership
  enableHarvardCouncil?: boolean;
  enableEnhancedCouncil?: boolean;
  enableDebate?: boolean;
  enableMetaAnalysis?: boolean;
  enableDevilsAdvocate?: boolean;
  enableDeliberation?: boolean;
  /** Pre-validated source IDs — skip SCOUT when count ≥ minSeedSourcesToSkipScout (default 8) */
  seedSourceIds?: string[];
  minSeedSourcesToSkipScout?: number;
  /** QUANT BRIDGE depth: "none" | "parametric" | "io" | "full" (default: "io" for strategic) */
  quantDepth?: import("../quant/quant-bridge").QuantDepth;
  /** Structured costing exercise (StudioX orders with chiffrage indicatif) */
  parametricInput?: import("../quant/types").ParametricCostInput;
  /** Enable the Witness — metacognitive observer that detects anomalies,
   * can intervene during runs, and learns across runs to improve prompts
   * and thresholds. Default: false. */
  useWitness?: boolean;
  /** Regeneration loop: feedback from a rejected prior attempt (gate reasons +
   * adversarial findings). Injected into the analyst context as mandatory
   * corrections. Set by the orchestrator's escalation loop. */
  priorFailureFeedback?: string;
  /** HELD-retry: targeted retrieval queries distilled from the prior attempt's
   * missing evidence — scouted as a bounded mission. */
  priorEvidenceQueries?: string[];
  /** Regeneration loop: readings extracted by the prior attempt — the reader
   * reuses them; only new sources are fetched. */
  priorReadings?: unknown[];
  /** Regeneration loop: the corpus is fixed (seedSourceIds + priorReadings).
   * Gap-fill scouts/post-analyst enrichment would mutate the corpus, force
   * re-reads of new sources, and burn the bounded regen window — the rewrite
   * must analyze the SAME evidence base. Set by the orchestrator's regen. */
  skipGapFillRetrieval?: boolean;
  /** Regeneration loop: briefs created at/after this instant do not count as
   * prior coverage — see PipelineCoreOptions.primerCoverageCutoff. */
  primerCoverageCutoff?: Date;
  /** Enable Mixture of Agents — multiple specialist analysts collaborate.
   * The aggregator synthesizes their perspectives into a unified analysis.
   * Default: false. */
  useMixtureOfAgents?: boolean;
  /** Enable the World Model — persistent cross-run knowledge accumulation.
   * Injects prior knowledge before the run and extracts new knowledge after.
   * Default: false. */
  useWorldModel?: boolean;
  /** Enable the Process Reward Model — scores each reasoning step and
   * learns which reasoning patterns lead to good outcomes. Default: false. */
  usePRM?: boolean;
  /** Enable adversarial self-play — after the analysis, the system attacks
   * its own output to find weaknesses and extracts lessons for future runs.
   * Default: false. */
  useSelfPlay?: boolean;
  useOutputGuard?: boolean;
  useLocalJudge?: boolean;
  useStorm?: boolean;
  useTemporalMemory?: boolean;
  useDurableExecution?: boolean;
  /** Enable Think Tank Quality Pack — recommendations, economics, editorial polish (default: false) */
  useThinkTankPack?: boolean;
  /** Enable Feynman-style peer review before editor (default: false) */
  usePeerReview?: boolean;
  /** Enable RAGAS-style RAG evaluation (default: false) */
  useRagasEval?: boolean;
  /** Optional primary data inputs for think tank pack */
  primaryData?: any[];
  /** Enable scenario modeling in think tank pack (default: true when useThinkTankPack) */
  scenarioModeling?: boolean;
  /** Maximum number of scenarios */
  maxScenarios?: number;
  /** Enable policy stress test in think tank pack (default: true when useThinkTankPack) */
  stressTest?: boolean;
  /** Enable policy council in think tank pack (default: true when useThinkTankPack) */
  policyCouncil?: boolean;
  /** Enable self-evolution — auto-improve agent prompts after the run (default: false) */
  useSelfEvolution?: boolean;
  /** Replay freeze — see PipelineCoreOptions.frozenContext. */
  frozenContext?: { primed?: unknown; episodic?: { episodes: unknown[]; formatted: string | null } };
}

/**
 * runStrategicPipeline â€” thin wrapper over runPipelineCore (strategic mode)
 * Kept for backward compatibility with existing callers.
 */
export async function runStrategicPipeline(
  query: string,
  options: StrategicPipelineOptions = {}
) {
  return runPipelineCore(query, {
    executionId: options.executionId,
    isStrategic: true,
    providers: options.providers,
    perProvider: options.perProvider,
    rankOptions: options.rankOptions,
    focusAreas: options.focusAreas,
    targetAudience: options.targetAudience,
    urgencyContext: options.urgencyContext,
    enableHarvardCouncil: options.enableHarvardCouncil,
    enableDebate: options.enableDebate,
    enableMetaAnalysis: options.enableMetaAnalysis,
    enableDevilsAdvocate: options.enableDevilsAdvocate,
    seedSourceIds: options.seedSourceIds,
    minSeedSourcesToSkipScout: options.minSeedSourcesToSkipScout,
    quantDepth: options.quantDepth,
    parametricInput: options.parametricInput,
    priorFailureFeedback: options.priorFailureFeedback,
    priorEvidenceQueries: options.priorEvidenceQueries,
    priorReadings: options.priorReadings,
    skipGapFillRetrieval: options.skipGapFillRetrieval,
    primerCoverageCutoff: options.primerCoverageCutoff,
    frozenContext: options.frozenContext,
  });
}

/**
 * P1 FIX: Timeout wrapper to prevent infinite pipeline execution
 * Default: 120s for briefs, 300s for strategic reports
 */

function withTimeout<T>(work: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return withExecutionDeadline(timeoutMs, label, work);
}

/**
 * Universal pipeline runner â€” single entry point for all formats.
 * Delegates directly to runPipelineCore with a timeout wrapper.
 */
/**
 * Deterministic question-form check (CTO lever 5). Returns issues; empty =
 * acceptable. Targets news headlines/event titles — inputs that are
 * announcements rather than questions — without rejecting legitimate
 * noun-phrase research topics ("EU carbon border mechanism").
 */
export function questionFormIssues(query: string): string[] {
  const q = query.trim();
  const issues: string[] = [];
  const lower = q.toLowerCase();

  // Announcement/event-title patterns observed producing corpus-less runs.
  const titlePatterns = [
    /^(a )?(live|watch|breaking)[:\s]/,
    /\btranscript\b/, /\bpress conference\b/, /\bremarks by\b/, /\bstatement by\b/,
    /^(a )?conversation with\b/, /^(a )?fireside chat\b/, /^(a )?interview with\b/,
    /\bfull event\b/, /\bhighlights?\b.*\b(event|session|summit)\b/,
  ];
  for (const p of titlePatterns) if (p.test(lower)) issues.push('announcement/event-title phrasing');

  // Ellipsis-terminated titles with no interrogative or analytic marker.
  const analyticMarkers = /[?]|\b(what|how|why|which|who|whom|whose|when|where|should|could|would|will|impact|implication|implications|risk|risks|outlook|forecast|scenario|effect|effects|drive|drives|shape|shapes|determine|determines|explain|explains|analy[sz]e|assess|compare|evaluate|consequence|consequences|impacts?|benefit|cost|trade.?off|dependency|dependencies|vulnerabilit|opportunity|opportunities|trend|evolution|trajectory|prospect|prospects|implication)\b/i;
  const hasMarker = analyticMarkers.test(q);
  if (!hasMarker && (/(\.\.\.|…)\s*$/.test(q) || /[.:;]\s*$/.test(q))) {
    issues.push('no interrogative or analytic framing');
  }
  return issues;
}

export async function runPipeline(
  query: string,
  format: ReportFormat = "brief",
  options: StrategicPipelineOptions = {}
) {
  // ── Question validation — reject trivially short or empty queries ──
  const trimmedQuery = (query ?? '').trim();
  if (trimmedQuery.length < 10) {
    throw new Error(`Query too short (${trimmedQuery.length} chars): "${trimmedQuery}". Minimum 10 characters required for a meaningful analysis.`);
  }
  // Reject single-word questions like "What", "Why", "How" without context
  const wordCount = trimmedQuery.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3 && !trimmedQuery.endsWith('?')) {
    throw new Error(`Query too vague (${wordCount} words): "${trimmedQuery}". Please provide a more specific question.`);
  }
  // Question-form gate: a news headline or event title is not a research
  // question. Reject announcement-style inputs deterministically — they
  // produce corpus-less runs that burn budget before failing downstream.
  const formIssues = questionFormIssues(trimmedQuery);
  if (formIssues.length > 0) {
    throw new Error(`Query is not a research question (${formIssues.join('; ')}): "${trimmedQuery.slice(0, 120)}". Reformulate as a question with an actor, variable, horizon, and what would settle it.`);
  }

  const isDossier = format === "dossier";
  const isMemo = format === "memo";
  const isStrategic = format === "strategic" || isDossier;
  // Free runs: serialized freepool + TPM pacing + ~90s/call free endpoints
  // make every phase ~2-3x slower — the 65/75min caps abort mid-analyst.
  const freeRun = process.env.NOMOSX_FREE_RUN === '1' || process.env.NOMOSX_FREE_RUN === 'true';
  const timeoutMs = options.timeoutMs ?? (freeRun ? 10_800_000 : isStrategic ? 4_500_000 : 3_900_000); // free: 180min | 75min strategic, 65min brief/memo — critic-repair re-analysis + deep-planner node scouts need headroom

  // DOSSIER = extended strategic report — wider corpus and more ranked sources
  // so a €699 dossier produces a materially deeper deliverable than a strategic report.
  const dossierRankOptions: RankOptions = isDossier
    ? { limit: 40, maxPerProvider: 8, minProviderDiversity: 6 }
    : {};
  // MEMO = Decision Memo — moderate depth brief (standard depth, ~30 perProvider)
  const memoPerProvider = isMemo ? 30 : undefined;
  const perProvider = options.perProvider ?? memoPerProvider ?? (isDossier ? 120 : undefined);
  const rankOptions = { ...dossierRankOptions, ...options.rankOptions };
  const executionId = options.executionId ?? randomUUID();

  try {
    return await withTimeout(
      () => runPipelineCore(query, {
        executionId,
        isStrategic,
        format,
        providers: options.providers,
        perProvider,
        rankOptions,
        focusAreas: options.focusAreas,
        targetAudience: options.targetAudience,
        urgencyContext: options.urgencyContext,
        enableHarvardCouncil: options.enableHarvardCouncil,
        enableEnhancedCouncil: options.enableEnhancedCouncil,
        enableDebate: options.enableDebate,
        enableMetaAnalysis: options.enableMetaAnalysis,
        enableDevilsAdvocate: options.enableDevilsAdvocate,
        enableDeliberation: options.enableDeliberation,
        seedSourceIds: options.seedSourceIds,
        minSeedSourcesToSkipScout: options.minSeedSourcesToSkipScout,
        quantDepth: options.quantDepth,
        parametricInput: options.parametricInput,
        useWitness: options.useWitness,
        priorFailureFeedback: options.priorFailureFeedback,
        priorEvidenceQueries: options.priorEvidenceQueries,
        priorReadings: options.priorReadings,
        skipGapFillRetrieval: options.skipGapFillRetrieval,
        primerCoverageCutoff: options.primerCoverageCutoff,
        useMixtureOfAgents: options.useMixtureOfAgents,
        useWorldModel: options.useWorldModel,
        usePRM: options.usePRM,
        useSelfPlay: options.useSelfPlay,
        useOutputGuard: options.useOutputGuard,
        useLocalJudge: options.useLocalJudge,
        useStorm: options.useStorm,
        useTemporalMemory: options.useTemporalMemory,
        useDurableExecution: options.useDurableExecution,
        useThinkTankPack: options.useThinkTankPack,
        usePeerReview: options.usePeerReview,
        useRagasEval: options.useRagasEval,
        primaryData: options.primaryData,
        scenarioModeling: options.scenarioModeling,
        maxScenarios: options.maxScenarios,
        stressTest: options.stressTest,
        policyCouncil: options.policyCouncil,
        useSelfEvolution: options.useSelfEvolution,
        frozenContext: options.frozenContext,
      }),
      timeoutMs,
      `runPipeline(${format})`
    );
  } catch (err: any) {
    // BUG FIX: When withTimeout rejects, runPipelineCore's catch block never
    // executes, leaving PipelineRun stuck as RUNNING. Clean up here.
    if (err?.message?.includes("timed out")) {
      console.error(`[Pipeline] Timeout cleanup: marking RUNNING runs as FAILED for query "${query.slice(0, 60)}"`);
      try {
        const timedOutRun = await prisma.pipelineRun.findFirst({
          where: { id: executionId, status: "RUNNING" },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (timedOutRun) {
          await prisma.pipelineRun.update({
            where: { id: timedOutRun.id },
            data: { status: "FAILED", finishedAt: new Date(), error: err.message },
          });
        }
      } catch (cleanupErr) {
        console.error("[Pipeline] Timeout cleanup failed:", cleanupErr);
      }
    }
    throw err;
  }
}

// ================================
// INTELLIGENCE AGENTS EXPORTS
// ================================

// Intelligence agents are imported and used directly above

// ================================
// FULL INTELLIGENCE SWEEP
// ================================

/**
 * Run complete intelligence sweep on recent sources
 * Combines: Signal Detection + Contradiction Detection + Trend Analysis
 */
export async function runIntelligenceSweep(options?: {
  days?: number;
  verticalSlug?: string;
}): Promise<{
  signals: Awaited<ReturnType<typeof signalDetector>>;
  contradictions: Awaited<ReturnType<typeof contradictionDetector>>;
  trends: Awaited<ReturnType<typeof trendAnalyzer>>;
}> {
  const days = options?.days ?? 7;
  
  console.log(`\n${"â•".repeat(60)}`);
  console.log(`  INTELLIGENCE SWEEP (last ${days} days)`);
  console.log(`${"â•".repeat(60)}\n`);
  
  // 1. Get recent sources
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const recentSources = await prisma.source.findMany({
    where: {
      createdAt: { gte: since },
      qualityScore: { gte: 60 }
    },
    select: { id: true },
    take: 200
  });
  
  const sourceIds = recentSources.map(s => s.id);
  console.log(`[Intelligence] Found ${sourceIds.length} recent sources`);
  
  // 2. Run Signal Detection
  console.log(`\n[Intelligence] Running Signal Detection...`);
  const signals = await signalDetector({ 
    sourceIds, 
    verticalSlug: options?.verticalSlug 
  });
  
  // 3. Run Contradiction Detection
  console.log(`\n[Intelligence] Running Contradiction Detection...`);
  const contradictions = await contradictionDetector(sourceIds);
  
  // 4. Run Trend Analysis
  console.log(`\n[Intelligence] Running Trend Analysis...`);
  const trends = await trendAnalyzer({
    verticalSlug: options?.verticalSlug,
    lookbackMonths: Math.max(3, Math.ceil(days / 30) * 2)
  });
  
  console.log(`\n${"â•".repeat(60)}`);
  console.log(`  âœ… INTELLIGENCE SWEEP COMPLETE`);
  console.log(`  Signals: ${signals.detected}`);
  console.log(`  Contradictions: ${contradictions.contradictionsFound}`);
  console.log(`  Trends: ${trends.trendsDetected}`);
  console.log(`${"â•".repeat(60)}\n`);
  
  return { signals, contradictions, trends };
}
