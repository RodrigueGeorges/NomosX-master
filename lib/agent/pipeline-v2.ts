/** Cohere reranking, batch ops, governance, lineage tracking.
 * 
 * SCOUT â†’ INDEX â†’ RANK â†’ READER â†’ ANALYST â†’ EDITOR â†’ GUARD â†’ PUBLISHER
 */

import {  prisma  } from '../db';
import {  callLLM  } from '../llm/unified-llm';
import { BRAND_BRIEF_FOOTER, BRAND_MANIFESTO } from '@/lib/brand/public-copy';
import { analystAgentV3 as analystMultipass } from './analyst-multipass';
import { primeContext } from './context-primer';
import { initDurableRun, runDurableStep, durableKeyFor, saveDurableStep } from './durable-execution';
import type { PrimarySourceInput } from './think-tank-pack';
import { createWitnessContext, buildLearningInjection, type WitnessContext } from './witness/integration';
import { loadAgentWeights } from './moa/mixture-of-agents';
import { buildWorldModelInjection } from './world-model/world-model';
import { createWorldEvolver, buildWorldEvolverInjection, type WorldEvolverState } from './world-model/world-model';
import { buildSelfPlayInjection } from './self-play/adversarial';
import { loadPRMModel, type PRMModel } from './prm/process-reward-model';

// P1-PERF: Optional agents are lazy-loaded via dynamic import() to reduce cold start
// debateAgent, metaAnalysisEngine, runDevilsAdvocate, runHarvardCouncil,
// runEnhancedHarvardCouncil, runCollaborativeDeliberation, buildDeliberationContextBlock
import { emitProgress } from './pipeline-progress';
import { selectSmartProviders } from './smart-provider-selector';
import { getHealthyProviders, recordProviderCall } from './provider-health-tracker';
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
import { buildAnalystContext } from './pipeline-steps/analyst-context';
import { runPostAnalystChecks } from './pipeline-steps/post-analyst-checks';
import { runAnalystExecution } from './pipeline-steps/analyst-run';
import { runScoutBlock } from './pipeline-steps/scout-block';
import { DEFAULT_ACADEMIC_PROVIDERS } from './pipeline-steps/provider-lists';
import type { Providers } from './pipeline-steps/provider-lists';

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
}

async function runPipelineCore(query: string, opts: PipelineCoreOptions) {
  // LOT 6.3: FAILURE POLICY
  // CRITICAL agents (throw on failure): SCOUT, RANK, ANALYST
  // NON-BLOCKING agents (warn + continue): CONTEXT_PRIMER, EMBED, GAP_FILLER,
  //   QUANT, FRAMING, HYPOTHESIS_JUDGE, FACT_CHECKER, CRITICAL_LOOP, DEVILS_ADVOCATE,
  //   KNOWLEDGE_GRAPH, STYLE_GATES, EVIDENCE_IDS, RESEARCH_GAPS
  const { isStrategic } = opts;
  const useWitness = opts.useWitness ?? (isStrategic && (opts.maxBudgetUsd ?? 5) > 2.0);

  // S16-05: Conductor (Microsoft 2026) — deterministic workflow orchestration
  // Uses the Conductor orchestrator to determine which optional steps to prune
  // based on remaining budget. Zero LLM tokens spent on orchestration decisions.
  let conductorWorkflow: import('./conductor-orchestrator').Workflow | undefined;
  try {
    const { getWorkflow, pruneOptionalSteps } = await import('./conductor-orchestrator');
    conductorWorkflow = getWorkflow(isStrategic);
    const maxBudget = opts.maxBudgetUsd ?? (isStrategic ? 8 : 3);
    conductorWorkflow = pruneOptionalSteps(conductorWorkflow, maxBudget);
    console.log(`[Pipeline] CONDUCTOR: workflow="${conductorWorkflow.name}", ${conductorWorkflow.steps.length} steps (pruned optional steps due to budget=$${maxBudget})`);
  } catch (e) { /* non-blocking */ }

  // SELF-CORRECT (CHARM + Overseer hybrid): autonomous error detection and correction
  // Wraps pipeline stages with checkpoints, cross-stage consistency tracking (TF-IDF drift),
  // cascade detection, and auto-feedback injection on retry.
  const { SelfCorrector, citationCoverageVerifier } = await import('./self-correct');
  const selfCorrector = new SelfCorrector({
    enableAutoRetry: true,
    enableRollback: true,
    maxRetriesPerStage: 2, // conservative — each retry costs LLM tokens
  });
  let selfCorrectRetries = 0;
  let selfCorrectRollbacks = 0;

  // V3.2: Auto-activate advanced features based on query characteristics
  // instead of requiring explicit opt-in for every feature.
  const hasTemporalIndicators = /\b(will|forecast|predict|project|by\s+20\d\d|future|trajectory|emerging|evolve|outlook)\b/i.test(query);

  // K5/K7: MoA is opt-in ONLY. It previously auto-activated on complex/strategic
  // queries but its output was unconditionally overwritten by the multipass
  // call below (the `!analysis` guard was lost) — pure dead spend. Opted-in
  // MoA now actually produces the analysis; default stays multipass.
  const useMixtureOfAgents = opts.useMixtureOfAgents ?? false;
  // K11: WorldEvolver auto-activates for temporal/predictive queries
  const useWorldModel = opts.useWorldModel ?? hasTemporalIndicators;

  // Auto-activate learning features for strategic reports (budget-guarded)
  // PRM scores each reasoning step — learns which patterns lead to good outcomes
  // Self-Play attacks the analysis to find weaknesses before publication
  const canAffordLearning = (opts.maxBudgetUsd ?? (isStrategic ? 8 : 3)) > 3.0;
  const usePRM = opts.usePRM ?? (isStrategic && canAffordLearning);
  const useSelfPlay = opts.useSelfPlay ?? (isStrategic && canAffordLearning);
  const useOutputGuard = opts.useOutputGuard ?? false;
  const useLocalJudge = opts.useLocalJudge ?? false;
  const useStorm = opts.useStorm ?? false;
  const useTemporalMemory = opts.useTemporalMemory ?? false;
  const useThinkTankPack = opts.useThinkTankPack ?? false;
  const usePeerReview = opts.usePeerReview ?? false;
  const useRagasEval = opts.useRagasEval ?? false;
  // Durable execution ON for heavy formats by default — a 50-80min run killed
  // by timeout/crash resumes at its last checkpoint instead of losing everything.
  const useDurableExecution = opts.useDurableExecution ?? (isStrategic || opts.format === 'memo' || opts.format === 'dossier');
  // Self-Evolution: evolve agent prompts after each strategic run via GMPO + MAGE
  // Cost: ~$0.05-0.10 (4 agents × 2 LLM calls each). Non-blocking, wrapped in try/catch.
  const useSelfEvolution = opts.useSelfEvolution ?? (isStrategic && canAffordLearning);
  const isDossier = opts.format === "dossier";
  const isMemo = opts.format === "memo";
  const editorialV2 = isEditorialV2Enabled();
  const label = isStrategic ? "[Strategic]" : "[Pipeline]";
  const stats: PipelineStats = {};
  const pipelineStart = Date.now();

  // ── PRE-FLIGHT: Provider health check ──
  // Detect dead providers (suspended accounts, exhausted credits) BEFORE the pipeline
  // starts so we don't waste time discovering them through mid-pipeline failures.
  try {
    const { getAvailableProviders, getSuspendedProviders } = await import('../llm/unified-llm');
    const available = getAvailableProviders();
    const suspended = await getSuspendedProviders();
    const alive = available.filter(p => !suspended.includes(p));
    if (suspended.length > 0) {
      console.warn(`${label} PRE-FLIGHT: ⚠️ Suspended providers: ${suspended.join(', ')} — will skip automatically`);
    }
    if (alive.length === 0) {
      // Hard stop: with zero LLMs alive every LLM stage will fail or emit
      // degraded output, yet SCOUT still burns paid search calls (Tavily/Exa).
      // Throwing here marks the run FAILED without spending a cent on retrieval.
      const abort = new Error(`${label} PRE-FLIGHT ABORT: 0 LLM providers alive — refusing to burn retrieval budget on a run that cannot produce analysis. Resume when a provider is healthy (or configure a freepool key: GROQ_API_KEY/CEREBRAS_API_KEY/…).`);
      abort.name = 'PreflightAbortError';
      throw abort;
    }
    if (alive.length < 2) {
      console.error(`${label} PRE-FLIGHT: ⚠️ DEGRADED — only ${alive.length} provider(s) alive: ${alive.join(', ')}. No failover headroom; continuing with reduced redundancy.`);
    } else {
      console.log(`${label} PRE-FLIGHT: ✅ ${alive.length} providers alive: ${alive.join(', ')}${suspended.length > 0 ? ` (suspended: ${suspended.join(', ')})` : ''}`);
    }
  } catch (e) {
    if ((e as Error).name === 'PreflightAbortError') throw e;
    /* non-blocking */
  }

  // ── ADAPTIVE TOPOLOGY (AdaptOrch arXiv 2026) ──
  // Selects pipeline topology based on query complexity signals.
  // Simple queries → parallel retrieval; complex → hierarchical decomposition.
  let topologyPlan: import('./adaptive-topology').TopologyPlan | undefined;
  try {
    const { selectTopology, extractComplexitySignals } = await import('./adaptive-topology');
    const signals = extractComplexitySignals(query, isStrategic, 0 /* sourceCount unknown pre-SCOUT */);
    topologyPlan = selectTopology(signals);
    if (topologyPlan.topology !== 'sequential') {
      console.log(`${label} TOPOLOGY: ${topologyPlan.topology} (speedup~${topologyPlan.estimatedSpeedup}x) — ${topologyPlan.rationale}`);
    }
  } catch (e) { /* non-blocking */ }

  // ── Global rejection guard ──
  // Fire-and-forget promises (agent memory, witness learning, langfuse tracing,
  // cache writes) can reject after the pipeline completes. Without this handler,
  // Node.js terminates with exit code 1 even on successful pipeline runs.
  const rejectionHandler = (reason: unknown) => {
    console.warn(`${label} [unhandledRejection] (non-fatal):`, reason);
  };
  process.on('unhandledRejection', rejectionHandler);

  // ── WITNESS: Metacognitive observer (Sakshi Witness pattern) ──
  // The Witness observes each pipeline step, detects anomalies, and can intervene.
  // It also learns across runs to improve prompts and thresholds.
  let witnessCtx: WitnessContext | null = null;
  let witnessLearningInjection = '';
  if (useWitness) {
    const budgetCap = isStrategic ? 8.0 : 3.0;
    witnessCtx = createWitnessContext(
      `run_${Date.now()}`,
      query,
      budgetCap,
      {
        canIntervene: true,
        useDatabase: true,
        useLLM: true,
        steps: ['scout', 'rank', 'reader', 'analyst', 'editor'],
      },
    );
    console.log(`${label} WITNESS: metacognitive observer activated (budget cap: $${budgetCap})`);

    // Inject past learnings into the pipeline context (stored for later injection)
    try {
      witnessLearningInjection = await buildLearningInjection();
      if (witnessLearningInjection) {
        console.log(`${label} WITNESS: prepared past learnings for injection (${witnessLearningInjection.length} chars)`);
      }
    } catch (err) {
      console.warn(`${label} WITNESS: failed to inject learnings:`, err);
    }
  }

  // ── WORLD MODEL: Persistent cross-run knowledge accumulation ──
  // The World Model accumulates knowledge across runs. Before a run, it injects
  // prior knowledge. After a run, it extracts and persists new findings.
  let worldModelInjection = '';
  let worldModelReliableSources: string[] = [];
  let worldModelControversies: string[] = [];
  if (useWorldModel) {
    try {
      const wmResult = await buildWorldModelInjection(query);
      if (wmResult.contextBlock) {
        worldModelInjection = wmResult.contextBlock;
        worldModelReliableSources = wmResult.reliableSourceIds;
        worldModelControversies = wmResult.knownControversies;
        console.log(`${label} WORLD_MODEL: injected prior knowledge (${worldModelInjection.length} chars, ${worldModelReliableSources.length} reliable sources, ${worldModelControversies.length} known controversies)`);
      } else {
        console.log(`${label} WORLD_MODEL: no prior knowledge found for this query`);
      }
    } catch (err) {
      console.warn(`${label} WORLD_MODEL: failed to query:`, err);
    }
  }

  // K11: WorldEvolver — self-evolving world model injection
  // Injects high-confidence predictions and learned rules from past episodes
  let worldEvolverInjection = '';
  const worldEvolverState: WorldEvolverState = createWorldEvolver();
  try {
    const domain = query.split(/\s+/).slice(0, 3).join(' ');
    worldEvolverInjection = buildWorldEvolverInjection(worldEvolverState, domain, ['search_sources', 'read_source', 'analyze']);
    if (worldEvolverInjection) {
      console.log(`${label} WORLD_EVOLVER: injected ${worldEvolverInjection.length} chars of foresight`);
    }
  } catch (err) {
    console.warn(`${label} WORLD_EVOLVER: failed to build injection:`, err);
  }

  // ── PRM: Process Reward Model — scores reasoning steps ──
  let prmModel: PRMModel | null = null;
  if (usePRM) {
    try {
      prmModel = await loadPRMModel();
      if (prmModel) {
        console.log(`${label} PRM: loaded model (${prmModel.trainingExamples} training examples, avg reward ${prmModel.avgReward.toFixed(3)})`);
      } else {
        console.log(`${label} PRM: no trained model yet — will collect data for future training`);
      }
    } catch (err) {
      console.warn(`${label} PRM: failed to load model:`, err);
    }
  }

  // ── SELF-PLAY: Prepare adversarial lessons for injection ──
  let selfPlayInjection = '';
  if (useSelfPlay) {
    try {
      selfPlayInjection = await buildSelfPlayInjection();
      if (selfPlayInjection) {
        console.log(`${label} SELF_PLAY: injected ${selfPlayInjection.length} chars of adversarial lessons`);
      }
    } catch (err) {
      console.warn(`${label} SELF_PLAY: failed to load lessons:`, err);
    }
  }

  // ── MOA: Load agent weights ──
  if (useMixtureOfAgents) {
    try {
      await loadAgentWeights();
      console.log(`${label} MOA: agent weights loaded`);
    } catch (err) {
      console.warn(`${label} MOA: failed to load weights:`, err);
    }
  }

  // ── BLACKBOARD: Shared context across all agents (2026 pattern) ──
  // Breaks silos: ANALYST can request targeted re-search, EDITOR sees gaps, etc.
  const ctx = new PipelineContext(query, isStrategic);

  // ── MISSION: the single shared goal every agent reads (Sprint 26). ──
  // Publication-grade targets — sweeps prioritize signals that close unmet
  // targets, so collective effort is goal-directed rather than scripted.
  ctx.setMission('Produce a publication-grade analysis that survives adversarial review', {
    trust: 65,
    groundedness: 80,
    citationCoverage: 0.5,
    minSources: isStrategic ? 20 : 12,
    requireCentralScenario: true,
    quality: 60,
  });

  // ── IDEMPOTENCY GUARD (2026 best practice) ──
  // Prevent duplicate pipeline runs for the same query within a 2-hour window.
  // If cron overlaps or dispatcher retries, the second run is rejected.
  const idempotencyKey = `${isStrategic ? 'strat' : 'brief'}:${query.trim().toLowerCase().slice(0, 200)}`;
  const IDEMPOTENCY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
  if (activeRuns.has(idempotencyKey)) {
    const existing = activeRuns.get(idempotencyKey)!;
    if (Date.now() < existing.expiresAt) {
      console.warn(`${label} IDEMPOTENCY: duplicate run rejected (key=${idempotencyKey.slice(0, 30)}..., started ${Math.round((Date.now() - existing.startedAt) / 1000)}s ago)`);
      throw new Error(`Pipeline already running for this query (started ${Math.round((Date.now() - existing.startedAt) / 1000)}s ago)`);
    }
  }
  activeRuns.set(idempotencyKey, { startedAt: Date.now(), expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });

  // Tier flags — default to the full quality stack, while allowing callers to
  // explicitly choose a lighter execution profile for smoke tests and recovery.
  // These may be adjusted by the complexity gate after topic classification.
  let runHarvardCouncilStep = opts.enableHarvardCouncil !== false;
  let runEnhancedCouncilStep = isStrategic ? (opts.enableEnhancedCouncil !== false) : (opts.enableEnhancedCouncil === true);
  let runDebateStep = opts.enableDebate !== false;
  let runMetaAnalysisStep = opts.enableMetaAnalysis !== false;
  let runDevilsAdvocateStep = opts.enableDevilsAdvocate !== false;
  let runDeliberationStep = isStrategic ? (opts.enableDeliberation !== false) : (opts.enableDeliberation === true);

  // P1-FIX: Running cost accumulator with cost-aware early exit
  const maxBudget = opts.maxBudgetUsd ?? getPipelineMaxBudgetUsd(isStrategic, editorialV2);
  let runningCostUsd = 0;
  let budgetDegraded = false;
  // Witness directive — metacognitive observer can cut optional phases mid-run.
  // 'reduce_scope' skips self-play + devil's advocate; 'abort' also cuts debate/deliberation.
  let witnessReducedScope = false;
  function addCost(amount: number | undefined, stepName: string) {
    if (typeof amount === "number" && amount > 0) {
      runningCostUsd += amount;
      // Cost-aware early exit: at 80% budget, degrade gracefully
      if (!budgetDegraded && runningCostUsd > maxBudget * 0.8) {
        budgetDegraded = true;
        console.warn(`${label} BUDGET GUARD: 80% threshold reached ($${runningCostUsd.toFixed(4)}/$${maxBudget}) — degrading gracefully`);
        runDebateStep = false;
        runMetaAnalysisStep = false;
        runDevilsAdvocateStep = false;
        ctx.skipStep('debate');
        ctx.skipStep('meta-analysis');
        ctx.skipStep('devils-advocate');
        ctx.addFinding('BUDGET_GUARD', 'warning', `Budget at 80% — skipping optional steps (debate, meta, DA)`);
      }
      // P2-FIX: Budget guard — hard-degrade at 100%, throw only at 2x runaway
      if (runningCostUsd > maxBudget) {
        budgetDegraded = true; // Ensure degradation is active
        console.warn(`${label} BUDGET GUARD: 100% threshold reached ($${runningCostUsd.toFixed(4)}/$${maxBudget}) — hard degrading`);
        // Aggressively disable all remaining optional steps
        runDebateStep = false;
        runMetaAnalysisStep = false;
        runDevilsAdvocateStep = false;
        runEnhancedCouncilStep = false;
        runDeliberationStep = false;
        ctx.skipStep('debate');
        ctx.skipStep('meta-analysis');
        ctx.skipStep('devils-advocate');
        ctx.skipStep('enhanced-council');
        ctx.skipStep('deliberation');
        ctx.addFinding('BUDGET_GUARD', 'warning', `Budget exceeded 100% — all remaining optional steps skipped`);

        // If cost is more than 2x the budget, something is seriously wrong.
        // This is a hard abort to prevent runaway costs.
        if (runningCostUsd > maxBudget * 2) {
          console.error(`${label} BUDGET GUARD: $${runningCostUsd.toFixed(4)} exceeds 2x max $${maxBudget} after ${stepName} — ABORTING`);
          throw new Error(`Pipeline budget exceeded 2x limit: $${runningCostUsd.toFixed(4)} > $${maxBudget * 2} after ${stepName}`);
        }
      }
    }
  }
  function isBudgetConstrained() { return budgetDegraded; }

  // â”€â”€ Resolve providers: smart selection (async, history-aware) or explicit â”€â”€
  let providers: Providers;
  if (opts.providers && opts.providers.length > 0) {
    providers = opts.providers;
  } else if (isStrategic) {
    const smart = await selectSmartProviders(query).catch(() => null);
    const smartProviders = smart?.providers as Providers | undefined;
    // Always merge core academic providers for strategic reports — the smart selector
    // may omit key providers like crossref or europepmc when it focuses on domain-specific ones.
    // OpenAlex is rate-limited (429) so we need multiple academic fallbacks.
    const coreAcademic: Providers = [
      "crossref", "semanticscholar", "europepmc", "arxiv", "pubmed", "doaj", "base", "core", "hal", "plos",
      // Thèses & science ouverte
      "thesesfr", "openaire", "zenodo",
      // Working papers, rapports institutionnels & données marché
      "nber", "worldbank-docs", "cordis", "sec-edgar", "federal-register",
      // Institutions internationales — données primaires
      "imf", "worldbank", "oecd", "eurostat", "un", "insee", "fred", "who-gho",
      // Think tanks — rapports policy
      "brookings", "rand", "cnas", "ecfr", "swp", "sipri", "france-strategie",
      // Foundational sources — books, reports, reference texts
      "ipcc", "internet-archive", "hathitrust", "open-library", "jstor", "unesco", "google-books",
      // Foresight & prospective sources
      "club-of-rome", "millennium-project",
      // Pouls de l'actualité (gratuit)
      "gdelt-news",
    ];
    providers = smartProviders
      ? Array.from(new Set([...smartProviders, ...coreAcademic])) as Providers
      : [...DEFAULT_ACADEMIC_PROVIDERS];
  } else {
    const smart = await selectSmartProviders(query).catch(() => null);
    providers = (smart?.providers as Providers | undefined) ?? DEFAULT_ACADEMIC_PROVIDERS;
  }

  // P3-K: Filter out blacklisted providers
  const healthyProviders = getHealthyProviders(providers as string[]) as Providers;
  if (healthyProviders.length < providers.length) {
    console.log(`${label} PROVIDER HEALTH: ${providers.length - healthyProviders.length} providers skipped (circuit open)`);
  }
  providers = healthyProviders.length >= 3 ? healthyProviders : providers; // fallback if too many blacklisted

  // ── SKILL BANK: bias provider order toward configurations that previously
  // produced trust ≥ 80 in this domain (procedural memory, FlowEvo pattern) ──
  let provenSkill: import('./skill-bank').ProvenSkill | null = null;
  try {
    const { getProvenSkill, applySkillToProviders } = await import('./skill-bank');
    const { detectDomain } = await import('./smart-provider-selector');
    const skillDomain = detectDomain(query);
    provenSkill = await getProvenSkill(skillDomain);
    if (provenSkill) {
      providers = applySkillToProviders(providers, provenSkill) as Providers;
      console.log(`${label} SKILL BANK: proven config for '${skillDomain}' (${provenSkill.uses} uses, avg trust ${provenSkill.avgTrust.toFixed(0)}) — ${provenSkill.providers.length} providers prioritized`);
      (stats as any).skillBank = { applied: true, domain: skillDomain, uses: provenSkill.uses, avgTrust: Math.round(provenSkill.avgTrust) };
    }
  } catch { /* non-blocking */ }

  // ── PRE-SCOUT COMPLEXITY ROUTING (Adaptive RAG, 2026 best practice) ──
  // Deterministic query complexity classification — no LLM call.
  // Adapts provider count and perProvider based on query complexity.
  // Simple queries don't need 100+ providers; complex multi-hop ones do.
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const comparisonMarkers = /\b(vs|versus|compared?|comparison|difference between|contrast)\b/i.test(query);
  const causalMarkers = /\b(impact|effect|cause|consequence|result|influence|driver|lead to|because|due to)\b/i.test(query);
  const multiHopMarkers = /\b(and|while|whereas|although|despite|in addition|furthermore|moreover|both)\b/i.test(query);
  const conceptCount = queryWords.filter(w => w.length > 4 && !['what', 'which', 'where', 'when', 'while', 'their', 'there', 'these', 'those', 'about', 'would', 'could', 'should', 'between', 'through', 'during'].includes(w)).length;
  const queryComplexity = (comparisonMarkers ? 2 : 0) + (causalMarkers ? 1 : 0) + (multiHopMarkers ? 1 : 0) + (conceptCount > 8 ? 2 : conceptCount > 5 ? 1 : 0);
  // Simple = genuinely narrow: few content concepts AND no structural complexity.
  // (Word count alone misclassifies short multi-domain questions like
  // "Impact of AI regulation on European competitiveness" — 7 words, 5 concepts.)
  const isSimpleQuery = queryComplexity <= 1 && conceptCount <= 3;
  const isComplexQuery = queryComplexity >= 4;

  let perProvider: number;
  if (isSimpleQuery && !isStrategic) {
    perProvider = opts.perProvider ?? 20;
    if (providers.length > 15) {
      providers = providers.slice(0, 12) as Providers;
    }
    console.log(`${label} COMPLEXITY ROUTING: simple query (score=${queryComplexity}) — reduced to ${providers.length} providers, ${perProvider}/provider`);
  } else if (isComplexQuery || isStrategic) {
    perProvider = opts.perProvider ?? (isStrategic ? 80 : 40);
    console.log(`${label} COMPLEXITY ROUTING: ${isComplexQuery ? 'complex' : 'strategic'} query (score=${queryComplexity}) — full ${providers.length} providers, ${perProvider}/provider`);
  } else {
    perProvider = opts.perProvider ?? (isStrategic ? 80 : 30);
    console.log(`${label} COMPLEXITY ROUTING: moderate query (score=${queryComplexity}) — ${providers.length} providers, ${perProvider}/provider`);
  }

  // Create PipelineRun for persistent lineage tracking
  const pipelineRun = await prisma.pipelineRun.create({
    data: { question: query, format: isStrategic ? "strategic" : isMemo ? "memo" : "brief", status: "RUNNING" },
  });

  // ── DURABLE EXECUTION (Sprint 6) ──
  // Stable key: resumes must find the same state across retries — keying on
  // pipelineRun.id (fresh per attempt) would never resume. A crashed/timed-out
  // run re-dispatched for the same query+format picks up at its last checkpoint.
  const durableKey = useDurableExecution
    ? durableKeyFor(query, opts.format ?? (isStrategic ? 'strategic' : isMemo ? 'memo' : 'brief'))
    : null;
  if (durableKey) {
    try {
      await initDurableRun(durableKey, query);
      console.log(`${label} DURABLE EXECUTION: initialized (${durableKey})`);
    } catch (err) {
      console.warn(`${label} DURABLE EXECUTION: init failed (non-blocking):`, err);
    }
  }
  const durable = <T>(step: string, fn: () => Promise<T>, costUsd = 0): Promise<T> =>
    durableKey ? runDurableStep(durableKey, step, fn, { costUsd }) : fn();

  // P2/8: with durable execution on, the signal bus persists to agentAuditLog
  // so coordination state (unresolved needs) survives a crash and rehydrates
  // on resume — a checkpoint restores step outputs, this restores the bus.
  if (durableKey) {
    try {
      const { PersistentSignalBus, rehydrateSignalBus } = await import('./signals');
      ctx.signals = (await rehydrateSignalBus(ctx, `pipeline:${durableKey}`))
        ?? new PersistentSignalBus(ctx, `pipeline:${durableKey}`);
    } catch { /* persistence is opportunistic — fall back to in-memory bus */ }
  }

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

  // â”€â”€ STEP 0: CONTEXT PRIMER â€” Inject institutional memory + trend breaks â”€â”€
  console.log(`${label} CONTEXT PRIMER: loading institutional memory`);
  let primedContext: Awaited<ReturnType<typeof primeContext>> | null = null;
  try {
    primedContext = await primeContext(query, {
      maxConcepts: isStrategic ? 20 : 15,
      maxPriorBriefs: isStrategic ? 8 : 5,
    });
    orchState.contextPrimed = true;
    orchState.knownConceptCount = primedContext.knownConcepts.length;
    orchState.priorBriefCount = primedContext.priorBriefs.length;
    stats.contextPrimer = {
      knownConcepts: primedContext.knownConcepts.length,
      priorBriefs: primedContext.priorBriefs.length,
      emergingTrends: primedContext.emergingTrends.length,
      trendBreaks: primedContext.trendBreaks?.length ?? 0,
      coverageGap: Boolean(primedContext.coverageGap),
      durationMs: primedContext.durationMs,
    };
    console.log(`${label} CONTEXT PRIMER: ${primedContext.knownConcepts.length} concepts, ${primedContext.priorBriefs.length} prior briefs, ${primedContext.trendBreaks?.length ?? 0} trend breaks`);
  } catch (err) {
    console.error(`${label} CONTEXT PRIMER: FAILED — pipeline continues without institutional memory:`, err);
    stats.contextPrimer = { error: String(err) } as any;
  }

  // ── EPISODIC MEMORY RETRIEVAL (V3.1) — learn from past pipeline runs ──
  let episodicContext: any[] = [];
  let episodicFormatted: string | null = null;
  try {
    const { retrieveEpisodes, formatEpisodeContext, buildEpisodeContextBlock } = await import('./episodic-memory');
    episodicContext = await retrieveEpisodes(query, { limit: isStrategic ? 8 : 5, minSimilarity: 0.55 });
    if (episodicContext.length > 0) {
      console.log(`${label} EPISODIC MEMORY: retrieved ${episodicContext.length} relevant past runs`);
      const ctxBlock = buildEpisodeContextBlock(episodicContext);
      episodicFormatted = formatEpisodeContext(ctxBlock);
    }
  } catch (err) {
    console.warn(`${label} EPISODIC MEMORY: retrieval failed (non-blocking):`, err);
  }

  // -- STEP 1: SCOUT — extracted to pipeline-steps/scout-block.ts --
  const scoutOut = await runScoutBlock({
    query, providers, perProvider, isStrategic, useStorm,
    seedSourceIds: opts.seedSourceIds,
    minSeedSourcesToSkipScout: opts.minSeedSourcesToSkipScout,
    domain: (opts as any).domain, durableKey, scout,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    pipelineStart, emitProgress, isBudgetConstrained, orchState,
    assessAfterScout, recordDecision, recordTransformation, lineage,
    witnessCtx, ctx,
  });
  let allSourceIds = scoutOut.allSourceIds;
  const planNodesForAudit = scoutOut.planNodesForAudit;
  const scoutCkpt = scoutOut.scoutCkptRestored;

  // ── WEB FALLBACK → INTELLIGENT SCOUT → CITATION GRAPH → INDEX/EMBED/DEDUP ──
  // Extracted to pipeline-steps/scout-enrichment-index.ts; web-fallback
  // providers run concurrently (id lists merged in deterministic order).
  {
    const { runScoutEnrichmentAndIndex } = await import('./pipeline-steps/scout-enrichment-index');
    allSourceIds = await runScoutEnrichmentAndIndex({
      allSourceIds, query, label,
      stats: stats as Record<string, any>,
      scoutCkpt: !!scoutCkpt,
      format: isStrategic ? 'strategic' : isDossier ? 'dossier' : isMemo ? 'memo' : 'brief',
      domain: (opts as any).domain || 'general',
      scout, durableKey, saveDurableStep, index,
    });
  }

  // ── STEP 4: RANK + ENRICHMENT — extracted to pipeline-steps/rank-enrichment.ts ──
  // rank → pertinence selection → quality rerank → domain filter →
  // enrichment reasoner (re-scout / refusal-retry) → evidence registry.
  let topSources: any[];
  let evidenceRegistry: any;
  let rankOpts: RankOptions;
  {
    const { runRankAndEnrichment } = await import('./pipeline-steps/rank-enrichment');
    const rankOut = await runRankAndEnrichment({
      query, allSourceIds, isStrategic,
      rankOptions: opts.rankOptions,
      providers, stats: stats as Record<string, any>, label, pipelineStart,
      runningCostUsd, pipelineRunId: pipelineRun.id,
      rank, scout, emitProgress, addCost, ctx, orchState,
    });
    topSources = rankOut.topSources;
    allSourceIds = rankOut.allSourceIds;
    evidenceRegistry = rankOut.evidenceRegistry;
    rankOpts = rankOut.rankOpts;
    if (rankOut.refused) {
      activeRuns.delete(idempotencyKey);
      return { briefId: undefined, pipelineRun, stats, html: '', analysis: { refusal: stats.structuredRefusal } as any };
    }
  }
  // -- STEP 4b: classification + routing gates (extracted) --
  const gates = await runClassificationGates({
    query, topSources, allSourceIds, providers, scout, stats, label,
    isStrategic, enableEnhancedCouncil: opts.enableEnhancedCouncil,
    useThinkTankPack, editorialV2,
    runMetaAnalysisStep, runDeliberationStep, runDebateStep, runDevilsAdvocateStep,
    ctx,
  });
  const topicClassification = gates.topicClassification;
  const detectedDomain = gates.detectedDomain;
  const castingResult = gates.castingResult;
  const foundationalSources = gates.foundationalSources;
  const gapContextBlock = gates.gapContextBlock;
  allSourceIds = gates.allSourceIds;
  runMetaAnalysisStep = gates.runMetaAnalysisStep;
  runDeliberationStep = gates.runDeliberationStep;
  runDebateStep = gates.runDebateStep;
  runDevilsAdvocateStep = gates.runDevilsAdvocateStep;

  // -- STEP 5: READER V3 + FRAMING + QUANT + enrichment (extracted) --
  const readerBlk = await runReaderBlock({
    topSources, query, detectedDomain, isStrategic, runDeliberationStep,
    primedContext, stats, label, pipelineStart, pipelineRunId: pipelineRun.id,
    durable, emitProgress, addCost, ctx, orchState, assessAfterReader, recordDecision,
    quantDepth: opts.quantDepth, parametricInput: opts.parametricInput,
  });
  const readings = readerBlk.readings;
  const framing = readerBlk.framing;
  const quant = readerBlk.quant;
  const quantBridge = readerBlk.quantBridge;
  const readerMemoryBlock = readerBlk.readerMemoryBlock;
  const evidenceBankBlock = readerBlk.evidenceBankBlock;
  const evidenceBankRef = readerBlk.evidenceBankRef;
  const hypothesisVerdictBlock = readerBlk.hypothesisVerdictBlock;
  const dppContextBlock = readerBlk.dppContextBlock;
  const roundTableBlock = readerBlk.roundTableBlock;
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
  const EVAL_STATS_KEYS = ['critic', 'criticPanel', 'devilsAdvocate', 'structuralEditor', 'claimGrounding', 'citationVerifier', 'factChecker', 'symbolicVerifier', 'peerReview'] as const;
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
    isStrategic, useMixtureOfAgents, runningCostUsd,
    maxBudgetUsd: opts.maxBudgetUsd,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    pipelineStart, emitProgress, addCost, durable, analystMultipass,
    bumpAnalysisArtifact, ctx,
  });
  analysis = analystOut.analysis;
  const analystCostUsd = analystOut.analystCostUsd;

  // -- POST-ANALYST CHECKS — extracted to pipeline-steps/post-analyst-checks.ts --
  const checks = await runPostAnalystChecks({
    analysis, query, topSources, slimReadings, fullContextBlock, detectedDomain,
    isStrategic, analystCostUsd, stats: stats as Record<string, any>, label,
    pipelineRunId: pipelineRun.id, pipelineStart, emitProgress, addCost,
    useOutputGuard, useLocalJudge, useSelfPlay, usePRM, prmModel, witnessCtx,
    witnessReducedScope, runDevilsAdvocateStep, runDebateStep, runDeliberationStep,
    selfCorrector, selfCorrectRetries, analystMultipass, bumpAnalysisArtifact,
    validateTopicConsistency, assessAfterAnalyst, recordDecision, orchState, ctx,
  });
  analysis = checks.analysis;
  let reAnalysisBudget = checks.reAnalysisBudget;
  const analystDecision = checks.analystDecision;
  witnessReducedScope = checks.witnessReducedScope;
  runDevilsAdvocateStep = checks.runDevilsAdvocateStep;
  runDebateStep = checks.runDebateStep;
  runDeliberationStep = checks.runDeliberationStep;
  selfCorrectRetries = checks.selfCorrectRetries;

  // -- POST-ANALYST GAP FILL — extracted to pipeline-steps/gap-fill.ts --
  // Shared state: the critic block consumes the same object so a gap-fill
  // re-analysis triggered from CRITIC/OUTLINE is adopted, not clobbered.
  const gapFillState: GapFillState = { analysis, allSourceIds, reAnalysisBudget };
  const gapFillDeps: GapFillDeps = {
    state: gapFillState, query, topSources, readings, slimReadings,
    detectedDomain, isStrategic, fullContextBlock, providers, rankOpts,
    stats: stats as Record<string, any>, label, pipelineRunId: pipelineRun.id,
    analystDecision, orchState, emitProgress, addCost, isBudgetConstrained,
    bumpAnalysisArtifact, analystMultipass, rank, scout, ctx,
  };
  const processGapRequests = createGapRequestProcessor(gapFillDeps);
  await runGapFillStage(gapFillDeps);
  analysis = gapFillState.analysis;
  allSourceIds = gapFillState.allSourceIds;
  reAnalysisBudget = gapFillState.reAnalysisBudget;
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
      emitProgress, pipelineRunId: pipelineRun.id, ctx, selfCorrector,
      processGapRequests,
    });
    analysis = criticOut.analysis;
    allSourceIds = gapFillState.allSourceIds;
    reAnalysisBudget = criticOut.reAnalysisBudget;
    savedCriticResult = criticOut.savedCriticResult;
  }

  // ── STEP 7d: SCENARIO ENGINE — MOVED to pre-analyst (Step 6) for context injection ──
  // CANA + SCATTER now run BEFORE the analyst so their outputs enrich the analysis.
  // Stats are already recorded in the pre-analyst step above.

  // ── STEP 7c/7d/7e: POST-CRITIC ENRICHMENT — extracted to
  //    pipeline-steps/post-critic-enrichment.ts. Reflection + cross-model
  //    consensus + inter-paper KG are pure readers → run concurrently. ──
  {
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
    if (criticalDecision.action === "DEBATE" && !runDebateStep && !budgetDegraded) {
      console.log(`${label} ORCHESTRATOR: DEBATE triggered — trust ${orchState.trustScore} below threshold, enabling adversarial debate`);
      runDebateStep = true;
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

  if (editorialV2) {
    console.log(`${label} EDITORIAL V2: foresight → debate → devil's advocate → editor → quality gates`);

    // NOTE: Foresight (Monte Carlo) now runs AFTER editorial arbiter, which creates the scenarios.
    // Previously foresight ran before arbiter → 0 scenarios → always skipped.
    // The arbiter generates scenario names/descriptions/priors, then foresight refines probabilities.
    stats.foresight = { skipped: true, reason: 'pending — will run after editorial arbiter creates scenarios' };

    // Debate + meta-analysis reactivated — multi-perspective dialectical analysis
    applyDebateOutcome(await runDebateMetaBlock(debateAdvocateDeps, runDebateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query)));

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
      const arbiterOut = await runArbiterForesight({
        query, topicClassification, castingResult,
        analysis: analysis as Record<string, any>,
        topSources, debateResult, stats: stats as Record<string, any>,
        label, detectedDomain, isStrategic,
        seedSourceIds: opts.seedSourceIds,
        pipelineRunId: pipelineRun.id, addCost,
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
    // DA and render are independent: the render reads stats.critic/scout/analyst/
    // trust, never stats.devilsAdvocate — the DA verdict is rendered as an
    // editorial section AFTER the render. Running them concurrently removes
    // the DA's wall-time from the critical path (~15-30s per run).
    const [, renderedHtml] = await Promise.all([
      runDevilsAdvocateBlock(debateAdvocateDeps, runDevilsAdvocateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query), debateContext),
      durable('render', () => renderEditorHtml()),
    ]);
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
    applyDebateOutcome(await runDebateMetaBlock(debateAdvocateDeps, runDebateStep, buildAnalysisReviewText(analysis as Record<string, unknown>, query)));
    await runDevilsAdvocateBlock(debateAdvocateDeps, runDevilsAdvocateStep, html, debateContext);
  }

  stats.analysis = analysis;
  stats.editorialV2 = editorialV2;

  // P3.8 + prose cleanup — extracted to pipeline-steps/post-render-extras.ts
  html = await applyEvidenceIdsAndProseCleanup(html, evidenceRegistry, stats as Record<string, any>, label);

  // ── STYLE GATES → SIGNAL SWEEP → DA RE-CHECK (extracted to
  //    pipeline-steps/style-sweep-recheck.ts — one coupled unit) ──
  {
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
  {
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
    selfCorrectRollbacks += tailCtx.selfCorrectRollbacks;
  }

  // ── STEP 14-17 + POST-RUN LEARNING — extracted to pipeline-steps/persistence-tail.ts ──
  // brief.create → parallel post-publish writes → auditor → reputation →
  // experience bank → eval-freshness assert → pipelineRun.update → durable
  // seal → learning loop → skill bank → parallel post-run learning → MOA.
  const tail = await runPersistenceTail({
    label, isStrategic, query, html,
    stats: stats as Record<string, any>, topSources, analysis, detectedDomain,
    foundationalSources, pipelineRun, orchState, episodicContext, pipelineStart,
    runningCostUsd, savedScatterResult, useTemporalMemory, ctx, emitProgress,
    collectStaleEvaluations, analysisArtifactVersion, htmlArtifactVersion,
    durableKey, memoryBlock, readerMemoryBlock, readings,
    witnessCtx, useWorldModel, worldModelControversies, usePRM, prmModel,
    useRagasEval, useSelfEvolution, useMixtureOfAgents, addCost,
  });
  html = tail.html;

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
  };

  } catch (error: any) {
    // Clean up the rejection handler on failure too
    process.removeListener('unhandledRejection', rejectionHandler);
    // Clean up idempotency token on failure
    activeRuns.delete(idempotencyKey);
    console.error(`${label} FATAL: ${error.message}`);
    emitProgress(pipelineRun.id, "ERROR", "failed", error.message);
    await prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        durationMs: Date.now() - pipelineStart,
        steps: JSON.parse(JSON.stringify({ ...stats, error: error.message })),
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
  });
}

/**
 * P1 FIX: Timeout wrapper to prevent infinite pipeline execution
 * Default: 120s for briefs, 300s for strategic reports
 */

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[Pipeline] ${label} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    promise
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Universal pipeline runner â€” single entry point for all formats.
 * Delegates directly to runPipelineCore with a timeout wrapper.
 */
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

  const isDossier = format === "dossier";
  const isMemo = format === "memo";
  const isStrategic = format === "strategic" || isDossier;
  const timeoutMs = options.timeoutMs ?? (isStrategic ? 4_500_000 : 3_900_000); // 75min strategic, 65min brief/memo — critic-repair re-analysis + deep-planner node scouts need headroom

  // DOSSIER = extended strategic report — wider corpus and more ranked sources
  // so a €699 dossier produces a materially deeper deliverable than a strategic report.
  const dossierRankOptions: RankOptions = isDossier
    ? { limit: 40, maxPerProvider: 8, minProviderDiversity: 6 }
    : {};
  // MEMO = Decision Memo — moderate depth brief (standard depth, ~30 perProvider)
  const memoPerProvider = isMemo ? 30 : undefined;
  const perProvider = options.perProvider ?? memoPerProvider ?? (isDossier ? 120 : undefined);
  const rankOptions = { ...dossierRankOptions, ...options.rankOptions };

  try {
    return await withTimeout(
      runPipelineCore(query, {
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
          where: { question: query, status: "RUNNING" },
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
