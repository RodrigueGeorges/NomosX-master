/**
 * RePEc Provider — Research Papers in Economics
 * 4M+ working papers, journal articles, and books in economics.
 * Uses the IDEAS/RePEc search API.
 * 
 * KEY VALUE: THE #1 source for economics research worldwide.
 * Covers working papers from central banks, universities, and research institutes.
 * Free API via IDEAS search endpoint.
 */

import { fetchFromProvider } from '../http-client';

export async function searchRePEc(query: string, limit = 20): Promise<any[]> {
  // IDEAS/RePEc JSON search endpoint
  const url = `https://ideas.repec.org/cgi-bin/htsearch?q=${encodeURIComponent(query)}&cmd=Search%21&fmt=json&num=${Math.min(limit, 25)}`;

  try {
    const data: any = await fetchFromProvider("repec", url, {
      timeout: 15000,
      headers: {
        Accept: "application/json",
        "User-Agent": "NomosX Research Agent/1.0",
      },
    });
    const results = data?.results || data?.matches || [];

    console.log(`[RePEc] Found ${results.length} papers`);

    const papers = results
      .filter((p: any) => p.title)
      .map((p: any) => {
        const abstract = p.abstract || p.description || "";
        const abstractLen = abstract.length;
        const handle = p.handle || p.id || "";

        return {
          id: `repec:${handle}`,
          provider: "repec",
          type: p.type || "working_paper",
          title: p.title || "",
          abstract: abstract || null,
          year: p.year ? parseInt(String(p.year)) : null,
          doi: p.doi || null,
          url: p.url || (handle ? `https://ideas.repec.org/${handle}` : ""),
          pdfUrl: p.pdfUrl || p.fileUrl || null,
          oaStatus: p.pdfUrl || p.fileUrl ? "oa" : null,
          authors: (p.authors || []).map((a: any) => ({
            name: typeof a === "string" ? a : (a.name || a.fullName || ""),
            institution: typeof a === "object" ? (a.institution || a.affiliation || null) : null,
          })).filter((a: any) => a.name),
          institutions: (p.institutions || [])
            .map((inst: any) => typeof inst === "string" ? inst : inst.name)
            .filter(Boolean)
            .slice(0, 5),
          topics: p.keywords || p.jelDescriptions || [],
          jelCodes: p.jelCodes || [],
          citationCount: p.citationCount ?? null,
          contentLength: abstractLen,
          hasFullText: !!p.pdfUrl || !!p.fileUrl,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : abstractLen >= 200 ? "acceptable" : "minimal",
          series: p.series || null,
          raw: p,
        };
      });

    console.log(`[RePEc] ${papers.length}/${results.length} processed`);
    return papers;
  } catch (error: any) {
    console.error(`[RePEc] Search failed: ${error.message}`);
    return [];
  }
}
