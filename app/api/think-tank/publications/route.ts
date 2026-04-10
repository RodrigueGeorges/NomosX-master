/**
 * NomosX Think Tank - Publications API
 * 
 * GET /api/think-tank/publications - List publications with filters
 * POST /api/think-tank/publications - Generate publication from signal
 */

import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generatePublication } from '@/lib/agent/publication-generator';
import { z } from 'zod';

const publicationPostSchema = z.object({
  signalId: z.string().min(1, 'signalId required'),
  publicationType: z.enum(['EXECUTIVE_BRIEF', 'STRATEGIC_REPORT']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const verticalId = searchParams.get("verticalId");
    const type = searchParams.get("type");
    const published = searchParams.get("published");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: any = { status: 'PUBLISHED', publishedAt: { not: null } };

    if (verticalId) where.verticalId = verticalId;
    if (type) where.type = type;
    if (published === "false") { where.publishedAt = null; delete where.status; }

    const [publications, total] = await Promise.all([
      prisma.thinkTankPublication.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
        include: {
          vertical: {
            select: { id: true, slug: true, name: true, icon: true, color: true }
          },
          signal: {
            select: { id: true, title: true, signalType: true }
          }
        }
      }),
      prisma.thinkTankPublication.count({ where })
    ]);

    return NextResponse.json({
      publications: publications.map(p => ({
        id: p.id,
        verticalId: p.verticalId,
        vertical: p.vertical,
        signalId: p.signalId,
        signal: p.signal,
        type: p.type,
        title: p.title,
        wordCount: p.wordCount,
        trustScore: p.trustScore,
        qualityScore: p.qualityScore,
        citationCoverage: p.citationCoverage,
        claimCount: p.claimCount,
        factClaimCount: p.factClaimCount,
        sourceCount: p.sourceIds.length,
        publicId: p.publicId,
        publishedAt: p.publishedAt,
        viewCount: p.viewCount,
        createdAt: p.createdAt
      })),
      total,
      hasMore: offset + publications.length < total
    });
  } catch (error: any) {
    console.error("[API] Publications GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth protection
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = publicationPostSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { signalId, publicationType } = validation.data;

    const result = await generatePublication({ signalId, publicationType });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      publicationId: result.publicationId,
      title: result.title,
      wordCount: result.wordCount,
      trustScore: result.trustScore,
      needsHumanReview: result.criticalLoopResult.needsHumanReview
    });
  } catch (error: any) {
    console.error("[API] Publications POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
