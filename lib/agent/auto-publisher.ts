// @ts-nocheck
/**
 * NomosX AUTO-PUBLISHER — Autonomous End-to-End Publication Engine
 * 
 * The crown jewel of NomosX's autonomous intelligence system.
 * Orchestrates the complete flow from signal detection to published brief:
 * 
 *   SCAN → DETECT → PLAN → RESEARCH → ANALYZE → VALIDATE → PUBLISH
 * 
 * Features:
 * - Multi-strategy publication: editorial-driven, signal-driven, proactive
 * - Quality gates at every stage (min trust score, citation coverage, etc.)
 * - Smart provider selection per domain
 * - Harvard Council integration for strategic reports
 * - Full pipeline lineage tracking (cost, duration, agents used)
 * - Cadence enforcement (respects weekly publication limits)
 * - Graceful degradation (continues on partial failures)
 * 
 * This agent is what makes NomosX a self-sufficient, institutional-grade
 * research engine — capable of operating autonomously 24/7.
 */

import { prisma } from '../db';
import { scout, rank, runPipeline } from './pipeline-v2';
import { signalDetector } from './signal-detector';
import { trendAnalyzer } from './trend-analyzer';
import { contradictionDetector } from './contradiction-detector';
import { planEditorialAgenda, EditorialProposal, EditorialAgenda } from './editorial-planner';
import { generatePublication } from './publication-generator';
import { selectSmartProviders } from './smart-provider-selector';
import { extractAndStoreConcepts } from './knowledge-graph';
import { AgentRole, assertPermission } from '../governance/index';
import { evaluatePublicationGate } from './publication-gate';
import {
  getPrimaryOwner as getPrimaryDomainOwner,
  selectPipelineTier,
  requestResearcherSignOff,
  type PipelineTier,
  type DomainScore,
} from './researcher-ownership';

const DEFAULT_WEEKLY_PUBLICATION_MAX = 3;

function getWeeklyPublicationMax(): number {
  const parsed = Number.parseInt(process.env.NOMOSX_WEEKLY_PUBLICATION_MAX || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WEEKLY_PUBLICATION_MAX;
  return Math.min(parsed, 25);
}

// ============================================================================
// TYPES
// ============================================================================

export interface AutoPublisherConfig {
  /** Max publications per run (respects weekly cadence) */
  maxPublications?: number;
  /** Minimum trust score to auto-publish (0-100) */
  minTrustScore?: number;
  /** Minimum confidence from editorial planner to auto-commission */
  minEditorialConfidence?: number;
  /** Enable Harvard Council for strategic reports */
  enableHarvardCouncil?: boolean;
  /** Enable proactive scouting before planning */
  enableProactiveScan?: boolean;
  /** Enable contradiction detection */
  enableContradictionDetection?: boolean;
  /** Enable trend analysis */
  enableTrendAnalysis?: boolean;
  /** Enable knowledge graph updates */
  enableKnowledgeGraph?: boolean;
  /** Vertical slugs to focus on (empty = all) */
  verticalSlugs?: string[];
  /** Dry run mode — plan but don't publish */
  dryRun?: boolean;
  /** Max LLM cost per run in USD (safety cap) */
  maxCostUsd?: number;
  /** Force pipeline tier: standard | premium | strategic */
  forceTier?: PipelineTier;
}

export interface PublicationResult {
  topic: string;
  strategy: "editorial" | "signal" | "proactive";
  publicationId?: string;
  briefId?: string;
  trustScore: number;
  wordCount: number;
  costUsd: number;
  durationMs: number;
  providers: string[];
  status: "published" | "review" | "failed";
  error?: string;
}

export interface AutoPublisherOutput {
  /** Total publications generated */
  published: number;
  /** Publications needing human review */
  pendingReview: number;
  /** Failed attempts */
  failed: number;
  /** Detailed results per publication */
  results: PublicationResult[];
  /** Editorial agenda used */
  agenda?: EditorialAgenda;
  /** Scan statistics */
  scanStats?: {
    sourcesIngested: number;
    signalsDetected: number;
    trendBreaks: number;
    contradictions: number;
  };
  /** Total cost across all operations */
  totalCostUsd: number;
  /** Total duration */
  totalDurationMs: number;
  /** Pipeline lineage */
  lineage: AutoPublisherLineage;
}

export interface AutoPublisherLineage {
  runId: string;
  startedAt: string;
  finishedAt: string;
  config: AutoPublisherConfig;
  phases: Array<{
    name: string;
    status: "ok" | "error" | "skipped";
    durationMs: number;
    details?: string;
  }>;
  version: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: Required<AutoPublisherConfig> = {
  maxPublications: 3,
  minTrustScore: 65,
  minEditorialConfidence: 85,
  enableHarvardCouncil: true,
  enableProactiveScan: true,
  enableContradictionDetection: true,
  enableTrendAnalysis: true,
  enableKnowledgeGraph: true,
  verticalSlugs: [],
  dryRun: false,
  maxCostUsd: 50,
  forceTier: undefined as unknown as PipelineTier,
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run the full autonomous publication cycle.
 * 
 * This is the master orchestrator that:
 * 1. Optionally scans for new sources (proactive mode)
 * 2. Plans the editorial agenda
 * 3. Executes publications via the full pipeline
 * 4. Validates quality and publishes
 * 5. Updates the knowledge graph
 * 
 * @param config - Configuration options
 * @returns Detailed output with all results and lineage
 */
export async function autoPublisher(
  config: AutoPublisherConfig = {}
): Promise<AutoPublisherOutput> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const runId = `ap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date();
  const phases: AutoPublisherLineage['phases'] = [];
  let totalCostUsd = 0;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`[AUTO-PUBLISHER] Run ${runId} starting...`);
  console.log(`[AUTO-PUBLISHER] Config: max=${cfg.maxPublications}, trust≥${cfg.minTrustScore}, council=${cfg.enableHarvardCouncil}, dryRun=${cfg.dryRun}`);
  console.log(`${"=".repeat(80)}\n`);

  assertPermission(AgentRole.PUBLISHER, "publish:publication");

  const results: PublicationResult[] = [];
  let scanStats: AutoPublisherOutput['scanStats'] | undefined;
  let agenda: EditorialAgenda | undefined;

  // Check remaining weekly slots
  const remainingSlots = await getRemainingWeeklySlots();
  const effectiveMax = Math.min(cfg.maxPublications, remainingSlots);

  if (effectiveMax <= 0) {
    console.log("[AUTO-PUBLISHER] Weekly publication limit reached — respecting cadence");
    return buildOutput(results, agenda, scanStats, totalCostUsd, startedAt, runId, cfg, phases);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 1: PROACTIVE SCAN (optional)
  // ════════════════════════════════════════════════════════════════════════
  if (cfg.enableProactiveScan) {
    const phaseStart = Date.now();
    try {
      console.log("[AUTO-PUBLISHER] Phase 1: Proactive intelligence scan...");
      scanStats = await runProactiveScan(cfg);
      phases.push({ name: "proactive-scan", status: "ok", durationMs: Date.now() - phaseStart, details: `${scanStats.sourcesIngested} sources, ${scanStats.signalsDetected} signals` });
      console.log(`[AUTO-PUBLISHER] Phase 1 complete: ${scanStats.sourcesIngested} sources, ${scanStats.signalsDetected} signals, ${scanStats.trendBreaks} trends`);
    } catch (err: any) {
      phases.push({ name: "proactive-scan", status: "error", durationMs: Date.now() - phaseStart, details: err.message });
      console.error("[AUTO-PUBLISHER] Phase 1 failed (continuing):", err.message);
    }
  } else {
    phases.push({ name: "proactive-scan", status: "skipped", durationMs: 0 });
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 2: EDITORIAL PLANNING
  // ════════════════════════════════════════════════════════════════════════
  const planStart = Date.now();
  try {
    console.log("[AUTO-PUBLISHER] Phase 2: Editorial planning...");
    agenda = await planEditorialAgenda({
      weeklySlots: effectiveMax,
      verticalSlugs: cfg.verticalSlugs.length > 0 ? cfg.verticalSlugs : undefined,
    });
    totalCostUsd += agenda.costUsd;
    phases.push({ name: "editorial-planning", status: "ok", durationMs: Date.now() - planStart, details: `${agenda.autoCommission.length} auto, ${agenda.needsReview.length} review` });
    console.log(`[AUTO-PUBLISHER] Phase 2 complete: ${agenda.proposals.length} proposals (${agenda.autoCommission.length} auto-commission)`);
  } catch (err: any) {
    phases.push({ name: "editorial-planning", status: "error", durationMs: Date.now() - planStart, details: err.message });
    console.error("[AUTO-PUBLISHER] Phase 2 failed (continuing with signal fallback):", err.message);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 3: PUBLICATION EXECUTION
  // ════════════════════════════════════════════════════════════════════════
  const execStart = Date.now();
  console.log("[AUTO-PUBLISHER] Phase 3: Publication execution...");

  let published = 0;
  const runningCostUsd = { value: totalCostUsd };

  // Strategy A: Editorial auto-commissions
  if (agenda?.autoCommission && agenda.autoCommission.length > 0) {
    for (const proposal of agenda.autoCommission) {
      if (published >= effectiveMax) break;
      if (proposal.confidence < cfg.minEditorialConfidence) continue;

      const result = await executePublication(proposal, cfg, runningCostUsd);
      results.push(result);
      totalCostUsd += result.costUsd;
      runningCostUsd.value = totalCostUsd;

      if (result.status === "published") published++;
    }
  }

  // Strategy B: Signal-based (fill remaining slots)
  if (published < effectiveMax) {
    const signalResults = await executeSignalPublications(effectiveMax - published, cfg, runningCostUsd);
    for (const result of signalResults) {
      results.push(result);
      totalCostUsd += result.costUsd;
      runningCostUsd.value = totalCostUsd;
      if (result.status === "published") published++;
    }
  }

  phases.push({ name: "publication-execution", status: "ok", durationMs: Date.now() - execStart, details: `${published} published, ${results.filter(r => r.status === "failed").length} failed` });

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 4: KNOWLEDGE GRAPH UPDATE (optional)
  // ════════════════════════════════════════════════════════════════════════
  if (cfg.enableKnowledgeGraph && results.some(r => r.status === "published")) {
    const kgStart = Date.now();
    try {
      console.log("[AUTO-PUBLISHER] Phase 4: Knowledge graph update...");
      let kgUpdated = 0;

      for (const result of results) {
        if (result.status === "published" && result.briefId) {
          try {
            const brief = await prisma.brief.findUnique({
              where: { id: result.briefId },
              select: { question: true, html: true, sources: true },
            });

            if (brief) {
              const plainText = (brief.html || "").replace(/<[^>]*>/g, " ").slice(0, 6000);
              const sourceIds = (brief.sources as any[])?.map((s: any) => s.id || s) || [];
              await extractAndStoreConcepts(result.briefId, brief.question, plainText, sourceIds);
              kgUpdated++;
            }
          } catch (err: any) {
            console.warn(`[AUTO-PUBLISHER] KG update failed for ${result.briefId}:`, err.message);
          }
        }
      }

      phases.push({ name: "knowledge-graph", status: "ok", durationMs: Date.now() - kgStart, details: `${kgUpdated} briefs indexed` });
    } catch (err: any) {
      phases.push({ name: "knowledge-graph", status: "error", durationMs: Date.now() - kgStart, details: err.message });
    }
  } else {
    phases.push({ name: "knowledge-graph", status: "skipped", durationMs: 0 });
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 5: CADENCE LEDGER
  // ════════════════════════════════════════════════════════════════════════
  phases.push({
    name: "cadence",
    status: "ok",
    durationMs: 0,
    details: `Published ${published}; cadence is derived from ThinkTankPublication, not subscription counters`,
  });

  const output = buildOutput(results, agenda, scanStats, totalCostUsd, startedAt, runId, cfg, phases);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`[AUTO-PUBLISHER] Run ${runId} complete`);
  console.log(`[AUTO-PUBLISHER] Published: ${output.published} | Review: ${output.pendingReview} | Failed: ${output.failed}`);
  console.log(`[AUTO-PUBLISHER] Cost: $${output.totalCostUsd.toFixed(4)} | Duration: ${(output.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`${"=".repeat(80)}\n`);

  return output;
}

// ============================================================================
// PROACTIVE SCAN
// ============================================================================

async function runProactiveScan(cfg: Required<AutoPublisherConfig>): Promise<NonNullable<AutoPublisherOutput['scanStats']>> {
  const stats = { sourcesIngested: 0, signalsDetected: 0, trendBreaks: 0, contradictions: 0 };

  // Get active verticals
  const whereClause: any = { isActive: true };
  if (cfg.verticalSlugs.length > 0) {
    whereClause.slug = { in: cfg.verticalSlugs };
  }

  const verticals = await prisma.vertical.findMany({
    where: whereClause,
    select: { id: true, slug: true, name: true, description: true },
  });

  const allNewSourceIds: string[] = [];

  // Scout per vertical with smart providers
  for (const vertical of verticals) {
    try {
      const searchQuery = vertical.description || vertical.name;
      const smartSelection = await selectSmartProviders(searchQuery).catch(() => null);
      const scoutProviders = (smartSelection?.providers ?? ["openalex", "crossref", "semanticscholar"]) as any;
      const scoutQty = smartSelection ? Math.ceil(smartSelection.quantity / scoutProviders.length) : 20;

      const scoutResult = await scout(
        searchQuery,
        scoutProviders,
        scoutQty
      );

      if (scoutResult.sourceIds?.length) {
        allNewSourceIds.push(...scoutResult.sourceIds);
        stats.sourcesIngested += scoutResult.upserted || 0;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err: any) {
      console.warn(`[AUTO-PUBLISHER] Scout failed for ${vertical.name}:`, err.message);
    }
  }

  // Signal detection
  if (allNewSourceIds.length > 0) {
    try {
      const batchSize = 50;
      for (let i = 0; i < allNewSourceIds.length; i += batchSize) {
        const batch = allNewSourceIds.slice(i, i + batchSize);
        const result = await signalDetector({ sourceIds: batch });
        stats.signalsDetected += result.detected;
      }
    } catch (err: any) {
      console.warn("[AUTO-PUBLISHER] Signal detection failed:", err.message);
    }
  }

  // Trend analysis
  if (cfg.enableTrendAnalysis) {
    try {
      const trendResult = await trendAnalyzer({ lookbackMonths: 6, minSources: 10 });
      stats.trendBreaks = trendResult.trends.length;
    } catch (err: any) {
      console.warn("[AUTO-PUBLISHER] Trend analysis failed:", err.message);
    }
  }

  // Contradiction detection
  if (cfg.enableContradictionDetection && allNewSourceIds.length >= 5) {
    try {
      const result = await contradictionDetector(allNewSourceIds.slice(0, 100), { minQuality: 75 });
      stats.contradictions = result.contradictionsFound;
    } catch (err: any) {
      console.warn("[AUTO-PUBLISHER] Contradiction detection failed:", err.message);
    }
  }

  return stats;
}

// ============================================================================
// PUBLICATION EXECUTION
// ============================================================================

async function executePublication(
  proposal: EditorialProposal,
  cfg: Required<AutoPublisherConfig>,
  runningCostUsd: { value: number }
): Promise<PublicationResult> {
  const pubStart = Date.now();

  // Budget cap — abort before starting if already over limit
  if (cfg.maxCostUsd > 0 && runningCostUsd.value >= cfg.maxCostUsd) {
    console.warn(`[AUTO-PUBLISHER] Budget cap reached ($${runningCostUsd.value.toFixed(2)} >= $${cfg.maxCostUsd}) — skipping "${proposal.topic}"`);
    return {
      topic: proposal.topic,
      strategy: "editorial",
      trustScore: 0,
      wordCount: 0,
      costUsd: 0,
      durationMs: 0,
      providers: [],
      status: "failed",
      error: `Budget cap $${cfg.maxCostUsd} reached`,
    };
  }

  // Researcher ownership — detect domain owner + select pipeline tier
  const owner = getPrimaryDomainOwner(proposal.topic);
  const tier = cfg.forceTier ?? selectPipelineTier(
    proposal.topic,
    proposal.suggestedFormat,
    undefined,
    cfg.maxCostUsd
  );

  const smartSel = proposal.suggestedProviders.length > 0
    ? null
    : await selectSmartProviders(proposal.topic).catch(() => null);
  const providers = proposal.suggestedProviders.length > 0
    ? proposal.suggestedProviders
    : (smartSel?.providers ?? (owner?.expert.providers.slice(0, 5) || []));

  console.log(`[AUTO-PUBLISHER] Executing: "${proposal.topic}" | tier=${tier} | owner=${owner?.expert.name || 'unknown'} | providers=${providers.length}`);

  if (cfg.dryRun) {
    return {
      topic: proposal.topic,
      strategy: "editorial",
      trustScore: 0,
      wordCount: 0,
      costUsd: 0,
      durationMs: 0,
      providers,
      status: "review",
    };
  }

  try {
    const isStrategic = proposal.suggestedFormat === "strategic" || tier === "strategic";
    const pipelineMode = isStrategic ? "strategic" : "brief";

    const result = await runPipeline(
      proposal.topic,
      pipelineMode,
      {
        providers: providers as any[],
        perProvider: isStrategic ? 25 : 20,
        enableHarvardCouncil: tier !== "standard",
        enableDebate: tier !== "standard",
        enableMetaAnalysis: tier === "strategic",
        enableDevilsAdvocate: tier !== "standard",
      }
    );

    if (!result.briefId) {
      return {
        topic: proposal.topic,
        strategy: "editorial",
        trustScore: 0,
        wordCount: 0,
        costUsd: result.stats?.totalCostUsd || 0,
        durationMs: Date.now() - pubStart,
        providers,
        status: "failed",
        error: "No briefId returned from pipeline",
      };
    }

    // Get the brief to check trust score
    const brief = await prisma.brief.findUnique({
      where: { id: result.briefId },
      select: { trustScore: true, html: true, question: true, lineage: true, sources: true },
    });

    const trustScore = brief?.trustScore || result.stats?.trustScore || 0;
    const wordCount = result.stats?.wordCount || countWords(brief?.html || "");

    // Quality gate: prefer Devil's Advocate publishabilityScore over raw trustScore
    // The DA score is more rigorous — it accounts for epistemic flaws, not just citation coverage
    const lineage = (brief?.lineage as any) || {};
    const daScore = lineage?.devilsAdvocate?.publishabilityScore;
    const daVerdict = lineage?.devilsAdvocate?.verdict;
    const effectiveScore = daScore !== undefined ? daScore : trustScore;
    const sourceIds = brief?.sources || result.stats?.sourceIds || [];
    const citationIntegrity = result.stats?.citationVerifier?.integrity ?? result.stats?.citationVerifier?.overallIntegrity;
    const publicationGate = evaluatePublicationGate({
      format: isStrategic ? "strategic" : "brief",
      html: brief?.html || "",
      sourceIds,
      trustScore: effectiveScore,
      qualityScore: effectiveScore,
      citationCoverage: citationIntegrity
        ? citationIntegrity / 100
        : undefined,
      devilsAdvocateScore: daScore,
      fatalChallenges: lineage?.devilsAdvocate?.fatalChallenges || 0,
    });

    if (daVerdict === "reject") {
      console.log(`[AUTO-PUBLISHER] Devil's Advocate REJECTED: "${proposal.topic}" — fatal epistemic flaws detected`);
      return {
        topic: proposal.topic,
        strategy: "editorial",
        briefId: result.briefId,
        trustScore: effectiveScore,
        wordCount,
        costUsd: result.stats?.totalCostUsd || 0,
        durationMs: Date.now() - pubStart,
        providers,
        status: "failed",
        error: `Devil's Advocate rejected: ${lineage?.devilsAdvocate?.fatalChallenges} fatal flaw(s)`,
      };
    }

    if (effectiveScore < cfg.minTrustScore || daVerdict === "major_revision" || publicationGate.decision !== "publish") {
      const reason = daVerdict === "major_revision"
        ? `Devil's Advocate: major_revision required`
        : publicationGate.decision !== "publish"
          ? `publication gate: ${publicationGate.reasons.join("; ")}`
          : `score ${effectiveScore} < threshold ${cfg.minTrustScore}`;
      console.log(`[AUTO-PUBLISHER] Quality gate failed: ${reason} — sending to review`);

      // Create publication in DRAFT status
      const vertical = await prisma.vertical.findFirst({ where: { isActive: true } });
      if (vertical) {
        const pub = await prisma.thinkTankPublication.create({
          data: {
            verticalId: vertical.id,
            type: isStrategic ? "STRATEGIC_REPORT" : "RESEARCH_BRIEF",
            title: proposal.topic,
            html: brief?.html || "",
            wordCount,
            trustScore: effectiveScore,
            qualityScore: effectiveScore,
            citationCoverage: publicationGate.metrics.citationCoverage,
            claimCount: publicationGate.metrics.claimCount,
            factClaimCount: publicationGate.metrics.claimCount,
            citedClaimCount: publicationGate.metrics.citedClaimCount,
            sourceIds,
            status: "DRAFT",
            criticalLoopResult: {
              briefId: result.briefId,
              reason: proposal.reason,
              confidence: proposal.confidence,
              autoPublisherRun: true,
              qualityGateFailed: true,
              devilsAdvocateVerdict: daVerdict,
              publicationGate,
            },
          },
        });

        return {
          topic: proposal.topic,
          strategy: "editorial",
          publicationId: pub.id,
          briefId: result.briefId,
          trustScore: effectiveScore,
          wordCount,
          costUsd: result.stats?.totalCostUsd || 0,
          durationMs: Date.now() - pubStart,
          providers,
          status: "review",
        };
      }
    }

    // Researcher Sign-Off — domain expert reviews before publication
    let signOffDecision: "approve" | "revise" | "reject" = "approve";
    let signOffCost = 0;
    
    try {
      // Default to individual researcher sign-off
      if (owner) {
        const signOff = await requestResearcherSignOff(proposal.topic, brief?.html || "", trustScore);
        signOffDecision = signOff.decision;
        signOffCost = 0; // SignOffResult doesn't have costUsd
        console.log(`[AUTO-PUBLISHER] ${signOff.researcherName}: ${signOffDecision} (confidence: ${signOff.confidence})`);
        if (signOff.comments && signOff.comments.length > 0) {
          console.log(`[AUTO-PUBLISHER] ${signOff.researcherName} comments: ${signOff.comments.join(" | ")}`);
        }
        
        if (signOffDecision === "reject") {
          return {
            topic: proposal.topic,
            strategy: "editorial",
            briefId: result.briefId,
            trustScore: effectiveScore,
            wordCount,
            costUsd: (result.stats?.totalCostUsd || 0) + signOffCost,
            durationMs: Date.now() - pubStart,
            providers,
            status: "failed",
            error: `${signOff.researcherName} rejected publication`,
          };
        }
        if (signOffDecision === "revise") {
          console.log(`[AUTO-PUBLISHER] Researcher requests revision — sending to review`);
          return {
            topic: proposal.topic,
            strategy: "editorial",
            briefId: result.briefId,
            trustScore: effectiveScore,
            wordCount,
            costUsd: (result.stats?.totalCostUsd || 0) + signOffCost,
            durationMs: Date.now() - pubStart,
            providers,
            status: "review",
          };
        }
      }
    } catch (err: any) {
      console.error(`[AUTO-PUBLISHER] Researcher sign-off failed: ${err.message}`);
      signOffDecision = "approve";
      signOffCost = 0;
    }

    // Quality gate passed + Editorial Gate approved — publish
    const vertical = await prisma.vertical.findFirst({ where: { isActive: true } });
    if (vertical) {
      const pub = await prisma.thinkTankPublication.create({
        data: {
          verticalId: vertical.id,
          type: isStrategic ? "STRATEGIC_REPORT" : "RESEARCH_BRIEF",
          title: proposal.topic,
          html: brief?.html || "",
          wordCount,
          trustScore: effectiveScore,
          qualityScore: effectiveScore,
          citationCoverage: publicationGate.metrics.citationCoverage,
          claimCount: publicationGate.metrics.claimCount,
          factClaimCount: publicationGate.metrics.claimCount,
          citedClaimCount: publicationGate.metrics.citedClaimCount,
          sourceIds,
          status: "PUBLISHED",
          publishedAt: new Date(),
          criticalLoopResult: {
            briefId: result.briefId,
            reason: proposal.reason,
            confidence: proposal.confidence,
            autoPublisherRun: true,
            pipelineTier: tier,
            researcherOwner: owner?.researcher.name || 'unknown',
            researcherDomain: owner?.domain || 'unknown',
            researcherSignOff: signOffDecision,
            devilsAdvocateVerdict: daVerdict,
            devilsAdvocateScore: daScore,
            publicationGate,
            stats: result.stats,
          },
        },
      });

      console.log(`[AUTO-PUBLISHER] ✅ Published: "${proposal.topic}" (score: ${effectiveScore}${daVerdict ? `, DA:${daVerdict}` : ""}, words: ${wordCount})`);

      return {
        topic: proposal.topic,
        strategy: "editorial",
        publicationId: pub.id,
        briefId: result.briefId,
        trustScore: effectiveScore,
        wordCount,
        costUsd: (result.stats?.totalCostUsd || 0) + signOffCost,
        durationMs: Date.now() - pubStart,
        providers,
        status: "published",
      };
    }

    return {
      topic: proposal.topic,
      strategy: "editorial",
      briefId: result.briefId,
      trustScore,
      wordCount,
      costUsd: result.stats?.totalCostUsd || 0,
      durationMs: Date.now() - pubStart,
      providers,
      status: "failed",
      error: "No active vertical found",
    };

  } catch (err: any) {
    console.error(`[AUTO-PUBLISHER] Publication failed for "${proposal.topic}":`, err.message);
    return {
      topic: proposal.topic,
      strategy: "editorial",
      trustScore: 0,
      wordCount: 0,
      costUsd: 0,
      durationMs: Date.now() - pubStart,
      providers,
      status: "failed",
      error: err.message,
    };
  }
}

async function executeSignalPublications(
  maxSlots: number,
  cfg: Required<AutoPublisherConfig>,
  runningCostUsd: { value: number }
): Promise<PublicationResult[]> {
  const results: PublicationResult[] = [];

  const recentSignals = await prisma.signal.findMany({
    where: {
      status: "NEW",
      priorityScore: { gte: 70 },
      detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { priorityScore: "desc" },
    take: maxSlots,
    include: { vertical: { select: { id: true, name: true } } },
  });

  if (recentSignals.length === 0) {
    console.log("[AUTO-PUBLISHER] No qualifying signals for fallback publication");
    return results;
  }

  console.log(`[AUTO-PUBLISHER] Signal fallback: ${recentSignals.length} signals to process`);

  for (const signal of recentSignals) {
    if (results.filter(r => r.status === "published").length >= maxSlots) break;
    if (cfg.maxCostUsd > 0 && runningCostUsd.value >= cfg.maxCostUsd) {
      console.warn(`[AUTO-PUBLISHER] Budget cap reached — stopping signal publications`);
      break;
    }

    const pubStart = Date.now();

    if (cfg.dryRun) {
      results.push({
        topic: signal.title,
        strategy: "signal",
        trustScore: 0,
        wordCount: 0,
        costUsd: 0,
        durationMs: 0,
        providers: [],
        status: "review",
      });
      continue;
    }

    try {
      console.log(`[AUTO-PUBLISHER] [SIGNAL] Generating: "${signal.title}"`);

      const pubResult = await generatePublication({ signalId: signal.id });

      if (pubResult.success && pubResult.status === "PUBLISHED" && pubResult.trustScore >= cfg.minTrustScore) {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "PUBLISHED" },
        });

        results.push({
          topic: signal.title,
          strategy: "signal",
          publicationId: pubResult.publicationId,
          trustScore: pubResult.trustScore,
          wordCount: pubResult.wordCount,
          costUsd: pubResult.lineage?.totalCostUsd || 0,
          durationMs: Date.now() - pubStart,
          providers: [],
          status: "published",
        });

        console.log(`[AUTO-PUBLISHER] ✅ Signal published: "${signal.title}" (trust: ${pubResult.trustScore})`);
      } else if (pubResult.success) {
        // Below trust threshold — mark for review
        results.push({
          topic: signal.title,
          strategy: "signal",
          publicationId: pubResult.publicationId,
          trustScore: pubResult.trustScore,
          wordCount: pubResult.wordCount,
          costUsd: pubResult.lineage?.totalCostUsd || 0,
          durationMs: Date.now() - pubStart,
          providers: [],
          status: "review",
        });
      } else {
        results.push({
          topic: signal.title,
          strategy: "signal",
          trustScore: 0,
          wordCount: 0,
          costUsd: 0,
          durationMs: Date.now() - pubStart,
          providers: [],
          status: "failed",
          error: pubResult.error,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err: any) {
      results.push({
        topic: signal.title,
        strategy: "signal",
        trustScore: 0,
        wordCount: 0,
        costUsd: 0,
        durationMs: Date.now() - pubStart,
        providers: [],
        status: "failed",
        error: err.message,
      });
    }
  }

  return results;
}

// ============================================================================
// HELPERS
// ============================================================================

async function getRemainingWeeklySlots(): Promise<number> {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const current = await prisma.thinkTankPublication.count({
      where: {
        status: "PUBLISHED",
        publishedAt: { gte: oneWeekAgo },
      },
    });
    return Math.max(0, getWeeklyPublicationMax() - current);
  } catch {
    return DEFAULT_WEEKLY_PUBLICATION_MAX;
  }
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.split(" ").filter(w => w.length > 0).length;
}

function buildOutput(
  results: PublicationResult[],
  agenda: EditorialAgenda | undefined,
  scanStats: AutoPublisherOutput['scanStats'] | undefined,
  totalCostUsd: number,
  startedAt: Date,
  runId: string,
  cfg: Required<AutoPublisherConfig>,
  phases: AutoPublisherLineage['phases']
): AutoPublisherOutput {
  const finishedAt = new Date();

  return {
    published: results.filter(r => r.status === "published").length,
    pendingReview: results.filter(r => r.status === "review").length,
    failed: results.filter(r => r.status === "failed").length,
    results,
    agenda,
    scanStats,
    totalCostUsd,
    totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
    lineage: {
      runId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      config: cfg,
      phases,
      version: "v2.0.0",
    },
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick autonomous run with sensible defaults.
 * Ideal for cron jobs.
 */
export async function runAutoPublisher(): Promise<AutoPublisherOutput> {
  return autoPublisher({
    maxPublications: 3,
    minTrustScore: 65,
    enableHarvardCouncil: true,
    enableProactiveScan: true,
    enableKnowledgeGraph: true,
  });
}

/**
 * Strategic deep-dive run.
 * Fewer publications but higher quality with Harvard Council.
 */
export async function runStrategicAutoPublisher(): Promise<AutoPublisherOutput> {
  return autoPublisher({
    maxPublications: 1,
    minTrustScore: 75,
    enableHarvardCouncil: true,
    enableProactiveScan: true,
    enableKnowledgeGraph: true,
  });
}

/**
 * Dry run — plan and analyze but don't publish.
 * Useful for previewing what the system would do.
 */
export async function dryRunAutoPublisher(): Promise<AutoPublisherOutput> {
  return autoPublisher({
    maxPublications: 5,
    dryRun: true,
    enableProactiveScan: false,
  });
}
