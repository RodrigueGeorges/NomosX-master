/**
 * Editorial Gate API - Evaluate signals/drafts for publication
 */

import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { editorialGate,evaluatePendingSignals } from '@/lib/agent/editorial-gate';
import { z } from 'zod';

const editorialGateSchema = z.object({
  signalId: z.string().min(1).optional(),
  draftId: z.string().min(1).optional(),
}).refine(data => data.signalId || data.draftId, {
  message: 'Must provide signalId or draftId',
});

// POST /api/editorial-gate - Evaluate a signal or draft
export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = editorialGateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { signalId, draftId } = validation.data;

    const result = await editorialGate({ signalId, draftId });

    return NextResponse.json({
      decision: result.decision,
      reasons: result.reasons,
      checks: result.checks,
      humanReviewRequired: result.humanReviewRequired,
      scores: result.scores,
    });
  } catch (error) {
    console.error("[API] POST /api/editorial-gate error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate" },
      { status: 500 }
    );
  }
}

// GET /api/editorial-gate - Get recent editorial decisions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const verticalId = searchParams.get("verticalId");
    const decision = searchParams.get("decision");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: any = {};
    if (verticalId) where.verticalId = verticalId;
    if (decision) where.decision = decision;

    const decisions = await prisma.editorialDecision.findMany({
      where,
      include: {
        signal: true,
        draft: true,
        vertical: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Get stats
    const stats = await prisma.editorialDecision.groupBy({
      by: ["decision"],
      _count: { decision: true },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    });

    return NextResponse.json({
      decisions,
      stats: stats.reduce((acc, s) => {
        acc[s.decision] = s._count.decision;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error("[API] GET /api/editorial-gate error:", error);
    return NextResponse.json(
      { error: "Failed to fetch decisions" },
      { status: 500 }
    );
  }
}
