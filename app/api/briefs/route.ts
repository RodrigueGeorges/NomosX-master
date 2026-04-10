import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runPipeline } from '@/lib/agent/pipeline-v2';
import { getSession } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { z } from 'zod';
import { withValidationAndAuth, rateLimitConfigs, CreateBriefSchema } from '@/lib/validation';

// GET /api/briefs - List all briefs
export async function GET(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    const briefs = await prisma.brief.findMany({
      take: limit,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        publicId: true,
        question: true,
        kind: true,
        createdAt: true,
        sources: true,
      },
    });

    return NextResponse.json({ briefs });
  } catch (error: any) {
    console.error("[API /briefs GET] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// POST /api/briefs - Create a new brief
export async function POST(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Additional rate limiting for brief creation
    try {
      await assertRateLimit(`briefs:user:${user.id}`, 5, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    const body = await req.json();
    const { question, type } = body;
    const q = String(question || "").trim();
    if (!q) return NextResponse.json({ error: "question_required" }, { status: 400 });

    const format = type === 'STRATEGIC_REPORT' ? 'strategic' : 'brief';
    const result = await runPipeline(q, format);

    // Pipeline saves the brief internally — fetch HTML for the response
    const brief = await prisma.brief.findUnique({
      where: { id: result.briefId },
      select: { id: true, html: true },
    });
    if (!brief) return NextResponse.json({ error: "pipeline_failed" }, { status: 500 });

    // Set publicId if not already set
    await prisma.brief.update({ where: { id: brief.id }, data: { publicId: brief.id } }).catch(() => {});

    return NextResponse.json({ id: brief.id, html: brief.html });
  } catch (error: any) {
    console.error("[API /briefs POST] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
