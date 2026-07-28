/**
 * NomosX Gap-Aware Evidence Append
 *
 * Inspired by EviReport (ACL 2026) — gap-aware iterative evidence retrieval.
 *
 * After analysis, identifies sections with low citation density and generates
 * targeted search queries to fill those gaps. The new sources are then injected
 * into the analysis context for the structural editor to incorporate.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { stripHtmlForEvidence, extractCitationNumbers } from './evidence-ledger';

export interface GapAnalysisResult {
  gaps: SectionGap[];
  expandedTerms: string[];
  newSourceIds: string[];
  costUsd: number;
}

export interface SectionGap {
  section: string;
  citationCount: number;
  sentenceCount: number;
  coverage: number;
  suggestedQuery: string;
}

/**
 * Analyze the analysis output for sections with low citation coverage.
 * Returns gaps that should be filled with additional evidence.
 */
export async function analyzeCitationGaps(
  analysis: Record<string, unknown>,
  sourceCount: number,
): Promise<SectionGap[]> {
  const gaps: SectionGap[] = [];

  // Key analysis fields to check for citation density
  const fieldsToCheck = [
    'summary', 'consensus', 'disagreements',
    'evidence', 'implications', 'risks',
    'open_questions', 'what_changes_mind',
  ];

  for (const field of fieldsToCheck) {
    const content = analysis[field];
    if (typeof content !== 'string' || content.length < 100) continue;

    const text = stripHtmlForEvidence(content);
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 30);
    const citedSentences = sentences.filter(s => extractCitationNumbers(s).length > 0);
    const coverage = sentences.length > 0 ? citedSentences.length / sentences.length : 1;

    // Flag sections with < 50% citation coverage
    if (coverage < 0.5 && sentences.length >= 3) {
      // Generate a targeted search query for this gap
      const keyTerms = extractKeyTerms(text, 5);
      gaps.push({
        section: field,
        citationCount: citedSentences.length,
        sentenceCount: sentences.length,
        coverage,
        suggestedQuery: keyTerms.join(' '),
      });
    }
  }

  // Check debate fields if present
  const debate = analysis.debate as Record<string, unknown> | undefined;
  if (debate) {
    for (const field of ['pro', 'con', 'synthesis']) {
      const content = debate[field];
      if (typeof content !== 'string' || content.length < 100) continue;

      const text = stripHtmlForEvidence(content);
      const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 30);
      const citedSentences = sentences.filter(s => extractCitationNumbers(s).length > 0);
      const coverage = sentences.length > 0 ? citedSentences.length / sentences.length : 1;

      if (coverage < 0.5 && sentences.length >= 3) {
        const keyTerms = extractKeyTerms(text, 5);
        gaps.push({
          section: `debate.${field}`,
          citationCount: citedSentences.length,
          sentenceCount: sentences.length,
          coverage,
          suggestedQuery: keyTerms.join(' '),
        });
      }
    }
  }

  return gaps;
}

/**
 * Extract key terms from text for gap-focused search queries.
 */
function extractKeyTerms(text: string, maxTerms: number): string[] {
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'with', 'from', 'this', 'that',
    'have', 'been', 'they', 'what', 'when', 'where', 'which', 'their',
    'about', 'would', 'there', 'could', 'other', 'into', 'more', 'some',
    'than', 'them', 'very', 'after', 'also', 'over', 'such', 'only',
    'these', 'will', 'each', 'make', 'like', 'just', 'between',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  // Count frequency
  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([word]) => word);
}

/**
 * Generate expanded search terms for gap-filling using LLM.
 */
export async function generateGapQueries(
  originalQuery: string,
  gaps: SectionGap[],
): Promise<string[]> {
  if (gaps.length === 0) return [];

  const gapDescriptions = gaps.map((g, i) =>
    `${i + 1}. Section "${g.section}" has ${g.citationCount}/${g.sentenceCount} cited sentences (${Math.round(g.coverage * 100)}% coverage). Key terms: "${g.suggestedQuery}"`
  ).join('\n');

  try {
    const response = await callLLM({
      messages: [{
        role: "user",
        content: `You are a research assistant. The following sections of a think tank report have low citation coverage. Generate targeted search queries to find additional academic sources for each gap.

ORIGINAL RESEARCH QUESTION: "${originalQuery}"

GAPS TO FILL:
${gapDescriptions}

Generate 1-3 specific search queries (different from the original question) that would find sources to fill these gaps. Return JSON:
{"queries": ["query1", "query2", ...]}`
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 1000,
      task: 'topic_classification',
    });

    const result = parseJson<any>(response.content);
    return result?.queries || [];
  } catch {
    // Fallback: use the gap key terms directly
    return gaps.slice(0, 3).map(g => g.suggestedQuery);
  }
}
