import { NextRequest, NextResponse } from "next/server";
import { runThinkTankCycle } from "@/lib/agent/think-tank-dispatcher";
import { enqueueThinkTankCycle, getThinkTankJobStatus } from "@/lib/worker/think-tank-queue";
import { verifyBearerToken } from "@/lib/security/timing-safe";

/**
 * POST /api/cron/generate-briefs
 *
 * Think tank — weekly cycle (Sunday + midweek).
 * Default: enqueues a durable Job → 202 (a worker executes the 45–75 min cycle).
 * Escape hatch: POST ?sync=1 runs inline (local/manual use only).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    if (!verifyBearerToken(authHeader, process.env.CRON_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sync = req.nextUrl.searchParams.get("sync") === "1" || process.env.THINK_TANK_INLINE === "1";

    if (!sync) {
      const queued = await enqueueThinkTankCycle({ mode: "weekly" });
      console.log(`[Generate Briefs Cron] enqueue → ${queued.jobId} (${queued.reason ?? "enqueued"})`);
      return NextResponse.json(
        {
          success: true,
          architecture: "think-tank-dispatcher:weekly:durable",
          queued: queued.enqueued,
          reason: queued.reason,
          jobId: queued.jobId,
        },
        { status: 202 }
      );
    }

    console.log("[Generate Briefs Cron] → ThinkTankDispatcher (weekly, sync)");

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

  if (!verifyBearerToken(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 401 });
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (jobId) {
    const status = await getThinkTankJobStatus(jobId);
    if (!status) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json(status);
  }

  return NextResponse.json({
    message: "Generate briefs cron endpoint",
    architecture: "think-tank-dispatcher:weekly:durable",
    usage: "POST → enqueue durable Job (202) · POST ?sync=1 → inline run · GET ?jobId=<id> → job status",
    schedule: "Weekly Sunday 22:00 UTC + midweek Wednesday 12:00 UTC",
  });
}
