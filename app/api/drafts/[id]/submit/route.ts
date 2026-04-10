/**
 * Draft Submit API - Submit draft to Editorial Gate
 */

import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { submitDraftToGate } from '@/lib/agent/editorial-gate';

// POST /api/drafts/[id]/submit - Submit draft to Editorial Gate
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify draft exists and ownership
    const draft = await prisma.draft.findUnique({
      where: { id },
      include: { vertical: true },
    });

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (draft.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate draft is ready for submission
    if (!draft.html || draft.html.trim().length === 0) {
      return NextResponse.json(
        { error: "Draft must have content before submission" },
        { status: 400 }
      );
    }

    if (draft.status === "APPROVED" || draft.status === "PUBLISHED") {
      return NextResponse.json(
        { error: "Draft has already been approved or published" },
        { status: 400 }
      );
    }

    // Submit to Editorial Gate
    const result = await submitDraftToGate(id);

    return NextResponse.json({
      decision: result.decision,
      reasons: result.reasons,
      humanReviewRequired: result.humanReviewRequired,
      scores: result.scores,
    });
  } catch (error) {
    console.error("[API] POST /api/drafts/[id]/submit error:", error);
    return NextResponse.json(
      { error: "Failed to submit draft to gate" },
      { status: 500 }
    );
  }
}
