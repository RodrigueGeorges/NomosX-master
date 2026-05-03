# NomosX Agent Publication Quality Audit

Date: 2026-05-03

## Verdict

The agentic system is strong enough for high-quality think-tank publishing if the publication gate remains the final authority.

The core pipeline already has the right intellectual architecture:

- topic discovery and editorial planning
- smart provider selection
- scoped scouting and ranking
- Reader V3 extraction
- multi-pass analyst synthesis
- strategic analyst for long reports
- structural editing
- expert council review
- citation verification
- fact checking
- critical loop rewrite
- debate agent
- meta-analysis when data allows
- devil's advocate
- agent memory and self-improvement

The critical risk was not the absence of powerful agents. The risk was inconsistent publication paths.

## What Was Hardened

All public publication paths now use the same business quality rule:

- trust score minimum by format
- quality score minimum by format
- citation coverage minimum by format
- word count minimum by format
- source count minimum by format

Public visibility is also filtered centrally through `publicPublicationWhere()`.

## Publication Rule

| Format | Trust | Quality | Citations | Words | Sources |
| --- | ---: | ---: | ---: | ---: | ---: |
| Summary Brief | 75 | 75 | 72% | 700 | 5 |
| Update Note | 75 | 75 | 72% | 600 | 3 |
| Data Note | 75 | 75 | 75% | 900 | 4 |
| Policy Note | 78 | 78 | 75% | 1200 | 8 |
| Research Brief | 78 | 78 | 75% | 1500 | 10 |
| Executive Brief | 78 | 78 | 75% | 1500 | 10 |
| Strategic Report | 80 | 80 | 78% | 3500 | 20 |
| Dossier | 82 | 82 | 80% | 8000 | 35 |

## Audit Findings

### 1. Topic Detection

Status: strong, with review needed over time.

The system has multiple topic inputs:

- editorial planner
- knowledge graph trend detection
- signal detector
- master orchestrator
- auto-scan radar
- stale coverage detection
- LLM gap detection

Strength: it does not rely on a single feed.

Risk: signal-based topics can be noisy when source quality is low. This is now mitigated because topic selection can trigger a pipeline, but publication still requires the final quality gate.

### 2. Source Quality

Status: strong.

The system uses:

- smart provider selection by domain
- provider health tracking
- source ranking with relevance and diversity
- abstract requirements
- source count thresholds
- citation verifier
- source reputation learning

Risk: some providers return shallow metadata. Mitigation: Reader V3 and publication gate require enough evidence depth before publication.

### 3. Writing Quality

Status: strong but dependent on the critical loop staying active.

The writing chain includes:

- analyst V3 multi-pass synthesis
- strategic analyst for long-form reports
- structural editor
- critical loop V2 rewrite
- debate agent
- devil's advocate challenge

Risk: if any route bypasses the gate, average prose can still be stored. Mitigation: public visibility and creation paths now use readiness checks.

### 4. Citation Integrity

Status: strong after hardening.

The system verifies citation support semantically, not just citation syntax.

Fix applied during audit:

- publication paths now read the actual `citationVerifier.integrity` score
- fallback hardcoded citation coverage was removed from Studio and auto-scan publication creation
- source IDs are pulled from the generated brief instead of assuming `stats.sourceIds`

### 5. Orchestration

Status: strong.

The main pipeline is high-grade:

SCOUT -> INDEX -> EMBED -> DEDUPE -> RANK -> READER V3 -> ANALYST -> STRUCTURAL EDITOR -> COUNCIL -> CITATION GUARD -> EDITOR -> CITATION VERIFIER -> FACT CHECKER -> CRITICAL LOOP -> DEBATE/META -> DEVIL'S ADVOCATE -> MEMORY -> PUBLISHER

Risk: non-core endpoints must never publish directly without readiness checks. Studio, cron, auto-publisher, signal generation and public APIs were reviewed and aligned.

## Operational Rule

The system must prefer silence over mediocre output.

If the pipeline cannot produce a publication that passes the gate, the correct state is:

- `HELD` for generated but not publishable material
- `DRAFT` for material needing review
- no public exposure

## Required Operating Cadence

Run this cadence on the machine that has Node:

```bash
npm run quality:audit
npm run quality:hold
npm run agents:improve:apply
npm run quality:audit
npm run build
```

## Residual Risks

- Local build could not be run in this environment because Node/npm are unavailable.
- The quality gate cannot judge deep originality by itself; it must be reinforced by the agent-memory improvement loop.
- Very current geopolitical/news topics still depend on provider coverage and API availability.

## Bottom Line

NomosX now has the right structure for premium autonomous publishing.

The decisive product behavior is enforced: publish only when the research base, citations, writing depth and adversarial review pass the threshold.
