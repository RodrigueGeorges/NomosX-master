/**
 * NomosX Think Tank - Publication Detail API
 * 
 * GET /api/think-tank/publications/[id] - Get publication with full audit trail
 */

import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const publication = await prisma.thinkTankPublication.findUnique({
      where: { id },
      include: {
        vertical: true,
        signal: {
          include: {
            editorialDecisions: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        },
        claims: {
          include: {
            evidenceSpans: true
          }
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        checks: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!publication) {
      return NextResponse.json({ error: "Publication not found" }, { status: 404 });
    }

    // Fetch sources
    const sources = await prisma.source.findMany({
      where: { id: { in: publication.sourceIds } },
      include: {
        authors: { include: { author: true } }
      }
    });

    return NextResponse.json({
      publication: {
        id: publication.id,
        verticalId: publication.verticalId,
        vertical: {
          id: publication.vertical.id,
          slug: publication.vertical.slug,
          name: publication.vertical.name,
          icon: publication.vertical.icon,
          color: publication.vertical.color
        },
        signalId: publication.signalId,
        signal: publication.signal ? {
          id: publication.signal.id,
          title: publication.signal.title,
          signalType: publication.signal.signalType,
          priorityScore: publication.signal.priorityScore,
          editorialDecision: publication.signal.editorialDecisions[0] || null
        } : null,
        type: publication.type,
        title: publication.title,
        html: publication.html,
        wordCount: publication.wordCount,
        trustScore: publication.trustScore,
        qualityScore: publication.qualityScore,
        citationCoverage: publication.citationCoverage,
        claimCount: publication.claimCount,
        factClaimCount: publication.factClaimCount,
        citedClaimCount: publication.citedClaimCount,
        criticalLoopResult: publication.criticalLoopResult,
        sources: sources.map(s => ({
          id: s.id,
          title: s.title,
          authors: s.authors?.map(sa => sa.author?.name).filter(Boolean).slice(0, 3),
          year: s.year,
          provider: s.provider,
          qualityScore: s.qualityScore,
          url: s.url
        })),
        claims: publication.claims.map(c => ({
          id: c.id,
          text: c.text,
          claimType: c.claimType,
          section: c.section,
          confidence: c.confidence,
          citations: c.citations,
          hasContradiction: c.hasContradiction,
          evidenceSpans: c.evidenceSpans
        })),
        qualityChecks: publication.checks,
        run: publication.runs[0] || null,
        publicId: publication.publicId,
        publishedAt: publication.publishedAt,
        viewCount: publication.viewCount,
        createdAt: publication.createdAt
      }
    });
  } catch (error: any) {
    console.error("[API] Publication GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
