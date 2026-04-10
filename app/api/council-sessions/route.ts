/**
 * Council Sessions API - Deliberation room operations
 * Council sessions are linked to Signals or Drafts
 */

import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

const createSessionSchema = z.object({
  signalId: z.string().min(1).optional(),
  draftId: z.string().min(1).optional(),
  question: z.string().min(3, 'Question too short').max(2000),
}).refine(data => data.signalId || data.draftId, {
  message: 'Must provide signalId or draftId',
});

// GET /api/council-sessions - List council sessions
export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const signalId = searchParams.get("signalId");
    const draftId = searchParams.get("draftId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = {
      userId: user.id,
    };

    if (signalId) where.signalId = signalId;
    if (draftId) where.draftId = draftId;
    if (status) where.status = status;

    const [sessions, total] = await Promise.all([
      prisma.councilSession.findMany({
        where,
        include: {
          signal: true,
          draft: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.councilSession.count({ where }),
    ]);

    return NextResponse.json({
      sessions,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[API] GET /api/council-sessions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch council sessions" },
      { status: 500 }
    );
  }
}

// POST /api/council-sessions - Create a new council session
export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createSessionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { signalId, draftId, question } = validation.data;

    // Validate signal or draft exists
    if (signalId) {
      const signal = await prisma.signal.findUnique({ where: { id: signalId } });
      if (!signal) {
        return NextResponse.json({ error: "Signal not found" }, { status: 404 });
      }
    }

    if (draftId) {
      const draft = await prisma.draft.findUnique({ where: { id: draftId } });
      if (!draft) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
    }

    // Create council session
    const councilSession = await prisma.councilSession.create({
      data: {
        signalId: signalId || null,
        draftId: draftId || null,
        question,
        status: "PENDING",
        userId: user.id,
      },
      include: {
        signal: true,
        draft: true,
      },
    });

    return NextResponse.json({ session: councilSession }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/council-sessions error:", error);
    return NextResponse.json(
      { error: "Failed to create council session" },
      { status: 500 }
    );
  }
}
