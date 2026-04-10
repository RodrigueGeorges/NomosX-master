
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/stats - Get system statistics
export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [
      sourcesCount,
      authorsCount,
      institutionsCount,
      topicsCount,
      briefsCount,
      digestsCount,
      pendingJobs,
      failedJobs,
      recentSources,
      topQualitySources,
      jobsByType,
      sourcesByProvider,
    ] = await Promise.all([
      // Counts
      prisma.source.count(),
      prisma.author.count(),
      prisma.institution.count(),
      prisma.topic.count(),
      prisma.brief.count(),
      prisma.digest.count(),
      
      // Jobs
      prisma.job.count({ where: { status: "PENDING" } }),
      prisma.job.count({ where: { status: "FAILED" } }),
      
      // Recent sources
      prisma.source.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          year: true,
          provider: true,
          qualityScore: true,
          createdAt: true,
        },
      }),
      
      // Top quality sources
      prisma.source.findMany({
        take: 10,
        orderBy: { qualityScore: "desc" },
        where: { qualityScore: { not: null } },
        select: {
          id: true,
          title: true,
          year: true,
          provider: true,
          qualityScore: true,
        },
      }),
      
      // Jobs by type
      prisma.job.groupBy({
        by: ["type", "status"],
        _count: true,
      }),
      
      // Sources by provider
      prisma.source.groupBy({
        by: ["provider"],
        _count: true,
        orderBy: { _count: { provider: "desc" } },
      }),
    ]);

    // Calculate embeddings coverage
    const sourcesWithEmbeddings = await prisma.source.count({
      where: { embeddingModel: { not: null } },
    });
    const embeddingsCoverage = sourcesCount > 0 
      ? Math.round((sourcesWithEmbeddings / sourcesCount) * 100) 
      : 0;

    // Recent ingestion runs
    const recentRuns = await prisma.ingestionRun.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        query: true,
        providers: true,
        status: true,
        stats: true,
        createdAt: true,
        finishedAt: true,
      },
    });

    return NextResponse.json({
      overview: {
        sources: sourcesCount,
        authors: authorsCount,
        institutions: institutionsCount,
        topics: topicsCount,
        briefs: briefsCount,
        digests: digestsCount,
      },
      jobs: {
        pending: pendingJobs,
        failed: failedJobs,
        byType: jobsByType.reduce((acc, item) => {
          if (!acc[item.type]) acc[item.type] = {};
          acc[item.type][item.status] = item._count;
          return acc;
        }, {} as Record<string, Record<string, number>>),
      },
      sources: {
        total: sourcesCount,
        byProvider: sourcesByProvider.map(item => ({
          provider: item.provider,
          count: item._count,
        })),
        embeddingsCoverage,
        recent: recentSources,
        topQuality: topQualitySources,
      },
      ingestion: {
        recentRuns,
      },
    });
  } catch (error: any) {
    console.error("[Stats GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
