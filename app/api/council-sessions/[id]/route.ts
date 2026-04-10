/**
 * Council Session API - Single session operations
 */

import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/council-sessions/[id] - Get a single council session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const councilSession = await prisma.councilSession.findUnique({
      where: { id },
      include: {
        signal: {
          include: { vertical: true },
        },
        draft: {
          include: { vertical: true },
        },
      },
    });

    if (!councilSession) {
      return NextResponse.json(
        { error: "Council session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ session: councilSession });
  } catch (error) {
    console.error("[API] GET /api/council-sessions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch council session" },
      { status: 500 }
    );
  }
}

// PATCH /api/council-sessions/[id] - Update council session (add perspectives)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      economic,
      technical,
      ethical,
      political,
      synthesis,
      uncertainty,
      status,
      sourceIds,
      tokensUsed,
      costUsd,
    } = body;

    // Verify ownership
    const existing = await prisma.councilSession.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Council session not found" },
        { status: 404 }
      );
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update data
    const updateData: any = {};
    if (economic !== undefined) updateData.economic = economic;
    if (technical !== undefined) updateData.technical = technical;
    if (ethical !== undefined) updateData.ethical = ethical;
    if (political !== undefined) updateData.political = political;
    if (synthesis !== undefined) updateData.synthesis = synthesis;
    if (uncertainty !== undefined) updateData.uncertainty = uncertainty;
    if (status !== undefined) updateData.status = status;
    if (sourceIds !== undefined) updateData.sourceIds = sourceIds;
    if (tokensUsed !== undefined) updateData.tokensUsed = tokensUsed;
    if (costUsd !== undefined) updateData.costUsd = costUsd;

    const councilSession = await prisma.councilSession.update({
      where: { id },
      data: updateData,
      include: {
        signal: true,
        draft: true,
      },
    });

    return NextResponse.json({ session: councilSession });
  } catch (error) {
    console.error("[API] PATCH /api/council-sessions/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update council session" },
      { status: 500 }
    );
  }
}
