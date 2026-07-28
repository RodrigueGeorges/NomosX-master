/**
 * Papers with Code — AI/ML papers with code and benchmarks
 * Original API deprecated (acquired by HuggingFace).
 * Now uses HuggingFace Daily Papers API + Semantic Scholar as fallback.
 */

import axios from 'axios';

const HF_API = 'https://huggingface.co/api';
const S2_API = 'https://api.semanticscholar.org/graph/v1/paper/search';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchPapersWithCode(query: string, limit = 20): Promise<any[]> {
  console.log(`[PapersWithCode] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // Primary: Semantic Scholar search (supports text query)
    const { data } = await axios.get(S2_API, {
      params: {
        query,
        limit,
        fields: 'title,abstract,authors,year,venue,citationCount,openAccessPdf,externalIds',
      },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    const papers = data?.data ?? [];
    for (const paper of papers.slice(0, limit)) {
      sources.push({
        id: `pwc:${paper.paperId || Buffer.from(paper.title || '').toString('base64').slice(0, 16)}`,
        provider: 'papers-with-code',
        type: 'paper',
        title: paper.title || '',
        abstract: paper.abstract?.slice(0, 2000) || '',
        authors: (paper.authors || []).map((a: any) => a.name).filter(Boolean),
        url: paper.openAccessPdf?.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
        pdfUrl: paper.openAccessPdf?.url || null,
        year: paper.year || null,
        publishedDate: paper.year ? new Date(paper.year, 0, 1) : null,
        venue: paper.venue || '',
        doi: paper.externalIds?.DOI || undefined,
        issuer: 'Papers with Code (via Semantic Scholar)',
        issuerType: 'academic',
        language: 'en',
        oaStatus: paper.openAccessPdf?.url ? 'open' : 'closed',
        hasFullText: !!paper.openAccessPdf?.url,
        topics: ['ai', 'ml', 'code', 'benchmark'],
        citationCount: paper.citationCount || null,
        raw: { source: 'paperswithcode-s2', paperId: paper.paperId },
      });
    }

    // Fallback: HuggingFace daily papers (no search, but recent AI papers)
    if (sources.length < Math.min(5, limit)) {
      const { data: hfData } = await axios.get(`${HF_API}/daily_papers`, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
        timeout: 10000,
      }).catch(() => ({ data: null }));

      const hfPapers = Array.isArray(hfData) ? hfData : [];
      for (const item of hfPapers.slice(0, limit - sources.length)) {
        const paper = item?.paper || item;
        if (!paper?.title) continue;
        sources.push({
          id: `pwc:hf:${paper.id || Buffer.from(paper.title).toString('base64').slice(0, 16)}`,
          provider: 'papers-with-code',
          type: 'paper',
          title: paper.title,
          abstract: paper.summary?.slice(0, 2000) || '',
          authors: (paper.authors || []).map((a: any) => a.name).filter(Boolean),
          url: `https://huggingface.co/papers/${paper.id}`,
          pdfUrl: null,
          year: new Date().getFullYear(),
          publishedDate: new Date(),
          venue: 'HuggingFace Daily Papers',
          issuer: 'HuggingFace Papers',
          issuerType: 'academic',
          language: 'en',
          oaStatus: 'open',
          hasFullText: false,
          topics: ['ai', 'ml', 'trending'],
          citationCount: null,
          raw: { source: 'huggingface-daily', paperId: paper.id },
        });
      }
    }

    console.log(`[PapersWithCode] Found ${sources.length} papers`);
  } catch (error: any) {
    console.error(`[PapersWithCode] Search failed: ${error.message}`);
  }

  return sources;
}
