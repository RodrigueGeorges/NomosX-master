import { NextRequest, NextResponse } from 'next/server';
import { planEditorialAgenda } from '@/lib/agent/editorial-planner';
import { prisma } from '@/lib/db';
import { verifyBearerToken } from '@/lib/security/timing-safe';


/**
 * POST /api/cron/editorial-plan
 * 
 * Cron job to generate the weekly editorial agenda.
 * Runs BEFORE generate-briefs (e.g., Sunday 8pm UTC).
 * 
 * Process:
 * 1. Analyze Knowledge Graph trends
 * 2. Detect stale coverage
 * 3. Check pending signals
 * 4. LLM-powered gap detection
 * 5. Produce prioritized editorial agenda
 * 6. Auto-commission high-confidence proposals
 * 
 * Authorization: Requires CRON_SECRET header
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    if (!verifyBearerToken(authHeader, process.env.CRON_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron] Editorial Planner: starting...");

    // Dynamically compute remaining slots based on publications this week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pubsThisWeek = await prisma.thinkTankPublication.count({
      where: { publishedAt: { gte: oneWeekAgo }, status: "PUBLISHED" },
    });
    const maxWeeklySlots = 6; // Total weekly budget across all verticals
    const remainingSlots = Math.max(1, maxWeeklySlots - pubsThisWeek);
    console.log(`[Cron] Editorial Planner: ${pubsThisWeek} pubs this week, ${remainingSlots} slots remaining`);

    const agenda = await planEditorialAgenda({ weeklySlots: remainingSlots });

    // Store agenda for dashboard visibility
    // Using a simple log + response for now; could persist to a dedicated table
    console.log(`[Cron] Editorial Planner: ${agenda.proposals.length} proposals`);
    console.log(`[Cron] Auto-commission: ${agenda.autoCommission.length} topics`);
    console.log(`[Cron] Needs review: ${agenda.needsReview.length} topics`);

    // Record cron run for health monitoring
    const now = new Date();
    prisma.systemMetric.create({
      data: {
        metricName: 'cron.editorial-plan',
        metricValue: agenda.proposals.length,
        unit: 'count',
        periodStart: now,
        periodEnd: now,
        dimensions: { proposals: agenda.proposals.length, autoCommission: agenda.autoCommission.length },
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      weekOf: agenda.weekOf.toISOString(),
      totalProposals: agenda.proposals.length,
      autoCommission: agenda.autoCommission.map(p => ({
        topic: p.topic,
        reason: p.reason,
        priority: p.priority,
        confidence: p.confidence,
        format: p.suggestedFormat,
      })),
      needsReview: agenda.needsReview.map(p => ({
        topic: p.topic,
        reason: p.reason,
        priority: p.priority,
        confidence: p.confidence,
        format: p.suggestedFormat,
      })),
      costUsd: agenda.costUsd,
      durationMs: agenda.durationMs,
    });
  } catch (error: any) {
    console.error("[Cron] Editorial Planner failed:", error);
    return NextResponse.json(
      { error: "Editorial planning failed", details: process.env.NODE_ENV === "development" ? error.message : undefined },
      { status: 500 }
    );
  }
}
