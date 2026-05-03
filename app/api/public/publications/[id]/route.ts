/**
 * Public Publication Meta API
 * GET /api/public/publications/[id]
 * Returns minimal public metadata for OG tags — no auth required.
 * Only returns PUBLISHED publications.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const pub = await prisma.thinkTankPublication.findFirst({
      where: publicPublicationWhere({ id }),
      select: {
        id: true,
        title: true,
        html: true,
        trustScore: true,
        wordCount: true,
        sourceIds: true,
        type: true,
        publishedAt: true,
        vertical: { select: { name: true } },
      },
    });

    if (!pub) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Extract first paragraph as description
    const pMatch = pub.html?.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = pMatch
      ? pMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200)
      : `A peer-reviewed research brief by the NomosX Think Tank.`;

    return NextResponse.json({
      id: pub.id,
      title: pub.title,
      description,
      type: pub.type,
      trustScore: pub.trustScore,
      wordCount: pub.wordCount,
      sourceCount: pub.sourceIds.length,
      vertical: pub.vertical?.name ?? null,
      publishedAt: pub.publishedAt,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
