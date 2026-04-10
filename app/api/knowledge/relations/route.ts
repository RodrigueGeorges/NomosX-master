/**
 * NomosX Knowledge Graph — Relations API
 * 
 * GET /api/knowledge/relations?conceptId=xxx — Get relations for a concept
 * GET /api/knowledge/relations?type=contradicts — Filter by relation type
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
    const conceptId = searchParams.get("conceptId");
    const type = searchParams.get("type");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const where: any = {};

    if (conceptId) {
      where.OR = [
        { fromConceptId: conceptId },
        { toConceptId: conceptId },
      ];
    }
    if (type) where.type = type;

    const relations = await prisma.conceptRelation.findMany({
      where,
      take: limit,
      orderBy: { strength: "desc" },
      include: {
        fromConcept: {
          select: { id: true, name: true, type: true, confidence: true },
        },
        toConcept: {
          select: { id: true, name: true, type: true, confidence: true },
        },
      },
    });

    return NextResponse.json({ relations, count: relations.length });
  } catch (error: any) {
    console.error("[Knowledge Relations API] Error:", error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message },
      { status: 500 }
    );
  }
}
