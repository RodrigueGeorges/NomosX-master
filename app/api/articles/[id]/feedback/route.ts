import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';

/**
 * POST /api/articles/[id]/feedback
 * Public reader feedback — report an error or rate the report.
 * No authentication required (public accountability).
 *
 * Body: { type: "error_report" | "rating", message?: string, rating?: number, email?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRateLimit(
    rateLimitConfigs.api,
    async (req) => {
      try {
        const { id } = await params;
        const idValidation = commonSchemas.id.safeParse({ id });
        if (!idValidation.success) {
          return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
        }

        const article = await prisma.thinkTankPublication.findFirst({
          where: { id: idValidation.data.id },
          select: { id: true },
        });
        if (!article) {
          return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const body = await req.json();
        const { type, message, rating, email } = body as {
          type?: string;
          message?: string;
          rating?: number;
          email?: string;
        };

        if (!type || !['error_report', 'rating'].includes(type)) {
          return NextResponse.json({ error: 'type must be "error_report" or "rating"' }, { status: 400 });
        }

        if (type === 'error_report') {
          if (!message || typeof message !== 'string' || message.trim().length < 5) {
            return NextResponse.json({ error: 'A message (min 5 chars) is required for error reports' }, { status: 400 });
          }
          // Store as a ThinkTankClaim with type "FEEDBACK" for simplicity
          // (avoids adding a new model — uses existing infrastructure)
          await prisma.thinkTankClaim.create({
            data: {
              publicationId: article.id,
              text: message.slice(0, 5000),
              claimType: 'FEEDBACK',
              section: 'reader_feedback',
              confidence: 1.0,
              citations: [],
              hasContradiction: false,
              contradictedBy: [],
            },
          });
          console.log(`[Feedback] Error report received for article ${article.id}`);
          return NextResponse.json({ ok: true, message: 'Thank you. Your report has been received and will be reviewed.' });
        }

        if (type === 'rating') {
          if (typeof rating !== 'number' || rating < 1 || rating > 5) {
            return NextResponse.json({ error: 'rating must be a number between 1 and 5' }, { status: 400 });
          }
          // Store rating as a claim with the rating in the text
          await prisma.thinkTankClaim.create({
            data: {
              publicationId: article.id,
              text: `Reader rating: ${rating}/5${email ? ` (from ${email.slice(0, 100)})` : ''}`,
              claimType: 'FEEDBACK',
              section: 'reader_rating',
              confidence: rating / 5,
              citations: [],
              hasContradiction: false,
              contradictedBy: [],
            },
          });
          return NextResponse.json({ ok: true, message: 'Thank you for rating this report.' });
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      } catch (error: unknown) {
        console.error('[API/Articles/Feedback] Error:', error);
        return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
      }
    }
  )(req);
}
