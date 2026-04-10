import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * GET /api/admin/dashboard
 * 
 * Admin dashboard endpoint for system monitoring and statistics
 * Requires admin privileges
 */

// Query parameters schema
const AdminDashboardSchema = z.object({
  period: z.enum(['24h', '7d', '30d', '90d']).default('7d'),
  metrics: z.enum(['overview', 'users', 'briefs', 'system']).default('overview'),
});

export async function GET(req: NextRequest) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.api,
      async (req) => {
        try {
          const session = await getSession();
          if (!session?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
          }

          // Check if user is admin
          const user = await prisma.user.findUnique({
            where: { email: session.email },
            select: { role: true, email: true },
          });

          if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
          }

          // Parse and validate query parameters
          const { searchParams } = new URL(req.url);
          const validation = AdminDashboardSchema.safeParse({
            period: searchParams.get('period'),
            metrics: searchParams.get('metrics'),
          });

          if (!validation.success) {
            return NextResponse.json(
              { 
                error: 'Invalid query parameters',
                details: validation.error.errors 
              },
              { status: 400 }
            );
          }

          const { period, metrics } = validation.data;

          // Calculate date range based on period
          const now = new Date();
          let startDate: Date;
          
          switch (period) {
            case '24h':
              startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              break;
            case '7d':
              startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              break;
            case '30d':
              startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              break;
            case '90d':
              startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
              break;
            default:
              startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          }

          // Fetch data based on requested metrics
          let data: any = {};

          switch (metrics) {
            case 'overview':
              data = await getOverviewStats(startDate, now);
              break;
            case 'users':
              data = await getUserStats(startDate, now);
              break;
            case 'briefs':
              data = await getBriefStats(startDate, now);
              break;
            case 'system':
              data = await getSystemStats();
              break;
          }

          return NextResponse.json({
            data,
            period,
            metrics,
            timestamp: now.toISOString(),
          });

        } catch (error: any) {
          console.error('[API/Admin/Dashboard] Error:', error);
          return NextResponse.json(
            { error: "Failed to fetch admin dashboard data" },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}

// Overview statistics
async function getOverviewStats(startDate: Date, endDate: Date) {
  const [
    totalUsers,
    newUsers,
    totalBriefs,
    newBriefs,
    totalRevenue,
    activeSubscriptions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { createdAt: { gte: startDate } },
    }),
    prisma.thinkTankPublication.count(),
    prisma.thinkTankPublication.count({
      where: { publishedAt: { gte: startDate } },
    }),
    // Revenue calculation would depend on your payment system
    // For now, return subscription count as placeholder
    prisma.subscription.count(),
    prisma.subscription.count({
      where: { 
        status: 'active',
        OR: [
          { trialEnd: { gt: endDate } },
          { stripeCurrentPeriodEnd: { gt: endDate } },
        ],
      },
    }),
  ]);

  return {
    users: {
      total: totalUsers,
      new: newUsers,
      growthRate: totalUsers > 0 ? (newUsers / totalUsers) * 100 : 0,
    },
    briefs: {
      total: totalBriefs,
      new: newBriefs,
      growthRate: totalBriefs > 0 ? (newBriefs / totalBriefs) * 100 : 0,
    },
    revenue: {
      total: 0, // Placeholder - would calculate from actual payments
      period: 0, // Calculate based on period
    },
    subscriptions: {
      active: activeSubscriptions,
      churnRate: 0, // Calculate based on cancellations
    },
  };
}

// User statistics - simplified version
async function getUserStats(startDate: Date, endDate: Date) {
  const [totalUsers, newUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { createdAt: { gte: startDate } },
    }),
  ]);

  return {
    users: {
      total: totalUsers,
      new: newUsers,
      growthRate: totalUsers > 0 ? (newUsers / totalUsers) * 100 : 0,
    },
    // Placeholder data for now
    subscriptions: {
      active: 0,
      churnRate: 0,
    },
  };
}

// Brief statistics
async function getBriefStats(startDate: Date, endDate: Date) {
  const [
    totalBriefs,
    publishedBriefs,
    briefsByType,
    averageReadTime,
    topTopics,
  ] = await Promise.all([
    prisma.thinkTankPublication.count(),
    prisma.thinkTankPublication.count({
      where: { 
        status: 'PUBLISHED',
        publishedAt: { gte: startDate },
      },
    }),
    prisma.thinkTankPublication.groupBy({
      by: ['type'],
      _count: true,
      where: { publishedAt: { gte: startDate } },
    }),
    prisma.thinkTankPublication.aggregate({
      _avg: { wordCount: true },
      where: { publishedAt: { gte: startDate } },
    }),
    // Top topics would require more complex analysis
    prisma.thinkTankPublication.findMany({
      where: { publishedAt: { gte: startDate } },
      select: { title: true },
      take: 100,
    }),
  ]);

  // Extract topics from titles (simplified)
  const topicCounts: Record<string, number> = {};
  topTopics.forEach(brief => {
    const title = brief.title.toLowerCase();
    const keywords = ['ai', 'climate', 'economy', 'technology', 'policy', 'health'];
    keywords.forEach(keyword => {
      if (title.includes(keyword)) {
        topicCounts[keyword] = (topicCounts[keyword] || 0) + 1;
      }
    });
  });

  return {
    total: totalBriefs,
    published: publishedBriefs,
    byType: briefsByType.reduce((acc, item) => {
      acc[item.type] = item._count;
      return acc;
    }, {} as Record<string, number>),
    averageReadTime: averageReadTime._avg.wordCount ? Math.ceil(averageReadTime._avg.wordCount / 200) : 0,
    topTopics: Object.entries(topicCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count })),
  };
}

// System statistics
async function getSystemStats() {
  // This would include system health, performance metrics, etc.
  return {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || 'unknown',
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    lastDeployment: process.env.VERCEL_DEPLOYMENT_URL ? new Date().toISOString() : 'unknown',
  };
}
