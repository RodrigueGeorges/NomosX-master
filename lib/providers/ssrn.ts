/**
 * SSRN Provider — Social Science Research Network
 * 1M+ working papers in economics, law, finance, political science, management.
 * Uses the public search endpoint (no API key required).
 * 
 * KEY VALUE: #1 source for pre-publication economics, law, and finance research.
 * Many papers appear on SSRN months before journal publication.
 */

import { fetchFromProvider } from '../http-client';

export async function searchSSRN(query: string, limit = 20): Promise<any[]> {
  // SSRN doesn't have a public REST API — use their search page JSON endpoint
  const pageSize = Math.min(limit, 25);
  const url = `https://api.ssrn.com/content/v1/bindings/search?terms=${encodeURIComponent(query)}&start=0&count=${pageSize}&type=Papers&sort=Relevance`;

  try {
    const data: any = await fetchFromProvider("ssrn", url, {
      timeout: 15000,
      headers: {
        Accept: "application/json",
        "User-Agent": "NomosX Research Agent/1.0",
      },
    });
    const results = data?.papers || data?.results || [];

    console.log(`[SSRN] Found ${results.length} papers`);

    const papers = results
      .filter((p: any) => p.title && (p.abstract || p.description))
      .map((p: any) => {
        const abstract = p.abstract || p.description || "";
        const abstractLen = abstract.length;
        const ssrnId = p.id || p.abstractId || p.ssrnId;

        return {
          id: `ssrn:${ssrnId}`,
          provider: "ssrn",
          type: "working_paper",
          title: p.title || "",
          abstract: abstract || null,
          year: p.publicDate ? new Date(p.publicDate).getFullYear() : (p.year || null),
          doi: p.doi || null,
          url: `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${ssrnId}`,
          pdfUrl: p.pdfUrl || (ssrnId ? `https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=${ssrnId}` : null),
          oaStatus: "oa",
          authors: (p.authors || []).map((a: any) => ({
            name: a.name || a.fullName || "",
            institution: a.institution || a.affiliation || null,
          })).filter((a: any) => a.name),
          institutions: (p.authors || [])
            .filter((a: any) => a.institution || a.affiliation)
            .map((a: any) => a.institution || a.affiliation)
            .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
            .slice(0, 5),
          topics: p.keywords || p.jelCodes?.map((j: any) => j.description) || [],
          jelCodes: p.jelCodes?.map((j: any) => j.code) || [],
          citationCount: p.citationCount ?? p.totalCitations ?? null,
          downloadCount: p.downloadCount ?? p.totalDownloads ?? null,
          contentLength: abstractLen,
          hasFullText: !!p.pdfUrl || !!ssrnId,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : abstractLen >= 200 ? "acceptable" : "minimal",
          raw: p,
        };
      });

    console.log(`[SSRN] ${papers.length}/${results.length} with abstracts`);
    return papers;
  } catch (error: any) {
    console.error(`[SSRN] Search failed: ${error.message}`);
    return [];
  }
}
