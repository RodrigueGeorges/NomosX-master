import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * GET /api/user/briefs/recent
 * 
 * Returns recent briefs for dashboard
 * Respects subscription tier for content access
 */

// Query parameters schema
const RecentBriefsSchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(12),
  type: z.string().default('ALL'),
});

// Map frontend aliases to actual Prisma ThinkTankPublication.type values
const RECENT_TYPE_MAP: Record<string, string[]> = {
  BRIEF: ['EXECUTIVE_BRIEF', 'RESEARCH_BRIEF', 'SUMMARY_BRIEF'],
  executive: ['EXECUTIVE_BRIEF', 'RESEARCH_BRIEF', 'SUMMARY_BRIEF', 'UPDATE_NOTE', 'DATA_NOTE', 'POLICY_NOTE'],
  EXECUTIVE_BRIEF: ['EXECUTIVE_BRIEF', 'RESEARCH_BRIEF', 'SUMMARY_BRIEF'],
  STRATEGIC_REPORT: ['STRATEGIC_REPORT', 'DOSSIER'],
  strategic: ['STRATEGIC_REPORT', 'DOSSIER'],
};

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

          // Parse and validate query parameters
          const { searchParams } = new URL(req.url);
          const validation = RecentBriefsSchema.safeParse({
            limit: searchParams.get('limit'),
            type: searchParams.get('type'),
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

          const { limit, type } = validation.data;

          const user = await prisma.user.findUnique({
            where: { email: session.email },
            include: { subscription: true },
          });

          if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
          }

          const subscription = user.subscription;
          const tier = subscription?.plan || 'ANALYST';

          // Build where clause based on type filter
          const whereClause: any = {
            status: "PUBLISHED",
            publishedAt: { not: null },
          };

          if (type !== 'ALL') {
            const mapped = RECENT_TYPE_MAP[type];
            if (mapped) {
              whereClause.type = { in: mapped };
            } else {
              whereClause.type = type; // pass raw Prisma value as-is
            }
          }

          // Get recent briefs
          const briefs = await prisma.thinkTankPublication.findMany({
            where: whereClause,
            orderBy: { publishedAt: 'desc' },
            take: limit,
            select: {
              id: true,
              title: true,
              type: true,
              publishedAt: true,
              wordCount: true,
              html: true,
              // Add trending/critical flags based on recent activity
            },
          });

          // Transform for dashboard
          const transformedBriefs = briefs.map(brief => {
            // Determine if trending (published in last 48h)
            const publishedAt = new Date(brief.publishedAt!);
            const now = new Date();
            const hoursSincePublished = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
            const isTrending = hoursSincePublished <= 48;
            
            // Determine if critical (based on keywords)
            const criticalKeywords = ['crisis', 'urgent', 'critical', 'breakthrough', 'disruption'];
            const isCritical = criticalKeywords.some(keyword => 
              brief.title.toLowerCase().includes(keyword)
            );

            // Estimate read time
            const readTime = Math.max(1, Math.ceil(brief.wordCount / 200));

            return {
              id: brief.id,
              title: brief.title,
              type: brief.type, // Keep original type for frontend mapping
              publishedAt: brief.publishedAt!.toISOString(),
              readTime,
              trending: isTrending,
              critical: isCritical,
              preview: (tier === 'TRIAL' || tier === 'ANALYST') ? brief.html.substring(0, 200) + '...' : null,
            };
          });

          return NextResponse.json({
            briefs: transformedBriefs,
            tier,
            canAccessFull: tier !== 'TRIAL' && tier !== 'ANALYST',
            filters: {
              limit,
              type,
            }
          });

        } catch (error: any) {
          console.error('[API/User/Briefs/Recent] Error:', error);
          return NextResponse.json(
            { error: "Failed to fetch briefs" },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}
