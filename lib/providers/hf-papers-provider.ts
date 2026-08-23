/**
 * HuggingFace Papers Provider — AI/ML research papers with code & model links
 *
 * Free, no API key required for search. HuggingFace indexes papers from arXiv
 * and adds community-curated metadata: linked models, datasets, and code repos.
 *
 * KEY VALUE: Bridges the gap between academic papers and practical implementations.
 * When a paper has a HuggingFace model or dataset, we get the link directly.
 * Especially strong for AI, ML, NLP, CV, and adjacent fields.
 *
 * API: https://huggingface.co/api/papers/search?q={query}&limit={limit}
 * Docs: https://github.com/huggingface/skills/blob/main/skills/huggingface-papers/SKILL.md
 */

import { fetchFromProvider } from '../http-client';

export async function searchHuggingFacePapers(query: string, limit = 20): Promise<any[]> {
  try {
    const url = `https://huggingface.co/api/papers/search?q=${encodeURIComponent(query.slice(0, 250))}&limit=${Math.min(limit, 50)}`;

    const data: any = await fetchFromProvider('hf-papers', url, {
      timeout: 15000,
      retries: 1,
      headers: { 'Accept': 'application/json' },
    });

    const items = Array.isArray(data) ? data : (data?.items || []);
    console.log(`[HuggingFace-Papers] Found ${items.length} papers`);

    return items.map((paper: any) => {
      const arxivId = paper.id || paper.arxiv_id || '';
      const title = paper.title || 'Untitled';
      const abstract = paper.summary || paper.abstract || null;
      const authors = (paper.authors || []).map((a: any) => ({
        name: typeof a === 'string' ? a : (a.name || a.full_name || ''),
      }));
      const publishedAt = paper.publishedAt || paper.published_at || null;
      const year = publishedAt ? new Date(publishedAt).getFullYear() : null;

      // HuggingFace-specific enrichment: linked models and datasets
      const models = paper.models || [];
      const datasets = paper.datasets || [];

      return {
        id: `hf-papers:${arxivId}`,
        provider: 'hf-papers',
        type: 'paper',
        title,
        abstract,
        doi: null,
        year: year && !isNaN(year) ? year : null,
        publishedDate: publishedAt,
        authors,
        institutions: [],
        citationCount: paper.citationCount || paper.citation_count || 0,
        qualityScore: 65,
        oaStatus: 'oa',
        hasFullText: true,
        documentType: 'preprint',
        issuer: 'HuggingFace/arXiv',
        issuerType: 'platform',
        classification: 'academic',
        language: 'en',
        contentFormat: 'text',
        url: arxivId ? `https://huggingface.co/papers/${arxivId}` : null,
        pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : null,
        // Enrichment: links to implementations
        linkedModels: models.slice(0, 5),
        linkedDatasets: datasets.slice(0, 5),
        raw: paper,
      };
    });
  } catch (err: any) {
    console.warn(`[HuggingFace-Papers] Error: ${err.message}`);
    return [];
  }
}
