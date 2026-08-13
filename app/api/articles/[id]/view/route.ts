import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { commonSchemas } from '@/lib/validation';

/**
 * POST /api/articles/[id]/view
 * Increment view count for a published article.
 * Public endpoint — no auth required, but rate-limited by the edge.
 *
 * This is a fire-and-forget increment: returns 200 immediately.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idValidation = commonSchemas.id.safeParse({ id });
    if (!idValidation.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Non-blocking increment — don't wait for the DB write to complete
    prisma.thinkTankPublication
      .update({
        where: { id: idValidation.data.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch((err) => console.warn('[View] Failed to increment viewCount:', err));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
