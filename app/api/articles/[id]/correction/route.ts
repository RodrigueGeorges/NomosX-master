import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';

/**
 * POST /api/articles/[id]/correction
 * Issue a correction notice on a published report.
 * Only authenticated users (editors) can issue corrections.
 *
 * Body: { notice: string, status?: "CORRECTED" | "RETRACTED", reason?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRateLimit(
    rateLimitConfigs.api,
    async (req) => {
      try {
        const session = await getSession();
        if (!session?.id) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const { id } = await params;
        const idValidation = commonSchemas.id.safeParse({ id });
        if (!idValidation.success) {
          return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
        }

        const body = await req.json();
        const { notice, status, reason } = body as { notice?: string; status?: string; reason?: string };

        if (!notice || typeof notice !== 'string' || notice.trim().length < 10) {
          return NextResponse.json({ error: 'A correction notice (min 10 chars) is required' }, { status: 400 });
        }

        const targetStatus = status === 'RETRACTED' ? 'RETRACTED' : 'CORRECTED';

        const updateData: Record<string, unknown> = {
          correctionNotice: notice.slice(0, 10000),
          status: targetStatus,
        };
        if (targetStatus === 'CORRECTED') {
          updateData.correctedAt = new Date();
        } else if (targetStatus === 'RETRACTED') {
          updateData.retractedAt = new Date();
          updateData.retractionReason = (reason || '').slice(0, 5000);
        }

        const article = await prisma.thinkTankPublication.update({
          where: { id: idValidation.data.id },
          data: updateData,
          select: { id: true, status: true, correctionNotice: true, correctedAt: true, retractedAt: true },
        });

        console.log(`[Correction] Article ${article.id} marked as ${targetStatus} by user ${session.id}`);

        return NextResponse.json({ ok: true, article });
      } catch (error: unknown) {
        console.error('[API/Articles/Correction] Error:', error);
        return NextResponse.json({ error: 'Failed to issue correction' }, { status: 500 });
      }
    }
  )(req);
}
