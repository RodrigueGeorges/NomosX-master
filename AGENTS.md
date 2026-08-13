# NomosX Agents

**Complete specification of the agentic pipeline**

---

## 🧠 Agent Philosophy

Each agent in NomosX has:
- **Single responsibility**: One clear task
- **Deterministic behavior**: Same inputs → same outputs (within LLM variance)
- **Traceable outputs**: All decisions logged
- **Fail-safe**: Graceful degradation on errors

Agents communicate via:
- Database (Prisma ORM)
- Job queue (priority-based)
- JSON payloads (structured data)

---

## 📋 Agent Catalog

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

## 🔄 Agent Orchestration

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
