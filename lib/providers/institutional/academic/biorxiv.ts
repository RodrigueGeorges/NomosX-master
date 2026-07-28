/**
 * bioRxiv/medRxiv — Preprint servers
 * API: https://api.biorxiv.org/ (free, no key required)
 * Biology and medical preprints, also covers cross-domain topics
 */

import axios from 'axios';

const BIORXIV_API = 'https://api.biorxiv.org/details';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchBioRxiv(query: string, limit = 20): Promise<any[]> {
  console.log(`[bioRxiv] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // bioRxiv API doesn't have a search endpoint, but we can use the details endpoint
    // with date range to get recent papers, then filter by keyword
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setMonth(fromDate.getMonth() - 6); // Last 6 months

    const from = fromDate.toISOString().split('T')[0];
    const to = today.toISOString().split('T')[0];

    // Try bioRxiv
    const { data: bioData } = await axios.get(`${BIORXIV_API}/biorxiv/${from}/${to}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const bioPapers = bioData?.collection || [];
    const qLower = query.toLowerCase();
    const terms = qLower.split(/\s+/).filter(t => t.length > 3);

    for (const paper of bioPapers) {
      if (sources.length >= limit) break;
      const title = paper?.title || '';
      const abstract = paper?.abstract || '';
      const text = `${title} ${abstract}`.toLowerCase();

      // Simple keyword matching
      const matches = terms.some(t => text.includes(t));
      if (!matches) continue;

      sources.push({
        id: `biorxiv:${paper.doi || paper.id}`,
        provider: 'biorxiv',
        type: 'preprint',
        title,
        abstract: abstract.slice(0, 2000),
        authors: (paper.authors || '').split(';').map((a: string) => a.trim()).filter(Boolean),
        url: `https://www.biorxiv.org/content/${paper.doi}v${paper.version || 1}`,
        pdfUrl: paper.doi ? `https://www.biorxiv.org/content/${paper.doi}v${paper.version || 1}.full.pdf` : null,
        doi: paper.doi,
        year: paper.date ? new Date(paper.date).getFullYear() : null,
        publishedDate: paper.date ? new Date(paper.date) : null,
        venue: 'bioRxiv',
        issuer: 'bioRxiv',
        issuerType: 'preprint',
        language: 'en',
        oaStatus: 'open',
        hasFullText: true,
        topics: ['biology', 'preprint'],
        raw: { source: 'biorxiv', doi: paper.doi, category: paper.category },
      });
    }

    // Also try medRxiv
    if (sources.length < limit) {
      try {
        const { data: medData } = await axios.get(`${BIORXIV_API}/medrxiv/${from}/${to}`, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 15000,
        });

        const medPapers = medData?.collection || [];
        for (const paper of medPapers) {
          if (sources.length >= limit) break;
          const title = paper?.title || '';
          const abstract = paper?.abstract || '';
          const text = `${title} ${abstract}`.toLowerCase();
          const matches = terms.some(t => text.includes(t));
          if (!matches) continue;

          sources.push({
            id: `medrxiv:${paper.doi || paper.id}`,
            provider: 'biorxiv',
            type: 'preprint',
            title,
            abstract: abstract.slice(0, 2000),
            authors: (paper.authors || '').split(';').map((a: string) => a.trim()).filter(Boolean),
            url: `https://www.medrxiv.org/content/${paper.doi}v${paper.version || 1}`,
            pdfUrl: paper.doi ? `https://www.medrxiv.org/content/${paper.doi}v${paper.version || 1}.full.pdf` : null,
            doi: paper.doi,
            year: paper.date ? new Date(paper.date).getFullYear() : null,
            publishedDate: paper.date ? new Date(paper.date) : null,
            venue: 'medRxiv',
            issuer: 'medRxiv',
            issuerType: 'preprint',
            language: 'en',
            oaStatus: 'open',
            hasFullText: true,
            topics: ['medicine', 'preprint'],
            raw: { source: 'medrxiv', doi: paper.doi, category: paper.category },
          });
        }
      } catch {
        // medRxiv failed, continue
      }
    }

    console.log(`[bioRxiv] Found ${sources.length} preprints`);
  } catch (error: any) {
    console.error(`[bioRxiv] Search failed: ${error.message}`);
  }

  return sources;
}
