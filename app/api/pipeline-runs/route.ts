/**
 * NomosX Pipeline Runs API — Cost & Lineage Dashboard
 * 
 * GET /api/pipeline-runs — List pipeline runs with cost/duration metrics
 * GET /api/pipeline-runs?format=strategic — Filter by format
 * GET /api/pipeline-runs?status=COMPLETED — Filter by status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = {};
    if (format) where.format = format;
    if (status) where.status = status;

    const [runs, total, aggregates] = await Promise.all([
      prisma.pipelineRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          question: true,
          format: true,
          status: true,
          totalCostUsd: true,
          totalTokensIn: true,
          totalTokensOut: true,
          durationMs: true,
          sourcesFound: true,
          sourcesRanked: true,
          sourcesUsed: true,
          trustScore: true,
          qualityScore: true,
          error: true,
          startedAt: true,
          finishedAt: true,
          briefs: {
            select: { id: true, kind: true, trustScore: true },
          },
        },
      }),
      prisma.pipelineRun.count({ where }),
      prisma.pipelineRun.aggregate({
        where: { status: "COMPLETED" },
        _sum: { totalCostUsd: true, durationMs: true },
        _avg: { totalCostUsd: true, durationMs: true, trustScore: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      runs,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      aggregates: {
        totalRuns: aggregates._count,
        totalCostUsd: aggregates._sum.totalCostUsd || 0,
        totalDurationMs: aggregates._sum.durationMs || 0,
        avgCostUsd: aggregates._avg.totalCostUsd || 0,
        avgDurationMs: aggregates._avg.durationMs || 0,
        avgTrustScore: aggregates._avg.trustScore || 0,
      },
    });
  } catch (error: any) {
    console.error("[Pipeline Runs API] Error:", error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message },
      { status: 500 }
    );
  }
}
