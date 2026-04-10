
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/sources - List recent sources
export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sources = await prisma.source.findMany({ 
      take: 18, 
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        provider: true,
        qualityScore: true,
        title: true,
        authors: true,
        abstract: true,
        topics: true,
        year: true,
      },
    });
    
    return NextResponse.json({ sources });
  } catch (error: any) {
    console.error("[Sources GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch sources", sources: [] }, { status: 500 });
  }
}
