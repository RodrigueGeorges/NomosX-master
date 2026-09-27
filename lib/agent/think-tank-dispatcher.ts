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
import { getVerticalForTopic } from "./researcher-ownership";
import { classifyTopic } from "./topic-classifier";
import type { InquiryDepth } from "@/lib/types/inquiry";
// Search providers are now used by the evidence-gatherer module directly

// ─── Config ────────────────────────────────────────────────────

const DEFAULT_WEEKLY_MAX = 10;
const DEFAULT_BREAKING_MAX = 2;
const DEFAULT_BREAKING_BUDGET_USD = 20;

/**
 * Select publication format based on the EDITORIAL ANGLE of the signal.
 *
 * All formats share the SAME quality bar. The difference is PURPOSE, not rigor:
 *
 *   Signal Brief     — ALERT: "Something important just happened" → inform NOW
 *   Decision Memo    — ACTION: "A decision is pending" → help decide
 *   Article          — ANALYSIS: "This needs to be understood" → deep comprehension
 *   Strategic Report — STRATEGY: "A structural shift is underway" → plan long-term
 *
 * Selection is based on signalType (the NATURE of the event), NOT on signal
 * strength or priority score. Quality is enforced uniformly by the publication gate.
 */
export function selectFormatFromSignal(
  signalType: string,
  _priorityScore: number
): string {
  switch (signalType) {
    // ── ALERT: something new emerged → Signal Brief ──
    case "NEW_EVIDENCE":
      return "SUMMARY_BRIEF";
    case "DATA_RELEASE":
      return "SUMMARY_BRIEF";

    // ── ACTION: a decision is pending → Decision Memo ──
    case "POLICY_CHANGE":
      return "DECISION_MEMO";

    // ── FOLLOW-UP: the world moved on a covered dossier → Update Note ──
    case "PREDICTION_TRIGGER":
      return "UPDATE_NOTE";

    // ── ANALYSIS: this needs to be understood → Article ──
    case "CONTRADICTION":
      return "ARTICLE";

    // ── STRATEGY: structural shift → Strategic Report ──
    case "TREND_BREAK":
      return "STRATEGIC_REPORT";
    case "METHODOLOGY_SHIFT":
      return "STRATEGIC_REPORT";

    // ── Default: Article (the analytical default) ──
    default:
      return "ARTICLE";
  }
}

export type ThinkTankCycleMode = "breaking" | "weekly";

export type ThinkTankStrategy = "breaking" | "editorial" | "signal";

export interface ThinkTankDispatchItem {
  question: string;
  depth: InquiryDepth;
  domain?: string;
  verticalId?: string;
  verticalSlug?: string;
  signalId?: string;
  requireResearcherSignOff?: boolean;
  strategy: ThinkTankStrategy;
  metadata?: Record<string, unknown>;
}

/** Serializable cycle checkpoint — stored on the Job row between items. */
export interface ThinkTankCycleProgress {
  items: ThinkTankDispatchItem[];
  doneKeys: string[];
  counts: {
    published: number;
    held: number;
    skipped: number;
    failed: number;
    totalCostUsd: number;
    topics: string[];
  };
  updatedAt: string;
}

export interface ThinkTankCycleOptions {
  mode: ThinkTankCycleMode;
  /** Override slot cap (breaking defaults to 2, weekly to remaining cadence) */
  maxPublications?: number;
  budgetUsd?: number;
  dryRun?: boolean;
  /** Bypass weekly cadence check — force publication even if slots are full */
  bypassCadence?: boolean;
  /** Resume state from a crashed/reclaimed attempt — the stored dispatch list
   * is reused verbatim (no radar re-run) and already-finished items are
   * skipped. Written by the durable worker via onProgress. */
  resume?: ThinkTankCycleProgress;
  /** Called after collection and after each item completes — the caller
   * persists it on the Job row so a reclaim resumes mid-cycle. */
  onProgress?: (progress: ThinkTankCycleProgress) => Promise<void> | void;
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
  const leadResearcher = decision.classification.researchers[0];

  // Map editorial action → Inquiry depth (4 formats = 4 angles, same quality bar)
  const depth: InquiryDepth = decision.action === 'publish_strategic' ? 'strategic'
    : decision.action === 'publish_brief' ? 'deep'
    : decision.action === 'publish_memo' ? 'standard'
    : decision.action === 'publish_signal' ? 'surface'
    : 'deep'; // fallback for monitor/skip (shouldn't reach here)

  return {
    question: decision.researchQuestion?.trim() || decision.topic.title,
    depth,
    domain: decision.classification.primaryDomain,
    verticalSlug: decision.classification.verticalSlug,
    // Don't pass providers or perProvider — let the pipeline's smart selector + DEFAULT_ACADEMIC_PROVIDERS merge handle it
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
      crossChannelBoost: decision.topic.crossChannelBoost ?? 0,
      channels: decision.topic.channels ?? [],
      originalHeadline: decision.topic.title,
    },
  };
}

// ─── Pre-flight academic source viability check ─────────────────
//
// Before committing 35+ minutes of pipeline compute to a topic, verify that
// academic literature actually exists for the reformulated research question.
// This prevents the pipeline from producing news-heavy reports with 0% grounding
// that always end up HELD.
//
// Strategy: lightweight parallel search on OpenAlex + Crossref + Semantic Scholar
// with a 12s timeout per provider. If fewer than MIN_ACADEMIC_SOURCES are found
// across all three, the topic is rejected and the next candidate is tried.

// Thresholds are now managed by the evidence-gatherer module

/**
 * Preflight source check — now delegates to the adaptive evidence gatherer.
 * The gatherer decomposes the question into sub-angles, searches each across
 * 4 providers (OpenAlex, Crossref, Semantic Scholar, ArXiv), combines + dedups,
 * and reassesses semantic alignment. Returns a reformulated question if needed.
 */
async function preflightSourceCheck(researchQuestion: string, domain?: string): Promise<{
  viable: boolean;
  academicCount: number;
  details: string;
  semanticAligned: boolean;
  semanticScore: number;
  semanticReasoning: string;
  reformulatedQuestion: string | null;
  subAngles: string[];
  strategy: string;
}> {
  // Use the adaptive evidence gatherer — it decomposes, searches, and reassesses
  const { gatherEvidence } = await import('./evidence-gatherer');
  const result = await gatherEvidence(researchQuestion, {
    maxSubAngles: 4,
    maxSourcesPerAngle: 8,
    domain,
    includeWeb: true, // Enable web search + news + institutional providers
  });

  return {
    viable: result.viable,
    academicCount: result.sources.length,
    details: `strategy=${result.strategy}, subAngles=${result.subAngles.length}, semantic=${Math.round(result.semanticScore * 100)}%`,
    semanticAligned: result.semanticScore >= 0.5,
    semanticScore: result.semanticScore,
    semanticReasoning: result.semanticReasoning,
    reformulatedQuestion: result.reformulatedQuestion,
    subAngles: result.subAngles,
    strategy: result.strategy,
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

  // ── PREDICTION WATCH (P2/7): close the forecast loop ──
  // Match today's radar topics against OPEN predictions' falsification
  // triggers. A firing means the world moved on a dossier we covered —
  // it becomes a dispatch item (UPDATE_NOTE) in this same cycle.
  let watchItems: ThinkTankDispatchItem[] = [];
  try {
    const { runPredictionWatch } = await import('./prediction-watch');
    const verticals = await prisma.vertical.findMany({
      where: { isActive: true }, select: { id: true, slug: true },
    });
    const verticalIds = new Map(verticals.map(v => [v.slug, v.id]));
    const watch = await runPredictionWatch(radarResult.topics, { verticalIds });
    watchItems = watch.items.map(w => ({
      question: w.question,
      depth: publicationTypeToDepth('UPDATE_NOTE'),
      verticalId: w.verticalId,
      signalId: w.signalId,
      strategy: 'signal' as const,
      metadata: {
        signalType: 'PREDICTION_TRIGGER',
        predictionId: w.predictionId,
        briefId: w.briefId,
        triggerScore: w.score,
        publicationType: 'UPDATE_NOTE',
      },
    }));
  } catch (err) {
    errors.push(`Prediction watch: ${String(err instanceof Error ? err.message : err).slice(0, 150)}`);
  }

  if (radarResult.topics.length === 0) {
    return {
      items: watchItems,
      decideCostUsd: 0,
      phases: { detect: { durationMs: detectMs, topicsFound: 0 } },
      errors,
    };
  }

  // Request 3x more candidates than needed so pre-flight check can filter
  // without running out of options. Bounded by the radar output itself —
  // the old hard cap of 6 meant --max=10 still only ever triaged 6 topics.
  const candidatePool = Math.min(maxPublications * 3, radarResult.topics.length);
  const decideStart = Date.now();
  const triageResult = await editorialTriage(radarResult.topics, {
    maxPublications: candidatePool,
    budgetUsd,
  });
  const decideMs = Date.now() - decideStart;

  // ── Pre-flight: Adaptive Evidence Gathering ──
  // Instead of just counting sources, the gatherer:
  //   1. Searches the question directly
  //   2. If misaligned/insufficient → decomposes into sub-angles
  //   3. Searches each sub-angle across 4 providers
  //   4. Combines + dedups + reassesses
  //   5. Returns a reformulated question if the original was misaligned
  const viableItems: ThinkTankDispatchItem[] = [];
  const preflightResults: Array<{ question: string; viable: boolean; count: number; details: string; semanticScore: number; semanticReasoning: string; strategy: string }> = [];

  // Pre-validate up to 2x the publication target: when a dispatched
  // candidate is held after the escalation ladder (revision → regeneration),
  // the dispatch loop falls back to the next PRE-VALIDATED spare instead of
  // wasting the slot. Topic-level fallback — the gate is never relaxed.
  const preflightTarget = Math.min(maxPublications * 2, triageResult.decisions.length);
  for (const decision of triageResult.decisions) {
    if (viableItems.length >= preflightTarget) break;

    const question = decision.researchQuestion?.trim() || decision.topic.title;
    const preflightStart = Date.now();
    // A gatherer/provider crash must mark the topic unviable, not kill the cycle
    let check: Awaited<ReturnType<typeof preflightSourceCheck>>;
    try {
      check = await preflightSourceCheck(question, decision.classification.primaryDomain);
    } catch (err) {
      const preflightMs = Date.now() - preflightStart;
      console.warn(`[PREFLIGHT] ❌ "${question.slice(0, 60)}" — gatherer failed: ${String(err instanceof Error ? err.message : err).slice(0, 120)} (${preflightMs}ms)`);
      preflightResults.push({
        question: question.slice(0, 80),
        viable: false,
        count: 0,
        details: `gatherer-error: ${String(err instanceof Error ? err.message : err).slice(0, 100)}`,
        semanticScore: 0,
        semanticReasoning: 'preflight crashed — treated as unviable',
        strategy: 'error',
      });
      continue;
    }
    const preflightMs = Date.now() - preflightStart;

    preflightResults.push({
      question: question.slice(0, 80),
      viable: check.viable,
      count: check.academicCount,
      details: check.details,
      semanticScore: check.semanticScore,
      semanticReasoning: check.semanticReasoning,
      strategy: check.strategy,
    });

    if (check.viable) {
      // If the gatherer reformulated the question, use the reformulated version
      const finalQuestion = check.reformulatedQuestion || question;
      console.log(`[PREFLIGHT] ✅ "${question.slice(0, 60)}" — ${check.academicCount} sources, semantic=${Math.round(check.semanticScore * 100)}%, strategy=${check.strategy} in ${preflightMs}ms${check.reformulatedQuestion ? ` → reformulated: "${check.reformulatedQuestion.slice(0, 60)}"` : ''}`);
      const item = breakingDecisionToItem(decision);
      if (check.reformulatedQuestion) {
        item.question = check.reformulatedQuestion;
      }
      viableItems.push(item);
    } else {
      console.log(`[PREFLIGHT] ❌ Skipping "${question.slice(0, 60)}" — ${check.academicCount} sources, semantic=${Math.round(check.semanticScore * 100)}%, strategy=${check.strategy} in ${preflightMs}ms. ${check.semanticReasoning}`);
    }
  }

  // No bypass — if all candidates fail, the cycle produces nothing.
  // This is intentional: better to skip a cycle than waste 5 minutes on a doomed pipeline run.

  return {
    items: [...watchItems, ...viableItems],
    decideCostUsd: triageResult.costUsd,
    phases: {
      detect: { durationMs: detectMs, topicsFound: radarResult.topics.length, stats: radarResult.stats, predictionTriggersFired: watchItems.length },
      decide: {
        durationMs: decideMs,
        selected: triageResult.decisions.length,
        skipped: triageResult.skipped,
        costUsd: triageResult.costUsd,
      },
      preflight: {
        checked: preflightResults.length,
        viable: viableItems.length,
        rejected: preflightResults.filter(r => !r.viable).length,
        results: preflightResults,
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

      const depth: InquiryDepth = proposal.suggestedFormat === "strategic" ? "strategic"
        : "standard";
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
        // Don't pass providers — let the pipeline's smart selector + DEFAULT_ACADEMIC_PROVIDERS merge handle it
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
          selectFormatFromSignal(signal.signalType, signal.priorityScore)
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

/** Stable per-item identity across worker restarts. */
function dispatchItemKey(item: ThinkTankDispatchItem): string {
  return item.signalId ?? item.question;
}

interface DispatchDurable {
  /** Item keys already finished by a previous attempt — skipped on resume. */
  doneKeys: Set<string>;
  /** Prior-attempt counters — publications already out count toward the
   * cap, attempts already spent count toward maxAttempts. */
  seedCounts: {
    published: number;
    held: number;
    skipped: number;
    failed: number;
    totalCostUsd: number;
    topics: string[];
  };
  /** Fired after each item finishes — caller persists the checkpoint. */
  onItemDone: (key: string, counts: {
    published: number; held: number; skipped: number; failed: number;
    totalCostUsd: number; topics: string[];
  }) => Promise<void> | void;
}

async function executeDispatchQueue(
  items: ThinkTankDispatchItem[],
  cadence: CadenceState,
  maxExecutions: number,
  dryRun: boolean,
  budgetUsd?: number,
  durable?: DispatchDurable
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
  const topics: string[] = [...(durable?.seedCounts.topics ?? [])];
  const verticalPubCounts = new Map(cadence.verticalPubCounts);
  let published = durable?.seedCounts.published ?? 0;
  let held = durable?.seedCounts.held ?? 0;
  let skipped = durable?.seedCounts.skipped ?? 0;
  let failed = durable?.seedCounts.failed ?? 0;
  let totalCostUsd = durable?.seedCounts.totalCostUsd ?? 0;
  // Attempts already consumed by prior crashed attempts count toward the cap —
  // an item is never re-run after finishing, regardless of restart count.
  let executed = durable?.doneKeys.size ?? 0;

  // Dispatch timeout must exceed pipeline timeout (deep/memo: 80min) — a
  // shorter race would kill a still-productive run before its own cap.
  const DISPATCH_TIMEOUT_MS = 6_000_000; // 100min — pipeline ≤80min + orchestrator assess/revision + buffer

  // The cycle targets maxExecutions PUBLICATIONS, not attempts: a held or
  // failed candidate does not consume a publication slot — the loop falls
  // through to the next pre-validated candidate. A hard attempt cap
  // (2x target, bounded by pool size) keeps cost bounded — each candidate
  // runs exactly once, no infinite retry.
  const maxAttempts = Math.min(items.length, maxExecutions * 2);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (published >= maxExecutions) break;
    if (executed >= maxAttempts) break;
    // Durable resume — item already finished by a previous (crashed) attempt.
    if (durable?.doneKeys.has(dispatchItemKey(item))) continue;

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

    // Cumulative budget guard — stop dispatching if we've exceeded the budget
    if (budgetUsd && totalCostUsd >= budgetUsd) {
      console.log(`[ThinkTank] Budget exhausted ($${totalCostUsd.toFixed(4)} >= $${budgetUsd}) — skipping remaining ${items.length - i} item(s)`);
      skipped += items.length - i;
      break;
    }

    // Global budget gate — check monthly/daily caps before each dispatch
    try {
      const { checkBudgetGate } = await import('./budget-manager');
      const gate = await checkBudgetGate();
      if (gate === 'stop') {
        console.log(`[ThinkTank] Global budget cap exceeded — skipping remaining ${items.length - i} item(s)`);
        skipped += items.length - i;
        break;
      }
      if (gate === 'throttle' && executed >= 1) {
        console.log(`[ThinkTank] Budget critical — throttling (1 dispatch max this cycle)`);
        skipped += items.length - i;
        break;
      }
    } catch (budgetErr) {
      // Non-blocking — don't fail the cycle if budget check fails
    }

    // Adaptive trust: signals already pre-validated by radar/editorial — lower threshold
    // Niche domains also get lower threshold (fewer sources exist but can still be valid)
    const nicheDomains = ['cognitive-science', 'bioethics', 'complexity-science', 'urban-studies', 'development-economics'];
    const isNiche = item.domain && nicheDomains.includes(item.domain);
    const adaptiveTrust = isNiche ? 55 : 60;
    let dispatchTimer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      runAndPublishInquiry({
        question: item.question,
        depth: item.depth,
        domain: item.domain,
        verticalId: item.verticalId,
        verticalSlug: item.verticalSlug,
        signalId: item.signalId,
        source,
        dryRun,
        requireResearcherSignOff: item.requireResearcherSignOff,
        minTrustScore: adaptiveTrust,
        metadata: { strategy: item.strategy, ...item.metadata },
      }),
      new Promise<never>((_, reject) => {
        dispatchTimer = setTimeout(() => reject(new Error(`runAndPublishInquiry timed out (${DISPATCH_TIMEOUT_MS / 1000}s)`)), DISPATCH_TIMEOUT_MS);
      }),
    ]).finally(() => { if (dispatchTimer) clearTimeout(dispatchTimer); }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ThinkTank] Dispatch item timed out or failed: ${message}`);
      return {
        status: "failed" as const,
        trustScore: 0,
        qualityScore: 0,
        wordCount: 0,
        costUsd: 0,
        durationMs: DISPATCH_TIMEOUT_MS,
        error: message,
      };
    });

    outcomes.push({ item, result });
    totalCostUsd += result.costUsd;
    executed++;

    // Record spend to global budget tracker
    if (result.costUsd > 0) {
      import('./budget-manager')
        .then(({ recordSpend }) => recordSpend(result.costUsd, 'pipeline', item.question.slice(0, 60)))
        .catch(() => {});
    }

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
    } else if (result.status === "skipped_duplicate") {
      skipped++;
      // Duplicate means topic already published — mark signal as handled
      if (item.signalId) {
        await prisma.signal
          .update({ where: { id: item.signalId }, data: { status: "HELD" } })
          .catch(() => undefined);
      }
    } else if (result.status === "skipped_dry_run") {
      skipped++;
      // Dry run — don't change signal status
    } else if (result.status === "failed") {
      failed++;
      errors.push(`"${item.question.slice(0, 40)}": ${result.error ?? "unknown"}`);
      // Mark signal as HELD so it doesn't get infinitely retried
      if (item.signalId) {
        await prisma.signal
          .update({ where: { id: item.signalId }, data: { status: "HELD" } })
          .catch(() => undefined);
      }
    } else {
      held++;
      topics.push(item.question);
      // Mark signal as HELD — pipeline ran but publication gate held it
      if (item.signalId) {
        await prisma.signal
          .update({ where: { id: item.signalId }, data: { status: "HELD" } })
          .catch(() => undefined);
      }
    }

    // Durable checkpoint — the item is permanently done, record it so a
    // crash/reclaim resumes at the next item instead of re-dispatching.
    if (durable) {
      durable.doneKeys.add(dispatchItemKey(item));
      await durable.onItemDone(dispatchItemKey(item), {
        published, held, skipped, failed, totalCostUsd, topics,
      });
    }

    // Throttle between heavy pipeline runs
    if (i < items.length - 1) {
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

  if (options.mode === "weekly" && cadence.remainingSlots <= 0 && !options.bypassCadence) {
    console.log("[ThinkTank] Weekly cadence full — silence is respected");
    return emptyResult(options.mode, cadence, started);
  }

  let items: ThinkTankDispatchItem[] = [];
  let decideCostUsd = 0;
  let phases: Record<string, unknown> | undefined;
  let maxExecutions: number;

  // Durable resume — a reclaimed job carries its dispatch list; skip the
  // radar/collection phases entirely and resume at the first unfinished item.
  const resume = options.resume;
  if (resume && resume.items.length > 0) {
    items = resume.items;
    maxExecutions = options.maxPublications ?? (options.mode === "breaking" ? DEFAULT_BREAKING_MAX : cadence.remainingSlots);
    if (!options.bypassCadence && options.mode === "breaking") {
      maxExecutions = Math.min(maxExecutions, cadence.remainingSlots);
    }
    console.log(
      `[ThinkTank] Resuming cycle mode=${options.mode} — ${items.length} stored item(s), ${resume.doneKeys.length} already done`
    );
    if (maxExecutions <= 0) {
      console.log("[ThinkTank] No slots left on resume — closing cycle");
      return emptyResult(options.mode, cadence, started);
    }
  } else if (options.mode === "breaking") {
    maxExecutions = options.maxPublications ?? DEFAULT_BREAKING_MAX;
    const collected = await collectBreakingItems(
      maxExecutions,
      options.budgetUsd ?? DEFAULT_BREAKING_BUDGET_USD
    );
    items = collected.items;
    decideCostUsd = collected.decideCostUsd;
    phases = collected.phases;
    errors.push(...collected.errors);

    // Breaking scans respect global weekly cadence too (unless bypassed)
    if (!options.bypassCadence) {
      maxExecutions = Math.min(maxExecutions, cadence.remainingSlots);
    }
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

  // Durable cycle state — items list + done keys persisted on the Job row so
  // a crashed worker's reclaim resumes mid-dispatch instead of re-running
  // the radar and re-dispatching finished items.
  const doneKeys = new Set<string>(resume?.doneKeys ?? []);
  const writeProgress = async (counts: ThinkTankCycleProgress["counts"]) => {
    await options.onProgress?.({
      items,
      doneKeys: [...doneKeys],
      counts,
      updatedAt: new Date().toISOString(),
    });
  };
  await writeProgress(resume?.counts ?? {
    published: 0, held: 0, skipped: 0, failed: 0, totalCostUsd: 0, topics: [],
  });

  const delegateStart = Date.now();
  const dispatchBudgetUsd = options.budgetUsd ?? (options.mode === "breaking" ? DEFAULT_BREAKING_BUDGET_USD : undefined);
  const dispatch = await executeDispatchQueue(items, cadence, maxExecutions, !!options.dryRun, dispatchBudgetUsd,
    options.onProgress
      ? {
          doneKeys,
          seedCounts: resume?.counts ?? {
            published: 0, held: 0, skipped: 0, failed: 0, totalCostUsd: 0, topics: [],
          },
          onItemDone: async (_key, counts) => writeProgress(counts),
        }
      : undefined
  );
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
        article: recentPubs.filter((p) => p.type === "ARTICLE").length,
        memo: recentPubs.filter((p) => p.type === "DECISION_MEMO" || p.type === "EXECUTIVE_BRIEF" || p.type === "RESEARCH_BRIEF" || p.type === "POLICY_NOTE").length,
        strategic: recentPubs.filter((p) => p.type === "STRATEGIC_REPORT" || p.type === "DOSSIER").length,
        summary: recentPubs.filter((p) => p.type === "SUMMARY_BRIEF" || p.type === "UPDATE_NOTE" || p.type === "DATA_NOTE").length,
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
