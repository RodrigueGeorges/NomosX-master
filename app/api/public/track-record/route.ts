import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const revalidate = 300; // 5 min cache

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

/**
 * GET /api/public/track-record?page=1&limit=10
 *
 * Public prediction track record — the accountability layer.
 * Every prediction NomosX publishes is dated, falsifiable, and resolved
 * in public. Accuracy is computed only on resolved predictions
 * (CONFIRMED / REFUTED) — EXPIRED and SUPERSEDED are reported but excluded
 * from the hit rate.
 *
 * Pagination applies to both `recentResolved` and `openPredictions` lists
 * (same page/limit). `totalResolved` and `totalOpen` are returned so the
 * client can render pagination controls.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const [byStatus, recentResolved, openSoonest, totalResolved, totalOpen] = await Promise.all([
      prisma.prediction.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.prediction.findMany({
        where: { status: { in: ["CONFIRMED", "REFUTED"] } },
        orderBy: { resolvedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true, claim: true, horizon: true, probability: true, confidence: true,
          status: true, resolvedAt: true, outcome: true, createdAt: true, briefId: true,
        },
      }),
      prisma.prediction.findMany({
        where: { status: "OPEN" },
        orderBy: { horizon: "asc" },
        skip,
        take: limit,
        select: {
          id: true, claim: true, horizon: true, probability: true, confidence: true,
          resolutionCriteria: true, createdAt: true, briefId: true,
        },
      }),
      prisma.prediction.count({ where: { status: { in: ["CONFIRMED", "REFUTED"] } } }),
      prisma.prediction.count({ where: { status: "OPEN" } }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of byStatus) counts[row.status] = row._count._all;
    const confirmed = counts.CONFIRMED ?? 0;
    const refuted = counts.REFUTED ?? 0;
    const open = counts.OPEN ?? 0;
    const expired = counts.EXPIRED ?? 0;
    const superseded = counts.SUPERSEDED ?? 0;
    const resolved = confirmed + refuted;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);

    // Brier score on resolved, quantified predictions (lower = better calibrated).
    // The headline number is the SWARM subset only: probabilities priced by
    // the conviction lookup table say nothing about the swarm's calibration,
    // and mixing them would let a fixed table inflate the track record.
    // Reference: a naive always-0.5 forecast scores exactly 0.25.
    const quantified = await prisma.prediction.findMany({
      where: { status: { in: ["CONFIRMED", "REFUTED"] }, probability: { not: null } },
      select: { probability: true, status: true, probabilitySource: true },
    });
    const brierOf = (rows: typeof quantified) => rows.length > 0
      ? rows.reduce((s, p) => {
          const outcome = p.status === "CONFIRMED" ? 1 : 0;
          return s + (p.probability! - outcome) ** 2;
        }, 0) / rows.length
      : null;
    const swarmQuantified = quantified.filter(p => p.probabilitySource === "swarm");
    const brierScore = brierOf(quantified);
    const swarmBrierScore = brierOf(swarmQuantified);

    return NextResponse.json({
      stats: {
        total,
        open,
        confirmed,
        refuted,
        expired,
        superseded,
        resolved,
        accuracyPct: resolved > 0 ? Math.round((confirmed / resolved) * 1000) / 10 : null,
        brierScore: brierScore !== null ? Math.round(brierScore * 1000) / 1000 : null,
        quantifiedResolved: quantified.length,
        swarmBrierScore: swarmBrierScore !== null ? Math.round(swarmBrierScore * 1000) / 1000 : null,
        swarmQuantifiedResolved: swarmQuantified.length,
        naiveBrierReference: 0.25,
      },
      recentResolved,
      openPredictions: openSoonest,
      pagination: {
        page,
        limit,
        totalResolved,
        totalOpen,
        totalPagesResolved: Math.ceil(totalResolved / limit),
        totalPagesOpen: Math.ceil(totalOpen / limit),
      },
    });
  } catch (error) {
    console.error("[API/Public/TrackRecord] Error:", error);
    return NextResponse.json({ error: "Failed to load track record" }, { status: 500 });
  }
}
