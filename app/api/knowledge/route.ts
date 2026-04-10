/**
 * NomosX Knowledge Graph API
 * 
 * GET /api/knowledge - Search/list concepts with filters
 * GET /api/knowledge?q=carbon+tax — Semantic search
 * GET /api/knowledge?type=trend — Filter by concept type
 * GET /api/knowledge?briefId=xxx — Concepts from a specific brief
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const type = searchParams.get("type");
    const briefId = searchParams.get("briefId");
    const minConfidence = parseInt(searchParams.get("minConfidence") || "0");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const sortBy = searchParams.get("sortBy") || "occurrenceCount"; // occurrenceCount, confidence, lastSeen

    const where: any = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }
    if (type) where.type = type;
    if (briefId) where.briefIds = { has: briefId };
    if (minConfidence > 0) where.confidence = { gte: minConfidence };

    const orderBy: any = {};
    if (sortBy === "confidence") orderBy.confidence = "desc";
    else if (sortBy === "lastSeen") orderBy.lastSeen = "desc";
    else orderBy.occurrenceCount = "desc";

    const [concepts, total] = await Promise.all([
      prisma.conceptNode.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          confidence: true,
          occurrenceCount: true,
          firstSeen: true,
          lastSeen: true,
          sourceIds: true,
          briefIds: true,
          metadata: true,
        },
      }),
      prisma.conceptNode.count({ where }),
    ]);

    return NextResponse.json({
      concepts,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error: any) {
    console.error("[Knowledge API] Error:", error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message },
      { status: 500 }
    );
  }
}
