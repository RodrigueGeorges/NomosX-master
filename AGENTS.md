# NomosX Agents

**Complete specification of the agentic pipeline**

---

## 🧠 Agent Philosophy

Each agent in NomosX has:
- **Single responsibility**: One clear task
- **Deterministic behavior**: Same inputs → same outputs (within LLM variance)
- **Traceable outputs**: All decisions logged
- **Fail-safe**: Graceful degradation on errors
- **Self-correction**: Each phase assesses its own quality and retries if low (Reflexion pattern)
- **Human feedback learning**: Manual corrections are recorded and converted to lessons
- **Metacognitive observation**: The Witness observes every step, detects anomalies, can intervene, and learns across runs

Agents communicate via:
- Database (Prisma ORM)
- Job queue (priority-based)
- JSON payloads (structured data)
- Pipeline blackboard (shared context, gap requests, findings)

---

## 🔄 Self-Correction Layer (2026-08 Upgrade)

The pipeline now includes a **self-correction layer** inspired by Reflexion (NeurIPS 2023) and MASC (ACL 2026):

### After READER (`selfCorrectReader`)
- Assesses: claims extracted, confidence distribution, specificity
- If score < 50: re-runs READER with feedback injected via `memoryBlock`
- Max 1 retry, keeps the better version
- Logged to `AgentAuditLog` with action `SELF_CORRECTION`

### After ANALYST (`selfCorrectAnalyst`)
- Assesses: citation count, addresses question, non-trivial synthesis, debate sections
- If score < 50: re-runs ANALYST with feedback injected into `contextBlock`
- Max 1 retry, keeps the better version
- Logged to `AgentAuditLog` with action `SELF_CORRECTION`

### Orchestrator Actions (now ACTED, not just logged)
- **DEEPEN** (after READER): triggers PDF full-text extraction for sources without abstracts
- **RE_ANALYZE** (after ANALYST): re-runs ANALYST with strengthened citation requirements
- Both respect `maxIterations` to prevent infinite loops

### Gap-Fill Re-Analysis (critical fix)
- When ANALYST identifies evidence gaps → SCOUT fills them → **ANALYST is now re-executed** with the new sources
- Before this fix, the ANALYST was never re-run with gap-filled sources (only the HTML renderer benefited)
- The better version (by citation count + length) is kept

---

## 👨‍🏫 Human Feedback Learning (2026-08 Upgrade)

The system now learns from **manual corrections**:

### API: `POST /api/feedback/learn`
Submit a correction with:
- `briefId`, `agentId`, `section`, `originalText`, `correctedText`
- `correctionType`: factual_error | missing_citation | wrong_citation | bias | incomplete | misleading | style | other
- `comment` (optional)

The correction is:
1. Recorded in `AgentAuditLog` with action `HUMAN_CORRECTION`
2. An LLM extracts a **generalizable lesson** from the correction
3. The lesson is stored with `source: 'HUMAN_CORRECTION'` and **weight × 1.5** (human signals are stronger than auto-extracted)
4. Future runs inject these lessons via `buildMemoryInjection()`

### Dashboard: `/learning`
- Total lessons (auto + human), corrections, self-corrections
- Improvement rate (self-corrections that improved the score)
- Per-agent breakdown with success rates
- Recent lessons with severity, category, source badge
- Recent self-corrections with score delta
- Recent human corrections with type and comment

---

## 🤖 Agentic Layer (2026-08 Sprint 2-3 — State of the Art)

The pipeline now supports **true agentic reasoning** via three new modules:

### Tool Calling (`lib/llm/unified-llm.ts`)
- `LLMRequest` now accepts `tools: ToolDefinition[]` and `toolChoice`
- `LLMResponse` now returns `toolCalls: ToolCall[]` and `finishReason`
- Works across all providers: OpenAI, DeepSeek, GLM, Kimi (OpenAI-compatible format) + Anthropic (native format)
- This was the **critical bottleneck** — without tool calling, no ReAct loop was possible

### ReAct Loop (`lib/agent/react-loop.ts`)
- Bounded Thought → Action → Observation loop
- **max_steps** (default 8-12): prevents infinite loops
- **max_cost_usd** (default $0.30-$0.50): budget hard cap
- **Context compaction** (COMPASS pattern): summarizes old tool results when history > 20 messages
- **Goal reminder** (ReflAct pattern): re-injects the goal every 3 steps
- **Parallel tool calling** (LLMCompiler pattern): executes multiple tool calls in parallel
- **Force final answer**: when budget/steps are exhausted, forces a final synthesis

### Tool Registry (`lib/agent/tool-registry.ts`)
Six tools available to agentic agents:
1. `search_sources` — Search for additional sources on a sub-topic
2. `read_source` — Read a specific source's full content by index
3. `request_debate` — Trigger a structured debate on a contradiction
4. `request_more_sources` — Request sources from specific providers (diversity)
5. `query_knowledge_graph` — Explore cross-domain connections
6. `finish` — Signal that analysis is complete

### Meta-Controller (`lib/agent/meta-controller.ts`)
- LLM-driven replacement for the deterministic orchestrator rules
- Pattern: COMPASS (LLM as controller) + D2Plan (hierarchical planning)
- Takes into account the specific query, not just metrics
- Falls back to deterministic rules if LLM fails or budget is tight
- `planRemainingPhases()` — soft-plans future phases for context

### Agentic ANALYST (`lib/agent/analyst-react.ts`)
- The ANALYST can now **search, read, and debate DURING reasoning**
- Instead of receiving all sources passively, it actively explores
- Activated via `useAgenticAnalyst: true` in pipeline options
- Falls back to classic multipass if ReAct fails
- Output is the same `MultiPassAnalysis` shape (backward compatible)
- ReAct trace stored in `analysis._meta.reactTrace` for debugging

### Dynamic DAG Planner (`lib/agent/dag-planner.ts`)
- The pipeline is no longer a fixed sequence — it's a **DAG that can be replanned**
- `generateInitialPlan()` — creates the initial step graph
- `replanDAG()` — after each step, evaluates if the plan should change:
  - Rule-based: add `broaden_search` if few sources, add `debate` if contradictions, add `self_correction` if low citations
  - LLM-based: the LLM can suggest adding/removing steps based on context
- `pruneOptionalSteps()` — removes optional steps when budget is tight
- `getNextSteps()` — returns steps whose dependencies are satisfied (parallel execution ready)

### Pipeline Activation
```typescript
// Enable all agentic features:
await runPipeline(query, "strategic", {
  useAgenticAnalyst: true,   // ReAct-style analyst
  useMetaController: true,   // LLM-driven orchestration
});
```

---

## �️ Witness — Metacognitive Observer (2026-08 Sprint 4)

The Witness is a **metacognitive layer** that sits above the pipeline. It observes every step, detects anomalies, can intervene when things go wrong, and — crucially — **learns across runs** to improve prompts and thresholds for future runs.

Inspired by:
- **Sakshi** (bionicbutterfly13/sakshi) — Witness pattern: observe via typed seams, never own the cognition
- **MIDCA** — Metacognitive Integrated Dual-Cycle Architecture: monitor → assess → control
- **HyperAgents** — Self-referential improvement: the system improves itself between runs

### Architecture

```
┌─────────────────────────────────────────────┐
│              PIPELINE (host)                 │
│  SCOUT → RANK → READER → ANALYST → EDITOR   │
│       ↕ (seams)                              │
│  ┌────────────────────────────────────────┐  │
│  │              WITNESS                   │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  Cognitive Cycle (6 phases)      │  │  │
│  │  │  PERCEIVE → INTERPRET → EVAL     │  │  │
│  │  │  → INTEND → PLAN → ACT           │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  Meta-Loop (3 phases)            │  │  │
│  │  │  MONITOR → ASSESS → CONTROL      │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  Cross-Run Learning              │  │  │
│  │  │  (prompt mods, threshold adjs)   │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Files

| File | Purpose |
|------|---------|
| `lib/agent/witness/types.ts` | All Witness types: CycleTrace, AnomalyEvent, InterventionRecord, GuardDecision, RunLearning, PromptModification, ThresholdAdjustment |
| `lib/agent/witness/seams.ts` | Typed seams: EventBus, GoalStateStore, WriteGuard, Clock, InterventionExecutor + implementations (Console, Database, InMemory, Production, DenyByDefault, NoOp) |
| `lib/agent/witness/cognitive-cycle.ts` | The `Witness` class — runs the 6-phase cognitive cycle for each pipeline step |
| `lib/agent/witness/meta-loop.ts` | Meta-loop (MONITOR → ASSESS → CONTROL) + cross-run learning (`extractRunLearning`, `getPastLearnings`, `buildLearningInjection`) |
| `lib/agent/witness/integration.ts` | `createWitnessContext()` — wires the Witness into the pipeline; `buildObservation()` helper |
| `app/api/dashboard/witness/route.ts` | Dashboard API — returns anomaly/intervention/learning metrics |
| `app/[locale]/witness/page.tsx` | Dashboard UI — visualizes Witness activity |

### Cognitive Cycle (6 phases)

For each pipeline step, the Witness runs:

1. **PERCEIVE** — Receive raw observations (cost, duration, metrics, errors, LLM calls)
2. **INTERPRET** — Make sense of what happened (rule-based + optional LLM)
3. **EVAL** — Evaluate against expectations (cost range, duration range, quality, citations, budget)
   - Detects anomalies: cost_overrun, latency_spike, quality_drop, citation_gap, budget_depletion, empty_output, hallucination_risk, contradiction, loop_stuck, rate_limit, refusal
4. **INTEND** — Decide whether to intervene (rule-based: intervene if high/critical anomaly; LLM: conservative JSON decision)
5. **PLAN** — Plan the intervention (build params, describe action)
6. **ACT** — Validate with WriteGuard, then execute via InterventionExecutor

### Meta-Loop (3 phases)

After each cognitive cycle, the meta-loop assesses overall run health:

1. **MONITOR** — Collect overall metrics (health score, total anomalies, budget used)
2. **ASSESS** — Evaluate: is the run on track?
3. **CONTROL** — Recommend: `continue` | `proceed_with_caution` | `reduce_scope` | `abort`

### Interventions (11 types)

| Type | Description | Guard Rule |
|------|-------------|------------|
| `force_synthesis` | Force the agent to produce output now | Only after step 3 |
| `abort_step` | Abort current step, use fallback | Non-critical steps only |
| `adjust_threshold` | Adjust a threshold (e.g., trust score) | Max 30% change |
| `modify_prompt` | Append to the agent's prompt | Append only, no replace |
| `switch_provider` | Switch LLM provider | Always allowed |
| `reduce_scope` | Reduce analysis scope | Always allowed |
| `request_human_review` | Flag for human review | Always allowed |
| `skip_optional_step` | Skip an optional step | Non-critical steps only |
| `add_step` | Add a step (debate, gap_fill, self_correction, etc.) | Known step types only |
| `retry_with_feedback` | Retry the step with feedback injected | Max 2 retries |
| `log_only` | Just log the anomaly | Always allowed |

### WriteGuard (Safety)

The `ProductionWriteGuard` validates every intervention before execution:
- Critical steps (scout, rank, reader, analyst) cannot be aborted or skipped
- Prompt modifications can only append, not replace
- Threshold adjustments are capped at 30% change
- Force synthesis is only allowed after step 3
- Retry with feedback is capped at 2 retries

### Cross-Run Learning

After each pipeline run, the Witness extracts a `RunLearning`:
- **Successes** and **failures** from the run
- **Recurring anomalies** (types that appeared ≥ 2 times)
- **Prompt modifications** — concrete suggestions to improve agent prompts
- **Threshold adjustments** — concrete suggestions to tune thresholds
- **Quality score** (0-100)

These learnings are persisted to `AgentAuditLog` and injected into future runs via `buildLearningInjection()` — this is the **self-improvement loop**: past learnings → future run prompts.

### Pipeline Activation

```typescript
// Enable the Witness:
await runPipeline(query, "strategic", {
  useWitness: true,           // Metacognitive observer
  useAgenticAnalyst: true,    // ReAct-style analyst
  useMetaController: true,    // LLM-driven orchestration
});
```

### Dashboard: `/witness`

- Summary: cycle traces, anomalies, interventions, avg quality
- Anomaly distribution by type and severity
- Intervention distribution (approved vs denied)
- Anomalies by pipeline step
- Cross-run learning: prompt modifications and threshold adjustments
- Recent anomalies, interventions, and run learnings

---

## Moat — 4-Pillar Self-Improvement System (2026-08 Sprint 5)

The Moat system is the **defensible advantage** of NomosX. Four pillars that compound over time: the more the system runs, the better it gets, and the harder it becomes for competitors to replicate.

### Pillar 1: Process Reward Model (PRM)

**File**: `lib/agent/prm/process-reward-model.ts`

Scores every reasoning step (not just the final output) and learns which reasoning patterns lead to good outcomes. After thousands of runs, the PRM contains proprietary knowledge of "what good research reasoning looks like."

- **Feature extraction**: 16 features (citation density, specificity, hedging, evidence grounding, etc.)
- **Linear model**: logistic regression with L2 regularization, trained via gradient descent
- **LLM scoring**: high-quality labels via LLM judge for cold start and calibration
- **Best-of-N selection**: given multiple reasoning paths, the PRM selects the best one
- **Persistence**: model and steps stored in `AgentAuditLog`
- **Retraining**: periodic retraining from accumulated data (`retrainPRM()`)

### Pillar 2: Adversarial Self-Play

**File**: `lib/agent/self-play/adversarial.ts`

The system attacks its own analyses to find weaknesses before users do. Four roles: Generator > Attacker > Defender > Judge.

- **Generator**: creates adversarial queries (10 challenge types: internal contradictions, false premises, subtle bias, etc.)
- **Attacker**: finds weaknesses in analyses (8 attack targets: claims, citations, methodology, bias, omissions, logic, evidence quality, synthesis)
- **Defender**: attempts to defend or concede each attack
- **Judge**: evaluates whether attacks succeeded and extracts lessons
- **11 weakness categories**: hallucination, unsupported_claim, cherry_picking, false_balance, temporal_bias, geographic_bias, methodological_ignorance, oversimplification, missing_nuance, circular_reasoning, appeal_to_authority
- **Lessons injected** into future runs via `buildSelfPlayInjection()`

### Pillar 3: Mixture of Agents (MoA)

**File**: `lib/agent/moa/mixture-of-agents.ts`

Instead of one analyst, multiple specialist analysts collaborate in parallel, then an aggregator synthesizes their perspectives. Quality emerges from diversity.

- **8 specialist agents**: Methodology, Bias, Evidence, Synthesis, Skeptic, Temporal, Stakeholder, Uncertainty
- **Parallel execution**: all specialists run simultaneously
- **Aggregator**: identifies consensus, resolves controversies, preserves unique insights
- **Weight learning**: agent weights are adjusted based on their contribution quality (EMA of reliability x confidence)
- **Weight persistence**: learned weights are stored and loaded across runs

### Pillar 4: World Model

**File**: `lib/agent/world-model/world-model.ts`

Persistent cross-run knowledge accumulation. The system remembers what it learned from past runs and injects relevant prior knowledge into new runs.

- **Domain memories**: per-domain knowledge (concepts, positions, controversies, sources, paradigm shifts)
- **Cross-domain links**: connections between concepts across different domains
- **Source reliability index**: learns which sources are reliable over time
- **Controversy tracker**: tracks ongoing debates and their evolution
- **Paradigm tracker**: records paradigm shifts and their dates
- **Knowledge extraction**: LLM extracts structured knowledge from each completed analysis
- **Injection**: prior knowledge is injected into the pipeline context before each run

### Pipeline Activation

```typescript
// Enable all 4 moat pillars:
await runPipeline(query, "strategic", {
  useWitness: true,            // Metacognitive observer (Sprint 4)
  usePRM: true,                // Process Reward Model
  useSelfPlay: true,           // Adversarial self-play
  useMixtureOfAgents: true,    // Multiple specialist analysts
  useWorldModel: true,         // Persistent knowledge accumulation
  useAgenticAnalyst: false,    // MoA replaces agentic analyst
  useMetaController: true,     // LLM-driven orchestration
});
```

### Dashboard: `/moat`

- Summary: PRM examples, self-play rounds, MoA runs, world model domains
- PRM: learned feature weights, training examples, avg reward
- Self-Play: attack success rate, robustness score, weakness categories
- MoA: specialist usage, agent weights, consensus/controversies per run
- World Model: domain breakdown, concepts, positions, controversies, sources
- Cross-domain connections with strength scores

### How the Moat Compounds

1. **Run 1-10**: System collects data, PRM is untrained, World Model is empty
2. **Run 10-100**: PRM starts predicting quality, World Model accumulates domain knowledge, self-play finds common weaknesses
3. **Run 100-1000**: PRM is well-trained (proprietary asset), World Model has deep domain expertise, self-play has hardened the system against known weaknesses, MoA weights are optimized
4. **Run 1000+**: The system has a moat that cannot be replicated without the same volume of runs

---

## �📋 Agent Catalog

### 1. SCOUT Agent

**File**: `lib/agent/pipeline-v2.ts:scout()`

**Purpose**: Collect raw research from academic APIs

**Inputs**:
- `query: string` — Search query
- `providers: string[]` — Which sources to query
- `perProvider: number` — Results per source

**Process**:
1. Query providers in parallel (Promise.allSettled)
2. Normalize responses to common schema
3. Compute quality score
4. Enrich with Unpaywall (if DOI present)
5. Upsert to `Source` table

**Outputs**:
- `found: number` — Total results
- `upserted: number` — Saved to DB
- `sourceIds: string[]` — Created/updated IDs

**Determinism**: ⚠️ Semi-deterministic (external API variance)

**Error Handling**:
- Provider failures are logged but don't stop pipeline
- Empty results are allowed (returns empty arrays)

**Example**:
```typescript
const result = await scout("carbon tax", ["openalex", "crossref"], 20);
// { found: 35, upserted: 33, sourceIds: ["openalex:W123...", ...] }
```

---

### 2. INDEX Agent

**File**: `lib/agent/index-agent.ts:indexAgent()`

**Purpose**: Normalize sources, enrich identities (ROR/ORCID), deduplicate

**Inputs**:
- `sourceIds: string[]` — Sources to enrich

**Process**:
1. For each source:
   a. Extract authors from raw data
   b. Search/create `Author` records
   c. Enrich with ORCID if available
   d. Extract institutions from raw data
   e. Search/create `Institution` records
   f. Enrich with ROR API (by name or ID)
   g. Create `SourceAuthor` / `SourceInstitution` links
2. Compute novelty score
3. Update `Source.noveltyScore`

**Outputs**:
- `enriched: number` — Successfully processed
- `errors: string[]` — Failed sources

**Determinism**: ⚠️ Semi-deterministic (ROR/ORCID lookups may vary)

**Error Handling**:
- Individual source failures logged
- Continue processing remaining sources

**Deduplication** (`deduplicateSources()`):
- Groups sources by DOI
- Keeps earliest (by createdAt), deletes rest
- Returns `{ removed: number }`

**Example**:
```typescript
const result = await indexAgent(["openalex:W123", "crossref:10.1234"]);
// { enriched: 2, errors: [] }
```

---

### 3. RANK Agent V3

**File**: `lib/agent/pipeline-v2.ts:rank()`

**Purpose**: Select top sources with relevance/date filtering and diversity controls

**Inputs**:
- `query: string` — Search query (used for relevance scoring)
- `limitOrOptions: number | RankOptions` — Limit or full options object
- `mode: "quality" | "novelty" | "balanced"` — Ranking criteria

**RankOptions Interface**:
```typescript
interface RankOptions {
  limit?: number;                  // Max sources (default: 12)
  mode?: "quality" | "novelty" | "balanced";
  // Date filtering
  minYear?: number;                // Minimum publication year
  maxYear?: number;                // Maximum publication year
  recentOnly?: boolean;            // Only last 3 years
  // Relevance filtering
  minQuality?: number;             // Quality score threshold (default: 70)
  excludeProviders?: string[];     // Providers to exclude
  includeProviders?: string[];     // Providers to include only
  // Content filtering
  requireAbstract?: boolean;       // Must have abstract
  minAbstractLength?: number;      // Minimum abstract length
  // Diversity controls
  maxPerProvider?: number;         // Max sources per provider (default: 4)
  maxPerYear?: number;             // Max sources per year (default: 3)
  minProviderDiversity?: number;   // Min different providers (default: 3)
}
```

**Process**:
1. Build dynamic WHERE clause from options
2. Query `Source` table with filters
3. Calculate composite score (quality + novelty + recency)
4. Calculate relevance score (keyword matching)
5. Apply diversity constraints
6. Return top N diverse sources

**Outputs**:
- `Source[]` — Ranked sources with relations, compositeScore, relevanceScore

**Determinism**: ✅ Fully deterministic

**Error Handling**:
- Empty results → relax constraints automatically
- Database errors bubble up

**Examples**:
```typescript
// Simple usage (backward compatible)
const top = await rank("carbon tax", 12, "quality");

// Advanced usage with filtering
const filtered = await rank("AI regulation", {
  limit: 20,
  mode: "balanced",
  recentOnly: true,           // Only 2023-2026
  minQuality: 75,
  requireAbstract: true,
  minAbstractLength: 300,
  excludeProviders: ["cia-foia", "nara"],  // No archive sources
  maxPerProvider: 5
});
```

---

### 4. READER Agent

**File**: `lib/agent/reader-agent.ts:readerAgent()`

**Purpose**: Extract key claims, methods, results, limitations from abstracts

**Inputs**:
- `sources: Source[]` — Sources to read

**Process**:
1. For each source:
   a. Extract title + abstract (max 2000 chars)
   b. Prompt GPT-4 Turbo to extract:
      - Claims (max 3)
      - Methods (max 3)
      - Results (max 3)
      - Limitations (max 2)
      - Confidence (high/medium/low)
   c. Parse JSON response

**Outputs**:
- `ReadingResult[]`:
  ```typescript
  {
    sourceId: string,
    claims: string[],
    methods: string[],
    results: string[],
    limitations: string[],
    confidence: "high" | "medium" | "low"
  }
  ```

**Determinism**: ⚠️ Semi-deterministic (LLM variance, temp=0.1)

**Error Handling**:
- Missing/insufficient abstracts → low confidence
- LLM failures → empty arrays + error in limitations

**Example**:
```typescript
const readings = await readerAgent(sources);
// [{ sourceId: "...", claims: ["Carbon tax reduces emissions by 10-15%"], ... }]
```

---

### 5. ANALYST Agent

**File**: `lib/agent/analyst-agent.ts:analystAgent()`

**Purpose**: Synthesize research into decision-ready analysis

**Inputs**:
- `question: string` — Research question
- `sources: Source[]` — Top sources
- `readings?: ReadingResult[]` — Optional READER output

**Process**:
1. Build rich context from sources + readings
2. Prompt GPT-4 Turbo to produce:
   - Title
   - Executive summary
   - Consensus (what researchers agree on)
   - Disagreements (conflicts in evidence)
   - Debate:
     - Pro arguments
     - Con arguments
     - Synthesis
   - Evidence quality assessment
   - Strategic implications
   - Risks & limitations
   - Open questions
   - What would change our mind
3. Enforce [SRC-*] citation tags
4. Parse JSON response

**Outputs**:
- `AnalysisOutput`:
  ```typescript
  {
    title: string,
    summary: string,
    consensus: string,
    disagreements: string,
    debate: { pro, con, synthesis },
    evidence: string,
    implications: string,
    risks: string,
    open_questions: string,
    what_changes_mind: string
  }
  ```

**Determinism**: ⚠️ Semi-deterministic (LLM variance, temp=0.2)

**Error Handling**:
- LLM failures → return error structure
- Missing fields → empty strings

**Example**:
```typescript
const analysis = await analystAgent("What is the impact of carbon taxes?", sources, readings);
// { title: "Carbon Tax Impact: Mixed Evidence...", summary: "Research shows 10-20% emission reductions [SRC-1][SRC-3]...", ... }
```

---

### 5b. STRATEGIC ANALYST Agent (NEW)

**File**: `lib/agent/strategic-analyst-agent.ts:strategicAnalystAgent()`

**Purpose**: Produce comprehensive 10-15 page Strategic Reports with deep analysis

**Inputs**:
- `question: string` — Research question
- `sources: Source[]` — Top sources (typically 20-25 for strategic reports)
- `readings?: ReadingResult[]` — Optional READER output
- `options?: { focusAreas?, targetAudience?, urgencyContext? }`

**Process**:
1. Build comprehensive context from sources + readings
2. Prompt GPT-4 with extended prompt (16K tokens output)
3. Generate structured analysis with 10 sections:
   - Executive Summary + Key Findings
   - Literature Review (overview, frameworks, methodologies)
   - Thematic Analysis (themes, consensus, controversies, trends)
   - Debate (position 1, position 2, synthesis, nuances)
   - Evidence Quality Assessment
   - Stakeholder Impact Matrix
   - Scenario Planning (3-5 scenarios with probabilities)
   - Recommendations (immediate, short-term, long-term, risk mitigation)
   - Implementation Roadmap
   - Conclusion + Open Questions

**Outputs**:
- `StrategicAnalysisOutput`:
  ```typescript
  {
    title: string,
    executiveSummary: string,        // 500+ words
    keyFindings: string[],           // 5 key findings
    urgencyLevel: "critical" | "high" | "medium" | "low",
    confidenceLevel: "high" | "medium" | "low",
    literatureOverview: string,      // 800+ words
    theoreticalFrameworks: string,
    methodologicalApproaches: string,
    keyStudies: Array<{ citation, contribution, limitations }>,
    themes: Array<{ name, description, evidence, sources }>,
    consensus: string,
    controversies: string,
    emergingTrends: string,
    debate: {
      position1: { label, arguments, evidence, proponents },
      position2: { label, arguments, evidence, proponents },
      synthesis: string,
      nuances: string
    },
    evidenceQuality: {
      overallScore: number,          // 1-10
      methodology, sampleSizes, replication, biases, gaps
    },
    stakeholderAnalysis: Array<{ stakeholder, impact, magnitude, details }>,
    scenarios: Array<{ name, probability, description, implications, signals }>,
    recommendations: { immediate[], shortTerm[], longTerm[], riskMitigation[] },
    implementation: { prerequisites[], timeline, resources, metrics[], obstacles[] },
    conclusion: string,
    openQuestions: string[],
    whatChangesMind: string
  }
  ```

**Determinism**: ⚠️ Semi-deterministic (LLM variance, temp=0.2, maxTokens=16000)

**Error Handling**:
- LLM failures → return error structure
- Missing fields → logged as warning, analysis continues

**Example**:
```typescript
const analysis = await strategicAnalystAgent(
  "Impact of AI on scientific research methodology",
  sources,
  readings,
  {
    focusAreas: ["reproducibility", "peer review"],
    targetAudience: "Research institutions",
    urgencyContext: "Rapid AI adoption requires policy guidance"
  }
);
// Returns comprehensive 10-15 page analysis structure
```

---

### 6. CITATION GUARD

**File**: `lib/agent/pipeline-v2.ts:citationGuard()`

**Purpose**: Validate all [SRC-*] citations are valid

**Inputs**:
- `json: any` — ANALYST output
- `sourceCount: number` — Number of available sources

**Process**:
1. Stringify JSON
2. Extract all [SRC-N] patterns via regex
3. Check:
   - At least 1 citation present
   - All N values are 1 ≤ N ≤ sourceCount
4. Return validation result

**Outputs**:
- `{ ok: boolean, usedCount: number, invalid: number[] }`

**Determinism**: ✅ Fully deterministic

**Error Handling**:
- If !ok, caller should retry ANALYST with stronger prompt

**Example**:
```typescript
const guard = citationGuard(analysis, 12);
// { ok: true, usedCount: 8, invalid: [] }
```

---

### 7. EDITOR Agent

**File**: `lib/agent/pipeline-v2.ts:renderBriefHTML()`

**Purpose**: Render analysis into premium HTML brief

**Inputs**:
- `out: AnalysisOutput` — ANALYST output
- `sources: Source[]` — Source list for citations

**Process**:
1. Escape HTML entities
2. Render sections (summary, consensus, debate, etc.)
3. Format debate with color coding:
   - Pro: cyan (#5EEAD4)
   - Con: rose (#FB7185)
   - Synthesis: default
4. Render source list with authors, year, provider

**Outputs**:
- `string` — HTML document

**Determinism**: ✅ Fully deterministic

**Error Handling**:
- Missing fields → skip section
- Null values → empty string

**Example**:
```typescript
const html = renderBriefHTML(analysis, sources);
// "<article><h1>Carbon Tax Impact...</h1>..."
```

---

### 8. PUBLISHER Agent

**File**: `scripts/worker-v2.mjs` (job handler)

**Purpose**: Save brief to database, optionally set publicId

**Inputs**:
- `briefId: string` — Brief to publish

**Process**:
1. Update `Brief.publicId = briefId` (or generate unique ID)
2. Mark as published

**Outputs**:
- None (side effect: DB update)

**Determinism**: ✅ Fully deterministic

**Error Handling**:
- Database errors bubble up

---

### 9. DIGEST Agent

**File**: `lib/agent/digest-agent.ts:generateDigest()`

**Purpose**: Create weekly summary for topic subscriptions

**Inputs**:
- `topicId: string` — Topic to summarize
- `period: string` — e.g., "2026-W03"
- `limit: number` — Max sources (default 10)

**Process**:
1. Fetch topic
2. Find sources created in last 7 days matching topic query/tags
3. Rank by quality + novelty
4. Prompt GPT-4 Turbo to create digest:
   - Highlight 3-5 most significant sources
   - "Why it matters" for each
   - Signals section (emerging trends)
   - <500 words, email-safe HTML
5. Save to `Digest` table

**Outputs**:
- `string` — Digest ID

**Determinism**: ⚠️ Semi-deterministic (LLM variance, temp=0.3)

**Error Handling**:
- No new sources → return "No new research" message
- LLM failures bubble up

**Example**:
```typescript
const digestId = await createDigest({ topicId: "...", period: "2026-W03" });
```

---

### 10. RADAR Agent

**File**: `lib/agent/radar-agent.ts:generateRadarCards()`

**Purpose**: Identify weak signals and emerging trends

**Inputs**:
- `limit: number` — Max radar cards (default 5)

**Process**:
1. Fetch recent high-novelty sources (noveltyScore ≥ 60)
2. Prompt GPT-4 Turbo to identify signals:
   - Signal title
   - What we're seeing
   - Why it matters
   - Supporting sources [SRC-*]
   - Confidence (high/medium/low)
3. Parse JSON array

**Outputs**:
- `RadarCard[]`:
  ```typescript
  {
    title: string,
    signal: string,
    why_it_matters: string,
    sources: string[],
    confidence: "high" | "medium" | "low"
  }
  ```

**Determinism**: ⚠️ Semi-deterministic (LLM variance, temp=0.4)

**Error Handling**:
- No novel sources → return []
- LLM failures → return []

**Example**:
```typescript
const cards = await generateRadarCards(5);
// [{ title: "AI-driven carbon accounting", signal: "Emerging research shows...", ... }]
```

---

## � Verification & Trust Layer (2026 Open-Source Innovations)

Six new modules upgrade the pipeline from lexical-overlap heuristics to
semantic NLI entailment, source provenance verification, conflict-aware
reasoning, calibrated trust scores, and claim-level traceability.

### V1. NLI Engine (`lib/agent/nli-engine.ts`)

**Purpose**: Real Natural Language Inference for claim→source verification.

**Architecture**: Pluggable — local model (primary) + embedding fallback.

- **Primary**: mDeBERTa-v3-base-mnli-xli (multilingual NLI, 100+ languages including French)
  - Loaded via `@huggingface/transformers` (quantized, ~280MB, cached locally)
  - 3 labels: `entailment`, `neutral`, `contradiction`
  - Deterministic, CPU-only, $0 cost
- **Fallback**: OpenAI embeddings + negation detection + number verification
  - Used when local model is not available (first run, no disk space)

**Public API**:
- `classifyNLI(claim, sourceContent)` → `NLIClassification`
- `classifyNLIBatch(pairs, maxConcurrency)` → `NLIBatchResult`
- `nliToGroundingVerdict(nli)` → `supported | partial | unsupported | contradicted`
- `nliToCitationVerdict(nli)` → `supported | partially_supported | unsupported | misattributed | unverifiable`
- `isNLIModelAvailable()` → `boolean`
- `preloadNLIModel()` → `void`

**Integration**: Replaces the heuristic composite scoring in `nli-verifier.ts`
and powers the async `groundClaimsWithNLI()` in `claim-grounding.ts`.

**Inspired by**: VerifAI (2026), FactReasoner (IBM), HallDetect (2026), TrustBench (AAAI 2026).

---

### V2. Source Check (`lib/agent/sourcecheck.ts`)

**Purpose**: Provenance-first verification — does the cited source exist,
is it retracted, is the quoted text actually there?

**Three checks per citation**:
1. **EXISTENCE**: Does the DOI/title resolve to a real source? (OpenAlex + Crossref)
2. **RETRACTION**: Is the source retracted or has an expression of concern?
3. **PRESENCE**: Does the claim content appear in the source's abstract/full text?

**Cost**: $0 (OpenAlex + Crossref APIs are free)
**Latency**: ~100ms per source (parallel batch, max 10 concurrent)

**Public API**:
- `checkSource(source, claim?)` → `SourceCheckResult`
- `checkSourcesBatch(sources, claims?, maxConcurrency)` → `SourceCheckBatchResult`

**Integration**: Runs after NLI verifier, before trust score calculation.
Retraction veto: if any source is retracted, trust score is capped at 50.

**Inspired by**: sourcecheck (aberaio) — "abstain when you can't confirm".

---

### V3. Atomic Claim Decomposition (`lib/agent/atomic-claims.ts`)

**Purpose**: Decompose complex paragraphs into atomic, decontextualized claims
that can be independently verified against sources.

**Key innovation**: Decontextualization — resolves pronouns ("they" → "Smith et al."),
demonstratives ("this study" → "the 2023 carbon tax study"), and incomplete names
to make each claim standalone.

**Cost**: ~$0.001 per paragraph (one LLM call, temp=0, json mode)
**Fallback**: Rule-based sentence splitting (no LLM, no decontextualization)

**Public API**:
- `decomposeIntoAtomicClaims(text, paragraphIndex)` → `{ claims, costUsd, usedLLM }`
- `decomposeHtmlIntoAtomicClaims(html, maxParagraphs)` → `DecompositionResult`

**Inspired by**: FactReasoner (IBM), VeriScore, HallDetect (2026), chaincheck.

---

### V4. Conflict-Aware Reasoning (`lib/agent/conflict-aware.ts`)

**Purpose**: Detect contradictions between sources BEFORE analysis, inject as
explicit context for the analyst.

**Key innovation**: Instead of normalizing away contradictions (averaging sources),
this module DETECTS contradictions using NLI and injects them as context.
The analyst then has three options:
1. Direct answering (if consensus)
2. Conflict-aware answering (if contradictions exist — acknowledge both sides)
3. Abstention (if evidence is too conflicting)

**Cost**: $0 (NLI is free, local model)
**Pairs checked**: K*(K-1)/2 = 45 for K=10 sources

**Public API**:
- `detectSourceConflicts(sources, readings?, options?)` → `ConflictDetectionResult`

**Integration**: Runs after READER, before ANALYST. The `contextBlock` is
injected into the analyst prompt so the analyst acknowledges contradictions.

**Inspired by**: EvidentialRAG (2026), ConflictRAG (2026), ConflictScore (2026), CONFRAG (ACL 2026).

---

### V5. Trust Score Calibration (`lib/agent/trust-calibration.ts`)

**Purpose**: Calibrate the trust score so 65 = 65% actual accuracy.

**Metrics**:
1. **ECE** (Expected Calibration Error) — how well confidence matches accuracy
2. **Brier score** — accuracy of probabilistic predictions
3. **ACE** (Adaptive Calibration Error) — equal-mass bins, more robust than ECE
4. **MCE** (Maximum Calibration Error) — worst-case bin
5. **Reliability bins** — for diagnostic visualization
6. **Temperature scaling** — post-hoc calibration for future scores

**Public API**:
- `analyzeCalibration(pairs)` → `CalibrationResult`
- `applyTemperatureScaling(trustScore, temperature)` → `number`
- `computeECE(pairs, numBins)` → `{ ece, mce, bins }`
- `computeBrierScore(pairs)` → `number`

**Usage**: After each pipeline run, record (trustScore, wasQualityGood) pair.
After N runs, compute ECE/Brier. If ECE > 0.10, apply temperature scaling.

**Inspired by**: reliability-eval, conf-cal (isotonic regression), reliably (bootstrap CIs).

---

### V6. Claim-Level Provenance Graph (`lib/agent/provenance-graph.ts`)

**Purpose**: Every claim in a NomosX publication gets a stable ID, validation
status, and evidence link — enabling click-to-verify and staleness detection.

**Per-claim metadata**:
1. **STABLE ID**: `claim-{pubId}-{idx}` — persists across revisions
2. **VALIDATION STATUS**: `valid | invalid | stale | needs_review | unresolved`
3. **EVIDENCE LINK**: source + evidence snippet + NLI verdict
4. **STALENESS FLAG**: when the underlying source is retracted, claims are flagged

**Public API**:
- `buildProvenanceGraph(publicationId, html, sources, options?)` → `ProvenanceGraph`
- `markStaleClaims(graph, retractedSourceIds)` → `ProvenanceGraph`

**Integration**: Runs after trust score calculation. The `htmlAnnotations`
field contains HTML with `data-claim-id` attributes for frontend click-to-verify.

**Inspired by**: ClaimKit, agent-grounding, verified-science-agent.

---

### Updated Trust Score Formula

The deterministic trust score now includes 7 weighted metrics:

```
TrustScore = citationCoverage × 22      (22% — citing sources)
           + groundedness × 18           (18% — NLI-verified claim support)
           + factIntegrity × 0.13        (13% — numbers verified)
           + nliIntegrity × 0.13         (13% — NLI semantic check)
           + sourceCheckIntegrity × 0.09 (9%  — sources exist, not retracted)
           + diversityScore × 0.10       (10% — diverse providers)
           + avgQuality × 0.15           (15% — high-quality sources)
```

**Vetoes** (override the score):
- Retracted source detected → cap at 50
- Groundedness < 15% → cap at 45

---

## �🔄 Agent Orchestration

### Report Formats

| Format | Pages | Audience | Sources | Time |
|--------|-------|----------|---------|------|
| Brief | 2-3 | C-level | 12 | 5-10 min |
| Strategic Report | 10-15 | Analysts | 20-25 | 30-45 min |
| Research Dossier | 30-50 | Researchers | 50+ | 2-3 hours |

### Sequential Flow (BRIEF)

```typescript
async function runFullPipeline(query: string, providers: string[]) {
  // 1. SCOUT
  const { sourceIds } = await scout(query, providers, 20);
  
  // 2. INDEX
  await index(sourceIds);
  
  // 3. DEDUPE
  await deduplicateSources();
  
  // 4. RANK
  const topSources = await rank(query, 12, "quality");
  
  // 5. READER
  const readings = await read(topSources);
  
  // 6. ANALYST
  const analysis = await analyst(query, topSources, readings);
  
  // 7. GUARD
  const guard = citationGuard(analysis, topSources.length);
  if (!guard.ok) throw new Error("Citation guard failed");
  
  // 8. EDITOR
  const html = renderBriefHTML(analysis, topSources);
  
  // 9. PUBLISHER
  const brief = await prisma.brief.create({ data: { question: query, html, sources: topSources.map(s => s.id) } });
  
  return { briefId: brief.id };
}
```

### QUANT BRIDGE — Deterministic model layer (NEW)

**Files**: `lib/quant/` (TS orchestrator) + `quant-service/` (Python FastAPI)

**Purpose**: Inject machine-computed, fully-lineaged quantitative results into strategic reports — cited as `[MODEL-N]` (validated by the extended `citationGuard(json, sourceCount, modelCount)`).

**Models**:
1. **Parametric costing** (`lib/quant/parametric-cost.ts`) — unit costs from the sourced reference DB (`reference-costs.ts`, Eurostat/OECD/IEA) × volumes, uncertainty propagation (low/central/high), risk factors, optional NPV. Pure TS, zero LLM.
2. **FIGARO input-output** (`quant-service/`) — Leontief type-I shock propagation on Eurostat FIGARO IC-IO tables (free, official, commercially safe). Output/VA multipliers, spillover sectors. Python microservice (pandas/numpy can't run on Netlify) reached via `QUANT_SERVICE_URL`. `FIGARO_DEMO=1` for offline dev.

**Pipeline integration**: `runQuantBridge()` runs in STEP 5 parallel to READER/QUANT; its `evidenceBlock` is injected into the ANALYST context. Depth controlled by `quantDepth` option (`none|parametric|io|full`) — StudioX orders carry it via `StudioXOrder.quantDepth`.

**Exports**: `/api/articles/[id]/export/data?format=xlsx|csv` — Excel workbook (report meta + source register + one sheet per model) via `lib/export/report-workbook.ts`.

**Determinism**: ✅ Fully deterministic (both models)

---

### Sequential Flow (STRATEGIC REPORT) — NEW

```typescript
async function runStrategicPipeline(query: string, options: StrategicPipelineOptions) {
  // 1. SCOUT (more sources)
  const { sourceIds } = await scout(query, providers, 30);
  
  // 2. INDEX
  await index(sourceIds);
  
  // 3. DEDUPE
  await deduplicateSources();
  
  // 4. RANK V3 (enhanced filtering)
  const topSources = await rank(query, {
    limit: 25,
    recentOnly: true,
    requireAbstract: true,
    minAbstractLength: 200,
    minQuality: 65,
    maxPerProvider: 6,
    minProviderDiversity: 4
  });
  
  // 5. READER
  const readings = await read(topSources);
  
  // 6. STRATEGIC ANALYST (16K tokens output)
  const analysis = await strategicAnalystAgent(query, topSources, readings, {
    focusAreas: options.focusAreas,
    targetAudience: options.targetAudience,
    urgencyContext: options.urgencyContext
  });
  
  // 7. GUARD
  const guard = citationGuard(analysis, topSources.length);
  
  // 8. STRATEGIC EDITOR (10-section HTML)
  const html = renderStrategicReportHTML(analysis, topSources);
  
  // 9. PUBLISHER
  const brief = await prisma.brief.create({ 
    data: { kind: "strategic", question: query, html, sources: topSources.map(s => s.id) }
  });
  
  return { briefId: brief.id, format: "strategic" };
}
```

### Universal Pipeline Runner

```typescript
// Choose format at runtime
const result = await runPipeline(query, "strategic", {
  providers: ["openalex", "semanticscholar", "crossref"],
  focusAreas: ["methodology", "policy"],
  targetAudience: "Policy makers"
});
```

### Job-Based Flow (Asynchronous)

```
User creates IngestionRun
  → SCOUT job (priority 10)
    → INDEX job (priority 8)
      → RANK job (priority 7)
        → READER job (priority 6)
          → ANALYST job (priority 5)
            → [retry if citation guard fails]
            → EDITOR job (priority 4)
              → PUBLISHER job (priority 3)
```

---

## 🎯 Determinism Rules

| Agent | Determinism | Variance Source |
|-------|-------------|-----------------|
| SCOUT | Semi | External API changes |
| INDEX | Semi | ROR/ORCID lookup variance |
| RANK | Full | — |
| READER | Semi | LLM (temp=0.1) |
| ANALYST | Semi | LLM (temp=0.2) |
| GUARD | Full | — |
| EDITOR | Full | — |
| PUBLISHER | Full | — |
| DIGEST | Semi | LLM (temp=0.3) |
| RADAR | Semi | LLM (temp=0.4) |

**Strategies for reproducibility**:
1. **Low temperature**: READER (0.1), ANALYST (0.2)
2. **Structured output**: JSON mode for all LLM calls
3. **Version pinning**: Specify OpenAI model (gpt-4-turbo-preview)
4. **Retries**: Citation guard enforces consistency
5. **Audit logs**: All job payloads + responses stored

---

## 🚨 Error Scenarios

### Provider Down
- **SCOUT** logs error, continues with other providers
- Pipeline proceeds with partial results

### ROR/ORCID Lookup Fails
- **INDEX** logs error, continues without enrichment
- Sources still usable, just less metadata

### LLM Timeout/Failure
- **READER/ANALYST** retries up to 3 times
- If max retries hit, job fails with error
- User can re-run manually

### Citation Guard Fails
- **ANALYST** retries with stronger prompt (append "CRITICAL: Include [SRC-*] citations")
- Max 3 attempts
- If still fails, job marked FAILED

### Database Constraint Violation
- Unique constraint (e.g., duplicate DOI): upsert logic handles
- Foreign key constraint: indicates logic bug, job fails

---

## 📊 Agent Metrics

### Performance
```sql
-- Average agent runtime
SELECT type, AVG(EXTRACT(EPOCH FROM (finishedAt - startedAt))) as avg_seconds
FROM "Job" WHERE status='DONE' AND type IN ('SCOUT', 'INDEX', 'RANK', 'READER', 'ANALYST', 'EDITOR')
GROUP BY type;
```

### Success Rate
```sql
-- Failure rate by agent
SELECT type, 
  COUNT(*) FILTER (WHERE status='FAILED') * 100.0 / COUNT(*) as failure_rate
FROM "Job" GROUP BY type;
```

### Citation Quality
```sql
-- Briefs with low citation counts (potential quality issue)
SELECT id, question, LENGTH(html) - LENGTH(REPLACE(html, '[SRC-', '')) / 5 as citation_count
FROM "Brief"
WHERE LENGTH(html) - LENGTH(REPLACE(html, '[SRC-', '')) / 5 < 3
ORDER BY createdAt DESC;
```

---

## 🔧 Agent Configuration

**Environment Variables**:
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview  # Agent inference
```

**Pipeline Defaults** (in code):
```typescript
const SCOUT_PER_PROVIDER = 20;
const RANK_LIMIT = 12;
const READER_TEMP = 0.1;
const ANALYST_TEMP = 0.2;
const DIGEST_TEMP = 0.3;
const RADAR_TEMP = 0.4;
const MAX_JOB_RETRIES = 3;
```

---

## 🧠 Intelligent Pipeline Layer (2026 Innovations)

### INTELLIGENT SCOUT Agent

**File**: `lib/agent/intelligent-scout.ts`

**Purpose**: Multi-lens eclectic source discovery for scenario-rich analysis

**6 Lenses**:
1. **Core** — consensus, mainstream sources
2. **Contrarian** — dissident views, critiques, failures
3. **Cross-domain** — analogues from other fields
4. **Historical** — precedents and past parallels
5. **Weak signal** — emerging, low-attention signals
6. **Scenario** — projections, alternative futures

**Innovations**:
- **Adaptive Search Depth** (AutoSearch pattern): stops when sufficient evidence
- **UCB1 Bandit** (EACL 2026, +35% precision): allocates budget between lenses
- **Pre-filtering + Source Authority**: classifies authority before embedding

**Outputs**: `{ lenses, totalSources, diversityScore, consensusScore, scenarioRichness }`

---

### CRITIC Agent (NEW)

**File**: `lib/agent/critic-agent.ts`

**Purpose**: Multi-stage verification with adversarial scrutiny (post-ANALYST)

**Innovations**:
- **Critic-Guided Hybrid Agentic RAG** (OpenReview 2026): multi-stage verification
- **GAVEL** (ACL 2026): Evidence-Contract with mechanized scrutiny
- **Self-Correcting RAG** (ACL 2026): NLI-guided repair

**5-Stage Pipeline**:
1. **Claim Decomposition** — breaks analysis into atomic claims
2. **Evidence Grounding** — NLI-based verification against sources
3. **Contradiction Detection** — finds mutually exclusive claims
4. **Bias Detection** — funder, selection, confirmation, publication, language, temporal
5. **Citation Validation** — checks [SRC-N] tags are valid and well-attributed

**Verdicts**: `accept` (score≥75, no severe issues) | `repair` (score≥40) | `reject` (score<40)

**Repair**: Generates targeted instructions for ANALYST retry

---

### CROSS-MODEL CONSENSUS (NEW)

**File**: `lib/agent/cross-model-consensus.ts`

**Purpose**: LLM Jury — multiple models verify critical claims independently

**Innovation**: Cross-Model Consensus (arxiv 2026, +4.6 accuracy vs single model)

**Providers**: OpenAI GPT-4o-mini, DeepSeek V4 Flash, GLM-4 Flash (independent training = error decorrelation)

**Process**: 3 models verify claim → majority vote → agreement score

**Use Cases**: Key statistics, controversial claims, contradicted claims

---

### REFLECTIVE RAG (NEW)

**File**: `lib/agent/cross-model-consensus.ts`

**Purpose**: Self-evaluation after each pipeline phase

**Innovation**: Reflective RAG (ACL 2026 Findings): reflection tagging + strategy optimization

**Phases Evaluated**:
- **After SCOUT**: "Do we have enough diverse, relevant sources?"
- **After READER**: "Are readings consistent and well-grounded?"
- **After ANALYST**: "Is the analysis balanced, well-cited, non-hallucinated?"

**Outputs**: `{ quality, score, issues, recommendations, shouldRetry, retryStrategy }`

**Semantic Failure Memory**: Records past failures to avoid repeating them

---

### SCENARIO ENGINE (NEW)

**File**: `lib/agent/scenario-engine.ts`

**Purpose**: Causal analogical reasoning + scattered hypothesis generation + courtroom debate

**3 Innovations**:

1. **CANA** (arxiv 2026, +10% vs deep research agents):
   - Decomposes situation into causal mechanisms (incentive, constraint, feedback_loop, etc.)
   - Finds historical analogues by MECHANISM ALIGNMENT (not surface similarity)
   - Generates search queries for the "historical" lens

2. **SCATTER** (ACL 2026):
   - Generates 5-8 diverse hypotheses about future outcomes
   - 5 categories: continuation, disruption, transformation, collapse, surprise
   - Optimizes inclusiveness + diversity
   - Generates search queries for the "scenario" lens

3. **PROCLAIM** (arxiv 2026, 81.7% accuracy, +10pp vs standard debate):
   - Courtroom-style debate: Plaintiff vs Defense vs Judge
   - Progressive RAG expands evidence pool during debate
   - For controversial claims flagged by Critic

---

### KNOWLEDGE GRAPH (NEW)

**File**: `lib/agent/knowledge-infrastructure.ts`

**Purpose**: Inter-paper entity/relation graph for multi-hop reasoning

**Innovation**: Agents-K1 (arxiv 2026): agent-native knowledge orchestration

**Process**:
1. Extract entities (methods, datasets, metrics, concepts, organizations, policies)
2. Extract relations (uses, evaluates, contradicts, supports, extends, cites, funds, regulates)
3. Detect clusters (groups of densely connected entities)
4. Detect bridges (entities connecting multiple clusters)

**Outputs**: `{ entities, relations, clusters, bridges }`

---

### EXPERIENCE BANK (NEW)

**File**: `lib/agent/knowledge-infrastructure.ts`

**Purpose**: Persistent memory of past analyses (TMAS, ICML 2026)

**Two Banks**:
1. **Experience Bank**: Reusable insights and patterns from past runs
2. **Guideline Bank**: Rules that future runs should follow for similar topics

**Process**: After each pipeline run, LLM extracts experiences + guidelines → stored in-memory (production: DB)

**Retrieval**: On new run, relevant experiences/guidelines are retrieved by topic similarity

---

### CONTEXT COMPRESSION (NEW)

**File**: `lib/agent/knowledge-infrastructure.ts`

**Purpose**: Compress intermediate findings to fit context window

**Innovation**: IterResearch (ICLR 2026): 2048+ tool calls in 40k context

**Process**: After READER, compress readings into concise summary (preserves claims, citations, structure)

**Outputs**: `{ originalSize, compressedSize, costUsd }`

---

### HYBRID SEARCH (NEW)

**File**: `lib/agent/semantic-engine.ts`

**Purpose**: Dense (pgvector) + Sparse (full-text) + Reciprocal Rank Fusion

**Innovation**: llmbestpractices 2026 — hybrid retrieval captures both semantic and exact matches

**Process**:
1. Dense search (pgvector, top 30) — paraphrase, synonyms
2. Sparse search (Postgres ILIKE/BM25, top 30) — exact keywords
3. Reciprocal Rank Fusion (k=60) — robust merge by rank

---

### CITATION GRAPH (NEW)

**File**: `lib/agent/citation-graph.ts`

**Purpose**: Find hub + bridge papers via citation network traversal

**Innovation**: Paper Circle (ACL 2026) — citation graph discovers foundational papers

**Process**:
1. Fetch referenced_works from OpenAlex for top sources
2. Count in-degree → hub papers (cited by ≥3 sources)
3. Co-citation Jaccard clustering → schools of thought
4. Bridge papers connect multiple clusters

---

## 🎓 Agent Design Principles

1. **Single Responsibility**: Each agent does one thing well
2. **Composability**: Agents can be used standalone or in pipeline
3. **Idempotency**: Re-running same agent with same inputs is safe
4. **Observability**: All inputs/outputs logged to Job table
5. **Graceful Degradation**: Failures don't cascade (except GUARD)
6. **Human-in-the-Loop**: Failed jobs can be manually re-run or corrected

---

---

## 🚀 V3 Intelligence Agents

### 8. SEMANTIC ENGINE

**File**: `lib/agent/semantic-engine.ts`

**Purpose**: Replace keyword/n-gram matching with real vector embeddings (OpenAI text-embedding-3-small, 1536 dims)

**Key Functions**:
- `embedText(text)` — Embed a single text string
- `embedBatch(texts)` — Embed multiple texts in one API call
- `embedSourcesBatch(sourceIds)` — Embed sources and store in DB
- `semanticSearch(query, options)` — Find most similar sources by cosine similarity
- `filterByRelevanceHybrid(sources, query)` — Hybrid scoring: 45% semantic + 25% keyword + 15% metadata + 15% field match
- `backfillEmbeddings(limit)` — Embed existing sources without vectors
- `getEmbeddingStats()` — Coverage monitoring

**Storage**: `Source.embeddings Float[]` + `Source.embeddingModel String?`

**Determinism**: ✅ Fully deterministic (same text → same embedding)

---

### 9. READER Agent V3

**File**: `lib/agent/reader-agent-v3.ts:readerAgentV3()`

**Purpose**: Full-text PDF parsing + structured quantitative data extraction

**Upgrades over V2**:
1. **PDF Full-Text**: Downloads and parses PDFs via `pdf-parse`
2. **Chunked Reading**: Splits papers into sections (intro, methods, results, etc.)
3. **Quantitative Extraction**: Effect sizes, p-values, sample sizes, CIs
4. **Cross-Reference**: Identifies which sources cite each other
5. **Fallback Chain**: Full-text → Abstract → Rule-based

**Output**: `ReadingResultV3` (backward-compatible with `ReadingResult` + quantitative data)

```typescript
interface QuantitativeData {
  effectSizes: Array<{ measure, value, ci95?, pValue?, context }>;
  sampleSizes: Array<{ n, population, design }>;
  statisticalTests: string[];
  keyMetrics: Array<{ name, value, unit?, context }>;
}
```

**Determinism**: ⚠️ Semi-deterministic (LLM variance, temp=0.1)

---

### 10. ANALYST Agent V3 (Multi-Pass)

**File**: `lib/agent/analyst-multipass.ts:analystAgentV3()`

**Purpose**: 3-pass deep analysis mimicking PhD researcher workflow

**Passes**:
1. **Thematic Mapping**: Identify themes, group sources, extract data points, assess methodology quality
2. **Contradiction Detection**: Find conflicts between sources, rank evidence strength, identify blind spots
3. **Synthesis**: Produce final analysis using structured insights from passes 1-2

**Output**: `MultiPassAnalysis` with `_meta` field tracking per-pass costs and timing

**Determinism**: ⚠️ Semi-deterministic (3 sequential LLM calls, temp=0.15-0.25)

---

### 11. CRITICAL LOOP V2

**File**: `lib/agent/critical-loop-v2.ts:runCriticalLoopV2()`

**Purpose**: Iterative self-correction — actually REWRITES drafts based on critic feedback

**Flow**:
1. Run 3 parallel critics (Methodology Judge, Adversarial Reviewer, Decision Calibrator)
2. If composite score < threshold → REWRITE draft using all critic feedback
3. Re-run critics on rewritten draft
4. Max 2 iterations, return best version with full audit trail

**Key Difference from V1**: V1 only scored; V2 rewrites. Mimics academic peer review with revision rounds.

**Output**: `CriticalLoopV2Result` with `finalHtml`, `iterationHistory`, `improvementDelta`

**Determinism**: ⚠️ Semi-deterministic (multiple LLM calls per iteration)

---

### 12. CITATION VERIFIER

**File**: `lib/agent/citation-verifier.ts:verifyCitations()`

**Purpose**: Semantic check that [SRC-N] citations actually support their attached claims

**Process**:
1. Parse all [SRC-N] citations and extract surrounding claim context
2. For each citation: compute cosine similarity (claim ↔ source embedding)
3. LLM verification: does the source actually support this specific claim?
4. Classify: `supported | partially_supported | unsupported | misattributed | unverifiable`
5. Produce integrity report with recommendations

**Output**: `VerificationReport` with `overallIntegrity` score (0-100), flagged claims, and fix suggestions

**Determinism**: ⚠️ Semi-deterministic (LLM + embedding variance)

---

### 13. DEBATE Agent

**File**: `lib/agent/debate-agent.ts:debateAgent()`

**Purpose**: Dedicated adversarial agent that constructs the strongest possible counter-argument (steel-man) to any analysis

**Process**:
1. **Pass 1**: Identify dominant thesis from sources, construct steel-man counter with [SRC-N] evidence, rate strength of both positions
2. **Pass 2**: Produce balanced synthesis, extract nuances and edge cases, identify what evidence would change the conclusion

**Output**: `DebateResult` with `position1`, `position2` (each with arguments, evidence, strength), `synthesis`, `nuances`, `whatWouldChangeOurMind`, `debateQuality` scores

**Key Principle**: Never strawman — always steel-man. This is what separates a think tank from an echo chamber.

**Determinism**: ⚠️ Semi-deterministic (2 LLM calls, temp=0.2-0.25)

---

### 14. META-ANALYSIS ENGINE

**File**: `lib/agent/meta-analysis-engine.ts:metaAnalysisEngine()`

**Purpose**: Statistical aggregation of effect sizes across sources — real quantitative synthesis

**Process** (all deterministic except final interpretation):
1. Collect effect sizes from READER V3 quantitative data
2. Standardize to Cohen's d (OR → d, r → d, Hedges' g, percentages)
3. Fixed-effect meta-analysis (inverse-variance weighting)
4. Random-effects meta-analysis (DerSimonian-Laird)
5. Heterogeneity assessment (I², Q-statistic, tau²)
6. Publication bias detection (Egger's test proxy)
7. Leave-one-out sensitivity analysis
8. Forest-plot-ready data structures
9. LLM interpretation for policy audience

**Output**: `MetaAnalysisResult` with `fixedEffect`, `randomEffects`, `heterogeneity`, `publicationBias`, `forestPlot[]`, `leaveOneOut[]`, `interpretation`, `caveats`

**Determinism**: ✅ Mostly deterministic (pure math), ⚠️ LLM interpretation only

---

### 15. KNOWLEDGE GRAPH

**File**: `lib/agent/knowledge-graph.ts`

**Purpose**: Persistent concept store providing institutional memory across briefs

**Key Functions**:
- `extractAndStoreConcepts(briefId, question, html, sourceIds)` — Extract concepts via LLM, embed, deduplicate against existing graph, store relations
- `queryKnowledgeGraph(query, options)` — Semantic search over concept store
- `getLongitudinalInsights(options)` — Track concept evolution over time (emerging/stable/declining/contested)

**Concept Types**: entity, claim, theory, method, finding, policy, trend, controversy

**Relation Types**: supports, contradicts, extends, precedes, causes, correlates, part_of, instance_of

**Schema**: `ConceptNode` + `ConceptRelation` (Prisma models with Float[] embeddings)

**Determinism**: ⚠️ Semi-deterministic (LLM extraction + embedding)

---

---

## 🧬 V7 — Autonomous Intelligence Layer

These three agents transform NomosX from a sophisticated pipeline into a **genuinely self-improving research entity**. Each agent accumulates memory, evolves its reasoning, and challenges its own outputs before publication.

---

### 16. AGENT MEMORY

**File**: `lib/agent/agent-memory.ts`

**Purpose**: Persistent learning system — every agent accumulates a performance history that feeds back into its own prompts, creating a genuine improvement loop without fine-tuning.

**Key Functions**:
- `recordAgentPerformance(record)` — Store trust/quality scores, failure modes, lessons per agent per domain
- `computeCalibration(agentId, domain)` — Compute confidence adjustment, preferred providers, recurring failure modes from history
- `buildMemoryInjection(agentId, domain)` — Build a "what I've learned" prompt block injected into agent system prompts
- `extractLessons(agentId, question, output, feedback)` — LLM-generated lessons from past failures
- `storeLesson(agentId, lesson, runId)` — Persist lesson to `AgentAuditLog`
- `autoDetectFailureModes(metrics)` — Detect overconfidence, citation gaps, provider bias without human feedback

**FailureModes tracked**:
`overconfident`, `underconfident`, `citation_gaps`, `missed_contradiction`, `shallow_methodology`, `ignored_confounders`, `stale_framing`, `provider_bias`, `scope_creep`, `false_consensus`

**Calibration**: Adjusts confidence claims by up to ±20 points based on historical over/underconfidence. Raises quality thresholds for domains with poor track records.

**Prompt Injection Format**:
```
=== YOUR PERFORMANCE MEMORY ===
Your track record (last N analyses):
- Average trust score: 72/100
- Performance trend: IMPROVING
⚠️  CALIBRATION: You have been systematically OVERCONFIDENT. Reduce confidence by ~12 points.
🔴 YOUR RECURRING FAILURE MODES:
- You leave claims uncited. Every factual assertion needs a [SRC-N] reference.
📚 LESSONS FROM YOUR PAST ANALYSES:
- On climate policy: always check if carbon price levels are comparable across studies
=== END PERFORMANCE MEMORY ===
```

**Storage**: `AgentAuditLog` table (actions: `PERFORMANCE_RECORD`, `LESSON_LEARNED`)

**Determinism**: ✅ Calibration is deterministic; ⚠️ Lesson extraction uses LLM (temp=0.2)

---

### 17. RESEARCHER IDENTITY

**File**: `lib/agent/researcher-identity.ts`

**Purpose**: Each PhD researcher accumulates a persistent intellectual identity — prior positions, prediction track records, and the ability to explicitly evolve their views when new evidence contradicts past stances.

**Key Functions**:
- `storeResearcherPosition(position)` — Persist a researcher's stance on a topic after each analysis
- `storePrediction(prediction)` — Track falsifiable predictions with probability + timeframe
- `buildResearcherProfile(expertId, currentTopic)` — Retrieve semantically relevant prior positions + prediction accuracy
- `detectPositionEvolution(expertId, topic, newStance, priorPositions)` — LLM detects if researcher has changed position and why
- `storeExpertAnalysisMemory(expertId, question, analysis, runId)` — Called automatically after `runExpertCouncil()`

**Identity Block injected into system prompt**:
```
=== YOUR INTELLECTUAL HISTORY ===
You have completed 23 prior analyses.
Your average confidence level: 68/100
Prediction track record: 7/11 resolved predictions correct (64% accuracy)

## Your Prior Positions on Related Topics
[2025-11-14] On "carbon tax effectiveness in high-inequality contexts":
  Stance: Carbon taxes underperform in high-inequality contexts due to regressive burden
  Confidence: 72/100
  Key arguments: Distributional effects outweigh efficiency gains; compensatory mechanisms rarely implemented

IMPORTANT: If new evidence CONFIRMS your prior positions, say so explicitly.
If new evidence CONTRADICTS your prior positions, acknowledge the shift and explain why.
Do NOT silently contradict your past self. Intellectual evolution must be explicit.
=== END INTELLECTUAL HISTORY ===
```

**Semantic retrieval**: Prior positions are embedded and matched semantically to the current topic (cosine similarity ≥ 0.5)

**Storage**: `AgentAuditLog` table (actions: `POSITION_STORED`, `PREDICTION_STORED`)

**Determinism**: ⚠️ Semi-deterministic (embedding + LLM evolution detection)

---

### 18. DEVIL'S ADVOCATE

**File**: `lib/agent/devils-advocate.ts`

**Purpose**: Permanent adversarial gate — every publication faces a dedicated agent whose sole purpose is to find what is wrong, overstated, missing, or intellectually dishonest. Operates at the **epistemic level**, not just writing quality.

**Inspired by**: CIA Red Team methodology, Kahneman's pre-mortem, adversarial peer review at Nature/Science.

**Key Function**: `runDevilsAdvocate(question, analysisContent, sources, options)`

**Three parallel challenge tracks**:
1. **Epistemic Challenge** — Are conclusions actually supported? Logical flaws, unsupported claims, false consensus
2. **Strategic Challenge** — Would this survive hostile expert scrutiny? Missing stakeholders, implementation gaps, future vulnerabilities
3. **Institution Benchmark** — How does this compare to McKinsey/Brookings/RAND/France Stratégie?

**ChallengeTypes**:
`overstated_conclusion`, `missing_counterevidence`, `false_consensus`, `causation_from_correlation`, `selection_bias`, `temporal_fallacy`, `ecological_fallacy`, `straw_man`, `appeal_to_authority`, `missing_stakeholder`, `implementation_gap`, `unknown_unknowns`, `institutional_bias`, `recency_bias`

**Verdict logic**:
- `publish` — No fatal flaws, ≤2 major issues
- `revise` — 3+ major issues
- `major_revision` — 1 fatal flaw
- `reject` — 2+ fatal flaws

**Output includes**:
- `killShot` — The single argument that could most damage the analysis's credibility
- `hostileExpertReview` — What a McKinsey senior partner would say to dismiss this
- `futureVulnerabilities` — What could make this look naive in 2 years
- `vsInstitutionBenchmark` — Scores vs McKinsey (0-100), Brookings, RAND, France Stratégie
- `recommendation` — Actionable publication decision

**Pipeline integration**: Runs as step 13 in both `runFullPipeline()` and `runStrategicPipeline()`, after Critical Loop V2, before Publisher. Non-blocking (failures don't stop publication). Automatically feeds results into Agent Memory for learning.

**Determinism**: ⚠️ Semi-deterministic (3 parallel LLM calls, temp=0.2-0.4)

---

## 🔄 V7 Pipeline Flow

```
SCOUT → INDEX → EMBED → DEDUP → RANK → READER V3 → ANALYST V3 → GUARD → EDITOR
                  ↑                        ↑              ↑
           Semantic vectors         PDF full-text    3-pass analysis
                                                         ↑
                                               [AGENT MEMORY injected]
                                               [RESEARCHER IDENTITY injected]

→ CITATION VERIFIER → CRITICAL LOOP V2 → DEBATE → META-ANALYSIS
         ↑                    ↑               ↑            ↑
   Semantic validation   Iterative rewrite  Steel-man   Effect sizes

→ DEVIL'S ADVOCATE → PUBLISHER → KNOWLEDGE GRAPH
         ↑                              ↑
  Epistemic gate +            Concept extraction
  Institution benchmark +
  Memory recording
```

**Agents v7.0** — Self-improving autonomous research system. Each PhD researcher remembers their past positions and calibrates their confidence. Every publication is challenged by a permanent adversarial agent before release. The system learns from every run — getting measurably better over time.

---

## 2026-08-19 Sprint 6 — State-of-the-Art Research Agent Upgrades

A deep search of open-source AI agent research produced 15 targeted improvements, now integrated into the pipeline as opt-in features.

### New Pipeline Options (`runPipeline` / `runStrategicPipeline`)

All new features are opt-in to preserve backward compatibility:

```typescript
await runPipeline(query, "strategic", {
  useAgenticAnalyst: true,
  useSelfDiscover: true,          // composed reasoning structure per query
  useAdaptiveRAG: true,           // reflection tokens (Self-RAG / CRAG)
  useBudgetForcing: true,         // s1-style test-time scaling
  useLATS: true,                  // Monte Carlo Tree Search (stub — activate module)
  bestOfN: 3,                     // generate 3 analyst outputs, pick best
  useOutputGuard: true,           // structured output validation
  useLocalJudge: true,            // Prometheus 2 / JudgeLM judge
  useStorm: true,                 // STORM + PaperQA2 perspective/citation traversal
  useTemporalMemory: true,        // bi-temporal knowledge tracking
  useLangfuse: true,              // observability tracing
  useMCP: true,                   // Model Context Protocol client/server
  useADAS: true,                  // automated agent design
  useDurableExecution: true,      // lightweight snapshots
  useThinkTankPack: true,         // think tank quality pack
});
```

### Modules Added

| Module | File(s) | What it does |
|--------|---------|--------------|
| Prompt Optimizer | `lib/agent/prompt-optimizer/` | End-to-end prompt optimization from run feedback (DSPy/TextGrad-style) |
| Adaptive RAG | `lib/agent/adaptive-rag.ts` | Self-RAG/CRAG reflection tokens + retrieval evaluator + web search fallback |
| Chain-of-Verification | `lib/agent/chain-verification.ts` | CoVe: plan → draft → verify → revise |
| Budget Forcing | `lib/agent/budget-forcing.ts` | s1 test-time scaling via Wait tokens |
| HippoRAG 2 / LightRAG hybrid | `lib/agent/knowledge-graph-pagerank.ts` + `knowledge-graph.ts` | Multi-hop KG + vector retrieval; activated for multi-hop/causal queries |
| Source Quality Engine | `lib/agent/source-quality.ts` | Rerank sources by recency, authority, content richness, diversity |
| Peer Reviewer (Feynman-style) | `lib/agent/peer-reviewer.ts` | External peer review with severity-graded issues |
| RAGAS Eval | `lib/agent/ragas-eval.ts` | RAG quality: faithfulness, relevancy, context precision/recall |
| LATS | `lib/agent/lats/` | MCTS for multi-hypothesis agent reasoning |
| Self-Discover | `lib/agent/self-discover.ts` | Compose a reasoning structure per query |
| ADAS | `lib/agent/adas/` | Auto-generate and test new agent prompt variants |
| MCP | `lib/agent/mcp/` | Expose/consume Model Context Protocol tools |
| Local Judge | `lib/agent/local-judge.ts` | Open-source Prometheus 2 / JudgeLM judge with rubrics |
| Citation Verifier | `lib/agent/citation-verifier.ts` | OpenScholar-style passage-level citation grounding + source reliability |
| Output Guardrails | `lib/agent/output-guard.ts` | Structured output validation (schema, PII, citations) |
| STORM + PaperQA2 | `lib/agent/research-patterns.ts` | Perspective-driven question generation + citation traversal |
| Temporal Memory | `lib/agent/temporal-memory.ts` | Bi-temporal knowledge tracking (validFrom / validTo / recordedAt) |
| Langfuse | `lib/agent/langfuse.ts` | LLM tracing and scoring |
| Durable Execution | `lib/agent/durable-execution.ts` | Lightweight run snapshots + engine comparison |
| Think Tank Quality Pack | `lib/agent/think-tank-pack.ts` | Policy recommendations, stakeholder mapping, economics, editorial polish |

### What is currently wired live

- `callLLM` automatically traces to Langfuse when `runId` is passed.
- Agentic ANALYST (`analyst-react.ts`) supports `useSelfDiscover`, `useBudgetForcing`, `useAdaptiveRAG`, `useLATS`, `useMCP`.
- **Best-of-N** — the agentic ANALYST can generate `bestOfN` candidate outputs, score them (coverage, citations, judge), and return the best.
- **JSON mode final answer** — `reactLoop` forces the final LLM call to use `jsonMode`, improving structured output reliability.
- **Think Tank Quality Pack** — `lib/agent/think-tank-pack.ts` : relecture éditoriale, recommandations par stakeholder, options/trade-offs, contexte économique et régulatoire.
- **OpenScholar-style Citation Verifier** — `lib/agent/citation-verifier.ts` now retrieves relevant passages from full text, scores source reliability, and returns evidence snippets.
- **M-Prometheus / Prometheus 2 Local Judge** — `lib/agent/local-judge.ts` enhanced rubrics: grounding, policy relevance, think tank quality.
- **Feynman-style Peer Reviewer** — `lib/agent/peer-reviewer.ts` simulates external peer review with severity-graded feedback.
- **RAGAS Evaluation** — `lib/agent/ragas-eval.ts` evaluates faithfulness, answer relevancy, context precision, context recall.
- Classic ANALYST path supports `useOutputGuard` and `useLocalJudge` post-analysis.
- Durable Execution is initialized when `useDurableExecution` is true.
- New options are propagated through `runPipeline` → `runPipelineCore`.

### Activation pattern

1. Set `ENABLE_LANGFUSE=true`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` for observability.
2. Pass `useSelfDiscover: true` and `useBudgetForcing: true` with `useAgenticAnalyst: true` for the best agentic experience.
3. Use `useOutputGuard: true` and `useLocalJudge: true` for quality validation.

### TypeScript

All new modules compile: `npx tsc --noEmit` is green.

