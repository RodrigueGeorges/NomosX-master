# NomosX CTO Remediation Plan

Objective: move NomosX from an ambitious agentic prototype to a credible institutional research platform comparable in operating discipline to leading think tanks.

## Operating Principles

- Reliability before sophistication: no premium claim matters if build, security, or quota controls are weak.
- Evidence before prose: every material claim must map to a source, span, support score, and verification status.
- Scarcity improves trust: publish fewer reports, with explicit thresholds, rather than maximizing volume.
- Editorial humility: replace absolute truth language with confidence, uncertainty, dissent, and auditability.

## P0 - Trust And Safety

Status: first fixes started in code.

- Rate limiting: every `assertRateLimit()` call must be awaited. Add a regression test that fails on un-awaited calls.
- HTML safety: generated report HTML must be sanitized on the server before any SSR render.
- Build reproducibility: CI must run `typecheck`, `lint`, `test`, `prisma validate`, and `next build`.
- Secret governance: production boot must fail on weak `JWT_SECRET`, weak `ADMIN_KEY`, missing `CRON_SECRET` for cron routes, and missing Redis in multi-instance deployments.
- Cost safety: all LLM routes need user or service identity, quotas, rate limits, and monthly cost ceilings.

Implemented baseline:

- Awaited rate limits on reviewed high-risk API routes.
- Server-side HTML sanitization added for generated content.
- Redis rate-limit failures now fail closed for actual limit breaches.

## P1 - Institutional Publication Gate

- Separate user subscription quotas from editorial cadence.
- Add global editorial settings:
  - max autonomous publications per rolling 7 days
  - minimum citation coverage
  - minimum source diversity
  - minimum trust score
  - maximum unresolved contradiction severity
- Require publication states:
  - `DRAFT`
  - `UNDER_REVIEW`
  - `REVISION_REQUIRED`
  - `APPROVED`
  - `PUBLISHED`
  - `RETRACTED`
- Store all editorial decisions with reasons and reviewer identity.
- Block publication when source quality, support score, or citation verification fails.

Implemented baseline:

- Shared deterministic gate in `lib/agent/publication-gate.ts`.
- Cron, auto-publisher, and publication generator now store gate metrics and hold weak drafts.
- Editorial cadence uses rolling `ThinkTankPublication` count instead of subscription side effects.

## P2 - Evidence Ledger

For every published factual claim, persist:

- claim text
- claim type
- source IDs
- quoted or paraphrased evidence spans
- support classification
- confidence score
- contradiction status
- last verification date
- agent and model version that produced or verified it

Implemented baseline:

- Deterministic preflight ledger in `lib/agent/evidence-ledger.ts` for claim density and citation coverage.

Public reports should expose a reader-friendly version:

- sources used
- sources rejected
- methodology
- confidence bands
- limitations
- dissenting view
- correction policy

## P3 - Research Quality

- Build source reputation by provider, institution, author, venue, freshness, citation count, and retraction signals.
- Add dedupe by normalized title, DOI, canonical URL, and publication fingerprint.
- Require source diversity by format: academic, institutional, data, legal, market/news when relevant.
- Add methodology classifier: RCT, observational, model-based, legal analysis, expert report, survey, dataset.
- Add quantitative evidence extraction into report tables, not only prose.

## P4 - Product Experience

- StudioX should become an analyst workspace:
  - scope definition
  - provider selection
  - corpus preview
  - excluded source reasons
  - draft review
  - audit trail
  - export
- Public reports should feel sober and institutional:
  - less animated marketing
  - more report readability
  - visible methodology
  - citation appendix
  - correction link
- Add three flagship formats:
  - Policy Memo: 4 pages, options, risks, recommendation
  - Strategic Report: 10-15 pages, scenarios, stakeholders, implementation
  - Research Dossier: deep corpus, appendix-heavy, researcher audience

## P5 - Observability

Dashboards required before serious production:

- pipeline success rate by step
- provider failure rate
- citation verification integrity
- cost per report
- token usage per agent
- source freshness
- claim support distribution
- publication rejection reasons
- user quota consumption

## Definition Of Top-Tier

NomosX reaches institutional-grade quality when:

- CI is green on every merge.
- No LLM output reaches public pages without server-side sanitization.
- No LLM-costing endpoint is public or unmetered.
- Every published claim has evidence metadata.
- Every report has methodology, limitations, and dissent.
- Every publication has an audit trail.
- Editorial cadence is intentionally scarce.
- Public language is rigorous, not absolute.
