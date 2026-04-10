/**
 * Semantic Scholar Graph API — Enhanced Provider
 * 200M+ papers with citation graph, influence scores, and TLDR summaries.
 * Free API, no key required (rate limit: 100 req/5min).
 * 
 * KEY VALUE: Citation graph traversal, influence scoring, TLDR summaries.
 * Complements OpenAlex with AI-generated paper summaries and influence metrics.
 * API docs: https://api.semanticscholar.org/api-docs/graph
 */

import { fetchFromProvider } from '../http-client';

export async function searchSemanticScholarGraph(query: string, limit = 25): Promise<any[]> {
  const fields = "paperId,title,abstract,year,citationCount,influentialCitationCount,authors,openAccessPdf,url,externalIds,venue,publicationTypes,tldr,fieldsOfStudy";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${Math.min(limit, 50)}&fields=${fields}`;

  try {
    const data: any = await fetchFromProvider("semantic-scholar-graph", url, {
      timeout: 15000,
      headers: {
        Accept: "application/json",
      },
    });

    const items = data?.data || [];
    console.log(`[SemanticScholar-Graph] Found ${items.length} papers`);

    return items
      .filter((p: any) => p.title && p.abstract && p.abstract.length >= 150)
      .map((p: any) => {
        const abstractLen = p.abstract?.length || 0;

        return {
          id: `s2:${p.paperId}`,
          provider: "semantic-scholar-graph",
          type: "paper",
          title: p.title || "",
          abstract: p.abstract || null,
          year: p.year ?? null,
          doi: p.externalIds?.DOI || null,
          url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
          pdfUrl: p.openAccessPdf?.url ?? null,
          oaStatus: p.openAccessPdf?.url ? "oa" : null,
          authors: (p.authors || [])
            .slice(0, 10)
            .map((a: any) => ({ name: a.name, authorId: a.authorId }))
            .filter((a: any) => a.name),
          institutions: [],
          topics: p.fieldsOfStudy || [],
          citationCount: p.citationCount ?? 0,
          influentialCitationCount: p.influentialCitationCount ?? 0,
          tldr: p.tldr?.text || null,
          venue: p.venue || null,
          contentLength: abstractLen,
          raw: p,
        };
      });
  } catch (error: any) {
    console.error(`[SemanticScholar-Graph] Search failed: ${error.message}`);
    return [];
  }
}
