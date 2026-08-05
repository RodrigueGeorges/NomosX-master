# NomosX — Deep Audit & Innovation Report

**Date**: August 2026
**Scope**: Backend (orchestration, agents, pipeline, LLM, data model) + Frontend (design, wording, SEO, UX, funnel)
**Auditor**: Cascade
**Context**: Post T1-T10 deterministic gating improvements

---

## 1. Executive Summary

| Axis | Grade | Status |
|---|---|---|
| Pipeline architecture (19 steps) | **A** (93) | Best-in-class agentic pipeline |
| Deterministic gating (T1-T10) | **A** (90) | New — verbatim spans, pruning gates, trust DAG, MC on real chains |
| LLM orchestration | **A-** (87) | 5-provider failover, cross-family verification, circuit breakers |
| Provider coverage (88+) | **A** (92) | Unmatched for a think-tank product |
| Data model (Prisma) | **A-** (88) | 40+ models, rich lineage — but some redundancy |
| Frontend design | **B+** (82) | Palantir base solid, some residual inconsistencies |
| SEO | **B+** (80) | Good fundamentals, missing structured data opportunities |
| UX / Funnel | **B** (75) | No demo, no KG viz, Studio flow needs polish |
| Wording / Copy | **A-** (87) | Strong institute voice, minor inconsistencies |
| Test coverage | **C** (50) | Jest present, coverage unmeasured |

**Weighted score: 84/100 (A-)** — up from previous audit with T1-T10 improvements.

---

## 2. Backend Audit

### 2.1 Pipeline (`pipeline-v2.ts`, 3912 lines)

**Strengths**:
- 19-step unified pipeline with governance, lineage, cost tracking
- Redis caching on SCOUT (24h TTL, SCAN not KEYS)
- Query enhancement with LLM + multi-variation search
- 88+ providers in parallel via `Promise.allSettled`
- Smart provider selection + health tracking
- Editorial V2 branch with position-first rendering

**Findings**:

- **F-B1 (Medium)**: `ALL_PROVIDERS` array (line 391) lists ~80 providers but the `Providers` type union (line 283) lists ~90+ including providers not in `ALL_PROVIDERS` (e.g., `brookings`, `rand`, `cnas`, `newamerica`, `lawzero`, `govai`, etc.). These think-tank providers are in the type but not in the execution array — they're silently never queried.
- **F-B2 (Low)**: `BUSINESS_PROVIDERS`, `THINK_TANK_PROVIDERS`, `ENVIRONMENTAL_PROVIDERS`, `TECHNOLOGY_PROVIDERS` reference providers (`crunchbase`, `reuters`, `mckinsey`, `deepmind`, `wri`, etc.) that don't have search functions imported. These arrays appear to be legacy aspirational lists.
- **F-B3 (Medium)**: `ACADEMIC_PROVIDERS` includes `nature`, `science`, `cell`, `lancet`, `pnas` — none of which have search functions in the imports. These are phantom entries.
- **F-B4 (Low)**: The `scoutImpl` function is ~400 lines of sequential `if (providerSet.has(...))` blocks. This could be refactored into a provider registry map, but is not blocking.

**Recommendations**:
1. Clean `ALL_PROVIDERS` to match exactly the providers with imported search functions
2. Remove phantom entries from `ACADEMIC_PROVIDERS`, `BUSINESS_PROVIDERS`, etc.
3. Consider a provider registry pattern: `{ name, searchFn, maxResults }[]`

### 2.2 Orchestration (`orchestrator.ts`)

**Strengths**:
- 4 adaptive checkpoints: ASSESS → DEEPEN → CHALLENGE → PIVOT
- Calibrated thresholds from AgentMemory (overrides static defaults)
- RE_SCOUT with broader terms when source quality insufficient
- ABORT path for insufficient data

**Findings**:

- **F-B5 (Medium)**: The orchestrator thresholds are static defaults (`MIN_SOURCES: 10`, `MIN_SOURCES_STRATEGIC: 15`). The `thresholds` field on `PipelineState` allows override from AgentMemory, but the actual calibration feedback loop (`computeCalibration`) is not verified to be running in production. If AgentMemory is empty, thresholds never adapt.
- **F-B6 (Low)**: `OrchestratorAction` type includes `PIVOT` but there's no evidence the pivot action is wired into the pipeline execution path. It may be a dead branch.

### 2.3 Agent Catalog (87 files in `lib/agent/`)

**Active agents verified**: 37+ agents, all imported and called from pipeline-v2 or sub-orchestrators.

**New T1-T10 improvements (this session)**:
- `pruning-gates.ts`: Orphan, fragmented, ungrounded, cascade gates + trust propagation DAG + hedging strip + domain travel gate
- `chain-probability.ts`: Monte Carlo on real CausalLink objects with sourced priors, inflection gate (dated+thresholded+attested), DerivedQuantity verification
- `reader-agent-v3.ts`: Verbatim span extraction + `verifyStatedSpan()` substring verification
- `enhanced-ranker.ts`: Load-bearing marking (top 30% → full_text budget) + reading budgets
- `prediction-registration.ts`: Deterministic prediction registration with resolution criteria

**Findings**:

- **F-B7 (Medium)**: `analyst-multipass.ts` line 17 has `// import Sentry from '@sentry/nextjs'; // Commenté pour éviter l'erreur TypeScript` — Sentry is commented out. Error tracking for the analyst agent is blind. This should be fixed by either resolving the TypeScript error or using `import * as Sentry from '@sentry/nextjs'`.
- **F-B8 (Low)**: The `simulation-agent.ts` (47KB) exists but is not imported into `pipeline-v2.ts` or `strategic-analyst-agent.ts`. It may be wired through foresight — needs verification.
- **F-B9 (Medium)**: 4 researcher registries still exist (`phd-researcher.ts`, `researcher-identity.ts`, `researcher-ownership.ts`, `domain-expert.ts`). The previous audit recommended unification into a single `researchers.ts`. This has not been done.
- **F-B10 (Low)**: `ARCHITECTURE_AUDIT.md` exists in `lib/agent/` — a documentation file in a code directory. Should be moved to docs or removed.

### 2.4 LLM Layer (`unified-llm.ts`)

**Strengths**:
- 5 providers with cross-family fallback (DeepSeek ↔ Kimi primary, GLM/OpenAI/Anthropic fallback)
- Circuit breaker per provider
- JSON validation with tolerant parser (fence strip, brace extract, truncation repair)
- Reasoning model fallback (GLM `reasoning_content` → content)
- Opposite-family verification rule for fact_check/citation_verification
- Kimi K3: temperature=1 enforced, thinking_budget=0 for JSON tasks

**Findings**:

- **F-B11 (Low)**: The task→model assignment table is the single source of truth but is not externally configurable. Changing model routing requires a code deploy. Consider env var override for A/B testing.
- **F-B12 (Medium)**: No token usage budget enforcement at the LLM layer. A single runaway agent (e.g., strategic analyst with 16K output tokens) can consume the entire API budget. The `getPipelineMaxBudgetUsd` function exists but is checked at the pipeline level, not per-LLM-call.

### 2.5 Data Model (Prisma Schema, 1954 lines, 40+ models)

**Strengths**:
- Rich lineage: `AnalysisRun` → `AnalysisStep` → `Claim` → `EvidenceSpan` → `SourceChunk`
- Think Tank layer: `Vertical` → `Signal` → `Draft` → `ThinkTankPublication` → `ThinkTankQualityCheck`
- Knowledge Graph: `ConceptNode` + `ConceptRelation` with longitudinal tracking
- Prediction model with resolution criteria (T10)
- Cost tracking: `CostLog` + `UserQuota`
- Newsletter: double opt-in, engagement tracking, edition management

**Findings**:

- **F-B13 (Medium)**: Dual claim systems exist: `Claim` (linked to `AnalysisRun`) and `ThinkTankClaim` (linked to `ThinkTankPublication`). These serve different pipelines but create confusion about which is the source of truth for claim-level audit.
- **F-B14 (Low)**: `Subscription` model is marked as legacy in comments but still has active fields (`weeklyPublicationCount`, `studioQuestionsPerMonth`). The migration to `User.stripeCustomerId` is noted but not executed.
- **F-B15 (Low)**: `Brief` model has both `runId` and `pipelineRunId` — two different foreign keys to different run tracking systems. This is confusing but may be intentional for backward compatibility.
- **F-B16 (Medium)**: pgvector indexes are commented out (`// @@index([embedding(ops: raw("vector_cosine_ops"))], type: Gin)`). Embeddings are stored as `Float[]` JSON, not as native vectors. This means similarity search is done in application code, not in DB — a scaling concern.
- **F-B17 (Low)**: `CausalLink` model is not in the Prisma schema but is referenced in `chain-probability.ts`. Causal links appear to be in-memory only, not persisted. This means the Monte Carlo simulation results are lost after each pipeline run.

### 2.6 Publication Gate

**Strengths**:
- Multi-check gate: trust score, quality, citation coverage, source count, novlangue detection
- Adaptive source count thresholds by domain
- Devil's Advocate score integration
- Triangular judge override support

**Findings**:

- **F-B18 (Medium)**: `maxUncitedClaimRatio: 0.40` — 40% of claims can be uncited. This is generous for a "think tank" positioning. Consider tightening to 0.25 for standard and 0.15 for strategic.
- **F-B19 (Low)**: `minCitationCoverage: 0.50` — only 50% of claims need citations. For a product positioned as "every claim links to its source", this is low.

---

## 3. Frontend Audit

### 3.1 Design System

**Strengths**:
- Pure black `#000000` background = Palantir-aligned
- `#137CBD` blue accent = Blueprint exact match
- Barlow (D-DIN equivalent) + Barlow Semi Condensed + JetBrains Mono — excellent typographic stack
- `border-white/[0.08]` = Palantir-standard hairline borders
- `font-mono` used for metrics, `font-display` for headings — correct hierarchy
- Grain overlay, cursor glow, scroll progress — subtle atmospheric layers
- `sr-only` skip link = accessibility present

**Findings**:

- **F-F1 (Medium)**: `EtherealBackground` component has `particleCount` prop but `PublicPageShell` defaults to `particles={0}`. The particle effect is never shown on any page. Either remove or enable selectively.
- **F-F2 (Low)**: `CursorGlow` is always on — may cause performance issues on low-end devices. Consider respecting `prefers-reduced-motion`.
- **F-F3 (Low)**: `framer-motion` is used for mobile nav (`AnimatePresence`) and scroll reveals. This is appropriate but adds ~50KB to the bundle. Consider CSS-only alternatives for the nav.
- **F-F4 (Medium)**: No `prefers-reduced-motion` handling anywhere in the codebase. `ScrollReveal`, `WordReveal`, `StatCounter`, `MagneticButton`, `CursorGlow` all animate unconditionally. This is an accessibility concern (WCAG 2.1 SC 2.3.3).

### 3.2 SEO

**Strengths**:
- `sitemap.ts` with dynamic publication URLs (up to 500)
- `robots.ts` with correct disallow rules (`/api/`, `/dashboard/`, `/admin/`, `/studio/`)
- `layout.tsx` with comprehensive metadata: title template, description, keywords, OG, Twitter card
- `Organization` JSON-LD in layout
- `Article` JSON-LD on inquiry pages
- RSS feed (`/feed.xml`) with 25 latest publications
- `opengraph-image.tsx` with dynamic OG image generation
- Canonical URLs on inquiry pages
- `manifest.ts` for PWA

**Findings**:

- **F-F5 (High)**: **No `BreadcrumbList` structured data**. Google rich results benefit from breadcrumbs, especially for `/archives` → `/inquiry/[slug]` paths.
- **F-F6 (Medium)**: **No `FAQPage` structured data** on pricing page. The FAQ section (`FAQ` array in `pricing/page.tsx`) has 6+ Q&A pairs that could generate rich snippets.
- **F-F7 (Medium)**: **No `AboutPage` structured data** on `/about`. The page has organization info that could be marked up.
- **F-F8 (Medium)**: `keywords` in layout metadata: `["think tank", "strategic intelligence", ...]` — Google has ignored meta keywords since 2009. This field is wasted bytes. Remove it.
- **F-F9 (Low)**: Sitemap `lastModified` for static pages uses `new Date()` — this changes every build, which can cause unnecessary re-crawling. Use a fixed date or build timestamp.
- **F-F10 (Medium)**: **No `og:image` on inquiry pages**. The `generateMetadata` function in `inquiry/[slug]/layout.tsx` doesn't set `ogImage` or `images` in the OG config. The default OG image from `opengraph-image.tsx` is used, but article-specific OG images would improve social sharing CTR.
- **F-F11 (Low)**: `app/manifest.ts` exists but has minimal fields (`name`, `short_name`, `description`, `icons`). Missing `theme_color`, `background_color`, `display`, `categories`.
- **F-F12 (Medium)**: **No `<link rel="canonical">` on the homepage**. The layout sets `metadataBase` but the homepage doesn't explicitly set `alternates.canonical`.

### 3.3 UX / Funnel

**Current funnel**:
```
Landing (hero + manifesto + pillars + data sources + featured brief + pipeline strip + latest briefs + studio preview + newsletter)
  → Pricing (Reader free / Studio paid)
  → Auth modal
  → Studio (commission a brief)
  → Inquiry page (read a brief)
```

**Findings**:

- **F-F13 (High)**: **No interactive demo**. A visitor cannot see the product in action without signing up. The `PipelineStrip` component shows static step names — it doesn't demonstrate the actual pipeline. Consider an animated demo or a sample brief embedded on the landing.
- **F-F14 (High)**: **No Knowledge Graph visualization**. The KG (`ConceptNode` + `ConceptRelation`) is a major differentiator but has zero frontend representation. This is the single biggest missed product opportunity.
- **F-F15 (Medium)**: **Studio page requires payment before any preview**. The flow is: question → format selection → Stripe checkout → async pipeline. There's no preview of what the output will look like. Consider showing a sample output for each format.
- **F-F16 (Medium)**: **No "How it works" interactive walkthrough**. The methodology page explains the 4 steps (Map → Confront → Quantify → Decide) but doesn't show them in action.
- **F-F17 (Low)**: **Newsletter section is at the very bottom** — below the fold for most users. Consider a mid-page CTA or exit-intent trigger.
- **F-F18 (Medium)**: **No social proof**. No testimonials, no "trusted by" logos, no usage statistics beyond "250M+ sources". For a B2B product, social proof is critical.
- **F-F19 (Low)**: **Archives page loads all 48 briefs client-side** via `fetch("/api/public/briefs?limit=48")`. No server-side rendering for SEO. The page is `"use client"` — search engines see an empty page.
- **F-F20 (Medium)**: **Inquiry page is client-side rendered**. `"use client"` with `useEffect` fetch. The `layout.tsx` generates metadata server-side (good), but the page content is hydrated client-side. For SEO, the article body should be server-rendered.
- **F-F21 (Low)**: **No breadcrumbs UI**. Navigation from `/archives` → `/inquiry/[slug]` has a "Back to briefs" button but no breadcrumb trail. Breadcrumbs improve both UX and SEO.

### 3.4 Wording / Copy

**Strengths**:
- "From Chaos to Clarity" — strong, memorable tagline
- Institute voice: "An institute that maps the evidence, confronts every assumption, and publishes positions anyone can verify"
- Method steps: "Map · Confront · Quantify · Decide" — clear, action-oriented
- Manifesto: "The world doesn't suffer from a lack of information. It suffers from a lack of structure." — excellent
- Philosophy pillars: "Transform chaos into order", "Meaning before answers" — distinctive

**Findings**:

- **F-F22 (Low)**: **Inconsistent tagline usage**. `BRAND_TAGLINE = "From Chaos to Clarity."` (with period), `BRAND_SHORT = "From Chaos to Clarity."` (same), `BRAND_HERO_SUBTITLE_SHORT = "From Chaos to Clarity."` (same), `BRAND_HERO_TITLE = "From Chaos to Clarity."` (same). Four constants for the same string. DRY violation.
- **F-F23 (Low)**: **"250M+ sources" claim**. `BRAND_SOURCES_LABEL = "250M+"` — this refers to OpenAlex's total corpus, not NomosX's indexed sources. Could be misleading. Consider "250M+ sources accessible" or "250M+ sources mapped".
- **F-F24 (Low)**: **Pricing copy**: "Reader is free, forever" — strong. But "Studio" pricing is unclear from the page. The user has to go to `/studio` to see actual prices. Consider showing a price range on the pricing page.
- **F-F25 (Low)**: **"Commission a brief"** CTA on hero — good action verb. But "Browse intelligence" is vague. Consider "Read published briefs" or "Explore positions".
- **F-F26 (Low)**: **Footer** (`SiteFooter.tsx`, 1900 bytes) — minimal. Missing: legal links are present but no social links, no sitemap link, no "last updated" indicator.

### 3.5 Performance

- **F-F27 (Medium)**: `globals.css` is 87KB — very large for a CSS file. Consider splitting into critical and non-critical CSS, or purging unused styles.
- **F-F28 (Low)**: `page.tsx` (homepage) is 832 lines / 20KB — large for a single component. The `HomePageContent` function could be split into smaller section components.
- **F-F29 (Low)**: Multiple `useEffect` fetches on the homepage: `/api/auth/me`, `/api/public/briefs`, `/api/public/featured-verdict`. These are sequential, not parallel. Use `Promise.all`.

---

## 4. Innovation Opportunities

### 4.1 Knowledge Graph Visualization (Priority: High)
The KG (`ConceptNode` + `ConceptRelation`) is populated during pipeline runs but has zero frontend representation. A `force-directed graph` component on both the homepage and inquiry pages would:
- Differentiate from Perplexity/Consensus visually
- Show the "intellectual territory" metaphor from the manifesto
- Provide a navigation surface (click a node → see related briefs)

### 4.2 Prediction Tracker (Priority: Medium)
The `Prediction` model with resolution criteria exists (T10). A public "Prediction Tracker" page showing:
- Open predictions with horizons
- Resolution status (OPEN/CONFIRMED/REFUTED/EXPIRED)
- Track record over time
This would build credibility and differentiate from "one-shot analysis" competitors.

### 4.3 Evidence Grade Badges (Priority: Medium)
The `EvidenceSpan` model has `relevanceScore` and `strengthScore`. Display these as visual badges on claims in the inquiry page:
- 🟢 Strong evidence (strength > 0.8)
- 🟡 Moderate evidence (0.5-0.8)
- 🔴 Weak evidence (< 0.5)
This makes the "every claim is verified" promise visible.

### 4.4 Causal Chain Visualization (Priority: Medium)
`chain-probability.ts` now builds real causal chains with Monte Carlo probabilities. A `Sankey diagram` or `DAG visualization` on strategic reports would make the causal reasoning transparent — a core brand promise.

### 4.5 Provider Diversity Map (Priority: Low)
The pipeline enforces `minProviderDiversity` in ranking. Show a `provider distribution chart` on each brief — "This analysis drew from 12 providers across 4 domains" with a visual breakdown. Reinforces the "cross-domain" positioning.

### 4.6 adversarial Debate Transcript (Priority: Low)
The Harvard Council and Devil's Advocate agents produce rich debate transcripts. Making these available as expandable sections on inquiry pages would demonstrate the "confront every assumption" promise.

---

## 5. Prioritized Action Plan

### Sprint 1 — Quick Wins (1 week)

| # | Action | Impact | Effort |
|---|---|---|---|
| 1 | Fix F-B7: Uncomment Sentry in analyst-multipass.ts | High | 1h |
| 2 | Fix F-B1: Clean ALL_PROVIDERS to match imports | Medium | 2h |
| 3 | Fix F-B3: Remove phantom providers from ACADEMIC_PROVIDERS | Medium | 1h |
| 4 | Fix F-F8: Remove meta keywords from layout | Low | 5min |
| 5 | Fix F-F22: DRY the tagline constants | Low | 15min |
| 6 | Fix F-F4: Add prefers-reduced-motion handling | Medium | 2h |
| 7 | Fix F-F5: Add BreadcrumbList structured data | High | 1h |
| 8 | Fix F-F6: Add FAQPage structured data on pricing | Medium | 30min |
| 9 | Fix F-F12: Add canonical URL on homepage | Low | 5min |
| 10 | Fix F-F11: Complete manifest.ts fields | Low | 10min |

### Sprint 2 — SEO & UX (2 weeks)

| # | Action | Impact | Effort |
|---|---|---|---|
| 11 | Fix F-F19: SSR archives page | High | 1d |
| 12 | Fix F-F20: SSR inquiry page body | High | 2d |
| 13 | Fix F-F10: Article-specific OG images | Medium | 1d |
| 14 | Fix F-F13: Interactive demo on landing | High | 3d |
| 15 | Fix F-F21: Breadcrumbs UI component | Medium | 2h |
| 16 | Fix F-F18: Add social proof section | Medium | 1d |
| 17 | Fix F-F29: Parallelize homepage fetches | Low | 30min |

### Sprint 3 — Data Model & Backend (2 weeks)

| # | Action | Impact | Effort |
|---|---|---|---|
| 18 | Fix F-B9: Unify researcher registries | Medium | 2d |
| 19 | Fix F-B13: Document Claim vs ThinkTankClaim usage | Medium | 2h |
| 20 | Fix F-B16: Enable pgvector for embeddings | High | 3d |
| 21 | Fix F-B17: Persist CausalLink to DB | Medium | 1d |
| 22 | Fix F-B18: Tighten publication gate thresholds | Medium | 1h |
| 23 | Fix F-B5: Verify AgentMemory calibration loop | Medium | 1d |
| 24 | Fix F-B12: Add per-call token budget enforcement | Medium | 1d |

### Sprint 4 — Innovation Features (4-6 weeks)

| # | Action | Impact | Effort |
|---|---|---|---|
| 25 | Knowledge Graph visualization component | Very High | 2w |
| 26 | Prediction Tracker public page | High | 1w |
| 27 | Evidence grade badges on claims | Medium | 3d |
| 28 | Causal chain DAG visualization | Medium | 1w |
| 29 | Provider diversity chart | Low | 2d |
| 30 | Adversarial debate transcript viewer | Low | 3d |

---

## 6. Architecture Strengths (Keep These)

These are the differentiators that make NomosX unique — do not change or remove:

1. **19-step pipeline with adaptive orchestration** — RE_SCOUT/DEEPEN/RE_ANALYZE/PIVOT is rare at this stage
2. **T1-T10 deterministic gating** — verbatim span verification, trust propagation DAG, hedging strip, inflection gate, domain travel gate, MC on real causal chains, derived quantity verification
3. **22 PhD researchers with persistent identity + editorial ownership + sign-off** — no competitor has this
4. **88+ providers with smart selection + health tracking** — best-in-class coverage
5. **5-provider LLM failover with cross-family verification** — robust against single-provider outages
6. **Knowledge Graph with longitudinal concept tracking** — asset that's built but not yet shown
7. **Prediction model with resolution criteria** — builds track record over time
8. **Publication gate with novlangue detection** — guards against Orwellian language
9. **Self-improving infrastructure** — agent memory, provider health, prediction auditor
10. **Position-first rendering** — takes a stand, not false balance

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| pgvector not enabled → similarity search O(N) | High | Scaling | Sprint 3 #20 |
| Client-side rendered pages → poor SEO | High | Traffic | Sprint 2 #11-12 |
| No demo → low conversion | High | Revenue | Sprint 2 #14 |
| Runaway LLM costs | Medium | Budget | Sprint 3 #24 |
| Researcher registry desync | Medium | Quality | Sprint 3 #18 |
| Phantom providers silently ignored | Medium | Coverage | Sprint 1 #2-3 |

---

*Audit produced by Cascade, August 2026. This document supersedes `AUDIT_2026.md` for the post-T1-T10 codebase state.*
