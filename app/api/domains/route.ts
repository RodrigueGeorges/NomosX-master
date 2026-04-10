import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PREDEFINED_DOMAINS } from '@/lib/domains';

/**
 * GET /api/domains
 * Returns domain distribution across all sources
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Count total sources
    const totalSources = await prisma.source.count();

    if (totalSources === 0) {
      return NextResponse.json({
        domains: PREDEFINED_DOMAINS.map((d) => ({
          slug: d.slug,
          name: d.name,
          icon: d.icon.name,
          color: d.color,
          sourceCount: 0,
          percentage: 0,
        })),
        total: 0,
      });
    }

    // Get all domains from DB
    const dbDomains = await prisma.domain.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { sources: true },
        },
      },
    });

    // Map to domain details with counts
    const domains = dbDomains.map((dbDomain) => {
      const sourceCount = dbDomain._count.sources;
      const percentage = totalSources > 0 ? (sourceCount / totalSources) * 100 : 0;

      return {
        slug: dbDomain.slug,
        name: dbDomain.name,
        nameEn: dbDomain.nameEn,
        icon: dbDomain.icon,
        color: dbDomain.color,
        description: dbDomain.description,
        sourceCount,
        percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
      };
    });

    // Sort by sourceCount descending
    domains.sort((a, b) => b.sourceCount - a.sourceCount);

    return NextResponse.json({
      domains,
      total: totalSources,
    });
  } catch (error: any) {
    console.error("[API /domains] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch domain distribution" },
      { status: 500 }
    );
  }
}
