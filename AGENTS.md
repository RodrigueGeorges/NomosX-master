# NomosX Agents

**Complete specification of the agentic pipeline**

---

---

## Sprint 38 — Reliability repasse: cancellation actually cancels, spend survives timeouts

Deep audit of the paid-run logs (19.4h cycle, $1.73, 0 published) plus the
worker log: the pipeline's failures were orchestration bugs, not quality
ceilings. All defects reproduced with deterministic tests first.

**Zombie pipelines killed** (`execution-scope.ts`, `intelligent-scout.ts`,
`index-agent.ts`, `reader-block.ts`, `simulation-agent.ts`,
`scout-enrichment-index.ts`, `global-science.ts`) — `withExecutionDeadline`
rejected the await but `fn()` kept running: a dead `regen` scope was
observed driving scout+index+DB writes for ~17h post-mortem. Now
`assertExecutionActive()` gates every hot loop (scout iterations, lens
queries, reader batches, ORCID batches, foresight ticks, index/embed/dedupe
transitions), a global axios request-interceptor injects the execution
signal into the ~50 providers + PDF reader that bypassed http-client (via
`createRequire` so it binds the CJS instance too), a `globalThis.fetch`
wrapper does the same for the ~23 fetch-based providers/agent modules —
unscoped calls (Next routes, scripts) pass through untouched — and
`global-science`
re-asserts after `Promise.allSettled` — allSettled absorbs callback
rejections, so an abort must be re-thrown at the boundary or cancellation
collapses into `[]`.

**Nested deadlines aligned** (`think-tank-dispatcher.ts`,
`inquiry-orchestrator.ts`) — DISPATCH_TIMEOUT paid 100→130min, free
240→260min (pipeline ≤75 + regen ≤35 + persist tail). The regen window is
derived from the REAL parent deadline via `getExecutionDeadlineAt()`
(min over the scope ancestry) instead of a hardcoded `95min − elapsed`;
regen refused when parent headroom < 40min.

**Spend survives failure** (`pipeline-init.ts`, `execution-scope.ts`,
`budget-manager.ts`, `think-tank-dispatcher.ts`) — `recordExecutionCost()`
accumulates per-scope; `withExecutionDeadline` attaches `costUsd` to
timeout errors; the dispatcher pre-generates the pipeline `executionId`
and recovers `PipelineRun.steps.totalCostUsd` in its catch instead of
reporting $0; a timed-out/aborted item sets `stopAll` (no reserve drain on
a contradictory state); `recordSpend` failures now warn AND propagate —
the dispatcher awaits the write before completing the item and stops the
cycle on failure rather than spending blind.

**Lease expiry is synchronous** (`durable-worker.ts`) — a resumed handler
could finalize COMPLETED after its lock died in DB (fake-timer test
reproduced it). `startHeartbeat` returns `assertLeaseActive()` checked
before finalize and in the catch path; heartbeat gap > 3× interval logs
`HEARTBEAT GAP` — host-suspend corruption (the 19.4h cycle) is now
identifiable in post-mortems.

**DA skip doctrine enforced** (`inquiry-funnel-utils.ts`,
`inquiry-orchestrator.ts`) — `getCompletedAdversarialEvaluation()` returns
an evaluation only when it actually ran: skipped/error/incomplete/bad
verdict/invalid score all yield undefined. `skipped === true` is excluded
from `failedEvaluations` when DA is optional (`enableDevilsAdvocate:false`),
but a REQUIRED evaluation that produced nothing still hard-fails
`evaluation_availability` — the S37 rule "a deliberate skip is not a
failure" never meant "a missing evaluation is a pass".

**Render-bound failures don't buy regen** (`revision-controller.ts`) —
`central_scenario` and `evaluation_freshness` are owned by deterministic
resolvers; `shouldRegenerate` treats them as non-actionable (both paid
items burned a ~25–35min regen on pure render drift). `repairCentralScenario`
now validates all 6 gate-compared fields, not just name+rationale.

**`resolveCentralScenario` is strict** (`editorial-types.ts`) — exact
normalized matching only: a partial or extended dominant label that could
match several scenarios degrades to `probability_fallback` ("requires an
explicit editorial choice") rather than silently endorsing a guess.

**Locale-aware sanitization** (`citation-repair.ts`) — the unsourced-number
marker follows the artifact language (`non établie` / `not established`)
instead of hardcoded French inside English publications.

**Provider hygiene** (`unified-llm.ts`, `global-science.ts`) — 24h circuit-
breaker suspensions persist with the suspension TTL (were written with the
120s reset-window TTL → auto-"recovered" while dead); RSS transport routed
through the bounded cancellable `httpGet`; 10min per-feed failure cooldown
(a dead Google News endpoint was burning ~30 × 15s per run).

**Build** (`next.config.mjs`) — `@temporalio/*` added to
`serverExternalPackages`: the worker ships a webpack/swc workflow bundler
with native deps that Turbopack traced through dynamic imports, breaking
`next build` on missing `loader-utils`.

Tests: `global-science` +3 (transport, cancellation-after-allSettled,
cooldown), `fixed-corpus` (cancel during index/embed), `durable-worker`
(expired lease → lost), `budget-manager`/`reserve-dispatch` (spend-write
ordering + failure propagation), `central-scenario` (ambiguous labels →
fallback), `funnel-regressions` (locale marker). Suite: 52 / 543, tsc
clean, `next build` green.

---

## Sprint 37 — The gate is a router: every check failure maps to a specialist agent

The revision-controller already posted gate failures as signals resolved by
specialists — but half the check types had no resolver, so their HELDs were
terminal by omission. Full routing matrix now:

| Failed check | Routed to |
|---|---|
| `central_scenario` | deterministic re-render from persisted decision |
| `citation_coverage` + `claim_citation_density` | citation backfill |
| `trust_score` | **decomposed** — `stats.criticalLoop.components` (now persisted: coverage/groundedness/fact/nli/sourcecheck/diversity/avgQuality/critic) tells WHICH component dragged the composite; coverage < 0.6 → `citation_gap`, critic < 40 or groundedness < 0.65 → `substance_weak` with the named component in the directive |
| `word_count` | `substance_weak` — expansion directive (deepen evidence discussion, not padding) |
| `novlangue_density` | flagged terms posted into the copy-editor's `style_violation` batch with true-name hints (true-names are semantic explanations — the LLM reformulates, no naive string replace) |
| `quality_score` / `devils_advocate` / `fatal_challenges` | `substance_weak` → revision editor (unchanged) |
| `evaluation_freshness` | eval-rescore re-judges stale verdict evals on the live artifact (existing) |
| `evaluation_availability` | **NEW** — `failedAnalysisEvalKeys`: an evaluator that crashed or returned incomplete is re-invoked once on the live artifact (transient provider outage is the classic recoverable case). `skipped` stays untouched — a deliberate skip is not a failure. DA re-check trigger extended to `error`/`evaluationComplete===false`/`skipped` |
| `source_depth` | evidence-bound → dispatcher falls to the next pre-validated candidate (the funnel absorbs at the top, unchanged) |
| `researcher_signoff` | draft/manual — process veto, unchanged |

Tests: eval-rescore +5 (errored-eval routing, stale+errored single pass,
skip non-failure), revision-controller +4 (density→citation, trust
decomposition→citation/substance, word_count→substance, novlangue→style
batch — verified style gates produce zero violations on the fixture so the
signal provenance is unambiguous). 51 suites / 509 tests.

## Sprint 36b — Calibrated publication tier: the moderate band publishes, labeled

The mandate audit confirmed the pipeline is already position-first
(`verdict` is a required analyst field, hedging is deterministically
stripped, `central_scenario` is a hard gate check) — so HELD never meant
"no position produced", only "position judged insufficiently defensible".
The residual avoidable HELD was the **moderate band**: a viable corpus, an
argued position, every integrity check green — killed solely by the
composite trust bar (55–64). Worse, the intended escape hatch was dead
code: P2b/P5b required `gate.decision !== 'hold'`, but trust < 65
hard-fails the `trust_score` check, so the decision could only ever be
'hold'.

**`isModerateTierEligible`** (`inquiry-funnel-utils.ts`) — a hold is
converted to a labeled publication iff: gate decision is `hold`; the
`trust_score` check actually failed; every OTHER failed check is a
score-band artifact (quality_score ≥40 is advisory-soft); all readiness
failures are confined to trustScore/qualityScore (coverage/word-count
failures are evidence density — they stay held); trust ∈ [55, minTrust);
quality ≥ 40; DA verdict ≠ reject.

**Render** — `injectModerateConfidenceBanner` puts the tier ON the page:
"Preliminary assessment — moderate confidence" with the composite score and
the publication bar. `data-no-cite` keeps it out of citation extraction.
The `confidenceWarning` publication metadata covers the same band.

**Reserve stays strict** — moderate-tier artifacts publish directly and
never enter the validated reserve (`certifyForReserve` re-evaluates the
clean gate and would reject them; the certification path is skipped for the
tier).

**Floors unchanged**: corpus viability refusal before analyst spend;
unresolvable severe contradictions; trust < 55; quality < 40; any real
integrity-check failure (source_depth, citation coverage, density, scenario,
freshness, sign-off, fatal challenges) still holds.

Default ON — `NOMOSX_ALLOW_MODERATE_PUBLISH=0` opts out.

Tests: funnel-regressions +4 (tier matrix + orchestrator end-to-end:
trust-62 hold → PUBLISHED with rendered badge). 51 suites / 500 tests.

## Sprint 36 — Adjudication mandate: contested material is resolved into positions

The S35 live cycle produced two legitimate HELDs whose shared root cause was
editorial, not infrastructural: high-groundedness analyses (91%) rejected on
internal contradictions. A think-tank publication is *supposed* to take
positions on contested material — treating every contradiction as a fatal
defect both misreads the mandate and manufactures avoidable HELDs.

**Detector** (`critic-agent.ts` `CONTRADICTION_PROMPT`) — adjudicated
tensions are explicitly excluded: "the evidence favors X, though sources
report Y" / "we assess A despite reports of B" is a stance, not an
inconsistency. Only pairs the text asserts as simultaneously-true fact
without acknowledgment or resolution are flagged. Attributed positions
("source Z maintains P") never contradict the analysis's own assessment.

**Verdict composition** — a `severe` contradiction is now *adjudicable* (→
`repair`, not `reject`) when at least one side is grounded in the corpus:
the repair keeps the better-supported claim as the position and demotes the
losing claim to explicitly cited dissent. Only *unresolvable* severe pairs
(neither side grounded — floating incoherence) remain fatal.
`repairableComposition` therefore reads `unresolvableSevere === 0` instead
of `severeContradictions === 0`. The `accept` band still requires zero
severe pairs — an accepted piece carries no unresolved severe tension.
Gate unchanged: a `repair` verdict that fails its recheck still reaches the
trust caps by score; the change converts avoidable terminal rejects into
position-taking repair attempts.

**Repair guidance** — contested-finding and contradiction guidance in
`generateRepairInstructions` now instructs adjudication ("state which the
weight of evidence supports and why — source quality, recency, methodology,
consensus breadth") rather than hedge-and-present. The surgical patch
editor received the same mandate.

**Analyst prompt** — `ADJUDICATION RULE` replaces `ANTI-CONTRADICTION RULE`
in the editorial north star: conflicting evidence is expected; the analyst
must (1) state the contested point, (2) weigh the evidence, (3) commit —
"we assess X because…", (4) cite the dissent. Never assert mutually
exclusive facts; never report disagreement without a verdict.

Tests: critic-agent +2 (adjudicable severe → repair; unresolvable severe →
reject). 51 suites / 496 tests, tsc clean.

---

## Sprint 34 — Deadline-aware escalation + corpus cap + branch evidence binding

External-stack study (Jina node-DeepResearch, LangChain open_deep_research,
GPT Researcher, CRAG) applied to the S34 live-run defects. Two live findings
drove this sprint: (1) a TTS candidate + an outline-critic re-analysis
stacked ~20min of analyst passes past the 75min deadline — the run died
mid-pass-3 with zero artifact judged; (2) the aggregated pool looked rich
(100 sources) while 3/7 plan branches had 0–1 ranked sources and measured
topical relevance was ~12%.

**Run-time headroom guards** (`pipeline-steps/time-budget.ts` + call sites)
— a step that cannot finish before the pipeline deadline is pure waste:
better to keep the current artifact and let critic/DA/render/gate run on
it. `hasRunHeadroom(pipelineStart, isStrategic, headroomMs)` reads the
**real** deadline via `getExecutionDeadlineAt()` — the min of every
deadline in the execution-scope ancestry (S35 finding: a regen child's
65min inner clock authorised an outline rewrite that burned its 35min
regen window; a trust-76 PROCEED artifact died before persist). Format
budgets (free: 180min, strategic: 75min, brief: 65min) are the fallback
when no scope deadline exists; no `pipelineStart` → always true (tests,
detached callers). Applied to every expensive escalation:

- **TTS second candidate** (`analyst-run.ts`) — skipped when <25min
  (`TTS_HEADROOM_MS`) remain; `stats.testTimeScaling.skippedReason`.
- **Gap-fill re-analysis** (`gap-fill.ts`) — gap requests now *defer*
  (drained, no scout) when <30min (`GAPFILL_REANALYSIS_HEADROOM_MS`) remain:
  new sources can never reach the analyst or render corpus without a
  re-analysis, so scouting in the tail is wasted provider spend. Reason
  surfaced as `stats.deferredGapRequests.reason = 'insufficient_headroom'`.
- **Orchestrator RE_ANALYZE** — same guard, same threshold.
- **DA pre-render rewrite** (`pipeline-v2.ts`) — skipped when <30min
  (`DA_REWRITE_HEADROOM_MS`) remain; the fatal verdict stands rather than
  the whole run dying mid-rewrite.
- **Critic repair** — migrated from its inline deadline math to the shared
  helper (identical semantics, plus the free-run 180min bound it lacked).

**Corpus cap** (`pipeline-v2.ts`, post-rank/pre-reader) — the analyst prompt
scales ~linearly with sources (100 sources ≈ 73k input tokens ≈ $0.32/pass
×3 passes ×N candidates). `ANALYST_CORPUS_CAP` (default 60 strategic / 45
brief) trims the shared `topSources` pool by rank order with two
protections: a planner-bound branch source and a provider singleton can
never be cut. `allSourceIds` keeps the full pool so gap-fill re-ranks still
see everything; reader extraction cost drops proportionally.
`stats.corpusCap` records before/after/protected counts.

**Branch evidence binding** (`pipeline-steps/branch-coverage.ts`,
`scout-block.ts`, `analyst-context.ts`) — CRAG-style per-branch retrieval
evaluation and GPT-Researcher-style citation binding, deterministic, zero
LLM:

- `planNodesForAudit` now preserves `sourceIds` through the audit
  projection (was silently dropped → branch attribution unreachable
  downstream).
- `auditBranchCoverage` (post-rank): each plan branch is scored on how much
  of ITS scout evidence survived ranking — strong ≥4 / weak 1–3 /
  unsupported 0 ranked sources. Weak/unsupported branches emit targeted
  blackboard gap requests (drained by the existing processor). A rich
  aggregate pool can no longer mask starved branches.
- `annotateCoverageWithEvidence` → per-branch evidence status injected into
  the analyst's REQUIRED COVERAGE block — the analyst knows upfront which
  branches it may assert vs. must hedge.
- `auditBranchCitations` (post-analyst): `[SRC-N]` markers remapped to
  branches via `sourceIds`; a branch cited 0× emits a `COVERAGE-AUDIT` gap
  request drained by the next gap-fill pass.
- Observability: `stats.branchCoverage`, `stats.branchCitations`,
  `stats.corpusCap` + eval-runs repair metrics.

Tests: `time-budget.test.ts` +4, `gap-fill.test.ts` +2 (headroom defer +
reason), `branch-coverage.test.ts` +9. Suite: 50+ suites / 490+ tests.

---

## Sprint 33 — Recoverable HELD + closed learning loop + systematic score levers

Addresses the remaining structural ceiling: a HELD signal was a terminal
state, the experience bank was write-only and volatile, and several score
terms were computed but never consumed. All changes keep the publication
gate identical — the system now *repairs* toward the bar instead of
recording failure.

**HELD is no longer terminal** (`think-tank-dispatcher.ts`,
`inquiry-orchestrator.ts`):

- `collectHeldRetryItems()` — HELD signals past a 20h cooldown
  (`HELD_RETRY_COOLDOWN_MS`) re-enter the dispatch pool in BOTH breaking and
  weekly modes (runs before the empty-radar early return — a quiet radar day
  is exactly when cycle capacity should discharge obligations). Bounds:
  `priorityScore ≥ 55`, ≤2 retries per signal (HOLD-decision count IS the
  budget — no schema migration), ≤1 retry item per cycle.
- `persistHeldDiagnostic()` — held AND failed outcomes write an
  `EditorialDecision` (decision `HOLD`) carrying `checks.failureFeedback`
  (gate reasons + DA kill shot + top challenges), `diagnoses`, scores. A
  failed run that left no record would retry forever — the decision count
  doubles as the spend bound.
- Retry dispatch passes `skipDuplicateCheck: true` (the prior HELD artifact
  would otherwise dedup-block the repair) and
  `pipelineOptions.priorFailureFeedback` → the analyst sees the diagnosis as
  mandatory corrections. `signal.sourceIds` are NOT re-seeded on retries —
  ≥8 seeds skip the scout, which would rerun on the exact corpus that
  failed; a retry scouts fresh.

**DA evidence mission** (`pipeline-v2.ts`): a fatal adversarial challenge
like "no comparative evidence for X" is evidence-bound — prose cannot fix
it. Challenges are distilled into academic search queries (one cheap
`topic_classification` call; raw text as fallback) and posted as
`DEVILS_ADVOCATE` source-gap requests → gap-fill retrieves across 7
providers → re-analysis → DA re-judged BEFORE deciding whether a rewrite is
still needed. Retrieval resolving the objection skips the rewrite spend.

**Learning loop closed** (`knowledge-infrastructure.ts`,
`analyst-context.ts`, `persistence-tail.ts`): the experience bank was
in-memory + write-only (zero callers of `getRelevant*`). Now: every
recorded experience/guideline is mirrored to `agentAuditLog`
(agent `experience_bank` — same durable store as durable-execution), the
bank lazily rehydrates per process, `getRelevantGuidelines` is injected
into the analyst context (post-SARA, never compressed away), and
`extractExperience` receives the real failure signals (DA verdict/kill
shot, critic findings, outline coverage, rank quality) instead of a thin
stats slice. Topic matching upgraded to distinctive-token overlap (≥2
tokens, same approach as prediction-watch).

**Score-lever pass** (`rank-enrichment.ts`, `evaluators-trust.ts`,
`quality-loop.ts`, `persistence-tail.ts`, `analyst-context.ts`):

- `sourceQuality.overall` backfill — the richer quality score (authority/
  recency/richness/diversity) was computed then discarded; ~2.1k sources
  with `qualityScore=0` averaged in as literal zeros. Fallback applied in
  every pool average + cited-source quality + analyst display.
- Quality tail-trim — abundant raw pools (>25) drop sub-40 tail sources to
  a ≥20 floor: they dragged the 50% blend term, handed the critic weak
  targets, and burned reader budget. **Provider-singleton guard**: a weak
  source that is the ONLY representative of its provider is kept — dropping
  it shrinks `providerDiversity` (a trust term) and feeds the critic a
  confirmation-bias finding. Fixed-corpus regen is exempt.
- `REQUIRED COVERAGE` block (`buildRequiredCoverageBlock`, tested): the
  deep-planner branches now reach the analyst as mandatory scope
  requirements AND the outline critics' `requiredDimensions` — the
  mono-country DA fatal was the analyst never seeing the decomposition.
- TTS candidate selection by real coverage (`outline critic` on each
  candidate, ~$0.01) instead of citation count — a verbose-but-narrow
  analysis was beating wider-coverage drafts.

Regression tests: `held-retry.test.ts` +5, `required-coverage.test.ts` +3,
`fixed-corpus.test.ts` +1 (provider-singleton). Suite: 48+ suites / 470+
tests.

---

## Sprint 32 — Full-stack reliability audit (CTO repasse before paid validation)

Offline audit of every path that turned live runs into avoidable HELD/failed
outcomes or silent spend. All defects reproduced with deterministic tests
first; no paid run was used for discovery. Suite: 44 suites / ~450 tests.

**Fail-closed Devil's Advocate** (`devils-advocate.ts`,
`debate-advocate.ts`, `style-sweep-recheck.ts`) — failed/malformed/cancelled
review lanes previously produced `verdict:'publish', publishabilityScore:100`
(empty challenges read as a clean review). Now `evaluationComplete:false` is
carried into stats, the gate's `evaluation_availability` check hard-fails, and
a failed DA blocks rather than scores 100.

**Cost accounting — three leak paths closed**
(`think-tank-dispatcher.ts`, `pipeline-v2.ts`, `inquiry-orchestrator.ts`):
- Reserve-first dispatch added `result.costUsd + pipelineCostUsd` while
  `pipelineCostUsd` already contained it → held items billed ~2×.
- `runPipelineCore`'s FATAL catch persisted stats without refreshing
  `totalCostUsd`; a thrown pipeline reached the orchestrator as `costUsd:0`.
  The catch now stamps `stats.totalCostUsd` AND attaches `error.costUsd`;
  the orchestrator banks it (and, on timeout, reads it back from the
  persisted PipelineRun row once the unwinding core has finished writing).
- Same treatment for the regen child scope (`regenFailedSpend`).

**Cancellation and identity** (`pipeline-v2.ts`, `execution-scope.ts`) —
`executionId` (== PipelineRun.id) threads end-to-end; orphan cleanup and
salvage target the exact run instead of "latest RUNNING on this question"
(could mark the wrong run FAILED or salvage a stale artifact). `withTimeout`
was replaced by `withExecutionDeadline` — the old version rejected the await
while the work kept running AND could never abort its LLM/HTTP calls.
`assertExecutionActive()` fires at init and every `phaseMark`, so an aborted
run can't continue through to persistence.

**Reader/corpus reuse on regen** (`inquiry-pipeline.ts`,
`inquiry-orchestrator.ts`, `reader-block.ts`) — `InquiryPipelineResult` now
carries `readings`; the orchestrator passes them as `priorReadings` so a
bounded regen reuses extractions instead of re-reading the whole corpus
(observed: regen died mid-reader at the 25min cap). Durable execution is
disabled inside regen — a checkpoint replay would return attempt-1's
analysis verbatim; `priorReadings` covers the expensive reuse explicitly.

**Evidence-gap honesty** (`gap-fill.ts`) — `skipRetrieval` (fixed-corpus
regen) no longer resolves `coverage_gap` signals when zero new evidence was
added; signals stay open and the gate sees the real state.

**Central-scenario normalization** (`revision-controller.ts`) — the gate
compares the persisted decision against the rendered block; renderer
citation markup (`<sup class="cite">` before punctuation → `"step ."`) and
`[E41]`-style evidence ids broke the equality check on EVERY position-first
brief → guaranteed `central_scenario` hold. `normalize()` now strips both
citation shapes plus whitespace/punctuation artifacts.

**HTTP layer** (`http-client.ts`) — 10-min GET cache + in-flight dedupe
(12× identical OpenAlex query observed per run), clone-on-store/clone-on-hit
against caller mutation, failures never cached, `cache:false` opt-out for
freshness-critical calls, and per-value 1MB ceiling so 4000×8MB worst case
can't OOM a small container.

**Timeout semantics to remember** — `withExecutionDeadline` rejects the
await via `Promise.race` while `fn()` unwinds in the background: the thrown
error is the deadline's (no `costUsd` attached) and the core's own FATAL
catch is where persisted steps land. Any code that races a pipeline must
read cost/artifact state back from the PipelineRun row, not the error.

**Salvage contract** (`inquiry-orchestrator.ts`) — `salvageTimedOutPipeline`
polls (up to 10min main / 3min regen) for a brief keyed `pipelineRunId =
executionId` AND requires the run row finished with verdict-bearing evals
before gating the persisted artifact — an unevaluated brief is never
salvaged. Regen timeout now uses the same path (observed: trust=86/quality=80
artifact discarded → wrongly persisted HELD).

Invariants re-verified by test: source order `[SRC-N]` stable across
gap-fill/persist; stale verdict evals (`evaluation_freshness.verdictStale`)
hard-block publication; evidence-bound failures never trigger regen;
adopted regen must strictly improve `attemptScore`; reserve release is
idempotent via `slotKey` and never double-bills.

---

## Sprint 31 — Evaluator-input forensics (the quality=45 root cause)

Post-mortem of the second validation run (2 HELD): the artefacts were
citation-dense (522 `[SRC-N]` on a real corpus) yet every adversarial judge
scored them near-zero. Forensic replay of persisted stats showed the failure
was **evaluator inputs**, not the analysis: the composite
`qualityScore = 50% sources + 10% critic + 25% structuralEditor + 15% DA`
collapsed because all three non-source terms were fed empty inputs.

**Critic groundedness collapse (39% on a strong corpus)** —
`lib/agent/critic-agent.ts`:
- Claim decomposition extracted `citationTag` ("[SRC-7]") but left
  `sourceIndex` null → claims skipped grounding entirely and counted as
  `unverifiable` in the denominator. `sourceIndex` is now recovered
  deterministically from the tag (zero LLM).
- Multi-cited claims (`[SRC-22][SRC-16][SRC-9]` — 138 groups observed) were
  verified against a single source. `sourceIndices[]` now verifies against
  the union of cited excerpts.
- Cross-source rescue **self-disabled** when >12 claims failed — exactly the
  mass-failure case. Now batched by 8, capped at 16, cited claims first.
- Never-cited claims poisoned the groundedness denominator AND were skipped
  by `validateCitations` (the `unverifiable` guard) — penalized but
  undiagnosed. They are now excluded from groundedness and surfaced as
  `citationIssues` (missing citations), matching `claim-grounding.ts`
  semantics.
- Critic evidence tool (`critic-block.ts`) targeted only `unsupported`
  claims — cited-but-unverifiable claims (the real evidence holes) now feed
  it too.

**Devil's Advocate judged nothing** — `buildAnalysisReviewText` cast the
analysis to `Record`; a string payload produced a review containing ONLY the
question ("substantive analysis is omitted" kill shot, `major_revision`
veto). Now: string analyses are included verbatim, JSON strings are parsed,
arrays of objects serialize via JSON (was `"[object Object]"`), multipass
substance fields are pushed (frictionMap.mechanisms/collisions/
dataLandscape, quantitativeFindings, activeDynamics,
projectionsInLiterature), and an unrecognized object shape falls back to
full serialization — a reviewer can never again see a question-only bundle.

**Structural editor scored an empty inventory** — `buildSectionInventory`
expected legacy fields (`summary`/`consensus`/`implications`); the multipass
analyst emits `throughLine`/`verdict`/`causalChain`/`keyFindings`/
`frictionMap` → near-empty inventory → `narrativeArcValid:false`,
overallStructure ~25-35 on both HELD items. The inventory now covers the
multipass schema (exported for testing).

**Self-correction actuation** — `post-analyst-checks.ts`: the analyst
checkpoint detected citation spread 29% < 35% (11/38 sources) but only
logged `shouldRetry`. A deterministic trigger now fires: spread <35% forces
one budgeted `analystMultipass` retry (`reAnalysisBudget`,
`selfCorrectRetries < 2`) with an explicit "cite ≥N distinct [SRC-N]"
correction block; the retry is adopted only if measured spread strictly
improves. This prevents the observed failure mode where the quality loop
later injected 269 post-hoc citations to compensate.

**Citation backfill scope** — `citation-repair.ts` scanned only top-level
string fields; multipass substance (`frictionMap`, `causalChain`,
`keyFindings`, `dataLandscape`…) is now serialized and scanned too.
Injection stays restore-only: it matches analyst-authored sentence snippets
in the HTML — never fabricates claim↔source associations.

**Publication = certainty, not cadence** — the dispatcher's weekly slots were
already a ceiling, but two orchestrator paths published pieces the gate had
flagged: trust 55-64 "moderate zone" (P2b) and gate=`revise` + trust≥55
(P5b), both at quality≥40. Publishing now requires a clean `publish` verdict
OR `revise` with trust ≥ min+5 (`inquiry-orchestrator.ts`); everything else
falls to held/draft. `NOMOSX_ALLOW_MODERATE_PUBLISH=1` restores the legacy
moderate-zone publishes.

**Corpus viability pre-gate** (`pipeline-v2.ts`, `stats.viability`) — before
the analyst runs (~$0.10/call + downstream), a deterministic check counts
substantive reader extractions (claims/results/methods) and extractable-text
coverage. Below `VIABILITY_MIN_READINGS` (8 brief / 15 strategic) or
`VIABILITY_MIN_TEXT_COVERAGE` (0.25) → structured refusal
(`corpus_insufficient`), PipelineRun FAILED, dispatcher falls through to the
next candidate. Both S30 HELD items paid the analyst on corpora this check
would have condemned.

Tests: `analysis-review-text.test.ts` +8 (string/JSON/multipass/empty-shape,
legacy+multipass inventory, non-trivial inventory on real payload shape).
Verified: `tsc` 0 · jest 20/20 suites — 183 tests.

---

## Sprint 30 — Spend discipline + Temporal Cloud orchestration

Post-mortem of a live $3.91 / 2-HELD breaking run: 45% of LLM spend was
`analyst_brief` (30K tok/call), ~$0.27-0.60 per terminal item was spent on the
editorial tail AFTER an unrecoverable verdict, and both candidates burned
concurrently for a single target slot.

**Terminal-reject early exit** (`pipeline-v2.ts`): critic `verdict='reject'` +
`overallScore < 20` is unrecoverable — critic repair only fires on `'repair'`
verdicts and regen is decided in the orchestrator. The pipeline now renders once
(admin-facing HELD artifact) then goes straight to persistence, skipping
post-critic enrichment, debate, arbiter/foresight, DA, style sweep, quality
loop and hero image. Marked in `stats.terminalReject`.

**Sequential spare dispatch** (`think-tank-dispatcher.ts`): default
`THINK_TANK_DISPATCH_CONCURRENCY` is now `1` — a spare candidate pays only when
the head item failed (in-flight work is never cancelled, so every concurrent
launch was guaranteed spend even on success). `=2..3` restores PASTE pipelining
for speed-over-spend runs.

**Depth-scaled analyst context** (`analyst-multipass.ts`): reader extractions
now render for EVERY grounded source — a compact-tier source flagged GROUNDED
whose extractions were hidden was manufacturing misattribution. Raw bulk is
depth-scaled (brief: abstract 1500/excerpt 2500 chars, full-tier floor 10;
strategic unchanged: 3000/4000, floor 20) → ~40% smaller analyst prompts at
brief depth with MORE grounded sources carrying their actual evidence.

**OpenAlex auth fallback** (`providers/openalex.ts`): a rejected `OPENALEX_API_KEY`
returns 401/403, not 429 — the polite-pool fallback only watched 429, so every
call (plus ~30 piggybacking institutional providers) died for the session.
Auth rejections now flip to `mailto` for the session and retry once after the
concurrency slot is released (retry-in-catch could deadlock a 5-slot auth
failure wave).

**Temporal Cloud** (`lib/temporal/`, `scripts/temporal-worker.ts`): opt-in
orchestration for think-tank cycles. `enqueueThinkTankCycle` prefers a Temporal
workflow (workflowId = idempotency key, `USE_EXISTING` conflict policy — a
reuse policy is rejected by the server when combined with it) and falls back to
the PG Job row on any start failure. The Railway `pipeline-worker` polls the
`nomosx-pipeline` task queue **in-process** when `TEMPORAL_ENABLED=1` — one
service, both queues. API-key auth = `tls:true` + top-level `apiKey` (namespace-
scoped keys; account-scoped keys fail JWT verification). Heartbeats carry the
`ThinkTankCycleProgress` checkpoint into activity retry → same resume
semantics as the PG worker. Validated live: dry-run cycle end-to-end.

Env: `TEMPORAL_ENABLED=1`, `TEMPORAL_ADDRESS=<ns>.tmprl.cloud:7233`,
`TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY` (or `TEMPORAL_TLS_CERT`/`_KEY`),
`TEMPORAL_TASK_QUEUE` (default `nomosx-pipeline`).

Verified: `tsc` 0 · jest 5/5 reserve-dispatch · live Temporal dry-run.

---

## Sprint 29 — Validated publication reserve

Decouples production from cadence. Previously each dispatch slot ran a pipeline
that either published or died with it (HELD = wasted slot). Now a validated
artifact lands in the **reserve** (`status='READY'`, `publishedAt=null`,
`publicId=null`) carrying a `ReserveCertificate` in `criticalLoopResult.reserve`
— artifact hash (canonical JSON, sha256), gate input, 6h expiry, publicId +
briefId identity.

**`lib/agent/publication-reserve.ts`** — `certifyForReserve` re-runs the full
gate + readiness on the evaluated artifact (revised html included — the
certificate binds `gateInput.html`, so `html === pipeline.html` reference checks
are wrong); throws if anything fails. `releaseReservedPublication` runs in a
serializable tx: idempotent by `slotKey`, revalidates the certificate, checks
source-version stability (`source.updatedAt > validatedAt` → skip), 7-day
title/publicId/briefId duplicate guard, atomic `READY→PUBLISHED` claim with an
optimistic lock on `status+updatedAt`, brief+signal updated in the same tx.

**Dispatcher slot flow** (`think-tank-dispatcher.ts`, `executeDispatchQueue` —
exported for tests):

```
0. topic-matched release (question filter) → publish for $0, no attempt spent
1. pipeline with delivery:'reserve' → certify → READY
2. immediate release of that artifact (publicationId-forced, still matched)
3. on held/failed — cross-topic drain (question='') fills the slot from ANY
   fresh validated stock; the item's signal stays OPEN
```

`slotKey = slot:<signalId|sha1(question)>` — stable across worker reclaims; a
retry sees `skipped_duplicate`, never double-publishes. Signal resolution rule:
`item.signalId` marked PUBLISHED only when the artifact carries its signalId
or the release was topic-matched. Pipeline spend is banked before the release
result replaces `result` — a $0 release never hides production cost.

`publicPublicationWhere` requires `status:'PUBLISHED'` + `publishedAt` — READY
artifacts never leak to public surfaces.

Tests: `publication-reserve.test.ts` +5 (certify/validate/tamper/expiry/key-
order), `reserve-dispatch.test.ts` +5 (matched fill, produce→release, cross-
topic drain signal semantics, empty-reserve hold, reclaim idempotency).

---

## Desk Identity Unification (post-S28)

All expert agents now carry a single canonical NomosX identity — the Greek canon names — replacing the previous drift of three parallel naming systems.

- **Single source of truth**: `lib/researchers.ts` — `RESEARCHERS` (22 Council identities: Dr. Oikonomia, Dr. Nomos, Dr. Aegis, Dr. Gaia…) + `SUB_LENS_IDENTITIES` (52 sub-discipline desks: Dr. Demos, Dr. Psyche, Dr. Ares, Dr. Mellon…) + `getDeskName(domain)` resolver (Council → sub-lens → domain fallback).
- **Unified consumers**: `EXPERT_PERSONAS` (phd-researcher.ts), `DOMAIN_EXPERTS` (domain-expert.ts), `RESEARCHER_REGISTRY` (researcher-ownership.ts), `RESEARCHER_KBS` (researcher-kb) all carry the canonical names. `expertName` propagates them into council/review-board reports.
- **Fabricated credentials removed**: no more invented humans ("Dr. Elena Vasquez") or real-institution claims (MIT, Harvard, RAND, WHO). `institution` is now `"NomosX Institute"` everywhere; fake `hIndex`/`publications`/`citationCount` metrics dropped from `RESEARCHERS`. Persona prompts open with `You are <desk name>, the <specialty> desk of NomosX — an autonomous research institute.` and keep their analytical framework/calibration sections unchanged.
- **Public surface unchanged**: briefs still expose reasoning lenses (casting-agent, reasoning-lenses), not personas — the identity layer is for internal memory continuity + future council/track-record surfaces.
- Migration script (one-off, kept for audit): `scripts/unify-desks.cjs`.

Verified: `tsc` 0 errors · jest 25/25 — 284 tests.

---

## Sprint 28 - Reliability Core: durable execution + artifact versioning + dead-code purge

Addresses the root cause of the S27 live-run bugs (stale evaluator verdicts consumed after artifact mutation) and the 50min-crash-loses-everything failure mode. No new features — reliability of what exists.

### P0/1 — Artifact versioning (`pipeline-v2.ts`)

**The bug class**: `analysis` and `html` are mutable artifacts crossing ~30 stages. An evaluator (critic, DA, grounding) judges version N; a later stage mutates the artifact; the gate still consumes the stale verdict → false vetoes or false approvals. Fixed structurally, not per-site:

- `analysisArtifactVersion` — incremented only at **substantive content replacement** (MoA aggregate, ReAct result, classic analyst, TTS candidate pick, self-correction, orchestrator re-analysis, gap-fill re-analysis, critic repair). NOT incremented for additive enrichment (`foresight.centralScenario`, `scenarios`, Monte-Carlo metadata).
- `htmlArtifactVersion` — incremented only at **material rewrite adoption** (citation repair, fact-check repair, claim grounding removal, re-grounding, citation filter, think-tank pack, revision editor, aggressive quality-loop repair, loop grounding). NOT incremented for additive injections (`injectQuantSection`, methodology note, DA section, evidence-id reapply) or cosmetic prose fixes.
- `tagEval(artifact, result)` — every evaluator result stored in `stats.*` carries `{ evaluatedArtifact, evaluatedArtifactVersion }`.
- `collectStaleEvaluations()` — central collector; marks `.stale=true` on any evaluation whose tagged version ≠ current artifact version. Called inside the quality-loop veto-parity block (so a post-repair loop can't inflate trust on pre-repair verdicts) and once before stats persistence → `stats.evaluationFreshness = { analysisVersion, htmlVersion, stale[] }`.
- Gate check `evaluation_freshness` — stale verdict-bearing evaluations block publication (hard check). Vetoes skip `.stale` results.

### P0/2 — Durable execution cabled (`durable-execution.ts`, `pipeline-v2.ts`)

`runDurableStep` existed but was never wired; also had two latent bugs: state keyed on `pipelineRun.id` (new per attempt → **never a real resume**) and `DURABLE_INIT` replay resetting `completed` → `running` (stale checkpoints reused across runs). Fixed:

- `durableKeyFor(query)` — stable key = sha1(query) + format; resume works across process restarts.
- INIT records start a new generation: `loadDurableState` resets steps on INIT; `initDurableRun` writes INIT only when no fresh `running` state exists (otherwise it IS a resume).
- Payloads >512KB (e.g. `readings` full-text ~15-20MB) spill to `os.tmpdir()/nomosx-durable/` — `agentAuditLog.metadata` stays small; files cleaned on `markDurableComplete`.
- Steps wired at value boundaries: `scout` (allSourceIds → skipScout seedIds path on resume), `reader` (`readerAgentV3`), `analyst` (ReAct + both multipass paths; **not** re-analysis calls — gap-fill/repair must recompute), `render` (`renderEditorHtml`).
- Default ON for `isStrategic || memo || dossier` (`opts.useDurableExecution` to override).

### P0/3 — Dead-code purge (113 files)

`find-orphans.cjs` (repo root) — static import-graph scan: no importer anywhere in `src/lib/app/components/scripts/tests` → orphan. Iterated against false positives: extension-aware regex, test files as importers, root entry points, barrel exports, dynamic-import check (none found), provider-label strings excluded.

Deleted: `lib/providers/extended-registry.mjs` (dead parallel registry — `registry-bridge.ts` is the live dispatch imported by pipeline-v2) + its 76-file provider subtree (all `*-provider.{js,mjs}` duplicates), 22 `lib/agent` stubs never wired (omega-verification, vmmao-orchestrator, phd-deliberation, triangular-judge…), orphaned UI components, `portable-server.js`, `domain-documents.ts`, `quota.ts`, `linkup-*` duplicates. All via `git rm` — recoverable. Post-purge rescan: 0 orphans in `lib/`/`components/`.

### P1/4 — Run-regression harness (`scripts/eval-runs.ts`)

`eval-golden.ts` re-scores stored HTML; `eval-runs.ts` replays persisted **stats** from the last N publications — deterministic, free, no LLM:

- Metrics: publishRate, meanTrust, meanCostUsd, meanDurationMin, **costPerPublished** (the real KPI — a $0.68 run with 0 pubs = ∞), staleEvalRuns, veto distribution.
- Regressions vs `evals/runs-baseline.json`: publishRate −10pts, meanTrust −5, any `stalePublished`>0 — a PUBLISHED piece carrying a stale verdict eval (`verdictStale` ∩ PUBLISHED; non-verdict stale detections are reported as `staleEvalRuns` but never gate-bearing, so they are transparency, not regression), cost/duration +50%.
- `npm run eval:runs [--limit=N]` / `eval:runs:update`. Results → `evals/results/runs-latest.json`.
- `npm run eval:steps [-- --limit=N]` — per-step marginal-value cohort report (`scripts/analyze-step-value.ts`): for every flag-gated step, fires vs outcomes (publishRate/trust/cost), `DELETE?`/`REVIEW` recommendations per the P1/5 rule. First 34-run readout: `prm`, `peerReview`, `thinkTankPack`, `ragas` never fired → deletion candidates; `witness` fires but produces no interventions; `moa` dead spend already fixed (opt-in).

### P1/5 — A/B flag protocol (marginal value of steps)

Every `useX` flag in `PipelineCoreOptions` is an A/B lever. Measurement protocol — **no paid runs needed**: replay on stored artifacts via `eval:golden` (quality metrics) + `eval:runs` (cost/latency/veto stats already persisted per step in `stats.*`).

| Flag | Default | What it gates | Marginal-value check |
|---|---|---|---|
| `useMixtureOfAgents` | auto (complex/strategic) | MoA analyst path | golden panelScore delta vs multipass |
| `useWorldModel` | auto (temporal queries) | WorldEvolver enrichment | foresight stats presence + panel |
| ~~useLATS/useAgenticAnalyst~~ | — | **supprimés (P1/6)** | zéro caller, zéro run prod |
| `usePRM` / `useSelfPlay` / `useSelfEvolution` | strategic+budget>$3 | step scorer / adversary / prompt evolution | runs cost delta vs publishRate |
| `useWitness` | strategic+budget>$2 | witness attestations | stats.witness presence |
| `useAgenticAnalyst` | off | ReAct analyst loop | opt-in; compare vs multipass |
| `useThinkTankPack` | off | think-tank augmentation pack | htmlVersion bump + panel |
| `usePeerReview` | off | peer-review eval | stats.peerReview |
| `useOutputGuard/LocalJudge/Storm/TemporalMemory/RagasEval` | off | opt-in stubs | enable only with a golden-set metric to move |
| `useDurableExecution` | on (strategic/memo/dossier) | checkpointing | reliability, not quality |

**Rule going forward**: a flag-enabled step that can't move a `eval:golden` or `eval:runs` metric on replays is a deletion candidate, not a keep.

### P2/7/P2/8 — Prediction watch + persistent signal bus

The forecast loop is closed. Predictions were write-only memory; now the radar compares each cycle's topics against OPEN predictions' `whatWouldFalsify`/`resolutionCriteria` triggers.

- `lib/agent/prediction-watch.ts` — deterministic trigger matching (distinctive-token overlap, threshold 0.40, zero LLM). A fired trigger creates a `PREDICTION_TRIGGER` Signal (priority 82 ≥ the 70 bar, deduped via `[PRED:<id>]` marker — a prediction fires once) and returns a dispatch item the dispatcher converts to an `UPDATE_NOTE` (`selectFormatFromSignal` → `publicationTypeToDepth` = surface).
- Wired in `collectBreakingItems` post-radar — trigger items precede triaged items in the dispatch queue.
- `PersistentSignalBus` in `signals.ts` — subclass persisting sync snapshots to `agentAuditLog` (same store as durable-execution, zero schema change). `rehydrateSignalBus(key)` restores open signals at cycle start. Two live consumers:
  - `prediction-watch` posts `dossier_watch` signals per fired dossier (14-day decay) — dossiers under active watch get a small priority boost on subsequent firings.
  - `pipeline-v2` swaps `ctx.signals` for a persistent bus keyed by `durableKey` when durable execution is on — coordination state survives a crash and rehydrates on resume, complementing step checkpoints.

### P1/6 — Analyst fork eliminated

`analystReAct` (`analyst-react.ts` + `lats/` subtree + `react-loop.ts` + `self-discover.ts`) deleted — gated behind `useAgenticAnalyst` which **no caller ever enabled** (verified: zero references outside pipeline-v2, zero production runs). Multipass is now the single analyst path. Dead flags removed with it: `useAgenticAnalyst`, `useLATS`, `useAdaptiveRAG`, `useSelfDiscover`, `useBudgetForcing`, `useMCP`, `bestOfN`, `useMetaController`, `useLangfuse`, `useADAS` (the last three were declared but consumed nowhere). Live flags remaining: `useMixtureOfAgents`, `useWorldModel`, `usePRM`, `useSelfPlay`, `useWitness`, `useOutputGuard`, `useLocalJudge`, `useStorm`, `useTemporalMemory`, `useThinkTankPack`, `usePeerReview`, `useRagasEval`, `useSelfEvolution`, `useDurableExecution`.

Verified: `tsc` 0 errors · jest 24/24 suites — 278 tests · `next build` OK (74 routes) · orphan rescan clean.

### Sprint 28b — Provider resilience (live-run findings)

The validation run exposed the real bottleneck: all paid LLM providers suspended mid-run (GLM credit exhaustion → OpenAI 429 → …) → 0 alive → the pipeline still burned paid retrieval on a doomed candidate, and memo/dossier durable execution never activated (`opts.format` was never propagated to `runPipelineCore`).

- **`format` propagation fixed** — `PipelineCoreOptions.format` typed + forwarded by `runPipeline()`; durable execution now truly ON for memo/dossier.
- **`freepool` provider** (`unified-llm.ts`) — a 7th LLM family acting as free-tier last resort. Internally cascades Groq → Cerebras → NVIDIA NIM → OpenRouter `:free` → Mistral (all OpenAI-compatible). Dormant without keys (`GROQ_API_KEY`/`CEREBRAS_API_KEY`/`NVIDIA_API_KEY`/`OPENROUTER_API_KEY`/`MISTRAL_API_KEY`), appended LAST in every `CROSS_FAMILY_FALLBACK` chain, $0 cost, per-endpoint free-tier context ceilings honored (Cerebras 8K skip). Capabilities: `structured_output`, `tool_calling`.
- **Pre-flight hard abort** — `alive === 0` now throws `PreflightAbortError` (escapes the non-blocking catch) BEFORE the scout burns paid search calls. `alive === 1` downgraded to a DEGRADED warning — a single freepool endpoint can still complete a run.
- `eval:runs` metric fixed: `stalePublished` (PUBLISHED/CORRECTED/RETRACTED carrying a stale **verdict** eval) is the regression; `staleDetected` on held pieces is transparency.

Tests: `__tests__/lib/llm/freepool.test.ts` +6 (dormancy, activation, cascade order, context-skip, $0 cost, exhaustion). Verified: `tsc` 0 · jest 25/25 suites — 284 tests.

### Sprint 28c — pipeline-steps extraction + parallel evaluators

Started decomposing the `pipeline-v2.ts` god-file using a shared-context contract — the pattern for all future extractions:

- **`lib/agent/pipeline-steps/`** — each step is a module taking a typed context (`TailStepContext` in `types.ts` for post-render steps, `RenderEditorContext` for render). The orchestrator builds the context once; steps mutate it in place (`ctx.html`, `ctx.stats`, `ctx.orchState`) and the caller reads back what it owns. No return-soup.
- Extracted: `quality-loop.ts`, `self-correct-checkpoint.ts`, `hero-image-step.ts` (post-render tail), `post-hoc-injection.ts` (evidence tiers / adversarial transparency / multi-lens convergence), `render-editor.ts` (EDITOR closure + `mapProspectiveToRenderFormat`; legacy `renderBriefHTML` stays exported in pipeline-v2 and is injected via `renderBriefFallback` — no circular import), `style-sweep-recheck.ts` (style gates → copy editor → numerical gate → signal sweep → DA re-check — kept as ONE step because the coupling is the semantics: gates post the signals the sweep drains, the sweep mutates html, the DA re-check re-judges the corrected artifact; splitting would re-open the stale-evaluator window), `debate-advocate.ts` (debate+DA closures → functions; flags passed as call-time snapshots, debate outcome returned), `citation-grounding.ts` (repair → NLI grounding → re-grounding → quant → filter), `verification-block.ts` (symbolic → NLI verifier → active repair → LLM deep-check → fact-checker), `evaluators-trust.ts` (6 parallel evaluators + full deterministic trust scoring + methodology/abstention injection). pipeline-v2: 8 614 → ~7 000 lignes.
- **Parallelization rules verified before each barrier**: no shared mutable artifact, distinct stats keys, consumers stay after the allSettled barrier. Applied to: the 6 post-render evaluators; the 6 post-`brief.create` writes (predictions, causal links, KG, gaps, episodic memory, prediction tracker); the 5 flag-gated learning writes (witness.finalize, worldModel, PRM retrain, RAGAS, selfEvolution — MOA stays after the barrier since it reads `stats.witness`); DA ∥ editor render on the V2 path (render never reads `stats.devilsAdvocate`).
- **Extraction rules**: (1) copy block verbatim, prefix closure vars with the context object; (2) keep `await import()` lazy-loading and non-blocking try/catch semantics; (3) artifact versioning calls (`bumpHtmlArtifact`, `tagEval`, `collectStaleEvaluations`) pass through as context functions — a step NEVER defines its own; (4) one extraction = one commit, `tsc`+jest green between each.
- **Parallel evaluators**: the six post-render readers (originality, bias, sourcecheck, url-health, evidence-bank, process-audit) run via `Promise.allSettled` — pure readers of post-repair html, distinct stats keys. The trust calc consumes all their outputs and stays after the barrier. Saves the wall-time of the two IO-bound checks (~30-60s/run).
- Residual purge: `budget-forcing`, `tool-registry`, `mcp/` subtree, `fresco-field` (orphaned by the analyst-fork removal).
- **Upstream decomposition (S28c continued)**: the scout→analyst region is extracted too — `scout-block.ts` (deep planner + speculative reformulations + RE_SCOUT + durable-resume `scoutCkptRestored`), `classification-gates.ts` (topic classify → foundational injection → complexity/LAS gates → gap filler → casting; routing flags flow in/out), `reader-block.ts` (reader V3 ∥ quant ∥ quant-bridge → evidence bank → DEEPEN → hypothesis judge → DPP → adaptive RAG → round-table), `analyst-context.ts` (full prompt context assembly incl. CANA/SCATTER + positioning + SARA), `analyst-run.ts` (opt-in MoA → durable multipass → test-time scaling), `post-analyst-checks.ts` (guardrails/judge/witness/self-play/PRM/checkpoints/consistency/Reflexion retry), `gap-fill.ts` (RE_ANALYZE + gap-aware append + shared `GapFillState` `processGapRequests` consumed by both analyst and critic), `arbiter-foresight.ts`, `persistence-tail.ts`, `scout-enrichment-index.ts`, `rank-enrichment.ts`, `critic-block.ts`, `pre-critic-gates.ts`, `post-critic-enrichment.ts`, `post-render-extras.ts`. pipeline-v2: 8 614 → ~3 550 lignes.
- **Shared-state contract for cross-step mutation**: when a step's output can be re-analyzed by a later gap-fill (analysis, allSourceIds, reAnalysisBudget), a `GapFillState` object is the single source of truth — steps read/write `state.*` and the caller syncs its locals after each call. Passing values + a mutating closure is the bug the critic extraction briefly introduced (stale local clobbered the gap-fill re-analysis).
- **Dead MoA spend removed**: `useMixtureOfAgents` auto-fired on complex/strategic runs but the unconditional multipass call overwrote its analysis — dead spend on every strategic run since the fork existed. Now opt-in only (`opts.useMixtureOfAgents === true`), and the restored `!analysis` guard means an opted-in MoA result is actually adopted.
- **Decomposition complete (S28c final)**: `provider-lists.ts` (Providers union + all name lists — source of truth, re-exported), `scout-impl.ts` (deadline-bounded provider fan-out + circuit-breaker tracking), `public-ops.ts` (scout/index/rank/read/analyst thin wrappers, citationGuard, dedupeCitations, legacy renderBriefHTML, lineage tracker, cache helpers, `activeRuns` idempotency registry — all re-exported for compat), `pipeline-init.ts` (~480 lines of setup: flags, pre-flight, conductor, durable init, memory injections, blackboard+mission, idempotency, tier flags, addCost budget guard, provider selection). Mutable flow state returns via `flags`/`cost`/`selfCorrect` holders — the addCost budget-guard closure and the body write the SAME fields. pipeline-v2: 8 614 → ~1 220 lignes; `runPipelineCore` is pure orchestration.

Verified: `tsc` 0 · jest 25/25 — 284 tests · eval:runs no regression (publishRate 62%, trust 67.6, $0.77/published, stalePublished=0).

---

## Sprint 27 - Bounded Escalation: revision → regeneration → candidate fallback

The "agents keep working until the publication reaches the bar" requirement, implemented with the safeguards the agentic-loop literature mandates (optimal stopping, stagnation detection, anti-Goodhart). The funnel absorbs failure at the TOP (candidate pool), never by relaxing the gate.

**Escalation ladder per candidate:**

1. **Revision round** (Sprint 25): gate failures → signals → resolvers → re-gate.
2. **Regeneration round** (once, bounded): if the gate still fails on *substance*, `runInquiryPipeline` re-runs on the **same corpus** (`seedSourceIds` from attempt 1 skip the scout — a rewrite, not a re-search) with `pipelineOptions.priorFailureFeedback` — gate reasons + DA kill shot + top challenges + panel must-fix findings serialized by `buildFailureFeedback` and injected into the analyst context block post-SARA (never compressed away) as mandatory corrections. The regenerated artifact is adopted **only if `attemptScore` strictly improves** (gate rank > passed-checks > trust+quality) — a worse or equal rewrite is discarded (`stats.regeneration.adopted=false`, audit trail).
3. **Candidate fallback** (dispatcher): the cycle targets `maxExecutions` *publications*, not attempts. Preflight now validates up to `2× target` spare candidates; a held/failed item consumes an attempt slot (`maxAttempts = 2× target`) but NOT a publication slot — the loop falls through to the next pre-validated radar candidate.

**Refusal conditions (`shouldRegenerate`)** — a rewrite cannot fix these, so no attempt is wasted:
- `source_depth` failed → evidence-bound, topic replaced not rewritten
- `trust_score < 40` → corpus cannot support the claims
- pipeline refusal, budget-constrained, or elapsed >45min (dispatch-window guard)

**Hard bounds:** 1 revision round + 1 regeneration per candidate, 2× attempts per cycle target, per-item 90min timeout, cumulative + global budget gates unchanged. The gate is never weakened under iteration pressure — every published artifact passed the identical checks.

Tests: `revision-controller.test.ts` +9 (regen decision matrix, monotone witness, feedback serialization). Verified: `tsc` 0 · jest 22/22 suites — 260 tests.

**Live-run finding (S27 validation)**: both candidates ended HELD on `trust=40` — DA veto `major_revision` at strength 18 capped trust BEFORE the signal sweep, and the sweep's resolved `substance_weak` objections never lifted the cap. REGEN was correctly skipped by the 45min dispatch-headroom guard both times (pipelines take ~50-58min). Fix: **DA re-check post-sweep** in pipeline-v2 — when `devilsAdvocateVeto` is set and the sweep resolved ≥1 substance signal, `runDevilsAdvocate` re-runs once on the corrected HTML (~$0.02). If the new verdict is no longer veto-worthy (`reject`, or `major_revision` with strength <20), the veto is lifted and `stats.devilsAdvocate` is replaced — the quality loop's trust recompute then reflects the corrected artifact. Audit trail in `stats.devilsAdvocateRecheck`. A still-fragile analysis keeps its cap — the re-check never relaxes the standard, it re-evaluates it.

**Live-run finding (S27 second validation)**: run 2 exposed two more stale-evaluator paths, both fixed:

1. **DA `reject` verdicts bypassed the re-check** — `devilsAdvocateVeto` is only set on `major_revision` (<20), but a `reject` verdict (0/100) fails the gate's `devils_advocate` check (`publishability ≥ 40`) the same way. The trigger is now `daGateFailing` = veto OR `verdict === 'reject'` OR `publishabilityScore < 40`, and `stats.devilsAdvocate` is replaced with the fresh verdict unconditionally — the gate must judge the adopted artifact, not the discarded one (the DA report is not rendered in HTML, so no stale display).
2. **Memo pipeline timeout killed a productive run** — candidate 2 (petrostates) died at exactly 3900s mid critic-repair: `standard` depth → `memo` format inherited the 65min default while running the same heavy machinery as `deep` (Sprint 19 had already raised deep to 80min for this exact defect). `standard` now passes `timeoutMs: 4_800_000`, and `DISPATCH_TIMEOUT_MS` rose 90→100min to preserve the `dispatch > pipeline` invariant (dispatch race must never kill a run before its own cap).
3. Same run: **critic + panel re-check post-repair** — when `CRITIC REPAIR`/`GapFillReAnalysis` adopts a re-analysis, `stats.critic` and `stats.criticPanel` are re-evaluated against it (was: verdict of the discarded text punished the corrected one). Not triggered when the monotone witness rejects the re-analysis — the original verdict remains the valid description.

**Quality-by-default (upstream/midstream/downstream fixes)** — the recurring `critic score ≤8` pattern had a structural cause: the critic graded a *prospective* note with an *encyclopedic* rubric:

- **Epistemic claim kinds** (critic-agent): decomposition now tags each claim `fact | inference | projection`. Facts still need literal source support; inferences/projections are graded on **derivability** — verdict `derived` = the cited source contains the evidentiary premise (it need not state the conclusion, since the conclusion is the product). `derived` counts as grounded. An inference with no premise in the corpus still fails — the bar moved to the *correct* position, not a lower one.
- **Cross-temporal contradiction exclusion**: "X declines today" vs "X dominates by 2040" is a trajectory, not a contradiction — the detector now only flags conflicts within the same temporal scope.
- **Genre-calibrated bias detection**: a position paper taking a stance is the product, not confirmation bias — flag only ignored counterevidence or source selection skew.
- **Claim-binding preflight** (pipeline-v2, deterministic, $0): each causalChain link's key terms are checked against its cited source's text — a link whose claim shares <15% terms with the source is citation laundering (tag attached to a non-supporting source). Weak bindings → `stats.claimBinding` + `claim_unverifiable` signals for the repair machinery.
- **Rubric injection** (analyst pass 3): the critic's exact grading standard is appended to the analyst prompt — write-to-the-bar instead of discover-the-bar.

---

## Sprint 26 - Collective Intelligence Substrate (signals + mission)

Deep search 2026 (SBP stigmergic blackboard, G²CP graph-grounded comms, ACE evolving playbooks, AgentNet NeurIPS'25, Lattice learned routing) → the missing layer was not another agent but the **coordination substrate**: agents had detectors and hardcoded repair paths, but no shared goal and no general-purpose need/resolution medium.

**`lib/agent/signals.ts` — SignalBus** (stigmergic, SBP-style):
- `post(type, content, {intensity, ttlMs, payload})` — any agent emits a typed need without knowing who resolves it
- Signals carry **intensity** (0-1) and **decay** (linear to 0 at `ttlMs` → status `expired`) — stale needs can't cause retry storms
- `registerResolver(type, fn, {batch})` — per-signal or batch (one LLM call resolves N signals of a type)
- `sweep({mission, metrics, maxResolutions})` — drains open signals at checkpoints, ordered by effectiveIntensity **+ 0.3 boost when the signal serves an unmet mission target** (goal-directed, not FIFO)
- `resolveSignalsByType` — legacy consumers (gap-fill) close their signals after handling

**Mission** (`ctx.setMission` at pipeline start): the single shared goal — `trust≥65, groundedness≥80, citationCoverage≥0.5, minSources, requireCentralScenario, quality≥60`. `missionDelta(metrics)` computes unmet targets → the sweep's priority boost. Every agent can now read "what does the collective still need?"

**Emitters wired**: `requestSourceGap`→`coverage_gap` (back-compat: legacy queue still drives gap-fill, which now closes the signals), DA challenges→`substance_weak` (severity→intensity), style gates→`style_violation`, grounding leftovers→`claim_unverifiable`.

**Post-render SIGNAL SWEEP** (pipeline-v2, pre-quality-loop): `substance_weak` batch resolver → revision-editor surgical edits on DA objections in the final HTML *before the gate sees them*. Bounded: maxResolutions 3, budget-gated.

**revision-controller refactored to be signal-native**: gate failures → posted as signals (`scenario_invalid`, `citation_gap`, `substance_weak`, `style_violation`) → resolvers → sweep → integrity guards. Same repairs, but now **a new failure mode needs only a resolver registration, never a pipeline change**.

Tests: `signal-bus.test.ts` (6 — intensity ordering, ttl decay/expire, batch resolution, mission boost, no-resolver safety, resolver-failure isolation). Verified: `tsc` 0 · jest 22/22 suites — 251 tests.

---

## Sprint 25 - Gate-Driven Self-Revision (the funnel becomes a loop)

The publication gate used to be terminal: `revise`/`hold` persisted the artifact as-is. Now `inquiry-orchestrator` routes gate failures back to corrective agents via `revision-controller.ts` — one bounded revision round between gate evaluation and status decision, then gate + readiness are **re-evaluated** on the revised artifact. The gate is never weakened; the artifact is fixed.

Repair ladder (ordered cheapest → most expensive):

| Stage | Trigger | Repair | Cost |
|---|---|---|---|
| R0 | `central_scenario` check fails | Deterministic re-render of the block from the persisted `CentralScenarioDecision` via exported `renderCentralScenarioBlock` (same markup as the renderer — labels recovered from the existing block for locale fidelity, French detection fallback). Block missing entirely → inserted before verdict/`</article>`. Guard: re-parses complete AND normalizes equal to the decision, else reverted. | $0 |
| R1 | `citation_coverage` fails | `repairCitations` backfill — kept only if citation count grew | $0 |
| R2 | DA publishability <50 / fatal challenges / weak panel findings / quality <65 | `revision-editor.ts` — surgical `{find,replace}` edits addressing adversarial objections (qualify overclaims, add caveats, name counter-arguments). Same `applySurgicalEdits` contract as copy-editor (verbatim find, no tags, citation-preserving). Max 8 edits. | ~$0.005 |
| R3 | residual style-gate violations | copy editor re-run | ~$0.005 |

Integrity guards: citation count non-regressing, word count ≥80% of original, central-scenario block still parses complete — any failure reverts ALL repairs. LLM stages skipped when `stats.budgetConstrained`. Round persisted to `criticalLoopResult.revision` (actions, cost, gateBefore→gateAfter).

Non-repairable at render level (stays held — honest): `source_depth`, `researcher_signoff`, `trust_score` floors. Those need re-scout/re-analysis, i.e. a new pipeline run — not a cosmetic pass.

Tests: `revision-controller.test.ts` (5 — gutted-block repair, FR label preservation, missing-block insertion, non-repairable no-op, pass-through). Verified: `tsc` 0 · jest 21/21 suites — 245 tests.

---

## Sprint 24 - Editorial-Artifact Protection (grounding removal safety)

**Bug found via live HELD publication**: `groundClaimsWithNLI(mode:'remove')` deleted sentences inside the `central-scenario` block — the horizon (`data-no-cite` editorial element) and the uncited scenario-probability tail (Delphi outputs, inherently non-citable) were stripped, leaving an orphan `<p>` and a rationale that diverged from the persisted `CentralScenarioDecision` → `central_scenario` hard-fail at the gate despite trust 78 / groundedness 100%.

Three-layer fix in `claim-grounding.ts`:

1. **Extraction**: `data-no-cite` elements are stripped from the sentence stream before claim decomposition — model estimates/scenario metadata are the institute's own apparatus, not source-groundable claims (enforces the documented Invariant-6 contract).
2. **Removal**: `<section class="nx-block central-scenario">` is masked alongside style/script/head — the gate requires the scenario to render verbatim from the persisted decision, so sentence-level removal inside it can only break the gate.
3. **Span guard**: removal skips any sentence span containing `data-no-cite` (belt-and-suspenders for inline marks outside masked sections).

`repairHtmlWithGrounding` is now exported for tests. Regression: `__tests__/lib/agent/central-scenario-grounding.test.ts` — asserts the block survives removal while outside-block unsupported claims still get removed, and the protected block re-parses to a complete scenario matching the persisted decision.

Verified: `tsc` 0 · jest 20/20 suites — 240 tests.

---

## Sprint 22 - Resilience & Deep-Research Layer (2026-09)

Targets the measured weak points: SAFE dead when paid search exhausted, editorial 5/10, dependence on paid providers.

### SearXNG — free metasearch floor (`lib/providers/searxng.ts`)

- `searchSearxng(query, limit)` — rotating public instances (`searx.be`, `inetol`, `searxng.site`, `opnxng`) + `SEARXNG_URL` env for self-hosted (recommended — public instances bot-block `format=json`, verified live: all 5 return HTML/429).
- **SAFE fallback** (`safe-verifier.ts`): when Tavily AND Exa both return empty for a claim query, one SearXNG call replaces the batch. Bounded (1 extra call per query, only on full failure), honest (empty stays empty — never fabricates support).
- **Scout floor**: `searxng` in `DOMAIN_PROVIDERS` for ~60 domains + `ScoutProvider` union + dispatch — keeps web retrieval alive at zero cost.
- Self-host: `docker run -p 8080:8080 searxng/searxng` with `search.formats: [html, json]` in settings.yml → set `SEARXNG_URL=http://localhost:8080`.

### Data Commons (`stats-keys.ts::searchDataCommons`)

Google's harmonized stats graph (WB+UN+Eurostat+national offices in one API). 9 variables (population, GDP, GDP growth, unemployment, median income, life expectancy, deaths, CO2, poverty) × 18 country mappings + `world`. v2 observation endpoint, latest values injected into abstracts as citable figures. **Key-gated**: `DATACOMMONS_API_KEY` (free at apikeys.datacommons.org) → returns `[]` without it.

### Panel findings → repair loop (`pipeline-v2.ts`)

CogWriter-style monitor→revise: critic-panel dimensions with `mustFix` or score ≤4 now feed their findings into `CRITIC REPAIR INSTRUCTIONS` (`panelWeakFindings`, max 6). Repair triggers on critic `repair` verdict OR panel veto with weak findings. Still bounded: `reAnalysisBudget`, citation-coverage regression check keeps original if repaired text loses citations.

### Verified

- `tsc --noEmit`: 0 errors · jest: 18/18, 231/231
- SearXNG: public instances all bot-blocked (expected) — degrade to `[]` cleanly; needs `SEARXNG_URL` for real activation
- `.env` additions: `SEARXNG_URL` (optional, self-host), `DATACOMMONS_API_KEY` (free key)

### Live-run findings & fixes (run `funnel-run-s22e`)

Full end-to-end run (64min, $0.68, topic: "Africa's economic integration vs geopolitical power structures") surfaced 4 real bugs — all fixed:

| Bug | Root cause | Fix |
|---|---|---|
| **Pipeline killed at 65min timeout** | Single scout passes took **24min each** — `Promise.allSettled` waited on dead providers' full retry chains | `PROVIDER_CALL_DEADLINE_MS` (90s default, env-tunable) races every `trackProviderCall` against a deadline → passes now ~45-130s |
| **IntelligentScout unbounded** | lens iterations had no wall-clock budget | `INTELLIGENT_SCOUT_BUDGET_MS` (8min) caps the loop — partial evidence > killed run |
| **Editor-in-chief dropped all selections** | LLM returned topicIds that didn't match radar ids (`topics.find` silently failed → miscounted as "budget-cut") | `resolveTopic`: id → index → normalized-id/title fallback + warn log. Live: `2/3 selections had unresolvable topicIds` confirmed |
| **Critic groundedness 23%** (artifact) | `runCritic` verified claims against `abstract.slice(0,2000)` only — analyst writes from **full-text** (17 PDFs, up to 400k chars), so page-40 claims were judged "unsupported" | `buildSourceExcerpt`: per-source claim-relevant excerpt from reader's `extractedText` (top-18 sentences by lexical overlap, doc order) fed to grounding LLM; `criticSources` now carries `fullText` |
| Citation-precision false negatives | Claim citing [SRC-5] but supported by [SRC-12] was marked unsupported | **Cross-source rescue** (ALCE/RAGTruth pattern): unsupported claims re-verified in one batched LLM call against best-overlap alternate source (≤8 claims, overlap ≥0.35) |
| semantic-scholar.js crash | OpenAlex error object → `.map` on undefined | Guarded: HTTP check + `Array.isArray` |
| Preflight false rejection | `checkSemanticAlignment` judged 139 sources on the **first 10 titles** of an unsorted list | Stratified 20-title sample across the whole pool |

Observed on the run: editorial dimension jumped **5→8/10** (craft prompt works); the autonomous loop fired end-to-end (critic reject → outline critic gap → +76 targeted sources → re-analysis → debate → arbiter). Publication still HELD (trust 40) — partly real grounding gap on a thin-corpus topic, partly the measurement artifacts now fixed. Next run should show groundedness recovery.

### Provider-layer audit (systematic, post live-run)

Cross-referenced all 197 ids in `DOMAIN_PROVIDERS` against the three dispatch layers (explicit `trackProviderCall` ~180 ids, `mega-*` feed subsets, `searchExtendedProviders`→`searchRegistry`). Findings + fixes:

| Finding | Impact | Fix |
|---|---|---|
| **`extended-registry.mjs` is dead code** | 33 instantiated providers (csis, dgap, cepr, rsis, iiss…) imported nowhere — AND their backing `openalex-provider-factory.js` doesn't exist, so they'd crash on import | Real coverage restored via ROR filters in `searchRegistry` default case (below) |
| **Slug-id mismatches hit generic OpenAlex fallback** | `iea---international-energy-agency`, `pwc-research-institute`, `deepmind-research`… each ran a *duplicate generic OpenAlex query* instead of the specialised provider | `PROVIDER_ALIASES` map — 16 slugs → canonical registry ids, resolved before the switch |
| **Institution stubs silently dead** | csis/dgap/cepr/cgd/saiia/acet/johns-hopkins/vanguard/amazon/copenhagen-institute returned generic OpenAlex noise | `ROR_PROVIDERS` — live-resolved RORs via api.openalex.org (`authorships.institutions.ror:` filter), results retagged with the real provider id |
| **Journal slugs unresolved** | `nature-medicine`, `jama---…`, `new-england-journal-of-medicine` → generic fallback | `SOURCE_PROVIDERS` — OpenAlex `primary_location.source.id:` filter (same pattern as nature.js), with real source ids (S203256638/S172573765/S62468778) |
| Reader cascade stopped early | pdfUrl 403 → abstract; HTML rescue only if abstract <1200 chars → think-tank full reports never fetched | Full cascade: pdf → **Unpaywall alternate host** (doi) → landing HTML (widened: thin abstract OR failed PDF OR report-type provider, budget 30) → **Wayback snapshot** (cap 8) → abstract |
| `ssrn`/`papers-with-code` still in DOMAIN_PROVIDERS | Harmless — filtered by DEAD_PROVIDERS at providerSet | No action needed |

Not wired (no ROR, no registry case — remain on OpenAlex default, no regression): `rsis` (works attribute to NTU), `harvard-chan` (would match all Harvard), `partnership-on-ai`, `stanford-hai`, `berlin-policy-hub`, `asteres`, `idea-factory`, `lawzero`, `cis` (ambiguous match). Marginal — mostly covered by `mega-thinktanks` feeds anyway.

**Single-point-of-failure — SOLVED via call-batching**: ~60% of providers funnel through OpenAlex, and each fired its own call per query variation (a domain mapping 15 OpenAlex-backed ids = 15 calls × 14 queries = 210 calls per pass — that's what produced the 429 storms). `searchExtendedProviders` now collapses this:

- slug aliases resolved + deduped upstream (`iea---…` and `iea` no longer fire twice)
- **1 batched call** for all institution-ROR providers (`authorships.institutions.ror:a|b|c` OR filter), results retagged by matching `institutions[].rorId` — provenance preserved
- **1 batched call** for all journal source-id providers (`primary_location.source.id:S1|S2`), retagged via `raw.primary_location.source.id`
- **1 shared call** for all unknown ids (was: N identical generic OpenAlex calls)

A 15-id OpenAlex-backed domain list now costs ~4 calls instead of 15 — roughly **4× less OpenAlex pressure** per query variation. Combined with per-query dedup (below), the polite pool (10 req/s) is no longer saturated by fan-out structure.

Independent-of-OpenAlex layer (corpus stays alive when OpenAlex trips): crossref, pubmed, europepmc, core, base, hal, doaj, datacite, dblp, arxiv, jstor, hathitrust, mega-feeds (Google News RSS), linkup, searxng.

### 2026 SOTA comparison → implemented upgrades

Deep-search over 2026 agentic advances (Tongyi DeepResearch/WebSailor/WebResearcher, OpenResearcher@EMNLP'26, Iris context-management, ScholarFlux orchestration, Loki check-worthiness). What we already had (Co-STORM, SAFE, bandit allocation, CARE) vs what was missing:

| Pattern (source) | Implemented |
|---|---|
| **Local retrieval over corpus** (OpenResearcher: search/open/find against collected docs) | `buildSourceExcerpt` now embeds claims + full-text sentences via `embedBatchDetailed`, ranks by max cosine sim (lexical prefilter to 80 candidates bounds cost; lexical fallback when embedder down). Applies to per-source grounding AND cross-source rescue excerpts |
| **Check-worthiness triage** (Loki) | SAFE budget (12 live calls) now ranks candidates: quantitative +3, causal +2, named-entity +1, forecast +1, contradicted +4 — was first-12-in-document order |
| **Anti-saturation dedup** (ScholarFlux) | Query variations deduped (normalized) before provider fan-out — enhancer+diversification+perspective queries can collide; each duplicate cost a full ~20-provider fan-out |
| Context management (ReSum/Iris) | Already: structured handoffs (blackboard, lens insights, mechanism tables) rather than raw history. `storeSourceChunks` persists chunks for later retrieval |

Rejected after probing: **fatcat** (lookup API, no full-text search), **S2 bulk endpoint** (same unauthenticated pool — no separate budget without an API key), **RSIS/Harvard-Chan ROR** (not in OpenAlex / too broad).

### Pre-run hardening (dry-run findings)

A `--dry-run` ($0.0035, 204s) surfaced two residual weaknesses — both fixed:

1. **Circuit breaker was 429-only and covered 4 providers** — `CB_THRESHOLDS` had openalex/semanticscholar/arxiv/google-books only, so `gdelt-news` retry-stormed ~150s in the radar phase without tripping (network timeouts + fetch-failures never counted). Now: thresholds for ~25 volatile providers (gdelt-news/independent, tavily, exa, linkup, crossref, jstor, core, base, pubmed, europepmc, gnews, newsapi, eventregistry, mediastack, thenewsapi, apitube, imf, worldbank, unhcr, internet-archive, hathitrust, searxng, datacommons) **plus** `recordNetFail` — a call exhausting retries on timeout/5xx/fetch-fail counts toward the breaker (trips at 2× the 429 threshold; client 4xx excluded — structural, not load).
2. **LLM topicIds still partially unresolvable** (1/3 in dry-run) — prompt now asks for the integer `index` field, not the opaque `openalex:W…` id. `resolveTopic` already handles integers.
3. **Reader timeout vs new cascade** — the extended extraction cascade (pdf→Unpaywall→HTML→Wayback) can reach ~115s; the 90s per-source timeout would have killed slow sources into `rule_based` (worse than abstract). Timeout → 120s default; Wayback skipped once >45s already spent.

### Copy editor — the missing newsroom role (agent wiring audit)

A systematic audit of the ~180 `lib/agent/*` files vs the live pipeline found the quality chain was detection-rich but **correction-poor at the prose layer**: style gates (G1-G10 AI tells) were logged and dropped; the panel's editorial reviewer could score 5/10 with zero consequence; `polishEditorial` existed but was opt-in and broken by design (prompt feeds *stripped* text, asks for HTML back → tag/citation loss, hence "fragile").

- **`lib/agent/copy-editor.ts`** (new): surgical edit-list contract — the LLM returns `{find, replace, reason}` pairs, never full HTML. Each edit applies only after verification: `find` must be verbatim-present, `replace` must carry no raw tags and preserve every `[SRC-N]`/`[E-N]`/`data-evidence` token inside `find`, bounded sizes. Wired post-render after `runStyleGates`; triggers on violations OR editorial-panel findings (score < 7); re-runs the gates to measure improvement. ~$0.005, 1 call.
- **Editorial floor in the trust gate**: panel `editorial ≤ 4/10` caps trust at 60 (below the 65 publish threshold) whether or not mustFix was flagged — a piece that reads badly cannot publish on factual merit alone.
- Dead agents confirmed dead (audit-only, no pipeline path): `fact-checker-external`, `llm-verifier-continuous`, `harvard-council-enhanced` + `review-board`, `reference-publisher` + `omega-verification`. `nomos-voice`/`style-judge`/`style-orchestrator` are live — via `editorial-arbiter`.

### Remaining research backlog (not implemented)

- **STORM/Co-STORM** perspective-guided outlines — partially covered by `perspective-questions.ts`; full interview-style refinement not ported
- **Loki/OpenFactVerification** claim decomposition pipeline — SAFE covers the verdict side; check-worthiness triage not ported
- **SelfCheckGPT** consistency scoring — candidate for claims with zero external evidence
- **WriteHERE/LOGIC** recursive section decomposition — current repair is whole-analysis; section-scoped revision is the next editorial lever

## Sprint 19 - Expertise & Provider Depth Layer (2026-09)

Sprint 19 activates the "200-PhD" knowledge layer: discipline providers wired for real, domain knowledge injected multi-domain, positioning agent on all formats.

### Provider Wiring (orphans → live)

16 discipline providers were implemented but never cabled into `searchRegistry` — `DOMAIN_EXTENDED_PROVIDERS` routed to them but they silently hit the OpenAlex default. Now wired in the switch + `getAvailableProviders()`:

```
sociology, psychology, history, geography, chemistry, biology,
political-science, philpapers, persee, isidore, zbmath, eric,
unodc, fao, dblp
```

Live-verified: Persée returns native French SHS docs; others use their OpenAlex discipline-filtered paths.

### DOMAIN_PROVIDERS enrichment (topic-classifier.ts)

Discipline providers injected per domain: social-sciences→sociology/psychology/isidore/persee/eric, humanities→philpapers/history/persee, quantitative→zbmath/dblp, law→unodc, health→biology, environment→geography/fao, cognitive-science→psychology, policy→political-science. The 4 deep-lens domains (anthropology, history, religious-studies, non-western-philosophy) now have provider maps.

### Knowledge Bases — 22→26 domains

`RESEARCHER_KBS` gained full PhD-level entries for **anthropology** (Geertz/Mauss/Scott — emic/etic, thick description), **history** (Braudel/Polanyi/Thompson — longue durée, path dependence, counterfactual probing), **religious-studies** (Durkheim/Schmitt/Taylor — secularization debate, political theology), **non-western-philosophy** (Confucius/Laozi/Kautilya/Ubuntu/Tianxia — comparative without flattening). Each: 5-6 keyConcepts, 3 frameworks with steps, 5-6 referencePapers, dataSources, methodology, qualityCriteria, standingQuestions, knownBiases.

### Multi-domain injection (pipeline-v2.ts)

`domainBlock` previously injected only `detectedDomain` — now injects primary domain **+ up to 3 casting dimensions** (each with concepts/frameworks/biases/canon). A "security" lens now carries history/anthropology knowledge when the classifier detects those dimensions.

### Positioning Agent — all formats

`buildPositioningBrief` no longer gated to `isStrategic` — runs on every format (~13s, ~$0.001 measured). The critic panel's 5th dimension (differentiation) activates whenever a brief exists.

### Timeout fix

Deep runs (BLACKBOARD gap-fill re-analysis + Delphi + arbiter) legitimately need >65min but inherited the brief cap — a deep run died post-arbiter at 3900s. `StrategicPipelineOptions.timeoutMs` added; `deep` depth now passes 80min.

### Batch 5 — Sub-discipline expansion IV (62→74 domains)

12 more sub-disciplines (same 8-layer pattern):

```
military-studies, futures-studies, economic-sociology, historical-sociology,
environmental-economics, health-economics, legal-theory, postcolonial-studies,
communication-studies, public-finance, political-anthropology, food-systems
```

Canon: Clausewitz/Schelling/Pape (military), Schwartz/Inayatullah/Tetlock (futures), Granovetter/Polanyi/Callon/Zelizer (econ soc), Tilly/Skocpol/Wallerstein (historical soc), Stern/Nordhaus/Ostrom (env econ), Arrow/Grossman (health econ), Hart/Dworkin/Fuller (legal theory), Said/Fanon/Spivak/Quijano (postcolonial), Herman-Chomsky/McLuhan/Habermas/Hall (comms), Musgrave/Mirrlees/Oates (public finance), Scott/Clastres/Graeber (political anthropology), Sen/Friedmann/Patel (food systems).

### S21 — Critic × domain KB + schools of thought + domain lessons

| Change | File | What it does |
|--------|------|-------------|
| **Domain checklist in critic** | `critic-panel.ts`, `pipeline-v2.ts` | `runCriticPanel(domain: detectedDomain)` — methodology reviewer now audits against the domain KB's `specialRequirements` + `knownBiases` (e.g. intelligence analysis must show ACH-style reasoning, archaeology must name the dating method). Critic checks METHOD, not just style. |
| **Reading depth persisted** | `pipeline-v2.ts`, `pipeline-types.ts` | `stats.reader.depth {full_text, abstract, rule_based}` — groundedness trend is now measurable across runs. |
| **Domain-scoped lessons** | `agent-memory.ts`, `pipeline-v2.ts` | Same-domain lessons get ×1.5 weight in MMR selection; analyst `buildMemoryInjection` call now passes `detectedDomain` (was `undefined`). |
| **Schools of thought** | `schools-of-thought.ts` (new), `debate-agent.ts`, `pipeline-v2.ts` | `SCHOOLS_OF_THOUGHT` registry — 15 contested domains × 2-3 rival schools with keyClaims + standardCritique. Injected into debate Pass 1: steel-man must come from a REAL rival school, not an invented counter. |

**Golden-set harness already exists** (`scripts/eval-golden.ts` + `evals/golden-set.json` 8 cases + baseline): runs real NLI grounding + critic panel, exits non-zero on regression. Validated live: `ground=99% panel=46` on stablecoin case. Note: panel editorial reviewer is sensitive to residual CSS in stored HTML — strip styles before scoring if comparing across formats.

### S22 — Statistics & data layer (real numbers, not just documents)

Audit answer: stats coverage existed but was shallow — `mega-stats` (~25 national stats offices) as RSS **release feeds** (headline numbers only), structured APIs limited to Eurostat/ECB/INSEE in the macro DB, quant-agent gated to energy + US fiscal. Now:

| Addition | File | What it does |
|---|---|---|
| **World Bank data API** | `lib/providers/worldbank-data.ts` | `ingestWorldBankIndicators()` — 20 WDI indicators (GDP, inflation, unemployment, population, poverty, military %GDP, health/education spend, refugees, FDI, debt…) × 50 economies × 15y → macro DB via `refreshMacroSeries()`. `searchWorldBankData()` — doc-layer provider whose abstracts embed **live latest values** ("GDP growth: DE -0.3%, FR 0.9%, US 2.5% (2024)") → directly citable numbers. Free, no key. |
| **UCDP** | `lib/providers/stats-data.ts` | `searchUCDP` — Uppsala conflict events API aggregated per country → fatalities + civilian deaths + active conflicts in abstract. **Needs `UCDP_API_KEY`** (free registration; v24 requires key) — returns [] gracefully without it. |
| **ILOSTAT** | `lib/providers/stats-data.ts` | `searchILOSTAT` — keyword→indicator catalog (unemployment, informality, NEET, wages, strikes, migrant workers…) → dataset descriptors. No key. |
| **OWID** | `lib/providers/stats-data.ts` | `searchOWID` — curated grapher slugs (CO2, democracy index, homicide, fertility, R&D…) → **fetches the public grapher CSV** and embeds latest values per major entity in the abstract ("CO2: China 12.3Gt, US 4.9Gt (2024)"). No key. Fallback: descriptor + CSV URL. |

Dispatch: `worldbank-data`, `ucdp`, `ilostat`, `owid` added to provider union + `ALL_PROVIDERS` + `trackProviderCall` cases. DOMAIN_PROVIDERS wired into 20+ domains (economics, demography, labor, conflict/military/security→ucdp, health/epi→owid, dev/migration/finance→worldbank-data…).

**Still missing (key-gated or heavy):** V-Dem (dataset download), Destatis GENESIS (registration), StatCan WDS (cumbersome — mega-stats feed covers releases). National offices beyond INSEE/ISTAT covered via `mega-stats` feeds + the providers below.

### S22b — Key-gated + national stats APIs

`lib/providers/stats-keys.ts` — 9 providers dispatched as `worldbank-data`-style sources:

| Provider | Key | Live result |
|---|---|---|
| `ons-uk` | **none** | ✅ 5 datasets on "inflation unemployment" |
| `ibge` | **none** | ✅ 6 aggregates (EN→PT keyword map — catalog is Portuguese) |
| `us-bls` | `BLS_API_KEY` optional (keyless ~25 req/day) | ✅ 3 series with live values (unemployment, CPI, payrolls) |
| `comtrade` | `COMTRADE_API_KEY` | ⚠️ without key → descriptors only (preview endpoint returns demo-scaled values — misleading, not used) |
| `us-census` | `CENSUS_API_KEY` | keyless now redirects to "Missing Key" — key required |
| `acled` | `ACLED_API_KEY` + `ACLED_EMAIL` | free academic registration |
| `unhcr` | `UNHCR_API_KEY` | refugee/IDP per country |
| `estat-jp` | `ESTAT_JP_APP_ID` | Japanese official stats catalog |
| `kosis` | `KOSIS_API_KEY` | Korean statistics |

All degrade to `[]` gracefully without keys — no pipeline breakage. DOMAIN_PROVIDERS wired into economics, finance, security, demography, IR, migration, conflict, political-economy, public-admin, labor, area-studies, development, public-finance, political-anthropology.

### S23 — Quality gaps closed (adversarial coverage, critic hygiene, quant × stats)

| Fix | File | Detail |
|---|---|---|
| **Devil's advocate ungated** | `pipeline-v2.ts` | Was `strategic`-only — same bias positioning had. Now runs on all formats when the LAS gate allows (mode: `'brief'`/`'strategic'` passed correctly). Briefs get the adversarial check too. |
| **CSS residue → critic veto** | `critic-panel.ts` | Root cause of the golden-eval veto (99% grounding, panel 46): the tag-strip left `<style>`/`<script>` **content** as prose. Now strips those blocks entirely before scoring — any caller passing rendered HTML gets clean text. |
| **Quant-agent × World Bank** | `quant-agent.ts` | `fetchWorldBankSeries` generic fetcher + country detection (18 country patterns → ISO3). Query keywords trigger real series: GDP growth, inflation, unemployment, gov debt, military %GDP, CO2 per capita — localized to the topic's country or WLD. Was energy+fiscal-US only. |
| **Schools of thought 15→27** | `schools-of-thought.ts` | Added: technology (e/acc vs safety vs distribution), environment (ecomodernist/degrowth/polycentric), international-law (positivist/New Haven/TWAIL), military-studies (attritionist/manoeuvrist/tech), public-health, sociology, psychology, education, demography, economic-history, public-finance, political-anthropology, futures-studies. |
| **Entity decoding in critic strip** | `critic-panel.ts` | `&#039;`/`&quot;`/`&amp;` decoded, not dropped — "China&#039;s" was reaching reviewers as literal entity noise. |
| **Editorial craft directives** | `analyst-multipass.ts` | Pass-3 prompt gains: governing-thought-first per section, no-filler rule (cut sentences with no actor/number/mechanism), contentful transitions, prose rhythm. Targets the measured weakest dimension (editorial 5/10). |
| **Structural editor ungated** | `pipeline-v2.ts` | `structuralEditorReview` (Pyramid Principle / SCR / governing-thought audit) now runs on all formats — <40 score injects restructuring feedback into render context. |

**Golden-set baseline (first full run, 8/8 cases):** groundedness 98.2%, citations 95.1%, panel 55.9, zero vetoes, zero errors. CSS fix verified (stablecoin 46→64). Stored pubs keep their prose scores — editorial improvements only apply to NEW runs. SAFE non-functional during eval (Tavily 432 + Exa 402 exhausted → all claims "unverifiable", NLI local compense). held-cbam-trade panel=0 = post-strip text <200 chars (genuinely thin stored pub — honest verdict).

**Remaining honest gaps:** full golden-set run never executed end-to-end; S20 HTML rescue + stats layer unproven on a live run; ~150 agent files exist but a substantial fraction are dormant (not quality-critical but tech debt); schools cover 27/74 domains; national stats beyond INSEE/ISTAT/ONS/BLS/Census stay feed-level.

### Batch 4 — Sub-discipline expansion III (50→62 domains)

12 more sub-disciplines (same 8-layer pattern):

```
neuroscience, data-science, economic-history, social-psychology,
organizational-studies, science-policy, development-studies,
comparative-politics, social-theory, philosophy-of-science,
law-and-economics, intelligence-studies
```

Canon: Kandel/Friston (neuro), Breiman/Gebru/Chernozhukov (data science), Fogel/Pomeranz/AJR (econ history), Tajfel/Festinger/Haidt (social psych), DiMaggio-Powell/Perrow/Weick/Crozier (org studies), Stokes/Mazzucato/Gibbons (science policy), Sen/Escobar/Frank (development), Levitsky/Lijphart/Tilly (comparative), Bourdieu/Foucault/Giddens/Latour (social theory), Popper/Kuhn/Lakatos (phil of science), Coase/Posner/Ostrom/Calabresi (law & econ), Heuer/Jervis/Wohlstetter/Betts (intelligence studies).

**Provider-id correction found during batch 4:** `semantic-scholar` (hyphenated) is NOT dispatched — real pipeline ids are `semanticscholar` and `semantic-scholar-graph`. Fixed in all new DOMAIN_PROVIDERS entries. Intelligence providers (`cia-foia`, `odni`, `uk-jic`, `global-intelligence`, `nato`) confirmed dispatched.

### S20 — HTML full-text rescue (groundedness fix)

**Problem:** `reader-agent-v3.getFullText()` only fetched HTML for `NEWS_PROVIDERS`. Think-tank reports, Persée/HAL galleries, institutional/government pubs — sources without DOI/pdfUrl — always fell back to thin abstracts → low groundedness → publications HELD.

**Fix:** Landing-page rescue in `reader-agent-v3.ts`. Sources with `abstract < 1200 chars` + fetchable URL get one HTML extraction attempt (`fetchNewsArticleText`, already hardened: retries, JSON-LD, 200-char floor). Budget: `HTML_RESCUE_MAX = 20` per run, reset in `readerAgentV3()`. Chain is now: `pdfUrl → PDF url → news fetch → landing-page rescue → abstract`.

| File | Change |
|------|--------|
| `lib/agent/reader-agent-v3.ts` | `HTML_RESCUE_MAX` budget + rescue branch in `getFullText` + `processSource` gate extended to thin-abstract sources |

### Batch 3 — Sub-discipline expansion II (38→50 domains)

12 more sub-disciplines added end-to-end (same 8-layer pattern: union ×2, registry profile, full KB, corpus shell, DOMAIN_PROVIDERS, vertical map, DOMAIN_EXPERTS card, EXPERT_PERSONAS prompt):

```
migration-studies, science-technology-studies, epistemology,
international-law, conflict-studies, political-economy,
public-administration, gender-studies, area-studies,
labor-studies, ethics-of-technology, archaeology
```

Canon: Massey/de Haas/Castles (migration), Latour/Jasanoff/Winner (STS), Gettier/Fricker/Goldman (epistemology), VCLT/Henkin/Koskenniemi (international law), Fearon/Collier/Walter (conflict), Hall-Soskice/Polanyi/Acemoglu (political economy), Lipsky/Wilson/Herd-Moynihan (public admin), Crenshaw/Butler/Folbre (gender), Said/Anderson/Chakrabarty (area studies), Autor/Freeman-Medoff/Standing (labor), Nissenbaum/O'Neil/Floridi (tech ethics), Binford/Hodder/Tainter (archaeology).

Provider ids verified against real dispatch (`trackProviderCall` or `activeMega`/`searchExtendedProviders`): used only live ids — `eur-lex`, `sipri`, `ecfr`, `swp`, `ajol`, `dialnet`, `riss`, `shodhganga`, `overton`, `mega-*`, `nber`, `repec`, `who-gho`, `undp`, `un`. No dead ids (cnas/ilo/lawzero/newamerica have no dispatch).

**Test-state caveat found:** `councilManager.expertLoadBalance` is a shared singleton — selections in earlier tests pollute later ones (recency penalty). Fixed by `resetMetrics()` in `beforeEach` for the integration block. Applies to any test asserting specific domain selections.

### Batch 2 — Sub-discipline expansion (26→38 domains)

12 sub-disciplines added end-to-end (type union ×2, `RESEARCHER_REGISTRY` profiles, `RESEARCHER_KBS` full PhD-level entries, `MULTI_DOMAIN_CORPUS` entries, `DOMAIN_PROVIDERS` maps, `VERTICAL_RESEARCHER_MAP`, `DOMAIN_EXPERTS` analyst cards, `EXPERT_PERSONAS` prompts in phd-researcher.ts):

```
sociology, psychology, political-science, demography, criminology,
education, philosophy, linguistics, media-studies,
epidemiology, public-health, international-relations
```

Each KB carries real canon: Bourdieu/Durkheim/Granovetter (sociology), Kahneman/Tajfel + replication-awareness (psychology), Tsebelis/Levitsky (political-science), Malthus→second-transition (demography), Tyler/Sampson-Laub (criminology), Becker/Vygotsky/Hattie-caveats (education), Rawls/Hume/Gettier/Kripke (philosophy), Lakoff/Austin/Fairclough (linguistics), Habermas/Herman-Chomsky/Benkler (media-studies), Bradford Hill/Hernán-Robins (epidemiology), Marmot/Rose/commercial-determinants (public-health), Waltz/Keohane/Schelling/Wendt (IR).

### Provider-id hygiene (audit findings)

- Pipeline dispatch is explicit `trackProviderCall` — ids without a case fall through to `searchExtendedProviders` → `searchRegistry`. Think tanks (brookings/rand/cfr/chatham-house/iiss/wilson-center) resolve via that path OR the `mega-thinktanks`/`global-think-tanks` feed aggregates; new mappings use the aggregates (90+ institutes, native RSS).
- `who`/`lancet`/`the-lancet`/`nature-medicine`/`nature`/`science`/`cell` are dead ids in the main pipeline — real ids are `who-gho`/`who-direct`; `pubmed`/`europepmc`/`nih`/`cdc`/`plos`/`biorxiv` cover health/science.
- `ssrn` is in `DEAD_PROVIDERS` (HTTP 403 permanent — Elsevier blocks programmatic access); removed from the new mappings.
- `getCorpusStats().totalDomains` was hardcoded `26` — now computed from `Object.keys(MULTI_DOMAIN_CORPUS).length` (38).

### Verified

- `tsc --noEmit`: 0 errors
- jest: 18/18 suites, 231 tests (domain-experts test updated to 38)
- Consistency: 38 domains in KBs / Registry / Corpus / DOMAIN_PROVIDERS — `buildKBInjection` returns 3.3-3.7k chars per new domain
- Live: sociology/philpapers/persee/zbmath/political-science all return results through `searchRegistry`

## Sprint 18 - Verification & Coverage Quality Layer (2026-08)

Sprint 18 integrates 4 research-grade mechanisms (DeepMind SAFE, Co-STORM, CRAG, G-Eval) plus a golden-set eval harness — the measurement layer the stack was missing.

### New Modules

| Module | Source | Integration |
|--------|--------|-------------|
| `lib/agent/safe-verifier.ts` | **SAFE** (DeepMind, NeurIPS 2024) | Per-claim live-search verification: batched query gen → Tavily/Exa evidence → local NLI triage → **LLM arbitration** (NLI alone can't distinguish "source asserts X" from "source reports someone claims X" — debunk pages trigger entailment). Escalates unsupported/contradicted/quantitative-uncited claims inside `groundClaimsWithNLI` (max 12, ~$0.001 + search calls). Live-verified: rescued true claims, caught a planted hoax. |
| `lib/agent/perspective-questions.ts` | **Co-STORM** (Stanford, EMNLP 2024) | Perspective-guided question asking: discovers 4 expert lenses (intl law, regional geopolitics, climate science…) then generates their search queries. Wired in `scoutImpl` AFTER diversification so guided queries always survive. Fixes the "outline critic finds missing dimensions too late" loop. ~$0.0002. |
| `lib/agent/retrieval-gapfill.ts` | **CRAG** (corrective RAG) | CARE `missingConcepts` now trigger a bounded targeted re-search (Tavily+Exa+OpenAlex/Crossref) merged into finalPool BEFORE the analyst — was previously log-only. |
| `lib/agent/critic-panel.ts` | **G-Eval rubric** | 4 parallel reviewers (methodology 30%, coverage 30%, epistemic 25%, editorial 15%), each scoring 1-10 with quoted findings + mustFix flag. Veto = documented repairable defect only (cap 55). Replaces opaque scalar rejections with auditable per-dimension verdicts. ~$0.0015. |
| `scripts/eval-golden.ts` + `evals/` | Eval harness | Golden-set regression: runs cases (htmlFile or publicationId) through the real stack, aggregates groundedness/citations/panel score, fails on >5pt regression vs `evals/baseline.json`. `npm run eval:golden` / `--update`. |
| `lib/agent/positioning-agent.ts` | Editorial positioning (gap taxonomy from research-gap-finder, verdict dims from AdversarialCI/warroom) | **Competitive differentiation**: builds a competitor corpus (think-tank providers + editorial domains via Tavily + OpenAlex/Crossref), LLM field-map (coverage/consensus/gaps/weak claims/strongest piece), then emits a `contextBlock` with 3-5 differentiation directives (cover gap / outdeep competitor / challenge weak claim). Strategic formats only; corpus <3 pieces → skipped. ~$0.001, ~13s. |

### Wiring Points

- `pipeline-v2.ts` scoutImpl: perspective queries added post-diversification (step 0.7); CARE gap-fill active at K10; critic panel runs after `runCritic` → `stats.criticPanel` → trust veto at 55 on mustFix.
- `pipeline-v2.ts` post-SARA / pre-ANALYST: `buildPositioningBrief(query)` → `contextBlock` appended to `fullContextBlock` (all analyst paths: MoA, multipass, TTS, critic-repair, gap re-analysis) → `stats.positioning` persisted.
- `critic-panel.ts`: optional `fieldContext` activates a 5th reviewer `differentiation` (weight 20%) — does the piece beat the field or just re-synthesize it? mustFix only on pure commodity content.
- `claim-grounding.ts` `groundClaimsWithNLI`: step 3c SAFE escalation between NLI verdicts and aggregation.

### Verified Live

- Perspective queries on Greenland topic → UNCLOS / territorial purchase precedent / Greenlandic autonomy (exactly the dimensions the critic flagged missing).
- SAFE: hoax claim `contradicted` (arbiter overrode NLI), true claims `supported`, 16s, $0.0002.
- Critic panel on thin text: methodology=2 coverage=3 epistemic=5 editorial=4 → 34/100 VETO with reasons.
- Positioning on Greenland topic: 9 competitor pieces → field map (6 covered dims, 5 gaps) → 4 directives (Tanbreez cost analysis, Greenlandic polling data, Arctic governance reform), 13s, $0.001.
- Panel with fieldContext on commodity text: differentiation=3 → 27/100 VETO (findings name the missed dimensions + unchallenged weak claim).
- tsc: 0 errors. jest: 17/17 suites, 224 tests.

### Golden Set (populated)

8 cases in `evals/golden-set.json` — 3 top-tier, 3 mid-tier, 2 HELD canaries. Baseline in `evals/baseline.json` (`npm run eval:golden` / `--update`). Panel is deliberately stricter than stored trust scores (rubric reviewers on raw text) — baseline captures the real distribution.

### Research-provider audit + repairs

| Provider | Status | Note |
|---|---|---|
| arXiv | ✅ live | `searchArxiv` works (export.arxiv.org API) |
| HAL, CORE, OpenAlex, PhilPapers, RePEc, EuropePMC, ERIC, DBLP, DOAJ | ✅ live | CORE auto-falls back to keyless endpoint; PhilPapers/RePEc/ERIC/DBLP route through OpenAlex by design |
| **OSF** (SocArXiv/PsyArXiv/EarthArXiv) | 🔧 repaired | `api.osf.io/v2/search/` deprecated (404) → rewired to SHARE `creativeworks/_search` (Elasticsearch query_string) + `type:preprint` OpenAlex fallback |
| **SSRN** | 🔧 repaired | `api.ssrn.com` bot-protected (403) → OpenAlex `type:preprint` fallback keeps social-science working papers in corpus |
| Semantic Scholar | ⚠️ transient | HTTP 429 rate-limit — needs API key or backoff tuning |

### Positioning Agent — remaining work completed

- `stats.positioning` now stores the full auditable brief (fieldCoverage, consensusClaims, gaps, weakClaims, directiveDetails) → persisted into `Publication.stats` via existing stats merge.
- `eval-golden.ts` activates the panel's 5th `differentiation` dimension when the stored publication carries `stats.positioning`; aggregate + regression check (`< -1.5` on 1-10 scale) + `minDifferentiation` expectation per case.
- `__tests__/lib/agent/positioning-agent.test.ts`: 7 edge cases (thin corpus→null, url dedup, <80-char abstracts filtered, valid-axis directive filtering, LLM failure→null, both providers down→null, zero-directive informational brief).

### Format deep-search → DA prospective injected

Best-practice research (Belfer/NIC, France Stratégie, RAND, Shell/OECD scenario planning, Economist/EIU): exec-summary front-loaded, **scenarios wired to decisions and signals** (the step where scenario planning "usually breaks down"), one sober signature accent, methodology transparency. Injected into `position-first-renderer.ts` + `position-first-brief.css.ts`:

| Upgrade | Source | Data used |
|---|---|---|
| **Key Judgments** block (numbered, bottom-line verdict first) | NIC/Belfer | `position.inBrief` + `verdict` |
| **2×2 uncertainty matrix** — visual quadrant grid, scenario chips auto-placed by pole matching on `axisPosition`, unplaced → legend | Shell scenario method | `prospectiveFramework.criticalUncertainties` + `scenario.axisPosition` |
| **Signal monitor table** — "If you observe X → favors scenario Y" | Decision-grade intelligence | `scenario.signals` per non-wildcard scenario |
| **Decision logic line** — hedging holds under every scenario; sequenced moves assume central outlook | Shell "robust vs contingent" | `recommendations.riskMitigation` presence |
| **Colophon** — "How this analysis was produced" (pipeline signature: sources, providers, verification, no gap-filling) | France Stratégie transparency + brand | sources/providers counts |
| **Action Priority Matrix** — recommendations as scannable table (# × horizon × action × type: central-path vs robust hedge), replaces prose blocks | Harvard M-RCBG 2025 (Trade-Climate Linkage report) | `recommendations.{immediate,shortTerm,longTerm,riskMitigation}` |
| **Scenario comparison table** (from render audit) | RAND/McKinsey exhibits | prob/CI/sensitivity/drivers |

All cells/tags carrying model estimates use `data-no-cite` (Invariant-6 sanitizer must skip them).

### Render quality audit (paid-product bar)

| Defect found in stored pubs | Fix |
|---|---|
| **Format badge escaped** — `&lt;span class="format-badge"&gt;` rendered as literal text in EVERY publication (`esc(metaLine)` escaping raw badge HTML) | Escape text part only; badge HTML raw. Verified in fresh render |
| **`non établie` (French) inside English prose** — up to 29×/pub. Invariant 6 marker is intentional epistemic honesty, but a French token in EN output reads as a bug | Step 3b in `repairCitations`: detect doc language (French function-word density >6%), normalize `non établie` → `not established` for EN docs. Covers sanitizer + LLM-written tokens. `editor-in-chief` age label → `undated` |
| **Zero data tables** in all audited pubs — no exhibit an analyst can scan | Scenario comparison table (name/prob/90% CI/sensitivity/top drivers, central row highlighted) injected in Act III — all cells `data-no-cite` so the Invariant-6 sanitizer skips model estimates |
| Exa HTTP 402 retried every fan-out | Session-level disable on 401/402 (`markExaExhausted`, same pattern as OpenAlex key exhaustion) |
| Minor, accepted | "missing N" = deliberate missing-reference marker (honest but cryptic); `<sup>` citations inside h2 headings (unusual but valid); no h3 subsections — analyst output structure, bigger change |

### Fixes found via golden-set run

- **Unclosed `<style>/<script>/<head>` repair** in `extractSentencesFromHtml` — a stored HELD publication had an unclosed `<style>` (LLM-generated malformed doc) that swallowed all prose → 0 extracted claims. Repair closes the block before the first prose tag.
- **Reference-fragment filter** in `decomposeIntoClaims` — bibliography tails ("org/10.3390/... [9] Author, X.") were extracted as claims, inflating unsupported counts and consuming the 12-slot SAFE budget. Now filtered at decomposition (`isReferenceFragment`).
- **CSS corruption root cause** — `rgba(240, 240, 250, non établie)` in stored HTML is an LLM generation artifact (model wrote the sanitizer's literal token inside CSS), NOT a sanitizer bug (`sanitizeUnsourcedNumbers` masks style blocks correctly; an unclosed style is masked to EOF).

---

## Sprint 17 - Foresight & Scenario Calibration Layer (2026-08)

Sprint 17 fixes a critical architectural bug in the foresight pipeline and introduces state-of-the-art multi-expert scenario calibration inspired by 2026 research.

### Bug Fix: Foresight Ordering (P0)

**Problem:** The Monte Carlo foresight engine (1500-3000 runs, 512-agent swarm) was running BEFORE the editorial arbiter created scenarios. Result: foresight always saw 0 scenarios and skipped. Probabilities shown (40/35/25%) were raw LLM priors, never refined by simulation.

**Fix:** Moved foresight to run AFTER editorialArbiter() in pipeline-v2.ts. The arbiter generates scenario names/descriptions/priors, then foresight refines probabilities with Monte Carlo simulation. Empirical probabilities are written back into institutePosition.scenarios.

| File | Change |
|------|--------|
| `lib/agent/pipeline-v2.ts` | Foresight block moved from line 5748 (before arbiter) to line 5789 (after arbiter) |

### Bug Fix: Casting Fallback (P1)

**Problem:** When the LLM casting agent failed, the deterministic fallback produced only 1 team member instead of 3 (lead + friction + stress-test).

**Fix:** buildDeterministicTeam() now always produces 3 team members with real mandates, even when 0 dimensions are detected. Adds Evidence integrity (friction) and Strategic foresight (stress-test) as default lenses.

| File | Change |
|------|--------|
| `lib/agent/casting-agent.ts` | Fallback always produces 3 members |

### Bug Fix: Citation Breakage in Abbreviations (P2)

**Problem:** LLM sometimes inserts [SRC-N] citations inside common abbreviations, producing "e [SRC-20] g." instead of "e.g. [SRC-20]".

**Fix:** Post-processing in replaceCitations() detects and repairs broken e.g., i.e. patterns.

| File | Change |
|------|--------|
| `lib/agent/position-first-renderer.ts` | Regex repair for broken abbreviations |

### Innovation: Delphi Foresight - Professional-Grade Scenario Calibration

New module `lib/agent/foresight-delphi.ts` (857 lines) implements a 10-step professional forecasting pipeline:

| Step | Innovation | Source | What it does |
|------|-----------|--------|-------------|
| 1 | **Base Rate Computation** | Tetlock/GJP | LLM analyzes historical analogues to establish priors. Base rates are the #1 predictor of forecasting accuracy. |
| 2 | **Fermi Decomposition** | Fermi/GJP | Breaks the question into sub-questions, estimates each independently. Reduces anchoring bias. |
| 3 | **InfoDelphi Evidence Partition** | arxiv 2607.01661 | Evidence split into 40% shared + 60% private per expert. Information asymmetry drives genuine deliberation. |
| 4-6 | **3-Round Scalable Delphi** | arxiv 2602.08889 | 5 expert personas (base-rate-historian, bayesian-updater, skeptic, systems-thinker, pragmatist). 3 rounds with mediator feedback (not 2 — 3rd round improves convergence 15%+). |
| 7 | **Cross-Impact Balance** | arxiv 2603.29470 | Stochastic CIB matrix (-3 to +3) for scenario consistency. |
| 8 | **Expert Weighting** | GJP | Weight experts by inverse distance from median (calibration proxy). Better-calibrated experts get more influence. |
| 9 | **Extremizing Function** | Atanasov et al. 2017 | When experts agree (low variance), push probability further from 50%. Corrects for underconfidence. Formula: `sigmoid(logit(p) * extremize_factor)`. |
| 10 | **Platt Scaling + Bootstrap CIs** | Sibyl/datori | Logistic calibration (a=2.5) stretches away from 50%. Bootstrap resampling (1000x) produces 90% confidence intervals. |
| 11 | **Key Drivers & Sensitivity** | - | LLM extracts drivers, blockers, signals, and sensitivity score for each scenario. Actionable intelligence. |

**Aggregation pipeline:**
```
Base Rate → Fermi Estimate → 3 Delphi Rounds → Weighted Geometric Mean
  → Cross-Impact Adjustment → Shrinkage (70% expert + 30% base rate + 10% Fermi)
  → Extremizing → Platt Scaling → Normalization → Bootstrap CIs
```

**Expert personas (bias-aware):**
- `base-rate-historian`: Historical reference classes (bias: anchoring on frequencies)
- `bayesian-updater`: Likelihood ratios (bias: overconfidence in evidence)
- `skeptic`: Adversarial stress-testing (bias: excessive pessimism)
- `systems-thinker`: Feedback loops, emergence (bias: overweighting complexity)
- `pragmatist`: Implementation reality (bias: status quo bias)

**Output per scenario:**
- `probability`: Final calibrated probability
- `baseRate`: Historical prior
- `fermiEstimate`: Decomposed estimate
- `expertEstimate`: Aggregated expert judgment
- `extremizedEstimate`: After extremizing
- `calibratedProbability`: Final after all corrections
- `confidenceInterval`: [lower, upper] 90% CI
- `keyDrivers`: What moves probability UP by 10+pp
- `blockers`: What moves probability DOWN by 10+pp
- `signals`: Observable early warning indicators
- `sensitivityScore`: 0=robust, 1=very fragile
- `crossImpact`: Impact from other scenarios
- `expertRationales`: Per-expert reasoning

**Pipeline integration:** After `editorialArbiter()` generates scenarios, `runDelphiForesight()` is called with rich evidence (titles + abstracts + providers). Delphi-calibrated probabilities + signals replace raw LLM priors before Monte Carlo foresight runs.

| File | Purpose |
|------|---------|
| `lib/agent/foresight-delphi.ts` | 10-step professional forecasting pipeline (857 lines) |
| `lib/agent/editorial-arbiter.ts` | Calls `runDelphiForesight()` with abstracts + context |
| `lib/agent/position-first-renderer.ts` | Renders scenario signals as tags |
| `lib/agent/position-first-brief.css.ts` | CSS for `.scenario-signals`, `.signal-tag` |
| `lib/llm/unified-llm.ts` | Tasks: `delphi_round1`, `delphi_round2`, `cross_impact` |

### Additional Bug Fixes (Audit Pass 2)

| Bug | File | Fix |
|-----|------|-----|
| **Platt scaling formula wrong** | `foresight-delphi.ts` | Was `sigmoid(a*p+b)` (compresses). Fixed to `sigmoid(a*logit(p)+b)` (stretches). |
| **Division by zero in mediator** | `foresight-delphi.ts` | Filter NaN/null before computing mean/min/max. |
| **NaN in convergence** | `foresight-delphi.ts` | Guard against empty estimate arrays. |
| **Math.log(0) = -Infinity** | `foresight-delphi.ts` | Clamp values to [0.001, 0.999] before log. |
| **HTML entity decode order** | `inquiry-html-parse.ts` | `&amp;` must be decoded LAST to avoid double-decoding. Added `&nbsp;`. |
| **Casting fallback missing at pipeline level** | `pipeline-v2.ts` | If `castingAgent()` throws, pipeline-level fallback creates 3-member team. |
| **`<p>` losing class/style attrs** | `citation-repair.ts` | `citation-repair` was replacing `<p class="through-line">` with bare `<p>`. Fixed to preserve attrs. |
| **Citations injected into reference titles** | `citation-repair.ts` | 3 injection functions now skip `<section class="references-section">`. |
| **`[LIVE-DATA]` placeholder in text** | `position-first-renderer.ts` | Regex removes LLM-generated `[LIVE-DATA]` placeholders. |
| **No question validation** | `pipeline-v2.ts` | Reject queries <10 chars or <3 words. "What" would now be rejected. |
| **No Policy recommendations** | `editorial-arbiter.ts` | Arbiter now generates structured recommendations (immediate/shortTerm/longTerm/riskMitigation). |

### Verification

- TypeScript: 0 errors
- Next.js build: Compiled successfully (74/74 pages)
- ESLint: 0 warnings, 0 errors
- Smoke tests: ALL PASS (Platt scaling, extremizing, normalize, partition, edge cases)
- All fixes are non-breaking (foresight and Delphi are wrapped in try/catch)

## � Pipeline Wiring Layer (2026-08 Sprint 16)

Sprint 16 wires all 8 Sprint 15 innovation modules into the live pipeline, plus a final audit fix pass that wired 2 orphaned modules (refrain.ts, nestbrowse.ts), deleted 2 dead modules (meta-controller.ts, dag-planner.ts), and activated PathMind KG reasoning. TypeScript: 0 errors. No orphaned code remains.

### S16 — Active Integrations

| Fix | File | Module | Integration Point |
|-----|------|--------|-------------------|
| **S16-01** | `pipeline-v2.ts` | GoA (ICLR 2026) | ANALYST phase — `selectAgents()` picks top-3 agents by capability match before `runMixtureOfAgents()`. Reduces agent count from 6→3. |
| **S16-02** | `pipeline-v2.ts` | SARA (ACL 2026) | ANALYST context — `saraCompress()` triggers when context >8000 chars, compresses to 6000 char target. Logs compression ratio. |
| **S16-03** | `pipeline-v2.ts` | HallDetect (arXiv 2026) | Trust score — `hallDetect()` runs after NLI verification. If score >60, caps trust at 50 (hallucination veto). Results stored in `stats.hallDetect`. |
| **S16-04** | `fact-checker.ts` | UFO (AAAI 2026) | Fact-checking — `batchFactCheck()` runs as complementary verification path after LLM batch. Logs supported/refuted/uncertain counts. |
| **S16-05** | `pipeline-v2.ts` | Conductor (Microsoft 2026) | Orchestration — `getWorkflow()` + `pruneOptionalSteps()` runs at pipeline start. Deterministic budget-aware step pruning. Zero LLM tokens. |
| **S16-06** | `local-judge.ts` | JudgeArena (arXiv 2026) | Judge calibration — `calibrateLocalJudge()` computes Cohen's κ + Spearman ρ. Warns if κ <0.4 (needs recalibration). |
| **S16-07** | `knowledge-graph.ts` | PathMind (AAAI 2026) | KG reasoning — `reasonWithPathMind()` uses beam search with A*-style priority. Returns ranked paths + natural language reasoning chain. |
| **S16-08** | `self-evolver.ts` | GMPO (ACL 2026) | Prompt optimization — `optimizeAgentPrompt()` runs gradient-guided multi-judge optimization. Replaces deleted DSPy. |

### New Trust Score Veto

| Veto | Condition | Cap |
|------|-----------|-----|
| HallDetect | Hallucination risk score >60 | 50 |

### Pipeline Flow (Updated)

```
QUERY → Conductor (workflow selection + budget pruning)
  → CONTEXT_PRIMER → SCOUT → RANK → READER
  → ANALYST (GoA agent selection + SARA compression + REFRAIN early-stop)
  → CRITIC → DEBATE → EDITOR
  → CITATION_VERIFY → FACT_CHECK (UFO multi-source) → CLAIM_GROUNDING
  → TRUST SCORE (NLI + HallDetect + Symbolic + Critic vetoes)
  → PUBLISH
```

---

## �🚀 Innovation & Gap-Closure Layer (2026-08 Sprint 15)

Sprint 15 integrates **10 innovations from 2026 research** (ACL, ICLR, AAAI, arXiv) and closes **5 internal gaps** identified by a comprehensive codebase audit. All 15 items compile with 0 TypeScript errors.

### S15 — External Innovations (New Modules)

| Fix | File | Paper | Description |
|-----|------|-------|-------------|
| **S15-01** | `refrain.ts`, `analyst-multipass.ts` | REFRAIN (ACL 2026) | Adaptive early-stopping for CoT — if Pass 2 yield <15%, skip Pass 3 and use lightweight synthesis. Saves ~30% ANALYST cost on simple queries. Training-free. |
| **S15-02** | `graph-of-agents.ts` | GoA (ICLR 2026) | Graph-based agent selection — selects top-3 agents by capability match instead of all N. Directed message passing + graph-based pooling. Outperforms MoA with fewer agents. |
| **S15-03** | `conductor-orchestrator.ts` | Conductor (Microsoft 2026) | Deterministic YAML-style orchestration — zero LLM tokens for orchestration. Brief and Strategic workflows with budget-aware step pruning. Alternative to LLM-driven Meta-Controller. |
| **S15-04** | `sara-compression.ts` | SARA (ACL 2026) | Selective context compression — extracts factual snippets (numbers, entities) + semantic compression for remaining budget. -17% tokens with +13% correctness. |
| **S15-05** | `judge-arena.ts` | JudgeArena (arXiv 2026) | Statistical judge calibration — Cohen's κ + Spearman ρ instead of exact match. Confidence intervals with 95% CI. Reliability bucketing (high/medium/low). |
| **S15-06** | `ufo-factcheck.ts` | UFO (AAAI 2026) | Multi-source fact-checking — plug-and-play sources (human, web, LLM, database, KG). Dynamic source selection per claim type. Aggregate verdict with confidence. |
| **S15-07** | `hall-detect.ts` | HallDetect (arXiv 2026) | Lightweight reference-free hallucination detection — decomposed entailment + contradiction detection + unsupported claim detection. Complements mDeBERTa NLI. |
| **S15-08** | `gmpo-optimizer.ts` | GMPO (ACL 2026) | Gradient-guided multi-judge prompt optimization — replaces deleted DSPy. First-order gradient approximation + multi-judge selection. 27-79% smaller prompts. |
| **S15-09** | `nestbrowse.ts` | TheCrawler (2026) | Replaced stub with real implementation — fetch + HTML parsing + Schema.org JSON-LD fallback. Extracts text, links, and structured content. No more placeholder data. |
| **S15-10** | `pathmind-kg.ts` | PathMind (AAAI 2026) | KG path reasoning — retrieve-prioritize-reason with A*-style priority function. Beam search over KG with semantic future-cost estimation. Enhances EvoMemKG. |

### S15 — Internal Gap Closures

| Fix | File | Issue | Solution |
|-----|------|-------|----------|
| **S15-11** | `pipeline-v2.ts` | Witness was opt-in (`useWitness=false` by default) | Auto-activates for strategic queries with budget >$2. Full metacognitive observer now active. |
| **S15-12** | `pipeline-v2.ts` | Synapse memory implemented but never imported | `buildSynapseMemoryInjection()` now called alongside episodic memory in ANALYST context. |
| **S15-13** | `pipeline-v2.ts` | 8 trust score weights hardcoded | All weights now configurable via env vars (`TRUST_W_COVERAGE`, `TRUST_W_GROUNDEDNESS`, etc.) with defaults matching original values. |
| **S15-14** | `source-quality.ts` | Crossref retraction check was TODO | `checkCrossrefRetraction(doi)` queries Crossref API for retraction type/assertions. `scoreSource` now async. |
| **S15-15** | `agent-memory.ts` | `preferredProviders` was always `[]` (TODO) | `getProviderPerformance()` queries AgentAuditLog, computes success rates, populates preferred (>70%) and avoid (<30%) lists. |

### New Trust Score Dimensions (Available)

The trust score now supports configurable weights per domain via environment variables:

| Weight | Default | Env Var |
|--------|---------|---------|
| Citation coverage | 15% | `TRUST_W_COVERAGE` |
| Groundedness | 22% | `TRUST_W_GROUNDEDNESS` |
| Fact-check | 12% | `TRUST_W_FACT` |
| NLI | 12% | `TRUST_W_NLI` |
| Source check | 8% | `TRUST_W_SOURCE_CHECK` |
| Diversity | 9% | `TRUST_W_DIVERSITY` |
| Quality | 12% | `TRUST_W_QUALITY` |
| Critic | 10% | `TRUST_W_CRITIC` |

---

## 🧪 Orchestration & Integration Layer (2026-08 Sprint 14)

A comprehensive audit of all pipeline modules identified **dead code, unclosed learning loops, and missing orchestration gates**. Sprint 14 closes these gaps, integrating 6 previously-orphaned innovations and adding 4 new quality gates.

### S14 — Integration & Orchestration Fixes

| Fix | File | Description |
|-----|------|-------------|
| **S14-A** | `pipeline-v2.ts`, `symbolic-verifier.ts` | **Symbolic verification integrated** (NSRSA arXiv 2026) — deterministic arithmetic/temporal/comparative checks now run before NLI verifier; trust score veto if score <70% |
| **S14-B** | `pipeline-v2.ts`, `agent-memory.ts` | **Learning loop closed** — `recordAgentPerformance()` + `extractLessons()` + `storeLesson()` now called after pipeline completion (were imported but never invoked, leaving the learning loop open) |
| **S14-C** | `pipeline-v2.ts`, `lesson-verifier.ts` | **LUCID lesson verification** (2026) — `verifyAndDeInflateLessons()` runs every ~10 runs to prevent memory reward inflation (incorrect lessons accumulating unchecked) |
| **S14-D** | `reader-agent-v3.ts` | **News article retry logic** — 2 retries with exponential backoff + jitter, 20s timeout (was 0 retries, 12s timeout); also added Schema.org JSON-LD extraction fallback |
| **S14-E** | `pipeline-v2.ts` | **Critic agent made actionable** — verdict "reject" now caps trust at 50; verdict "repair" with score <40 flags actionable repair for editorial phase |
| **S14-F** | `pipeline-v2.ts` | **EDITORIAL quality gate** — pre-render check on critic verdict/score; logs quality warning before HTML rendering (was no gate) |
| **S14-G** | `pipeline-v2.ts` | **Test-Time Scaling** (ICLR 2026 — Zeng et al.) — strategic queries with sufficient budget now generate 2 ANALYST candidates and pick the one with better citation coverage |
| **S14-H** | `pipeline-v2.ts`, `chain-verification.ts` | **Chain-of-Verification integrated** (CoVe — Meta ACL 2024) — extracts claims and generates verification questions for strategic queries (diagnostic transparency) |
| **S14-I** | `btprop-hallucination.ts` | **BTProp TS errors fixed** — import paths and LLMTask types verified (file was already compilable) |
| **S14-J** | (deleted) | **Dead code removed** — `evomemkg.ts` (duplicate of knowledge-graph.ts), `reflective-rag.ts` (duplicate of cross-model-consensus.ts), `dspy-optimizer.ts` (duplicate of prompt-optimizer/), `tree-of-thoughts.ts` (unused), `adas/` directory (unused) |

### New Trust Score Veto Layers

| Veto | Condition | Cap |
|------|-----------|-----|
| Symbolic verification | Arithmetic/temporal errors with score <70% | 55 |
| Critic reject | Verdict = "reject" | 50 |
| Grounding veto (existing) | Groundedness < 0.15 | 45 |
| Provider diversity veto (existing) | < 3 distinct providers | 60 |

---

## 🔬 Deep Audit Corrections Layer (2026-08 Sprint 13)

A comprehensive audit of the pipeline identified and fixed critical bugs and high-impact improvements across all phases. All fixes are backed by 2026 research:

### P0 — Critical Bug Fixes

| Fix | File | Description |
|-----|------|-------------|
| **P0-A** | `pipeline-v2.ts` | Integrity propagation bug — `stats.citationVerifier.integrity` now always updated after repair (was stale when repair made 0 modifications) |
| **P0-B** | `analyst-multipass.ts` | Self-refine multi-iteration (FineRef AAAI 2026) — 3 iterations with re-verification, only accepts if metrics actually improved |
| **P0-C** | `unified-llm.ts` | Auto-suspend dead providers (VeriSwarm/Cortex 2026) — 5 failures → 24h suspension (was 60s cooldown, causing retry storms on dead providers) |

### P1 — High-Impact Improvements

| Fix | File | Description |
|-----|------|-------------|
| **P1-D** | `pipeline-v2.ts` | Groundedness weight 16%→22%, citation coverage 20%→15% (GroundEval 2026 — quality of grounding > quantity of citations) |
| **P1-E** | `reader-agent-v3.ts` | PDF extraction retry (pdfmux 2026) — 2 retries with exponential backoff + 30s timeout (was 15s, 0 retries) |
| **P1-F** | `pipeline-v2.ts` | Debate quality gate (D3 EACL 2026) — re-run debate if steel-man <50 with adversarial boost prompt |
| **P1-G** | `citation-verifier.ts` | CiteGuard threshold 0.15→0.35 (CiteGuard ACL 2026) — reduces false positives in citation injection |
| **P1-H** | `topic-radar.ts` | Radar Global South sources (BENI Global 10) — +19 feeds (AfDB, ADB, CAF, ISS Africa, SAIIA, ORF, ISEAS, Al-Monitor, etc.) + 5 GDELT verticals (Africa, Latin America, Southeast Asia, Middle East, South Asia) |

### P2 — Optimizations

| Fix | File | Description |
|-----|------|-------------|
| **P2-I** | `pipeline-v2.ts` | SCOUT neural routing opt-out (was opt-in) — always selects 12 most relevant providers unless `no-routing` flag |
| **P2-J** | `pipeline-v2.ts` | Provider diversity veto — <3 distinct providers → cap trust at 60 |
| **P2-K** | `pipeline-v2.ts` | Query diversification threshold 5→3 — activates more often |
| **P2-L** | `unified-llm.ts` | Dynamic dead providers via circuit breaker state — `isProviderSuspended()` + `getSuspendedProviders()` exported for SCOUT |

### Verification

- TypeScript: 0 errors
- Pipeline test: trust score 85 (up from 84), 83 sources, $0.029, 37 min
- All new features observed in logs: Neural routing, Submodular diversification, Circuit breaker trips, Global South GDELT queries

---

## � Radar Innovations Layer (2026-08 Sprint 7)

State-of-the-art signal detection and provider orchestration innovations from recent research, implemented in `lib/agent/radar-innovations.ts`:

### C: Temporal Signal Trajectories (ACL 2026 — Navasartian)
Classifies topics as **emerging/bursting/stable/fading/new** based on mention velocity across runs. Burst ≠ emerging (bursts signal consolidation, not early detection). Integrated into `topic-radar.ts` — each topic gets a `trajectory` field and velocity-based score boost.

### A: BERTrend Velocity Scoring (RTE-France 2024)
Delta-based scoring: compares mention count between current run and previous runs. Exponential decay if no updates. Emerging topics (velocity 1.5-3.0×) get +15, new topics get +8, bursting get +5, stable get +2, fading get +0.

### B: Anticipatory Outliers (LREC 2026 — Zve et al.)
Topics that don't match any existing cluster are flagged as "anticipatory outliers" — early signals of emerging narratives. Topics that were outliers in previous runs but now match a cluster get +12 ("graduated" boost). Pure outliers get +8.

### I: Domain-Aware Credibility (GroundCheck 2026)
Source credibility scored differently per domain:
- **academic** → DOI(0.45) + title_search(0.30) + URL(0.10) + AI(0.15)
- **news** → URL(0.35) + AI(0.65) — paywalled articles can still be credible
- **government** → URL(0.40) + AI(0.60)
- **think-tank** → URL(0.30) + title_search(0.10) + AI(0.60)

Integrated into `sourcecheck.ts` via `scoreSourceCredibility()`.

### D: Neural Source Routing (RAGRoute 2025)
Lightweight provider selection: given a query, select the 12 most relevant providers instead of querying all 58+. Two modes: keyword-based (fast, deterministic) and LLM-based (smarter, uses flash model). Integrated into SCOUT (`pipeline-v2.ts`) — activates when caller passes a small/default provider set.

### F: Submodular Query Diversification (HERO, LREC 2026)
Facility-location objective to maximize query diversity with mathematical guarantees (1-1/e approximation). When SCOUT has >5 query variations, selects a diverse subset of 5 using greedy maximization with a relevance-diversity trade-off parameter (λ=0.4).

### J: Capability-Aware LLM Failover (DVARA pattern)
Filters the fallback chain by what the request actually needs. If the request uses tools, only tool_calling-capable providers are considered. If jsonMode, only structured_output-capable providers. Integrated into `unified-llm.ts` `callLLM()`.

### Files

| File | Purpose |
|------|---------|
| `lib/agent/radar-innovations.ts` | All 7 innovations (C, A, B, I, D, F, J) |
| `lib/agent/topic-radar.ts` | Integrates C, A, B, I into radar sweep |
| `lib/agent/pipeline-v2.ts` | Integrates D, F into SCOUT |
| `lib/agent/sourcecheck.ts` | Integrates I into source verification |
| `lib/llm/unified-llm.ts` | Integrates J into LLM fallback chain |

---

## �🛡️ Provider Resilience Layer (2026-08 Sprint 6)

## Agent Intelligence Layer (2026-08 Sprint 8)

11 state-of-the-art innovations from ACL 2026, arXiv 2026, and AAAI 2026, integrated into the core reasoning, verification, memory, and orchestration modules:

### K1: PRISM-MCTS — Dynamic Shared Memory (ACL 2026, Cheng et al.)
LATS tree search now captures **Heuristics** (successful strategies) and **Fallacies** (error patterns) across rollouts in a dynamic shared memory. Future rollouts benefit from past experience, halving the number of simulations needed. Integrated via `runLATSWithPrism()` in `lib/agent/lats/tree-search.ts`.

### K2: MOSA — Multi-LLM Collaborative MCTS (ACL 2026, Yang et al.)
Multiple LLMs (DeepSeek, GLM, Kimi) explore the reasoning tree in parallel, share their best branches after each round, and refine in subsequent rounds. Combines independent exploration with collaborative refinement. New module: `lib/agent/lats/mosa.ts`.

### K3: REFRAIN — Adaptive Early-Stopping (ACL 2026, Sun et al.)
SW-UCB multi-armed bandit dynamically adjusts the stopping threshold according to problem difficulty. Two arms ("stop" / "continue") with sliding-window UCB1 selection. 20-55% token reduction. In `lib/agent/budget-forcing.ts` via `refrainDecide()`.

### K5: Dynamic Role Assignment (arXiv 2026)
Meta-debate selects the most relevant specialist agents per query: (1) proposal — each agent argues why it's relevant, (2) peer review — scoring. +74.8% over uniform assignment. In `lib/agent/moa/mixture-of-agents.ts` via `selectAgentsDynamically()`.

### K7: Quadratic Voting (NSED, arXiv 2026)
Non-linear consensus: each specialist gets voice credits proportional to reliability, spends them quadratically on issues they care about most. Minority positions with strong conviction can still influence outcomes. In `lib/agent/moa/mixture-of-agents.ts` via `computeQuadraticVotes()`.

### K8: CiteGuard — Retrieval-Aware Citation Validation (ACL 2026)
Reframes citation verification as attribution alignment: searches for additional candidate sources and checks if the cited source is the best match. +10pp over LLM-as-Judge, approaches 68.1% accuracy (vs 69.2% human). In `lib/agent/citation-verifier.ts` via `citeGuardValidation()`.

### K9: FRANQ — Faithfulness-Aware Uncertainty Quantification (ACL 2026)
Separates factuality (is it true?) from faithfulness (is it supported by sources?). Different UQ techniques for faithful vs unfaithful statements. Avoids labeling factually correct statements as "hallucinations" just because they aren't in the retrieval. In `lib/agent/citation-verifier.ts` via `assessWithFranq()`.

### K10: CARE — Context-Aware Retriever Evaluation (arXiv 2026, Brehme et al.)
Evaluates retriever quality for multi-hop queries: individual relevance, combined coverage, multi-hop potential, coverage diversity. Identifies "hidden gems" (individually irrelevant but collectively essential sources). In `lib/agent/relevance-scorer.ts` via `evaluateWithCARE()`.

### K11: WorldEvolver — Self-Evolving World Model (arXiv 2026)
Three modules: (1) Episodic Memory — retrieval-based simulation from real action transitions, (2) Semantic Memory — heuristic rules extracted from prediction-observation mismatches, (3) Selective Foresight — filters low-confidence predictions before injection. In `lib/agent/world-model/world-model.ts`.

### K12: EvoMemKG — Dual-Layer Evolvable Memory (ACL 2026, Tian et al.)
Working Memory compresses retrieved triplets via clustering (linearizes exponential state space). Experience Memory abstracts historical reasoning paths into reusable strategies. +20% on complex multi-hop queries. In `lib/agent/knowledge-graph.ts`.

### K13: MAGE — Co-Evolutionary Knowledge Graph (arXiv 2026)
Four-subgraph co-evolutionary KG: (1) Experience (corrections + success traces), (2) Skill (UCB1 task-level search bandit), (3) Curriculum (mastery tracking), (4) Performance (metrics over time). Frozen backbone, evolving graph. In `lib/agent/self-evolver.ts`.

### K15: C3PO — Cost-Controlled Cascade (arXiv 2026)
Cascaded inference: cheap model first, escalate to expensive model only if confidence is low. Conformal prediction bounds the probability of exceeding budget. Self-supervised (no labels needed). In `lib/llm/unified-llm.ts` via `callLLMWithCascade()`.

### Files Modified (Sprint 8)

| File | Innovations |
|------|-------------|
| `lib/agent/budget-forcing.ts` | K3 (REFRAIN SW-UCB bandit) |
| `lib/agent/moa/mixture-of-agents.ts` | K5 (Dynamic Role Assignment), K7 (Quadratic Voting) |
| `lib/agent/relevance-scorer.ts` | K10 (CARE context-aware evaluation) |
| `lib/agent/lats/tree-search.ts` | K1 (PRISM-MCTS shared memory) |
| `lib/agent/lats/mosa.ts` | K2 (MOSA multi-LLM collaborative MCTS) — **new file** |
| `lib/agent/lats/index.ts` | Exports for K1, K2 |
| `lib/agent/citation-verifier.ts` | K8 (CiteGuard), K9 (FRANQ) |
| `lib/agent/knowledge-graph.ts` | K12 (EvoMemKG dual-layer memory) |
| `lib/agent/world-model/world-model.ts` | K11 (WorldEvolver self-evolving world model) |
| `lib/agent/self-evolver.ts` | K13 (MAGE co-evolutionary KG) |
| `lib/llm/unified-llm.ts` | K15 (C3PO cascade with conformal prediction) |

---

The system includes a **production-grade resilience layer** for all 200+ academic API providers:

### Architecture (3 layers)

| Layer | Module | Purpose |
|-------|--------|---------|
| **HTTP Client** | `lib/http-client.ts` | Retry with jitter, circuit breaker (Redis-backed), rate limiting |
| **Provider Queue** | `lib/agent/provider-queue.ts` | Backpressure control (p-limit), request dedup, concurrency caps |
| **Resilience** | `lib/agent/resilience.ts` | Cockatiel bulkhead isolation, adaptive rate limiting |

### Key Features

- **Jitter in all retries** (75%-125% of base delay) — prevents retry storms
- **Circuit breaker persisted to Redis** — survives restarts, shared across instances
- **Provider queue with backpressure** — global cap (30 concurrent) + per-provider caps (5-10)
- **Request deduplication** — same query+provider = 1 call (in-memory Map)
- **Cohere rerank with 2 retries** — exponential backoff + jitter before falling back to local scoring
- **Crossref polite pool** — mailto parameter injected automatically (10 req/s vs 5 req/s)
- **Adaptive rate limiting** — reduces rate by 50% on 429, recovers by 20% after 5 successes
- **Cockatiel bulkhead** — per-LLM-provider concurrency isolation (deepseek=5, glm=3, kimi=3)

### Migrated Modules (Sprint 6 Phase 2)

All external API calls now go through `fetchFromProvider` / `httpPost`:

| Module | Calls | Providers |
|--------|-------|-----------|
| `lib/agent/topic-radar.ts` | 5 | GDELT, RSS, OpenAlex, arXiv, Semantic Scholar |
| `lib/agent/sourcecheck.ts` | 3 | Crossref, OpenAlex |
| `lib/agent/series-radar.ts` | 2 | FRED, ECB |
| `lib/agent/realtime-data-hub.ts` | 18 | FRED, WorldBank, WHO, USGS, Open-Meteo, Federal Register, PapersWithCode, EUR-Lex, NVD, GDELT, NASA GISS, ECB |
| `lib/agent/quant-agent.ts` | 4 | Energy Charts, RTE France, Treasury, Energi Data |
| `lib/agent/hero-image.ts` | 1 | OpenAI Image API |
| `lib/twitter/client.ts` | 1 | Twitter API v2 |
| `lib/email.ts` | 1 | Resend |
| `lib/providers/social/*.ts` | 4 | Bluesky, HackerNews, Reddit |
| `lib/providers/altmetric.ts` | 1 | Altmetric |
| `lib/providers/overton.ts` | 2 | Overton |
| `lib/providers/foreign/wanfang.ts` | 1 | Wanfang |
| `lib/providers/independent-media-provider.ts` | 2 | RSS, GDELT |
| `lib/providers/academic/*.ts` | 11 | Foundational sources, foresight, PubMed, OpenAlex, arXiv |
| `lib/providers/institutional/*.ts` | 5 | WHO, Legifrance, Terra Nova, Vie Publique, OECD |
| `lib/providers/macro/*.ts` | 3 | INSEE, Eurostat, ECB |
| `lib/providers/data/*.ts` | 2 | Zenodo, Figshare |
| `lib/providers/business/*.ts` | 3 | TechCrunch, Reuters, CrunchBase |
| `lib/providers/*.ts` | 8 | Dimensions, Lens, DataCite, Tavily, Apitube, Exa, Linkup, Wikidata |

**Total: 70+ external API calls migrated to resilient HTTP client**

### Rate Limiters Configured

75+ providers with per-provider rate limiting (token bucket algorithm):
- Academic: OpenAlex (10 req/s), Crossref (8 req/s), Semantic Scholar (1 req/s), arXiv (3 req/s), PubMed (3 req/s)
- Data: FRED (5 req/s), ECB (5 req/s), World Bank (5 req/s), Eurostat (5 req/s), INSEE (5 req/s)
- Realtime: GDELT (1 req/s), USGS (5 req/s), Open-Meteo (10 req/s), NVD (2 req/s)
- Social: Bluesky (3 req/s), HackerNews (3 req/s), Reddit (1 req/s)
- Other: Altmetric (3 req/s), Overton (2 req/s), Resend (5 req/s), Twitter (1 req/s)

### Dependencies

- `p-limit` — lightweight concurrency limiter
- `cockatiel` — resilience patterns (bulkhead, retry, circuit breaker)
- `bullmq` — Redis-backed job queue (available for future background workers)
- `rate-limiter-flexible` — distributed rate limiting (available for future Redis-backed limits)

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

### Offline funnel regression checks

- Run `npx jest --runInBand --runTestsByPath __tests__/lib/agent/funnel-regressions.test.ts` for mocked publication, trust, repair-budget, numerical sanitation, and HTTP diagnostic checks. No live database or paid model calls are required.
- `stats.criticalLoop.finalScore` is the terminal 0–100 trust score. Funnel extraction must preserve it, including critic/NLI vetoes, rather than re-blend it upward.
- Publication holds, failed readiness, and rejected required sign-off remain blocking at persistence, even when advisory warning branches propose publication.
- Simulation convergence and synthetic confidence intervals do not establish predictive calibration. Validate against resolved forecasts before claiming empirical calibration.

### Central scenario publication contract

- The editorial arbiter selects one exact scenario name, provides a cited `centralScenarioRationale`, implications, a horizon and observable revision triggers. `resolveCentralScenario` validates the choice; probability fallback alone is not publishable.
- Monte Carlo is advisory for the central-scenario path: store disagreements and the simulation report without overwriting the editorial distribution. This supersedes the earlier Sprint 17 instruction to overwrite the displayed editorial probabilities.
- Persist `institutePosition`, `centralScenario` and `centralScenarioRequired` in pipeline stats/brief lineage. The inquiry wrapper reuses completed simulations, preserves source index order, and clears its legacy simulation deadline timer. Register the central narrative, horizon and falsification triggers as a prediction with no invented numerical probability.
- The publication gate checks both structured decision and final rendered central block. Missing narrative, rationale references, horizon, implications or revision triggers causes a hold. Alternatives remain secondary/collapsed.
- Offline tests: `npx jest --runInBand --runTestsByPath __tests__/lib/agent/central-scenario.test.ts __tests__/lib/agent/central-scenario-pipeline.test.ts __tests__/lib/agent/funnel-regressions.test.ts`.
- Infrastructure limitation: Netlify scheduled functions await the synchronous Next.js cron routes, which await the entire think-tank cycle. Local long-run success does not validate hosting time limits; long jobs require a durable worker or checkpointed execution. No hosting migration is performed by the central-scenario change.

### Durable worker (job queue)

- `lib/worker/durable-worker.ts` — atomic claim (PENDING or stale RUNNING lock), 2-min heartbeat lock renewal, retry with exponential backoff, `JobDeadLetter` on exhausted attempts.
- `lib/worker/job-handlers.ts` — registers `THINK_TANK_CYCLE` → `runThinkTankCycle` and `STUDIOX_PIPELINE` → `processStudioXOrder`. Import only from the worker entrypoint (pulls the whole pipeline graph).
- `lib/worker/think-tank-queue.ts` — `enqueueThinkTankCycle({mode})`: idempotent per ISO week (weekly) or 12h window (breaking); refuses to enqueue while a cycle holds a live lock.
- Cron routes (`/api/cron/generate-briefs`, `/api/cron/auto-scan`) enqueue → 202 by default. `POST ?sync=1` or `THINK_TANK_INLINE=1` runs inline for local/manual use. `GET ?jobId=<id>` returns job status.
- Run the worker: `npm run worker:pipeline` (loop) or `npm run worker:pipeline:once` (single pass). Needs `DATABASE_URL` + LLM/provider env — deploy on any always-on host; it does NOT run on Netlify (functions cap at 15 min vs 45–75 min cycles).
- Offline tests: `npx jest --runInBand --runTestsByPath __tests__/lib/worker/durable-worker.test.ts`.

### Monte Carlo calibration fix

- `runMonteCarloCore` previously used winner-take-all argmax over a score that double-counted the prior (auto-derived assumptions were generated FROM the prior, then `prior*0.5` was added) — priors 40/30/20/10 collapsed to ~82/16/2/0 with no new evidence.
- Now: per-run Dirichlet draw around priors (`priorConcentration`, default 8) × evidence weight → categorical winner sampling. Auto-derived assumptions contribute neutral evidence; only explicit assumptions and source-graph overlap differentiate. Verified: neutral evidence preserves priors; matching assumptions move probability toward the favored scenario.
- Still true: convergence of win-frequencies is NOT predictive calibration — validate against resolved forecasts before claiming empirical accuracy.


### Cost-safety & containment (crash-loop audit)

Production crash-loop root cause (verified via probe): Railway cgroup ~954MB vs Node heap ceiling 6.4GB → SIGKILL mid-phase → reclaim re-billed all non-checkpointed work.

- `lib/worker/execution-scope.ts` — AsyncLocalStorage execution scope: `withExecutionSignal`/`withExecutionDeadline` propagate abort through handlers; `assertExecutionActive()` throws on lost lease; `consumeExecutionBudget(key, limit)` counts spend per scope (fresh ledger per job attempt; unscoped callers share an hourly-resetting global ledger).
- `lib/http-client.ts` — global `pLimit` in-flight cap (`HTTP_MAX_INFLIGHT`, default 24), 8MB response cap covering chunked bodies, timeout covers body read, per-upstream attempt budgets (`HTTP_BUDGET_OPENALEX`=150, `HTTP_BUDGET_SEMANTICSCHOLAR`/`HTTP_BUDGET_CROSSREF`=120, `HTTP_BUDGET_DEFAULT`=200) + `HTTP_MAX_REQUESTS_PER_EXECUTION`=1500. Budget exhaustion throws non-retryable `HttpError(code=HTTP_BUDGET_EXHAUSTED)`.
- `lib/worker/think-tank-queue.ts` — strict zod payload (mode/maxPublications/budgetUsd only); failed/cancelled/dead-lettered jobs return `requires_manual_review`, never auto-reset.
- `lib/agent/durable-execution.ts` — step rows keyed `runId::step` with delete-before-create (no duplicate stacking across reclaims); >512KB payloads go to `DURABLE_STEP_BLOB` rows (never tmpdir — wiped on restart); missing payload or failed persist → throw (no silent paid replay); `markDurableComplete` purges blobs.
- `lib/llm/unified-llm.ts` — per-scope in-flight coalescing (WeakMap keyed on the execution signal); `callLLM` asserts active scope; provider calls get the signal via `withExecutionDeadline` → real SDK abort.
- `lib/worker/durable-worker.ts` — `assertWorkerMemoryLimits(heap, cgroup)` at boot: refuses jobs if heap ceiling >65% of cgroup or unknown. `emitProgress` touches `pipelineRun.updatedAt` (sweeper no longer kills live runs). Completion/retry writes guarded by `updateMany` on (id, RUNNING, lockedBy, unexpired lock) — a cancelled job cannot be resurrected to COMPLETED.
- `Dockerfile.worker` — `node:22-bookworm-slim` (matches engines >=22.12), `NODE_OPTIONS=--max-old-space-size=448` + same flag on CMD; `node --import tsx` = PID 1 (npm/npx wrappers swallowed SIGTERM).
- `lib/providers/feeds/feed-engine.ts` — feeds fetch via `httpGet` (semaphore + budget + abort) instead of `parser.parseURL`.
- Env knobs: `HTTP_MAX_INFLIGHT`, `HTTP_BUDGET_<UPSTREAM>`, `HTTP_MAX_REQUESTS_PER_EXECUTION`, `NODE_OPTIONS`.
- Verified offline: 31 suites / 354 tests. NOT verified locally: real Railway cgroup behavior (no Docker), live 429/credit exhaustion, Neon bandwidth under real checkpoint sizes — confirm via boot probe + WORKER_MEM telemetry on next deploy.

### Free-tier LLM operations (verified live)

- Freepool cascade order: groq → cerebras → nvidia → openrouter → mistral (only endpoints with keys are active). `OPENROUTER_API_KEY` is configured on Railway; the only `:free` models verified working on this account are `nvidia/nemotron-3.5-lightning:free` (reasoning model — needs `tokenHeadroom` on the endpoint or low max_tokens returns the thinking trace as content) and `liquid/lfm-2.5-2.6b:free` (unreliable — output sometimes lands in `reasoning` with empty `content`). `meta-llama/llama-3.3-70b-instruct:free` is gone from the free catalog (404); gemma/qwen `:free` entries returned provider errors on this account.
- `PROVIDER_DEFAULT_TIMEOUT_MS.freepool = 240s` — the cascade window must outlast a slow reasoning endpoint; 90s aborted openrouter calls at the boundary.
- Daily-quota 429s (Groq TPD 200k) suspend the provider for the parsed retry window only (~minutes), not 24h. Circuit-breaker keys are namespaced (`CB v2`) — bump the namespace to flush stale suspensions when Redis is unreachable.
- Early-refusal contract: a multipass failure returns `_meta.failed` and `pipeline-v2` refuses immediately (`analysis_generation_failed`) — no render/editorial/regen burn on a stub, and raw provider errors never reach artifact text. Rank-level refusal marks the PipelineRun FAILED with the refusal reason; without that update the row stays RUNNING until the 45min sweep → `error:null` zombie runs.
- `trend-analyzer` dedups TREND_BREAK signals on (type+title) within the 14-day TTL — the same break condition otherwise re-dispatched a doomed memo every ~15min.
- **Per-endpoint quota cooldowns** (`ENDPOINT_COOLDOWNS` in `callFreepool`): a quota-dead endpoint is skipped until its reset — Groq "try again in Xm" hints, OpenRouter `free-models-per-day` → next UTC midnight (limit is account-level, `X-RateLimit-Limit: 50`/day without credits), other 429s → 5min. Non-quota errors never cool an endpoint. When every configured endpoint is cooled, `getFreepoolAliveEndpoints()` returns empty and the pipeline preflight aborts before burning retrieval budget.
- **OpenRouter `models` fallback array**: requests carry the verified `:free` list (lightning → super-120b → ultra-550b → lfm-2.5 → `openrouter/free` router) so gateway-side failover covers dead/overloaded models within a single request.
- **Deep-planner node scouts run in a bounded pool (concurrency 3)** — parentIds only feed the expansion-query context, never scout() input; thin-node expansion stays a sequential second pass so ancestor sourceIds are populated.
- **Paid-mode findings (live pass, ~$1.5, cap $3/day)**: `GLM_BASE_URL` default is `https://api.z.ai/api/paas/v4` — `api.z.ai/v1` returns nginx 404, which is why GLM appeared dead and everything cascaded to freepool. With GLM alive the whole bulk tier (reader/critic/delphi/enhancement) runs at ~$0.0003-0.003/call with prefix-cache hits. Verified solvent lanes: OpenAI (gpt-6-*), DeepSeek (chat+reasoner), Kimi (kimi-k3), GLM. Dead: Anthropic (credit), Moonshot catalog names, Google gemini-3.8-flash (transient 503). Terminal provider states must session-latch: LinkUp "insufficient funds" and IMF-SDMX catalog failures now short-circuit instead of retrying per query. `isProviderHealthy` is consulted at scout scheduling — a blacklisted provider no longer burns 90s deadline slots.
