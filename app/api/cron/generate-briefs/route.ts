import { NextRequest, NextResponse } from "next/server";
import { runThinkTankCycle } from "@/lib/agent/think-tank-dispatcher";

/**
 * POST /api/cron/generate-briefs
 *
 * Think tank — weekly cycle (Sunday + midweek).
 * Thin wrapper → ThinkTankDispatcher (mode: weekly).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Generate Briefs Cron] → ThinkTankDispatcher (weekly)");

    const result = await runThinkTankCycle({ mode: "weekly" });

    if (result.collected === 0 && result.cadence.remainingSlots <= 0) {
      return NextResponse.json({
        success: true,
        message: "Weekly limit reached - no publications generated",
        stats: {
          generated: 0,
          skipped: 0,
          failed: 0,
          generatedTopics: [],
          currentWeeklyCount: result.cadence.publishedThisWeek,
          weeklyMax: result.cadence.weeklyMax,
          remainingSlots: 0,
        },
      });
    }

    const strategies = result.outcomes.map((o) => o.item.strategy);
    const strategyLabel =
      strategies.includes("editorial") && strategies.includes("signal")
        ? "editorial+signal"
        : strategies.includes("editorial")
          ? "editorial"
          : strategies.includes("signal")
            ? "signal"
            : result.published > 0
              ? "mixed"
              : "none";

    return NextResponse.json({
      success: result.success,
      architecture: "think-tank-dispatcher:weekly",
      stats: {
        generated: result.published + result.held,
        published: result.published,
        held: result.held,
        skipped: result.skipped,
        failed: result.failed,
        generatedTopics: result.topics,
        currentWeeklyCount: result.cadence.publishedThisWeek,
        weeklyMax: result.cadence.weeklyMax,
        remainingSlots: result.cadence.remainingSlots,
        totalCostUsd: result.totalCostUsd,
        strategy: strategyLabel,
        errors: result.errors,
        durationMs: result.durationMs,
      },
    });
  } catch (error: unknown) {
    console.error("[Generate Briefs Cron] Fatal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 401 });
  }

  return NextResponse.json({
    message: "Generate briefs cron endpoint",
    architecture: "think-tank-dispatcher:weekly",
    usage: "POST with Authorization: Bearer <CRON_SECRET>",
    schedule: "Weekly Sunday 22:00 UTC + midweek Wednesday 12:00 UTC",
  });
}
