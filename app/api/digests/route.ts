import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/digests - List all digests
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const topicId = searchParams.get("topicId");
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const where = topicId ? { topicId } : {};

    const digests = await prisma.digest.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        topic: true,
      },
    });

    return NextResponse.json({ digests });
  } catch (error: any) {
    console.error("[API /digests] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch digests" },
      { status: 500 }
    );
  }
}
