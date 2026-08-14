import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * GET /api/articles/[id]/comments
 * Public — returns approved comments for a publication, newest first.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const [comments, total] = await Promise.all([
      prisma.publicationComment.findMany({
        where: { publicationId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.publicationComment.count({ where: { publicationId: id } }),
    ]);

    return NextResponse.json({
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        author: c.user.name || 'Anonymous',
        authorId: c.user.id,
      })),
      total,
    });
  } catch (error) {
    console.error('[comments/GET]', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

/**
 * POST /api/articles/[id]/comments
 * Authenticated — creates a new comment.
 * Body: { content: string }
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
            const { content } = await req.json();

            if (!content || typeof content !== 'string' || content.trim().length === 0) {
              return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
            }
            if (content.length > 2000) {
              return NextResponse.json({ error: 'Comment too long (max 2000 chars)' }, { status: 400 });
            }

            // Verify publication exists
            const pub = await prisma.thinkTankPublication.findFirst({
              where: { id },
              select: { id: true },
            });
            if (!pub) {
              return NextResponse.json({ error: 'Publication not found' }, { status: 404 });
            }

            const comment = await prisma.publicationComment.create({
              data: {
                userId,
                publicationId: id,
                content: content.trim(),
              },
              include: {
                user: { select: { id: true, name: true } },
              },
            });

            return NextResponse.json({
              comment: {
                id: comment.id,
                content: comment.content,
                createdAt: comment.createdAt.toISOString(),
                updatedAt: comment.updatedAt.toISOString(),
                author: comment.user.name || 'Anonymous',
                authorId: comment.user.id,
              },
            });
          } catch (error) {
            console.error('[comments/POST]', error);
            return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
          }
        }
      )(req);
    }
  )(req);
}

/**
 * DELETE /api/articles/[id]/comments?commentId=xxx
 * Authenticated — deletes own comment (or any comment if admin).
 */
export async function DELETE(
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
            const url = new URL(req.url);
            const commentId = url.searchParams.get('commentId');

            if (!commentId) {
              return NextResponse.json({ error: 'commentId required' }, { status: 400 });
            }

            const comment = await prisma.publicationComment.findUnique({
              where: { id: commentId },
              select: { id: true, userId: true, publicationId: true },
            });

            if (!comment || comment.publicationId !== id) {
              return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
            }

            // Get user role to check if admin
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { role: true },
            });

            if (comment.userId !== userId && user?.role !== 'admin') {
              return NextResponse.json({ error: 'Not authorized to delete this comment' }, { status: 403 });
            }

            await prisma.publicationComment.delete({ where: { id: commentId } });

            return NextResponse.json({ success: true });
          } catch (error) {
            console.error('[comments/DELETE]', error);
            return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
          }
        }
      )(req);
    }
  )(req);
}
