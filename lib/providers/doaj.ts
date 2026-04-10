/**
 * DOAJ Provider — Directory of Open Access Journals
 * 20,000+ journals, 10M+ articles across ALL disciplines.
 * Strong coverage of: humanities, social sciences, law, education, arts.
 * API: https://doaj.org/api/docs
 * 
 * KEY VALUE: Best open access source for humanities, law, and social sciences
 * that arXiv/PubMed don't cover. Free API, no key required.
 */

import { fetchFromProvider } from '../http-client';

export async function searchDOAJ(query: string, limit = 30): Promise<any[]> {
  const pageSize = Math.min(limit, 50);
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${pageSize}&sort=relevance`;

  try {
    const data: any = await fetchFromProvider("doaj", url, { timeout: 15000 });
    const results = data?.results || [];

    console.log(`[DOAJ] Found ${results.length} articles`);

    const papers = results
      .filter((r: any) => {
        const bib = r.bibjson;
        return bib?.title && bib?.abstract && bib.abstract.length >= 100;
      })
      .map((r: any) => {
        const bib = r.bibjson;
        const abstractLen = bib.abstract?.length || 0;
        const doi = bib.identifier?.find((id: any) => id.type === "doi")?.id || null;
        const pdfLink = bib.link?.find((l: any) => l.type === "fulltext" && l.content_type?.includes("pdf"));
        const anyLink = bib.link?.find((l: any) => l.type === "fulltext");

        return {
          id: `doaj:${r.id}`,
          provider: "doaj",
          type: "paper",
          title: bib.title || "",
          abstract: bib.abstract || null,
          year: bib.year ? parseInt(bib.year) : null,
          doi,
          url: doi ? `https://doi.org/${doi}` : anyLink?.url || `https://doaj.org/article/${r.id}`,
          pdfUrl: pdfLink?.url || null,
          oaStatus: "oa",
          authors: (bib.author || []).map((a: any) => ({
            name: a.name || "",
            orcid: a.orcid_id || null,
            affiliation: a.affiliation?.name || null,
          })).filter((a: any) => a.name),
          institutions: (bib.author || [])
            .filter((a: any) => a.affiliation?.name)
            .map((a: any) => a.affiliation.name)
            .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
            .slice(0, 5),
          topics: (bib.subject || []).map((s: any) => s.term).filter(Boolean),
          jelCodes: [],
          citationCount: null,
          contentLength: abstractLen,
          hasFullText: !!anyLink?.url,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : "acceptable",
          journalTitle: bib.journal?.title || null,
          language: bib.journal?.language?.[0] || null,
          raw: r,
        };
      });

    console.log(`[DOAJ] ${papers.length}/${results.length} with abstracts`);
    return papers;
  } catch (error: any) {
    console.error(`[DOAJ] Search failed: ${error.message}`);
    return [];
  }
}
