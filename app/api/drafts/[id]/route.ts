/**
 * Draft API - Single draft operations
 */

import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { submitDraftToGate } from '@/lib/agent/editorial-gate';
import { z } from 'zod';

const updateDraftSchema = z.object({
  title: z.string().max(500).optional(),
  html: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'REVISION_REQUESTED']).optional(),
});

// GET /api/drafts/[id] - Get a single draft
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const draft = await prisma.draft.findUnique({
      where: { id },
      include: {
        vertical: true,
        signal: true,
        councilSessions: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        editorialDecisions: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        publication: true,
      },
    });

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[API] GET /api/drafts/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch draft" },
      { status: 500 }
    );
  }
}

// PATCH /api/drafts/[id] - Update a draft
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
    const validation = updateDraftSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { title, html, status } = validation.data;

    // Verify ownership
    const existing = await prisma.draft.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update data
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (html !== undefined) {
      updateData.html = html;
      updateData.wordCount = html.split(/\s+/).length;
    }
    if (status !== undefined) updateData.status = status;

    const draft = await prisma.draft.update({
      where: { id },
      data: updateData,
      include: {
        vertical: true,
        signal: true,
      },
    });

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[API] PATCH /api/drafts/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update draft" },
      { status: 500 }
    );
  }
}

// DELETE /api/drafts/[id] - Delete a draft
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const existing = await prisma.draft.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only allow deletion of DRAFT status
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Cannot delete draft that is not in DRAFT status" },
        { status: 400 }
      );
    }

    await prisma.draft.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/drafts/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete draft" },
      { status: 500 }
    );
  }
}
