# Inventaire agentique NomosX — 256 modules

Référence opérationnelle générée le 2026-11-12. Chaque module liste son rôle
(extrait du docstring source — la doc fait foi, ce fichier est un index), ses
exports publics et sa taille. Les sections sont ordonnées par sous-système ;
les `pipeline-steps/` sont dans l'ordre d'exécution réel du pipeline
(orchestre par `pipeline-v2.ts` / `inquiry-orchestrator.ts`).

Lecture conseillée : § Orchestration → § Pipeline steps (dans l'ordre) →
§ Evidence & verification → § Adversarial & quality gates → § Memory/learning.

---
## Pipeline steps (exécution ordonnée) — 39 modules


### `pipeline-steps/pipeline-init.ts` — 549 lignes

* Pipeline initialization: flag resolution, pre-flight provider health, * adaptive topology, durable-execution setup, memory injections (witness / * world-model / world-evolver / PRM / self-play / MoA), the blackboard, * idempotency guard, tier flags, the budget accumulator (addCost) and * provider selection (smart + skill-bank + complexity routing). * * Extracted from runPipelineCore (Sprint 28c)

**Exports :** `runPipelineInit`

### `pipeline-steps/classification-gates.ts` — 245 lignes

* CLASSIFICATION + ROUTING GATES — STEP 4b: topic classification → * foundational-source injection → complexity gate → gap filler (retrieve + * scout) → casting → LAS gate. * * Mutates `topSources` (foundational push) and the step-routing flags — * the caller owns the flags and reads them back from the result. Stats keys: * topicClassification, casting.

**Exports :** `FoundationalSource`, `ClassificationGatesDeps`, `ClassificationGatesResult`, `runClassificationGates`

### `pipeline-steps/analyst-context.ts` — 460 lignes

* ANALYST CONTEXT ASSEMBLY — everything that feeds the analyst prompt: * agent-memory + synapse injection → domain/canon blocks → editorial north * star → conflict-aware reasoning → pre-analyst scenario engine (CANA + * SCATTER, parallel) → innovator author detection → context-block assembly * → SARA compression → prior-failure feedback → evidence sufficiency * warning → positioning agent → slimRe

**Exports :** `AnalystContextDeps`, `buildRequiredCoverageBlock`, `AnalystContextResult`, `buildAnalystContext`

### `pipeline-steps/analyst-run.ts` — 282 lignes

* ANALYST EXECUTION — MoA (opt-in) → durable multipass → test-time scaling * (second candidate on strategic + budget headroom, best citation coverage * wins) → stats.analyst. * * `analysis` is returned — a successful opt-in MoA result is adopted, not * overwritten by the multipass fallback.

**Exports :** `AnalystRunDeps`, `AnalystRunResult`, `runAnalystExecution`

### `pipeline-steps/pre-critic-gates.ts` — 140 lignes

* PRE-CRITIC GATES — STEP 6a + 7 + 7a: structural editor review, citation * guard, deterministic claim-binding preflight. Sequential: the structural * editor may append feedback to fullContextBlock; the guard result is * returned for downstream citation counts.

**Exports :** `PreCriticGatesDeps`, `PreCriticGatesResult`, `runPreCriticGates`

### `pipeline-steps/critic-block.ts` — 604 lignes

* CRITIC BLOCK — STEP 7b: critic agent → critic panel → critic repair * (re-analysis adopted iff citation coverage holds, then BOTH evaluators * re-checked so the gate never consumes stale verdicts) → critic evidence * tool → outline critic → second gap-request round → self-correct * checkpoint → CoVe. * * Returns `analysis` (mutated when a repair is adopted), the decremented * `reAnalysisBudget`,

**Exports :** `CriticBlockDeps`, `CriticBlockResult`, `runCriticBlock`

### `pipeline-steps/post-critic-enrichment.ts` — 116 lignes

* POST-CRITIC ENRICHMENT — STEP 7c/7d/7e: reflective RAG self-evaluation, * cross-model consensus on controversial claims, inter-paper knowledge * graph. Three pure readers — distinct stats keys, no shared mutable state * → run concurrently (three LLM calls off the critical path).

**Exports :** `PostCriticEnrichmentDeps`, `runPostCriticEnrichment`

### `pipeline-steps/gap-fill.ts` — 505 lignes

* GAP FILL — orchestrator RE_ANALYZE + gap-aware evidence append + typed * research gaps + the blackboard `processGapRequests` consumer + * post-analyst enrichment checkpoint. * * All mutable cross-step state lives in `GapFillState` — the same object is * shared with the critic block so a gap-fill re-analysis triggered from * CRITIC/OUTLINE is actually adopted by the caller (a stale local copy wou

**Exports :** `GapFillState`, `GapFillDeps`, `createGapRequestProcessor`, `runGapFillStage`

### `pipeline-steps/evidence-graph-gaps.ts` — 74 lignes

Scout query derived from the unsupported claim text.

**Exports :** `EvidenceGapRequest`, `deriveEvidenceGapRequests`

### `pipeline-steps/citation-grounding.ts` — 144 lignes

* POST-RENDER CITATION + GROUNDING block. * Extracted from pipeline-v2.ts — identical semantics. Deterministic chain: * citation repair → NLI claim grounding (remove mode) → re-grounding if the * removal improved the score → quant SVG injection → citation filter. * * Returns the mutated HTML. The trailing `void generatePrintHTML` + * `runPostRenderQualityGates` stay with the caller — the quality-g

**Exports :** `CitationGroundingDeps`, `runPostRenderCitationAndGrounding`

### `pipeline-steps/da-veto.ts` — 54 lignes

* DA RE-CHECK VETO RULE — single site for "does the devil's-advocate veto * still stand after a recheck?". Shared by the post-sweep recheck * (style-sweep-recheck.ts) and the post-repair refresh (pipeline-v2.ts). * * The previous inline rule — `verdict === 'reject' || (major_revision && * strength < 20)` — had two holes: (a) a degraded recheck LIFTED a standing * veto (observed: strength 36→20, fa

**Exports :** `daVetoStands`

### `pipeline-steps/da-post-repair.ts` — 87 lignes

* POST-REPAIR DA REFRESH — extracted from pipeline-v2.ts (Sprint 47). * * The quality loop / self-correct can materially rewrite html AFTER the * sweep's DA verdict (aggressive citation repair, re-grounding). A verdict * tagged to a replaced artifact version is stale → the gate's * evaluation_freshness hard-fails, i.e. every run that needed a repair * auto-HELD regardless of quality. Re-judge the

**Exports :** `DaPostRepairDeps`, `runDaPostRepairRecheck`

### `pipeline-steps/debate-advocate.ts` — 230 lignes

* DEBATE (meta-analysis suppressed) + DEVIL'S ADVOCATE blocks. * Extracted from pipeline-v2.ts — identical semantics. * * These were closures capturing `runDebateStep`/`runDevilsAdvocateStep` flags * and writing to outer `debateResult`/`debateContext`. As steps they take the * flag as a call-time snapshot and RETURN the debate outputs — pipeline-v2 * owns `debateResult`/`debateContext` because the

**Exports :** `DebateAdvocateDeps`, `DebateOutcome`, `runDebateMetaBlock`, `runDevilsAdvocateBlock`

### `pipeline-steps/arbiter-foresight.ts` — 129 lignes

* EDITORIAL ARBITER → FORESIGHT (Monte Carlo) block — V2 path. * Extracted from pipeline-v2.ts — identical semantics. * * Ordering is load-bearing: the arbiter generates the scenarios first, then * foresight refines their probabilities with the simulation (previously * foresight ran first → 0 scenarios → always skipped). * * Returns `{ institutePosition, analysis }` — the caller reassigns both * b

**Exports :** `ArbiterForesightDeps`, `ArbiterForesightOutcome`, `runArbiterForesight`

### `pipeline-steps/post-analyst-checks.ts` — 587 lignes

* POST-ANALYST CHECKS — output guardrails + local judge → witness observe + * metaLoop (actuator: cuts optional downstream phases) → self-play → PRM * scoring → self-correct checkpoint → post-analyst diagnostic → blackboard * ANALYST→SCOUT gap detection → topic consistency → terminal distance → * orchestrator assess → self-correction (Reflexion retry, budget-capped). * * `analysis` flows in/out (s

**Exports :** `REPAIR_REANALYSIS_RESERVE`, `PostAnalystChecksDeps`, `PostAnalystChecksResult`, `runPostAnalystChecks`

### `pipeline-steps/post-render-extras.ts` — 191 lignes

* POST-RENDER EXTRAS — two small cohesive units shared by the V2 and non-V2 * paths (they were byte-identical duplicates in pipeline-v2): * * 1. `injectAdversarialSection` — renders the devil's advocate verdict as an * editorial section. Deterministic; additive injection → no html bump. * 2. `runPeerReviewAndPack` — flag-gated peer review + think-tank pack. * Parallelized: both read the same input

**Exports :** `injectAdversarialSection`, `applyEvidenceIdsAndProseCleanup`, `PeerReviewPackDeps`, `runPeerReviewAndPack`

### `pipeline-steps/post-hoc-injection.ts` — 112 lignes

* POST-HOC DATA INJECTION: Evidence Tiers + Adversarial Transparency + * Multi-Lens Convergence. Extracted from pipeline-v2.ts — identical semantics. * * These fields are computed/injected AFTER the analyst and critic run, then * attached to the analysis object so the renderer can display them. * Strategic reports only.

**Exports :** `PostHocInjectionOptions`, `runPostHocInjection`

### `pipeline-steps/hero-image-step.ts` — 68 lignes

* HERO IMAGE: Generate a conceptual abstract image for the publication. * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary.

**Exports :** `runHeroImageStep`

### `pipeline-steps/eval-rescore.ts` — 170 lignes

The critic result is also consumed downstream (repair instructions, * self-correct checkpoint) — returned so the caller can keep its local ref.

**Exports :** `EvalRescoreDeps`, `SPECULATIVE_OR_META_KEYS`, `staleAnalysisEvalKeys`, `failedAnalysisEvalKeys`, `rescoreStaleAnalysisEvals`

### `pipeline-steps/evaluators-trust.ts` — 498 lignes

* PARALLEL EVALUATORS + DETERMINISTIC TRUST SCORING block. * Extracted from pipeline-v2.ts — identical semantics. * * Six evaluators run via Promise.allSettled — pure readers of the post-repair * HTML writing distinct stats keys — then the deterministic trust score * consumes ALL of them (the scoring stays after the barrier). The scoring * block also injects the methodology note and the abstention

**Exports :** `EvaluatorsTrustDeps`, `runEvaluatorsAndTrust`

### `pipeline-steps/quality-loop.ts` — 138 lignes

* POST-RENDER QUALITY LOOP (Karpathy Loop pattern, inspired by Cortis). * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary. * * If trust score is below publication threshold after all quality gates, * retry citation repair + claim grounding with more aggressive settings. * This prevents HELD on reports that are just under the threshold (trust 55-64). * Cost: $0 (determin

**Exports :** `runPostRenderQualityLoop`

### `pipeline-steps/provider-lists.ts` — 262 lignes

* Provider name lists + the Providers union type. * Extracted from pipeline-v2.ts (Sprint 28c) — the source of truth for * provider names. pipeline-v2 re-exports everything for compatibility.

**Exports :** `Providers`, `SHS_PROVIDERS`, `AGRICULTURE_PROVIDERS`, `CRIMINOLOGY_PROVIDERS`, `EU_SCIENCE_PROVIDERS`, `ALL_PROVIDERS`, `NEWS_PROVIDERS`, `ACADEMIC_PROVIDERS`, `GOVERNMENT_PROVIDERS`, `DEFAULT_ACADEMIC_PROVIDERS`

### `pipeline-steps/branch-coverage.ts` — 117 lignes

Source ids this branch's scout produced — carried from the plan node.

**Exports :** `PlanBranch`, `BranchVerdict`, `BranchCoverageEntry`, `BranchCoverage`, `auditBranchCoverage`, `auditBranchCitations`, `evidenceNotesFor`

### `pipeline-steps/public-ops.ts` — 499 lignes

* Public ops layer: the scout/index/rank/read/analyst thin wrappers, * citation utilities, the legacy HTML renderer and the lineage tracker. * Extracted from pipeline-v2.ts (Sprint 28c) — pipeline-v2 re-exports the * public surface for backward compatibility; external callers * (scripts, tests, API routes) keep importing from pipeline-v2.

**Exports :** `invalidateScoutCache`, `getCacheStatus`, `scout`, `index`, `RankOptions`, `rank`, `read`, `validateTopicConsistency`, `analyst`, `activeRuns`, `citationGuard`, `dedupeCitations`

### `pipeline-steps/persistence-tail.ts` — 786 lignes

* PERSISTENCE TAIL — everything after the quality gates converge: * PUBLISHER (brief.create) → post-publish writes (parallel) → prediction * auditor → source reputation → experience bank → eval-freshness assert → * pipelineRun.update → durable seal → learning loop → skill bank → lesson * verifier → flag-gated post-run learning (parallel) → MOA weight update. * * Extracted verbatim from pipeline-v2

**Exports :** `PersistenceTailDeps`, `runPersistenceTail`

### `pipeline-steps/rank-enrichment.ts` — 681 lignes

* RANK + ENRICHMENT — STEP 4: rank → pertinence selection (quality bar + * elbow detection) → source-quality rerank → domain relevance filter → * abort-on-empty → adaptive enrichment reasoning (targeted re-scout, * refusal-retry with reformulation) → orchState source stats → evidence * registry. * * Refusal paths return `{ refused: true }`; the caller performs the early * pipeline return (idempote

**Exports :** `RankEnrichmentDeps`, `RankEnrichmentResult`, `runRankAndEnrichment`

### `pipeline-steps/reader-block.ts` — 478 lignes

* READER BLOCK — STEP 5: memory injection → parallel [reader V3, framing * (suppressed), quant, quant bridge] → stats → context compression → * evidence bank → fullText attach → orchestrator assess → self-correction * → DEEPEN → hypothesis judge → DPP synthesis → adaptive RAG → * round-table deliberation. * * `topSources` is mutated in place (fullText attach, DEEPEN). Everything * downstream needs

**Exports :** `ReaderBlockDeps`, `ReaderBlockResult`, `runReaderBlock`

### `pipeline-steps/relevance-screen.ts` — 71 lignes

* Late-addition relevance screen — shared by rank-enrichment and gap-fill. * * Sources that enter the corpus AFTER the initial topical screen (enrichment * merges, refusal-retry, snowball, blackboard gap requests, post-analyst * enrichment) were never scored against the research question. This helper * runs one bounded batch LLM call over the unscreened candidates and returns * the ids scored 0 (o

**Exports :** `RelevanceScreenResult`, `screenSourcesForRelevance`

### `pipeline-steps/render-editor.ts` — 242 lignes

* RENDER EDITOR step — extracted from pipeline-v2.ts (the renderEditorHtml * closure + mapProspectiveToRenderFormat). Identical semantics. * * The legacy `renderBriefHTML` fallback stays in pipeline-v2.ts (exported * API surface) and is injected via `renderBriefFallback` — no circular import.

**Exports :** `RenderEditorContext`, `mapProspectiveToRenderFormat`, `runRenderEditorStep`

### `pipeline-steps/scout-block.ts` — 552 lignes

* SCOUT BLOCK — STEP 1: durable-resume seedIds → deep planner (DAG scout + * mutable expansion + dynamic replan) → flat scout with speculative parallel * reformulations → witness observe → orchestrator assess → RE_SCOUT loop * with adaptive providers + stuck-loop detection. * * Returns `allSourceIds` + `planNodesForAudit` (consumed by the post-render * process audit). `orchState` and `stats` are m

**Exports :** `ScoutBlockDeps`, `ScoutBlockResult`, `runScoutBlock`

### `pipeline-steps/scout-enrichment-index.ts` — 246 lignes

* SCOUT ENRICHMENT + INDEX — the zone between the raw scout fan-out and the * rank: web fallback (only when critically low on sources), intelligent * scout (multi-lens), citation graph traversal, durable checkpoint, then * INDEX → EMBED → DEDUPLICATE. * * Perf: the eight web-fallback providers run concurrently — each only * contributes source ids; results are appended in deterministic provider * o

**Exports :** `ScoutEnrichmentIndexDeps`, `runScoutEnrichmentAndIndex`

### `pipeline-steps/scout-impl.ts` — 1327 lignes

* SCOUT provider fan-out: deadline-bounded parallel calls across ~100 * providers, with the provider-health circuit breaker recording each call. * Extracted from pipeline-v2.ts (Sprint 28c) — the public `scout()` wrapper * (governance assert + Redis cache) stays in pipeline-v2 and calls this.

**Exports :** `scoutImpl`

### `pipeline-steps/self-correct-checkpoint.ts` — 48 lignes

* SELF-CORRECT CHECKPOINT: QUALITY LOOP (final trust score). * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary.

**Exports :** `runFinalSelfCorrectCheckpoint`

### `pipeline-steps/style-sweep-recheck.ts` — 210 lignes

* STYLE GATES → COPY EDITOR → SIGNAL SWEEP → DA RE-CHECK. * Extracted from pipeline-v2.ts — identical semantics, one cohesive unit. * * Coupling rationale (why these three stay together): style gates post * `style_violation` signals consumed by the sweep; the sweep's revision editor * mutates html; the DA re-check re-judges the corrected artifact. Splitting * them would re-introduce the stale-eval

**Exports :** `runStyleSweepRecheck`

### `pipeline-steps/thesis-binding.ts` — 196 lignes

* Thesis-binding adherence — verify + routed repair. * * The central claim was contracted FROM the corpus upstream (best-supported * judged hypothesis). A verdict that exceeds it is speculation-as-thesis: * exactly what the DA later kills. `verifyThesisBindingStage` is a cheap * check; non-adherence is recorded on stats.thesisBinding and surfaced to * the gate diagnostics without blocking. * * `ru

**Exports :** `ThesisBindingDeps`, `verifyThesisBindingStage`, `runThesisBindingRepair`

### `pipeline-steps/time-budget.ts` — 89 lignes

* RUN-TIME HEADROOM — shared wall-clock guards for expensive escalation * steps (TTS second candidate, gap-fill re-analysis, DA rewrite). * * S34 live-run finding: a TTS candidate + an outline-critic re-analysis * stacked ~20min of extra analyst passes on top of a 35min scout, and the * run died at the 75min timeout mid-pass — zero artifact judged, ~$1.5 * burned. An escalation step that cannot fi

**Exports :** `runDeadlineAt`, `remainingRunMs`, `hasRunHeadroom`, `REPAIR_TAIL_RESERVE_MS`, `hasRunHeadroomWithReserve`

### `pipeline-steps/trust-score.ts` — 223 lignes

* CANONICAL TRUST SCORE — single deterministic composite consumed by both * the post-evaluator scoring (evaluators-trust.ts) and the post-repair * re-score (quality-loop.ts). They previously blended different weights and * applied different veto sets — the loop could re-inflate a score the * canonical pass had capped (missing criticPanel/editorial-floor vetoes). * * Semantics identical to the eval

**Exports :** `TrustComponents`, `TrustVetoes`, `TrustScoreResult`, `computeTrustScore`, `rescoreTrustFromStats`, `countDistinctCitedSources`

### `pipeline-steps/types.ts` — 49 lignes

* Shared context for post-render tail steps extracted from pipeline-v2.ts. * * Extraction contract: the orchestrator builds ONE context object after the * HTML render, each step mutates it in place (ctx.html = ..., ctx.stats.* = * ...), and the orchestrator reads back `ctx.html` / `ctx.selfCorrectRollbacks` * afterwards. This keeps the closure-coupled blocks testable as units without * changing th

**Exports :** `TailStepContext`

### `pipeline-steps/verification-block.ts` — 325 lignes

* POST-RENDER VERIFICATION block: symbolic verifier → NLI citation verifier → * active repair loop → LLM deep-check → fact-checker (+ fatal sanitization). * Extracted from pipeline-v2.ts — identical semantics. * * Returns the (possibly repaired) HTML. Repairs bump the html artifact * version through the injected `bumpHtmlArtifact`; every evaluator result is * tagged via `tagEval` so stale verdicts

**Exports :** `VerificationBlockDeps`, `runVerificationBlock`


## Orchestration & dispatch — 25 modules

### `adaptive-topology.ts` — 158 lignes

* Adaptive Topology Selection — NomosX * * Inspired by AdaptOrch (arXiv 2026): * - Automatically selects pipeline topology (parallel vs sequential vs hierarchical) * based on query complexity and task DAG analysis. * - Performance Convergence Scaling Law: when LLMs converge in capability, * orchestration dominates model selection. +12-23% on SWE-bench/GPQA. * * The NomosX pipeline is currently seq

**Exports :** `TopologyType`, `TopologyPlan`, `QueryComplexitySignals`, `selectTopology`, `extractComplexitySignals`

### `budget-manager.ts` — 223 lignes

* Global Budget Manager — Autonomous spending control * * Prevents runaway costs by tracking cumulative spending across: * - Per-pipeline costs (already tracked) * - Per-cycle costs (already tracked in think-tank-dispatcher) * - Per-day / per-month / per-year cumulative spending (NEW) * * Features: * - Monthly cap (default $100, configurable via NOMOSX_MONTHLY_BUDGET_USD) * - Daily cap (default $1

**Exports :** `BudgetStatus`, `recordSpend`, `getBudgetStatus`, `checkBudgetGate`, `getBudgetReport`

### `cadence-enforcer.ts` — 322 lignes

* NomosX Cadence Enforcer Agent * * Checks and enforces publication rate limits * Part of the Institutional Think Tank pipeline

**Exports :** `cadenceEnforcer`, `recordPublication`, `resetDailyCounters`, `resetWeeklyCounters`

### `conductor-orchestrator.ts` — 393 lignes

* Conductor — Deterministic Orchestration for Multi-Agent Workflows * * Inspired by: Microsoft Conductor (2026) — MIT License * Key innovation: YAML-defined workflows with Jinja2 routing templates, * zero tokens spent on orchestration, deterministic execution. * * In NomosX, this provides a lightweight alternative to the LLM-driven * Meta-Controller. Instead of spending LLM tokens on orchestration

**Exports :** `WorkflowStep`, `Workflow`, `ExecutionResult`, `WorkflowExecution`, `BRIEF_WORKFLOW`, `STRATEGIC_WORKFLOW`, `evaluateCondition`, `getNextSteps`, `pruneOptionalSteps`, `getWorkflow`

### `deep-planner.ts` — 386 lignes

* NomosX DEEP PLANNER — Research Question Decomposition * * LOT 2.1: Decomposes a research question into a DAG of sub-questions. * Each sub-question becomes a node with dependencies on parent nodes. * * The plan is executed by the pipeline (LOT 2.2) in topological order: * 1. Scout each node independently * 2. Inject parent results as context for child nodes * 3. If a node yields < 5 sources, expa

**Exports :** `ResearchNode`, `ResearchPlan`, `DeepPlannerResult`, `deepPlan`, `replanFromFindings`, `topologicalSort`, `getAncestorSourceIds`

### `graph-of-agents.ts` — 210 lignes

* Graph-of-Agents (GoA) — NomosX * * Inspired by: * - Graph-of-Agents (S15-02, ICLR 2026): Instead of invoking all N agents in a * Mixture-of-Agents setup, GoA selects the K most relevant agents based on * "model cards" (declared capabilities), evaluates pairwise response * relevance, and routes messages along a directed graph. This reduces cost * and latency while improving signal-to-noise over f

**Exports :** `AgentNode`, `AgentEdge`, `GoAConfig`, `DEFAULT_GOA_CONFIG`, `selectAgents`, `buildAgentGraph`, `poolResponses`

### `inquiry-funnel-utils.ts` — 257 lignes

* Inquiry Funnel — Shared utilities (single source of truth) * Used by inquiry-pipeline + inquiry-orchestrator only.

**Exports :** `normalizeTopicKey`, `countWordsHtml`, `getPipelineCostUsd`, `publicationTypeToDepth`, `depthToPublicationType`, `getCompletedAdversarialEvaluation`, `PipelineScores`, `isModerateTierEligible`, `extractPipelineScores`

### `inquiry-orchestrator.ts` — 1321 lignes

* Inquiry Orchestrator — Publication funnel (shared infrastructure) * ─────────────────────────────────────────────────────────────────── * * PRODUCT HIERARCHY: * PRIMARY → ThinkTankDispatcher (autonomous crons) * ADD-ON → Studio — on-demand, quota-based * * Flow: VALIDATE → RUN (inquiry-pipeline) → GATE → PERSIST * All paths MUST use runAndPublishInquiry().

**Exports :** `InquiryPublishSource`, `InquiryPublishStatus`, `InquiryPublishRequest`, `InquiryPublishResult`, `runAndPublishInquiry`, `runInquiryOnly`

### `inquiry-pipeline.ts` — 637 lignes

* Inquiry Pipeline — Unified publication runner * ────────────────────────────────────────────── * Wraps runPipeline to produce Inquiry + full pipeline artifacts. * * Funnel position: RUN step (called by inquiry-orchestrator for GATE → PERSIST).

**Exports :** `RunInquiryPipelineInput`, `InquiryPipelineResult`, `runInquiryPipeline`

### `orchestrator.ts` — 398 lignes

* NomosX ORCHESTRATOR AGENT — Adaptive Pipeline Controller * * Unlike a static sequential pipeline, the Orchestrator makes decisions * at each step and can loop back when quality is insufficient: * * 1. ASSESS — Evaluate source quality after SCOUT. Not enough? Re-scout with broader terms. * 2. DEEPEN — After READER, check if abstracts are sufficient. Need full-text? Trigger PDF extraction. * 3. CH

**Exports :** `OrchestratorAction`, `OrchestratorDecision`, `PipelineState`, `loadCalibratedThresholds`, `assessAfterScout`, `assessAfterReader`, `assessAfterAnalyst`, `assessAfterCriticalLoop`, `generateExpandedTerms`, `createPipelineState`, `recordDecision`

### `pipeline-context.ts` — 227 lignes

* Pipeline Blackboard — Shared context across all agents (2026 pattern). * * Inspired by the Blackboard architecture pattern: all agents read/write * to a shared context object. This breaks silos between SCOUT → RANK → * READER → ANALYST → EDITOR by allowing: * * - ANALYST to request targeted re-search from SCOUT via `requestSourceGap()` * - EDITOR to see gaps identified by ANALYST via `getFinding

**Exports :** `PipelineFinding`, `SourceGapRequest`, `PipelineBlackboard`, `PipelineContext`

### `pipeline-foresight.ts` — 161 lignes

* Foresight (Monte Carlo swarm) — shared between runPipelineCore and inquiry-pipeline.

**Exports :** `parsePriorProbability`, `roundPercentages`, `applySimulationToAnalysis`, `PipelineForesightInput`, `PipelineForesightResult`, `runPipelineForesight`

### `pipeline-progress.ts` — 208 lignes

* NomosX Pipeline Progress Streaming * * P2/9: EventEmitter-based progress tracking for pipeline execution. * Enables SSE streaming of step-by-step updates to the client.

**Exports :** `PipelineStep`, `PipelineProgressEvent`, `setProgressPersistenceHook`, `emitProgress`, `onProgress`, `createProgressStream`

### `pipeline-types.ts` — 1241 lignes

* PIPELINE TYPES — Typed stats, lineage, and shared interfaces * * Replaces `stats: any` with a fully typed PipelineStats interface. * Every pipeline step writes to a well-defined structure.

**Exports :** `EvalVersionTag`, `PipelineStats`, `DataLineage`, `createLineageTracker`, `recordTransformation`, `exportLineageJSON`, `APACitation`, `formatAPA`, `renderAPAHtml`

### `pipeline-v2.ts` — 2113 lignes

Cohere reranking, batch ops, governance, lineage tracking. * * SCOUT â†’ INDEX â†’ RANK â†’ READER â†’ ANALYST â†’ EDITOR â†’ GUARD â†’ PUBLISHER

**Exports :** `PipelineCoreOptions`, `runFullPipeline`, `ReportFormat`, `StrategicPipelineOptions`, `runStrategicPipeline`, `runPipeline`, `runIntelligenceSweep`

### `process-audit.ts` — 110 lignes

* Process Audit — the PING taxonomy (arXiv 2601.22984) applied to our * trajectory. End-to-end evaluation misses hallucinations that originate in * intermediate steps. PING splits them into four types; we cover three * deterministically (Grounding is already covered by NLI/claim-grounding): * * - INTENT: did the planner decompose the actual question, or drift? * - PROPAGATION: did early errors/thi

**Exports :** `ProcessAuditResult`, `auditProcessTrace`

### `publication-generator.ts` — 613 lignes

* NomosX Publication Generator Agent * * @deprecated New production paths MUST use runAndPublishInquiry() from inquiry-orchestrator. * This module remains for legacy signal-template generation only.

**Exports :** `PublicationGeneratorOutput`, `selectPublicationType`, `generatePublication`

### `publication-reserve.ts` — 151 lignes

_(no docstring)_

**Exports :** `ReserveArtifact`, `ReserveCertificate`, `certifyForReserve`, `validateReserveCertificate`, `releaseReservedPublication`

### `run-plan.ts` — 119 lignes

* RUN PLAN — the orchestrator's up-front execution governor. * * Today every stage re-derives its own admission from scattered headroom * guards (reserve, corpus cap, P2 tiers, fact-check windows). Decisions * are reactive: a stage discovers at its turn that the budget is gone and * degrades locally — which is how live runs ended with verification * starved (566s < 600s flat gate → 0/21 claims LLM

**Exports :** `RunProfile`, `RunPlan`, `RunPlanInput`, `computeRunPlan`

### `signal-detector.ts` — 822 lignes

* NomosX Signal Detector Agent * * Detects meaningful signals from newly ingested sources * Part of the Institutional Think Tank pipeline * * SOCIAL SIGNAL INTEGRATION (2026): * Social media signals (Reddit, Hacker News, Bluesky) feed into the * signal detection pipeline as a SEPARATE FLOW — they never enter the * SCOUT→INDEX→RANK evidence pipeline. This prevents social media noise * from contamin

**Exports :** `SignalDetectorOutput`, `signalDetector`, `NewsSignalInput`, `processNewsSignals`, `fetchSocialSignals`, `processSocialSignals`

### `signals.ts` — 408 lignes

* SIGNAL BUS + MISSION — the collective-intelligence substrate. * * Inspired by stigmergic coordination (SBP — Stigmergic Blackboard Protocol): * agents do NOT message each other directly. They post *needs* on the shared * blackboard as typed signals with intensity and decay; any agent that has a * registered resolver for that type senses the signal at the next sweep * checkpoint and resolves it.

**Exports :** `SignalType`, `AgentSignal`, `SignalResolution`, `SignalResolver`, `BatchSignalResolver`, `MissionTargets`, `Mission`, `SignalBus`, `PersistentSignalBus`, `rehydrateSignalBus`

### `think-tank-dispatcher.ts` — 1517 lignes

* Think Tank Dispatcher — Autonomous brain (PRIMARY product path) * ───────────────────────────────────────────────────────────── * Studio is a paid add-on. This module is the core NomosX loop: * * SENSE → DECIDE → DISPATCH → runAndPublishInquiry() * * Modes: * • breaking — 2×/day radar + Editor-in-Chief (auto-scan cron) * • weekly — editorial plan + signal fallback (generate-briefs cron) * * Cron

**Exports :** `selectFormatFromSignal`, `ThinkTankCycleMode`, `ThinkTankStrategy`, `ThinkTankDispatchItem`, `ThinkTankCycleProgress`, `ThinkTankCycleOptions`, `ThinkTankDispatchOutcome`, `ThinkTankCycleResult`, `CadenceState`, `getWeeklyPublicationMax`, `getCadenceState`, `verticalHasCapacity`

### `think-tank-pack.ts` — 517 lignes

* Think Tank Quality Pack — NomosX * * Pousse un brief académique au niveau d'une note de think tank renommée * (RAND, Brookings, Chatham House, IFRI) en ajoutant : * 1. Recommandations actionnables par stakeholder * 2. Options / trade-offs explicites * 3. Analyse économique et régulatoire * 4. Relecture éditoriale (anti-répétitions, anti-coquilles, ton) * * Inspirations : * - Takshashila Scholar

**Exports :** `Stakeholder`, `Recommendation`, `PolicyOption`, `PolicyRecommendations`, `PolicyEconomics`, `EditorialPolish`, `ThinkTankPackOptions`, `generatePolicyRecommendations`, `generatePolicyEconomics`, `polishEditorial`, `augmentThinkTankHtml`

### `topic-classifier.ts` — 924 lignes

* NomosX UNIFIED TOPIC CLASSIFIER * * Single source of truth for topic → domain → researchers → vertical routing. * Replaces the 3 independent keyword-based classification systems: * - researcher-ownership.ts detectOwners() * - signal-detector.ts classifyVertical() * - smart-provider-selector.ts detectDomain() * * Architecture: LLM-based classification with rule-based fast path fallback. * The LLM

**Exports :** `TopicClassification`, `DomainDomainScore`, `AssignedResearcher`, `classifyTopic`, `classifyTopicSync`, `classifyVerticalUnified`, `detectDomainUnified`, `getPrimaryResearcherUnified`, `getProvidersForTopic`

### `topic-radar.ts` — 800 lignes

* NomosX TOPIC RADAR V3 — Maximum Coverage Breaking Topic Detection * * 6 parallel source sweeps, <35 seconds total: * * 1. GDELT — 14 verticals: geopolitics, AI, climate, health, finance, * energy, trade, cyber, biotech, emerging-mkts, social, science, EU, digital * 2. RSS Elite — 30 feeds: think tanks + news wires + central banks + policy orgs * 3. Academic — OpenAlex trending + arXiv (cs/econ/q

**Exports :** `RadarTopic`, `RadarSweepResult`, `runTopicRadar`


## Editorial & planning — 21 modules

### `author-innovator-detector.ts` — 361 lignes

* NomosX Author Innovator Detector * * Identifies the most innovative, cross-domain, and heterodox authors * from a pool of sources. Unlike traditional h-index ranking, this system * looks for: * * 1. CITATION VELOCITY — authors whose recent work is being cited faster than their older work * 2. CROSS-DOMAIN IMPACT — authors who publish across multiple disciplines * 3. HETERODOX SIGNALS — authors w

**Exports :** `AuthorProfile`, `InnovatorDetectionResult`, `detectInnovatorAuthors`, `generateInnovatorPromptBlock`

### `casting-agent.ts` — 207 lignes

* CASTING AGENT — Assemble a cross-domain reasoning team for productive friction. * Public briefs expose lenses (domains), not PhD personas.

**Exports :** `castingAgent`

### `debate-agent.ts` — 288 lignes

* NomosX DEBATE Agent — Adversarial Deliberation * * A dedicated agent that generates the STRONGEST possible counter-arguments * to any analysis. Unlike the adversarial reviewer in Critical Loop (which * reviews a draft), this agent operates at the EVIDENCE level: * * 1. Takes the analysis question + sources + readings * 2. Identifies the dominant thesis * 3. Constructs the STEEL MAN of the opposi

**Exports :** `DebateArgument`, `DebatePosition`, `DebateResult`, `debateAgent`

### `domain-classifier.ts` — 201 lignes

* Domain Classification Agent * * Classifie automatiquement les sources dans un ou plusieurs domaines * basé sur title, abstract, topics et JEL codes

**Exports :** `classifySourceDomains`, `classifyBatchSources`, `classifyUnclassifiedSources`

### `domain-expert.ts` — 1666 lignes

* Domain Expert Interface - Expertise-based personas (no institutional claims) * * Replaces PhD Researcher with domain-specialized experts * Each expert has verifiable expertise without institutional affiliations

**Exports :** `DomainExpert`, `ExpertAnalysis`, `DOMAIN_EXPERTS`, `getExpertById`, `getExpertsByDomain`, `getAllExperts`, `DomainExpertLearning`, `getExpertLearning`, `updateExpertLearning`, `getAdaptedMethodologies`

### `editor-agent.ts` — 1391 lignes

* EDITOR AGENT — Publication-Grade HTML Rendering * * Produces think-tank quality HTML publications with: * - Branded header with metadata bar (date, sources, trust score, reading time) * - Executive summary card with key findings * - Professional typography and spacing * - APA 7th edition citations with DOI links * - Source distribution visualization * - Responsive design for print and screen * -

**Exports :** `dedupeCitations`, `renderProfessionalBriefHTML`, `renderProfessionalStrategicHTML`

### `editor-in-chief.ts` — 455 lignes

* NomosX EDITOR-IN-CHIEF — LLM Triage for Breaking Topics * * The "DECIDE" step in the DETECT → DECIDE → DELEGATE architecture. * Takes raw RadarTopic[] from TopicRadar and decides: * * 1. Is this NEW? (not already covered in recent publications) * 2. Is this URGENT? (time-sensitive, breaking) * 3. Do we have an ANGLE? (can our researchers add value?) * 4. What FORMAT? (brief vs strategic) * 5. WH

**Exports :** `EditorialDecision`, `EditorialTriageResult`, `editorialTriage`

### `editorial-arbiter.ts` — 464 lignes

* EDITORIAL ARBITER — Institute position after evidence, debate, and foresight. * Output is position-first: verdict + scenario distribution + traceability.

**Exports :** `ArbiterInput`, `editorialArbiter`

### `editorial-config.ts` — 81 lignes

* Editorial V2 feature flag — position-first, foresight-in-core pipeline reorder. * When false: legacy step order (editor at step 8).

**Exports :** `isEditorialV2Enabled`, `getPipelineMaxBudgetUsd`, `NOMOS_EDITORIAL_LINE`, `NOMOS_EDITORIAL_LINE_SHORT`

### `editorial-planner.ts` — 385 lignes

* NomosX EDITORIAL PLANNER — Autonomous Topic Selection & Agenda * * Like France Stratégie's editorial committee, this agent: * 1. Analyzes Knowledge Graph trends to find emerging topics * 2. Detects coverage gaps (important topics never analyzed) * 3. Identifies stale briefs that need revisiting (data changed) * 4. Proposes a prioritized editorial agenda * 5. Self-commissions analyses when confid

**Exports :** `EditorialProposal`, `EditorialReason`, `EditorialAgenda`, `planEditorialAgenda`

### `editorial-scenarios.ts` — 75 lignes

* Ensure ≥2 scenarios exist before Monte Carlo foresight (Editorial V2). * Analyst multipass does not emit scenarios — derive from consensus / debate / implications.

**Exports :** `ensureEditorialScenarios`

### `editorial-types.ts` — 226 lignes

* Editorial V2 — position-first brief structure. * Detected subject → cross-domain team → scenarios → institute position.

**Exports :** `EditorialDimension`, `CastTeamMember`, `CastingResult`, `ScenarioOutlook`, `ProspectiveFramework`, `InstitutePosition`, `CentralScenarioDecision`, `resolveCentralScenario`, `centralScenarioIssues`, `PositionFirstBriefInput`, `dimensionsFromClassification`, `formatDomainLabel`

### `enrichment-reasoner.ts` — 380 lignes

* NomosX ENRICHMENT REASONER — Adaptive Evidence Sufficiency Assessment * * Replaces fixed thresholds (minSourceCount, minEvidenceCount) with * LLM-based reasoning about whether the current evidence base is sufficient * for the specific topic, domain, and publication format. * * This is NOT a critique layer — it does not evaluate output quality. * It is an ENRICHMENT DECISION layer: it decides whe

**Exports :** `EnrichmentVerdict`, `EnrichmentAssessment`, `EvidenceGap`, `MetaCognitiveState`, `buildMetaCognitiveState`, `formatMetaCognitiveBlock`, `assessEvidenceSufficiency`

### `nomos-voice.ts` — 176 lignes

* nomos-voice.ts — The editorial DNA of NomosX. * * NomosX is neither McKinsey, nor RAND, nor Institut Montaigne, nor Harvard. * It is the institute that binds order, verification, and scenarios into a * position worth defending. "From Chaos to Nomos" is not a tagline — it is * the movement every report must perform. * * This file is the single source of truth for the NomosX editorial voice. * It

**Exports :** `NOMOS_EDITORIAL_MANIFESTO`, `NOMOS_DEFAULT_LABELS`, `NOMOS_WRITING_RULES`

### `perspective-questions.ts` — 101 lignes

* Perspective-Guided Question Generation — Co-STORM method (EMNLP 2024). * * Stanford's STORM showed that directly prompting an LLM to "ask questions" * produces shallow, redundant queries. Their fix: first discover distinct * expert PERSPECTIVES on the topic, then generate questions each perspective * would actually ask. This systematically covers dimensions that a generic * "enhance this query"

**Exports :** `PerspectiveQuestionResult`, `generatePerspectiveQueries`

### `policy-council.ts` — 211 lignes

* POLICY COUNCIL — NomosX * * Conseil deliberatif multi-perspectives a la maniere de : * - Claude Policy Council (adamconner) : 19+ agents votant * - LLM Council Policy Ideation (danielrosehill) : 6 lenses + chairman * - CouncilVerse (Relay-Launch) : formations pretes a l'emploi * * Objectif : obtenir une recommandation politique eprouvee par plusieurs * ideologies et specialites, avec desaccords

**Exports :** `PolicyPersona`, `PolicyPerspective`, `PolicyReview`, `PolicyRecommendation`, `PolicyCouncilReport`, `PolicyCouncilOptions`, `runPolicyCouncil`, `renderPolicyCouncil`

### `positioning-agent.ts` — 227 lignes

* Positioning Agent — editorial differentiation vs the field. * * What a senior editor does before green-lighting a piece: "what has the * competition already published on this, and what do we add?" Publications * that re-synthesize the field consensus are commodity; the differentiator * is occupying a position nobody else holds — with better evidence. * * Pipeline: * 1. COMPETITOR CORPUS: retriev

**Exports :** `CompetitorPiece`, `DifferentiationDirective`, `PositioningBrief`, `buildPositioningBrief`

### `research-agenda.ts` — 147 lignes

* NomosX RESEARCH AGENDA — the editorial desk layer. * * The radar finds what is happening; the triage picks what is publishable. * Neither decides what the INSTITUTION should be covering. This module is * that missing layer: a deterministic, DB-grounded account of domain * coverage over a trailing window, the flagship questions each domain has * answered best, and the deficit signal the Editor-in

**Exports :** `DomainCoverage`, `ResearchAgendaContext`, `buildResearchAgendaContext`, `agendaPriorityBoost`

### `round-table.ts` — 336 lignes

* Round-Table Deliberation (ReConcile-style) — NomosX * * Inspired by: * - ReConcile (ACL 2024): Multi-model multi-agent round table conference * with confidence-weighted voting. Outperforms GPT-4 on three datasets. * - Reasoning Jury (arXiv 2026): Jury of open-weight models outperforms * frontier models at 16-88% of cost. * - LLM-jury (arXiv 2026): Agreement structure as verification signal. * -

**Exports :** `DeliberationParticipant`, `DeliberationRound`, `DeliberationResult`, `deliberate`

### `schools-of-thought.ts` — 174 lignes

* Schools of Thought — rival epistemic traditions per contested domain. * * A PhD-level debate is not "thesis vs generic counter" — it is a clash of * established schools with named positions, canonical claims, and known * critiques. This registry gives the debate agent real opponents: the * steel-man is built FROM a school's position, not invented on the spot. * * Coverage: the most contested dom

**Exports :** `SchoolOfThought`, `SCHOOLS_OF_THOUGHT`, `buildSchoolsBlock`

### `source-reputation-agent.ts` — 295 lignes

* NomosX SOURCE REPUTATION AGENT — Persistent Source Quality Learning * * P3-M: Sources that consistently contribute to high-quality analyses * should have their qualityScore boosted over time. Sources that are * consistently ignored or associated with low-trust outputs should decay. * * This creates a self-improving source library where the best sources * rise to the top automatically. * * Proces

**Exports :** `SourceReputation`, `ReputationUpdateResult`, `recordSourceUsage`, `updateSourceReputations`, `getTopReputationSources`, `getSourceReputationReport`


## Analyst & drafting — 31 modules

### `adaptive-rag.ts` — 589 lignes

* Adaptive RAG — NomosX Sprint 6 (Gap 4) * * RAG adaptatif avec reflection tokens et corrective retrieval. * Inspiré de : * - Self-RAG (ICLR 2024, arxiv 2310.11511) — reflection tokens pour contrôle à l'inference * - CRAG (arxiv 2401.15884) — retrieval evaluator + web search fallback * - Adaptive RAG (NAACL 2024) — adaptive retrieval strategy * * Le problème : * Le retrieval NomosX est *pipeline-f

**Exports :** `ReflectionToken`, `RetrievalConfidence`, `RetrievalEvaluation`, `CorrectiveAction`, `AdaptiveRetrievalResult`, `AdaptiveRAGConfig`, `predictRetrieveToken`, `evaluateRetrieval`, `critiqueSupport`, `adaptiveRetrieve`, `buildReflectionTokenHint`, `SourceForAssessment`

### `analysis-repair.ts` — 75 lignes

_(no docstring)_

**Exports :** `applyAnalysisRepair`, `criticReviewText`, `repairImproves`

### `analysis-review-text.ts` — 93 lignes

* Plain-text analysis bundle for epistemic review before final HTML render (Editorial V2).

**Exports :** `buildAnalysisReviewText`

### `analyst-multipass.ts` — 2004 lignes

* ANALYST Agent V3 — Prospective Multi-Pass Analysis * * NomosX does not produce analyses of topics. It isolates the strongest, * most non-obvious cross-domain causal chain, refutes it until it breaks * or holds, extrapolates its trajectory toward a dated future, and takes * ONE position — rendered in institute prose where the machinery stays * invisible. * * PASS 1 — FRICTION MAPPING: Extract mec

**Exports :** `TemporalStatus`, `FrictionMap`, `StressTestMap`, `CausalLink`, `ProspectiveNote`, `AnalysisOutput`, `MultiPassAnalysis`, `ThematicMap`, `ContradictionMap`, `analystAgentV3`

### `context-primer.ts` — 443 lignes

* NomosX CONTEXT PRIMER — Institutional Memory Injection * * Before every analysis, this agent: * 1. Queries the Knowledge Graph for related concepts * 2. Retrieves prior briefs on the same/similar topics * 3. Identifies what has changed since last analysis * 4. Builds a structured context block for the ANALYST * * This is what transforms NomosX from a stateless tool into a persistent think tank.

**Exports :** `PrimedContext`, `primeContext`

### `copy-editor.ts` — 130 lignes

* COPY EDITOR — NomosX * * The missing newsroom role: style gates and the editorial panel DETECT prose * defects (AI tells, filler, clichés) but nothing fixed them. This agent turns * detections into surgical, verified edits. * * Design (edit-list contract, not free-form rewrite): * - The LLM receives the flagged phrases + editorial findings and returns a * list of { find, replace, reason } edits

**Exports :** `CopyEditResult`, `RawEdit`, `applySurgicalEdits`, `copyEditHtml`

### `cross-source-signals.ts` — 266 lignes

* Cross-Source Signal Detection — NomosX * * Inspired by: * - Signal Hunter: Cross-source signals with 1.5x multiplier for topics * in 2+ sources, velocity tracking (accelerating, new, fading, steady) * - Breaking News Monitor: Multi-source corroboration (2+ sources = higher confidence) * - SignalForge: 3-stage LLM pipeline with 6-factor scoring * - GlobalPulse: 35+ data layers with AI-powered ris

**Exports :** `NewsItem`, `SignalCluster`, `clusterByTopic`, `detectCrossSourceSignals`, `formatSignalClusters`

### `dpp-synthesis.ts` — 350 lignes

* DPP (Determinantal Point Process) Synthesis — NomosX * * Inspired by: * - "Principled Content Selection for Multi-Document Summarization" (ACL 2025): * Three-step approach: (1) reduce documents to atomic key points, * (2) use DPP to select diverse key points, (3) rewrite to final summary. * - Addresses "lost in the middle" phenomenon in LLMs. * - Increases source coverage on multi-document tasks

**Exports :** `AtomicKeyPoint`, `DPPSelection`, `extractAtomicKeyPoints`, `selectDiverseKeyPoints`, `formatKeyPointsForAnalyst`

### `hall-detect.ts` — 301 lignes

* HallDetect — Lightweight Reference-Free Hallucination Detection (NomosX) * * Inspired by: * - HallDetect (S15-07, arXiv 2026): Decomposed entailment with a contrastive * formulation for reference-free hallucination detection. Runs as a * lightweight complement to mDeBERTa-v3 NLI, catching internal * contradictions and unsupported claims without an LLM in the loop. * * Architecture: * 1. `decompo

**Exports :** `FlaggedClaim`, `ContradictionPair`, `UnsupportedClaim`, `HallucinationScore`, `decomposeClaims`, `detectInternalContradictions`, `detectUnsupportedClaims`, `hallDetect`

### `intelligent-scout.ts` — 1033 lignes

* NomosX Intelligent Scout — Multi-lens adaptive retrieval. * * Replaces the "collect everything" approach with a targeted, multi-lens strategy * that finds both consensus sources AND eclectic/divergent material for scenario planning. * * Inspired by: * - AutoSearch (2026): Adaptive search depth — stop when enough evidence * - EACL 2026: Exploration-exploitation bandit for sub-query selection (+35

**Exports :** `LensType`, `SearchLens`, `LensResult`, `IntelligentScoutResult`, `generateSearchLenses`, `LensBandit`, `AdaptiveDepthConfig`, `assessSufficiency`, `computeDiversityScore`, `computeConsensusScore`, `computeScenarioRichness`, `SourceAuthority`

### `macro-refresh.ts` — 147 lignes

_(no docstring)_

**Exports :** `MacroRefreshResult`, `refreshMacroSeries`

### `nestbrowse.ts` — 389 lignes

* NESTBROWSE: Nested Browser-Use for Deep Web Access * * Based on: ACL 2026 "NestBrowse: Nested Browser-Use Agents for Deep Web * Reasoning" * * A minimal and complete browser-action framework that decouples interaction * control from page exploration. Enables access to deep web content beyond * what API snippets provide. * * Two-layer architecture: * - **Outer agent**: high-level reasoning (what

**Exports :** `BrowserAction`, `BrowserResult`, `NestBrowseSession`, `NestBrowseConfig`, `DEFAULT_NESTBROWSE_CONFIG`, `createSession`, `executeAction`, `exploreUrl`, `batchExplore`

### `novlangue-detector.ts` — 168 lignes

* Novlangue Detector — Deterministic euphemism & semantic drift scanner. * * Pillar 6 made real: "Combat novlangue, guard the truth." * This module scans publication HTML for known euphemisms, bureaucratic * jargon, and semantic drift patterns. It is DETERMINISTIC (code, not LLM) * per the NomosX invariant: "Les garde-fous sur les chiffres sont * déterministes (code), jamais confiés à un LLM." * *

**Exports :** `NovlangueMatch`, `NovlangueDetectionResult`, `detectNovlangue`

### `originality-check.ts` — 128 lignes

* Originality Check — detects close paraphrasing / plagiarism of source abstracts. * * Compares the generated analysis text against source abstracts using * trigram overlap (a fast, deterministic proxy for textual similarity). * High overlap → the analysis may be regurgitating source text rather than * synthesizing it.

**Exports :** `OriginalityResult`, `checkOriginality`

### `primary-data-synthesizer.ts` — 233 lignes

* PRIMARY DATA SYNTHESIZER — NomosX * * Intègre des données primaires (entretiens d'experts, enquêtes, mémos, * datasets, observations terrain) dans un brief de think tank. * * Inspirations : * - Harvard Kennedy School — primary evidence in policy memos * - RAND — structured interview synthesis and Delphi panels * - Brookings — field research and expert quotes

**Exports :** `PrimarySourceType`, `PrimarySourceInput`, `SynthesizedFinding`, `ExpertQuote`, `PrimaryDataSynthesis`, `PrimaryDataOptions`, `synthesizePrimaryData`, `renderPrimaryDataSection`

### `quant-agent.ts` — 445 lignes

* NomosX QUANT Agent — Primary Data Exploitation * * The differentiator vs. traditional think tanks: instead of citing that * "a dataset exists", this agent FETCHES the actual numbers from T1 * primary-data providers (energy-charts, RTE, Treasury, Eurostat…), * computes trends/variations, and injects a QUANTITATIVE EVIDENCE block * into the Analyst prompt — plus chart-ready series for the Editor.

**Exports :** `QuantSeries`, `QuantFact`, `QuantOutput`, `quantAgent`

### `query-enhancer.ts` — 304 lignes

* QUERY ENHANCER * * Transforms user queries into optimized search queries for academic APIs. * * Features: * - Multi-language support (auto-detect, translate to English) * - Query expansion (synonyms, related terms) * - Multi-query generation (different perspectives) * - Domain-specific optimization * * @example * input: "quels sont les impacts de l'IA sur le travail dans les 30 prochaines années

**Exports :** `EnhancedQuery`, `enhanceQuery`, `generateSearchQueries`, `quickEnhance`

### `radar-innovations.ts` — 761 lignes

* NomosX RADAR INNOVATIONS — 2026 State-of-the-Art Signal Detection * * Implements 6 innovations from recent research: * * C: Temporal Signal Trajectories (ACL 2026 — Navasartian) * Classifies topics as emerging/bursting/stable/fading based on * mention velocity across runs. Burst ≠ emerging (bursts signal * consolidation, not early detection). * * A: BERTrend Velocity Scoring (RTE-France 2024) *

**Exports :** `SignalTrajectory`, `TopicVelocity`, `computeTopicVelocities`, `AnticipatoryOutlier`, `detectAnticipatoryOutliers`, `SourceDomain`, `CredibilityScore`, `classifySourceDomain`, `scoreCredibility`, `getCredibilityThreshold`, `ProviderRoute`, `selectProviders`

### `reader-agent-v3.ts` — 1250 lignes

* READER Agent V3 — Full-Text Deep Extraction * * Upgrades over V2: * 1. PDF FULL-TEXT: Downloads and parses PDFs via pdf-parse (already in deps) * 2. CHUNKED READING: Splits long papers into sections, reads each * 3. QUANTITATIVE EXTRACTION: Effect sizes, p-values, sample sizes, confidence intervals * 4. CROSS-REFERENCE: Identifies which sources cite each other * 5. STRUCTURED OUTPUT: Rich Readin

**Exports :** `QuantitativeData`, `Mechanism`, `ReadingResultV3`, `readerAgentV3`, `storeSourceChunks`

### `realtime-data-hub.ts` — 1301 lignes

* NomosX REAL-TIME DATA HUB — Multi-Domain Live Intelligence * * Aggregates live data from 12 free public APIs covering ALL 22 PhD domains: * * Economics/Finance: FRED (Federal Reserve) — rates, inflation, unemployment, housing, trade * ECB (European Central Bank) — EUR/USD, MRO rate, Euro area GDP * Health/Biotech: WHO Disease Outbreak News — epidemic alerts worldwide * Climate/Energy: Open-Meteo

**Exports :** `IndicatorCategory`, `RealTimeIndicator`, `RealTimePulse`, `MarketAlert`, `buildRealTimeContextBlock`, `fetchRealTimePulse`

### `refrain.ts` — 173 lignes

* REFRAIN — Adaptive Early-Stopping for Chain-of-Thought Reasoning * * Based on: ACL 2026 "REFRAIN: Adaptive Early-Stopping for LLM Reasoning" * * Key insight: LLMs often "overthink" — continuing to reason after they've * already converged on an answer. REFRAIN detects convergence and stops early, * reducing token usage by 20-55% without sacrificing accuracy. * * In NomosX, this applies to: * 1. A

**Exports :** `RefrainConfig`, `DEFAULT_REFRAIN_CONFIG`, `RefrainState`, `createRefrainState`, `shouldStopEarly`, `estimateTokenSavings`

### `revision-controller.ts` — 562 lignes

* REVISION CONTROLLER — NomosX * * The collective-intelligence loop the pipeline was missing: when the * publication gate returns `revise` or `hold`, its failures are posted as * typed signals onto a SignalBus, and registered resolvers resolve them — * ordered by the bus's goal-directed priority (signals serving unmet mission * targets first), not by a hardcoded ladder. * * Resolvers (registered h

**Exports :** `RevisionInput`, `RevisionResult`, `reviseForGate`, `RegenDecision`, `daFailureSignature`, `shouldRegenerate`, `attemptScore`, `buildFailureFeedback`

### `revision-editor.ts` — 85 lignes

* REVISION EDITOR — NomosX * * The content-level counterpart of the copy editor: when the publication gate * or the Devil's Advocate finds substantive defects (fatal challenges, weak * argumentation, overclaims), this agent produces surgical {find, replace} * edits that address them — qualify overstated conclusions, add the missing * caveat, name the counter-argument — without rewriting the docume

**Exports :** `RevisionEditResult`, `reviseForFindings`

### `sara-compression.ts` — 230 lignes

* SARA — Selective and Adaptive RAG with Context Compression (NomosX) * * Inspired by: * - SARA (S15-04, ACL 2026): Combines natural-language snippets (preserving * entities, numerical values, and named terms verbatim) with semantic * compression (dropping redundant sentences to broaden coverage) under a * fixed token budget. Outperforms pure-extractive and pure-compressive * baselines while stayi

**Exports :** `CompressedContext`, `extractSnippets`, `semanticCompress`, `saraCompress`

### `semantic-engine.ts` — 905 lignes

* NomosX Semantic Engine * * Replaces keyword/n-gram matching with real vector embeddings. * Uses OpenAI text-embedding-3-small (1536 dims) for: * * 1. Source embedding — embed title+abstract at ingestion time * 2. Query embedding — embed search queries for semantic retrieval * 3. Cosine similarity — rank sources by true semantic relevance * 4. Hybrid scoring — combine semantic + keyword + metadat

**Exports :** `embedText`, `embedTextDetailed`, `embedBatch`, `embedBatchDetailed`, `cosineSimilarity`, `embedSource`, `embedSourcesBatch`, `semanticSearch`, `reciprocalRankFusion`, `sparseSearch`, `hybridSearch`, `HybridRelevanceScore`

### `strategic-analyst-agent.ts` — 1153 lignes

* STRATEGIC ANALYST Agent * Produces comprehensive 10-15 page Strategic Reports with: * - Executive Summary * - Deep Literature Review * - Methodology Assessment * - Thematic Analysis * - Stakeholder Impact Matrix * - Scenario Planning * - Policy Recommendations * - Implementation Roadmap

**Exports :** `StrategicAnalysisOutput`, `backfillMissingAnalyticalFields`, `strategicAnalystAgent`

### `structural-editor.ts` — 272 lignes

* NomosX STRUCTURAL EDITOR — Storyline Review * * Think tanks like McKinsey, BCG, France Stratégie enforce a strict * narrative structure: every section has a "governing thought" (key message), * supporting evidence, and a "so what" (implication). * * This agent reviews the analysis JSON BEFORE rendering to HTML and: * 1. Validates narrative arc (does the story flow logically?) * 2. Ensures each s

**Exports :** `SectionReview`, `StructuralReviewResult`, `structuralEditorReview`, `buildSectionInventory`

### `style-gates.ts` — 207 lignes

* NomosX STYLE GATES — Regex-based quality enforcement * * LOT 5.1: Enforce editorial voice standards on generated HTML. * Each gate returns a violation list — the pipeline can use these * to trigger auto-revision or flag for human review. * * Gates: * - G1: No "delves into" / "sheds light" / "navigates" / "underscores" * - G2: No "it is worth noting" / "it should be noted" / "importantly" * - G3:

**Exports :** `StyleViolation`, `runStyleGates`, `runNumericalGate`

### `style-judge.ts` — 278 lignes

* STYLE JUDGE — NomosX * * Agent intelligent qui selectionne, critique et affine le style editorial. * Pas un simple profil statique : il lit la question, les sources, le domaine, * l'audience et le draft, puis juge quelle voix think tank est la plus crédible. * * Inspirations : * - LLM-Rubric (Microsoft) : evaluation multi-dimension avec calibration * - Rulers (LabRAI) : rubriques verrouillees et

**Exports :** `StyleJudgment`, `StyleScore`, `StyleCritique`, `IntelligentStyleInput`, `judgeStyle`, `critiqueDraft`, `composeIntelligentStyleGuide`

### `style-orchestrator.ts` — 359 lignes

* STYLE ORCHESTRATOR — NomosX * * Sélectionne et compose un guide d'écriture crédible par domaine / institution, * pour éviter le ton "IA" des LLMs et imiter des think tanks de référence. * * Inspirations : * - Harvard Kennedy School : policy memo, BLUF, active voice, skimmable * - France Stratégie : note d'analyse, discours-expert, méthodo visible, consensus * - Institut Montaigne : note d'action

**Exports :** `ThinkTankStyle`, `StyleProfile`, `StyleGuide`, `StyleOrchestratorInput`, `PROFILES`, `composeStyleGuide`, `renderStyleBadge`

### `trend-analyzer.ts` — 450 lignes

* NomosX Trend Analyzer Agent * * Detects trend breaks and shifts in research patterns over time. * Analyzes temporal evolution of topics, citations, and findings. * * Key capabilities: * - Detect sudden changes in publication volume * - Identify shifts in consensus or methodology * - Spot emerging topics gaining traction * - Flag declining research areas

**Exports :** `TrendBreak`, `TrendAnalysisOutput`, `trendAnalyzer`, `runWeeklyTrendAnalysis`


## Evidence & verification — 37 modules

### `atomic-claims.ts` — 243 lignes

* NomosX Atomic Claim Decomposition — Decontextualized claim extraction. * * Inspired by: * - FactReasoner (IBM): 5-stage pipeline with atomic decomposition + decontextualization * - VeriScore: pipelined claim extraction → evidence retrieval → claim verification * - HallDetect (2026): decomposition + compact encoder-based entailment * - chaincheck: claim-level hallucination detection via NLI * * D

**Exports :** `AtomicClaim`, `DecompositionResult`, `decomposeIntoAtomicClaims`, `decomposeHtmlIntoAtomicClaims`

### `chain-probability.ts` — 584 lignes

* NomosX CHAIN PROBABILITY — Source-Grounded Foresight * * LOT 4.2-4.8: Converts meta-analysis results and causal chains into * probability distributions for Monte Carlo simulation. * * LOT 4.2: buildPriors() — source-grounded prior distributions * LOT 4.3: propagateChainProbability() — joint probability via Monte Carlo * LOT 4.4: chainTournament() — permutations of mechanisms → best joint probabi

**Exports :** `Prior`, `MAPPING_VERSION`, `DerivedQuantity`, `verifyDerivedQuantity`, `verifyDerivedQuantities`, `ChainScenario`, `buildPriors`, `dToProbability`, `propagateChainProbability`, `buildPriorsFromCausalChain`, `propagateCausalChainProbability`, `chainTournament`

### `chain-verification.ts` — 468 lignes

* Chain-of-Verification (CoVe) — NomosX Sprint 6 (Gap 6) * * Vérification par chaîne de questions indépendantes, *pendant* la rédaction. * Inspiré de : * - Chain-of-Verification (CoVe, Meta, ACL 2024 Findings, arxiv 2309.11495) * - SelfCheckGPT (potsawee, EMNLP 2023) — zero-resource hallucination detection * * Le problème : * La vérification NomosX est *post-hoc* (Citation Verifier, NLI, Source Ch

**Exports :** `VerificationQuestion`, `VerificationResult`, `CoVeResult`, `CoVeConfig`, `extractClaims`, `planVerificationQuestions`, `executeVerification`, `integrateResults`, `chainOfVerification`

### `citation-filter.ts` — 160 lignes

* NomosX Citation Filter — Post-generation grounding enforcement * * Inspired by WueRAG (TREC 2025 #1) and DEER benchmark. * * Two-level policy: * 1. Implicit claim back-tracking: sentences without [SRC-N] inherit citations * from the nearest preceding paragraph that has one (semantic proximity). * 2. Uncited claim flagging: sentences that still have no citation after * back-tracking get a [UNCITE

**Exports :** `CitationFilterResult`, `applyCitationFilter`

### `citation-graph.ts` — 375 lignes

* Citation Graph Traversal — finds hub papers and bridge papers. * * After the initial source collection, this module traverses the citation graph * to find: * 1. HUB PAPERS: Sources cited by many of the collected sources (foundational work) * 2. BRIDGE PAPERS: Sources that connect different clusters (interdisciplinary) * 3. CLUSTERS: Groups of sources that cite each other (schools of thought) * *

**Exports :** `CitationNode`, `HubPaper`, `BridgePaper`, `CitationCluster`, `CitationGraphResult`, `findHubPapers`, `detectClusters`, `traverseCitationGraph`

### `citation-repair.ts` — 837 lignes

* Deterministic Citation Repair — post-render HTML cleanup. * * Problem: The LLM analyst generates numbers without [SRC-N] citations, * and the editor render can drop [SRC-N] tags. This produces: * - 71 unsourced numbers → numerical gate violations * - NLI integrity 40% → claims don't match sources * - Grounding veto → trust score capped at 40 * * Solution (deterministic, no LLM — Invariant 5): *

**Exports :** `CitationRepairResult`, `backfillCitationsFromAnalysis`, `sanitizeUnsourcedNumbers`, `injectCitationsBySourceMatch`, `injectCitationsByContentMatch`, `injectBroadCitations`, `repairCitations`

### `citation-verifier.ts` — 1370 lignes

* NomosX Citation Verifier — Semantic Citation Validation * * Goes beyond the old citationGuard (which only checks [SRC-N] format validity). * This agent verifies that each citation ACTUALLY SUPPORTS the claim it's attached to. * * Process: * 1. Parse all [SRC-N] citations from the analysis text * 2. Extract the claim/sentence surrounding each citation * 3. Compare claim semantics against the sour

**Exports :** `CitationInstance`, `CitationVerification`, `VerificationReport`, `extractCitations`, `verifyCitations`, `CiteGuardResult`, `citeGuardValidation`, `FranqFaithfulness`, `FranqFactuality`, `FranqStatement`, `FranqResult`, `assessWithFranq`

### `claim-grounding.ts` — 1002 lignes

* Claim Grounding Gate — deterministic claim-to-source verification. * * Inspired by: * - groundrails (stellarshenson): deterministic lexical grounding, no LLM, CPU-only * - warrant (eburke21): decompose answer into atomic claims, verify each against sources * - sourcecheck (aberaio): resolve citation to real source, check claim appears in source text * - DeepCitation: deterministic verification l

**Exports :** `ClaimVerdict`, `AtomicClaim`, `GroundingResult`, `repairHtmlWithGrounding`, `groundClaims`, `groundClaimsWithNLI`, `GraphNode`, `GraphEdge`, `SourceGraph`, `buildSourceGraph`, `GraphGroundingResult`, `verifyClaimAgainstGraph`

### `claim-passage-contract.ts` — 213 lignes

* Claim→passage evidence contract — deterministic, no LLM. * * Audit priority #1, second half: a [SRC-N] citation proves a claim points * at a SOURCE, not that the source's extracted content actually carries * the claim. CausalChain links already carry claim/evidence/warrant/ * sourceRef — this module checks each present_fact link's claim text * against the cited source's READING passages (claims/

**Exports :** `passageContainment`, `ClaimPassageContractResult`, `applyClaimPassageContract`, `ClaimPassageNLIResult`, `refineClaimPassageWithNLI`

### `conflict-aware.ts` — 216 lignes

* NomosX Conflict-Aware Reasoning — Detect and preserve source contradictions. * * Inspired by: * - EvidentialRAG (2026): Convert sources to probabilistic evidence, * preserve conflicts as epistemic uncertainty (Dempster-Shafer fusion) * - ConflictRAG (2026): Detect-classify-resolve-generate pipeline * - ConflictScore (2026): Quantify how well a model acknowledges conflicts * - CONFRAG (ACL 2026):

**Exports :** `SourceConflict`, `ConflictDetectionResult`, `detectSourceConflicts`

### `contradiction-detector.ts` — 330 lignes

* NomosX Contradiction Detector Agent * * Detects contradictions between sources on the same topic. * Key differentiator for a real think tank. * * Process: * 1. Group sources by topic/vertical * 2. Extract claims from each source * 3. Compare claims using LLM to detect contradictions * 4. Generate CONTRADICTION signals when found

**Exports :** `ContradictionResult`, `ContradictionDetectorOutput`, `contradictionDetector`, `detectContradictionsInRecent`

### `evidence-bank.ts` — 151 lignes

* Evidence Bank — the WebWeaver/Perplexity pattern. * * Instead of letting the writer invent citations at generation time and * verifying them post-hoc, we build a bank of extracted evidence AT READING * TIME: every claim/method/result the reader extracted from a source becomes * a banked entry keyed to that source's [SRC-N] index. * * The analyst is told: every factual claim must trace to banked

**Exports :** `EvidenceEntry`, `EvidenceBank`, `BankValidation`, `buildEvidenceBank`, `buildEvidenceBankBlock`, `validateCitationsAgainstBank`

### `evidence-gatherer.ts` — 498 lignes

* Adaptive Evidence Gatherer * * Instead of rejecting topics with insufficient/misaligned sources, this module * acts like a real researcher: decomposes the question into researchable sub-angles, * searches each independently, combines all sources, and reassesses. * * Flow: * 1. Initial search → assess alignment * 2. If misaligned or insufficient → LLM decomposes into 3-5 sub-angles * 3. Search ea

**Exports :** `GatheredSource`, `EvidenceGatherResult`, `gatherEvidence`

### `evidence-independence.ts` — 132 lignes

Cosine ≥ this on title+abstract ⇒ treated as the same evidence cluster.

**Exports :** `NEAR_DUPLICATE_THRESHOLD`, `EvidenceIndependence`, `citedSourceIndices`, `clusterBySimilarity`, `auditEvidenceIndependence`

### `evidence-ledger.ts` — 139 lignes

_(no docstring)_

**Exports :** `EvidenceSupportStatus`, `EvidenceLedgerClaim`, `EvidenceLedger`, `stripHtmlForEvidence`, `extractCitationNumbers`, `buildEvidenceLedger`

### `evidence-partition.ts` — 104 lignes

* EVIDENCE PARTITION — designed information asymmetry (InfoDelphi, arXiv 2607.01661) * * Finding: when every agent in a panel sees identical evidence, deliberation * collapses into herding — correlated errors, no real belief revision. The fix * is to partition the corpus into a SHARED pool (common ground) plus DISJOINT * private slices per agent. Each participant holds exclusive knowledge that can

**Exports :** `EvidencePartition`, `PartitionOptions`, `partitionEvidence`, `formatPartitionedSources`

### `evidence-registry.ts` — 167 lignes

* NomosX Stable Evidence IDs * * Inspired by geodocs.dev + EviReport (ACL 2026). * * Instead of using positional [SRC-N] indices that shift when sources are * added/removed, this module assigns stable evidence IDs [E1], [E2]... * with a bidirectional mapping table. * * Benefits: * - Adding/removing a source doesn't break existing citations * - Citations can be traced back to exact source spans * -

**Exports :** `EvidenceEntry`, `EvidenceRegistry`, `createEvidenceRegistry`, `replaceSrcWithEvidenceIds`, `resolveEvidenceId`, `getCitationStats`

### `evidence-tiering.ts` — 175 lignes

* Evidence Tiering — classifies sources into 5 tiers based on provenance and type. * * Tier 1 — Empirical: controlled studies, datasets, quantitative research * Tier 2 — Institutional: official documents from governments, IGOs, religious institutions * Tier 3 — Academic: peer-reviewed papers, systematic reviews * Tier 4 — Policy: EU AI Act, OECD, UNESCO, Council of Europe, GPAI, ISO standards * Ti

**Exports :** `EvidenceTiers`, `computeEvidenceTiers`, `summarizeEvidenceTiers`

### `fact-checker.ts` — 602 lignes

* NomosX FACT-CHECKER — Numerical Claim Verification * * The #1 credibility problem in AI-generated think tank reports: * citing numbers that don't match the source data. * * This agent: * 1. Extracts all numerical claims from the HTML (percentages, amounts, ratios) * 2. For each claim, checks if the number appears in the cited source * 3. Flags claims where the number doesn't match the source * 4

**Exports :** `NumericalClaim`, `FactCheckResult`, `CitanceVerdict`, `CitanceReport`, `FactCheckerOutput`, `factChecker`

### `fact-repair.ts` — 249 lignes

* FACT REPAIR — anchored correction of fact-checker fatal discrepancies. * * The generic revision editor cannot fix these: the fact-checker's `claim` * strings come from stripHtmlForEvidence(html) (sup→[SRC-N], tags stripped), * so a verbatim `find` can never match raw HTML across citations and inline * tags, and the editor only ever saw 12KB of an ~90KB article. This repairer * prompts on the cla

**Exports :** `FactualDiscrepancy`, `FactRepairResult`, `applyTolerantEdit`, `repairFactualDiscrepancies`

### `gap-aware-append.ts` — 168 lignes

* NomosX Gap-Aware Evidence Append * * Inspired by EviReport (ACL 2026) — gap-aware iterative evidence retrieval. * * After analysis, identifies sections with low citation density and generates * targeted search queries to fill those gaps. The new sources are then injected * into the analysis context for the structural editor to incorporate.

**Exports :** `GapAnalysisResult`, `SectionGap`, `analyzeCitationGaps`, `generateGapQueries`

### `gap-filler.ts` — 312 lignes

* NomosX GAP FILLER — Proactive Knowledge Gap Identification & Pre-Fetching * * Inspired by WebThinker (NeurIPS 2025) and KnowSelf (ACL 2025): * - After each analysis, identify what the agent DIDN'T know or couldn't address * - Store these gaps as structured "knowledge gaps" in AgentAuditLog * - Before the next run on a similar topic, retrieve relevant gaps and * inject them as priority search que

**Exports :** `KnowledgeGap`, `GapExtractionResult`, `GapInjection`, `extractAndStoreGaps`, `getRelevantGaps`, `markGapsFilled`

### `nli-engine.ts` — 553 lignes

* NomosX NLI Engine — Real Natural Language Inference for claim verification. * * Replaces the heuristic composite scoring in nli-verifier.ts with a proper * NLI model that classifies claim→source as entailment / neutral / contradiction. * * Architecture (pluggable): * 1. PRIMARY: Local NLI model via @huggingface/transformers (cross-encoder/nli-deberta-v3-base) * - DeBERTa-v3 NLI cross-encoder, fi

**Exports :** `NLIVerdict`, `NLIClassification`, `NLIBatchResult`, `classifyNLI`, `classifyNLIBatch`, `nliToGroundingVerdict`, `nliToCitationVerdict`, `isNLIModelAvailable`, `preloadNLIModel`

### `nli-verifier.ts` — 241 lignes

* NomosX NLI Citation Verifier — Real entailment-based verification * * Powered by nli-engine.ts which uses mDeBERTa-v3 (multilingual NLI model) * for true entailment classification: entailment / neutral / contradiction. * * Falls back to embedding-based NLI (OpenAI embeddings + negation + numbers) * when the local model is not available. * * Three-stage process: * 1. Extract claim-citation pairs

**Exports :** `verifyCitationsNLI`

### `outline-critic.ts` — 144 lignes

* Outline Critic — the WebWeaver (ICLR 2026) / AgentDisCo pattern. * * Mature deep-research systems iterate on the OUTLINE (the structured * intermediate representation) before/while writing — not only on the final * text. A critic evaluates whether the analysis structure actually covers * the question's dimensions, finds missing angles, and emits targeted * retrieval queries to fill structural ga

**Exports :** `OutlineCritique`, `critiqueOutline`

### `pre-draft-review.ts` — 131 lignes

* Pre-draft scope review — the "short thesis/outline review BEFORE full * drafting" called for by the source-to-publication audit. * * The 3-pass analyst is the most expensive stage (~7-10min, bulk of run * cost). Today scope/causality defects are only caught AFTER all three * passes: thesis adherence post-analyst, outline critique post-analyst, * DA at the tail. A verdict that exceeds the evidenc

**Exports :** `PreDraftReviewResult`, `reviewDraftDirection`

### `provenance-graph.ts` — 321 lignes

* NomosX Claim Provenance Graph — Stable claim-to-evidence traceability. * * Inspired by: * - ClaimKit (isaac-cf-wong): Claim-level provenance with stable IDs and validation status * - agent-grounding (LanNguyenSi): Evidence ledger with claim gates and hypothesis tracking * - verified-science-agent (fraware): Treat every report like a build artifact with provenance * * Every claim in a NomosX publ

**Exports :** `ClaimStatus`, `ProvenanceClaim`, `ProvenanceGraph`, `buildProvenanceGraph`, `markStaleClaims`

### `rav-verifier.ts` — 265 lignes

* RAV (Recon-Answer-Verify) Citation Verification — NomosX * * Inspired by: * - RAV (EMNLP 2025): Three-agent framework that iteratively generates * and answers sub-questions to verify different claim aspects. * Outperforms SOTA by 57.5% on PFO dataset. * - CiteGuard (ACL 2026): Retrieval-aware agent for citation attribution. * - CiteCheck: Hybrid scholarly retrieval + LLM verifier (88.9% accuracy

**Exports :** `SubQuestion`, `SubAnswer`, `RAVVerdict`, `decomposeClaim`, `answerSubQuestion`, `aggregateVerdict`, `verifyWithRAV`, `batchVerifyWithRAV`

### `research-patterns.ts` — 450 lignes

* Research Patterns — STORM + PaperQA2 — NomosX Sprint 6 (Gap 13) * * Deux patterns récents pour améliorer le research agent : * 1. STORM (Stanford, NAACL 2024) — perspective-guided question asking * 2. PaperQA2 (FutureHouse, arxiv 2409.13740) — citation traversal * * Le problème : * L'Intelligent Scout a 6 lenses mais pas : * - STORM : simuler différents profils d'experts pour générer des questio

**Exports :** `StormPerspective`, `StormOutline`, `CitationTraversalResult`, `ResearchPatternsConfig`, `DEFAULT_RESEARCH_PATTERNS_CONFIG`, `generateStormPerspectives`, `buildStormOutline`, `extractReferences`, `scoreReferencesForRelevance`, `traverseCitations`, `buildResearchSearchPlan`

### `research-protocol.ts` — 117 lignes

* Research Protocol & AI Disclaimer — auto-generated sections for transparency. * * Inspired by: * - RAND 2022 Standards: "document purpose, scope, sources, assumptions, data, methods, limitations" * - CFR: "The Council takes no institutional position" * - Brookings: "All work represents the sole conclusions of its authors" * * These sections are NOT LLM-generated. They are computed from pipeline

**Exports :** `ProtocolMetadata`, `renderResearchProtocol`, `renderAIDisclaimer`

### `retraction-watch.ts` — 173 lignes

* Retraction Watch — Source Integrity Verification * * Inspired by Sourcecheck (2026, GitHub aberaio/sourcecheck): * - Resolve each source's DOI against OpenAlex + Crossref * - Check is_retracted flag * - Retracted sources are vetoed (never accepted as evidence) * - Non-blocking: failures are logged, not thrown * * API: * - OpenAlex: https://api.openalex.org/works/doi:{doi}?select=is_retracted,id

**Exports :** `RetractionResult`, `RetractionBatchResult`, `checkRetraction`, `checkRetractionsBatch`, `filterRetracted`

### `retrieval-gapfill.ts` — 101 lignes

* Retrieval Gap-Fill — CRAG-style corrective retrieval. * * Corrective RAG (arXiv 2401.15884): evaluate retrieval quality BEFORE * generation and trigger targeted re-retrieval when coverage is deficient — * rather than discovering the gap after the report is written. * * NomosX already detects coverage gaps (CARE missingConcepts at SCOUT K10) * but only logged them. This module closes the loop: mi

**Exports :** `GapFillResult`, `gapFillMissingConcepts`

### `safe-verifier.ts` — 408 lignes

* SAFE Verifier — Search-Augmented Factuality Evaluation. * * Implements the DeepMind SAFE method (arXiv 2403.18802, NeurIPS 2024): * for each atomic claim, generate search queries, retrieve LIVE evidence * from the web, then rate the claim against that evidence with NLI. * * Why this exists: groundClaimsWithNLI verifies claims against the STORED * sources only. A claim can be perfectly true yet "

**Exports :** `SafeVerdict`, `SafeClaimResult`, `SafeVerificationReport`, `SafeVerifyOptions`, `verifyClaimsWithLiveSearch`

### `source-quality.ts` — 205 lignes

* Source Quality Engine — NomosX 2026 * * Inspired by: * - BIP! impact indicators (OpenAIRE) — citation-based impact * - Rapid Journal Quality Check — SJR, H-Index, CCF * - Sourcecheck / RefChecker — provenance-first verification * - LevelRAG / HippoRAG 2 — re-rank by source reliability * * Scores academic and non-academic sources on multiple dimensions, * then re-ranks the top sources by a compos

**Exports :** `SourceQualityScore`, `ScoredSource`, `scoreSource`, `computeDiversityScores`, `rankSourcesByQuality`, `filterAndBoostTopSources`

### `sourcecheck.ts` — 448 lignes

* NomosX Source Check — Provenance-first verification for AI-generated claims. * * Inspired by sourcecheck (aberaio): * "Does the cited source exist, is it retracted, is the quoted text actually there?" * * This module takes the OPPOSITE stance from LLM judges: * - Resolve the citation to ground truth first (OpenAlex/Crossref) * - Check if the source is retracted * - Verify the claim text appears

**Exports :** `SourceCheckVerdict`, `SourceCheckResult`, `SourceCheckBatchResult`, `scoreSourceCredibility`, `checkSource`, `checkSourcesBatch`

### `symbolic-verifier.ts` — 295 lignes

* NSRSA: Neuro-Symbolic Recursive Self-Alignment * * Based on: arXiv 2026 "NSRSA: Neuro-Symbolic Recursive Self-Alignment for * Trustworthy Reasoning in LLMs" * * Combines neural reasoning (LLM) with symbolic verification (deterministic * checks) to catch reasoning errors that look correct but are flawed. * * Key insight: 34% of "correct" answers have flawed reasoning. NSRSA * rejects these by ver

**Exports :** `SymbolicCheck`, `NSRSAResult`, `verifySymbolically`, `buildSymbolicVerificationReport`

### `ufo-factcheck.ts` — 273 lignes

* UFO — Unified Fact-Checking with Plug-and-Play Sources (NomosX) * * Inspired by: * - UFO (S15-06, AAAI 2026): A unified framework supporting multiple * plug-and-play fact sources — human-written evidence, web search, LLM * internal knowledge, structured databases, and knowledge graphs — with * flexible source selection and reordering based on claim characteristics. * * Architecture: * 1. `select

**Exports :** `FactSource`, `FactCheckResult`, `UFOConfig`, `DEFAULT_UFO_CONFIG`, `selectSources`, `verifyWithMultipleSources`, `batchFactCheck`


## Adversarial & quality gates — 31 modules

### `bias-detector.ts` — 488 lignes

* Bias Detector — systematic detection of common biases in the source corpus * and generated analysis. * * This is a deterministic, LLM-free check that flags: * - Provider concentration (selection bias) * - Geographic skew (sources from one region only) * - Temporal skew (all sources from same year/period) * - Methodological monoculture (all sources same type) * - Publication bias (only positive r

**Exports :** `BiasFinding`, `BiasReport`, `detectBiases`

### `cohere-reranker.ts` — 200 lignes

* COHERE RERANKER * * Uses Cohere's rerank API to reorder search results by relevance. * Cohere's rerank-english-v3.0 is state-of-the-art for search relevance. * * Fallback: If Cohere API fails or is not configured, uses local relevance scoring.

**Exports :** `RerankResult`, `rerankSources`, `rerankBatch`

### `confidence-aggregation.ts` — 93 lignes

* CONFIDENCE-WEIGHTED AGGREGATION — independent scoring beats deliberation. * * KalshiBench oracle study (arXiv 2605.30802): deliberative consensus DEGRADES * accuracy below the best single model (confidently-wrong agents flip correct * ones), while independent aggregation with confidence weighting beats every * single-model baseline. Demystifying-MAD (ACL 2026) adds the second missing * piece: ex

**Exports :** `ScoredVote`, `AggregationResult`, `aggregateIndependentScores`

### `critic-agent.ts` — 1095 lignes

* NomosX Critic Agent — Multi-stage verification with adversarial scrutiny. * * Inspired by: * - Critic-Guided Hybrid Agentic RAG (OpenReview 2026): multi-stage verification * with atomic claim verification + adaptive retrieval + semantic failure memory * - GAVEL (ACL 2026): Evidence-Contract Debate with mechanized scrutiny * - Self-Correcting RAG (ACL 2026): NLI-guided verification + repair * - R

**Exports :** `CriticVerdict`, `AtomicClaim`, `ContradictionPair`, `BiasFlag`, `CitationIssue`, `CriticResult`, `decomposeAnalysis`, `groundClaims`, `detectContradictions`, `detectBias`, `validateCitations`, `generateRepairInstructions`

### `critic-panel.ts` — 276 lignes

* Critic Panel — rubric-based multi-dimension review (G-Eval style). * * The scalar critic score compresses everything into one number: a paper can * score 18 for ten different reasons and nobody can tell which. Research on * LLM-as-judge (G-Eval, MT-Bench, peer-review agents) shows rubric-anchored * per-dimension scoring is more reliable, more actionable, and less biased. * * This panel runs 4 in

**Exports :** `PanelDimension`, `DimensionVerdict`, `CriticPanelResult`, `FieldContext`, `runCriticPanel`

### `critical-loop-v2.ts` — 651 lignes

* NomosX Critical Loop V2 — Iterative Self-Correction * * Unlike V1 which only SCORES a draft, V2 actually REWRITES it. * * Flow: * 1. Run 3 parallel critics (Methodology Judge, Adversarial Reviewer, Decision Calibrator) * 2. If composite score < threshold → REWRITE the draft using critic feedback * 3. Re-run critics on rewritten draft * 4. Max 2 iterations (draft → critique → rewrite → re-critiqu

**Exports :** `runCriticalLoopV2`

### `cross-model-consensus.ts` — 475 lignes

* NomosX Cross-Model Consensus + Reflective RAG * * Two complementary innovations from 2026 research: * * 1. CROSS-MODEL CONSENSUS (LLM Jury, arxiv 2026): * Multiple independently-trained models vote on critical claims. * Errors decorrelate → consensus emerges. +4.6 accuracy vs single model. * Key insight: 3 models from different providers = ~1.3 independent models * (r=0.77 error correlation), bu

**Exports :** `ConsensusVote`, `ConsensusResult`, `crossModelConsensus`, `PipelinePhase`, `ReflectionResult`, `reflectOnPhase`, `FailureRecord`, `recordFailure`, `getRelevantFailures`, `getFailureMemorySize`

### `dedup-doi.ts` — 313 lignes

* DOI-First Deduplication with Union-Find Clustering * * Inspired by BibFusion (2026) and risforge (2026): * - DOI-first matching cascade with conservative fallbacks * - Union-find for transitive clustering (A=B, B=C → A=B=C) * - Zero data loss on merge: best record is base, others supplement * * Cascade: * 1. DOI exact match (100% confidence) * 2. Normalized title + first-author surname match (99

**Exports :** `DedupSource`, `DedupResult`, `dedupSources`

### `devils-advocate.ts` — 514 lignes

* NomosX DEVIL'S ADVOCATE — Permanent Adversarial Intelligence * * Every publication, before release, faces a dedicated adversarial agent * whose sole purpose is to find what is wrong, overstated, missing, or * intellectually dishonest in the analysis. * * This is not the same as the Critical Loop (which improves writing quality). * The Devil's Advocate operates at the EPISTEMIC level: * - Are the

**Exports :** `AdvocateChallenge`, `ChallengeType`, `AdvocateReport`, `InstitutionComparison`, `ComparisonScore`, `runDevilsAdvocate`

### `enhanced-ranker.ts` — 797 lignes

* ENHANCED RANKER - A+ LEVEL QUALITY FILTERING * * Amélioration du système de ranking pour atteindre les standards A+ * - Seuil qualité augmenté à 80% * - Filtrage sources académiques premium * - Diversité améliorée * - Extraction données quantitatives

**Exports :** `EnhancedRankOptions`, `EnhancedRankedSource`, `enhancedRank`, `SourceTrustTier`, `classifyTrustTier`

### `gate-diagnosis.ts` — 141 lignes

* GATE DIAGNOSIS — SEVA-style structured verification output (arXiv 2606.29713). * * A bare "check failed" string leaves the revision machinery guessing. Each * failed gate check is mapped to a typed diagnosis: WHAT class of failure, * HOW severe, and WHAT the actionable fix is. The regeneration feedback * (buildFailureFeedback) consumes these instead of raw reason strings, and * the audit trail g

**Exports :** `DiagnosisCategory`, `DiagnosisSeverity`, `GateDiagnosis`, `diagnoseCheck`, `diagnoseGateResult`, `renderDiagnoses`

### `gmpo-optimizer.ts` — 313 lignes

* GMPO — Gradient-Guided Multi-Judge Prompt Optimization — NomosX * * Inspired by: * - GMPO (ACL 2026, S15-08): Gradient-Guided Multi-Judge Prompt Optimization. * Uses first-order gradient approximation to estimate per-segment importance * in a prompt and a panel of multiple judges to select the best edit. * Replaces the deleted dspy-optimizer.ts with a lighter, dependency-free * implementation ad

**Exports :** `PromptSegment`, `OptimizationResult`, `GMPOConfig`, `DEFAULT_GMPO_CONFIG`, `segmentPrompt`, `approximateGradient`, `optimizePrompt`

### `human-feedback.ts` — 333 lignes

* Human Feedback Integration — NomosX * * Permet aux corrections manuelles de l'utilisateur de nourrir le système * d'apprentissage. Avant ce module, quand vous corrigiez un brief manuellement, * le système ne le savait pas — il ne pouvait pas apprendre de vos interventions. * * Architecture : * 1. recordHumanCorrection() — enregistre une correction dans AgentAuditLog * avec le type "HUMAN_CORRECT

**Exports :** `HumanCorrection`, `ExtractedLesson`, `recordHumanCorrection`, `getHumanCorrectionLessons`, `getCorrectionStats`

### `judge-arena.ts` — 316 lignes

* JudgeArena — Unified LLM-Judge Evaluation with Statistical Calibration — NomosX * * Inspired by: * - JudgeArena (arXiv 2026, S15-05): Unified framework for reproducible * LLM-judge evaluation with proper statistical methods. Provides * Cohen's κ (agreement), Spearman ρ (rank correlation), calibration * against ground truth, and confidence intervals for judge selection. * * Architecture: * - cohe

**Exports :** `JudgeEvaluation`, `JudgeCalibration`, `BenchmarkResult`, `cohensKappa`, `spearmanRho`, `calibrateJudge`, `selectBestJudge`, `confidenceInterval`

### `leap-aggregation.ts` — 128 lignes

* LEAP — Likelihood Elicitation and Aggregation for probabilistic forecasting * (arXiv 2609.01337). * * Core idea: a monolithic "read all evidence, emit a probability" forecast * hides how each evidence item moves the result and collapses uncertainty. * Instead: explicit prior + per-item likelihood updates → deterministic * posterior in log-odds space. Auditable, reproducible, and each evidence *

**Exports :** `toLogOdds`, `fromLogOdds`, `LeapEvidenceUpdate`, `evidenceLikelihoodUpdate`, `ForecastVote`, `PooledForecast`, `poolForecasts`

### `lesson-verifier.ts` — 253 lignes

* NomosX LESSON VERIFIER — Independent verification of agent lessons * * Inspired by LUCID (2026): "Memory Reward Inflation in Self-Improving LLM Agents" * * PROBLEM (the Echo Gap): * When an agent generates its own lessons and scores them, incorrect lessons * receive inflated rewards. The agent then preferentially reuses its most * confident mistakes. The error compounds through memory rather tha

**Exports :** `LessonVerification`, `BatchVerificationResult`, `verifyLesson`, `verifyAndDeInflateLessons`

### `local-judge.ts` — 469 lignes

* Local Judge — NomosX Sprint 6 (Gap 8) * * LLM-as-Judge open-source (Prometheus 2 / JudgeLM / Auto-J) pour réduire * la dépendance aux modèles propriétaires et les coûts. * Inspiré de : * - Prometheus 2 (EMNLP 2024, arxiv 2405.01535) — evaluator LM with custom rubrics * - JudgeLM (BAAI-Vision) — scalable judge * - Auto-J (GAIR-NLP) — generative judge for alignment * * Le problème : * Cross-Model

**Exports :** `RubricCriterion`, `JudgeRubric`, `JudgeEvaluation`, `LocalJudgeConfig`, `DEFAULT_LOCAL_JUDGE_CONFIG`, `NOMOSX_JUDGE_RUBRICS`, `isLocalJudgeAvailable`, `judge`, `judgeForPRM`, `judgeAttack`, `calibrateLocalJudge`

### `moa/mixture-of-agents.ts` — 942 lignes

* Mixture of Agents (MoA) — NomosX * * Au lieu d'un seul ANALYST, le MoA lance plusieurs analystes * spécialisés en parallèle, chacun avec une perspective différente, * puis agrège leurs insights. C'est le pattern qui crée la capacité * émergente : la qualité de l'agrégation est supérieure à celle du * meilleur agent individuel. * * Inspiré de : * - "Mixture of Agents" (Together AI, 2024-2026) * -

**Exports :** `AgentSpecialization`, `SpecialistAgent`, `SpecialistAnalysis`, `MoAResult`, `SPECIALIST_AGENTS`, `runSpecialistAgents`, `aggregateAnalyses`, `runMixtureOfAgents`, `updateAgentWeights`, `loadAgentWeights`, `AgentProposal`, `selectAgentsDynamically`

### `output-guard.ts` — 322 lignes

* Output Guardrails — NomosX Sprint 6 (Gap 15) * * Validation structurée des outputs des LLM (Guardrails AI style). * Inspire de : * - Guardrails AI (guardrails-ai/guardrails) — structured output validation * - NeMo Guardrails (NVIDIA) — policy-based evaluation * - GRETEL (2024) — execution-grounded validation * * Le problème : * Le WriteGuard protège les *interventions du Witness*, mais il n'y a

**Exports :** `GuardOutcome`, `GuardViolation`, `OutputGuardResult`, `OutputGuardConfig`, `DEFAULT_OUTPUT_GUARD_CONFIG`, `guardOutput`, `buildRepairFeedback`

### `peer-reviewer.ts` — 148 lignes

* Peer Reviewer Agent — NomosX 2026 * * Inspired by Feynman (companion-inc/feynman) and OpenResearcher: * - Four bundled research agents: Researcher, Reviewer, Writer, Verifier * - Simulated peer review with severity-graded feedback * - Checks: novelty, methodology, citations, clarity, significance, limitations * * This agent runs BEFORE the EDITOR to catch flaws that the primary ANALYST missed. *

**Exports :** `ReviewIssue`, `PeerReview`, `runPeerReview`, `renderPeerReviewInjection`

### `prm/process-reward-model.ts` — 561 lignes

* Process Reward Model (PRM) — NomosX * * Le Process Reward Model est le moat le plus profond du système. * Il apprend, à partir de chaque run, quels chemins de raisonnement * mènent à de bons résultats et lesquels mènent à des échecs. * * Inspiré de : * - OpenAI PRM (Process Reward Model, "Let's Verify Step by Step", 2023-2024) * - DeepMind step-level rewards (2024-2026) * - Math-Shepherd (automa

**Exports :** `ProcessStep`, `ProcessFeatures`, `PRMPrediction`, `PRMModel`, `extractFeatures`, `scoreStep`, `llmScoreStep`, `trainPRM`, `persistProcessStep`, `persistPRMModel`, `loadPRMModel`, `loadProcessSteps`

### `pruning-gates.ts` — 534 lignes

* NomosX PRUNING GATES — Deterministic Post-Generation Quality Assurance * * Principles (from research best practices): * - Gates PRUNE, never BLOCK. Every publication is publishable by default. * - Gates are deterministic (code only, zero LLM). The LLM produces; code verifies and prunes. * - Trust propagates through the DAG: weak parents reduce confidence in children. * - A pruned link is removed

**Exports :** `ConfidenceTier`, `PruningResult`, `gateCitationSanitize`, `gateCascadeCheck`, `gateOrphanCheck`, `gateMultiRootCheck`, `gateGroundingCheck`, `gateDomainTravelCheck`, `gateInflectionCheck`, `gateHedgingStrip`, `propagateTrust`, `runAllPruningGates`

### `publication-gate.ts` — 381 lignes

P3.7: If triangular judge overrode DA verdict, skip fatal_challenges hard gate

**Exports :** `PublicationGateDecision`, `PublicationGateThresholds`, `PublicationGateInput`, `PublicationGateCheck`, `PublicationGateResult`, `DEFAULT_PUBLICATION_GATE_THRESHOLDS`, `evaluatePublicationGate`

### `ragas-eval.ts` — 159 lignes

* RAGAS-style Evaluation — NomosX 2026 * * Inspired by the RAGAS framework (Retrieval-Augmented Generation Assessment). * Evaluates the RAG pipeline without human labels by using the LLM itself * as an evaluator on: * - Faithfulness: does the answer stick to the retrieved context? * - Answer Relevancy: does the answer address the question? * - Context Precision: how much of the retrieved context i

**Exports :** `RagasSubMetrics`, `RagasMetrics`, `RagasEvaluation`, `evaluateRAG`, `evaluateBriefRAG`

### `relevance-scorer.ts` — 534 lignes

* RELEVANCE SCORER * * Scores how relevant a source is to a given query. * * Scoring factors: * 1. Topic overlap (keywords in title/abstract) * 2. Field matching (academic domains) * 3. Temporal relevance (if query mentions time period) * 4. Citation context (highly cited = more authoritative on topic) * * Score: 0.0 - 1.0 * - 0.8+ : Highly relevant, core to query * - 0.6-0.8 : Relevant, useful co

**Exports :** `RelevanceScore`, `SourceForScoring`, `scoreRelevance`, `filterByRelevance`, `logRelevanceScores`, `CAREResult`, `evaluateWithCARE`

### `self-correct.ts` — 877 lignes

* Self-Correct Module — Hybrid CHARM + Overseer * * Inspired by: * - CHARM (Cascading Hallucination in Agentic RAG) — cross-stage consistency tracking, * cascade detection, confidence propagation monitoring, rollback * - Overseer — verifier-first architecture with auto-feedback injection on retry * * This module wraps existing pipeline stages with: * 1. Checkpoints — snapshot each stage's output +

**Exports :** `VerifierVerdict`, `VerifierResult`, `StageSnapshot`, `CheckpointResult`, `CascadeResult`, `SelfCorrectorConfig`, `DEFAULT_SELF_CORRECT_CONFIG`, `JudgmentGateResult`, `judgmentGate`, `StabilityMetrics`, `computeStability`, `RootCauseAttribution`

### `self-correction-integration.ts` — 345 lignes

* Self-Correction Integration Layer — NomosX * * Câble la self-correction (Reflexion/MASC pattern) dans le pipeline de production. * Ce module est le pont entre self-correction.ts (qui existe mais n'était jamais appelé) * et pipeline-v2.ts. * * Trois points d'intégration : * 1. afterReader() — évalue la qualité du READER, retry si < 50 * 2. afterAnalyst() — évalue la qualité de l'ANALYST, retry si

**Exports :** `ReaderSelfCorrectionInput`, `AnalystSelfCorrectionInput`, `SelfCorrectionStats`, `selfCorrectReader`, `selfCorrectAnalyst`, `reAnalyzeAfterGapFill`

### `self-correction.ts` — 355 lignes

* Multi-Phase Self-Correction — NomosX * * Inspired by: * - Reflexion (NeurIPS 2023): verbal reinforcement learning from self-reflections * - MASC (ACL 2026): Metacognitive Self-Correction with step-level error detection * - Uncertainty-Aware Self-Correction (OpenReview 2026): SAUP for coding agents * - Process Reward Models (SWE-PRM): inference-time trajectory correction * - Experience Memory Gra

**Exports :** `PhaseReflection`, `SelfCorrectionResult`, `assessPhaseQuality`, `buildCorrectionFeedback`, `reflectAndRetry`

### `self-play/adversarial.ts` — 681 lignes

* Adversarial Self-Play — NomosX * * Le système génère ses propres cas de test difficiles et essaie de * trouver des faiblesses dans ses propres analyses. C'est le pattern * qui crée le moat le plus défensif : le système découvre ses * faiblesses avant les utilisateurs. * * Inspiré de : * - AlphaGo self-play (Silver et al., 2016-2024) * - Red-teaming + automated adversarial testing (2024-2026) * -

**Exports :** `AdversarialRole`, `AdversarialQuery`, `ChallengeType`, `AttackVector`, `AttackTarget`, `WeaknessCategory`, `DefenseResponse`, `SelfPlayResult`, `SelfPlayLesson`, `generateAdversarialQueries`, `attackAnalysis`, `defendAnalysis`

### `ts-setrank.ts` — 248 lignes

* TS-SetRank — Contextual Relevance Reranking via Thompson Sampling * * Inspired by TS-SetRank (ACL 2026): * "Contextual Relevance and Adaptive Sampling for LLM-Based Document Reranking" * * Key insight: document relevance is context-dependent. The same document * may be judged relevant or irrelevant depending on which other documents * appear alongside it in the batch. TS-SetRank estimates contex

**Exports :** `TSSetRankResult`, `tsSetRank`

### `url-health.ts` — 121 lignes

* URL Health — the urlhealth pattern (arXiv 2604.03173). * * 3–13% of citation URLs produced by deep-research agents are hallucinated * (no Wayback record, never existed); 5–18% don't resolve at all. A cheap * liveness + Wayback check catches both, and is the difference between * "citations look real" and "citations are real". * * Runs post-render on the sources that were actually cited — not the

**Exports :** `UrlHealthResult`, `checkCitedUrlHealth`


## Memory, learning & identity — 50 modules

### `agent-memory.ts` — 957 lignes

* NomosX AGENT MEMORY — Persistent Learning & Self-Calibration * * This is what separates NomosX from a stateless LLM wrapper. * Every agent accumulates a performance history that feeds back into * its own prompts and decision thresholds — creating a genuine * improvement loop without fine-tuning. * * Architecture: * 1. PERFORMANCE LEDGER — per-domain, per-agent success/failure rates * 2. LESSON S

**Exports :** `AgentPerformanceRecord`, `FailureMode`, `AgentLesson`, `AgentCalibration`, `MemoryInjection`, `recordAgentPerformance`, `extractLessons`, `getProviderPerformance`, `computeCalibration`, `buildMemoryInjection`, `storeLesson`, `updateLessonSuccessRate`

### `canon/canon-matcher.ts` — 205 lignes

* Canon matcher — deterministic relevance scoring between a research question * and the foundational-text corpus. No LLM call: pure keyword/domain scoring * so it runs in microseconds and costs nothing.

**Exports :** `CANON`, `CanonMatch`, `matchCanon`, `buildCanonBlock`, `buildCanonBlockFromMatches`

### `canon/corpus-economics.ts` — 282 lignes

* Canon — Economics, Strategy & International Relations, History.

**Exports :** `ECONOMICS_IR_CANON`

### `canon/corpus-philosophy.ts` — 305 lignes

* Canon — Philosophy & Political Theory. * From classical antiquity to contemporary critical theory.

**Exports :** `PHILOSOPHY_CANON`

### `canon/corpus-sociology.ts` — 256 lignes

* Canon — Sociology, Anthropology & Social Theory.

**Exports :** `SOCIOLOGY_CANON`

### `canon/corpus-technology.ts` — 321 lignes

* Canon — Science & Technology Studies, Ecology & Risk.

**Exports :** `TECHNOLOGY_CANON`

### `canon/index.ts` — 3 lignes

_(no docstring)_

**Exports :** `—`

### `canon/types.ts` — 43 lignes

* Canon layer — curated foundational texts injected as interpretive * frameworks into the analyst context. This is the "mémoire exhaustive": * philosophy, sociology, political theory, economics, history, STS. * * Unlike live providers (which return metadata + abstracts), the canon * carries the *conceptual content* — each entry encodes the work's core * thesis so the analyst can use it as an analy

**Exports :** `CanonTradition`, `CanonEntry`

### `episodic-memory.ts` — 420 lignes

* REMEM: Episodic Memory with Hybrid Graph (Gists + Facts) * * Based on: arXiv 2026 "REMem: Episodic Memory with Hybrid Graph for Long-Range * Reasoning in Agentic Systems" * * Maintains a hybrid memory graph with two types of nodes: * - **Gists**: Compressed summaries of events (with timestamps) — "what happened" * - **Facts**: Temporal triplets (subject, predicate, object, timestamp) — "what we

**Exports :** `Gist`, `TemporalFact`, `EpisodicMemoryGraph`, `EpisodicRetrievalResult`, `createEpisodicMemory`, `addGist`, `addFact`, `retrieveEpisodic`, `buildEpisodicMemoryInjection`, `EpisodeRecord`, `RetrievedEpisode`, `retrieveEpisodes`

### `foresight-delphi.ts` — 1042 lignes

* FORESIGHT DELPHI — Professional-grade multi-expert scenario forecasting * * Based on proven methods from the Good Judgment Project, IARPA, and 2026 research: * * 1. BASE RATE COMPUTATION (Tetlock, Superforecasting) * - Historical base rates are the #1 predictor of forecasting accuracy * - LLM analyzes historical analogues to establish priors * * 2. FERMI DECOMPOSITION (Fermi estimation, GJP) * -

**Exports :** `DelphiScenario`, `DelphiResult`, `remapToScenarioNames`, `partitionEvidence`, `extremize`, `plattScale`, `normalize`, `runDelphiForesight`

### `foresight-graph.ts` — 218 lignes

* Foresight GraphRAG — entity graph from academic sources + scenarios * Clean-room alternative to MiroFish seed graph (no AGPL code)

**Exports :** `SourceEvidence`, `ForesightNode`, `ForesightEdge`, `ForesightGraph`, `ScenarioSpec`, `buildForesightGraph`, `graphScenarioBoost`

### `foresight-social.ts` — 161 lignes

* Dual-channel social dynamics — SignalStream + PolicyForum * Clean-room inspired by OASIS (Twitter/Reddit parallel) without AGPL code

**Exports :** `SocialChannel`, `SocialPost`, `SocialFeed`, `createEmptyFeed`, `SocialTickResult`, `runSocialTick`, `summarizeFeed`

### `foresight-swarm.ts` — 122 lignes

* Hierarchical swarm — 512 numeric crowd agents + voice leader personas * Scales like OASIS without 512 LLM calls per tick

**Exports :** `CrowdAgent`, `spawnCrowd`, `propagateCrowd`, `aggregateCrowdMomentum`, `syncLeadersFromCrowd`

### `foresight-types.ts` — 32 lignes

Shared types for Foresight Engine modules (breaks circular imports)

**Exports :** `PersonaArchetype`, `PersonaActionType`, `SwarmLeader`, `SimulationTickEventLite`

### `frozen-inputs.ts` — 119 lignes

* Frozen-inputs store — the non-LLM companion to the cassette. * * The LLM cassette (`lib/llm/cassette.ts`) freezes request/response pairs, * but several pipeline inputs bypass the LLM boundary entirely and mutate * between record and replay: agent-memory lesson reads (every run WRITES * new lessons, so the next replay sees a different set), researcher * profiles/positions (a record run persists t

**Exports :** `seedFrozenInputs`, `snapshotFrozenInputs`, `hasFrozenInputs`, `hasFrozenInput`, `mergeInputsIntoStats`, `captureInput`, `captureInputSync`, `captureInputFifo`

### `hypothesis-engine.ts` — 438 lignes

* NomosX HYPOTHESIS ENGINE — Framing + Judgment * * Transforms the pipeline from "critique downstream" to "hypothesis upstream", * the working method of elite consultancies (McKinsey's hypothesis-driven * problem solving, RAND's analytic tradecraft): * * 1. FRAMING (before analysis): decompose the question into 3-5 testable * hypotheses, each with explicit evidence requirements. * 2. JUDGE (after

**Exports :** `Hypothesis`, `FramingOutput`, `HypothesisVerdict`, `JudgeOutput`, `framingAgent`, `hypothesisJudge`, `checkThesisAdherence`, `DerivedThesis`, `deriveThesisFromCorpus`

### `knowledge-graph-pagerank.ts` — 543 lignes

* Knowledge Graph Multi-Hop Retrieval — NomosX Sprint 6 (Gap 5) * * Retrieval multi-hop sur le knowledge graph via Personalized PageRank. * Inspiré de : * - HippoRAG (OSU-NLP-Group, NeurIPS 2024, arxiv 2405.14831) — hippocampal indexing + PageRank * - LightRAG (HKUDS/LightRAG, EMNLP 2025) — dual-level retrieval * - GraphRAG (Microsoft, 2024) — community detection + global search * * Le problème :

**Exports :** `GraphNode`, `GraphEdge`, `MultiHopResult`, `MultiHopConfig`, `DEFAULT_MULTIHOP_CONFIG`, `personalizedPageRank`, `calculateHopDistances`, `multiHopRetrieve`, `isMultiHopQuery`

### `knowledge-graph.ts` — 775 lignes

* NomosX KNOWLEDGE GRAPH — Concept Store & Longitudinal Memory * * A pgvector-backed concept store that tracks knowledge across briefs: * * 1. Extracts key concepts from each analysis (entities, claims, relationships) * 2. Stores concept embeddings for semantic retrieval * 3. Links concepts to sources, briefs, and other concepts * 4. Tracks concept evolution over time (longitudinal tracking) * 5.

**Exports :** `Concept`, `ConceptType`, `ConceptRelation`, `RelationType`, `ConceptExtractionResult`, `KnowledgeQueryResult`, `LongitudinalInsight`, `extractAndStoreConcepts`, `queryKnowledgeGraph`, `getLongitudinalInsights`, `WorkingMemoryCluster`, `ExperienceMemoryEntry`

### `knowledge-infrastructure.ts` — 589 lignes

* NomosX Knowledge Graph + Experience Bank + Context Compression * * Three infrastructure innovations from 2026 research: * * 1. KNOWLEDGE GRAPH (Agents-K1, arxiv 2026): * Converts papers into typed knowledge graphs with entities, claims, * mechanisms, method lineages. Enables multi-hop reasoning. * * 2. EXPERIENCE BANK (TMAS, ICML 2026): * Persistent memory of past analyses. Reusable conclusions,

**Exports :** `KGEntity`, `KGRelation`, `KnowledgeGraph`, `buildKnowledgeGraph`, `normalizeKGEntity`, `ExperienceEntry`, `GuidelineEntry`, `recordExperience`, `recordGuideline`, `getRelevantExperience`, `getRelevantGuidelines`, `extractExperience`

### `memory-consolidation.ts` — 249 lignes

* Memory Consolidation — STM→LTM promotion (AgeMem / memorywire pattern). * * The pipeline stores episodic records (EPISODE_STORED) and procedural * lessons (LESSON_LEARNED), but nothing compresses recurring experience into * durable SEMANTIC knowledge. Without consolidation, episodic memory grows * forever and never becomes "what we know". * * This cron-side module: * 1. Reads recent episodes + l

**Exports :** `ConsolidationResult`, `getSemanticPatterns`, `consolidateEpisodicMemory`

### `meta-analysis-engine.ts` — 527 lignes

* NomosX META-ANALYSIS ENGINE * * Statistical aggregation of effect sizes across multiple sources. * This is what separates a real think tank from a glorified summarizer: * * 1. Collects quantitative data from READER V3 outputs * 2. Standardizes effect sizes (Cohen's d, Hedges' g, odds ratios → common scale) * 3. Computes weighted pooled estimates (inverse-variance weighting) * 4. Assesses heterog

**Exports :** `EffectSizeEntry`, `PooledEstimate`, `HeterogeneityStats`, `PublicationBiasAssessment`, `ForestPlotEntry`, `MetaAnalysisResult`, `metaAnalysisEngine`

### `pathmind-kg.ts` — 273 lignes

* PathMind — Retrieve-Prioritize-Reason KG Reasoning — NomosX * * Inspired by: * - PathMind (AAAI 2026, S15-10): Retrieve-Prioritize-Reason framework for * knowledge-graph reasoning with semantic-aware path priority. Combines * A*-style cost + future-cost estimation with beam search to produce * high-quality reasoning chains. Enhances EvoMemKG (K12) by adding * priority-driven path selection over

**Exports :** `KGEdge`, `KGPath`, `PathPriorityConfig`, `DEFAULT_PATH_CONFIG`, `pathPriority`, `beamSearch`, `rankPaths`, `extractReasoningChain`

### `phd-researcher.ts` — 2286 lignes

* NomosX PhD RESEARCHER AGENTS — Phase 3 Domain Expert Council (22 domains) * * 22 specialized PhD-level domain experts, each with: * - Deep domain knowledge encoded in system prompts * - Specific analytical frameworks (econometrics, ML theory, policy analysis...) * - Calibrated confidence (knows what it doesn't know) * - Academic citation standards (APA-level rigor) * * Architecture optimized for

**Exports :** `runExpertAnalysis`, `detectRelevantExperts`, `determineOptimalExpertCount`, `runExpertCouncil`

### `playbook.ts` — 202 lignes

* PLAYBOOK — ACE-style evolving context (Agentic Context Engineering, ICLR 2026). * * Instead of static prompts, each agent role maintains a curated playbook of * durable strategy bullets that accumulate, refine, and get pruned over runs. * Unlike distilled summaries (which suffer brevity bias / context collapse), * entries are structured, incremental, and individually scored — the store * keeps t

**Exports :** `PlaybookOp`, `PlaybookBullet`, `recordPlaybookDelta`, `getPlaybook`, `getPlaybookBlock`, `curatePlaybook`

### `policy-stress-tester.ts` — 136 lignes

* POLICY STRESS TESTER — NomosX * * Stress-teste les recommandations d'un think tank a la maniere de Civica : * plusieurs archetypes specialises (economiste, juriste, industriel, etc.) * identifient les risques, groupes affectes et mecanismes pour chaque * recommandation, puis un coordinateur synthetise le resultat. * * Inspiration : Civica (Shlok-Ippala) — multi-agent policy stress test.

**Exports :** `StressRecommendation`, `StressRisk`, `StressTestResult`, `StressTestOptions`, `stressTestRecommendations`, `renderStressTest`

### `prediction-auditor.ts` — 360 lignes

* NomosX PREDICTION AUDITOR — Retrospective Accuracy Tracking * * P2-G: Each PhD researcher makes predictions with probability + timeframe. * This agent checks whether past predictions have been validated or falsified * by new evidence arriving in subsequent pipeline runs. * * Flow: * 1. Load all stored predictions from AgentAuditLog (type: "prediction") * 2. For each prediction past its timeframe

**Exports :** `PredictionAuditResult`, `PredictionAuditOutput`, `runPredictionAuditor`

### `prediction-markets.ts` — 278 lignes

* Prediction Market Integration — External forecast validation * * Integrates real-time prediction market data to ground Delphi forecasts * in market expectations. Prediction markets are often more accurate than * individual experts (Wisdom of Crowds, Hayek's information aggregation). * * Sources: * - Polymarket (public API, no key needed) * - Metaculus (public API, no key needed) * * Usage in for

**Exports :** `MarketPrediction`, `MarketDataResult`, `fetchPredictionMarketData`, `blendWithMarket`

### `prediction-registration.ts` — 272 lignes

* NomosX PREDICTION REGISTRATION — T10 * * Extracts testable predictions from the analysis output and registers them * in the Prediction table for retrospective auditing. * * A prediction is a claim about the future with: * - A horizon (when it will be testable) * - Resolution criteria (what observable fact would confirm/refute) * - A confidence tier (from pruning gates trust propagation) * - Sour

**Exports :** `extractPredictions`, `registerPredictions`

### `prediction-tracker.ts` — 453 lignes

* Prediction Tracker & Calibration — NomosX * * Inspired by: * - Forecasting Agent (NYU Agentic Learning Lab, +0.18 info coefficient) * - predict-raven (Polymarket live agent) * - Outcome-based RL for Forecasting (14B model matche o1, beats on calibration) * - ConfidenceBench (2026): Calibration benchmark for LLMs * - Scenario Lab (MCTS for branching futures) * * Architecture: * - Store each SCATT

**Exports :** `Prediction`, `CalibrationReport`, `storePrediction`, `storePredictionsFromHypotheses`, `parseHorizonDue`, `findPredictionsDueForEvaluation`, `resolveDuePredictions`, `evaluatePrediction`, `generateCalibrationReport`, `formatCalibrationContext`

### `prediction-watch.ts` — 223 lignes

* PREDICTION WATCH — closes the forecast loop (P2/7). * * Predictions are registered OPEN with `whatWouldFalsify` / `resolutionCriteria` * triggers (prediction-registration.ts). Until now nothing compared today's * news flow against those triggers — predictions were write-only memory. * * Each radar cycle, incoming topics are matched against OPEN predictions' * trigger text. A match means the worl

**Exports :** `TriggerMatch`, `matchPredictionTriggers`, `runPredictionWatch`

### `prompt-optimizer/index.ts` — 28 lignes

* Prompt Optimizer module — NomosX Sprint 6 (Gap 1) * * Optimisation end-to-end des prompts via "textual gradients" (DSPy/TextGrad/Trace-OPTO). * * @see ROADMAP_2026.md — Gap 1

**Exports :** `—`

### `prompt-optimizer/prompt-optimizer.ts` — 649 lignes

* Prompt Optimizer — NomosX Sprint 6 (Gap 1) * * Optimisation end-to-end des prompts des agents via "textual gradients". * Inspiré de : * - DSPy (stanfordnlp/dspy) — prompt optimization via BootstrapFewShot, MIPRO * - TextGrad (zou-group/textgrad) — backprop textuelle PyTorch-style * - Trace / OPTO (microsoft/Trace, NeurIPS 2024) — AutoDiff-like pour workflows * * Le problème : * Le Witness *suggè

**Exports :** `PromptVersion`, `FeedbackSource`, `PromptOptimizationInput`, `OptimizationFeedback`, `PromptOptimizationResult`, `getPromptVersions`, `getActivePromptVersion`, `registerPromptVersion`, `setActivePromptVersion`, `optimizePrompt`, `updatePromptMetrics`, `optimizeAllPrompts`

### `researcher-identity.ts` — 559 lignes

* NomosX RESEARCHER IDENTITY — Persistent Intellectual Personas * * Each PhD researcher is not a stateless prompt — they are an intellectual * entity with a history of positions, a track record of predictions, and * the ability to evolve their views based on new evidence. * * This is what makes NomosX publications genuinely superior: * Dr. Ploutos has published 23 analyses. She predicted in March

**Exports :** `ResearcherPosition`, `PredictionRecord`, `ResearcherProfile`, `PositionUpdate`, `storeResearcherPosition`, `storePrediction`, `buildResearcherProfile`, `ResearcherPositionRecord`, `ResearcherPredictionRecord`, `ResearcherTrackRecord`, `getResearcherTrackRecord`, `detectPositionEvolution`

### `researcher-kb/index.ts` — 3978 lignes

* NomosX RESEARCHER KNOWLEDGE BASE SYSTEM * * Each PhD researcher has: * 1. A dedicated knowledge base (key concepts, frameworks, reference papers) * 2. Domain-specific tools (APIs they can query directly) * 3. Private memory (past analyses, predictions, lessons learned) * 4. Methodology preferences (how they approach research) * * This replaces the shallow "system prompt only" approach with * tru

**Exports :** `ResearcherKB`, `KeyConcept`, `AnalyticalFramework`, `ReferencePaper`, `DataSource`, `MethodologyProfile`, `QualityCriteria`, `RESEARCHER_KBS`, `getResearcherKB`, `buildKBInjection`, `getResearcherDataSources`, `getAllKBs`

### `researcher-ownership.ts` — 2122 lignes

* NomosX Researcher Ownership System * * CTO-Level Architecture: Domain-based editorial ownership system * Maps PhD researchers to their primary domains with pipeline tier selection. * * Purpose: * - Assign editorial responsibility for research domains * - Select appropriate pipeline tiers based on topic complexity * - Provide researcher sign-off mechanisms for quality control * - Enable domain-sp

**Exports :** `getResearcherUIName`, `getResearcherUITitle`, `getResearcherUIInstitution`, `ResearcherProfile`, `RESEARCHER_REGISTRY`, `VERTICAL_RESEARCHER_MAP`, `getVerticalForTopic`, `getLeadResearcherForVertical`, `getProvidersForVertical`, `PipelineTier`, `PipelineTierConfig`, `PIPELINE_TIERS`

### `scenario-architect.ts` — 165 lignes

* Scenario Architect — the Shell method, made structural. * * The classic failure mode of LLM scenarios: three variants of the same * future (optimistic/base/pessimistic on one implicit dimension). Shell's * method avoids this by construction: * * 1. PREDETERMINED ELEMENTS — what is already certain ("it has rained in * the mountains, so it will flood in the plains"). These belong in * EVERY scenar

**Exports :** `CriticalUncertainty`, `ScenarioSkeleton`, `ScenarioArchitecture`, `architectScenarioMatrix`, `architectureToPromptBlock`

### `scenario-engine.ts` — 504 lignes

* NomosX Causal Analogical Researcher (CANA) + SCATTER + Courtroom Debate * * Three innovations from 2026 research for scenario-rich analysis: * * 1. CANA (arxiv 2026): Causal Analogical Researcher * Finds historical analogies by UNDERLYING MECHANISM, not surface similarity. * +10% vs deep research agents on ADR-bench. * Key insight: LLMs match on surface features. CANA decomposes situations * int

**Exports :** `CausalMechanism`, `HistoricalAnalogue`, `CanaResult`, `runCana`, `Hypothesis`, `ScatterResult`, `runScatter`, `DebateArgument`, `DebateResult`, `runCourtroomDebate`

### `scenario-pack.ts` — 107 lignes

* SCENARIO PACK - NomosX * * Modele des scenarios de niveau think tank: moteurs, points de bascule, * signaux d'alerte precoce et sensibilite aux hypotheses. * * Inspirations : RAND Foresight, Chatham House Scenarios, Shell Scenarios.

**Exports :** `ScenarioPackOptions`, `ScenarioOutlook`, `ScenarioModeling`, `generateScenarioModeling`, `renderScenarioModeling`

### `self-evolver.ts` — 1016 lignes

* SELF-EVOLVER — NomosX * * Agent autonome qui ameliore ses propres prompts a partir des experiences passees. * Inspiration : HyperAgents, SePO, FAPO, Karpathy autoresearch, EvoTool, canvas-org/meta-agent. * * Principe : apres chaque run, le Self-Evolver : * 1. collecte les lecons et echecs * 2. propose une mutation ciblee du prompt system * 3. evalue l'ancien vs le nouveau via un juge * 4. garde

**Exports :** `PromptVersion`, `EvolutionResult`, `EvolverConfig`, `collectEvolutionSignal`, `proposePromptMutation`, `scorePromptVariant`, `evolveAgentPrompt`, `getLatestPrompt`, `runEvolutionCycle`, `MagesubgraphType`, `MAGEExperienceNode`, `MAGESkillNode`

### `simulation-agent.ts` — 1475 lignes

* Simulation Agent — NomosX Foresight Engine v3 * ────────────────────────────────────────────── * Surpasses MiroFish/OASIS on: GraphRAG + 512-agent swarm + dual-channel social * + multi-seed robustness + academic calibration + adversarial gate.

**Exports :** `PersonaArchetype`, `StakeholderPersona`, `SimulationScenarioSpec`, `SimulationInput`, `MonteCarloConfig`, `ConvergenceResult`, `SensitivityEntry`, `SensitivityMatrix`, `PersonaActionType`, `SimulationTickEvent`, `SimulationScenarioState`, `SimulationTick`

### `skill-bank.ts` — 109 lignes

* SKILL BANK — NomosX * * Procedural memory for research strategies (FlowEvo/SkillGLoW pattern, 2026). * When a pipeline run produces a high-trust result, the winning configuration * (domain → providers + lens types) is compiled into a reusable "skill". * * On subsequent runs in the same domain, proven skills bias retrieval toward * the provider/lens mix that previously produced trust ≥ 80. * * St

**Exports :** `SkillRecord`, `ProvenSkill`, `recordSkill`, `getProvenSkill`, `applySkillToProviders`

### `synapse-memory.ts` — 275 lignes

* SYNAPSE: Spreading Activation Memory for Agentic Systems * * Based on: ACL 2026 "Synapse: Spreading Activation Memory for Long-Range * Reasoning in Agents" * * Unified episodic-semantic memory with spreading activation: * - When a node is activated (by query match), activation spreads to * neighboring nodes in the graph * - Lateral inhibition: strongly activated nodes suppress weak neighbors * (

**Exports :** `MemoryNode`, `MemoryEdge`, `SynapseGraph`, `SynapseRetrievalResult`, `createSynapseGraph`, `addMemoryNode`, `connectMemories`, `retrieveWithSpreadingActivation`, `buildSynapseMemoryInjection`

### `temporal-memory.ts` — 363 lignes

* Temporal Memory — NomosX Sprint 6 (Gap 9) * * Bi-temporal knowledge tracking for the World Model. * Inspired by : * - Graphiti (getzep/graphiti) — temporal knowledge graph with bi-temporal validity * - Zep (getzep/zep) — long-term memory with temporal context * - HippoRAG — neurobiologically inspired long-term memory * * Le problème : * Le World Model et Agent Memory de NomosX sont *snapshot*. O

**Exports :** `TemporalFact`, `PositionEvolution`, `TemporalQueryOptions`, `recordTemporalFact`, `queryTemporalFacts`, `findCurrentFacts`, `getPositionEvolution`, `ensureTemporalFields`, `buildTemporalMemoryInjection`

### `track-record.ts` — 203 lignes

* Track Record — Brier score display and historical accuracy. * * Inspired by: * - IARPA Good Judgment Project: superforecaster calibration tracking * - Friedman et al. 2017 (888K forecasts): numeric probabilities are more informative * - Tetlock: "the assertion-to-evidence ratio" matters * * This module renders the historical track record of NomosX predictions, * showing calibration (Brier score)

**Exports :** `TrackRecordStats`, `computeTrackRecordStats`, `renderTrackRecordHtml`

### `witness/cognitive-cycle.ts` — 825 lignes

* Witness Cognitive Cycle — NomosX * * Le cycle cognitif à 6 phases du Witness : * PERCEIVE → INTERPRET → EVAL → INTEND → PLAN → ACT * * Une cycle = une observation d'une étape du pipeline. * Le Witness reçoit l'observation, l'interprète, l'évalue contre les * attentes, décide s'il doit intervenir, planifie l'intervention, * et l'exécute (via WriteGuard). * * Inspiré de Sakshi (Witness pattern) +

**Exports :** `WitnessConfig`, `DEFAULT_WITNESS_CONFIG`, `Witness`

### `witness/integration.ts` — 218 lignes

* Witness Integration — NomosX * * Câble le Witness dans le pipeline de production. * Le Witness observe chaque étape du pipeline et peut intervenir. * * Usage : * const witnessCtx = createWitnessContext(runId, query, budgetCapUsd); * // ... after each pipeline step: * await witnessCtx.witness.observe(observation); * // ... at the end: * const learning = await witnessCtx.finalize();

**Exports :** `WitnessContext`, `createWitnessContext`, `buildObservation`

### `witness/meta-loop.ts` — 487 lignes

* Witness Meta-Loop & Cross-Run Learning — NomosX * * La méta-loop (MONITOR → ASSESS → CONTROL) tourne au-dessus du cycle * cognitif. Elle observe la santé globale du run, pas juste une étape. * * L'auto-amélioration entre les runs : après chaque pipeline run, le Witness * extrait des leçons et propose des modifications de prompts et de seuils * pour les runs futurs. C'est la couche 4 — le système

**Exports :** `MetaLoopResult`, `runMetaLoop`, `extractRunLearning`, `getPastLearnings`, `buildLearningInjection`

### `witness/seams.ts` — 474 lignes

* Witness Seams — NomosX * * Les "seams" typés du Witness : les interfaces que le host (pipeline) * doit implémenter pour que le Witness puisse observer et intervenir. * * Inspiré de Sakshi (bionicbutterfly13/sakshi) — le Witness observe * via des seams typés sans jamais posséder la cognition. * * Quatre seams principaux : * 1. EventBus — émission d'événements (cycle traces, anomalies) * 2. GoalSt

**Exports :** `EventBus`, `ConsoleEventBus`, `DatabaseEventBus`, `GoalStateStore`, `InMemoryGoalStateStore`, `WriteGuard`, `DenyByDefaultWriteGuard`, `AlwaysPermitWriteGuard`, `ProductionWriteGuard`, `Clock`, `SystemClock`, `DeterministicClock`

### `witness/types.ts` — 306 lignes

* Witness Types — NomosX * * Types et interfaces du Witness pattern (méta-conscience). * Inspiré de Sakshi (bionicbutterfly13/sakshi) — le Witness observe * le pipeline sans faire le travail lui-même. * * Le Witness : * - Observe chaque cycle du pipeline via des seams typés * - Évalue si le résultat correspond aux attentes * - Peut intervenir (via WriteGuard) quand quelque chose va mal * - Apprend

**Exports :** `CognitivePhase`, `MetaPhase`, `CycleTrace`, `PhaseResult`, `CycleAssessment`, `AnomalyType`, `AnomalyEvent`, `InterventionType`, `InterventionRecord`, `GuardVerdict`, `GuardDecision`, `StepExpectation`

### `world-model/world-model.ts` — 825 lignes

* World Model — NomosX * * Le World Model est la mémoire persistante du système. Il accumule * la connaissance à travers les runs : quels domaines ont été explorés, * quelles sont les positions établies, quelles sont les controverses * actives, quelles sont les connexions inter-domaines. * * C'est le moat le plus durable : après des milliers de runs, le système * a une compréhension du monde que l

**Exports :** `DomainMemory`, `ConceptEntry`, `PositionEntry`, `ControversyEntry`, `SourceEntry`, `ParadigmShiftEntry`, `CrossDomainLink`, `queryWorldModel`, `updateWorldModel`, `EpisodicMemoryEntry`, `SemanticMemoryRule`, `WorldEvolverState`


## Lenses, MoA, PRM, self-play, witness submodules — 22 modules

### `brief-html-extract.ts` — 91 lignes

* Extract teasers from brief HTML — legacy executive summary + Editorial V2 position-first.

**Exports :** `isPositionFirstBrief`, `extractInstituteVerdict`, `extractDetectedSubject`, `extractBriefSummary`

### `chart-generator.ts` — 254 lignes

* Chart Generator — SVG Charts for Pipeline HTML Reports * * Generates inline SVG charts that can be embedded directly in HTML briefs * and strategic reports without requiring client-side JavaScript. * * Used by: renderBriefHTML, renderStrategicReportHTML

**Exports :** `renderEvidenceGaugeSVG`, `BarChartItem`, `renderHorizontalBarSVG`, `DonutItem`, `renderDonutSVG`, `ScenarioData`, `renderScenariosSVG`, `renderSourceDistributionSVG`, `StakeholderData`, `renderStakeholderImpactSVG`

### `durable-execution.ts` — 444 lignes

* Durable Execution — NomosX Sprint 6 (Gap 12) — ÉVALUATION * * Évaluation des options pour remplacer la job queue par une orchestration durable. * Inspiré de : * - Temporal (temporal.io) — durable workflows with replay * - Inngest AgentKit — AI-native durable orchestration * - Rivet agentOS — durable workflows with WebAssembly * * Le problème : * La job queue NomosX est priority-based mais pas *d

**Exports :** `DurableExecutionState`, `StepResult`, `runDurableStep`, `durableResume`, `markDurableComplete`, `saveDurableStep`, `durableKeyFor`, `initDurableRun`, `DurableExecutionOption`, `DURABLE_EXECUTION_OPTIONS`

### `hero-image.ts` — 610 lignes

* NomosX Hero Image Generator — generates symbolic illustrations * for publication heroes using GPT Image 2. * * Design philosophy — "From Chaos to Nomos", expressed as GREEK FRESCO × AI: * - Each publication gets a mythic figure or tableau — gods, draped beings, * mythological scenes — rendered like a rediscovered ancient fresco: * mineral pigments, weathered plaster, visible craquelure * - The a

**Exports :** `HeroImageResult`, `HeroArticleContext`, `generateHeroImage`, `saveHeroImage`

### `index-agent.ts` — 500 lignes

* INDEX Agent * Normalizes sources, enriches identities (ROR/ORCID), and deduplicates

**Exports :** `indexAgent`, `deduplicateSources`

### `json-utils.ts` — 163 lignes

* Shared JSON utilities — robust parsing for LLM outputs. * * LLMs (especially GLM, DeepSeek) frequently wrap JSON in markdown fences * (```json ... ```), truncate long outputs, or append trailing text. * These utilities handle all those cases gracefully.

**Exports :** `stripJsonMarkdownFences`, `repairTruncatedJson`, `parseJson`, `parseJsonOrThrow`

### `langfuse.ts` — 312 lignes

* Langfuse Observability — NomosX Sprint 6 (Gap 11) * * Intégration de Langfuse (TypeScript natif) pour l'observabilité des LLM calls. * Langfuse : tracing distribué, cost tracking, prompt management, datasets. * * Le problème : * NomosX a des dashboards custom mais pas d'observabilité production-grade * avec tracing distribué, traçage des coûts, gestion des prompts, etc. * * Architecture : * 1. W

**Exports :** `LangfuseConfig`, `LangfuseTrace`, `LangfuseScore`, `queueTrace`, `queueScore`, `traceLLMCall`, `tracePipelineStart`, `tracePipelineEnd`, `scorePipeline`, `flushAll`

### `lenses/lens-agent.ts` — 226 lignes

* Lens Agent — gives each search lens its own PhD-level intelligence. * * A lens is no longer a query template. The lens agent: * 1. Receives the question + its knowledge profile + the sources found * 2. Judges whether its knowledge suffices (self-assessment) * 3. If not, generates targeted fetch queries for ITS providers/canon * 4. Produces a lens insight — a mini-analysis in its disciplinary voi

**Exports :** `LensInsight`, `runLensAgent`, `lensFetchProviders`, `LensTension`, `checkLensTensions`

### `lenses/lens-knowledge.ts` — 195 lignes

* Lens Knowledge — PhD-level intellectual profiles for each search lens. * * A lens is not a query template: it is a way of knowing. Each profile encodes * the intellectual tradition, methodology, signature questions, and blind * spots a doctoral-level specialist would bring — plus the providers and * canon works that field draws on when its knowledge runs out.

**Exports :** `LensKnowledge`, `LENS_KNOWLEDGE`

### `pdf-export.ts` — 41 lignes

* PDF EXPORT — Convert HTML briefs/reports to print-optimized HTML * * Note: Puppeteer-based PDF generation is disabled for Netlify builds. * Users can Ctrl+P the HTML output to save as PDF. * * The HTML includes: * - Professional typography * - Print-optimized layout * - Color preservation

**Exports :** `generatePrintHTML`

### `position-first-brief.css.ts` — 1006 lignes

* Shared CSS for position-first brief HTML (Editorial V2). * Values mirror --nx-* tokens from app/globals.css (standalone briefs load Barlow via Google Fonts).

**Exports :** `POSITION_FIRST_BRIEF_CSS`

### `position-first-renderer.ts` — 711 lignes

* Position-first brief renderer — Editorial V2 public format. * * The NomosX DNA: "From Chaos to Nomos" — every report performs the movement * from disorder to order. The 4-act structure maps to our method: * I. The Question (Map) — define the question, show the chaos * II. The Evidence (Confront)— our position, the evidence, the counter-argument * III. The Futures (Quantify)— scenarios as narrati

**Exports :** `CentralScenarioLabels`, `renderCentralScenarioBlock`, `renderPositionFirstBriefHTML`

### `provider-health-tracker.ts` — 301 lignes

* NomosX PROVIDER HEALTH TRACKER — Circuit Breaker for Data Sources * * P3-K: Tracks provider failure rates and temporarily blacklists * providers that are consistently failing, avoiding wasted API calls. * * Features: * - Tracks success/failure per provider in Redis (with DB fallback) * - Circuit breaker: blacklist provider after 3 consecutive failures * - Auto-recovery: re-enable after 30 minute

**Exports :** `ProviderHealth`, `ProviderCallResult`, `recordProviderCall`, `isProviderHealthy`, `isProviderEmptyDegraded`, `getHealthyProviders`, `getProviderHealthReport`, `resetProvider`

### `provider-queue.ts` — 216 lignes

* NomosX PROVIDER QUEUE — Backpressure control for 200+ academic providers. * * Instead of launching all providers in parallel via Promise.allSettled(), * this module wraps calls in a concurrency-limited queue with: * - Per-provider concurrency caps (configurable) * - Global concurrency cap (prevents thundering herd) * - Request deduplication (same query+provider = 1 call) * - Circuit breaker inte

**Exports :** `QueuedCallOptions`, `queuedProviderCall`, `queuedBatchCalls`, `getQueueStats`, `resetQueue`

### `redis-rest.ts` — 94 lignes

* Upstash REST-backed Redis client. * * The deployment only has UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN * (HTTP API credentials) — no rediss:// TCP endpoint — so ioredis cannot * connect and every cache/rate-limit path silently degrades. The Upstash * REST API accepts the same commands as a JSON array over HTTPS, which * covers the entire method surface NomosX actually uses * (get/setex/

**Exports :** `createUpstashRestClient`

### `redis-simple.ts` — 345 lignes

* NomosX REDIS CONFIGURATION - Simplified Version * Configuration Redis simplifiée pour éviter les erreurs de compatibilité

**Exports :** `SimpleRedisConfig`, `simpleRedisConfig`, `SimpleRedisManager`, `SimpleCacheUtils`, `simpleRedisManager`

### `resilience.ts` — 225 lignes

* NomosX RESILIENCE LAYER — Cockatiel-based bulkhead + retry policies. * * This module provides: * - Bulkhead isolation: limits concurrent LLM calls per provider * - Retry with exponential backoff + jitter (Cockatiel's built-in) * - Timeout escalation: increases timeout on each retry attempt * - Circuit breaker integration: delegates to the existing custom breaker * * Used as a wrapper around LLM

**Exports :** `createLLMRetryPolicy`, `withLLMResilience`, `getBulkheadStats`, `recordAdaptive429`, `recordAdaptiveSuccess`, `getAdaptiveRate`, `getAdaptiveRateStats`

### `smart-provider-selector.ts` — 538 lignes

* Smart Provider Selector * * Intelligently selects the best providers and quantities * based on domain and question complexity * * Best Practices 2026: Context-aware, intelligent defaults

**Exports :** `Provider`, `SmartSelection`, `detectDomain`, `estimateComplexity`, `selectSmartProviders`

### `strategic-report-renderer.ts` — 813 lignes

* Strategic Report HTML Renderer * Renders comprehensive 10-15 page Strategic Reports with: * - Professional styling * - Table of contents * - Section numbering * - Source references * - Charts placeholders

**Exports :** `dedupeCitations`, `renderStrategicReportHTML`

### `svg-charts.ts` — 255 lignes

* SVG Chart Generator — inline SVG visualizations for strategic reports. * * Inspired by: * - CSIS: "data-rich graphics and maps that provide fresh insights" * - IISS Strategic Survey: "Data-rich graphics and maps" * * Generates static SVG (no JS) that renders in any browser/email client. * Supports: line charts (trends), bar charts (comparisons).

**Exports :** `renderLineChartSvg`, `renderBarChartSvg`, `renderScenarioChartSvg`, `injectQuantSection`

### `translation-service.ts` — 279 lignes

* Publication Translation Service * * On-demand translation of published articles using GPT-4. * Translations are cached in the `PublicationTranslation` table. * * Flow: * 1. User visits /fr/inquiry/[slug] * 2. Look up existing translation in DB * 3. If found → return cached translation * 4. If not → call GPT to translate, store in DB, return * * The original article is never modified. Translation

**Exports :** `TranslationResult`, `getPublicationInLocale`

### `types/index.ts` — 260 lignes

* NomosX Unified Type System * * Single source of truth for all shared types across the agent system. * Prevents circular dependencies and type conflicts.

**Exports :** `DomainExpertise`, `ExpertAnalysis`, `EvidenceAssessment`, `Prediction`, `ExpandedPhDResearcher`, `PipelineCoreOptions`, `DataLineage`, `AutoPublisherLineage`, `PublicationResult`, `AutoPublisherOutput`, `CouncilConfig`, `EnhancedSynthesisReport`

