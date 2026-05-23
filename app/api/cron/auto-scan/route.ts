import { NextRequest, NextResponse } from "next/server";
import { runThinkTankCycle, getThinkTankStatus } from "@/lib/agent/think-tank-dispatcher";

/**
 * POST /api/cron/auto-scan
 *
 * Autonomous think tank — breaking cycle (2×/day).
 * Thin wrapper → ThinkTankDispatcher (mode: breaking).
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[AUTO-SCAN] → ThinkTankDispatcher (breaking)");

    const result = await runThinkTankCycle({ mode: "breaking" });

    return NextResponse.json({
      success: result.success,
      architecture: "think-tank-dispatcher:breaking",
      stats: {
        mode: result.mode,
        collected: result.collected,
        published: result.published,
        held: result.held,
        skipped: result.skipped,
        failed: result.failed,
        strategicPublished: result.published,
        briefsPublished: 0,
        totalCostUsd: result.totalCostUsd,
        errors: result.errors,
        phases: result.phases,
        cadence: result.cadence,
        topics: result.topics,
        editorial: result.outcomes.map((o) => ({
          topic: o.item.question.slice(0, 80),
          domain: o.item.domain,
          strategy: o.item.strategy,
          status: o.result.status,
          trustScore: o.result.trustScore,
        })),
        durationMs: Date.now() - startTime,
        durationMin: (Date.now() - startTime) / 60000,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error("[AUTO-SCAN] Fatal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 401 });
  }

  const status = await getThinkTankStatus();

  return NextResponse.json({
    message: "NomosX Think Tank — autonomous dispatcher",
    ...status,
  });
}
