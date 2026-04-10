/**
 * NomosX Think Tank - Signals API
 * 
 * GET /api/think-tank/signals - List signals with filters
 * POST /api/think-tank/signals - Trigger signal detection
 */

import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { signalDetector } from '@/lib/agent/signal-detector';
import { z } from 'zod';

const signalPostSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1, 'At least one sourceId required'),
  verticalSlug: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    // Auth protection
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const verticalId = searchParams.get("verticalId");
    const status = searchParams.get("status");
    const signalType = searchParams.get("signalType");
    const minPriority = searchParams.get("minPriority");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = {};

    if (verticalId) where.verticalId = verticalId;
    if (status) where.status = status;
    if (signalType) where.signalType = signalType;
    if (minPriority) where.priorityScore = { gte: parseInt(minPriority) };

    const [signals, total] = await Promise.all([
      prisma.signal.findMany({
        where,
        orderBy: [{ priorityScore: "desc" }, { detectedAt: "desc" }],
        take: limit,
        skip: offset,
        include: {
          vertical: {
            select: { id: true, slug: true, name: true, icon: true, color: true }
          },
          _count: {
            select: { publications: true, editorialDecisions: true }
          }
        }
      }),
      prisma.signal.count({ where })
    ]);

    return NextResponse.json({
      signals: signals.map(s => ({
        id: s.id,
        verticalId: s.verticalId,
        vertical: s.vertical,
        signalType: s.signalType,
        title: s.title,
        summary: s.summary,
        scores: {
          novelty: s.noveltyScore,
          impact: s.impactScore,
          confidence: s.confidenceScore,
          urgency: s.urgencyScore,
          priority: s.priorityScore
        },
        status: s.status,
        sourceCount: s.sourceIds.length,
        publicationCount: s._count.publications,
        decisionCount: s._count.editorialDecisions,
        detectedAt: s.detectedAt,
        expiresAt: s.expiresAt
      })),
      total,
      hasMore: offset + signals.length < total
    });
  } catch (error: any) {
    console.error("[API] Signals GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth protection
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = signalPostSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { sourceIds, verticalSlug } = validation.data;

    const result = await signalDetector({ sourceIds, verticalSlug });

    return NextResponse.json({
      success: true,
      detected: result.detected,
      byType: result.byType,
      signals: result.signals.map(s => ({
        verticalId: s.verticalId,
        signalType: s.signalType,
        title: s.title,
        priorityScore: s.priorityScore
      }))
    });
  } catch (error: any) {
    console.error("[API] Signals POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
