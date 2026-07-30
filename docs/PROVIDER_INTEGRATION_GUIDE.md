# NomosX — Provider Integration Guide

> **For the agent working on provider integration.**
> This document explains the new adaptive funnel architecture and how to
> intelligently couple providers and data sources at each stage.

---

## 1. Pipeline Architecture (New Adaptive Funnel)

The pipeline (`lib/agent/pipeline-v2.ts:runPipelineCore`) is no longer a
fixed sequence of rigid gates. It is an **adaptive funnel** with LLM-based
reasoning at two enrichment checkpoints.

### Stage-by-stage flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. SCOUT — Parallel multi-provider search                         │
│     • Query enhancement (synonyms, domain terms)                   │
│     • 100+ providers in parallel (Promise.allSettled)              │
│     • Domain-aware provider selection via DOMAIN_PROVIDER_MAP      │
│     • Extended registry bridge for domain-specific providers       │
│     • Dedup by DOI → normalized title                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. INDEX — Author/institution enrichment (ROR/ORCID)              │
│     • Deduplicate sources by DOI                                   │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. RANK — Adaptive ranking with domain-aware filters              │
│     • maxPerProvider: adaptive (15 if <15 sources, 10 if <30, 8+) │
│     • minProviderDiversity: adaptive (1 if <10 sources, 2+)       │
│     • requireAbstract: adaptive (false if <20 sources)            │
│     • minQuality: 70 (relaxed if pool too small)                   │
│     • Re-rank with Cohere reranker if available                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3b. ENRICHMENT REASONER (NEW — replaces structured refusal)       │
│     • LLM assesses evidence sufficiency (not a fixed threshold)    │
│     • Verdict: proceed | enrich | refuse                           │
│     • If "enrich": generates targeted queries + suggestedProviders │
│     • Re-scout with targeted queries → re-rank                     │
│     • Max 1 enrichment loop (cost guard)                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. CASTING — Cross-domain team assembly (Editorial V2)            │
│     • LLM selects 3-5 expert lenses based on topic classification  │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. READER + FRAMING + QUANT (parallel)                            │
│     • READER V3: deep extraction (claims, methods, mechanisms)     │
│     • FRAMING: pre-register testable hypotheses                    │
│     • QUANT: fetch real numbers from T1 primary-data providers     │
│       (FRED, ECB, Eurostat, World Bank, IEA, energy-charts, RTE)   │
│       → produces machine-verified facts + SVG charts               │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. ANALYST — Multi-pass analysis (3 passes)                       │
│     • Pass 1: Thematic extraction                                  │
│     • Pass 2: Contradiction detection                              │
│     • Pass 3: Synthesis + verdict                                  │
│     • Context block: domain KB + quant evidence + hypotheses       │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6b. POST-ANALYST ENRICHMENT CHECKPOINT (NEW)                      │
│     • If research gaps are critical (NOT_REACHED type)             │
│     • And source count < threshold (20 strategic / 12 brief)       │
│     • → Targeted search with gap-derived queries                   │
│     • → Re-rank and merge new sources                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  7. FORESIGHT — Monte Carlo scenario simulation (Editorial V2)     │
│     • Now enabled for ALL formats (was strategic-only)             │
│     • Requires ≥2 scenarios from analyst output                    │
│     • Produces empirical probabilities + confidence intervals      │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  8. DEBATE — Dialectical analysis (REACTIVATED)                    │
│     • Dominant thesis vs counter-position                          │
│     • Steel-man + synthesis + confidence score                     │
│     • Meta-analysis engine runs in parallel (if enough studies)    │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  9. ARBITER — Institute position formulation (Editorial V2)        │
│     • LLM produces: verdict + scenarios + objections               │
│     • Incorporates debate results + foresight probabilities        │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 10. DEVIL'S ADVOCATE — Epistemic challenge (REACTIVATED)           │
│     • Fatal + major challenges identified                          │
│     • Auto-revision: advisory section appended if fatal challenges │
│     • Benchmark vs Brookings/RAND/McKinsey (strategic only)        │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 11. EDITOR — Position-first rendering (Editorial V2)               │
│     • Methodology box (sources, providers, period, confidence)     │
│     • Cross-domain team display                                    │
│     • Probable futures (Monte Carlo scenarios)                     │
│     • Policy recommendations (immediate/short/long/risk)           │
│     • Quant SVG charts injected                                    │
│     • Citation filter (backtrack + remove uncited claims)          │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 12. QUALITY GATES — Post-render verification                       │
│     • NLI citation verifier (primary) + LLM verifier (fallback)    │
│     • Fact-checker (numerical claims, deterministic)               │
│     • Critical loop V2 (scoring only, no rewrite)                  │
│     • Devil's Advocate second pass on rendered HTML                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Provider Tiers & When They Are Used

### Tier 1: Academic Core (always included)
**Providers**: `openalex`, `crossref`, `semanticscholar`, `arxiv`, `hal`, `pubmed`, `base`, `thesesfr`

**Role**: Baseline evidence. These are the backbone of every search.
- `openalex`: Broadest coverage, good metadata, free
- `crossref`: DOI authority, good for recent publications
- `semanticscholar`: Strong CS/AI coverage, citation graphs
- `arxiv`: Preprints (physics, CS, math, biology)
- `hal`: French academic archive
- `pubmed`: Biomedical
- `base`: Multi-disciplinary aggregator

**When to add more**: Always include all Tier 1 providers. They are free and fast.

### Tier 2: Institutional & Official Data
**Providers**: `imf`, `worldbank`, `oecd`, `ecb`, `eurostat`, `fred`, `iea`, `iaea`, `entsoe`, `who-gho`, `un`, `nato`, etc.

**Role**: Primary data that think tanks cite. This is what differentiates NomosX from a literature review.
- Economic: `imf`, `worldbank`, `oecd`, `bis`, `ecb`, `fred`, `eurostat`
- Energy: `iea`, `iaea`, `irena`, `entsoe`, `energy-charts`, `rte-france`
- Health: `who-gho`, `cdc`, `nih`, `ema`, `ecdc`
- Defense: `nato`, `sipri`, `eda`
- Cyber: `nist`, `cisa`, `enisa`

**When to add more**: The QUANT agent (`lib/agent/quant-agent.ts`) fetches actual numerical data from these providers. New institutional providers should:
1. Have an API endpoint (not just a website)
2. Return structured data (JSON/CSV, not HTML scraping)
3. Be registered in `DOMAIN_PROVIDER_MAP` in `smart-provider-selector.ts`
4. Be added to the `institutionalProviders` set in `pipeline-v2.ts` for dedup priority

### Tier 3: Think Tanks & Policy Labs
**Providers**: `brookings`, `rand`, `cnas`, `newamerica`, `bruegel`, `ecfr`, `swp`, `sipri`, `cset`, `ainow`, `shift-project`, `france-strategie`, etc.

**Role**: Policy analysis, position papers, strategic foresight. These are the **competitors** — NomosX must cite and build upon their work to surpass them.

**When to add more**: New think tank providers should:
1. Be mapped to the correct domain in `DOMAIN_PROVIDER_MAP`
2. Have a search function or API (many use WordPress search endpoints)
3. Return results with title, date, author, and URL
4. Be tested for rate limits (many have aggressive throttling)

### Tier 4: Archives & Declassified
**Providers**: `nara`, `uk-archives`, `archives-fr`, `cia-foia`, `odni`, `nsa`, `uk-jic`

**Role**: Historical evidence, primary source documents. Critical for intelligence/defense topics.

### Tier 5: Real-Time News
**Providers**: `gdelt-news`, `newsapi`, `mediastack`, `thenewsapi`, `gnews`, `eventregistry`, `apitube`

**Role**: Current events, breaking signals. Used by the Topic Radar for emerging topic detection. Also injected into SCOUT for real-time context.

### Tier 6: Web Search (fallback enrichment)
**Providers**: `linkup`, `tavily`, `exa`

**Role**: Catch-all for topics not covered by academic/institutional providers. Used in enrichment loops when the Enrichment Reasoner identifies gaps.

---

## 3. How to Intelligently Couple Providers

### 3.1 Domain-Aware Selection (SCOUT stage)

The `DOMAIN_PROVIDER_MAP` in `smart-provider-selector.ts` maps each domain to its
relevant providers. When integrating a new provider:

1. **Identify which domains it serves** (e.g., a new climate data provider
   serves `climate`, `environment`, `energy`)
2. **Add it to the corresponding domain arrays** in `DOMAIN_PROVIDER_MAP`
3. **Add it to the `Provider` type** union
4. **Implement the search function** following the pattern in
   `lib/agent/providers/` (see existing providers like `searchOpenAlex`,
   `searchIEA`, etc.)
5. **Register it in the `scout()` function** in `pipeline-v2.ts` — add a
   new `if (providerSet.has("your-provider"))` line

### 3.2 Adaptive Enrichment (Enrichment Reasoner)

The Enrichment Reasoner (`lib/agent/enrichment-reasoner.ts`) can suggest
specific providers to fill evidence gaps. It returns `suggestedProviders`
in its assessment. When integrating new providers:

- The Enrichment Reasoner LLM prompt includes the list of available
  providers. New providers should be **described in the prompt** so the
  LLM knows when to suggest them.
- The prompt is in `enrichment-reasoner.ts:assessEvidenceSufficiency()`.
  Add a brief description of the new provider's strengths.

### 3.3 Primary Data Coupling (QUANT stage)

The QUANT agent (`lib/agent/quant-agent.ts`) is the key differentiator.
It fetches **actual numbers** from T1 providers, not just metadata.

When integrating a new data provider for QUANT:
1. **Implement a fetcher function** that returns `QuantSeries[]` (time-series
   with values, dates, units)
2. **Register it in `selectFetchers()`** in `quant-agent.ts` — map query
   keywords to your fetcher
3. **Ensure the data is machine-verifiable** — the fact-checker will
   compare cited numbers against QUANT facts
4. **Return chart-ready data** — the SVG chart injector expects
   `{ label, values: [{date, value}], unit, provider }`

### 3.4 Provider Coupling Strategy

The intelligent coupling happens at multiple levels:

```
Query arrives
    │
    ├─→ detectDomain() → DOMAIN_PROVIDER_MAP → select 8-15 relevant providers
    │
    ├─→ SCOUT: parallel search across selected providers (Promise.allSettled)
    │   └─ Extended registry: domain-keyword detection adds 3-5 more providers
    │
    ├─→ RANK: adaptive filters based on pool size
    │   └─ If pool < 15: relax maxPerProvider, minProviderDiversity
    │
    ├─→ ENRICHMENT REASONER: LLM identifies gaps → suggests specific providers
    │   └─ Re-scout with targeted queries + suggested providers
    │
    ├─→ QUANT: parallel to READER, fetches primary data from T1 providers
    │   └─ Selects fetchers based on query keywords + source providers
    │
    └─→ POST-ANALYST: if gaps are critical, targeted search with gap queries
        └─ Uses all available providers + web search fallback
```

### 3.5 Cross-Domain Topics

For topics spanning multiple domains (e.g., "AI impact on energy grid"):
- `detectDomain()` returns `energy_technology` (a combined domain)
- Both energy and technology provider sets are merged
- The casting agent assembles a cross-domain team (energy expert + AI expert)
- The QUANT agent fetches from both energy and tech data sources

When adding providers for cross-domain topics:
- Add the provider to **both** domain arrays in `DOMAIN_PROVIDER_MAP`
- Or create a new combined domain key (e.g., `health_economics`)

---

## 4. Key Files to Modify When Adding a Provider

| File | What to modify |
|------|---------------|
| `lib/agent/smart-provider-selector.ts` | Add to `Provider` type, `DOMAIN_PROVIDER_MAP`, domain keywords |
| `lib/agent/pipeline-v2.ts` | Add `if (providerSet.has(...))` in `scout()`, add to `EXPLICITLY_ROUTED` set, add to `institutionalProviders` if applicable |
| `lib/agent/providers/` | Create the search function (e.g., `searchYourProvider()`) |
| `lib/agent/enrichment-reasoner.ts` | Add provider description to LLM prompt so it can suggest it |
| `lib/agent/quant-agent.ts` | If provider returns numerical data, add a fetcher in `selectFetchers()` |
| `lib/agent/source-reputation-agent.ts` | Register provider for usage tracking |

---

## 5. Provider Output Schema

Every provider search function must return objects matching this shape:

```typescript
interface SourceResult {
  id: string;              // Unique ID: "provider:identifier"
  title: string;
  abstract?: string;       // Critical for READER agent
  authors?: Array<{ name: string; orcid?: string }>;
  year?: number | null;
  doi?: string | null;
  provider: string;        // Must match the Provider type value
  url?: string;
  type?: string;           // "journal-article" | "report" | "preprint" | etc.
  pdfUrl?: string;         // For full-text extraction
  metadata?: Record<string, unknown>;
  qualityScore?: number;   // 0-100, computed during SCOUT
}
```

**Critical fields**:
- `abstract`: The READER agent extracts claims from abstracts. Missing
  abstracts trigger the adaptive `requireAbstract` relaxation.
- `doi`: Used for deduplication and Unpaywall enrichment.
- `year`: Used for recency scoring and methodology box display.
- `provider`: Must match exactly the value in `DOMAIN_PROVIDER_MAP`.

---

## 6. Adaptive Thresholds (What's No Longer Fixed)

| Threshold | Before (fixed) | After (adaptive) |
|-----------|----------------|-------------------|
| minEvidenceCount | 3 (brief) / 5 (strategic) | LLM-based enrichment reasoner |
| maxPerProvider | 6-8 | 15 if <15 sources, 10 if <30, 8 otherwise |
| minProviderDiversity | 2 | 1 if <10 sources, 2 otherwise |
| requireAbstract | true | false if <20 sources |
| minSourceCount (publication gate) | 15 | Adaptive by domain + available sources |
| minTrustScore | 65 | 55 (niche) / 60 (standard) / -5 if enrichment ≥ 70 |
| minWordCount | 3000 | 1500-3000 based on source count |
| minCitationCoverage | 0.60 | 0.30-0.60 based on source count |
| AUTO_COMMISSION_THRESHOLD | 85 | 75 |
| Foresight eligibility | Strategic only | All formats with ≥2 scenarios |

---

## 7. Budget Management

- **Brief (non-strategic)**: $5.00 max (Editorial V2) / $3.00 (legacy)
- **Strategic**: $12.00 max (Editorial V2) / $8.00 (legacy)
- Budget guard in `think-tank-dispatcher.ts` stops dispatching if cumulative cost exceeds budget
- Enrichment loops are capped at 1 iteration to control cost
- QUANT agent fetchers are free (official APIs) — no budget concern
- LLM costs tracked per-step via `addCost()` in `pipeline-v2.ts`

---

## 8. Testing a New Provider

1. **Unit test**: Call the search function directly with a known query
2. **Integration test**: Run through `scout()` with only the new provider
3. **Pipeline test**: Run `scripts/test-funnel.ts` with a query that
   matches the provider's domain
4. **Check logs**: Look for `[SCOUT] Per-provider results: your-provider=N`
5. **Verify dedup**: Check that sources with DOIs are properly deduplicated
6. **Verify QUANT**: If the provider returns numerical data, check that
   `[QUANT] Complete: N series, M facts from your-provider` appears in logs
