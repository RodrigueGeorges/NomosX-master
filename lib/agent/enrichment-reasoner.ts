/**
 * NomosX ENRICHMENT REASONER — Adaptive Evidence Sufficiency Assessment
 *
 * Replaces fixed thresholds (minSourceCount, minEvidenceCount) with
 * LLM-based reasoning about whether the current evidence base is sufficient
 * for the specific topic, domain, and publication format.
 *
 * This is NOT a critique layer — it does not evaluate output quality.
 * It is an ENRICHMENT DECISION layer: it decides whether to search more
 * or proceed with available evidence. Effort goes toward research, not rewriting.
 *
 * Invocation points:
 *   1. Post-RANK: After sources are ranked, before analysis begins
 *   2. Post-ANALYST: After analysis, before publication gate
 *
 * Output: either "proceed" (evidence sufficient), "enrich" (search more with
 * targeted queries), or "refuse" (evidence fundamentally insufficient).
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ============================================================================
// TYPES
// ============================================================================

export type EnrichmentVerdict = 'proceed' | 'enrich' | 'refuse';

export interface EnrichmentAssessment {
  verdict: EnrichmentVerdict;
  reasoning: string;
  sufficiencyScore: number; // 0-100: how sufficient is the evidence
  gaps: EvidenceGap[];
  enrichmentQueries: string[]; // targeted search queries if verdict === 'enrich'
  suggestedProviders: string[]; // providers likely to fill gaps
  confidenceLevel: 'high' | 'medium' | 'low';
  costUsd: number;
  durationMs: number;
}

export interface EvidenceGap {
  type: 'missing_perspective' | 'missing_data' | 'missing_methodology' | 'missing_geography' | 'missing_timeframe';
  description: string;
  importance: 'critical' | 'important' | 'nice_to_have';
}

interface SourceSummary {
  title: string;
  provider: string;
  qualityScore: number;
  hasAbstract: boolean;
  hasFullText: boolean;
  year: string | null;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Assess whether the current evidence base is sufficient for quality publication.
 * Called after RANK, before ANALYST.
 *
 * @param query - The research question
 * @param domain - Detected domain (economics, technology, etc.)
 * @param isStrategic - Whether this is a strategic report (deeper requirements)
 * @param sources - Ranked sources to assess
 * @param scoutedCount - Total sources found by SCOUT (before RANK filtering)
 */
export async function assessEvidenceSufficiency(
  query: string,
  domain: string,
  isStrategic: boolean,
  sources: SourceSummary[],
  scoutedCount: number,
): Promise<EnrichmentAssessment> {
  const start = Date.now();

  const sourceProfile = {
    total: sources.length,
    scouted: scoutedCount,
    withAbstract: sources.filter(s => s.hasAbstract).length,
    withFullText: sources.filter(s => s.hasFullText).length,
    avgQuality: sources.length > 0
      ? Math.round(sources.reduce((sum, s) => sum + s.qualityScore, 0) / sources.length)
      : 0,
    providers: [...new Set(sources.map(s => s.provider))],
    yearRange: sources.length > 0
      ? {
          earliest: Math.min(...sources.map(s => parseInt(s.year || '9999', 10)).filter(y => y < 9999)),
          latest: Math.max(...sources.map(s => parseInt(s.year || '0', 10)).filter(y => y > 0)),
        }
      : null,
  };

  const formatLabel = isStrategic ? 'strategic report (10-15 pages)' : 'analytical article (3-5 pages)';

  try {
    const result = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the Evidence Sufficiency Assessor for NomosX, an AI-powered think tank. Your role is to evaluate whether the current evidence base can support a quality ${formatLabel} on the given topic.

You are NOT evaluating writing quality or style. You are assessing RESEARCH SUFFICIENCY: do we have enough evidence to produce a credible, well-grounded analysis?

ASSESSMENT FRAMEWORK:

1. TOPIC NATURE — Is this a well-studied domain with abundant literature, or an emerging/niche topic where few sources exist? Adjust expectations accordingly. A topic with 8 high-quality sources may be sufficient for an emerging area where 15 would be expected for a mature field.

2. EVIDENCE DIVERSITY — Do the sources come from multiple providers/perspectives? 10 sources from 6 providers > 15 sources from 2 providers.

3. EVIDENCE QUALITY — What is the average quality score? Are there load-bearing sources (quality ≥ 80)?

4. GAP ANALYSIS — What perspectives, data, methodologies, or geographies are missing? Are the gaps critical (cannot publish without) or nice-to-have?

5. FORMAT REQUIREMENTS — A strategic report needs broader evidence than a brief. But both need ENOUGH to avoid hallucination.

VERDICT RULES:
- "proceed": Evidence is sufficient to produce a quality analysis. Some gaps may exist but are not critical.
- "enrich": Evidence has identifiable gaps that targeted searches could fill. Generate 2-5 specific search queries that would address the gaps. Suggest providers likely to have the missing evidence.
- "refuse": Evidence is fundamentally insufficient — the topic is too new, too classified, or too niche for any quality analysis. This is rare and should only be used when even targeted searches won't help.

CRITICAL RULES:
- Do NOT default to "refuse" when sources are few but high quality. Few good sources can support a valid analysis with appropriate caveats.
- Do NOT default to "proceed" when sources are many but low quality or single-perspective.
- "enrich" is the preferred verdict when gaps are identifiable and fillable.
- A topic being "emerging" or "niche" is NOT a reason for refusal — it's a reason for lower source count expectations.

Return JSON:
{
  "verdict": "proceed|enrich|refuse",
  "reasoning": "2-3 sentences explaining the assessment",
  "sufficiencyScore": 0-100,
  "gaps": [{ "type": "missing_perspective|missing_data|missing_methodology|missing_geography|missing_timeframe", "description": "specific gap", "importance": "critical|important|nice_to_have" }],
  "enrichmentQueries": ["specific search query 1", ...],
  "suggestedProviders": ["provider_name_1", ...],
  "confidenceLevel": "high|medium|low"
}`,
        },
        {
          role: 'user',
          content: `RESEARCH QUESTION: ${query}
DOMAIN: ${domain}
FORMAT: ${formatLabel}

EVIDENCE BASE:
- Sources ranked: ${sourceProfile.total}
- Total scouted (pre-rank): ${sourceProfile.scouted}
- Sources with abstracts: ${sourceProfile.withAbstract}
- Sources with full text: ${sourceProfile.withFullText}
- Average quality score: ${sourceProfile.avgQuality}/100
- Provider diversity: ${sourceProfile.providers.length} providers (${sourceProfile.providers.join(', ')})
${sourceProfile.yearRange ? `- Year range: ${sourceProfile.yearRange.earliest}-${sourceProfile.yearRange.latest}` : ''}

TOP SOURCES (top 10):
${sources.slice(0, 10).map((s, i) => `[${i + 1}] "${s.title}" (${s.provider}, ${s.year || 'n.d.'}, quality: ${s.qualityScore})`).join('\n')}

Assess the evidence sufficiency for this ${formatLabel}.`,
        },
      ],
      temperature: 0.15,
      maxTokens: 800,
      jsonMode: true,
      enableCache: true,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<Record<string, unknown>>(result.content);
    if (!parsed) {
      // Fallback: proceed with available evidence (don't block pipeline on parse failure)
      return fallbackAssessment(sources.length, isStrategic, start, 'LLM response parse failed — proceeding with available evidence');
    }

    const gaps: EvidenceGap[] = Array.isArray(parsed.gaps)
      ? (parsed.gaps as Array<Record<string, unknown>>).map(g => ({
          type: (g.type as EvidenceGap['type']) || 'missing_perspective',
          description: String(g.description || ''),
          importance: (g.importance as EvidenceGap['importance']) || 'important',
        }))
      : [];

    const enrichmentQueries: string[] = Array.isArray(parsed.enrichmentQueries)
      ? (parsed.enrichmentQueries as string[]).slice(0, 5)
      : [];

    const suggestedProviders: string[] = Array.isArray(parsed.suggestedProviders)
      ? (parsed.suggestedProviders as string[]).slice(0, 8)
      : [];

    const verdict = (parsed.verdict as EnrichmentVerdict) || 'proceed';
    const durationMs = Date.now() - start;

    return {
      verdict: verdict === 'enrich' || verdict === 'refuse' ? verdict : 'proceed',
      reasoning: String(parsed.reasoning || ''),
      sufficiencyScore: typeof parsed.sufficiencyScore === 'number'
        ? Math.max(0, Math.min(100, parsed.sufficiencyScore))
        : 70,
      gaps,
      enrichmentQueries,
      suggestedProviders,
      confidenceLevel: (parsed.confidenceLevel as 'high' | 'medium' | 'low') || 'medium',
      costUsd: result.costUsd,
      durationMs,
    };
  } catch (err) {
    console.warn('[ENRICHMENT REASONER] LLM assessment failed, falling back:', err);
    return fallbackAssessment(sources.length, isStrategic, start, String(err));
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function fallbackAssessment(
  sourceCount: number,
  isStrategic: boolean,
  start: number,
  reason: string,
): EnrichmentAssessment {
  // Deterministic fallback: use simple heuristics (not LLM)
  const minSources = isStrategic ? 5 : 3;
  const verdict: EnrichmentVerdict = sourceCount >= minSources ? 'proceed' : 'refuse';

  return {
    verdict,
    reasoning: `Fallback assessment (${reason}): ${sourceCount} sources, minimum ${minSources} for ${isStrategic ? 'strategic' : 'brief'} format.`,
    sufficiencyScore: sourceCount >= minSources ? 65 : 30,
    gaps: [],
    enrichmentQueries: [],
    suggestedProviders: [],
    confidenceLevel: 'low',
    costUsd: 0,
    durationMs: Date.now() - start,
  };
}
