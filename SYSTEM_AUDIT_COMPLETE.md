# NomosX — Audit Système Complet
## Document de référence pour IA (Claude/GPT) — CTO, CPO, CEO, CMO, AI Engineer

> **Objectif** : Permettre à n'importe quelle IA de comprendre toute la structure, corriger ou améliorer n'importe quel composant.
> **Dernière mise à jour** : 25 juin 2026

---

# TABLE DES MATIÈRES

1. [Vision Produit (CEO/CPO)](#1-vision-produit)
2. [Business Model (CPO/CMO)](#2-business-model)
3. [Architecture Système (CTO)](#3-architecture-système)
4. [Pipeline 16 Steps — Détail Complet (AI Engineer)](#4-pipeline-16-steps)
5. [Agent Catalog — Specs Complètes (AI Engineer)](#5-agent-catalog)
6. [Foresight Engine — Swarm Simulation (AI Engineer)](#6-foresight-engine)
7. [Orchestration & Funnel (CTO/AI Engineer)](#7-orchestration--funnel)
8. [Providers — 100+ Sources (AI Engineer)](#8-providers)
9. [LLM Configuration (AI Engineer)](#9-llm-configuration)
10. [Frontend — Pages & Components (CPO)](#10-frontend)
11. [API Routes — Production vs Code Mort (CTO)](#11-api-routes)
12. [Infrastructure & Deployment (CTO)](#12-infrastructure)
13. [Cron Jobs — Autonomous Loop (CTO)](#13-cron-jobs)
14. [Database Schema (CTO)](#14-database-schema)
15. [Code Mort — À Nettoyer (CTO)](#15-code-mort)
16. [Améliorations Recommandées (CTO/AI Engineer)](#16-améliorations-recommandées)

---

# 1. Vision Produit

## Ce qu'est NomosX

NomosX est un **think tank agentic** — un système autonome qui :
- **Détecte** les signaux émergents (geopolitics, AI, climate, finance, health, cyber, etc.)
- **Recherche** across 100+ academic + institutional + news providers
- **Analyse** avec un pipeline 16 steps incluant 22 PhD researchers, debate adversarial, fact-checking
- **Simule** le futur avec un swarm de 1024 agents (Foresight Engine v3)
- **Publie** des briefs professionnels au format HTML (8 formats, de 1 à 50 pages)
- **Distribue** via newsletter, archives publiques, et Studio on-demand

## Proposition de valeur unique

| vs | Avantage NomosX |
|---|---|
| **Brookings/RAND** | 100+ sources en temps réel vs manuel, swarm simulation, 22 PhD virtuels |
| **ChatGPT/Claude** | Citations [SRC-N] vérifiables, fact-checking, adversarial debate, publication gate |
| **Bloomberg/Reuters** | Analyse académique + institutionnelle, pas juste financier |
| **France Stratégie** | 16-step pipeline automatisé vs processus manuel de semaines |

## Marché cible

- **Reader (Free)** : Accès à toutes les publications — SEO, newsletter, brand awareness
- **Studio (Pay-per-use €9-€299)** : Commissions custom pour entreprises, consultants, gouvernements

---

# 2. Business Model

## Pricing en production (2 tiers)

```
┌──────────────────────────────────────────────────────────┐
│  READER (Free Forever)                                   │
│  ├── Toutes les publications publiées                    │
│  ├── Source traceability complète                        │
│  ├── Newsletter hebdomadaire                             │
│  └── Archives complètes                                  │
├──────────────────────────────────────────────────────────┤
│  NOMOSX STUDIO (Pay per Commission)                      │
│  ├── Commission custom (question → pipeline)             │
│  ├── 8 formats (€9 à €299)                               │
│  ├── 4 modes: Commission, Monitor, Compare, Board Memo   │
│  ├── Multi-agent Foresight                               │
│  ├── Adversarial debate                                  │
│  ├── Citation export                                     │
│  └── Priority pipeline queue                             │
└──────────────────────────────────────────────────────────┘
```

## StudioX Pricing (`lib/studiox-pricing.ts`)

| Format | Prix | Pages | Sources | Depth |
|---|---|---|---|---|
| SUMMARY_BRIEF | €9 | 1-2 | 5+ | surface |
| UPDATE_NOTE | €9 | 1-2 | 3+ | surface |
| DATA_NOTE | €19 | 2-3 | dataset-led | standard |
| POLICY_NOTE | €29 | 3-5 | 8+ | standard |
| RESEARCH_BRIEF | €49 | 4-6 | 10+ | standard |
| EXECUTIVE_BRIEF | €49 | 4-6 | 10+ | deep |
| STRATEGIC_REPORT | €149 | 10-15 | 20+ | strategic |
| DOSSIER | €299 | 30-50 | 50+ | strategic |

## ⚠️ Business model obsolète (à nettoyer)

`lib/stripe.ts` contient encore 4 plans legacy :
- TRIAL → obsolète (remplacé par Reader free)
- ANALYST → obsolète (fusionné avec Reader free)
- RESEARCHER (€19/mo) → obsolète (remplacé par StudioX pay-per-use)
- STUDIO (€49/mo subscription) → obsolète (remplacé par StudioX pay-per-use)

**Routes API obsolètes liées** : `/api/subscription/*`, `/api/studio/analyze` (subscription-based)

---

# 3. Architecture Système

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                    NETLIFY (Hosting + Cron)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Cron 06h │  │ Cron 18h │  │ Cron Sun │  │ Cron Wed │       │
│  │auto-scan │  │auto-scan │  │gen-briefs│  │gen-briefs│       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │              │             │
│  ┌────▼──────────────▼──────────────▼──────────────▼─────┐      │
│  │           THINK TANK DISPATCHER                        │      │
│  │  SENSE → DECIDE → DISPATCH → runAndPublishInquiry()  │      │
│  └────────────────────┬──────────────────────────────────┘      │
│                       │                                          │
│  ┌────────────────────▼──────────────────────────────────┐      │
│  │           INQUIRY ORCHESTRATOR                         │      │
│  │  VALIDATE → RUN (pipeline) → GATE → PERSIST           │      │
│  └────────────────────┬──────────────────────────────────┘      │
│                       │                                          │
│  ┌────────────────────▼──────────────────────────────────┐      │
│  │           INQUIRY PIPELINE                             │      │
│  │  runPipeline() → maybeRunSimulation() → build Inquiry  │      │
│  └────────────────────┬──────────────────────────────────┘      │
│                       │                                          │
│  ┌────────────────────▼──────────────────────────────────┐      │
│  │           PIPELINE V2 CORE (16 steps)                  │      │
│  │  SCOUT→INDEX→EMBED→DEDUP→RANK→DOMAIN→READER→          │      │
│  │  ANALYST→EDITOR→GUARD→VERIFY→FACTCHECK→               │      │
│  │  CRITICALLOOP→DEBATE+META→DEVILSADV→                  │      │
│  │  PUBLISHER→KNOWLEDGEGRAPH                              │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐      │
│  │  STUDIOX (Pay-per-use add-on)                          │      │
│  │  /api/studiox/checkout → Stripe → /api/studiox (LLM)  │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐      │
│  │  DATABASE (PostgreSQL + Prisma)                        │      │
│  │  + Redis (cache) + pgvector (embeddings)               │      │
│  └───────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## Stack technique

| Layer | Techno | Fichier clé |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | `next.config.mjs` |
| **Language** | TypeScript 5.x | `tsconfig.json` |
| **Database** | PostgreSQL + Prisma ORM | `prisma/schema.prisma` |
| **Cache** | Redis (scout cache, rate limits) | `lib/agent/redis-simple.ts` |
| **Embeddings** | pgvector + Cohere | `lib/agent/semantic-engine.ts` |
| **LLM** | DeepSeek (primary) + OpenAI + Anthropic | `lib/llm/unified-llm.ts` |
| **Payments** | Stripe (checkout + webhook) | `lib/stripe.ts` |
| **Auth** | JWT (custom, bcrypt) | `lib/auth.ts` |
| **Hosting** | Netlify (functions + cron) | `netlify.toml` |
| **UI** | React + Tailwind + shadcn/ui | `components/ui/` |
| **Icons** | Lucide React | — |
| **Monitoring** | Sentry | `sentry.*.config.ts` |
| **Testing** | Jest + Cypress | `jest.config.mjs`, `cypress.config.ts` |

## Product hierarchy

```
PRIMARY  → ThinkTankDispatcher (autonomous crons)
            ├── auto-scan (breaking, 2×/day)
            └── generate-briefs (weekly, Sun + Wed)

ADD-ON   → StudioX (pay-per-use, user-triggered)
            ├── /api/studiox/checkout (Stripe payment)
            └── /api/studiox (LLM-powered response)
```

**Important** : StudioX actuel fait un simple `callLLM()` avec context, **pas** le pipeline 16 steps complet. Le pipeline complet n'est déclenché que par les cron jobs.

---

# 4. Pipeline 16 Steps — Détail Complet

## Flow complet (`lib/agent/pipeline-v2.ts:runPipelineCore()`)

```
STEP 0:  CONTEXT PRIMER
         → primeContext() : charge institutional memory, concepts connus,
           prior briefs, trend breaks depuis Knowledge Graph
         → Non-bloquant si échec
         → Fichier: lib/agent/context-primer.ts

STEP 1:  SCOUT
         → scout() : Query Enhancement (LLM) → Multi-query parallel search
         → 100+ providers en parallèle (Promise.allSettled)
         → Redis cache (24h TTL) pour éviter re-queries
         → Dedup by DOI then normalized title
         → Relevance filtering + Cohere reranking
         → Unpaywall enrichment (batch, 10/chunk)
         → Batch upsert to DB (20/batch, deadlock retry)
         → Orchestrator checkpoint: assessAfterScout()
         → RE_SCOUT loop si sources insuffisantes (strategic only)
         → Fichier: lib/agent/pipeline-v2.ts:352-777

STEP 2:  INDEX
         → indexAgent() : Extract authors, institutions, ROR/ORCID enrichment
         → Create SourceAuthor / SourceInstitution links
         → Batch novelty score updates
         → Fichier: lib/agent/index-agent.ts

STEP 2b: EMBED
         → embedSourcesBatch() : Generate semantic vectors (pgvector)
         → Skip cached embeddings
         → Fichier: lib/agent/semantic-engine.ts

STEP 3:  DEDUPLICATE
         → deduplicateSources() : Group by DOI, keep earliest, delete rest
         → Fichier: lib/agent/index-agent.ts

STEP 4:  RANK
         → rank() → enhancedRank() : Composite score (quality + novelty + recency)
         → Relevance score (keyword matching)
         → Intent-based reranking (debate/consensus/recent/foundational/institutional)
         → Diversity controls: maxPerProvider, maxPerYear, minProviderDiversity
         → French source guarantee (hal, thesesfr)
         → Scoped to current SCOUT sourceIds (pas toute la DB)
         → ABORT si 0 sources retournées
         → Fichier: lib/agent/enhanced-ranker.ts

STEP 4b: DOMAIN CLASSIFICATION
         → classifyTopicSync() : Detect primary domain for domain-aware prompting
         → Returns: primaryDomain, confidence, verticalSlug, researchers[], providers[]
         → Fichier: lib/agent/topic-classifier.ts

STEP 5:  READER V3
         → readerAgentV3() : Deep extraction from top sources
         → Extract: claims (max 3), methods (max 3), results (max 3), limitations (max 2)
         → Full-text PDF extraction (enablePdf: true)
         → Quantitative data: effect sizes, sample sizes, p-values
         → Domain-aware prompting
         → Max concurrency: 5, timeout: 25s (strategic)
         → Confidence: high/medium/low
         → Orchestrator checkpoint: assessAfterReader()
         → Fichier: lib/agent/reader-agent-v3.ts

STEP 6:  ANALYST
         → Brief mode: analystMultipass() — 3-pass (thematic → contradictions → synthesis)
         → Strategic mode: strategicAnalystAgent() — 10 sections, 16K tokens output
         → Agent Memory injection: past lessons from AgentMemory
         → Context priming: institutional memory + domain knowledge
         → Domain KB injection: key concepts, frameworks, known biases
         → Multi-domain corpus: seminal works, key frameworks
         → Topic consistency validation post-analysis
         → Orchestrator checkpoint: assessAfterAnalyst()
         → Fichiers: lib/agent/analyst-multipass.ts, lib/agent/strategic-analyst-agent.ts

STEP 6a: STRUCTURAL EDITOR
         → structuralEditorReview() : McKinsey pyramid principle review
         → Checks: overall structure (0-100), narrative arc, logical gaps
         → Auto-restructure if score < 70
         → Fichier: lib/agent/structural-editor.ts

STEP 6b: HARVARD COUNCIL
         → Enhanced mode (strategic): runEnhancedHarvardCouncil()
           - 22 PhD researchers from lib/researchers.ts
           - Intelligent PhD selection (domain-aware)
           - Hierarchical: domain leads → interdisciplinary
           - Cross-domain connections, conflicts, synergies
           - Recommendations: immediate, short-term, long-term, research
         → Legacy mode (brief): runHarvardCouncil()
           - 9 expert analyses + reviews
           - CEBM evidence grading + GRADE certainty
         → Fichiers: lib/agent/harvard-council-enhanced.ts, lib/agent/review-board.ts

STEP 6c: PhD COLLABORATIVE DELIBERATION (strategic only)
         → runCollaborativeDeliberation() : Experts debate findings
         → Challenges, critical challenges, consensus points
         → Active disagreements, emergent insights
         → Deliberation depth (0-100), consensus level (0-100)
         → Fichier: lib/agent/phd-deliberation.ts

STEP 7:  CITATION GUARD
         → citationGuard() : Validate all [SRC-N] citations
         → Check: ≥1 citation, all N in 1..sourceCount
         → Non-fatal (degraded quality flag)
         → Fichier: lib/agent/pipeline-v2.ts:1177-1185

STEP 8:  EDITOR
         → renderProfessionalBriefHTML() or renderProfessionalStrategicHTML()
         → Premium HTML template with:
           - Executive summary, consensus, disagreements
           - Debate (pro/con/synthesis)
           - Evidence quality, implications, risks
           - Open questions, what would change our mind
           - Source distribution SVG
           - [SRC-N] citation list
         → Fallback to legacy renderBriefHTML() if professional fails
         → Fichier: lib/agent/editor-agent.ts

STEP 9:  CITATION VERIFIER
         → verifyCitations() : Semantic check of citations vs sources
         → Overall integrity %, supported count, flagged claims
         → Fichier: lib/agent/citation-verifier.ts

STEP 9b: FACT-CHECKER
         → factChecker() : Verify numerical claims against sources
         → Total claims, verified, major issues, fatal issues
         → Integrity score (0-100)
         → Fatal flag if fatalIssues > 0
         → Fichier: lib/agent/fact-checker.ts

STEP 10: CRITICAL LOOP V2
         → runCriticalLoopV2() : Iterative review and improvement
         → Max 2 iterations
         → Publish threshold: 70 (strategic) / 65 (brief)
         → Composite score, improvement delta
         → Updates HTML if improvement > 0
         → Fichier: lib/agent/critical-loop-v2.ts

STEP 11: DEBATE (parallel with STEP 12)
         → debateAgent() : Adversarial debate
         → Dominant thesis, counter-position, confidence (0-100)
         → Steel-man strength, nuances
         → Fichier: lib/agent/debate-agent.ts

STEP 12: META-ANALYSIS (parallel with STEP 11)
         → metaAnalysisEngine() : Statistical meta-analysis
         → k studies, pooled effect (fixed + random effects)
         → I² heterogeneity, publication bias detection
         → Forest plot entries
         → Fichier: lib/agent/meta-analysis-engine.ts

STEP 13: DEVIL'S ADVOCATE
         → runDevilsAdvocate() : Final epistemic gate
         → Verdict: publish/revise/reject
         → Publishability score (0-100)
         → Fatal challenges, major challenges
         → vs Institution benchmark (McKinsey, Brookings, RAND, France Stratégie)
         → AUTO-REVISION if fatal challenges found:
           - Rewrite HTML to address ALL fatal + major challenges
           - Preserve [SRC-N] citations
           - LLM call with 12K tokens output
         → Agent Memory: record performance + extract lessons
         → Fichier: lib/agent/devils-advocate.ts

STEP 14: PUBLISHER
         → prisma.brief.create() : Save brief to DB
         → kind: "brief" | "strategic"
         → html, sources, pipelineRunId, lineage
         → Fichier: lib/agent/pipeline-v2.ts:2143-2157

STEP 15: KNOWLEDGE GRAPH
         → extractAndStoreConcepts() : Post-publish concept extraction
         → Concepts + relations extracted from HTML
         → Stored for future context priming + editorial planning
         → Source reputation tracking (cited vs uncited)
         → Fichier: lib/agent/knowledge-graph.ts
```

## Budget guard

| Mode | Budget max | Timeout |
|---|---|---|
| Brief | $3.00 | 10 min (600s) |
| Strategic | $8.00 | 15 min (900s) |

Le pipeline **abort** si le coût cumulé dépasse le budget.

## Depth → Pipeline format mapping

| Depth | Format | perProvider | rankOptions.limit | Notes |
|---|---|---|---|---|
| surface | brief | 12 | 6 | Quick signal brief |
| standard | brief | 20 | 12 | Default brief |
| deep | strategic | 25 | 20 | requireAbstract, minQuality 65 |
| strategic | strategic | 30 | 25 | recentOnly, requireAbstract, minQuality 65 |

---

# 5. Agent Catalog

## 5.1 SCOUT Agent

**File**: `lib/agent/pipeline-v2.ts:352-777`

**Purpose**: Collect raw research from 100+ providers

**Inputs**:
- `query: string`
- `providers: Providers[]`
- `perProvider: number` (default: 100)

**Process**:
1. Query Enhancement (LLM): generate enhanced query + 3 variations
2. Multi-query parallel search (Promise.allSettled, 100+ providers)
3. Theses.fr special handling (HAL bridge enrichment)
4. Extended registry providers (domain-aware auto-include)
5. Deduplication (DOI → normalized title)
6. Relevance filtering (keyword matching, 0.15 threshold)
7. Cohere reranking (topK 100, minScore 0.2)
8. Unpaywall enrichment (batch 10, DOI-based)
9. Batch upsert (20/batch, deadlock retry, sequential fallback)
10. Redis cache (24h TTL, hash-based key)

**Outputs**:
- `{ found: number, upserted: number, sourceIds: string[], cached: boolean }`

**Governance**: `assertPermission(AgentRole.SCOUT, "write:sources")`

**Error handling**: Provider failures logged, don't stop pipeline

## 5.2 INDEX Agent

**File**: `lib/agent/index-agent.ts`

**Purpose**: Normalize sources, enrich identities (ROR/ORCID), deduplicate

**Process**:
1. Extract authors from raw data → search/create `Author` records
2. Enrich with ORCID if available
3. Extract institutions → search/create `Institution` records
4. Enrich with ROR API (by name or ID)
5. Create `SourceAuthor` / `SourceInstitution` links
6. Compute novelty score (year, citations, recency)
7. Deduplicate by DOI (keep earliest by createdAt)

## 5.3 RANK Agent V3

**File**: `lib/agent/enhanced-ranker.ts` (called from `pipeline-v2.ts:837-850`)

**Purpose**: Select top sources with relevance, date filtering, diversity controls

**RankOptions** (complete interface):
```typescript
interface RankOptions {
  limit?: number;                  // Max sources (default: 12)
  mode?: "quality" | "novelty" | "balanced";
  sourceIds?: string[];            // Scope to current SCOUT run
  minYear?: number;
  maxYear?: number;
  recentOnly?: boolean;            // Only last 3 years
  minQuality?: number;             // Quality score threshold (default: 70)
  excludeProviders?: string[];
  includeProviders?: string[];
  requireAbstract?: boolean;
  minAbstractLength?: number;
  maxPerProvider?: number;         // Default: 4
  maxPerYear?: number;             // Default: 3
  minProviderDiversity?: number;   // Default: 3
}
```

**Scoring**:
- Composite = quality×0.4 + novelty×0.4 + recency×0.1 + diversity×0.1
- Intent-based reranking (debate/consensus/recent/foundational/institutional)
- French source guarantee (hal, thesesfr)

## 5.4 READER Agent V3

**File**: `lib/agent/reader-agent-v3.ts`

**Purpose**: Deep extraction from abstracts + full-text

**Outputs per source**:
```typescript
{
  sourceId: string,
  claims: string[],        // max 3
  methods: string[],       // max 3
  results: string[],       // max 3
  limitations: string[],   // max 2
  confidence: "high" | "medium" | "low",
  readingDepth: "abstract" | "full_text",
  quantitative: {
    effectSizes: string[],
    sampleSizes: string[],
    pValues: string[]
  }
}
```

**Config**: `enablePdf: true, maxConcurrency: 5, timeout: 25s (strategic)`

## 5.5 ANALYST Agent

### Brief mode: Multi-pass V3
**File**: `lib/agent/analyst-multipass.ts`

3 passes:
1. **Thematic** — Extract themes, consensus, disagreements
2. **Contradictions** — Identify conflicts in evidence
3. **Synthesis** — Integrate into coherent analysis

**Output**: `{ title, summary, consensus, disagreements, debate, evidence, implications, risks, open_questions, what_changes_mind }`

### Strategic mode: Strategic Analyst
**File**: `lib/agent/strategic-analyst-agent.ts`

10 sections, 16K tokens output:
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

## 5.6 STRUCTURAL EDITOR

**File**: `lib/agent/structural-editor.ts`

**Purpose**: McKinsey pyramid principle review

**Checks**:
- Overall structure (0-100)
- Narrative arc validity
- Section-level reviews
- Logical gaps detection
- Auto-restructure if score < 70

## 5.7 HARVARD COUNCIL

### Enhanced mode (strategic)
**File**: `lib/agent/harvard-council-enhanced.ts`

- 22 PhD researchers from `lib/researchers.ts`
- Intelligent PhD selection (domain-aware)
- Hierarchical: domain leads → interdisciplinary synthesis
- Cross-domain connections, conflicts, synergies
- Recommendations: immediate, short-term, long-term, research
- Evidence quality: CEBM level + GRADE certainty

### Legacy mode (brief)
**File**: `lib/agent/review-board.ts`

- 9 expert analyses
- Peer reviews
- CEBM evidence grading
- GRADE certainty
- Calibrated predictions

## 5.8 PhD COLLABORATIVE DELIBERATION

**File**: `lib/agent/phd-deliberation.ts`

**Process**: Experts debate findings from Harvard Council

**Outputs**:
- Total challenges, critical challenges
- Consensus points, active disagreements
- Emergent insights
- Deliberation depth (0-100), consensus level (0-100)

## 5.9 CITATION GUARD

**File**: `lib/agent/pipeline-v2.ts:1177-1185`

**Logic**: Extract all [SRC-N] patterns via regex, validate 1 ≤ N ≤ sourceCount

## 5.10 EDITOR Agent

**File**: `lib/agent/editor-agent.ts`

**Functions**:
- `renderProfessionalBriefHTML()` — Premium brief template
- `renderProfessionalStrategicHTML()` — Premium strategic template (10-15 pages)
- Fallback: `renderBriefHTML()` / `renderStrategicReportHTML()`

## 5.11 CITATION VERIFIER

**File**: `lib/agent/citation-verifier.ts`

**Purpose**: Semantic check that citations actually support claims

## 5.12 FACT-CHECKER

**File**: `lib/agent/fact-checker.ts`

**Purpose**: Verify numerical claims against sources

**Outputs**: `{ totalClaims, verified, majorIssues, fatalIssues, integrityScore }`

## 5.13 CRITICAL LOOP V2

**File**: `lib/agent/critical-loop-v2.ts`

**Purpose**: Iterative review and improvement (max 2 iterations)

**Publish threshold**: 70 (strategic) / 65 (brief)

## 5.14 DEBATE Agent

**File**: `lib/agent/debate-agent.ts`

**Outputs**: `{ dominantThesis, position2, confidenceInDominant, steelManStrength, nuances, synthesis }`

## 5.15 META-ANALYSIS Engine

**File**: `lib/agent/meta-analysis-engine.ts`

**Outputs**: `{ k, fixedEffect, randomEffects, heterogeneity: { I2 }, publicationBias, forestPlot }`

## 5.16 DEVIL'S ADVOCATE

**File**: `lib/agent/devils-advocate.ts`

**Outputs**: `{ verdict, overallStrength, publishabilityScore, fatalChallenges[], majorChallenges[], vsInstitutionBenchmark: { mckinsey, brookings, rand, franceStrategie } }`

**Auto-revision**: If fatal challenges, rewrite HTML via LLM (12K tokens)

**Agent Memory**: Records performance + extracts lessons for future runs

## 5.17 KNOWLEDGE GRAPH Agent

**File**: `lib/agent/knowledge-graph.ts`

**Purpose**: Post-publish concept extraction + relation mapping

**Functions**: `extractAndStoreConcepts()`, `getLongitudinalInsights()`

## 5.18 AGENT MEMORY

**File**: `lib/agent/agent-memory.ts`

**Purpose**: Self-improving system — learns from past pipeline runs

**Functions**:
- `buildMemoryInjection()` — Inject past lessons into ANALYST prompt
- `recordAgentPerformance()` — Record run metrics
- `autoDetectFailureModes()` — Detect patterns of failure
- `extractLessons()` — LLM-powered lesson extraction
- `storeLesson()` — Persist for future runs
- `computeCalibration()` — Adjust thresholds based on history

## 5.19 CONTEXT PRIMER

**File**: `lib/agent/context-primer.ts`

**Purpose**: Inject institutional memory before ANALYST

**Loads**: Known concepts, prior briefs, emerging trends, trend breaks, coverage gaps

## 5.20 ORCHESTRATOR

**File**: `lib/agent/orchestrator.ts`

**Purpose**: Adaptive pipeline controller — makes decisions at each step

**Actions**: PROCEED, RE_SCOUT, DEEPEN, RE_ANALYZE, DEBATE, PIVOT, ABORT

**Checkpoints**:
1. `assessAfterScout()` — Sources sufficient? Diverse enough? Quality OK?
2. `assessAfterReader()` — Abstracts sufficient? Need full-text?
3. `assessAfterAnalyst()` — Confidence OK? Need more sources or debate?
4. `assessAfterCriticalLoop()` — Trust score meets threshold?

**Calibrated thresholds**: Loaded from AgentMemory, adjusted based on historical performance

---

# 6. Foresight Engine — Swarm Simulation

## Architecture

```
inquiry-pipeline.ts
  → maybeRunSimulation()
    → simulationAgent()  [lib/agent/simulation-agent.ts, 1398 lignes]
      → buildForesightGraph()     [GraphRAG]
      → buildPersonaPanel()       [22-30 personas]
      → spawnCrowd()              [384-1024 numeric agents]
      → Simulation ticks:
           → LLM persona speaks (every N ticks)
           → propagateCrowd()     [social dynamics]
           → runSocialTick()      [dual-channel social feed]
           → syncLeadersFromCrowd()
      → runMonteCarloSimulation() [1500-3000 runs, multi-seed]
      → computeSensitivityMatrix()
      → Red team challenge
    → appendSimulationToHtml()
  → persistForesightRun()
```

## Depth configuration

| Depth | Ticks | MC Runs | Personas | Swarm | Seeds | Cost max | LLM every N ticks | Bootstrap |
|---|---|---|---|---|---|---|---|---|
| surface | 0 | 0 | 0 | 0 | 0 | $0 | — | 0 |
| standard | 0 | 0 | 0 | 0 | 0 | $0 | — | 0 |
| deep | 16 | 1,500 | 22 | 384 | 2 | $2.80 | 3 | 180 |
| strategic | 24 | 3,000 | 30 | 1,024 | 3 | $5.50 | 2 | 300 |

## Persona archetypes (9)

`regulator`, `industry`, `academic`, `ngo`, `media`, `public`, `investor`, `labor`, `state`

Each persona has:
- Values (security, innovation, equity, profit) — archetype-dependent
- Beliefs, memory, influencedBy, influence score
- LLM profile (systemPrompt, temperature)
- Positions per scenario (0-1 probability)
- Grounded source IDs

## Swarm mechanics (`lib/agent/foresight-swarm.ts`)

- **spawnCrowd()**: 384-1024 numeric agents, clustered around leader personas
- **propagateCrowd()**: Social influence propagation (alpha=0.12)
  - 50% leader influence + 30% self-position + 20% viral boost
- **aggregateCrowdMomentum()**: Weighted by agent activity
- **syncLeadersFromCrowd()**: Leaders adjust based on crowd feedback (weight=0.25)

## Social feed (`lib/agent/foresight-social.ts`)

- Dual-channel: formal + informal
- `runSocialTick()`: Personas post, react, form coalitions
- `summarizeFeed()`: LLM summarizes social activity per tick

## GraphRAG (`lib/agent/foresight-graph.ts`)

- `buildForesightGraph()`: Build graph from source evidence
- `graphScenarioBoost()`: Boost scenario probabilities based on graph structure

## Monte Carlo

- Multi-seed (2-3 seeds) for robustness
- Convergence check (tolerance-based)
- Bootstrap confidence intervals (180-300 runs)
- Outputs: empirical probabilities, trajectories, confidence intervals

## Foresight config (`lib/foresight/config.ts`)

```typescript
NOMOSX_FORESIGHT_ENABLED = true (default)
NOMOSX_FORESIGHT_MAX_COST_USD = 5.50
NOMOSX_FORESIGHT_CHAT_RATE_LIMIT = 10/min
NOMOSX_FORESIGHT_MIN_SEED_SOURCES = 8
```

## Foresight chat (persona chat)

**Route**: `/api/foresight/chat`
**Flow**: `resolvePublicationPersona()` → `chatWithSimulatedPersona()`
**Rate limit**: 10/min per IP
**Frontend**: `PersonaChat` component on inquiry detail page

## When Foresight runs

- **Auto-triggered**: After ANALYST step, if `depth >= "deep"` AND ≥2 scenarios detected
- **Non-blocking**: Simulation failures don't stop the pipeline
- **Persisted**: `ForesightRun` table, linked to publication
- **Displayed**: `ForesightPanel` component on `/inquiry/[slug]`

---

# 7. Orchestration & Funnel

## Publication funnel (3 layers)

```
Layer 1: THINK TANK DISPATCHER (autonomous brain)
  ├── SENSE: TopicRadar (6 parallel sweeps, <35s)
  ├── DECIDE: Editor-in-Chief (LLM triage, ~$0.001)
  └── DISPATCH: runAndPublishInquiry() for each selected topic

Layer 2: INQUIRY ORCHESTRATOR (publication funnel)
  ├── VALIDATE: Question length, vertical exists, dedup check
  ├── RUN: runInquiryPipeline() → pipeline + simulation
  ├── GATE: Publication gate + readiness + Devil's Advocate verdict
  └── PERSIST: thinkTankPublication + brief link + foresight run

Layer 3: INQUIRY PIPELINE (pipeline runner)
  ├── runPipeline() → runPipelineCore() (16 steps)
  ├── maybeRunSimulation() → simulationAgent()
  └── Build Inquiry object with sections, sources, verdict
```

## Think Tank Dispatcher (`lib/agent/think-tank-dispatcher.ts`)

### Modes

| Mode | Schedule | Max pubs | Budget | Strategy |
|---|---|---|---|---|
| **breaking** | 2×/day (06:00 + 18:00 UTC) | 2 | $20 | TopicRadar → Editor-in-Chief |
| **weekly** | Sunday 22:00 + Wednesday 12:00 UTC | 3 (cadence) | — | Editorial plan + signal fallback |

### Breaking mode flow

1. `runTopicRadar()` — 6 parallel sweeps:
   - GDELT (14 verticals)
   - RSS Elite (30 feeds: think tanks + news + central banks)
   - Academic (OpenAlex trending + arXiv + Semantic Scholar)
   - Policy/Data (NBER, VoxEU, World Bank, IMF, Eurostat, UN)
   - Institutions (ECB, BIS, OECD, WTO, ILO, WHO, NATO, IAEA)
   - DB Signals (existing high-priority unprocessed)

2. `editorialTriage()` — Single LLM call (deepseek-v4-flash, ~$0.001):
   - Selection criteria: Novelty, Urgency, Impact, Angle, Diversity
   - Actions: publish_brief, publish_strategic, monitor, skip
   - Budget-aware (skip if over budget unless priority ≥90)

3. `breakingDecisionToItem()` — Convert to dispatch item with:
   - depth: "strategic" (breaking always strategic)
   - providers: classified + news providers
   - perProvider: 15

### Weekly mode flow

1. `planEditorialAgenda()` — Editorial planner:
   - Emerging trends from Knowledge Graph
   - Coverage gaps detection
   - Stale coverage (briefs >60 days old)
   - Controversy shifts
   - Signal-detected topics
   - Cross-topic links
   - Auto-commission if confidence ≥85

2. Signal fallback — High-priority signals (≥70 score) from DB

### Cadence management

- `getWeeklyPublicationMax()` — env `NOMOSX_WEEKLY_PUBLICATION_MAX` (default: 3, max: 25)
- `getCadenceState()` — Count published this week, per-vertical
- `verticalHasCapacity()` — Per-vertical max (default: 3/week)
- `cadence-reset` cron — Daily 00:00 UTC

## Editor-in-Chief (`lib/agent/editor-in-chief.ts`)

**Model**: `deepseek-v4-flash` (fast, cheap)
**Temperature**: 0.15
**Max tokens**: 800
**JSON mode**: true

**Selection criteria** (in order):
1. NOVELTY — Not already covered
2. URGENCY — Time-sensitive > evergreen
3. IMPACT — Policy changes, crises, breakthroughs
4. ANGLE — Can we add unique value?
5. DIVERSITY — Mix domains

## Editorial Planner (`lib/agent/editorial-planner.ts`)

**Auto-commission threshold**: 85 (confidence)
**Stale threshold**: 60 days
**Max proposals**: 10 per cycle

**Reasons**:
- `emerging_trend` — Knowledge Graph shows rapid growth
- `coverage_gap` — Important topic never covered
- `stale_coverage` — Prior brief outdated
- `controversy_shift` — Active debate has new developments
- `signal_detected` — High-priority signal
- `cross_topic_link` — Connection between verticals
- `user_demand` — High search volume

## Publication Gate (`lib/agent/publication-gate.ts`)

**Thresholds** (defaults, adjusted by business rules):
- minTrustScore: 75
- minQualityScore: 75
- minCitationCoverage: 72%
- minSourceCount: 5 (brief) / 12 (strategic)
- maxFatalChallenges: 0
- minDevilsAdvocateScore: 70
- maxUncitedClaimRatio: 35%

**Checks**: source_depth, trust_score, quality_score, citation_coverage, word_count, claim_citation_density, devils_advocate, fatal_challenges

**Decision**: `publish` | `revise` | `hold`

## Publication status flow

```
Devil's Advocate verdict = "reject"     → status = "review"
Researcher sign-off not approved        → status = "draft"
Gate = "publish" + readiness OK + trust ≥65 → status = "published"
Gate = "revise" OR !readiness           → status = "held"
Trust < 65                               → status = "draft"
```

## Topic Radar (`lib/agent/topic-radar.ts`)

**6 parallel sweeps, <35s total**:

1. **GDELT** — 14 verticals with urgency bonus
2. **RSS Elite** — 30 feeds (Tier A: Brookings, RAND, CFR, Chatham House, CSIS, ICG, PIIE, Bruegel, Atlantic Council, CSET, FLI, CGD; Tier B: World Bank, IMF, VoxEU, NBER, IZA, Nature, MIT Tech Review, AI Now, IISS, Euractiv; Tier C: UN, WHO, OECD, BIS)
3. **Academic** — OpenAlex trending + arXiv (cs/econ/q-fin) + Semantic Scholar
4. **Policy/Data** — NBER, VoxEU, World Bank, IMF, Eurostat, UN News
5. **Institutions** — ECB, BIS, OECD, WTO, ILO, WHO, NATO, IAEA
6. **DB Signals** — Existing high-priority unprocessed signals

**Scoring**: base_score + recency_decay + source_tier_bonus + urgency_keyword_bonus
**Dedup**: Jaccard word-overlap (≥60% → merge)
**Cache**: 12 min TTL

---

# 8. Providers

## Provider categories (100+ total)

### Academic Core (12)
`openalex`, `crossref`, `semanticscholar`, `pubmed`, `arxiv`, `hal`, `base`, `core`, `europepmc`, `doaj`, `ssrn`, `repec`

### Academic Extended (4)
`nber`, `who-gho`, `semantic-scholar-graph`, `thesesfr`

### Institutional — Intelligence (4)
`odni`, `cia-foia`, `nsa`, `uk-jic`

### Institutional — Defense (4)
`nato`, `eeas`, `sgdsn`, `eda`

### Institutional — Economy (4)
`imf`, `worldbank`, `oecd`, `bis`

### Institutional — Economy Extended (4)
`ecb`, `eurostat`, `fred`, `eib`

### Institutional — Cyber (3)
`nist`, `cisa`, `enisa`

### Institutional — Multilateral (3)
`un`, `undp`, `unctad`

### Institutional — Energy & Nuclear (3)
`iaea`, `irena`, `cea`

### Institutional — Health Extended (4)
`ema`, `inserm`, `ecdc`, `cochrane`

### Institutional — Environment (2)
`inrae`, `ademe`

### Institutional — French (6)
`ens`, `insee`, `shift-project`, `data-gouv`, `france-strategie`, `cnrs`

### Institutional — Tech Research (4)
`allen-ai`, `max-planck`, `eth-zurich`, `inria`

### Institutional — Law (1)
`eur-lex`

### Think Tanks European (4)
`ecfr`, `swp`, `sipri`, `iai`

### French Policy & Law (4)
`iddri`, `terra-nova`, `legifrance`, `vie-publique`

### Health Extended V2 (3)
`cdc`, `nih`, `who-direct`

### Economy Extended V2 (1)
`oecd-direct`

### Archives (3)
`nara`, `uk-archives`, `archives-fr`

### Real-time News (6)
`gdelt-news`, `newsapi`, `mediastack`, `thenewsapi`, `gnews`, `eventregistry`

### Think Tanks & Policy Labs (20+)
`brookings`, `rand`, `cset`, `ainow`, `datasociety`, `abundance`, `caidp`, `scsp`, `ifp`, `cdt`, `cnas`, `newamerica`, `aspen-digital`, `rstreet`, `lawzero`, `govai`, `iaps`, `caip`, `aipi`, `fai`

### Web Search (1)
`linkup`

## Smart Provider Selection (`lib/agent/smart-provider-selector.ts`)

- History-aware: tracks which providers produce best results per domain
- Domain-based: maps query domain to relevant providers
- Fallback: `DEFAULT_ACADEMIC_PROVIDERS` if smart selection fails

## Provider Health Tracker (`lib/agent/provider-health-tracker.ts`)

- Circuit breaker: blacklists providers with repeated failures
- `getHealthyProviders()` filters out blacklisted
- Fallback: if too many blacklisted (≥3 remaining), use original list

## Extended Registry Bridge (`lib/providers/registry-bridge.ts`)

- Class-based provider registry
- `searchExtendedProviders()` — catch-all for unrouted providers
- `getExtendedProvidersForDomain()` — domain-aware provider selection

---

# 9. LLM Configuration

## Provider routing (`lib/llm/unified-llm.ts`)

| Provider | Primary model | Fast model | Role |
|---|---|---|---|
| **DeepSeek** | `deepseek-v4-pro` | `deepseek-v4-flash` | Primary (cost-efficient) |
| **OpenAI** | `gpt-4o` | `gpt-4o-mini` | Fallback |
| **Anthropic** | `claude-sonnet-4-6` | `claude-haiku-4-5` | Fallback |

## Task → Model mapping

| Task | Model | Temperature | Max tokens |
|---|---|---|---|
| Query Enhancement | deepseek-v4-flash | 0.1 | 500 |
| Reader V3 | deepseek-v4-pro | 0.1 | 2000 |
| Analyst (brief) | deepseek-v4-pro | 0.2 | 4000 |
| Strategic Analyst | deepseek-v4-pro | 0.2 | 16000 |
| Harvard Council | deepseek-v4-pro | 0.15 | 3000 |
| Devil's Advocate | deepseek-v4-pro | 0.2 | 4000 |
| Auto-revision | deepseek-v4-pro | 0.2 | 12000 |
| Editor-in-Chief | deepseek-v4-flash | 0.15 | 800 |
| Editorial Planner | deepseek-v4-flash | 0.15 | 2000 |
| Foresight personas | deepseek-v4-flash | 0.3 | 500 |
| Topic Radar | — | — | — (no LLM) |
| StudioX | gpt-4o (hardcoded) | 0.3 | 4000 |

## Cost tracking

Every LLM call returns `costUsd`. The pipeline accumulates costs and aborts if budget exceeded.

## ⚠️ Issue: StudioX hardcodes `gpt-4o`

`app/api/studiox/route.ts:161` hardcodes `model: 'gpt-4o'` instead of using the unified resolver. Should use `callLLM` with task-based model selection.

---

# 10. Frontend

## Pages en production

| Route | File | Auth | Description |
|---|---|---|---|
| `/` | `app/page.tsx` | Public | Homepage: FeaturedVerdict, InquiryCards, PipelineStrip, PolicyNetwork, StudioPreview |
| `/archives` | `app/archives/page.tsx` | Public | All publications list |
| `/inquiry/[slug]` | `app/inquiry/[slug]/page.tsx` | Public | Publication detail + ForesightPanel + PersonaChat |
| `/researchers` | `app/researchers/page.tsx` | Public | 22 PhD showcase |
| `/studio` | `app/studio/page.tsx` | **Auth required** | Studio commission interface |
| `/pricing` | `app/pricing/page.tsx` | Public | 2-tier pricing (Reader free + Studio on-demand) |
| `/about` | `app/about/page.tsx` | Public | About page |
| `/methodology` | `app/methodology/page.tsx` | Public | Methodology explanation |
| `/privacy` | `app/privacy/page.tsx` | Public | Privacy policy |
| `/terms` | `app/terms/page.tsx` | Public | Terms of service |
| `/s/[id]` | `app/s/[id]/page.tsx` | Public | Shared brief (short URL) |

## Redirects (legacy)

| From | To | File |
|---|---|---|
| `/articles` | `/archives` | `app/articles/page.tsx` |
| `/publications` | `/archives` | `app/publications/page.tsx` |

## Components en production

### Signature components (`components/signature/`)
- `FeaturedVerdictCard` — Homepage featured verdict
- `InquiryCard` — Homepage inquiry cards
- `PipelineStrip` — Pipeline visualization
- `PolicyNetwork` — Network visualization (with EtherealBackground)
- `StudioPreview` — Studio teaser on homepage
- `EtherealBackground` — Animated background
- `HaloTrace` — Inquiry detail visual
- `VerdictCard` — ⚠️ Potentially unused (in index.ts but not imported by pages)

### Foresight components (`components/foresight/`)
- `ForesightPanel` — Scenario display on inquiry page
- `ForesightPanelSkeleton` — Loading state
- `ForesightEmptyState` — No foresight available
- `PersonaChat` — Chat with simulated personas
- `ForesightGraphMini` — Graph visualization
- `ScenarioMatrix` — Scenario probability matrix
- `SwarmTelemetry` — Swarm simulation metrics display

### Layout components (`components/layout/`)
- `PublicPageShell` — Shell for all public pages (nav + footer)
- `PageHeader` / `PageSection` — Page structure

### Other components
- `PublicNav` — Navigation bar
- `AuthModal` — Login/register modal
- `SiteFooter` — Footer
- `ErrorBoundary` — Error boundary
- `QueryProvider` — React Query provider
- `ui/*` — 51 shadcn/ui components

## ⚠️ Components obsolètes

| Component | Status | Why |
|---|---|---|
| `StudioX.tsx` (12KB) | ❌ Dead code | Not imported anywhere |
| `ThreeComponentWrapper` | ⚠️ Potentially dead | Self-reference only |
| `VerdictCard` | ⚠️ Potentially dead | In index.ts but not used by pages |

## Middleware (`middleware.ts`)

**Protected routes**: `/dashboard`, `/studio`, `/council`, `/admin`, `/library`
**⚠️ Issue**: Only `/studio` has an actual page. Others are ghost routes.

**Security headers**:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Strict-Transport-Security
- Permissions-Policy
- Content-Security-Policy
- X-Robots-Tag: noindex for /api/*

**CSRF protection**: For API mutation routes (POST/PUT/DELETE)

---

# 11. API Routes

## API routes EN PRODUCTION

| Route | Method | Caller | Purpose |
|---|---|---|---|
| `/api/public/briefs` | GET | Homepage, Archives | Paginated public briefs |
| `/api/public/publications/[id]` | GET | Publication detail | Single publication |
| `/api/public/stats` | GET | (monitoring) | Public stats |
| `/api/articles/[id]` | GET | Inquiry detail | Article + related |
| `/api/inquiry/[id]/foresight` | GET | Inquiry detail | Foresight bundle |
| `/api/studiox` | POST | Studio page | Studio commission (LLM) |
| `/api/studiox/checkout` | POST | Studio page | Stripe checkout |
| `/api/studiox/order/[id]` | GET | Studio page | Order status |
| `/api/foresight/chat` | POST | PersonaChat | Chat with persona |
| `/api/auth/me` | GET | Homepage, Studio | User session |
| `/api/auth/*` | POST | AuthModal | Login, register, verify, reset |
| `/api/newsletter/*` | POST | Homepage | Newsletter subscribe/unsubscribe |
| `/api/stripe` | POST | Stripe webhook | Payment webhook |
| `/api/health` | GET | Monitoring | Health check |

## API routes CRON (Netlify Scheduled Functions)

| Route | Cron | Purpose |
|---|---|---|
| `/api/cron/auto-scan` | 06:00 + 18:00 UTC | Breaking topic detection + publish |
| `/api/cron/editorial-plan` | Sunday 20:00 UTC | Plan weekly editorial agenda |
| `/api/cron/generate-briefs` | Sunday 22:00 UTC | Weekly brief generation |
| `/api/cron/generate-briefs-midweek` | Wednesday 12:00 UTC | Midweek brief generation |
| `/api/cron/self-improve` | Daily 03:00 UTC | Agent memory self-improvement |
| `/api/cron/newsletter` | Monday 08:00 UTC | Send newsletter |
| `/api/cron/macro-refresh` | Monday 05:00 UTC | Macro data refresh |
| `/api/cadence-reset` | Daily 00:00 UTC | Reset daily counters |
| `/api/cron/trial-reminders` | Daily 09:00 UTC | ⚠️ Obsolete if no trial |

## API routes — CODE MORT (à supprimer)

| Route | Why obsolete |
|---|---|
| `/api/v3/analysis` | Old pipeline endpoint, no frontend caller |
| `/api/studio/analyze` | Old Studio subscription endpoint, replaced by /api/studiox |
| `/api/demo/generate` | Demo endpoint, no frontend caller |
| `/api/chat/stream` | Chat streaming, no frontend caller |
| `/api/runs` | Admin ingestion, no frontend caller |
| `/api/ingestion` | No frontend caller |
| `/api/pipeline-runs` | No frontend caller |
| `/api/domains` | No frontend caller |
| `/api/editorial-gate/*` | Handled internally by pipeline |
| `/api/digests/*` | No frontend caller |
| `/api/topics/*` | No frontend caller |
| `/api/knowledge/*` | Handled internally |
| `/api/formats/*` | No frontend caller |
| `/api/stats` | No frontend caller (use /api/public/stats) |
| `/api/system` | No frontend caller |
| `/api/contact` | No frontend caller |
| `/api/user/*` | No frontend caller |
| `/api/admin/*` | No frontend caller |
| `/api/ready` | No frontend caller |
| `/api/test/pipeline` | Test only, CRON_SECRET protected |
| `/api/subscription/*` | Old subscription model, replaced by StudioX |

---

# 12. Infrastructure & Deployment

## Netlify configuration (`netlify.toml`)

- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Node version**: 22.13.0
- **Framework**: Next.js

## Environment variables (required)

### Core
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Auth JWT signing
- `ADMIN_KEY` — Admin API access
- `CRON_SECRET` — Cron job authentication
- `NEXT_PUBLIC_APP_URL` — Public URL

### LLM Providers
- `DEEPSEEK_API_KEY` — Primary LLM
- `OPENAI_API_KEY` — Fallback LLM
- `ANTHROPIC_API_KEY` — Fallback LLM

### Academic APIs
- `OPENALEX_EMAIL` — OpenAlex polite pool
- `SEMANTIC_SCHOLAR_API_KEY` — Semantic Scholar
- `CORE_API_KEY` — CORE
- `EUROPEPMC_API_KEY` — Europe PMC
- `SSRN_API_KEY` — SSRN

### Enrichment
- `UNPAYWALL_EMAIL` — Unpaywall
- `COHERE_API_KEY` — Reranking
- `ROR_API_KEY` — Institution enrichment

### News
- `GDELT_API_KEY`, `NEWSAPI_KEY`, `MEDIASTACK_KEY`, `THENEWSAPI_KEY`, `GNEWS_KEY`, `EVENTREGISTRY_KEY`

### Payments
- `STRIPE_SECRET_KEY` — Stripe API
- `STRIPE_WEBHOOK_SECRET` — Webhook verification
- `STRIPE_PRICE_RESEARCHER` — ⚠️ Obsolete
- `STRIPE_PRICE_STUDIO` — ⚠️ Obsolete

### Infrastructure
- `REDIS_URL` — Redis cache
- `SENTRY_DSN` — Error tracking

### Foresight
- `NOMOSX_FORESIGHT_ENABLED` — Enable/disable swarm
- `NOMOSX_FORESIGHT_MAX_COST_USD` — Cost limit
- `NOMOSX_FORESIGHT_CHAT_RATE_LIMIT` — Chat rate limit

## Database

- **PostgreSQL** with **pgvector** extension
- **Prisma ORM** (`prisma/schema.prisma`)
- **Redis** for caching (scout cache, rate limits)

---

# 13. Cron Jobs — Autonomous Loop

## Schedule (all times UTC)

```
00:00  cadence-reset          → Reset daily counters
03:00  self-improve           → Agent memory learning
05:00  macro-refresh          → Macro data refresh
06:00  auto-scan              → Breaking topic detection (morning)
08:00  newsletter (Monday)    → Send weekly newsletter
09:00  trial-reminders        → ⚠️ Obsolete
12:00  generate-briefs (Wed)  → Midweek brief generation
18:00  auto-scan              → Breaking topic detection (evening)
20:00  editorial-plan (Sun)   → Plan weekly agenda
22:00  generate-briefs (Sun)  → Weekly brief generation
```

## Cron → Route → Dispatcher mapping

```
cron-auto-scan.ts        → POST /api/cron/auto-scan
                          → runThinkTankCycle({ mode: "breaking" })
                          → collectBreakingItems()
                          → runAndPublishInquiry() per topic

cron-editorial-plan.ts   → POST /api/cron/editorial-plan
                          → planEditorialAgenda()
                          → Store proposals for generate-briefs

cron-generate-briefs.ts  → POST /api/cron/generate-briefs
                          → runThinkTankCycle({ mode: "weekly" })
                          → collectWeeklyItems()
                          → runAndPublishInquiry() per topic

cron-self-improve.ts     → POST /api/cron/self-improve
                          → Agent memory analysis + lesson extraction

cron-newsletter.ts       → POST /api/cron/newsletter
                          → Send weekly newsletter to subscribers

cron-macro-refresh.ts    → POST /api/cron/macro-refresh
                          → Refresh macro economic data

cadence-reset.ts         → POST /api/cadence-reset
                          → Reset daily/weekly counters
```

---

# 14. Database Schema

## Key tables (from Prisma schema)

### Content
- **`Brief`** — Generated briefs (html, sources, lineage, trustScore, qualityScore)
- **`ThinkTankPublication`** — Published briefs (publicId, status, type, html, wordCount)
- **`Source`** — Academic/institutional sources (title, abstract, doi, qualityScore, noveltyScore)
- **`Author`** — Researchers (name, orcid)
- **`Institution`** — Institutions (name, rorId)

### Users
- **`User`** — Users (email, name, passwordHash, emailVerified)
- **`Subscription`** — Subscription state (plan, status, stripeCustomerId)
- **`StudioXOrder`** — Pay-per-use orders (question, format, amount, status)

### Pipeline
- **`PipelineRun`** — Pipeline execution records (status, durationMs, totalCostUsd, steps)
- **`Signal`** — Detected signals (title, signalType, priorityScore, status)
- **`Vertical`** — Content verticals (slug, name, config)
- **`ForesightRun`** — Foresight simulation results

### Knowledge
- **`Concept`** — Extracted concepts
- **`ConceptRelation`** — Concept relationships
- **`AgentMemory`** — Agent performance history
- **`AgentLesson`** — Extracted lessons

### Newsletter
- **`NewsletterSubscriber`** — Email subscribers

---

# 15. Code Mort — À Nettoyer

## Priorité 1 — Code mort confirmé (aucun caller)

### API routes à supprimer
- `/api/v3/analysis/`
- `/api/studio/analyze/`
- `/api/demo/generate/`
- `/api/chat/stream/`
- `/api/runs/`
- `/api/ingestion/`
- `/api/pipeline-runs/`
- `/api/domains/`
- `/api/editorial-gate/`
- `/api/digests/`
- `/api/topics/`
- `/api/knowledge/`
- `/api/formats/`
- `/api/stats/`
- `/api/system/`
- `/api/contact/`
- `/api/user/`
- `/api/admin/`
- `/api/ready/`
- `/api/test/`

### Components à supprimer
- `components/StudioX.tsx` (12KB, not imported)

## Priorité 2 — Business model obsolète

- `STRIPE_PLANS.TRIAL/ANALYST/RESEARCHER/STUDIO` in `lib/stripe.ts` → garder seulement webhook `studiox_order`
- `/api/subscription/*` (3 routes) → supprimer
- `cron-trial-reminders` → supprimer si plus de trial
- `getResearchersByTier()` in `lib/researchers.ts` → supprimer

## Priorité 3 — Routes fantômes

Middleware protège `/dashboard`, `/council`, `/admin`, `/library` mais ces pages n'existent pas.
- Soit créer ces pages
- Soit retirer du middleware

## Priorité 4 — Potentiellement mort

- `VerdictCard` in `components/signature/` — vérifier usage
- `ThreeComponentWrapper` — vérifier usage

---

# 16. Améliorations Recommandées

## AI Engineer

### P0 — Critical

1. **StudioX should use full pipeline** — Currently `/api/studiox` does a simple `callLLM()`. Should call `runAndPublishInquiry()` for paid commissions, or at minimum `runPipeline()`.

2. **StudioX hardcoded model** — `app/api/studiox/route.ts:161` hardcodes `gpt-4o`. Should use `callLLM` with task-based model selection via `unified-llm.ts`.

3. **Dossier format not implemented** — `pipeline-v2.ts:2342-2343` warns "Dossier format not yet implemented, falling back to strategic". Should implement or remove from pricing.

### P1 — High

4. **Agent Memory calibration** — `loadCalibratedThresholds()` only adjusts if ≥3 historical runs. For new domains, thresholds remain static. Consider domain-specific default thresholds.

5. **Foresight only for deep/strategic** — `maybeRunSimulation()` skips for surface/standard. Consider lightweight simulation for standard depth (e.g., 64-agent swarm, 500 MC runs).

6. **Cohere reranking dependency** — If Cohere API is down, reranking is skipped. Consider fallback to embedding-based reranking.

7. **Redis cache invalidation** — `invalidateScoutCache()` exists but is never called automatically. Consider auto-invalidation when sources are updated.

### P2 — Medium

8. **Provider health persistence** — Circuit breaker state is in-memory. Should persist to DB or Redis for cross-instance consistency.

9. **Pipeline progress SSE** — `emitProgress()` exists but no SSE endpoint to consume it. Consider adding `/api/pipeline/[id]/stream` for real-time progress.

10. **Meta-analysis only for quantitative** — `metaAnalysisEngine()` may fail for qualitative topics. Consider graceful degradation.

## CTO

### Infrastructure

11. **Clean dead API routes** — ~20 routes with no callers, adding build time and confusion.

12. **Clean dead components** — `StudioX.tsx`, potentially `VerdictCard`, `ThreeComponentWrapper`.

13. **Fix ghost routes** — Middleware protects `/dashboard`, `/council`, `/admin`, `/library` but pages don't exist.

14. **Stripe cleanup** — Remove legacy subscription plans, keep only `studiox_order` webhook handling.

15. **Cron trial-reminders** — Remove if trial system is deprecated.

### Database

16. **Add indexes** — `ThinkTankPublication` queries by `status + publishedAt` are frequent. Ensure composite index exists.

17. **Prisma schema cleanup** — Remove subscription-related fields if deprecating subscription model (keep `studioQuestionsPerMonth` for quota tracking if needed).

## CPO

18. **StudioX UX** — Currently StudioX does a simple LLM call. Users paying €299 for a Dossier expect a full 16-step pipeline run. This is a product gap.

19. **Pricing page consistency** — Pricing page shows 2 tiers but `lib/stripe.ts` has 4 plans. Align code with product.

20. **Missing pages** — `/dashboard`, `/council`, `/admin`, `/library` are protected but don't exist. Either build them or remove from middleware.

21. **Publication format clarity** — 8 formats in `lib/publication-formats.ts` all marked "Open" access. StudioX pricing uses same formats but paid. Clarify: free formats = published by autonomous crons; paid formats = user-commissioned.

## CMO

22. **SEO** — Sitemap includes all public pages. Good. Consider adding structured data (JSON-LD) to inquiry pages for rich snippets.

23. **Newsletter** — Active, weekly Monday 08:00 UTC. Double opt-in. Good.

24. **Social sharing** — `/s/[id]` short URLs exist. Good. Consider adding Open Graph meta tags for social cards.

25. **Researchers page** — 22 PhD showcase is a unique differentiator. Consider adding individual researcher pages with their publications.

---

# Annexe A — 22 PhD Researchers

Defined in `lib/researchers.ts` (1072 lines). Each researcher has:
- `id`, `name`, `title`, `domain`, `tier`
- `specialties[]`, `analyticalSignature`, `epistemicPriors`
- `landmarkTopics[]`, `hotTopics[]`
- `frameworks[]`, `dataPreferences[]`
- `citationCount`, `hIndex`

### Domains covered (22 researchers across 22 domains)

1. AI Policy — Dr. Elena Vasquez
2. Climate Policy — Dr. James Chen
3. Health Policy — Dr. Sarah Goldstein
4. Cybersecurity — Dr. Marcus Webb
5. International Law — Dr. Sophie Laurent
6. Environmental Economics — Dr. David Nkomo
7. Quantitative Finance — Dr. Raj Patel
8. Social Sciences — Dr. Maria Santos
9. Humanities — Dr. Thomas Wright
10. Energy Systems — Dr. Yuki Tanaka
11. Geopolitics — Dr. Klaus Weber
12. Cognitive Science — Dr. Aisha Mohammed
13. Digital Society — Dr. Benoit Martin
14. Behavioral Economics — Dr. Rachel Kim
15. Urban Studies — Dr. Carlos Rivera
16. Development Economics — Dr. Fatima Al-Rashid
17. Computational Social Science — Dr. Alex Freeman
18. Bioethics — Dr. Hannah Berg
19. Complexity Science — Dr. Ian MacDonald
20. Risk Analysis — Dr. Priya Sharma
21. Finance — Dr. Robert Lindqvist
22. EU Policy — Dr. Anna Kowalski

### Utility functions

- `getResearcher(id)` — Get by ID
- `getLeadResearcher(topic)` — Keyword matching to find best researcher
- `getResearchersByTier(tier)` — ⚠️ Obsolete (subscription gating)
- `getResearcherCount()` — Total count
- `getResearchersByCategory(category)` — Filter by category
- `getResearchersByField(field)` — Filter by field
- `getTopResearchersByCitations(n)` — Top by citations
- `getResearchersByInstitution(institution)` — Filter by institution
- `getTopicRadarQueries()` — Extract hot topics for radar sweeps
- `getDataSourcesForDomain(domain)` — Get preferred data sources

---

# Annexe B — Publication Formats

Defined in `lib/publication-formats.ts` (113 lines)

| Type | Label | Family | Pages | Source Depth |
|---|---|---|---|---|
| SUMMARY_BRIEF | Signal Brief | signal | 1-2 | 5+ |
| UPDATE_NOTE | Update Note | signal | 1-2 | 3+ |
| DATA_NOTE | Data Note | signal | 2-3 | dataset-led |
| POLICY_NOTE | Policy Memo | signal | 3-5 | 8+ |
| RESEARCH_BRIEF | Research Brief | brief | 4-6 | 10+ |
| EXECUTIVE_BRIEF | Decision Brief | brief | 4-6 | 10+ |
| STRATEGIC_REPORT | Strategic Report | strategic | 10-15 | 20+ |
| DOSSIER | Research Dossier | strategic | 30-50 | 50+ |

All formats marked `"Open"` access. Free when published by autonomous crons; paid when commissioned via StudioX.

Utility functions: `getPublicationFormat(type)`, `getPublicationFormatLabel(type)`, `FORMAT_TYPES_BY_FAMILY`

---

# Annexe C — Key File Index

| File | Lines | Purpose |
|---|---|---|
| `lib/agent/pipeline-v2.ts` | 2455 | Core pipeline (16 steps) |
| `lib/agent/simulation-agent.ts` | 1398 | Foresight Engine v3 |
| `lib/agent/inquiry-orchestrator.ts` | 461 | Publication funnel |
| `lib/agent/inquiry-pipeline.ts` | 601 | Pipeline runner + simulation |
| `lib/agent/think-tank-dispatcher.ts` | 602 | Autonomous brain |
| `lib/agent/editor-in-chief.ts` | 236 | LLM triage |
| `lib/agent/editorial-planner.ts` | 382 | Weekly agenda planning |
| `lib/agent/topic-radar.ts` | 518 | Breaking topic detection |
| `lib/agent/orchestrator.ts` | 374 | Adaptive pipeline controller |
| `lib/agent/publication-gate.ts` | 214 | Publication quality gate |
| `lib/agent/foresight-swarm.ts` | 122 | Swarm crowd mechanics |
| `lib/agent/foresight-social.ts` | — | Dual-channel social feed |
| `lib/agent/foresight-graph.ts` | — | GraphRAG for foresight |
| `lib/agent/agent-memory.ts` | — | Self-improving memory |
| `lib/agent/context-primer.ts` | — | Institutional memory injection |
| `lib/agent/knowledge-graph.ts` | — | Concept extraction + relations |
| `lib/agent/reader-agent-v3.ts` | — | Deep extraction |
| `lib/agent/analyst-multipass.ts` | — | 3-pass analysis |
| `lib/agent/strategic-analyst-agent.ts` | — | 10-section strategic analysis |
| `lib/agent/structural-editor.ts` | — | McKinsey pyramid review |
| `lib/agent/harvard-council-enhanced.ts` | — | 22 PhD expert analysis |
| `lib/agent/review-board.ts` | — | Legacy 9-expert review |
| `lib/agent/phd-deliberation.ts` | — | Expert debate |
| `lib/agent/debate-agent.ts` | — | Adversarial debate |
| `lib/agent/meta-analysis-engine.ts` | — | Statistical meta-analysis |
| `lib/agent/devils-advocate.ts` | — | Final epistemic gate |
| `lib/agent/critical-loop-v2.ts` | — | Iterative review |
| `lib/agent/citation-verifier.ts` | — | Semantic citation check |
| `lib/agent/fact-checker.ts` | — | Numerical claim verification |
| `lib/agent/editor-agent.ts` | — | Professional HTML rendering |
| `lib/agent/smart-provider-selector.ts` | — | History-aware provider selection |
| `lib/agent/provider-health-tracker.ts` | — | Circuit breaker |
| `lib/agent/query-enhancer.ts` | — | LLM query enhancement |
| `lib/agent/relevance-scorer.ts` | — | Relevance filtering |
| `lib/agent/enhanced-ranker.ts` | — | Enhanced ranking |
| `lib/agent/cohere-reranker.ts` | — | Cohere reranking |
| `lib/agent/semantic-engine.ts` | — | Embeddings + pgvector |
| `lib/agent/redis-simple.ts` | — | Redis cache manager |
| `lib/agent/topic-classifier.ts` | — | Domain classification |
| `lib/agent/researcher-ownership.ts` | — | Researcher sign-off |
| `lib/agent/signal-detector.ts` | — | Signal detection |
| `lib/agent/contradiction-detector.ts` | — | Contradiction detection |
| `lib/agent/trend-analyzer.ts` | — | Trend analysis |
| `lib/agent/source-reputation-agent.ts` | — | Source reputation learning |
| `lib/researchers.ts` | 1072 | 22 PhD researcher profiles |
| `lib/publication-formats.ts` | 113 | 8 publication formats |
| `lib/studiox-pricing.ts` | 15 | StudioX pricing |
| `lib/stripe.ts` | 344 | Stripe integration |
| `lib/llm/unified-llm.ts` | — | LLM provider routing |
| `lib/foresight/config.ts` | 34 | Foresight configuration |
| `lib/foresight/types.ts` | 82 | Foresight TypeScript types |
| `lib/env.ts` | 169 | Environment variable validation |
| `lib/auth.ts` | — | JWT authentication |
| `lib/db.ts` | — | Prisma client |
| `middleware.ts` | 96 | Security + auth middleware |
| `netlify.toml` | 66 | Deployment + cron config |

---

*Document généré le 25 juin 2026 — Référence complète pour audit, correction et amélioration du système NomosX.*
