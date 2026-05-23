/**
 * Think Tank Dispatcher — Autonomous brain (PRIMARY product path)
 * ─────────────────────────────────────────────────────────────
 * Studio is a paid add-on. This module is the core NomosX loop:
 *
 *   SENSE → DECIDE → DISPATCH → runAndPublishInquiry()
 *
 * Modes:
 *   • breaking  — 2×/day radar + Editor-in-Chief (auto-scan cron)
 *   • weekly    — editorial plan + signal fallback (generate-briefs cron)
 *
 * Crons are thin HTTP wrappers; all logic lives here.
 */

import { prisma } from "@/lib/db";
import { runAndPublishInquiry, type InquiryPublishResult } from "./inquiry-orchestrator";
import { publicationTypeToDepth } from "./inquiry-funnel-utils";
import { runTopicRadar } from "./topic-radar";
import { editorialTriage, type EditorialDecision } from "./editor-in-chief";
import { planEditorialAgenda } from "./editorial-planner";
import { selectSmartProviders } from "./smart-provider-selector";
import { getVerticalForTopic } from "./researcher-ownership";
import { classifyTopic } from "./topic-classifier";
import type { InquiryDepth } from "@/lib/types/inquiry";

// ─── Config ────────────────────────────────────────────────────

const DEFAULT_WEEKLY_MAX = 3;
const DEFAULT_BREAKING_MAX = 2;
const DEFAULT_BREAKING_BUDGET_USD = 20;

export type ThinkTankCycleMode = "breaking" | "weekly";

export type ThinkTankStrategy = "breaking" | "editorial" | "signal";

export interface ThinkTankDispatchItem {
  question: string;
  depth: InquiryDepth;
  domain?: string;
  verticalId?: string;
  verticalSlug?: string;
  signalId?: string;
  providers?: string[];
  perProvider?: number;
  requireResearcherSignOff?: boolean;
  strategy: ThinkTankStrategy;
  metadata?: Record<string, unknown>;
}

export interface ThinkTankCycleOptions {
  mode: ThinkTankCycleMode;
  /** Override slot cap (breaking defaults to 2, weekly to remaining cadence) */
  maxPublications?: number;
  budgetUsd?: number;
  dryRun?: boolean;
}

export interface ThinkTankDispatchOutcome {
  item: ThinkTankDispatchItem;
  result: InquiryPublishResult;
}

export interface ThinkTankCycleResult {
  mode: ThinkTankCycleMode;
  success: boolean;
  durationMs: number;
  cadence: {
    weeklyMax: number;
    publishedThisWeek: number;
    remainingSlots: number;
  };
  collected: number;
  published: number;
  held: number;
  skipped: number;
  failed: number;
  totalCostUsd: number;
  decideCostUsd: number;
  outcomes: ThinkTankDispatchOutcome[];
  topics: string[];
  errors: string[];
  phases?: Record<string, unknown>;
}

export interface CadenceState {
  weeklyMax: number;
  publishedThisWeek: number;
  remainingSlots: number;
  verticalPubCounts: Map<string, number>;
}

// ─── Cadence (shared) ──────────────────────────────────────────

export function getWeeklyPublicationMax(): number {
  const parsed = Number.parseInt(process.env.NOMOSX_WEEKLY_PUBLICATION_MAX || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WEEKLY_MAX;
  return Math.min(parsed, 25);
}

export async function getCadenceState(): Promise<CadenceState> {
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
  const weeklyMax = getWeeklyPublicationMax();

  const [publishedThisWeek, recentPubs] = await Promise.all([
    prisma.thinkTankPublication.count({
      where: { status: "PUBLISHED", publishedAt: { gte: oneWeekAgo } },
    }),
    prisma.thinkTankPublication.groupBy({
      by: ["verticalId"],
      where: { publishedAt: { gte: oneWeekAgo } },
      _count: true,
    }),
  ]);

  const verticalPubCounts = new Map<string, number>();
  for (const row of recentPubs) {
    verticalPubCounts.set(row.verticalId, row._count);
  }

  return {
    weeklyMax,
    publishedThisWeek,
    remainingSlots: Math.max(0, weeklyMax - publishedThisWeek),
    verticalPubCounts,
  };
}

export function verticalHasCapacity(
  verticalId: string,
  verticalConfig: unknown,
  verticalPubCounts: Map<string, number>
): boolean {
  const maxPerWeek =
    (verticalConfig as { maxPublicationsPerWeek?: number } | null)?.maxPublicationsPerWeek ?? 3;
  return (verticalPubCounts.get(verticalId) || 0) < maxPerWeek;
}

function emptyResult(mode: ThinkTankCycleMode, cadence: CadenceState, started: number): ThinkTankCycleResult {
  return {
    mode,
    success: true,
    durationMs: Date.now() - started,
    cadence: {
      weeklyMax: cadence.weeklyMax,
      publishedThisWeek: cadence.publishedThisWeek,
      remainingSlots: cadence.remainingSlots,
    },
    collected: 0,
    published: 0,
    held: 0,
    skipped: 0,
    failed: 0,
    totalCostUsd: 0,
    decideCostUsd: 0,
    outcomes: [],
    topics: [],
    errors: [],
  };
}

// ─── Item collectors ───────────────────────────────────────────

function breakingDecisionToItem(decision: EditorialDecision): ThinkTankDispatchItem {
  const classifiedProviders = decision.classification.providers.slice(0, 4);
  const newsProviders = ["gdelt-news", "newsapi", "gnews"];
  const providers = Array.from(new Set([...classifiedProviders, ...newsProviders])).slice(0, 8);
  const leadResearcher = decision.classification.researchers[0];

  return {
    question: decision.topic.title,
    depth: "strategic",
    domain: decision.classification.primaryDomain,
    verticalSlug: decision.classification.verticalSlug,
    providers,
    perProvider: 15,
    strategy: "breaking",
    metadata: {
      decision: decision.action,
      reasoning: decision.reasoning,
      priority: decision.priority,
      urgency: decision.classification.urgency,
      leadResearcher: leadResearcher?.profile.name,
      isCrossDomain: decision.classification.isCrossDomain,
      collaborators: decision.classification.researchers.slice(1).map((r) => r.profile.name),
      radarSource: decision.topic.sourceType,
      radarScore: decision.topic.score,
    },
  };
}

async function collectBreakingItems(
  maxPublications: number,
  budgetUsd: number
): Promise<{ items: ThinkTankDispatchItem[]; decideCostUsd: number; phases: Record<string, unknown>; errors: string[] }> {
  const errors: string[] = [];
  const detectStart = Date.now();

  const radarResult = await runTopicRadar({ maxTopics: 15, includeAcademic: true });
  const detectMs = Date.now() - detectStart;

  if (radarResult.topics.length === 0) {
    return {
      items: [],
      decideCostUsd: 0,
      phases: { detect: { durationMs: detectMs, topicsFound: 0 } },
      errors,
    };
  }

  const decideStart = Date.now();
  const triageResult = await editorialTriage(radarResult.topics, {
    maxPublications,
    budgetUsd,
  });
  const decideMs = Date.now() - decideStart;

  const items = triageResult.decisions.map(breakingDecisionToItem);

  return {
    items,
    decideCostUsd: triageResult.costUsd,
    phases: {
      detect: { durationMs: detectMs, topicsFound: radarResult.topics.length, stats: radarResult.stats },
      decide: {
        durationMs: decideMs,
        selected: triageResult.decisions.length,
        skipped: triageResult.skipped,
        costUsd: triageResult.costUsd,
      },
    },
    errors,
  };
}

async function collectWeeklyItems(
  remainingSlots: number,
  verticalPubCounts: Map<string, number>
): Promise<{ items: ThinkTankDispatchItem[]; errors: string[] }> {
  const items: ThinkTankDispatchItem[] = [];
  const errors: string[] = [];

  // Strategy 1: editorial auto-commission
  try {
    const agenda = await planEditorialAgenda({ weeklySlots: remainingSlots });

    for (const proposal of agenda.autoCommission) {
      if (items.length >= remainingSlots) break;

      const smartSel =
        proposal.suggestedProviders.length > 0
          ? null
          : await selectSmartProviders(proposal.topic).catch(() => null);
      const providers =
        proposal.suggestedProviders.length > 0
          ? proposal.suggestedProviders
          : (smartSel?.providers ?? []);

      const depth: InquiryDepth = proposal.suggestedFormat === "strategic" ? "strategic" : "standard";
      const topicClassification = await classifyTopic(proposal.topic).catch(() => null);
      const matchedSlug = topicClassification?.verticalSlug || getVerticalForTopic(proposal.topic);

      const vertical = matchedSlug
        ? await prisma.vertical.findUnique({
            where: { slug: matchedSlug },
            select: { id: true, slug: true, config: true },
          })
        : await prisma.vertical.findFirst({
            where: { isActive: true },
            select: { id: true, slug: true, config: true },
          });

      if (vertical && !verticalHasCapacity(vertical.id, vertical.config, verticalPubCounts)) {
        continue;
      }

      items.push({
        question: proposal.topic,
        depth,
        domain: topicClassification?.primaryDomain,
        verticalSlug: matchedSlug ?? vertical?.slug,
        providers,
        perProvider: depth === "strategic" ? 25 : 20,
        requireResearcherSignOff: true,
        strategy: "editorial",
        metadata: {
          reason: proposal.reason,
          confidence: proposal.confidence,
          editorialPriority: proposal.priority,
        },
      });
    }
  } catch (err: unknown) {
    errors.push(`Editorial plan: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strategy 2: high-priority signals (fill remaining slots)
  const signalSlots = remainingSlots - items.length;
  if (signalSlots > 0) {
    const signals = await prisma.signal.findMany({
      where: {
        status: "NEW",
        priorityScore: { gte: 70 },
        detectedAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      orderBy: { priorityScore: "desc" },
      take: signalSlots,
      select: {
        id: true,
        title: true,
        verticalId: true,
        signalType: true,
        priorityScore: true,
      },
    });

    for (const signal of signals) {
      const vertical = await prisma.vertical.findUnique({
        where: { id: signal.verticalId },
        select: { id: true, slug: true, config: true },
      });

      if (vertical && !verticalHasCapacity(vertical.id, vertical.config, verticalPubCounts)) {
        continue;
      }

      items.push({
        question: signal.title,
        depth: publicationTypeToDepth(
          signal.priorityScore >= 85 ? "STRATEGIC_REPORT" : "EXECUTIVE_BRIEF"
        ),
        verticalId: signal.verticalId,
        signalId: signal.id,
        strategy: "signal",
        metadata: {
          signalType: signal.signalType,
          priorityScore: signal.priorityScore,
        },
      });
    }
  }

  return { items, errors };
}

// ─── Dispatch queue ────────────────────────────────────────────

async function executeDispatchQueue(
  items: ThinkTankDispatchItem[],
  cadence: CadenceState,
  maxExecutions: number,
  dryRun: boolean
): Promise<{
  outcomes: ThinkTankDispatchOutcome[];
  published: number;
  held: number;
  skipped: number;
  failed: number;
  totalCostUsd: number;
  topics: string[];
  errors: string[];
  verticalPubCounts: Map<string, number>;
}> {
  const outcomes: ThinkTankDispatchOutcome[] = [];
  const errors: string[] = [];
  const topics: string[] = [];
  const verticalPubCounts = new Map(cadence.verticalPubCounts);
  let published = 0;
  let held = 0;
  let skipped = 0;
  let failed = 0;
  let totalCostUsd = 0;
  let executed = 0;

  for (const item of items) {
    if (executed >= maxExecutions) break;

    // Resolve vertical for capacity gate
    let verticalId = item.verticalId;
    if (!verticalId && item.verticalSlug) {
      const v = await prisma.vertical.findUnique({
        where: { slug: item.verticalSlug },
        select: { id: true, config: true },
      });
      verticalId = v?.id;
      if (v && !verticalHasCapacity(v.id, v.config, verticalPubCounts)) {
        skipped++;
        continue;
      }
    } else if (verticalId) {
      const v = await prisma.vertical.findUnique({
        where: { id: verticalId },
        select: { id: true, config: true },
      });
      if (v && !verticalHasCapacity(v.id, v.config, verticalPubCounts)) {
        skipped++;
        continue;
      }
    }

    const source = item.strategy === "breaking" ? "auto-scan" : "generate-briefs";

    const result = await runAndPublishInquiry({
      question: item.question,
      depth: item.depth,
      domain: item.domain,
      verticalId: item.verticalId,
      verticalSlug: item.verticalSlug,
      signalId: item.signalId,
      providers: item.providers,
      perProvider: item.perProvider,
      source,
      dryRun,
      requireResearcherSignOff: item.requireResearcherSignOff,
      minTrustScore: 65,
      metadata: { strategy: item.strategy, ...item.metadata },
    });

    outcomes.push({ item, result });
    totalCostUsd += result.costUsd;
    executed++;

    if (result.status === "published") {
      published++;
      topics.push(item.question);
      if (verticalId) {
        verticalPubCounts.set(verticalId, (verticalPubCounts.get(verticalId) || 0) + 1);
      }
      if (item.signalId) {
        await prisma.signal
          .update({ where: { id: item.signalId }, data: { status: "PUBLISHED" } })
          .catch(() => undefined);
      }
    } else if (result.status === "skipped_duplicate" || result.status === "skipped_dry_run") {
      skipped++;
    } else if (result.status === "failed") {
      failed++;
      errors.push(`"${item.question.slice(0, 40)}": ${result.error ?? "unknown"}`);
    } else {
      held++;
      topics.push(item.question);
    }

    // Throttle between heavy pipeline runs
    if (executed < items.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return { outcomes, published, held, skipped, failed, totalCostUsd, topics, errors, verticalPubCounts };
}

// ─── Main entry ────────────────────────────────────────────────

/**
 * Run one autonomous think-tank cycle.
 * Called by cron routes — never by Studio.
 */
export async function runThinkTankCycle(
  options: ThinkTankCycleOptions
): Promise<ThinkTankCycleResult> {
  const started = Date.now();
  const cadence = await getCadenceState();
  const errors: string[] = [];

  console.log(
    `[ThinkTank] Cycle mode=${options.mode} cadence=${cadence.remainingSlots}/${cadence.weeklyMax} dryRun=${!!options.dryRun}`
  );

  if (options.mode === "weekly" && cadence.remainingSlots <= 0) {
    console.log("[ThinkTank] Weekly cadence full — silence is respected");
    return emptyResult(options.mode, cadence, started);
  }

  let items: ThinkTankDispatchItem[] = [];
  let decideCostUsd = 0;
  let phases: Record<string, unknown> | undefined;
  let maxExecutions: number;

  if (options.mode === "breaking") {
    maxExecutions = options.maxPublications ?? DEFAULT_BREAKING_MAX;
    const collected = await collectBreakingItems(
      maxExecutions,
      options.budgetUsd ?? DEFAULT_BREAKING_BUDGET_USD
    );
    items = collected.items;
    decideCostUsd = collected.decideCostUsd;
    phases = collected.phases;
    errors.push(...collected.errors);

    // Breaking scans respect global weekly cadence too
    maxExecutions = Math.min(maxExecutions, cadence.remainingSlots);
    if (maxExecutions <= 0) {
      console.log("[ThinkTank] No weekly slots left for breaking publish");
      return { ...emptyResult(options.mode, cadence, started), phases, decideCostUsd };
    }
  } else {
    maxExecutions = options.maxPublications ?? cadence.remainingSlots;
    const collected = await collectWeeklyItems(maxExecutions, cadence.verticalPubCounts);
    items = collected.items;
    errors.push(...collected.errors);
  }

  if (items.length === 0) {
    return {
      ...emptyResult(options.mode, cadence, started),
      phases,
      decideCostUsd,
      errors,
    };
  }

  console.log(`[ThinkTank] Dispatching ${items.length} item(s), max execute=${maxExecutions}`);

  const delegateStart = Date.now();
  const dispatch = await executeDispatchQueue(items, cadence, maxExecutions, !!options.dryRun);
  const delegateMs = Date.now() - delegateStart;

  if (phases) {
    phases.delegate = { durationMs: delegateMs, published: dispatch.published };
  }

  const result: ThinkTankCycleResult = {
    mode: options.mode,
    success: dispatch.failed === 0,
    durationMs: Date.now() - started,
    cadence: {
      weeklyMax: cadence.weeklyMax,
      publishedThisWeek: cadence.publishedThisWeek + dispatch.published,
      remainingSlots: Math.max(0, cadence.remainingSlots - dispatch.published),
    },
    collected: items.length,
    published: dispatch.published,
    held: dispatch.held,
    skipped: dispatch.skipped,
    failed: dispatch.failed,
    totalCostUsd: dispatch.totalCostUsd + decideCostUsd,
    decideCostUsd,
    outcomes: dispatch.outcomes,
    topics: dispatch.topics,
    errors: [...errors, ...dispatch.errors],
    phases,
  };

  console.log(
    `[ThinkTank] Done mode=${options.mode} published=${result.published} held=${result.held} skipped=${result.skipped} failed=${result.failed} $${result.totalCostUsd.toFixed(4)} ${result.durationMs}ms`
  );

  return result;
}

/** Health snapshot for admin GET endpoints */
export async function getThinkTankStatus() {
  const cadence = await getCadenceState();
  const oneDayAgo = new Date(Date.now() - 86400000);
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000);

  const [signals24h, sources24h, recentPubs, verticals] = await Promise.all([
    prisma.signal.count({ where: { detectedAt: { gte: oneDayAgo } } }),
    prisma.source.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.thinkTankPublication.findMany({
      where: { publishedAt: { gte: oneWeekAgo } },
      select: { type: true },
    }),
    prisma.vertical.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        name: true,
        config: true,
        _count: { select: { signals: true, publications: true } },
      },
    }),
  ]);

  return {
    architecture: "ThinkTankDispatcher → inquiry-orchestrator → inquiry-pipeline",
    schedule: {
      breaking: "2×/day 06:00 & 18:00 UTC (auto-scan)",
      weekly: "Sunday 22:00 UTC + Wednesday 12:00 UTC (generate-briefs)",
      editorialPlan: "Sunday before generate-briefs",
    },
    cadence,
    last24h: { signalsDetected: signals24h, sourcesIngested: sources24h },
    last7d: {
      totalPublications: recentPubs.length,
      byType: {
        executive: recentPubs.filter((p) => p.type === "EXECUTIVE_BRIEF").length,
        strategic: recentPubs.filter((p) => p.type === "STRATEGIC_REPORT").length,
        summary: recentPubs.filter((p) => p.type === "SUMMARY_BRIEF").length,
      },
    },
    verticals: verticals.map((v) => ({
      slug: v.slug,
      name: v.name,
      lastScannedAt: (v.config as { lastScannedAt?: string } | null)?.lastScannedAt ?? null,
      totalSignals: v._count.signals,
      totalPubs: v._count.publications,
    })),
  };
}
