/**
 * Pipeline initialization: flag resolution, pre-flight provider health,
 * adaptive topology, durable-execution setup, memory injections (witness /
 * world-model / world-evolver / PRM / self-play / MoA), the blackboard,
 * idempotency guard, tier flags, the budget accumulator (addCost) and
 * provider selection (smart + skill-bank + complexity routing).
 *
 * Extracted from runPipelineCore (Sprint 28c). Returns a `PipelineInit`
 * object — the mutable flow state lives in `flags`/`cost`/`selfCorrect`
 * holders so both the init closures (addCost budget guard) and the
 * orchestrator body read/write the SAME fields.
 */
import { prisma } from '../../db';
import { isEditorialV2Enabled, getPipelineMaxBudgetUsd } from '../editorial-config';
import { PipelineContext } from '../pipeline-context';
import { activeRuns } from './public-ops';
import { DEFAULT_ACADEMIC_PROVIDERS } from './provider-lists';
import type { Providers } from './provider-lists';
import { selectSmartProviders } from '../smart-provider-selector';
import { getHealthyProviders } from '../provider-health-tracker';
import { initDurableRun, runDurableStep, durableKeyFor } from '../durable-execution';
import { isFreeRun, filterFreeRunProviders } from '../../free-run';
import { createWitnessContext, buildLearningInjection, type WitnessContext } from '../witness/integration';
import { buildWorldModelInjection, createWorldEvolver, buildWorldEvolverInjection, type WorldEvolverState } from '../world-model/world-model';
import { loadPRMModel, type PRMModel } from '../prm/process-reward-model';
import { buildSelfPlayInjection } from '../self-play/adversarial';
import { loadAgentWeights } from '../moa/mixture-of-agents';
import type { PipelineStats } from '../pipeline-types';
import type { PipelineCoreOptions } from '../pipeline-v2';

export async function runPipelineInit(query: string, opts: PipelineCoreOptions) {
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
  let conductorWorkflow: import('../conductor-orchestrator').Workflow | undefined;
  try {
    const { getWorkflow, pruneOptionalSteps } = await import('../conductor-orchestrator');
    conductorWorkflow = getWorkflow(isStrategic);
    const maxBudget = opts.maxBudgetUsd ?? (isStrategic ? 8 : 3);
    conductorWorkflow = pruneOptionalSteps(conductorWorkflow, maxBudget);
    console.log(`[Pipeline] CONDUCTOR: workflow="${conductorWorkflow.name}", ${conductorWorkflow.steps.length} steps (pruned optional steps due to budget=$${maxBudget})`);
  } catch (e) { /* non-blocking */ }

  // SELF-CORRECT (CHARM + Overseer hybrid): autonomous error detection and correction
  // Wraps pipeline stages with checkpoints, cross-stage consistency tracking (TF-IDF drift),
  // cascade detection, and auto-feedback injection on retry.
  const { SelfCorrector, citationCoverageVerifier } = await import('../self-correct');
  const selfCorrector = new SelfCorrector({
    enableAutoRetry: true,
    enableRollback: true,
    maxRetriesPerStage: 2, // conservative — each retry costs LLM tokens
  });
  const selfCorrect = { retries: 0, rollbacks: 0 };

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
    const { getAvailableProviders, getSuspendedProviders, getFreepoolAliveEndpoints } = await import('../../llm/unified-llm');
    const available = getAvailableProviders();
    const suspended = await getSuspendedProviders();
    const alive = available.filter(p => !suspended.includes(p));
    // Free-run refinement: "freepool" alive only counts if a configured endpoint
    // isn't quota-cooled — otherwise the scout burns retrieval budget for an
    // analyst that is guaranteed to refuse.
    const freeAlive = getFreepoolAliveEndpoints();
    if (alive.length === 1 && alive[0] === 'freepool' && freeAlive.length === 0) {
      alive.length = 0;
    }
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

  // ── PRE-FLIGHT: Persistence probe ──
  // A paid run that cannot persist is pure waste: the S30 prod run burned $0.80
  // of retrieval before Neon returned 53100 (project size cap) on every write.
  // Probe-write a throwaway metric row BEFORE the scout spends on providers.
  try {
    const probe = await prisma.systemMetric.create({
      data: { metricName: 'preflight_persistence_probe', metricValue: 1, periodStart: new Date(), periodEnd: new Date() },
    });
    await prisma.systemMetric.delete({ where: { id: probe.id } }).catch(() => undefined);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('53100') || msg.includes('size limit')) {
      const abort = new Error(`${label} PRE-FLIGHT ABORT: database cannot persist (Neon size cap) — refusing to burn retrieval budget. Free space or upgrade the plan first.`);
      abort.name = 'PreflightAbortError';
      throw abort;
    }
    // Other DB errors (transient connectivity) — let the pipeline surface them
    console.warn(`${label} PRE-FLIGHT: persistence probe failed non-fatally: ${msg.slice(0, 120)}`);
  }

  // ── ADAPTIVE TOPOLOGY (AdaptOrch arXiv 2026) ──
  // Selects pipeline topology based on query complexity signals.
  // Simple queries → parallel retrieval; complex → hierarchical decomposition.
  let topologyPlan: import('../adaptive-topology').TopologyPlan | undefined;
  try {
    const { selectTopology, extractComplexitySignals } = await import('../adaptive-topology');
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
  }

  // ── MEMORY/MODEL LOADS — parallel barrier ──
  // Witness learnings, world model, PRM, self-play lessons and MoA weights are
  // independent reads gated by distinct flags — one barrier instead of five
  // sequential awaits (~1-3s saved per run on cold DB/remote stores).
  let witnessLearningInjection = '';
  let worldModelInjection = '';
  let worldModelReliableSources: string[] = [];
  let worldModelControversies: string[] = [];
  let prmModel: PRMModel | null = null;
  let selfPlayInjection = '';
  await Promise.all([
    // WITNESS: inject past learnings (stored for later injection)
    useWitness ? (async () => {
      try {
        witnessLearningInjection = await buildLearningInjection();
        if (witnessLearningInjection) {
          console.log(`${label} WITNESS: prepared past learnings for injection (${witnessLearningInjection.length} chars)`);
        }
      } catch (err) {
        console.warn(`${label} WITNESS: failed to inject learnings:`, err);
      }
    })() : Promise.resolve(),

    // WORLD MODEL: inject prior cross-run knowledge
    useWorldModel ? (async () => {
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
    })() : Promise.resolve(),

    // PRM: load trained step-scoring model
    usePRM ? (async () => {
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
    })() : Promise.resolve(),

    // SELF-PLAY: adversarial lessons for injection
    useSelfPlay ? (async () => {
      try {
        selfPlayInjection = await buildSelfPlayInjection();
        if (selfPlayInjection) {
          console.log(`${label} SELF_PLAY: injected ${selfPlayInjection.length} chars of adversarial lessons`);
        }
      } catch (err) {
        console.warn(`${label} SELF_PLAY: failed to load lessons:`, err);
      }
    })() : Promise.resolve(),

    // MOA: agent weights
    useMixtureOfAgents ? (async () => {
      try {
        await loadAgentWeights();
        console.log(`${label} MOA: agent weights loaded`);
      } catch (err) {
        console.warn(`${label} MOA: failed to load weights:`, err);
      }
    })() : Promise.resolve(),
  ]);

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
  const flags = {
    runHarvardCouncilStep: opts.enableHarvardCouncil !== false,
    runEnhancedCouncilStep: isStrategic ? (opts.enableEnhancedCouncil !== false) : (opts.enableEnhancedCouncil === true),
    runDebateStep: opts.enableDebate !== false,
    runMetaAnalysisStep: opts.enableMetaAnalysis !== false,
    runDevilsAdvocateStep: opts.enableDevilsAdvocate !== false,
    runDeliberationStep: isStrategic ? (opts.enableDeliberation !== false) : (opts.enableDeliberation === true),
    witnessReducedScope: false,
  };

  // P1-FIX: Running cost accumulator with cost-aware early exit
  const maxBudget = opts.maxBudgetUsd ?? getPipelineMaxBudgetUsd(isStrategic, editorialV2);
  const cost = { runningCostUsd: 0, budgetDegraded: false };
  // Witness directive — metacognitive observer can cut optional phases mid-run.
  // 'reduce_scope' skips self-play + devil's advocate; 'abort' also cuts debate/deliberation.
  function addCost(amount: number | undefined, stepName: string) {
    if (typeof amount === "number" && amount > 0) {
      cost.runningCostUsd += amount;
      // Cost-aware early exit: at 80% budget, degrade gracefully
      if (!cost.budgetDegraded && cost.runningCostUsd > maxBudget * 0.8) {
        cost.budgetDegraded = true;
        console.warn(`${label} BUDGET GUARD: 80% threshold reached ($${cost.runningCostUsd.toFixed(4)}/$${maxBudget}) — degrading gracefully`);
        flags.runDebateStep = false;
        flags.runMetaAnalysisStep = false;
        flags.runDevilsAdvocateStep = false;
        ctx.skipStep('debate');
        ctx.skipStep('meta-analysis');
        ctx.skipStep('devils-advocate');
        ctx.addFinding('BUDGET_GUARD', 'warning', `Budget at 80% — skipping optional steps (debate, meta, DA)`);
      }
      // P2-FIX: Budget guard — hard-degrade at 100%, throw only at 2x runaway
      if (cost.runningCostUsd > maxBudget) {
        cost.budgetDegraded = true; // Ensure degradation is active
        console.warn(`${label} BUDGET GUARD: 100% threshold reached ($${cost.runningCostUsd.toFixed(4)}/$${maxBudget}) — hard degrading`);
        // Aggressively disable all remaining optional steps
        flags.runDebateStep = false;
        flags.runMetaAnalysisStep = false;
        flags.runDevilsAdvocateStep = false;
        flags.runEnhancedCouncilStep = false;
        flags.runDeliberationStep = false;
        ctx.skipStep('debate');
        ctx.skipStep('meta-analysis');
        ctx.skipStep('devils-advocate');
        ctx.skipStep('enhanced-council');
        ctx.skipStep('deliberation');
        ctx.addFinding('BUDGET_GUARD', 'warning', `Budget exceeded 100% — all remaining optional steps skipped`);

        // If cost is more than 2x the budget, something is seriously wrong.
        // This is a hard abort to prevent runaway costs.
        if (cost.runningCostUsd > maxBudget * 2) {
          console.error(`${label} BUDGET GUARD: $${cost.runningCostUsd.toFixed(4)} exceeds 2x max $${maxBudget} after ${stepName} — ABORTING`);
          throw new Error(`Pipeline budget exceeded 2x limit: $${cost.runningCostUsd.toFixed(4)} > $${maxBudget * 2} after ${stepName}`);
        }
      }
    }
  }
  function isBudgetConstrained() { return cost.budgetDegraded; }

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

  // Zero-cost rehearsal: drop every provider that meters paid API credits.
  // Free public endpoints (OpenAlex, Crossref, feeds, institutional open data)
  // still exercise the full fan-out, checkpointing and reclaim machinery.
  if (isFreeRun()) {
    const before = providers.length;
    providers = filterFreeRunProviders(providers);
    console.log(`${label} FREE RUN: ${before - providers.length} paid providers dropped, ${providers.length} free remain`);
  }

  // ── SKILL BANK: bias provider order toward configurations that previously
  // produced trust ≥ 80 in this domain (procedural memory, FlowEvo pattern) ──
  let provenSkill: import('../skill-bank').ProvenSkill | null = null;
  try {
    const { getProvenSkill, applySkillToProviders } = await import('../skill-bank');
    const { detectDomain } = await import('../smart-provider-selector');
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
    data: { id: opts.executionId, question: query, format: isStrategic ? "strategic" : isMemo ? "memo" : "brief", status: "RUNNING" },
  });

  // ── DURABLE EXECUTION (Sprint 6) ──
  // Stable key: resumes must find the same state across retries — keying on
  // pipelineRun.id (fresh per attempt) would never resume. A crashed/timed-out
  // run re-dispatched for the same query+format picks up at its last checkpoint.
  // `let` not const: a failed init downgrades the run to non-durable instead
  // of killing it — a PipelineRun row was just created and a throw here left
  // the run RUNNING-with-no-steps until the sweep failed it (observed live:
  // memo runs dying at 0.0min with steps:[] and error:null).
  let durableKey = useDurableExecution
    ? durableKeyFor(query, opts.format ?? (isStrategic ? 'strategic' : isMemo ? 'memo' : 'brief'))
    : null;
  if (durableKey) {
    try {
      await initDurableRun(durableKey, query);
      console.log(`${label} DURABLE EXECUTION: initialized (${durableKey})`);
    } catch (err) {
      console.warn(`${label} DURABLE EXECUTION: init failed — continuing WITHOUT checkpointing:`, err);
      durableKey = null;
    }
  }
  const durable = <T>(step: string, fn: () => Promise<T>, costUsd = 0): Promise<T> =>
    durableKey ? runDurableStep(durableKey, step, fn, { costUsd }) : fn();

  // P2/8: with durable execution on, the signal bus persists to agentAuditLog
  // so coordination state (unresolved needs) survives a crash and rehydrates
  // on resume — a checkpoint restores step outputs, this restores the bus.
  if (durableKey) {
    try {
      const { PersistentSignalBus, rehydrateSignalBus } = await import('../signals');
      ctx.signals = (await rehydrateSignalBus(ctx, `pipeline:${durableKey}`))
        ?? new PersistentSignalBus(ctx, `pipeline:${durableKey}`);
    } catch { /* persistence is opportunistic — fall back to in-memory bus */ }
  }


  return {
    isStrategic, useWitness, useMixtureOfAgents, useWorldModel, usePRM, useSelfPlay,
    useOutputGuard, useLocalJudge, useStorm, useTemporalMemory, useThinkTankPack,
    usePeerReview, useRagasEval, useDurableExecution, useSelfEvolution,
    isDossier, isMemo, editorialV2, label, stats, pipelineStart,
    conductorWorkflow, topologyPlan, rejectionHandler,
    selfCorrector, witnessCtx, witnessLearningInjection,
    worldModelInjection, worldModelReliableSources, worldModelControversies,
    worldEvolverInjection, worldEvolverState, prmModel, selfPlayInjection,
    ctx, providers, perProvider, provenSkill, maxBudget,
    flags, cost, selfCorrect, addCost, isBudgetConstrained,
    pipelineRun, durableKey, durable, idempotencyKey,
  };
}
