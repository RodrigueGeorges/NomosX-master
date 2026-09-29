import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { getPublicationFormat } from '@/lib/publication-formats';
import { htmlHasForesightSection } from '@/lib/foresight';
import { extractBriefSummary, isPositionFirstBrief } from '@/lib/agent/brief-html-extract';
import type { BriefLike } from '@/lib/inquiry-mapper';

/**
 * Server-side brief fetcher — mirrors the /api/public/briefs logic
 * but callable directly from Server Components (no HTTP roundtrip).
 */
export async function fetchPublicBriefs(limit = 48): Promise<BriefLike[]> {
  try {
    const where = publicPublicationWhere({ AND: [] });

    const briefs = await prisma.thinkTankPublication.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit * 2,
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
        heroImageUrl: true,
      },
    });

    const filtered = briefs.filter((brief) => {
      const rawHtml = (brief.html || '')
        .replace(/^```html?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      return isPositionFirstBrief(rawHtml);
    });

    return filtered.slice(0, limit).map((brief) => {
      let summary = '';
      try {
        const rawHtml = (brief.html || '')
          .replace(/^```html?\s*/i, '')
          .replace(/\s*```\s*$/, '')
          .trim();
        summary = extractBriefSummary(rawHtml);
        if (!summary || summary.length < 20) {
          summary = 'Strategic analysis from NomosX — map, confront, quantify, decide.';
        }
      } catch {
        summary = 'Strategic analysis from NomosX — map, confront, quantify, decide.';
      }

      const readTime = Math.max(1, Math.ceil(brief.wordCount / 200));
      const format = getPublicationFormat(brief.type);
      const meta = (brief.criticalLoopResult ?? {}) as Record<string, unknown>;
      const foresight = meta.foresight as { available?: boolean } | undefined;
      const sim = meta.simulation as { scenarios?: unknown[] } | undefined;
      const hasForesight =
        Boolean(foresight?.available) ||
        Boolean(sim?.scenarios?.length) ||
        htmlHasForesightSection(brief.html ?? '');

      const topics = extractTopics(brief.title || '', summary);

      return {
        id: brief.id,
        title: brief.title,
        summary,
        type: brief.type,
        publishedAt: brief.publishedAt?.toISOString() || new Date().toISOString(),
        readTime,
        sources: brief.sourceIds?.length || 0,
        topics: topics.slice(0, 5),
        trustScore: brief.trustScore ?? null,
        displayType: format.label,
        hasForesight,
        heroImageUrl: brief.heroImageUrl ?? null,
      } as BriefLike;
    });
  } catch (error: any) {
    console.error('[fetchPublicBriefs] Error:', error);
    return [];
  }
}

function extractTopics(title: string, summary: string): string[] {
  const topics: string[] = [];
  try {
    const titleText = title.toLowerCase();
    const contentText = summary.toLowerCase();

    const keywordMap: Record<string, string[]> = {
      ai: ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'intelligence artificielle'],
      climate: ['climate', 'climat', 'carbon', 'co2', 'emission', 'warming', 'réchauffement'],
      economy: ['economy', 'economic', 'finance', 'market', 'growth', 'économie', 'financier'],
      technology: ['technology', 'tech', 'innovation', 'digital', 'technologie', 'numérique'],
      policy: ['policy', 'regulation', 'government', 'politique', 'réglementation'],
      health: ['health', 'medical', 'healthcare', 'santé', 'médical'],
      energy: ['energy', 'renewable', 'solar', 'wind', 'nuclear', 'énergie', 'renouvelable'],
      geopolitics: ['geopolitics', 'international', 'global', 'géopolitique', 'international'],
      cybersecurity: ['cybersecurity', 'cyber', 'security', 'cybersécurité', 'sécurité'],
      biotechnology: ['biotechnology', 'biotech', 'genetic', 'biotechnologie', 'génétique'],
    };

    const scored: Array<{ topic: string; score: number }> = [];
    for (const [topic, keywords] of Object.entries(keywordMap)) {
      let score = 0;
      for (const keyword of keywords) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const titleMatches = (titleText.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || []).length;
        const contentMatches = (contentText.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || []).length;
        score += titleMatches * 3 + contentMatches * 1;
      }
      if (score > 0) scored.push({ topic: topic.charAt(0).toUpperCase() + topic.slice(1), score });
    }

    scored.sort((a, b) => b.score - a.score);
    topics.push(...scored.slice(0, 5).map((t) => t.topic));

    if (topics.length === 0) {
      topics.push('Research', 'Analysis', 'Strategy');
    }
  } catch {
    topics.push('Research', 'Analysis', 'Strategy');
  }
  return topics;
}
