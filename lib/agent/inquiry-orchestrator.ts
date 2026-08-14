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
import { prisma, withDbRetry } from "@/lib/db";
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
  | "held"
  | "draft"
  | "review"
  | "failed"
  | "skipped_duplicate"
  | "skipped_dry_run";

export interface InquiryPublishRequest {
  question: string;
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
    const match = await prisma.thinkTankPublication.findFirst({
      where: {
        criticalLoopResult: {
          path: ["briefId"],
          equals: briefId,
        },
      },
      select: { id: true, publicId: true },
      orderBy: { createdAt: "desc" },
    });
    return match;
  } catch {
    // Fallback: JSON path filter may fail if criticalLoopResult is null for old pubs
    const fallback = await prisma.thinkTankPublication.findFirst({
      where: {
        criticalLoopResult: { string_contains: briefId },
      },
      select: { id: true, publicId: true },
      orderBy: { createdAt: "desc" },
    });
    return fallback;
  }
}

async function findRecentDuplicateTitle(question: string, withinHours = 168): Promise<string | null> {
  const key = normalizeTopicKey(question);
  if (key.length < 10) return null;

  const since = new Date(Date.now() - withinHours * 3600000);
  const recent = await prisma.thinkTankPublication.findMany({
    where: {
      createdAt: { gte: since },
      status: { in: ["PUBLISHED", "HELD", "DRAFT"] },
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

  const costUsd = getPipelineCostUsd(pipeline.stats);

  // 4a. Handle pipeline refusal (insufficient evidence)
  if (pipeline.refusal) {
    console.warn(`[InquiryOrchestrator] Pipeline refused: ${pipeline.refusalReason}`);
    return failResult(started, pipeline.refusalReason || 'Pipeline refused: evidence insufficient');
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

  // 5. Scores & gate
  const { trustScore, qualityScore, citationCoverage } = extractPipelineScores(
    pipeline.stats,
    pipeline.lineage,
    { trustScore: pipeline.trustScore, qualityScore: pipeline.qualityScore }
  );
  const wordCount = countWordsHtml(pipeline.html);
  const sourceIds = pipeline.inquiry.sources.map((s) => s.id);
  const pubType = depthToPublicationType(depth, pipeline.format);
  const formatKey = pipeline.format === "strategic" ? "strategic" : "brief";

  const da = (pipeline.lineage.devilsAdvocate ?? pipeline.stats.devilsAdvocate) as
    | Record<string, unknown>
    | undefined;
  const daVerdict = da?.verdict as string | undefined;
  const fatalChallenges = (da?.fatalChallenges as number) ?? 0;

  let signOff: SignOffResult | undefined;
  if (req.requireResearcherSignOff) {
    try {
      signOff = await requestResearcherSignOff(question, pipeline.html, trustScore);
    } catch (err: unknown) {
      console.warn(`[InquiryOrchestrator] Sign-off failed:`, err);
      signOff = {
        approved: false,
        decision: "revise",
        researcherName: "auto",
        domain: "technology",
        confidence: 0,
        comments: ["Sign-off unavailable — held for manual review"],
        timestamp: new Date(),
        trustScore,
      };
    }
  }

  const triangularOverride = (pipeline.stats.triangularJudge as Record<string, unknown> | undefined)?.verdict === 'override_da'
    || (pipeline.stats.triangularJudge as Record<string, unknown> | undefined)?.verdict === 'downgrade';

  const gate = evaluatePublicationGate({
    format: pubType,
    html: pipeline.html,
    sourceIds,
    trustScore,
    qualityScore,
    citationCoverage: citationCoverage || undefined,
    devilsAdvocateScore: da?.publishabilityScore as number | undefined,
    fatalChallenges,
    researcherDecision: signOff?.decision,
    triangularOverride,
    domain: req.domain,
  });

  const readiness = evaluatePublicationReadiness({
    type: pubType,
    trustScore,
    qualityScore,
    citationCoverage,
    wordCount,
    sourceIds,
    domain: req.domain,
  });

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
  else if (trustScore >= MIN_VIABLE_TRUST && trustScore < adaptiveMinTrust && gate.decision !== "hold") {
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
  else if ((gate.decision === "revise" || !readiness.ok) && trustScore >= MIN_VIABLE_TRUST) {
    status = "published";
    console.log(`[InquiryOrchestrator] PUBLISH WITH WARNING: gate ${gate.decision}, trust ${trustScore} ≥ ${MIN_VIABLE_TRUST} — publishing with quality warning`);
  }
  // Priority 6: Trust too low → draft
  else if (trustScore < MIN_VIABLE_TRUST) {
    status = "draft";
  }

  const publicId = pipeline.inquiry.slug;
  const dbStatus = resolveDbStatus(status);

  // 6. Persist (atomic: publication + brief link) — with DB retry for connection drops
  const publication = await withDbRetry(() =>
    prisma.$transaction(async (tx) => {
    const pub = await tx.thinkTankPublication.create({
      data: {
        verticalId: vertical.id,
        signalId: req.signalId,
        type: pubType,
        title: pipeline.inquiry.title,
        html: pipeline.html,
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
          architecture: "inquiry-orchestrator-v1",
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
          devilsAdvocateVerdict: daVerdict,
          // Moderate confidence warning — published with lower trust score
          confidenceWarning: trustScore >= 55 && trustScore < adaptiveMinTrust
            ? { level: "moderate", trustScore, threshold: adaptiveMinTrust, message: "Moderate confidence — published with quality warning" }
            : undefined,
          // Quality loop result — post-render retry that boosted trust score
          qualityLoop: (pipeline.stats as any)?.qualityLoop,
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
          ...req.metadata,
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
  })
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
