import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';

/**
 * GET /api/admin/stats
 * 
 * Admin-only endpoint for system statistics
 * Returns comprehensive metrics for monitoring dashboard
 */
export async function GET(req: NextRequest) {
  try {
    // Check admin authentication
    const user = await requireAdmin();

    // Rate limit admin stats
    try {
      await assertRateLimit(`admin:stats:${user.id}`, 30, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429 }
        );
      }
      throw err;
    }

    // Get comprehensive stats
    const [
      totalUsers,
      activeUsers,
      totalPublications,
      publishedBriefs,
      publishedReports,
      draftPublications,
      totalSignals,
      newSignals,
      activeVerticals,
      totalVerticals,
      weeklyPublicationCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          lastLoginAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      prisma.thinkTankPublication.count(),
      prisma.thinkTankPublication.count({
        where: {
          type: "EXECUTIVE_BRIEF",
          status: "PUBLISHED",
        },
      }),
      prisma.thinkTankPublication.count({
        where: {
          type: "STRATEGIC_REPORT",
          status: "PUBLISHED",
        },
      }),
      prisma.thinkTankPublication.count({
        where: { status: "DRAFT" },
      }),
      prisma.signal.count(),
      prisma.signal.count({
        where: { status: "NEW" },
      }),
      prisma.vertical.count({
        where: { isActive: true },
      }),
      prisma.vertical.count(),
      prisma.subscription.aggregate({
        _sum: {
          weeklyPublicationCount: true,
        },
        where: {
          status: "active",
        },
      }),
    ]);

    // Get recent publications
    const recentPublications = await prisma.thinkTankPublication.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        vertical: {
          select: { name: true },
        },
      },
    });

    // Get recent signals
    const recentSignals = await prisma.signal.findMany({
      take: 5,
      orderBy: { detectedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        priorityScore: true,
        detectedAt: true,
        vertical: {
          select: { name: true },
        },
      },
    });

    // Calculate growth metrics (last 7 days vs previous 7 days)
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previous7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [usersLast7Days, usersPrevious7Days] = await Promise.all([
      prisma.user.count({
        where: { createdAt: { gte: last7Days } },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: previous7Days, lt: last7Days },
        },
      }),
    ]);

    const userGrowth = usersPrevious7Days > 0
      ? ((usersLast7Days - usersPrevious7Days) / usersPrevious7Days) * 100
      : 0;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      users: {
        total: totalUsers,
        active: activeUsers,
        new7Days: usersLast7Days,
        growth7Days: Math.round(userGrowth * 10) / 10,
      },
      publications: {
        total: totalPublications,
        briefs: publishedBriefs,
        reports: publishedReports,
        drafts: draftPublications,
        weeklyCount: weeklyPublicationCount._sum.weeklyPublicationCount || 0,
        recent: recentPublications,
      },
      signals: {
        total: totalSignals,
        new: newSignals,
        recent: recentSignals,
      },
      verticals: {
        total: totalVerticals,
        active: activeVerticals,
      },
    });
  } catch (error: any) {
    console.error("[Admin Stats API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
