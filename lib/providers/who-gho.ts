/**
 * WHO GHO Provider — World Health Organization Global Health Observatory
 * 2,000+ health indicators across 194 countries.
 * Uses the GHO OData API (public, no key required).
 * 
 * KEY VALUE: Authoritative global health data — mortality, disease burden,
 * health systems, risk factors. Gold standard for health policy research.
 * API docs: https://www.who.int/data/gho/info/gho-odata-api
 */

import { fetchFromProvider } from '../http-client';

export async function searchWHOGHO(query: string, limit = 20): Promise<any[]> {
  // Use OpenAlex with WHO ROR ID to find WHO-authored research
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=institutions.ror:https://ror.org/01f80g185&per_page=${Math.min(limit, 25)}&sort=cited_by_count:desc&select=id,title,abstract_inverted_index,authorships,publication_year,doi,cited_by_count,open_access,primary_location,type`;

  try {
    const data: any = await fetchFromProvider("who-gho", url, {
      timeout: 15000,
      headers: {
        Accept: "application/json",
        "User-Agent": "NomosX Research Agent/1.0 (mailto:contact@nomosx.com)",
      },
    });

    const results = data?.results || [];
    console.log(`[WHO-GHO] Found ${results.length} WHO publications`);

    return results
      .filter((p: any) => p.title)
      .map((p: any) => {
        // Reconstruct abstract from inverted index
        let abstract = "";
        if (p.abstract_inverted_index) {
          const words: Array<[string, number]> = [];
          for (const [word, positions] of Object.entries(p.abstract_inverted_index as Record<string, number[]>)) {
            for (const pos of positions) {
              words.push([word, pos]);
            }
          }
          words.sort((a, b) => a[1] - b[1]);
          abstract = words.map(w => w[0]).join(" ");
        }

        const authors = (p.authorships || []).slice(0, 10).map((a: any) => ({
          name: a.author?.display_name || "",
          institution: a.institutions?.[0]?.display_name || null,
          orcid: a.author?.orcid || null,
        })).filter((a: any) => a.name);

        const oaUrl = p.open_access?.oa_url || p.primary_location?.pdf_url || null;

        return {
          id: `who-gho:${p.id?.replace("https://openalex.org/", "") || ""}`,
          provider: "who-gho",
          type: "report",
          title: p.title || "",
          abstract: abstract || null,
          year: p.publication_year || null,
          doi: p.doi?.replace("https://doi.org/", "") || null,
          url: p.doi || p.id || "",
          pdfUrl: oaUrl,
          oaStatus: p.open_access?.is_oa ? "oa" : null,
          authors,
          institutions: ["World Health Organization"],
          citationCount: p.cited_by_count || 0,
          raw: p,
        };
      });
  } catch (error: any) {
    console.error(`[WHO-GHO] Search failed: ${error.message}`);
    return [];
  }
}
