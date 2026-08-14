import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * GET /api/articles/[id]/reactions
 * Public — returns like/dislike counts. If the user is authenticated, also
 * returns their reaction state.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [likes, dislikes] = await Promise.all([
      prisma.publicationReaction.count({ where: { publicationId: id, type: 'LIKE' } }),
      prisma.publicationReaction.count({ where: { publicationId: id, type: 'DISLIKE' } }),
    ]);

    // Check if the current user has reacted (best-effort — no error if not authed)
    let userReaction: string | null = null;
    try {
      const session = await getSession();
      if (session?.id) {
        const existing = await prisma.publicationReaction.findUnique({
          where: {
            userId_publicationId: { userId: session.id, publicationId: id },
          },
          select: { type: true },
        });
        userReaction = existing?.type || null;
      }
    } catch {
      /* not authenticated — userReaction stays null */
    }

    return NextResponse.json({ likes, dislikes, userReaction });
  } catch (error) {
    console.error('[reactions/GET]', error);
    return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 });
  }
}

/**
 * POST /api/articles/[id]/reactions
 * Authenticated — toggles a like or dislike reaction.
 * Body: { type: "LIKE" | "DISLIKE" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    async (req, userId) => {
      return withRateLimit(
        rateLimitConfigs.api,
        async (req) => {
          try {
            const { id } = await params;
            const { type } = await req.json();

            if (type !== 'LIKE' && type !== 'DISLIKE') {
              return NextResponse.json({ error: 'Invalid reaction type' }, { status: 400 });
            }

            // Verify publication exists
            const pub = await prisma.thinkTankPublication.findFirst({
              where: { id },
              select: { id: true },
            });
            if (!pub) {
              return NextResponse.json({ error: 'Publication not found' }, { status: 404 });
            }

            // Check existing reaction
            const existing = await prisma.publicationReaction.findUnique({
              where: {
                userId_publicationId: { userId, publicationId: id },
              },
            });

            if (existing) {
              if (existing.type === type) {
                // Same reaction — remove it (toggle off)
                await prisma.publicationReaction.delete({ where: { id: existing.id } });
                return NextResponse.json({ reaction: null });
              }
              // Different reaction — update it
              await prisma.publicationReaction.update({
                where: { id: existing.id },
                data: { type },
              });
              return NextResponse.json({ reaction: type });
            }

            // No existing reaction — create one
            await prisma.publicationReaction.create({
              data: { userId, publicationId: id, type },
            });
            return NextResponse.json({ reaction: type });
          } catch (error) {
            console.error('[reactions/POST]', error);
            return NextResponse.json({ error: 'Failed to toggle reaction' }, { status: 500 });
          }
        }
      )(req);
    }
  )(req);
}
