import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';
import { FORMAT_TYPES_BY_FAMILY, getPublicationFormat } from '@/lib/publication-formats';
import { publicPublicationWhere } from '@/lib/publication-visibility';

/**
 * GET /api/user/briefs/recent
 * 
 * Returns recent open publications for dashboard
 */

// Query parameters schema
const RecentBriefsSchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(12),
  type: z.string().default('ALL'),
});

// Map frontend aliases to actual Prisma ThinkTankPublication.type values
const RECENT_TYPE_MAP: Record<string, string[]> = {
  BRIEF: ['EXECUTIVE_BRIEF', 'RESEARCH_BRIEF', 'SUMMARY_BRIEF'],
  brief: ['EXECUTIVE_BRIEF', 'RESEARCH_BRIEF', 'SUMMARY_BRIEF'],
  briefs: FORMAT_TYPES_BY_FAMILY.briefs || [],
  signals: FORMAT_TYPES_BY_FAMILY.signals || [],
  data: FORMAT_TYPES_BY_FAMILY.data || [],
  memos: FORMAT_TYPES_BY_FAMILY.memos || [],
  reports: FORMAT_TYPES_BY_FAMILY.reports || [],
  dossiers: FORMAT_TYPES_BY_FAMILY.dossiers || [],
  EXECUTIVE_BRIEF: ['EXECUTIVE_BRIEF', 'RESEARCH_BRIEF'],
  STRATEGIC_REPORT: ['STRATEGIC_REPORT'],
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
          });

          if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
          }

          // Build where clause based on type filter — always apply quality gate
          const typeFilter: any = {};
          if (type !== 'ALL') {
            const mapped = RECENT_TYPE_MAP[type];
            if (mapped) {
              typeFilter.type = { in: mapped };
            } else {
              typeFilter.type = type;
            }
          }
          const whereClause = publicPublicationWhere(typeFilter);

          // Get recent publications
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

            const format = getPublicationFormat(brief.type);

            return {
              id: brief.id,
              title: brief.title,
              type: brief.type, // Keep original type for frontend mapping
              format,
              publishedAt: brief.publishedAt!.toISOString(),
              readTime,
              trending: isTrending,
              critical: isCritical,
              preview: brief.html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) + '…',
            };
          });

          return NextResponse.json({
            briefs: transformedBriefs,
            tier: 'OPEN',
            canAccessFull: true,
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
