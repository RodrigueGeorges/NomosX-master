/**
 * Inquiry Orchestrator — Publication funnel (shared infrastructure)
 * ───────────────────────────────────────────────────────────────────
 *
 * PRODUCT HIERARCHY:
 *   PRIMARY  → ThinkTankDispatcher (autonomous crons)
 *   ADD-ON   → Studio — on-demand, quota-based
 *
 * Flow: VALIDATE → RUN (inquiry-pipeline) → GATE → PERSIST
 * All paths MUST use runAndPublishInquiry().
 */

import type { Prisma } from "@prisma/client";
import { certifyForReserve, releaseReservedPublication } from './publication-reserve';
import { prisma, withDbRetry } from "@/lib/db";
import { assertExecutionActive } from '@/lib/worker/execution-scope';
import {
  runInquiryPipeline,
  type InquiryPipelineResult,
  type RunInquiryPipelineInput,
} from "./inquiry-pipeline";
import {
  normalizeTopicKey,
  countWordsHtml,
  depthToPublicationType,
  extractPipelineScores,
  getPipelineCostUsd,
} from "./inquiry-funnel-utils";
import { evaluatePublicationGate, type PublicationGateResult } from "./publication-gate";
import { evaluatePublicationReadiness } from "@/lib/publication-visibility";
import { requestResearcherSignOff, type SignOffResult } from "./researcher-ownership";
import { buildForesightPersistPayload, persistForesightRun, type ForesightBundle } from "@/lib/foresight";
import type { Inquiry, InquiryDepth } from "@/lib/types/inquiry";
import type { Providers, StrategicPipelineOptions } from "./pipeline-v2";

// ─── Request / Response ──────────────────────────────────────

export type InquiryPublishSource =
  | "auto-scan"
  | "generate-briefs"
  | "studio"
  | "auto-publisher"
  | "manual";

export type InquiryPublishStatus =
  | "published"
  | "ready"
  | "held"
  | "draft"
  | "review"
  | "failed"
  | "skipped_duplicate"
  | "skipped_dry_run";

export interface InquiryPublishRequest {
  question: string;
  delivery?: 'immediate' | 'reserve';
  releaseFromReserve?: { slotKey: string; publicationId?: string };
  depth?: InquiryDepth;
  domain?: string;
  verticalId?: string;
  verticalSlug?: string;
  /** Link publication to originating signal */
  signalId?: string;
  providers?: Providers;
  perProvider?: number;
  pipelineOptions?: StrategicPipelineOptions;
  source: InquiryPublishSource;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
  requireResearcherSignOff?: boolean;
  minTrustScore?: number;
  /** Bypass title/brief dedup (admin / forced re-run) */
  skipDuplicateCheck?: boolean;
  /** Pre-seeded source IDs (from Signal or prior scout) */
  seedSourceIds?: string[];
}

export interface InquiryPublishResult {
  status: InquiryPublishStatus;
  inquiry?: Inquiry;
  briefId?: string;
  publicationId?: string;
  publicId?: string;
  /** Signal the published artifact is attached to — a reserve release may
   * serve a publication owned by a DIFFERENT signal than the dispatch item. */
  signalId?: string | null;
  trustScore: number;
  qualityScore: number;
  wordCount: number;
  costUsd: number;
  durationMs: number;
  gate?: PublicationGateResult;
  readinessOk?: boolean;
  error?: string;
  duplicateOf?: string;
  pipeline?: InquiryPipelineResult;
}

// ─── Dedup & resolve ─────────────────────────────────────────

async function findPublicationByBriefId(
  briefId: string
): Promise<{ id: string; publicId: string | null } | null> {
  try {
    console.log(`[InquiryOrchestrator] Post-pipeline dedup check for brief=${briefId}...`);
    const match = await withDbRetry(() =>
      prisma.thinkTankPublication.findFirst({
        where: {
          criticalLoopResult: {
            path: ["briefId"],
            equals: briefId,
          },
        },
        select: { id: true, publicId: true },
        orderBy: { createdAt: "desc" },
      })
    );
    console.log(`[InquiryOrchestrator] Dedup check complete: ${match ? `found ${match.id}` : 'no match'}`);
    return match;
  } catch (err) {
    console.warn(`[InquiryOrchestrator] Dedup check failed (continuing):`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function findRecentDuplicateTitle(question: string, withinHours = 168): Promise<string | null> {
  const key = normalizeTopicKey(question);
  if (key.length < 10) return null;

  const since = new Date(Date.now() - withinHours * 3600000);
  const recent = await prisma.thinkTankPublication.findMany({
    where: {
      createdAt: { gte: since },
      status: { in: ["PUBLISHED", "HELD", "DRAFT", "READY"] },
    },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return recent.find((p) => normalizeTopicKey(p.title) === key)?.id ?? null;
}

async function resolveVertical(
  verticalId?: string,
  verticalSlug?: string
): Promise<{ id: string; slug: string } | null> {
  if (verticalId) {
    const v = await prisma.vertical.findUnique({
      where: { id: verticalId },
      select: { id: true, slug: true },
    });
    if (v) return v;
  }
  if (verticalSlug) {
    const v = await prisma.vertical.findUnique({
      where: { slug: verticalSlug },
      select: { id: true, slug: true },
    });
    if (v) return v;
  }
  return prisma.vertical.findFirst({
    where: { isActive: true },
    select: { id: true, slug: true },
  });
}

function mergePipelineOptions(req: InquiryPublishRequest): StrategicPipelineOptions {
  return {
    ...req.pipelineOptions,
    providers: req.providers ?? req.pipelineOptions?.providers,
    perProvider: req.perProvider ?? req.pipelineOptions?.perProvider,
  };
}

function resolveDbStatus(status: InquiryPublishStatus): string {
  if (status === "ready") return "READY";
  if (status === "published") return "PUBLISHED";
  if (status === "draft") return "DRAFT";
  return "HELD";
}

function failResult(
  started: number,
  error: string,
  partial?: Partial<InquiryPublishResult>
): InquiryPublishResult {
  return {
    status: "failed",
    trustScore: 0,
    qualityScore: 0,
    wordCount: 0,
    costUsd: 0,
    durationMs: Date.now() - started,
    error,
    ...partial,
  };
}

// ─── Main funnel ─────────────────────────────────────────────

export async function runAndPublishInquiry(
  req: InquiryPublishRequest
): Promise<InquiryPublishResult> {
  const started = Date.now();
  const depth = req.depth ?? "standard";
  const question = req.question.trim();

  if (req.releaseFromReserve) {
    if (req.dryRun) return { ...failResult(started, 'Reserve release dry run'), status: 'skipped_dry_run' };
    const released = await releaseReservedPublication({ ...req.releaseFromReserve, question: question || undefined, verticalId: req.verticalId });
    if (!released) return failResult(started, 'No fresh validated publication available in reserve');
    const p = released.publication;
    return {
      status: released.alreadyReleased ? 'skipped_duplicate' : 'published',
      publicationId: p.id, publicId: p.publicId ?? undefined, signalId: p.signalId,
      trustScore: p.trustScore, qualityScore: p.qualityScore, wordCount: p.wordCount,
      costUsd: 0, durationMs: Date.now() - started, readinessOk: true,
    };
  }

  if (question.length < 10) {
    return failResult(started, "Question too short (min 10 chars)");
  }

  // 1. Resolve vertical BEFORE pipeline (fail fast — avoid LLM cost)
  const vertical = await resolveVertical(req.verticalId, req.verticalSlug);
  if (!vertical) {
    return failResult(started, "No active vertical found");
  }

  // 2. Pre-flight dedup
  if (!req.skipDuplicateCheck) {
    const titleDup = await findRecentDuplicateTitle(question);
    if (titleDup) {
      console.log(`[InquiryOrchestrator] Skipping duplicate topic → pub ${titleDup}`);
      return {
        status: "skipped_duplicate",
        publicationId: titleDup,
        duplicateOf: titleDup,
        trustScore: 0,
        qualityScore: 0,
        wordCount: 0,
        costUsd: 0,
        durationMs: Date.now() - started,
        error: "Duplicate topic within cadence window",
      };
    }
  }

  if (req.dryRun) {
    return {
      status: "skipped_dry_run",
      trustScore: 0,
      qualityScore: 0,
      wordCount: 0,
      costUsd: 0,
      durationMs: Date.now() - started,
    };
  }

  console.log(
    `[InquiryOrchestrator] RUN depth=${depth} source=${req.source} vertical=${vertical.slug} q="${question.slice(0, 72)}..."`
  );

  // 3. Pipeline
  let pipeline: InquiryPipelineResult;
  let seedSourceIds = req.seedSourceIds;
  if (!seedSourceIds?.length && req.signalId) {
    const signal = await prisma.signal.findUnique({
      where: { id: req.signalId },
      select: { sourceIds: true },
    });
    if (signal?.sourceIds?.length) seedSourceIds = signal.sourceIds;
  }

  try {
    pipeline = await runInquiryPipeline({
      question,
      depth,
      domain: req.domain,
      pipelineOptions: mergePipelineOptions(req),
      seedSourceIds,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[InquiryOrchestrator] Pipeline failed:`, message);
    return failResult(started, message);
  }

  let costUsd = getPipelineCostUsd(pipeline.stats);
  console.log(`[InquiryOrchestrator] Post-pipeline: cost=$${costUsd.toFixed(4)} trust=${pipeline.trustScore} quality=${pipeline.qualityScore} words=${countWordsHtml(pipeline.html)} html=${pipeline.html.length} chars`);

  // 4a. Handle pipeline refusal (insufficient evidence)
  if (pipeline.refusal) {
    console.warn(`[InquiryOrchestrator] Pipeline refused: ${pipeline.refusalReason}`);
    return failResult(started, pipeline.refusalReason || 'Pipeline refused: evidence insufficient', { costUsd });
  }

  // 4. Post-pipeline dedup by briefId (skip if pipeline refused)
  if (!req.skipDuplicateCheck && pipeline.briefId) {
    const briefDup = await findPublicationByBriefId(pipeline.briefId);
    if (briefDup) {
      console.log(`[InquiryOrchestrator] Brief ${pipeline.briefId} already published → ${briefDup.id}`);
      return {
        status: "skipped_duplicate",
        briefId: pipeline.briefId,
        publicationId: briefDup.id,
        publicId: briefDup.publicId ?? undefined,
        duplicateOf: briefDup.id,
        inquiry: pipeline.inquiry,
        pipeline,
        trustScore: pipeline.trustScore,
        qualityScore: pipeline.qualityScore,
        wordCount: countWordsHtml(pipeline.html),
        costUsd,
        durationMs: Date.now() - started,
      };
    }
  }

  // 5. Scores & gate — packaged into `assess` so the bounded regeneration
  // round can re-run the identical evaluation (scores → sign-off → gate →
  // revision round) on a regenerated artifact.
  const assess = async (p: InquiryPipelineResult) => {
    const scores = extractPipelineScores(
      p.stats,
      p.lineage,
      { trustScore: p.trustScore, qualityScore: p.qualityScore }
    );
    let aHtml = p.html;
    let aWordCount = countWordsHtml(aHtml);
    const aSourceIds = p.inquiry.sources.map((s) => s.id);
    const aPubType = depthToPublicationType(depth, p.format);

    const aDa = (p.lineage.devilsAdvocate ?? p.stats.devilsAdvocate) as
      | Record<string, unknown>
      | undefined;
    const aFatal = (aDa?.fatalChallenges as number) ?? 0;

    let aSignOff: SignOffResult | undefined;
    if (req.requireResearcherSignOff) {
      try {
        aSignOff = await requestResearcherSignOff(question, aHtml, scores.trustScore);
      } catch (err: unknown) {
        console.warn(`[InquiryOrchestrator] Sign-off failed:`, err);
        aSignOff = {
          approved: false,
          decision: "revise",
          researcherName: "auto",
          domain: "technology",
          confidence: 0,
          comments: ["Sign-off unavailable — held for manual review"],
          timestamp: new Date(),
          trustScore: scores.trustScore,
        };
      }
    }

    const aTri = (p.stats.triangularJudge as Record<string, unknown> | undefined)?.verdict === 'override_da'
      || (p.stats.triangularJudge as Record<string, unknown> | undefined)?.verdict === 'downgrade';

    const gi = {
      format: aPubType,
      sourceIds: aSourceIds,
      trustScore: scores.trustScore,
      qualityScore: scores.qualityScore,
      citationCoverage: scores.citationCoverage || undefined,
      devilsAdvocateScore: aDa?.publishabilityScore as number | undefined,
      fatalChallenges: aFatal,
      researcherDecision: aSignOff?.decision,
      triangularOverride: aTri,
      domain: req.domain,
      dbClaims: p.readerClaims,
      centralScenario: p.stats.centralScenario as import('./editorial-types').CentralScenarioDecision | undefined,
      requireCentralScenario: p.stats.centralScenarioRequired === true || p.stats.editorialV2 === true,
      // P0/1: verdict evals attached to a replaced artifact version are invalid
      // — the gate hard-fails rather than publish on a stale verdict.
      staleEvaluations: (p.stats.evaluationFreshness as { verdictStale?: string[] } | undefined)?.verdictStale ?? [],
    };

    let g = evaluatePublicationGate({ ...gi, html: aHtml });
    let r = evaluatePublicationReadiness({
      type: aPubType,
      trustScore: scores.trustScore,
      qualityScore: scores.qualityScore,
      citationCoverage: scores.citationCoverage,
      wordCount: aWordCount,
      sourceIds: aSourceIds,
      domain: req.domain,
    });

    // ── REVISION ROUND: a gate failure is routed back to corrective agents
    // instead of ending the run. The controller repairs what it can
    // (deterministic scenario re-render, citation backfill, surgical content
    // edits on DA objections, copy-edit on style violations), then the gate
    // and readiness are re-evaluated on the revised artifact. Bounded. ──
    if (g.decision !== "publish" || !r.ok) {
      try {
        const { reviseForGate } = await import('./revision-controller');
        const revision = await reviseForGate({
          html: aHtml,
          gate: g,
          centralScenario: gi.centralScenario,
          requireCentralScenario: gi.requireCentralScenario,
          sourceCount: aSourceIds.length,
          analysis: p.lineage.analysis as Record<string, unknown> | undefined,
          sources: p.inquiry.sources as { title: string; authors?: { author?: { name?: string } }[]; provider?: string }[],
          devilsAdvocate: aDa,
          criticPanel: p.stats.criticPanel as { dimensions?: { dimension: string; score: number; findings: string[]; mustFix: boolean }[] } | undefined,
          budgetConstrained: (p.stats.budgetConstrained as boolean | undefined) === true,
        });
        costUsd += revision.costUsd;
        if (revision.changed) {
          const gateBefore = g.decision;
          aHtml = revision.html;
          aWordCount = countWordsHtml(aHtml);
          g = evaluatePublicationGate({ ...gi, html: aHtml });
          r = evaluatePublicationReadiness({
            type: aPubType, trustScore: scores.trustScore, qualityScore: scores.qualityScore,
            citationCoverage: scores.citationCoverage, wordCount: aWordCount, sourceIds: aSourceIds, domain: req.domain,
          });
          (p.stats as Record<string, unknown>).revision = {
            actions: revision.actions, costUsd: revision.costUsd,
            gateBefore, gateAfter: g.decision,
          };
          console.log(`[InquiryOrchestrator] REVISION: ${revision.actions.length} action(s), $${revision.costUsd.toFixed(4)} — gate ${gateBefore} → ${g.decision} | ${revision.actions.join(' | ')}`);
        }
      } catch (revErr) {
        console.warn(`[InquiryOrchestrator] Revision round failed (non-blocking):`, revErr);
      }
    }

    return {
      scores, html: aHtml, wordCount: aWordCount, sourceIds: aSourceIds,
      pubType: aPubType, da: aDa, fatalChallenges: aFatal, signOff: aSignOff,
      triangularOverride: aTri, gate: g, readiness: r, gateInput: { ...gi, html: aHtml },
    };
  };

  let assessment = await assess(pipeline);

  // ── REGENERATION ROUND (once, bounded): if the gate still fails on
  // substance — weak analysis, adversarial objections, unreadable prose —
  // rather than on missing evidence, re-run the pipeline on the SAME corpus
  // (seedSourceIds skip the scout) with the gate's findings injected as
  // mandatory analyst corrections. The regenerated artifact is adopted only
  // if it strictly beats the original (stagnation detection — a worse or
  // equal rewrite is discarded). Evidence-bound failures (source_depth,
  // refusal, trust<40) are NOT regenerated: no rewrite can fix a thin
  // corpus — the dispatcher falls back to the next radar candidate. ──
  if (assessment.gate.decision !== "publish" || !assessment.readiness.ok) {
    try {
      const { shouldRegenerate, buildFailureFeedback, attemptScore } = await import('./revision-controller');
      const regen = shouldRegenerate({
        gate: assessment.gate,
        refusal: !!pipeline.refusal,
        budgetConstrained: (pipeline.stats.budgetConstrained as boolean | undefined) === true,
        devilsAdvocate: assessment.da as { publishabilityScore?: number; fatalChallenges?: number; verdict?: string } | undefined,
        qualityScore: assessment.scores.qualityScore,
        trustScore: assessment.scores.trustScore,
      });
      // Time guard: a seeded regeneration skips the scout (the slowest phase)
      // and rides the reader cache — it needs ~20-25min, not a full pipeline
      // run. Only skip when the ~90min item window genuinely cannot fit it.
      const elapsedMs = Date.now() - started;
      if (regen.regenerate && elapsedMs > 65 * 60 * 1000) {
        console.log(`[InquiryOrchestrator] REGEN skipped: ${Math.round(elapsedMs / 60000)}min elapsed — no dispatch headroom`);
      } else if (regen.regenerate) {
        const feedback = buildFailureFeedback({
          gate: assessment.gate,
          devilsAdvocate: assessment.da as { verdict?: string; publishabilityScore?: number; topChallenges?: { type: string; text: string }[]; killShot?: string } | undefined,
          criticPanel: pipeline.stats.criticPanel as { dimensions?: { dimension: string; score: number; findings: string[]; mustFix: boolean }[] } | undefined,
        });
        console.log(`[InquiryOrchestrator] REGEN (${regen.reason}) — re-running analysis on same corpus with ${feedback.length}-char feedback`);
        const regenPipeline = await runInquiryPipeline({
          question,
          depth,
          domain: req.domain,
          pipelineOptions: { ...mergePipelineOptions(req), priorFailureFeedback: feedback },
          seedSourceIds: assessment.sourceIds.length >= 8 ? assessment.sourceIds : seedSourceIds,
        });
        costUsd += getPipelineCostUsd(regenPipeline.stats);
        if (!regenPipeline.refusal && regenPipeline.html) {
          const reAssessed = await assess(regenPipeline);
          const before = attemptScore({ gate: assessment.gate, trustScore: assessment.scores.trustScore, qualityScore: assessment.scores.qualityScore });
          const after = attemptScore({ gate: reAssessed.gate, trustScore: reAssessed.scores.trustScore, qualityScore: reAssessed.scores.qualityScore });
          if (after > before) {
            console.log(`[InquiryOrchestrator] REGEN adopted: attempt ${before} → ${after} (gate ${assessment.gate.decision} → ${reAssessed.gate.decision})`);
            (regenPipeline.stats as Record<string, unknown>).regeneration = {
              adopted: true, scoreBefore: before, scoreAfter: after, reason: regen.reason,
            };
            pipeline = regenPipeline;
            assessment = reAssessed;
          } else {
            console.log(`[InquiryOrchestrator] REGEN discarded: attempt ${before} → ${after} — stagnation/regression, original kept`);
            (pipeline.stats as Record<string, unknown>).regeneration = {
              adopted: false, scoreBefore: before, scoreAfter: after, reason: regen.reason,
            };
          }
        } else {
          console.warn(`[InquiryOrchestrator] REGEN produced no artifact (${regenPipeline.refusalReason ?? 'empty'}) — original kept`);
        }
      }
    } catch (regenErr) {
      console.warn(`[InquiryOrchestrator] Regeneration round failed (non-blocking):`, regenErr);
    }
  }

  // Unpack the final assessment for the status logic below.
  const { trustScore, qualityScore, citationCoverage } = assessment.scores;
  const html = assessment.html;
  const wordCount = assessment.wordCount;
  const sourceIds = assessment.sourceIds;
  const pubType = assessment.pubType;
  const formatKey = pipeline.format === "strategic" ? "strategic" : "brief";
  const da = assessment.da;
  const daVerdict = da?.verdict as string | undefined;
  const fatalChallenges = assessment.fatalChallenges;
  const signOff = assessment.signOff;
  const triangularOverride = assessment.triangularOverride;
  const gate = assessment.gate;
  const readiness = assessment.readiness;

  console.log(`[InquiryOrchestrator] Gate: decision=${gate.decision} | Readiness: ok=${readiness.ok} | trust=${trustScore} quality=${qualityScore} coverage=${Math.round((citationCoverage || 0) * 100)}%`);

  const minTrust = req.minTrustScore ?? 65;
  // Adaptive trust: if enrichment reasoner found evidence sufficient (score ≥ 70),
  // lower trust threshold by 5 — emerging topics may have slightly lower trust
  // due to novelty but still be well-grounded
  const enrichmentStats = pipeline.stats.enrichmentReasoner as Record<string, unknown> | undefined;
  const enrichmentSufficiency = typeof enrichmentStats?.sufficiencyScore === 'number'
    ? enrichmentStats.sufficiencyScore as number
    : undefined;
  const adaptiveMinTrust = enrichmentSufficiency !== undefined && enrichmentSufficiency >= 70
    ? Math.max(55, minTrust - 5)
    : minTrust;
  let status: InquiryPublishStatus = "held";

  // Use revised DA verdict if triangular judge overrode
  const effectiveDaVerdict = triangularOverride
    ? (pipeline.stats.triangularJudge as Record<string, unknown> | undefined)?.revisedVerdict as string | undefined
    : daVerdict;

  // Minimum viable trust — below this, quality is genuinely insufficient
  const MIN_VIABLE_TRUST = 55;

  // Sprint 31: publication is conditional on the system being SURE, not on
  // cadence. The default is strict — a piece only publishes when the gate is
  // clean (publish) or wants revision but every metric is strong (revise +
  // trust ≥ min+5). Moderate-trust publish-with-warning paths (P2b/P5b) are
  // opt-in via NOMOSX_ALLOW_MODERATE_PUBLISH=1 — silence beats marginal copy.
  const allowModeratePublish = process.env.NOMOSX_ALLOW_MODERATE_PUBLISH === "1";

  // Priority 1: Gate says publish + readiness OK + trust sufficient → publish
  if (gate.decision === "publish" && readiness.ok && trustScore >= adaptiveMinTrust) {
    status = "published";
  }
  // Priority 2: Gate says revise but metrics are strong → publish with DA advisory
  else if (gate.decision === "revise" && readiness.ok && trustScore >= adaptiveMinTrust + 5) {
    status = "published";
  }
  // Priority 2b: Trust in "moderate confidence" zone (55-64) + gate publish/revise → publish with warning
  // This prevents HELD on reports that are just under the threshold after the quality loop.
  // The warning is stored in metadata and surfaced to the reader.
  // But NEVER publish if quality < 40 — garbage regardless of trust.
  else if (allowModeratePublish && trustScore >= MIN_VIABLE_TRUST && trustScore < adaptiveMinTrust && gate.decision !== "hold" && qualityScore >= 40) {
    status = "published";
    console.log(`[InquiryOrchestrator] PUBLISH WITH WARNING: trust ${trustScore} in moderate zone [${MIN_VIABLE_TRUST}-${adaptiveMinTrust - 1}] — publishing with confidence warning`);
  }
  // Priority 3: DA reject with low trust → review (DA concern validated by weak metrics)
  else if (effectiveDaVerdict === "reject" && trustScore < adaptiveMinTrust + 5) {
    status = "review";
  }
  // Priority 4: Sign-off not approved → draft
  else if (signOff && !signOff.approved) {
    status = "draft";
  }
  // Priority 5: Gate revise or readiness not OK → held (but only if trust < MIN_VIABLE_TRUST)
  else if ((gate.decision === "revise" || !readiness.ok) && trustScore < MIN_VIABLE_TRUST) {
    status = "held";
  }
  // Priority 5b: Gate revise but trust ≥ MIN_VIABLE_TRUST → publish with warning (avoid HELD on moderate trust)
  // But NEVER publish if quality is below 40 — that's garbage regardless of trust
  else if (allowModeratePublish && gate.decision === "revise" && trustScore >= MIN_VIABLE_TRUST && qualityScore >= 40) {
    status = "published";
    console.log(`[InquiryOrchestrator] PUBLISH WITH WARNING: gate ${gate.decision}, trust ${trustScore} ≥ ${MIN_VIABLE_TRUST} — publishing with quality warning`);
  }
  // Priority 6: Trust too low → draft
  else if (trustScore < MIN_VIABLE_TRUST) {
    status = "draft";
  }

  if (signOff && !signOff.approved) {
    status = "draft";
  } else if (gate.decision === "hold" || !readiness.ok) {
    status = "held";
  }

  const publicId = pipeline.inquiry.slug;
  let reserve: ReturnType<typeof certifyForReserve> | undefined;
  if (req.delivery === 'reserve' && status === 'published') {
    // Certify the artifact the gate+readiness actually evaluated — the
    // revision round may have replaced pipeline.html, and assessment.gateInput
    // binds the exact evaluated html, so a revised publishable artifact is
    // certifiable too.
    try {
      reserve = certifyForReserve({
        title: pipeline.inquiry.title, html, type: pubType, sourceIds, trustScore, qualityScore,
        citationCoverage: gate.metrics.citationCoverage,
      }, assessment.gateInput, { publicId, briefId: pipeline.briefId! });
      status = 'ready';
    } catch (reserveErr) {
      console.warn('[InquiryOrchestrator] Reserve certification failed — holding:', reserveErr);
      status = 'held';
    }
  }
  const dbStatus = resolveDbStatus(status);

  // 6. Persist (atomic: publication + brief link) — with DB retry for connection drops
  console.log(`[InquiryOrchestrator] Persisting publication: status=${status} trust=${trustScore} quality=${qualityScore} dbStatus=${dbStatus}`);
  const publication = await withDbRetry(() =>
    prisma.$transaction(async (tx) => {
    assertExecutionActive();
    const pub = await tx.thinkTankPublication.create({
      data: {
        verticalId: vertical.id,
        signalId: req.signalId,
        type: pubType,
        title: pipeline.inquiry.title,
        html,
        wordCount,
        trustScore,
        qualityScore,
        citationCoverage: gate.metrics.citationCoverage,
        claimCount: gate.metrics.claimCount,
        factClaimCount: gate.metrics.claimCount,
        citedClaimCount: gate.metrics.citedClaimCount,
        sourceIds,
        status: dbStatus,
        publishedAt: status === "published" ? new Date() : null,
        publicId: status === "published" ? publicId : undefined,
        criticalLoopResult: {
          ...req.metadata,
          architecture: "inquiry-orchestrator-v1",
          reserve,
          productionCostUsd: costUsd,
          source: req.source,
          briefId: pipeline.briefId,
          pipelineRunId: pipeline.pipelineRunId,
          inquiryId: pipeline.inquiry.id,
          depth,
          format: pipeline.format,
          domain: req.domain,
          reviewRequired: status === "review",
          publicationGate: gate,
          publicationReadiness: readiness,
          centralScenario: pipeline.stats.centralScenario,
          centralScenarioRequired: pipeline.stats.centralScenarioRequired,
          devilsAdvocateVerdict: daVerdict,
          // Moderate confidence warning — published with lower trust score
          confidenceWarning: status === "published" && trustScore >= 55 && trustScore < adaptiveMinTrust
            ? { level: "moderate", trustScore, threshold: adaptiveMinTrust, message: "Moderate confidence — published with quality warning" }
            : undefined,
          // Quality loop result — post-render retry that boosted trust score
          qualityLoop: (pipeline.stats as any)?.qualityLoop,
          // Revision round — gate-driven self-repair actions + gate transition
          revision: (pipeline.stats as any)?.revision,
          signOff: signOff
            ? {
                researcher: signOff.researcherName,
                decision: signOff.decision,
                confidence: signOff.confidence,
                comments: signOff.comments,
              }
            : undefined,
          stats: pipeline.stats,
          question: pipeline.inquiry.question,
          ...buildForesightPersistPayload(pipeline.lineage, pipeline.inquiry),
          foresightRun: (pipeline.lineage as Record<string, unknown>).foresightRun,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    if (status === "published") {
      await tx.brief.update({
        where: { id: pipeline.briefId! },
        data: { publicId, publishedAt: new Date() },
      });
    }

    return pub;
  }, { timeout: 30_000 })
);

  console.log(
    `[InquiryOrchestrator] ${status.toUpperCase()} pub=${publication.id} brief=${pipeline.briefId} trust=${trustScore}`
  );

  // Persist structured quality checks (ThinkTankQualityCheck) for audit trail
  await persistQualityChecks(
    publication.id,
    gate,
    readiness,
    daVerdict ? { verdict: daVerdict, score: (da as Record<string, unknown>)?.score as number | undefined } : null,
    signOff ?? null,
    trustScore,
    qualityScore
  ).catch(
    (err) => console.warn('[InquiryOrchestrator] QualityCheck persist failed (non-blocking):', err)
  );

  const foresightPayload = buildForesightPersistPayload(pipeline.lineage, pipeline.inquiry);
  if (foresightPayload.foresight || pipeline.lineage.foresightRun) {
    await persistForesightRun({
      publicationId: publication.id,
      briefId: pipeline.briefId!,
      lineage: pipeline.lineage as Record<string, unknown>,
      bundle: foresightPayload.foresight as ForesightBundle | undefined,
    });
  }

  // ── ACE PLAYBOOK CURATION (non-blocking, fire-and-forget) ──
  // The run's outcome is now known — distill durable lessons into each
  // council role's evolving playbook (injected into runExpertAnalysis prompts)
  // and upvote the advice that held on a published run. Gate diagnoses give
  // typed failure material; revision actions record what repair worked.
  void (async () => {
    try {
      const { curatePlaybook } = await import('./playbook');
      const { detectRelevantExperts } = await import('./phd-researcher');
      const domains = detectRelevantExperts(question).slice(0, 6);
      const lessons = [
        ...(gate.diagnoses ?? []).map((d) => d.fix),
        ...(((pipeline.stats as Record<string, unknown>).revision as { actions?: string[] } | undefined)?.actions ?? []),
      ];
      const failurePatterns: Record<string, number> = {};
      for (const c of gate.checks ?? []) {
        if (!c.passed) failurePatterns[c.checkType] = (failurePatterns[c.checkType] ?? 0) + 1;
      }
      const outcome = status === "published" ? "published" : "held";
      for (const domain of domains) {
        const r = await curatePlaybook(`council:${domain}`, { lessons, failurePatterns, outcome });
        if (r.added > 0 || r.upvoted > 0) {
          console.log(`[PLAYBOOK] council:${domain} — +${r.added} bullet(s), ${r.upvoted} upvote(s)`);
        }
      }
    } catch (err) {
      console.warn(`[PLAYBOOK] curation failed (non-blocking):`, err);
    }
  })();

  return {
    status,
    inquiry: {
      ...pipeline.inquiry,
      status: status === "published" ? "published" : status === "review" ? "reviewing" : "reviewing",
      slug: publication.publicId ?? pipeline.inquiry.slug,
    },
    briefId: pipeline.briefId!,
    publicationId: publication.id,
    publicId: publication.publicId ?? undefined,
    signalId: publication.signalId,
    trustScore,
    qualityScore,
    wordCount,
    costUsd,
    durationMs: Date.now() - started,
    gate,
    readinessOk: readiness.ok,
    pipeline,
  };
}

/** Run pipeline only — no persist (preview / diagnostics). */
export async function runInquiryOnly(
  input: RunInquiryPipelineInput
): Promise<InquiryPipelineResult> {
  return runInquiryPipeline(input);
}

/**
 * Persist structured quality checks for audit trail.
 * Creates ThinkTankQualityCheck records for each gate criterion.
 */
async function persistQualityChecks(
  publicationId: string,
  gate: { metrics?: Record<string, number>; decision?: string },
  readiness: { ok?: boolean; checks?: Array<{ name: string; ok: boolean; detail?: string }> },
  daVerdict: { score?: number; verdict?: string } | null,
  signOff: { researcherName?: string; decision?: string; confidence?: number } | null,
  trustScore: number,
  qualityScore: number
): Promise<void> {
  const checks: Array<{
    publicationId: string;
    checkType: string;
    passed: boolean;
    score: number;
    details: Record<string, unknown>;
  }> = [];

  // THRESHOLD checks
  checks.push({
    publicationId,
    checkType: "THRESHOLD",
    passed: trustScore >= 65,
    score: trustScore,
    details: { checkName: "trust_score", threshold: 65, detail: `Trust score ${trustScore} (min 65)` },
  });
  checks.push({
    publicationId,
    checkType: "THRESHOLD",
    passed: qualityScore >= 70,
    score: qualityScore,
    details: { checkName: "quality_score", threshold: 70, detail: `Quality score ${qualityScore} (min 70)` },
  });

  // CITATION checks
  const citationCoverage = (gate.metrics?.citationCoverage ?? 0) * 100;
  checks.push({
    publicationId,
    checkType: "CITATION",
    passed: citationCoverage >= 60,
    score: Math.round(citationCoverage),
    details: { checkName: "citation_coverage", threshold: 60, detail: `Citation coverage ${citationCoverage.toFixed(1)}% (min 60%)` },
  });

  // ADVERSARIAL checks (devil's advocate)
  if (daVerdict) {
    checks.push({
      publicationId,
      checkType: "ADVERSARIAL",
      passed: (daVerdict.score ?? 0) >= 40,
      score: daVerdict.score ?? 0,
      details: { checkName: "devils_advocate", threshold: 40, detail: `Devil's advocate score ${daVerdict.score} (${daVerdict.verdict ?? "unknown"})` },
    });
  }

  // METHODOLOGY checks (sign-off)
  if (signOff) {
    checks.push({
      publicationId,
      checkType: "METHODOLOGY",
      passed: signOff.decision === "approve",
      score: signOff.confidence ?? 0,
      details: { checkName: "researcher_signoff", threshold: 50, detail: `Sign-off by ${signOff.researcherName}: ${signOff.decision} (confidence ${signOff.confidence})` },
    });
  }

  // CALIBRATION checks
  checks.push({
    publicationId,
    checkType: "CALIBRATION",
    passed: gate.decision === "publish",
    score: gate.decision === "publish" ? 100 : 0,
    details: { checkName: "publication_gate_decision", threshold: 100, detail: `Gate decision: ${gate.decision}` },
  });

  // QUALITY checks from readiness
  if (readiness.checks) {
    for (const check of readiness.checks) {
      checks.push({
        publicationId,
        checkType: "QUALITY",
        passed: check.ok,
        score: check.ok ? 100 : 0,
        details: { checkName: check.name, threshold: 100, detail: check.detail || `${check.name}: ${check.ok ? "pass" : "fail"}` },
      });
    }
  }

  await prisma.thinkTankQualityCheck.createMany({
    data: checks.map((c) => ({
      publicationId: c.publicationId,
      checkType: c.checkType,
      passed: c.passed,
      score: c.score,
      details: c.details as unknown as Prisma.InputJsonValue,
    })),
  });

  console.log(`[QualityCheck] Persisted ${checks.length} quality checks for publication ${publicationId}`);
}
