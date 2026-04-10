import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs } from '@/lib/validation';

/**
 * GET /api/user/stats
 * 
 * Get user statistics for dashboard
 */

// No schema needed for GET request, but we add auth and rate limiting
export async function GET(req: NextRequest) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.api,
      async (req) => {
        try {
          const session = await getSession();
          
          if (!session?.id) {
            return NextResponse.json(
              { error: 'Authentication required' },
              { status: 401 }
            );
          }

          const _userId = session.id; // kept for future per-user stats

          // Get published publications for stats
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const [totalPublications, weeklyPublications, recentPublications] = await Promise.all([
            prisma.thinkTankPublication.count({ where: { status: 'PUBLISHED' } }),
            prisma.thinkTankPublication.count({
              where: { status: 'PUBLISHED', publishedAt: { gte: sevenDaysAgo } },
            }),
            prisma.thinkTankPublication.findMany({
              where: { status: 'PUBLISHED' },
              select: { title: true, wordCount: true, publishedAt: true },
              orderBy: { publishedAt: 'desc' },
              take: 20,
            }),
          ]);

          const totalReadingTime = recentPublications.reduce(
            (sum, p) => sum + Math.ceil((p.wordCount || 0) / 200), 0
          );

          // Extract favorite topics from recent titles
          const topicCounts: Record<string, number> = {};
          recentPublications.forEach(p => {
            const topics = extractTopicsFromTitle(p.title || '');
            topics.forEach(topic => {
              topicCounts[topic] = (topicCounts[topic] || 0) + 1;
            });
          });

          const favoriteTopics = Object.entries(topicCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([topic]) => topic);

          const lastActive = recentPublications[0]?.publishedAt?.toISOString() ?? new Date().toISOString();

          const stats = {
            totalBriefs: totalPublications,
            weeklyBriefs: weeklyPublications,
            totalReadingTime,
            favoriteTopics,
            lastActive,
          };

          return NextResponse.json(stats);

        } catch (error: any) {
          console.error('[API/User/Stats] Error:', error);
          return NextResponse.json(
            { error: 'Failed to fetch user stats' },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}

/**
 * Extract topics from article title (simplified)
 */
function extractTopicsFromTitle(title: string): string[] {
  const topics: string[] = [];
  const keywords = [
    'ai', 'artificial intelligence', 'machine learning', 'climate', 'regulation',
    'economy', 'technology', 'policy', 'health', 'energy', 'finance', 'innovation',
    'sustainability', 'digital transformation', 'geopolitics', 'cybersecurity',
    'biotechnology', 'renewable energy', 'supply chain', 'fintech'
  ];

  const lowerTitle = title.toLowerCase();
  
  keywords.forEach(keyword => {
    if (lowerTitle.includes(keyword)) {
      topics.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
    }
  });

  return topics;
}
