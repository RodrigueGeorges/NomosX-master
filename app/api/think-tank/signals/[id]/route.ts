/**
 * NomosX Think Tank - Signal Detail API
 * 
 * GET /api/think-tank/signals/[id] - Get signal details
 * POST /api/think-tank/signals/[id]/evaluate - Trigger editorial evaluation
 */

import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { editorialGate } from '@/lib/agent/editorial-gate';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const signal = await prisma.signal.findUnique({
      where: { id },
      include: {
        vertical: true,
        editorialDecisions: {
          orderBy: { createdAt: "desc" },
          take: 5
        },
        publications: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            type: true,
            trustScore: true,
            publishedAt: true
          }
        }
      }
    });

    if (!signal) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    // Fetch sources
    const sources = await prisma.source.findMany({
      where: { id: { in: signal.sourceIds } },
      select: {
        id: true,
        title: true,
        provider: true,
        year: true,
        qualityScore: true,
        noveltyScore: true,
        url: true
      }
    });

    return NextResponse.json({
      signal: {
        id: signal.id,
        verticalId: signal.verticalId,
        vertical: {
          id: signal.vertical.id,
          slug: signal.vertical.slug,
          name: signal.vertical.name,
          icon: signal.vertical.icon,
          color: signal.vertical.color
        },
        signalType: signal.signalType,
        title: signal.title,
        summary: signal.summary,
        scores: {
          novelty: signal.noveltyScore,
          impact: signal.impactScore,
          confidence: signal.confidenceScore,
          urgency: signal.urgencyScore,
          priority: signal.priorityScore
        },
        status: signal.status,
        sources,
        editorialDecisions: signal.editorialDecisions,
        publications: signal.publications,
        detectedAt: signal.detectedAt,
        expiresAt: signal.expiresAt,
        createdAt: signal.createdAt
      }
    });
  } catch (error: any) {
    console.error("[API] Signal GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action;

    if (action === "evaluate") {
      const result = await editorialGate({ signalId: id });

      return NextResponse.json({
        success: true,
        decision: result.decision,
        reasons: result.reasons,
        humanReviewRequired: result.humanReviewRequired
      });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[API] Signal POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
