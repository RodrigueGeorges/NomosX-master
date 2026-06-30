import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withRateLimit, rateLimitConfigs } from '@/lib/validation';
import { FORMAT_TYPES_BY_FAMILY, getPublicationFormat } from '@/lib/publication-formats';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { htmlHasForesightSection } from '@/lib/foresight';
import { extractBriefSummary } from '@/lib/agent/brief-html-extract';

/**
 * GET /api/public/briefs
 * 
 * Public endpoint for brief summaries
 * Returns paginated open publications.
 * 
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 12)
 * - type: publication type, format family, or 'all'
 * - search: string (search in title)
 */

// Query parameters schema
const PublicBriefsSchema = z.object({
  page: z.coerce.number().min(1).max(100).default(1),
  limit: z.coerce.number().min(1).max(50).default(12),
  type: z.string().default('all'),
  search: z.string().max(200).default(''),
});

const VALID_TYPES = new Set([
  'EXECUTIVE_BRIEF', 'RESEARCH_BRIEF', 'SUMMARY_BRIEF',
  'UPDATE_NOTE', 'DATA_NOTE', 'POLICY_NOTE', 'DOSSIER', 'STRATEGIC_REPORT',
  'all',
  ...Object.keys(FORMAT_TYPES_BY_FAMILY),
]);

export async function GET(req: NextRequest) {
  return withRateLimit(
    rateLimitConfigs.api,
    async (req) => {
      try {
        // Parse and validate query parameters
        const { searchParams } = new URL(req.url);
        const raw: Record<string, string> = {};
        for (const key of ['page', 'limit', 'type', 'search']) {
          const val = searchParams.get(key);
          if (val !== null) raw[key] = val;
        }
        const validation = PublicBriefsSchema.safeParse(raw);

        if (!validation.success) {
          return NextResponse.json(
            { 
              error: 'Invalid query parameters',
              details: validation.error.errors 
            },
            { status: 400 }
          );
        }

        const { page, limit, type, search } = validation.data;
        const offset = (page - 1) * limit;

        // Build where clause
        const where: any = publicPublicationWhere({ AND: [] });

        if (type !== 'all' && VALID_TYPES.has(type)) {
          if (FORMAT_TYPES_BY_FAMILY[type]) {
            where.type = { in: FORMAT_TYPES_BY_FAMILY[type] };
          } else {
            where.type = type;
          }
        }

        if (search) {
          where.AND.push({ OR: [{ title: { contains: search, mode: 'insensitive' } }] });
        }

        // Get total count for pagination
        let totalCount = 0;
        let briefs: any[] = [];
        try {
          totalCount = await prisma.thinkTankPublication.count({ where });

          // Fetch briefs with summaries
          briefs = await prisma.thinkTankPublication.findMany({
            where,
            orderBy: { publishedAt: 'desc' },
            skip: offset,
            take: limit,
            select: {
              id: true,
              title: true,
              type: true,
              publishedAt: true,
              wordCount: true,
              sourceIds: true,
              html: true,
              trustScore: true,
              qualityScore: true,
              criticalLoopResult: true,
            },
          });
        } catch (dbError: any) {
          console.error('[API/Public/Briefs] Database error:', dbError);
          // Return empty results instead of 500 error
          totalCount = 0;
          briefs = [];
        }

        // Transform data for public consumption
        const transformedBriefs = briefs.map(brief => {
          // Extract summary from HTML content with improved logic
          let summary = '';
          try {
            const rawHtml = (brief.html || '').replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
            summary = extractBriefSummary(rawHtml);
            if (!summary || summary.length < 20) {
              summary = 'Strategic analysis from the NomosX agentic pipeline — map, confront, quantify, decide.';
            }
          } catch {
            summary = 'Strategic analysis from the NomosX agentic pipeline — map, confront, quantify, decide.';
          }

          // Estimate read time (200 words per minute)
          const readTime = Math.max(1, Math.ceil(brief.wordCount / 200));

          // Extract topics from title and content with improved keyword extraction
          const topics: string[] = [];
          try {
            const titleText = (brief.title || '').toLowerCase();
            const contentText = summary.toLowerCase();
            
            const keywordMap = {
              'ai': ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'intelligence artificielle'],
              'climate': ['climate', 'climat', 'carbon', 'co2', 'emission', 'warming', 'réchauffement'],
              'economy': ['economy', 'economic', 'finance', 'market', 'growth', 'économie', 'financier'],
              'technology': ['technology', 'tech', 'innovation', 'digital', 'technologie', 'numérique'],
              'policy': ['policy', 'regulation', 'government', 'politique', 'réglementation'],
              'health': ['health', 'medical', 'healthcare', 'santé', 'médical'],
              'energy': ['energy', 'renewable', 'solar', 'wind', 'nuclear', 'énergie', 'renouvelable'],
              'geopolitics': ['geopolitics', 'international', 'global', 'géopolitique', 'international'],
              'cybersecurity': ['cybersecurity', 'cyber', 'security', 'cybersécurité', 'sécurité'],
              'biotechnology': ['biotechnology', 'biotech', 'genetic', 'biotechnologie', 'génétique']
            };
            
            const scoredTopics: Array<{ topic: string; score: number }> = [];
            
            for (const [topic, keywords] of Object.entries(keywordMap)) {
              let score = 0;
              for (const keyword of keywords) {
                const titleMatches = (titleText.match(new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length;
                const contentMatches = (contentText.match(new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length;
                score += titleMatches * 3 + contentMatches * 1; // Title matches worth more
              }
              if (score > 0) {
                scoredTopics.push({ topic: topic.charAt(0).toUpperCase() + topic.slice(1), score });
              }
            }
            
            // Sort by score and take top topics
            scoredTopics.sort((a, b) => b.score - a.score);
            topics.push(...scoredTopics.slice(0, 5).map(t => t.topic));
            
            // Fallback to basic keywords if no matches
            if (topics.length === 0) {
              const basicKeywords = ['AI', 'Climate', 'Economy', 'Technology', 'Policy', 'Health', 'Energy'];
              topics.push(...basicKeywords.slice(0, 3));
            }
          } catch {
            topics.push('Research', 'Analysis', 'Strategy');
          }

          const format = getPublicationFormat(brief.type);
          const meta = (brief.criticalLoopResult ?? {}) as Record<string, unknown>;
          const foresight = meta.foresight as { available?: boolean } | undefined;
          const sim = meta.simulation as { scenarios?: unknown[] } | undefined;
          const hasForesight =
            Boolean(foresight?.available) ||
            Boolean(sim?.scenarios?.length) ||
            htmlHasForesightSection(brief.html ?? "");

          return {
            id: brief.id,
            title: brief.title,
            summary,
            type: brief.type,
            format,
            publishedAt: brief.publishedAt?.toISOString() || new Date().toISOString(),
            readTime,
            sources: brief.sourceIds?.length || 0,
            topics: topics.slice(0, 5), // Max 5 topics
            tier: format.access,
            displayType: format.label,
            trustScore: brief.trustScore ?? null,
            qualityScore: brief.qualityScore ?? null,
            hasForesight,
          };
        });

        const totalPages = Math.ceil(totalCount / limit);

        return NextResponse.json({
          briefs: transformedBriefs,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
          filters: {
            type,
            search,
          }
        });

      } catch (error: any) {
        console.error('[API/Public/Briefs] Error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch briefs' },
          { status: 500 }
        );
      }
    }
  )(req);
}
