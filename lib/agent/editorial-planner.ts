/**
 * NomosX EDITORIAL PLANNER — Autonomous Topic Selection & Agenda
 * 
 * Like France Stratégie's editorial committee, this agent:
 * 1. Analyzes Knowledge Graph trends to find emerging topics
 * 2. Detects coverage gaps (important topics never analyzed)
 * 3. Identifies stale briefs that need revisiting (data changed)
 * 4. Proposes a prioritized editorial agenda
 * 5. Self-commissions analyses when confidence is high enough
 * 
 * Schedule: Runs weekly (before generate-briefs cron) to plan the week's output.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { getLongitudinalInsights } from './knowledge-graph';
import { embedBatch, cosineSimilarity } from './semantic-engine';
import { getProvidersForTopic as getProvidersUnified, detectDomainUnified } from './topic-classifier';

// ============================================================================
// TYPES
// ============================================================================

export interface EditorialProposal {
  topic: string;
  reason: EditorialReason;
  priority: "critical" | "high" | "medium" | "low";
  confidence: number;         // 0-100: how confident the planner is this should be covered
  suggestedFormat: "brief" | "strategic";
  suggestedProviders: string[];
  context: string;            // Why this topic matters now
  relatedBriefIds: string[];  // Prior briefs on similar topics
  estimatedNovelty: number;   // 0-100: how much new info vs. prior coverage
}

export type EditorialReason =
  | "emerging_trend"       // Knowledge Graph shows rapid growth
  | "coverage_gap"         // Important topic never covered
  | "stale_coverage"       // Prior brief is outdated (>60 days)
  | "controversy_shift"    // Active debate has new developments
  | "signal_detected"      // High-priority signal from monitoring
  | "cross_topic_link"     // Connection between two verticals
  | "user_demand";         // High search/request volume

export interface EditorialAgenda {
  proposals: EditorialProposal[];
  weekOf: Date;
  totalSlots: number;        // Available publication slots this week
  autoCommission: EditorialProposal[];  // Proposals confident enough to auto-run
  needsReview: EditorialProposal[];     // Proposals that need human approval
  costUsd: number;
  durationMs: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Auto-commission threshold: proposals above this confidence are auto-run
  AUTO_COMMISSION_THRESHOLD: 85,

  // Stale coverage: briefs older than this (days) are candidates for revisit
  STALE_THRESHOLD_DAYS: 60,

  // Maximum proposals per planning cycle
  MAX_PROPOSALS: 10,

  // Minimum quality for a topic to be proposed
  MIN_TOPIC_CONFIDENCE: 50,

  // Lookback for trend analysis
  TREND_LOOKBACK_DAYS: 90,
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Generate an editorial agenda for the upcoming week.
 * Called by cron before generate-briefs.
 */
export async function planEditorialAgenda(
  options: {
    weeklySlots?: number;
    verticalSlugs?: string[];
  } = {}
): Promise<EditorialAgenda> {
  const start = Date.now();
  const { weeklySlots = 3 } = options;
  let totalCost = 0;

  console.log("[EDITORIAL PLANNER] Planning editorial agenda...");

  const proposals: EditorialProposal[] = [];

  // ── STEP 1: Detect emerging trends from Knowledge Graph ──
  try {
    const insights = await getLongitudinalInsights({
      minOccurrences: 2,
      limit: 20,
    });

    const emerging = insights.filter(i => i.trend === "emerging");
    const contested = insights.filter(i => i.trend === "contested");

    for (const trend of emerging) {
      proposals.push({
        topic: trend.concept,
        reason: "emerging_trend",
        priority: "high",
        confidence: 75,
        suggestedFormat: "brief",
        suggestedProviders: getProvidersUnified(trend.concept),
        context: `Emerging trend: ${trend.summary}`,
        relatedBriefIds: [],
        estimatedNovelty: 80,
      });
    }

    for (const controversy of contested) {
      proposals.push({
        topic: controversy.concept,
        reason: "controversy_shift",
        priority: "high",
        confidence: 70,
        suggestedFormat: "strategic",
        suggestedProviders: getProvidersUnified(controversy.concept),
        context: `Active controversy with shifting positions: ${controversy.summary}`,
        relatedBriefIds: [],
        estimatedNovelty: 70,
      });
    }

    console.log(`[EDITORIAL PLANNER] KG trends: ${emerging.length} emerging, ${contested.length} contested`);
  } catch (err) {
    console.warn("[EDITORIAL PLANNER] Knowledge Graph analysis failed:", err);
  }

  // ── STEP 2: Detect stale coverage (batch query, no N+1) ──
  try {
    const staleCutoff = new Date(Date.now() - CONFIG.STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    // Fetch stale briefs AND recent briefs in parallel (avoids N+1)
    const [staleBriefs, recentBriefs] = await Promise.all([
      prisma.brief.findMany({
        where: {
          createdAt: { lt: staleCutoff },
          kind: { in: ["brief", "strategic"] },
          trustScore: { gte: 60 },
        },
        orderBy: { createdAt: "asc" },
        take: 10,
        select: { id: true, question: true, createdAt: true, trustScore: true, sources: true },
      }),
      prisma.brief.findMany({
        where: {
          createdAt: { gte: staleCutoff },
          kind: { in: ["brief", "strategic"] },
        },
        select: { question: true },
      }),
    ]);

    // Build a set of recent topic keywords for fast lookup
    const recentTopicWords = new Set(
      recentBriefs.flatMap(b => b.question.toLowerCase().split(/\s+/).filter(w => w.length > 3))
    );

    for (const stale of staleBriefs) {
      // Check if stale topic has significant keyword overlap with any recent brief
      const staleWords = stale.question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const overlapCount = staleWords.filter(w => recentTopicWords.has(w)).length;
      const overlapRatio = staleWords.length > 0 ? overlapCount / staleWords.length : 0;

      if (overlapRatio < 0.5) { // Less than 50% keyword overlap = not recently covered
        const daysSince = Math.round((Date.now() - stale.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        proposals.push({
          topic: stale.question,
          reason: "stale_coverage",
          priority: "medium",
          confidence: 65,
          suggestedFormat: "brief",
          suggestedProviders: getProvidersUnified(stale.question),
          context: `Last covered ${daysSince} days ago (trust: ${stale.trustScore}). New data likely available.`,
          relatedBriefIds: [stale.id],
          estimatedNovelty: 50,
        });
      }
    }

    console.log(`[EDITORIAL PLANNER] Stale briefs: ${staleBriefs.length} candidates, ${proposals.filter(p => p.reason === 'stale_coverage').length} need revisit`);
  } catch (err) {
    console.warn("[EDITORIAL PLANNER] Stale coverage detection failed:", err);
  }

  // ── STEP 3: Detect high-priority unprocessed signals ──
  try {
    const pendingSignals = await prisma.signal.findMany({
      where: {
        status: "NEW",
        priorityScore: { gte: 75 },
        detectedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { priorityScore: "desc" },
      take: 5,
      include: {
        vertical: { select: { slug: true, name: true } },
      },
    });

    for (const signal of pendingSignals) {
      proposals.push({
        topic: signal.title,
        reason: "signal_detected",
        priority: signal.priorityScore >= 90 ? "critical" : "high",
        confidence: signal.priorityScore,
        suggestedFormat: signal.priorityScore >= 90 ? "strategic" : "brief",
        suggestedProviders: getProvidersUnified(signal.title),
        context: `Signal from ${signal.vertical?.name || "unknown"}: ${signal.summary || signal.title}`,
        relatedBriefIds: [],
        estimatedNovelty: 85,
      });
    }

    console.log(`[EDITORIAL PLANNER] Pending signals: ${pendingSignals.length}`);
  } catch (err) {
    console.warn("[EDITORIAL PLANNER] Signal detection failed:", err);
  }

  // ── STEP 4: LLM-powered gap detection ──
  try {
    const recentTopics = await prisma.brief.findMany({
      where: { createdAt: { gte: new Date(Date.now() - CONFIG.TREND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) } },
      select: { question: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const verticals = await prisma.vertical.findMany({
      where: { isActive: true },
      select: { name: true, slug: true, description: true },
    });

    if (verticals.length > 0) {
      const result = await callLLM({
        messages: [
          {
            role: "system",
            content: `You are an editorial planner for a strategic intelligence think tank. Given the list of recent topics covered and the active verticals, identify 2-3 important topics that have NOT been covered but SHOULD be, given current global events and academic trends. Return JSON: { "gaps": [{ "topic": "...", "reason": "...", "priority": "high|medium", "vertical": "..." }] }`,
          },
          {
            role: "user",
            content: `Active verticals: ${verticals.map(v => `${v.name} (${v.slug}): ${v.description || ""}`).join("\n")}\n\nRecent topics covered (last ${CONFIG.TREND_LOOKBACK_DAYS} days):\n${recentTopics.map(t => `- ${t.question}`).join("\n") || "None"}\n\nIdentify important coverage gaps.`,
          },
        ],
        temperature: 0.4,
        maxTokens: 500,
        jsonMode: true,
      });

      totalCost += result.costUsd;

      try {
        const parsed = JSON.parse(result.content);
        for (const gap of (parsed.gaps || [])) {
          proposals.push({
            topic: gap.topic,
            reason: "coverage_gap",
            priority: gap.priority === "high" ? "high" : "medium",
            confidence: 60,
            suggestedFormat: "brief",
            suggestedProviders: getProvidersUnified(gap.topic),
            context: gap.reason,
            relatedBriefIds: [],
            estimatedNovelty: 90,
          });
        }
      } catch {
        console.warn("[EDITORIAL PLANNER] Failed to parse LLM gap detection response");
      }
    }

    console.log(`[EDITORIAL PLANNER] Gap detection complete`);
  } catch (err) {
    console.warn("[EDITORIAL PLANNER] Gap detection failed:", err);
  }

  // ── STEP 5: Deduplicate and rank proposals ──
  const deduped = deduplicateProposals(proposals);
  const ranked = rankProposals(deduped);
  const topProposals = ranked.slice(0, CONFIG.MAX_PROPOSALS);

  // ── STEP 6: Split into auto-commission vs. needs-review ──
  const autoCommission = topProposals.filter(p => p.confidence >= CONFIG.AUTO_COMMISSION_THRESHOLD);
  const needsReview = topProposals.filter(p => p.confidence < CONFIG.AUTO_COMMISSION_THRESHOLD);

  const durationMs = Date.now() - start;

  console.log(`[EDITORIAL PLANNER] ✅ Agenda: ${topProposals.length} proposals (${autoCommission.length} auto, ${needsReview.length} review), ${durationMs}ms, $${totalCost.toFixed(4)}`);

  return {
    proposals: topProposals,
    weekOf: getNextMonday(),
    totalSlots: weeklySlots,
    autoCommission: autoCommission.slice(0, weeklySlots),
    needsReview,
    costUsd: totalCost,
    durationMs,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function deduplicateProposals(proposals: EditorialProposal[]): EditorialProposal[] {
  if (proposals.length === 0) return [];

  const result: EditorialProposal[] = [];
  const seenNormalized = new Set<string>();

  // Sort by confidence desc so we keep the best version
  const sorted = [...proposals].sort((a, b) => b.confidence - a.confidence);

  for (const p of sorted) {
    // Normalize: lowercase, remove punctuation, collapse whitespace
    const normalized = p.topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

    // Check exact match
    if (seenNormalized.has(normalized)) continue;

    // Check keyword overlap with existing proposals (semantic-lite dedup)
    const words = new Set(normalized.split(' ').filter(w => w.length > 3));
    let isDuplicate = false;
    for (const existing of result) {
      const existingWords = new Set(
        existing.topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').filter(w => w.length > 3)
      );
      const overlap = [...words].filter(w => existingWords.has(w)).length;
      const maxLen = Math.max(words.size, existingWords.size);
      if (maxLen > 0 && overlap / maxLen > 0.6) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seenNormalized.add(normalized);
      result.push(p);
    }
  }

  return result;
}

function rankProposals(proposals: EditorialProposal[]): EditorialProposal[] {
  const priorityWeight: Record<string, number> = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25,
  };

  return proposals.sort((a, b) => {
    const scoreA = priorityWeight[a.priority] + a.confidence * 0.5 + a.estimatedNovelty * 0.3;
    const scoreB = priorityWeight[b.priority] + b.confidence * 0.5 + b.estimatedNovelty * 0.3;
    return scoreB - scoreA;
  });
}

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
