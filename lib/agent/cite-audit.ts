/**
 * CITEAUDIT: Multi-Agent Citation Verification Pipeline
 *
 * Based on: arXiv 2026 "CiteAudit: You Cited It, But Did You Read It?
 * A Benchmark for Verifying Scientific References in the LLM Era"
 *
 * Decomposes citation checking into a multi-agent pipeline:
 * 1. Citation metadata extraction — parse [SRC-N] references
 * 2. Memory lookup — check if we've verified this source before
 * 3. Web-based evidence retrieval — search for the source by title/DOI
 * 4. Scholar search — verify the source exists in OpenAlex/Semantic Scholar
 * 5. Final judgment — is the citation real and correctly attributed?
 *
 * In NomosX, this runs AFTER the pipeline as a final quality gate:
 * - Verifies that every [SRC-N] corresponds to a real publication
 * - Checks that the source metadata (title, authors, year) is consistent
 * - Flags hallucinated citations that "look real" but don't exist
 *
 * Per the paper: 3-13% of citation URLs are hallucinated even in frontier models.
 * This module catches those before publication.
 */

import { callLLM, type LLMTask } from '../llm/unified-llm';

/** Helper: call LLM with simple prompt/systemPrompt interface */
async function llmChat(opts: { task: LLMTask; systemPrompt: string; prompt: string; temperature?: number; maxTokens?: number }): Promise<string> {
  const response = await callLLM({
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.prompt },
    ],
    task: opts.task,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
  return response.content || '';
}

export interface CitationMetadata {
  srcIndex: number;
  /** Title as cited in the brief */
  citedTitle: string;
  /** DOI if available */
  doi?: string;
  /** URL if available */
  url?: string;
  /** Authors if mentioned */
  authors?: string[];
  /** Year if mentioned */
  year?: number;
}

export interface CitationAuditResult {
  srcIndex: number;
  citedTitle: string;
  /** Whether the source exists in academic databases */
  exists: boolean;
  /** Whether the metadata matches what was cited */
  metadataConsistent: boolean;
  /** The actual source found (if exists) */
  verifiedTitle?: string;
  verifiedDoi?: string;
  verifiedYear?: number;
  /** Verdict */
  verdict: 'verified' | 'metadata_mismatch' | 'not_found' | 'hallucinated';
  /** Explanation */
  explanation: string;
  /** Suggested fix */
  suggestedFix?: string;
}

export interface CiteAuditReport {
  totalCitations: number;
  verified: number;
  metadataMismatches: number;
  notFound: number;
  hallucinated: number;
  /** Overall citation authenticity score (0-100) */
  authenticityScore: number;
  results: CitationAuditResult[];
  /** Citations that need immediate attention */
  flagged: CitationAuditResult[];
}

/**
 * Audit all citations in a brief for authenticity.
 *
 * This is the "did you read it" check — verifies that cited sources
 * actually exist in academic databases, not just that claims are supported.
 */
export async function auditCitations(
  citations: CitationMetadata[],
  options: {
    checkOpenAlex?: boolean;
    checkSemanticScholar?: boolean;
    batchSize?: number;
  } = {}
): Promise<CiteAuditReport> {
  const { batchSize = 5 } = options;

  if (citations.length === 0) {
    return {
      totalCitations: 0,
      verified: 0,
      metadataMismatches: 0,
      notFound: 0,
      hallucinated: 0,
      authenticityScore: 100,
      results: [],
      flagged: [],
    };
  }

  console.log(`[CiteAudit] Auditing ${citations.length} citations for authenticity...`);

  const results: CitationAuditResult[] = [];

  // Process in batches
  for (let i = 0; i < citations.length; i += batchSize) {
    const batch = citations.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(citation => auditSingleCitation(citation))
    );

    batchResults.forEach((result, batchIdx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          srcIndex: batch[batchIdx].srcIndex,
          citedTitle: batch[batchIdx].citedTitle,
          exists: false,
          metadataConsistent: false,
          verdict: 'not_found',
          explanation: 'Audit failed — could not verify source',
        });
      }
    });
  }

  // Compute stats
  const verified = results.filter(r => r.verdict === 'verified').length;
  const metadataMismatches = results.filter(r => r.verdict === 'metadata_mismatch').length;
  const notFound = results.filter(r => r.verdict === 'not_found').length;
  const hallucinated = results.filter(r => r.verdict === 'hallucinated').length;

  const authenticityScore = Math.round((verified / results.length) * 100);

  const flagged = results.filter(r => r.verdict === 'hallucinated' || r.verdict === 'not_found');

  console.log(`[CiteAudit] ✅ Complete: ${verified} verified, ${metadataMismatches} mismatches, ${notFound} not found, ${hallucinated} hallucinated | Authenticity: ${authenticityScore}%`);

  return {
    totalCitations: results.length,
    verified,
    metadataMismatches,
    notFound,
    hallucinated,
    authenticityScore,
    results,
    flagged,
  };
}

/**
 * Audit a single citation by searching for it in academic databases.
 *
 * Uses a multi-step approach:
 * 1. If DOI is available, verify it directly via Crossref
 * 2. Otherwise, search by title in OpenAlex
 * 3. If not found, use LLM to assess whether the title "looks real"
 */
async function auditSingleCitation(citation: CitationMetadata): Promise<CitationAuditResult> {
  // Step 1: If DOI is available, try Crossref
  if (citation.doi) {
    try {
      const response = await fetch(`https://api.crossref.org/works/${citation.doi}`, {
        headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.ai)' },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        const work = data.message;
        const verifiedTitle = work.title?.[0] || '';
        const verifiedYear = work.published?.date_parts?.[0]?.[0];

        // Check if titles match (fuzzy)
        const titleMatch = titlesMatch(citation.citedTitle, verifiedTitle);

        return {
          srcIndex: citation.srcIndex,
          citedTitle: citation.citedTitle,
          exists: true,
          metadataConsistent: titleMatch,
          verifiedTitle,
          verifiedDoi: citation.doi,
          verifiedYear,
          verdict: titleMatch ? 'verified' : 'metadata_mismatch',
          explanation: titleMatch
            ? `DOI ${citation.doi} verified via Crossref — title matches`
            : `DOI ${citation.doi} exists but title doesn't match: cited "${citation.citedTitle.slice(0, 60)}" vs actual "${verifiedTitle.slice(0, 60)}"`,
          suggestedFix: titleMatch ? undefined : `Update title to: "${verifiedTitle}"`,
        };
      }
    } catch {
      // Non-blocking — try OpenAlex
    }
  }

  // Step 2: Search by title in OpenAlex
  try {
    const searchQuery = encodeURIComponent(citation.citedTitle.slice(0, 200));
    const response = await fetch(
      `https://api.openalex.org/works?search=${searchQuery}&per_page=1&select=id,title,publication_year,doi`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (response.ok) {
      const data = await response.json();
      const work = data.results?.[0];

      if (work) {
        const titleMatch = titlesMatch(citation.citedTitle, work.title);
        const relevance = data.meta?.score || 0;

        if (titleMatch && relevance > 50) {
          return {
            srcIndex: citation.srcIndex,
            citedTitle: citation.citedTitle,
            exists: true,
            metadataConsistent: true,
            verifiedTitle: work.title,
            verifiedDoi: work.doi,
            verifiedYear: work.publication_year,
            verdict: 'verified',
            explanation: `Source found in OpenAlex — title matches`,
          };
        } else if (relevance > 20) {
          // Found something similar but not exact
          return {
            srcIndex: citation.srcIndex,
            citedTitle: citation.citedTitle,
            exists: true,
            metadataConsistent: false,
            verifiedTitle: work.title,
            verifiedYear: work.publication_year,
            verdict: 'metadata_mismatch',
            explanation: `Similar source found in OpenAlex but title doesn't match exactly: cited "${citation.citedTitle.slice(0, 60)}" vs found "${work.title?.slice(0, 60)}"`,
            suggestedFix: `Verify if this is the correct source: "${work.title}"`,
          };
        }
      }
    }
  } catch {
    // Non-blocking
  }

  // Step 3: LLM assessment — does the title "look real"?
  try {
    const text = await llmChat({
      task: 'cite_audit',
      systemPrompt: 'You are a citation authenticity evaluator. Respond with valid JSON.',
      prompt: `Evaluate whether this cited source title looks like a real academic publication or a hallucinated (fabricated) citation.

CITED TITLE: "${citation.citedTitle}"
${citation.authors ? `AUTHORS: ${citation.authors.join(', ')}` : ''}
${citation.year ? `YEAR: ${citation.year}` : ''}

Hallucinated citations often:
- Have overly generic titles
- Combine buzzwords in unusual ways
- Don't match typical academic naming conventions
- Sound like they could be real but don't correspond to any actual paper

Respond in EXACTLY this JSON format:
{
  "looksReal": <true/false>,
  "confidence": <0.0-1.0>,
  "explanation": "<1-2 sentences>"
}`,
      temperature: 0.1,
      maxTokens: 200,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const looksReal = parsed.looksReal !== false;
      const confidence = parsed.confidence ?? 0.5;

      return {
        srcIndex: citation.srcIndex,
        citedTitle: citation.citedTitle,
        exists: false,
        metadataConsistent: false,
        verdict: looksReal ? 'not_found' : 'hallucinated',
        explanation: parsed.explanation || (looksReal
          ? 'Source not found in databases but title looks plausible — may be a preprint or non-indexed work'
          : 'Source title appears hallucinated — does not match academic naming conventions and not found in any database'),
        suggestedFix: looksReal ? undefined : 'Remove this citation or replace with a verified source',
      };
    }
  } catch {
    // Non-blocking
  }

  // Default: not found
  return {
    srcIndex: citation.srcIndex,
    citedTitle: citation.citedTitle,
    exists: false,
    metadataConsistent: false,
    verdict: 'not_found',
    explanation: 'Source not found in academic databases',
  };
}

/**
 * Fuzzy title matching — checks if two titles are similar enough.
 */
function titlesMatch(title1: string, title2: string): boolean {
  const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const n1 = normalize(title1);
  const n2 = normalize(title2);

  if (n1 === n2) return true;

  // Check if one contains the other (for truncated titles)
  if (n1.includes(n2.slice(0, 50)) || n2.includes(n1.slice(0, 50))) return true;

  // Word overlap
  const words1 = new Set(n1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(n2.split(/\s+/).filter(w => w.length > 3));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  const similarity = union > 0 ? intersection / union : 0;

  return similarity > 0.6;
}

/**
 * Extract citation metadata from a brief's HTML.
 *
 * Looks for [SRC-N] patterns and extracts the corresponding source metadata
 * from the source list.
 */
export function extractCitationMetadata(
  html: string,
  sources: Array<{ id: string; title: string; doi?: string; url?: string; authors?: string[]; year?: number }>
): CitationMetadata[] {
  const metadata: CitationMetadata[] = [];
  const seenIndices = new Set<number>();

  // Find all [SRC-N] references
  const matches = html.matchAll(/\[SRC-(\d+)\]/g);
  for (const match of matches) {
    const srcIndex = parseInt(match[1], 10);
    if (seenIndices.has(srcIndex)) continue;
    seenIndices.add(srcIndex);

    const source = sources[srcIndex - 1];
    if (source) {
      metadata.push({
        srcIndex,
        citedTitle: source.title,
        doi: source.doi,
        url: source.url,
        authors: source.authors,
        year: source.year,
      });
    }
  }

  return metadata;
}
