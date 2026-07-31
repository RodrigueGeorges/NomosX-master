/**
 * NomosX GAP FILLER — Proactive Knowledge Gap Identification & Pre-Fetching
 *
 * Inspired by WebThinker (NeurIPS 2025) and KnowSelf (ACL 2025):
 * - After each analysis, identify what the agent DIDN'T know or couldn't address
 * - Store these gaps as structured "knowledge gaps" in AgentAuditLog
 * - Before the next run on a similar topic, retrieve relevant gaps and
 *   inject them as priority search queries for SCOUT
 *
 * This closes the loop: the system knows what it doesn't know and
 * proactively seeks to fill those gaps before being asked again.
 *
 * Flow:
 * 1. POST-ANALYSIS: extractAndStoreGaps() — LLM identifies gaps from analysis output
 * 2. PRE-SCOUT: getStoredGaps() — retrieve relevant gaps for current query
 * 3. SCOUT INJECTION: gaps become additional search queries with priority
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { embedText, cosineSimilarity } from './semantic-engine';
import type { DomainExpertise } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgeGap {
  gapId: string;
  description: string;
  domain: DomainExpertise | string;
  searchQueries: string[];
  priority: 'high' | 'medium' | 'low';
  identifiedFrom: string;
  status: 'open' | 'being_filled' | 'filled';
  createdAt: Date;
  filledAt: Date | null;
}

export interface GapExtractionResult {
  gaps: KnowledgeGap[];
  costUsd: number;
}

export interface GapInjection {
  gapQueries: string[];
  gapContext: string;
  gapsAddressed: number;
}

// ============================================================================
// POST-ANALYSIS: Extract and Store Knowledge Gaps
// ============================================================================

/**
 * After an analysis completes, use LLM to identify what the agent couldn't
 * fully address — missing data, untested hypotheses, unexplored angles.
 * These gaps are stored for future runs to proactively address.
 */
export async function extractAndStoreGaps(
  question: string,
  analysisText: string,
  domain: DomainExpertise | string,
  runId: string,
  sourcesUsed: number
): Promise<GapExtractionResult> {
  // Skip gap extraction if analysis was very short or sources were abundant
  if (analysisText.length < 500 || sourcesUsed > 25) {
    return { gaps: [], costUsd: 0 };
  }

  const result = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a research methodology auditor. Analyze the research output and identify knowledge gaps — things the analysis SHOULD have addressed but didn't, or areas where evidence was thin. Be specific and actionable. Each gap should generate 1-2 search queries that could fill it.`,
      },
      {
        role: 'user',
        content: `RESEARCH QUESTION: ${question}

DOMAIN: ${domain}

ANALYSIS EXCERPT (first 3000 chars):
${analysisText.slice(0, 3000)}

SOURCES USED: ${sourcesUsed}

Identify 2-5 knowledge gaps in this analysis. For each gap:
- description: What knowledge was missing or insufficient?
- searchQueries: 1-2 specific search queries that would find sources to fill this gap
- priority: "high" (critical for credibility), "medium" (would strengthen), "low" (nice to have)

Return JSON:
{
  "gaps": [
    {
      "description": "...",
      "searchQueries": ["query 1", "query 2"],
      "priority": "high"
    }
  ]
}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 1000,
    jsonMode: true,
    task: 'topic_classification',
  });

  try {
    const parsed = parseJson<any>(result.content);
    const rawGaps = Array.isArray(parsed?.gaps) ? parsed.gaps : [];

    const gaps: KnowledgeGap[] = [];
    for (const raw of rawGaps.slice(0, 5)) {
      if (!raw.description || !Array.isArray(raw.searchQueries)) continue;

      const gapId = `gap:${domain}:${runId}:${raw.description.slice(0, 40)}`;
      const gap: KnowledgeGap = {
        gapId,
        description: raw.description,
        domain,
        searchQueries: raw.searchQueries.slice(0, 2),
        priority: raw.priority === 'high' || raw.priority === 'low' ? raw.priority : 'medium',
        identifiedFrom: runId,
        status: 'open',
        createdAt: new Date(),
        filledAt: null,
      };
      gaps.push(gap);

      // Persist to AgentAuditLog
      await prisma.agentAuditLog.create({
        data: {
          agent: `gap-filler:${domain}`,
          action: 'KNOWLEDGE_GAP',
          resource: runId,
          metadata: JSON.stringify({
            gapId,
            description: gap.description,
            domain,
            searchQueries: gap.searchQueries,
            priority: gap.priority,
            status: 'open',
          }),
        },
      }).catch(() => null);
    }

    if (gaps.length > 0) {
      console.log(`[GAP FILLER] Identified ${gaps.length} knowledge gaps for domain ${domain}`);
    }

    return { gaps, costUsd: result.costUsd };
  } catch {
    return { gaps: [], costUsd: result.costUsd };
  }
}

// ============================================================================
// PRE-SCOUT: Retrieve Relevant Gaps for Current Query
// ============================================================================

/**
 * Before SCOUT runs, retrieve knowledge gaps that are relevant to the current
 * query. Gaps are matched by semantic similarity to the query.
 * Returns search queries that should be added to SCOUT's search.
 */
export async function getRelevantGaps(
  query: string,
  domain: DomainExpertise | string,
  maxGaps: number = 3
): Promise<GapInjection> {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90-day lookback

    const gapRecords = await prisma.agentAuditLog.findMany({
      where: {
        action: 'KNOWLEDGE_GAP',
        timestamp: { gte: cutoff },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    if (gapRecords.length === 0) {
      return { gapQueries: [], gapContext: '', gapsAddressed: 0 };
    }

    // Parse and filter by domain
    const allGaps = gapRecords
      .map(r => {
        try {
          const m = JSON.parse(r.metadata || '{}');
          return {
            gapId: m.gapId,
            description: m.description,
            domain: m.domain,
            searchQueries: m.searchQueries || [],
            priority: m.priority || 'medium',
            status: m.status || 'open',
            timestamp: r.timestamp,
          };
        } catch { return null; }
      })
      .filter(g => g && (g.domain === domain || g.domain === 'general') && g.status === 'open') as any[];

    if (allGaps.length === 0) {
      return { gapQueries: [], gapContext: '', gapsAddressed: 0 };
    }

    // Semantic match gaps to current query
    const queryEmbedding = await embedText(query).catch(() => null);
    if (!queryEmbedding) {
      // Fallback: just take most recent gaps
      const topGaps = allGaps.slice(0, maxGaps);
      return buildGapInjection(topGaps);
    }

    const scored = await Promise.all(
      allGaps.map(async (gap) => {
        const gapEmbedding = await embedText(gap.description).catch(() => null);
        if (!gapEmbedding) return { gap, score: 0 };
        return { gap, score: cosineSimilarity(queryEmbedding, gapEmbedding) };
      })
    );

    const topGaps = scored
      .sort((a, b) => b.score - a.score)
      .filter(s => s.score > 0.3)
      .slice(0, maxGaps)
      .map(s => s.gap);

    if (topGaps.length === 0) {
      return { gapQueries: [], gapContext: '', gapsAddressed: 0 };
    }

    return buildGapInjection(topGaps);
  } catch (err) {
    console.warn('[GAP FILLER] Failed to retrieve gaps:', err);
    return { gapQueries: [], gapContext: '', gapsAddressed: 0 };
  }
}

function buildGapInjection(gaps: any[]): GapInjection {
  const gapQueries: string[] = [];
  const gapLines: string[] = [];

  for (const gap of gaps) {
    gapQueries.push(...(gap.searchQueries || []));
    gapLines.push(`- [${gap.priority.toUpperCase()}] ${gap.description}`);
  }

  const gapContext = gapLines.length > 0
    ? `=== KNOWLEDGE GAPS FROM PRIOR ANALYSES ===\nThe following gaps were identified in previous analyses on similar topics. Address them if relevant:\n${gapLines.join('\n')}\n=== END KNOWLEDGE GAPS ===`
    : '';

  return {
    gapQueries: [...new Set(gapQueries)], // dedupe
    gapContext,
    gapsAddressed: gaps.length,
  };
}

// ============================================================================
// MARK GAPS AS FILLED
// ============================================================================

/**
 * After a pipeline run, mark gaps that were addressed by the sources found.
 * Called post-SCOUT to close the loop.
 */
export async function markGapsFilled(
  runId: string,
  domain: DomainExpertise | string,
  sourceCount: number
): Promise<void> {
  if (sourceCount < 5) return; // Not enough sources to consider gaps filled

  try {
    const gapRecords = await prisma.agentAuditLog.findMany({
      where: {
        action: 'KNOWLEDGE_GAP',
        resource: runId,
      },
    });

    for (const record of gapRecords) {
      try {
        const m = JSON.parse(record.metadata || '{}');
        await prisma.agentAuditLog.update({
          where: { id: record.id },
          data: {
            metadata: JSON.stringify({ ...m, status: 'filled', filledAt: new Date().toISOString() }),
          },
        });
      } catch { continue; }
    }

    if (gapRecords.length > 0) {
      console.log(`[GAP FILLER] Marked ${gapRecords.length} gaps as filled (run ${runId})`);
    }
  } catch (err) {
    console.warn('[GAP FILLER] Failed to mark gaps as filled:', err);
  }
}
