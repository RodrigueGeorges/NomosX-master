/**
 * Inquiry Pipeline — Unified publication runner
 * ──────────────────────────────────────────────
 * Wraps runPipeline to produce Inquiry + full pipeline artifacts.
 *
 * Funnel position: RUN step (called by inquiry-orchestrator for GATE → PERSIST).
 */

import type { Prisma } from "@prisma/client";
import { runPipeline, type StrategicPipelineOptions } from "./pipeline-v2";
import { prisma } from "@/lib/db";
import { type SimulationReport } from "./simulation-agent";
import { runPipelineForesight } from "./pipeline-foresight";
import { extractPipelineScores } from "./inquiry-funnel-utils";
import {
  appendSimulationToHtml,
  buildForesightPersistPayload,
  getForesightConfig,
  isForesightEnabled,
  renderSimulationHtmlSection,
} from "@/lib/foresight";
import type {
  Inquiry,
  InquiryDepth,
  InquiryStatus,
  InquirySource,
  InquirySection,
  ProbabilisticVerdict,
  CreateInquiryInput,
} from "@/lib/types/inquiry";

// ─── Input / Output ──────────────────────────────────────────

export interface RunInquiryPipelineInput extends CreateInquiryInput {
  pipelineOptions?: StrategicPipelineOptions;
  /** Skip simulation even for strategic depth */
  skipSimulation?: boolean;
  /** Pre-identified sources (e.g. from Signal) — throttles scout & prioritizes foresight */
  seedSourceIds?: string[];
}

export interface InquiryPipelineResult {
  inquiry: Inquiry;
  briefId: string;
  pipelineRunId?: string;
  html: string;
  stats: Record<string, unknown>;
  lineage: Record<string, unknown>;
  trustScore: number;
  qualityScore: number;
  format: "brief" | "strategic";
}

// ─── Depth → pipeline format ─────────────────────────────────

function depthToPipelineFormat(
  depth: InquiryDepth,
  overrides?: StrategicPipelineOptions
): { format: "brief" | "strategic"; options: StrategicPipelineOptions } {
  let base: { format: "brief" | "strategic"; options: StrategicPipelineOptions };

  switch (depth) {
    case "surface":
      base = { format: "brief", options: { rankOptions: { limit: 6 }, perProvider: 12 } };
      break;
    case "standard":
      base = { format: "brief", options: { perProvider: 20 } };
      break;
    case "deep":
      base = {
        format: "strategic",
        options: {
          perProvider: 25,
          rankOptions: { limit: 20, requireAbstract: false, minQuality: 0 },
        },
      };
      break;
    case "strategic":
      base = {
        format: "strategic",
        options: {
          perProvider: 30,
          rankOptions: { limit: 25, requireAbstract: false, minQuality: 0 },
        },
      };
      break;
  }

  return {
    format: base.format,
    options: {
      ...base.options,
      ...overrides,
      providers: overrides?.providers ?? base.options.providers,
      perProvider: overrides?.perProvider ?? base.options.perProvider,
      rankOptions: { ...base.options.rankOptions, ...overrides?.rankOptions },
    },
  };
}

// ─── Analysis helpers ──────────────────────────────────────────

async function maybeRunSimulation(
  question: string,
  depth: InquiryDepth,
  domain: string,
  analysis: Record<string, unknown>,
  lineage: Record<string, unknown>,
  sourceIds: string[],
  skipSimulation?: boolean
): Promise<{
  analysis: Record<string, unknown>;
  lineage: Record<string, unknown>;
  report?: SimulationReport;
}> {
  if (skipSimulation) {
    return { analysis, lineage };
  }

  const isStrategic = depth === "strategic" || depth === "deep";
  const foresight = await Promise.race([
    runPipelineForesight({
      question,
      analysis,
      domain,
      sourceIds,
      isStrategic,
      depth,
      seedSourceIds: lineage.seedSourceIds as string[] | undefined,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Foresight simulation timed out (600s)")), 600_000)
    ),
  ]);

  if (foresight.skipped || !foresight.report) {
    return { analysis: foresight.analysis, lineage };
  }

  const report = foresight.report;
  const enrichedLineage = {
    ...lineage,
    simulation: report.output,
    simulationSummary: report.summary,
    simulationContextBlock: report.contextBlock,
    simulationSensitivity: report.output.sensitivity,
    simulationTraceability: report.output.traceability,
    simulationRedTeam: report.output.redTeamChallenge,
    simulationLlmTicks: report.output.llmTickCount,
    foresightRun: {
      costUsd: report.output.totalCostUsd,
      durationMs: report.output.totalDurationMs,
      swarmSize: report.output.swarmSize,
      converged: report.output.monteCarloConverged,
      seedRuns: report.output.seedRuns,
      at: new Date().toISOString(),
    },
  };

  return { analysis: foresight.analysis, lineage: enrichedLineage, report };
}

function extractVerdict(analysis: Record<string, unknown>, depth: InquiryDepth): ProbabilisticVerdict {
  const verdict = analysis.verdict as Record<string, unknown> | undefined;
  if (verdict) {
    return {
      value: String(verdict.value ?? verdict.probability ?? verdict.confidence ?? "Uncertain"),
      label: String(verdict.label ?? verdict.type ?? "Confidence"),
      numeric: typeof verdict.numeric === "number" ? verdict.numeric : undefined,
      rationale: verdict.rationale ? String(verdict.rationale) : undefined,
      direction: (verdict.direction as ProbabilisticVerdict["direction"]) ?? "neutral",
    };
  }

  if (analysis.urgencyLevel || analysis.confidenceLevel) {
    const urgency = String(analysis.urgencyLevel);
    const conf = analysis.confidenceLevel ? String(analysis.confidenceLevel) : undefined;
    return {
      value: conf ? conf.charAt(0).toUpperCase() + conf.slice(1) : "Medium",
      label: "Confidence",
      rationale: analysis.executiveSummary
        ? String(analysis.executiveSummary).slice(0, 300)
        : undefined,
      direction:
        urgency === "critical" || urgency === "high"
          ? "positive"
          : urgency === "low"
            ? "negative"
            : "neutral",
    };
  }

  const hasConsensus =
    analysis.consensus && String(analysis.consensus).length > 20;
  const hasDisagreements =
    analysis.disagreements && String(analysis.disagreements).length > 20;

  if (hasConsensus && !hasDisagreements) {
    return { value: "High", label: "Agreement", direction: "positive" };
  }
  if (hasDisagreements && !hasConsensus) {
    return { value: "Low", label: "Agreement", direction: "negative" };
  }

  return {
    value: depth === "surface" ? "Signal Detected" : "Analysis Complete",
    label: "Status",
    direction: "neutral",
  };
}

function buildSections(analysis: Record<string, unknown>, depth: InquiryDepth): InquirySection[] {
  const sections: InquirySection[] = [];

  sections.push({
    type: "summary",
    headline: String(analysis.title ?? analysis.headline ?? "Inquiry Summary"),
    body: String(analysis.summary ?? analysis.executiveSummary ?? ""),
    tlDr: analysis.tlDr ? String(analysis.tlDr) : analysis.oneLiner ? String(analysis.oneLiner) : undefined,
  });

  if (depth === "surface") return sections;

  if (analysis.debate || analysis.disagreements) {
    const debate = analysis.debate as Record<string, unknown> | undefined;
    const pos1 = debate?.position1 as Record<string, unknown> | undefined;
    const pos2 = debate?.position2 as Record<string, unknown> | undefined;
    sections.push({
      type: "debate",
      pro: {
        label: String(pos1?.label ?? "Position A"),
        arguments: (pos1?.arguments as string[]) ?? [String(analysis.consensus ?? "No pro arguments found")],
      },
      con: {
        label: String(pos2?.label ?? "Position B"),
        arguments: (pos2?.arguments as string[]) ?? [String(analysis.disagreements ?? "No con arguments found")],
      },
      synthesis: String(debate?.synthesis ?? debate?.middleGround ?? "Synthesis not available."),
    });
  }

  if (analysis.evidence || analysis.evidenceQuality) {
    const eq = analysis.evidenceQuality as Record<string, unknown> | undefined;
    const score = typeof eq?.overallScore === "number" ? eq.overallScore : 0;
    sections.push({
      type: "evidence",
      quality: score >= 7 ? "high" : score >= 4 ? "medium" : "low",
      assessment: String(analysis.evidence ?? eq?.methodology ?? "Evidence assessment pending."),
      gaps: (eq?.gaps as string[]) ?? [],
    });
  }

  if (depth === "standard") return sections;

  if (analysis.literatureOverview || analysis.theoreticalFrameworks) {
    const rawKS = analysis.keyStudies;
    const keyStudies = Array.isArray(rawKS) ? rawKS : (rawKS ? Object.values(rawKS) : []);
    sections.push({
      type: "literature",
      overview: String(analysis.literatureOverview ?? ""),
      frameworks: analysis.theoreticalFrameworks
        ? [String(analysis.theoreticalFrameworks)]
        : keyStudies.map((k) => String(k.citation ?? "")),
      keyStudies: keyStudies.map((k) => ({
        citation: String(k.citation ?? "Unknown"),
        contribution: String(k.contribution ?? ""),
        limitations: String(k.limitations ?? ""),
      })),
    });
  }

  if (analysis.themes || analysis.consensus || analysis.controversies) {
    const rawThemes = analysis.themes;
    const themes = Array.isArray(rawThemes) ? rawThemes : (rawThemes ? Object.values(rawThemes) : []);
    sections.push({
      type: "thematic",
      themes: themes.map((t) => ({
        name: String(t.name ?? "Theme"),
        description: String(t.description ?? ""),
        evidence: String(t.evidence ?? ""),
        sourceIds: (t.sources as string[]) ?? [],
      })),
      consensus: String(analysis.consensus ?? ""),
      controversies: String(analysis.controversies ?? ""),
    });
  }

  if (analysis.stakeholderAnalysis) {
    const raw = analysis.stakeholderAnalysis;
    const matrix = Array.isArray(raw) ? raw : Object.values(raw);
    if (matrix.length > 0) {
      sections.push({
        type: "stakeholders",
        matrix: matrix.map((s) => ({
          stakeholder: String(s.stakeholder ?? "Unknown"),
          impact: (s.impact as "high" | "medium" | "low") ?? "medium",
          magnitude: (s.magnitude as "positive" | "negative" | "mixed") ?? "mixed",
          details: String(s.details ?? ""),
        })),
      });
    }
  }

  if (depth === "strategic" && analysis.scenarios) {
    const rawScen = analysis.scenarios;
    const scenarios = Array.isArray(rawScen) ? rawScen : (rawScen ? Object.values(rawScen) : []);
    if (scenarios.length > 0) {
      sections.push({
        type: "scenarios",
        scenarios: scenarios.map((s) => ({
        name: String(s.name ?? "Scenario"),
        probability: String(s.probability ?? "Unknown"),
        description: String(s.description ?? ""),
        implications: String(s.implications ?? ""),
        signals: (s.signals as string[]) ?? [],
      })),
      });
    }
  }

  if (depth === "strategic" && analysis.implementation) {
    const imp = analysis.implementation as Record<string, unknown>;
    sections.push({
      type: "implementation",
      prerequisites: (imp.prerequisites as string[]) ?? [],
      timeline: String(imp.timeline ?? ""),
      resources: String(imp.resources ?? ""),
      metrics: (imp.metrics as string[]) ?? [],
      obstacles: (imp.obstacles as string[]) ?? [],
    });
  }

  const simReport = analysis._simulationReport as SimulationReport | undefined;
  if ((depth === "strategic" || depth === "deep") && simReport?.output) {
    const out = simReport.output;
    sections.push({
      type: "simulation",
      methodology: "NomosX Foresight v3 — 1024-agent swarm + GraphRAG + dual-channel social + multi-seed MC",
      personaCount: out.personaCount,
      swarmSize: out.swarmSize,
      seedRuns: out.seedRuns,
      tickCount: out.ticks.length,
      llmTickCount: out.llmTickCount,
      socialPostCount: out.socialPostCount,
      monteCarloRuns: out.monteCarloRuns,
      converged: out.monteCarloConverged,
      outcomes: out.scenarios.map((s) => ({
        name: s.name,
        empiricalProbability: `${(s.empiricalProbability * 100).toFixed(0)}%`,
        trajectory: s.trajectory,
        confidenceInterval: [
          `${(s.confidenceInterval[0] * 100).toFixed(0)}%`,
          `${(s.confidenceInterval[1] * 100).toFixed(0)}%`,
        ],
        keyDrivers: s.keyDrivers,
        blockers: s.blockers,
        cascadeEffects: s.cascadeEffects,
        sourceGrounded: s.sourceGrounded,
        supportingSourceIds: s.supportingSourceIds,
      })),
      sensitivity: out.sensitivity?.entries.slice(0, 6),
      redTeamChallenge: out.redTeamChallenge,
      executiveBrief: out.executiveBrief,
      traceability: {
        sourceIds: out.traceability.sourceIds,
        adversarialValidated: out.traceability.adversarialValidated,
        sourceQualityAvg: out.traceability.sourceQualityAvg,
      },
    });
  }

  return sections;
}

function mapSources(sources: Array<Record<string, unknown>>): InquirySource[] {
  return sources.map((s, i) => ({
    id: String(s.id ?? `src-${i}`),
    title: String(s.title ?? "Untitled"),
    authors: Array.isArray(s.authors)
      ? (s.authors as Array<{ name?: string } | string>).map((a) =>
          typeof a === "string" ? a : String(a.name ?? "")
        )
      : [],
    year: typeof s.year === "number" ? s.year : undefined,
    doi: s.doi ? String(s.doi) : undefined,
    url: s.url ? String(s.url) : undefined,
    provider: String(s.provider ?? "unknown"),
    qualityScore: typeof s.qualityScore === "number" ? s.qualityScore : 0,
    relevanceScore: typeof s.relevanceScore === "number" ? s.relevanceScore : 0,
    claims: (s._readerClaims as string[]) ?? (s.claims as string[]),
    methods: (s._readerMethods as string[]) ?? (s.methods as string[]),
  }));
}

function slugify(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function extractScores(
  brief: { trustScore: number | null; qualityScore: number | null },
  stats: Record<string, unknown>,
  lineage: Record<string, unknown>
): { trustScore: number; qualityScore: number } {
  const { trustScore, qualityScore } = extractPipelineScores(stats, lineage, brief);
  return { trustScore, qualityScore };
}

// ─── Main entry ────────────────────────────────────────────────

/**
 * Run pipeline and return Inquiry + artifacts for orchestrator / Studio.
 */
export async function runInquiryPipeline(
  input: RunInquiryPipelineInput
): Promise<InquiryPipelineResult> {
  const {
    question,
    domain = "general",
    depth = "standard",
    pipelineOptions,
    skipSimulation,
    seedSourceIds,
  } = input;

  const foresightCfg = getForesightConfig();
  let { format, options } = depthToPipelineFormat(depth, pipelineOptions);

  if (seedSourceIds?.length && seedSourceIds.length >= foresightCfg.minSeedSourcesToThrottleScout) {
    options = {
      ...options,
      perProvider: Math.min(options.perProvider ?? 20, 12),
      seedSourceIds: [...new Set(seedSourceIds)],
      minSeedSourcesToSkipScout: foresightCfg.minSeedSourcesToThrottleScout,
    };
    console.log(
      `[Inquiry] seedSourceIds=${seedSourceIds.length} — scout skip/throttle (min=${foresightCfg.minSeedSourcesToThrottleScout})`
    );
  } else if (seedSourceIds?.length) {
    options = {
      ...options,
      seedSourceIds: [...new Set(seedSourceIds)],
    };
  }

  console.log(
    `[Inquiry] RUN depth=${depth} format=${format} q="${question.slice(0, 60)}..."`
  );

  const result = await runPipeline(question, format, options);

  const brief = await prisma.brief.findUnique({
    where: { id: result.briefId },
  });

  if (!brief) {
    throw new Error(`Brief ${result.briefId} not found after pipeline completion`);
  }

  const stats = (result.stats ?? {}) as Record<string, unknown>;
  let lineage = (brief.lineage ?? stats.lineage ?? {}) as Record<string, unknown>;
  let analysis = (lineage.analysis ?? stats.analysis ?? {}) as Record<string, unknown>;

  if (seedSourceIds?.length) {
    lineage = { ...lineage, seedSourceIds };
  }

  const simResult = await maybeRunSimulation(
    question,
    depth,
    domain,
    analysis,
    lineage,
    brief.sources,
    skipSimulation
  );
  analysis = simResult.analysis;
  lineage = { ...simResult.lineage, analysis };

  const sourceRecords = await prisma.source.findMany({
    where: { id: { in: brief.sources } },
    include: { authors: { include: { author: true } } },
  });

  const mappedSources = mapSources(
    sourceRecords.map((s) => ({
      ...s,
      authors: s.authors.map((sa) => sa.author.name),
    })) as unknown as Array<Record<string, unknown>>
  );

  const { trustScore, qualityScore } = extractScores(brief, stats, lineage);
  let html = brief.html ?? "";

  if (simResult.report) {
    const section = renderSimulationHtmlSection(simResult.report);
    html = appendSimulationToHtml(html, section);
  }

  const inquiry: Inquiry = {
    id: brief.id,
    slug: brief.publicId ?? slugify(question),
    title: String(analysis.title ?? question),
    question,
    domain,
    depth,
    status: "reviewing" as InquiryStatus,
    verdict: extractVerdict(analysis, depth),
    sections: buildSections(analysis, depth),
    sources: mappedSources,
    readTime: Math.max(3, Math.round(html.length / 2500)),
    publishedAt: brief.publishedAt ?? brief.createdAt,
    updatedAt: brief.updatedAt,
    concepts: (lineage.knowledgeGraph as Record<string, unknown> | undefined)?.concepts as
      | string[]
      | undefined,
    metaDescription: analysis.summary
      ? String(analysis.summary).slice(0, 160)
      : analysis.executiveSummary
        ? String(analysis.executiveSummary).slice(0, 160)
        : undefined,
  };

  console.log(
    `[Inquiry] Complete brief=${brief.id} sections=${inquiry.sections.length} sources=${inquiry.sources.length} foresight=${Boolean(simResult.report)}`
  );

  const persistedLineage = { ...lineage, analysis };
  const mergedStats = {
    ...stats,
    lineage: persistedLineage,
    analysis,
    foresight: buildForesightPersistPayload(persistedLineage, inquiry).foresight,
  };

  await prisma.brief.update({
    where: { id: brief.id },
    data: {
      html,
      lineage: persistedLineage as unknown as Prisma.InputJsonValue,
      trustScore,
      qualityScore,
    },
  });

  return {
    inquiry,
    briefId: brief.id,
    pipelineRunId: result.pipelineRunId ?? brief.pipelineRunId ?? undefined,
    html,
    stats: mergedStats,
    lineage,
    trustScore,
    qualityScore,
    format,
  };
}

export type { InquiryDepth, InquiryStatus, Inquiry } from "@/lib/types/inquiry";
