/**
 * Europe PMC Provider — 40M+ biomedical & life sciences papers
 * European counterpart to PubMed with broader coverage (preprints, patents, guidelines).
 * API: https://europepmc.org/RestfulWebService
 * 
 * KEY VALUE: Broader than PubMed — includes preprints, WHO guidelines, patents.
 * Free API, no key required.
 */

import { fetchFromProvider } from '../http-client';

export async function searchEuropePMC(query: string, limit = 30): Promise<any[]> {
  const pageSize = Math.min(limit, 25);
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${pageSize}&resultType=core&sort=RELEVANCE`;

  try {
    const data: any = await fetchFromProvider("europepmc", url, { timeout: 15000 });
    const results = data?.resultList?.result || [];

    console.log(`[EuropePMC] Found ${results.length} papers`);

    const papers = results
      .filter((p: any) => p.title && p.abstractText && p.abstractText.length >= 150)
      .map((p: any) => {
        const abstractLen = p.abstractText?.length || 0;
        return {
          id: `europepmc:${p.pmid || p.id}`,
          provider: "europepmc",
          type: p.pubType || "paper",
          title: p.title || "",
          abstract: p.abstractText || null,
          year: p.pubYear ? parseInt(p.pubYear) : null,
          doi: p.doi || null,
          url: p.doi ? `https://doi.org/${p.doi}` : `https://europepmc.org/article/${p.source}/${p.id}`,
          pdfUrl: p.fullTextUrlList?.fullTextUrl?.find((u: any) => u.documentStyle === "pdf")?.url || null,
          oaStatus: p.isOpenAccess === "Y" ? "oa" : null,
          authors: (p.authorList?.author || []).map((a: any) => ({
            name: a.fullName || `${a.firstName || ""} ${a.lastName || ""}`.trim(),
            orcid: a.authorId?.type === "ORCID" ? a.authorId.value : null,
          })).filter((a: any) => a.name),
          institutions: (p.authorList?.author || [])
            .filter((a: any) => a.affiliation)
            .map((a: any) => a.affiliation)
            .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)
            .slice(0, 5),
          topics: p.meshHeadingList?.meshHeading?.map((m: any) => m.descriptorName) || [],
          jelCodes: [],
          citationCount: p.citedByCount ?? null,
          contentLength: abstractLen,
          hasFullText: p.hasTextMinedTerms === "Y" || !!p.fullTextUrlList,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : "acceptable",
          journalTitle: p.journalTitle || null,
          raw: p,
        };
      });

    console.log(`[EuropePMC] ${papers.length}/${results.length} with rich abstracts`);
    return papers;
  } catch (error: any) {
    console.error(`[EuropePMC] Search failed: ${error.message}`);
    return [];
  }
}
