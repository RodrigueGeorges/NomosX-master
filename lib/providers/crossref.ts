
import { fetchFromProvider } from '../http-client';
import { env } from '../env';

function normalizeDOI(doi: string | null): string | null {
  if (!doi) return null;
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
}

export async function searchCrossref(query: string, rows = 10): Promise<any[]> {
  const base = env.CROSSREF_API;
  const url = `${base}?query=${encodeURIComponent(query)}&rows=${rows}`;
  
  try {
    const data: any = await fetchFromProvider("crossref", url, { timeout: 15000 });
    const items = data?.message?.items || [];
    
    return items.map((it: any) => ({
      id: `crossref:${it.DOI}`,
      provider: "crossref",
      type: "paper",
      title: Array.isArray(it.title) ? (it.title[0] || "") : (it.title || ""),
      abstract: it.abstract ? String(it.abstract).replace(/<[^>]+>/g, "") : null,
      year: it.published?.["date-parts"]?.[0]?.[0] ?? null,
      doi: normalizeDOI(it.DOI),
      url: it.URL ?? null,
      pdfUrl: null,
      oaStatus: null,
      authors: (it.author || []).map((a: any) => ({
        name: `${a.given || ""} ${a.family || ""}`.trim(),
        orcid: a.ORCID?.replace("http://orcid.org/", "").replace("https://orcid.org/", ""),
      })).filter((a: any) => a.name),
      institutions: (it.author || [])
        .flatMap((a: any) => (a.affiliation || []).map((aff: any) => ({ name: aff.name })))
        .filter((i: any) => i.name),
      topics: it.subject || [],
      jelCodes: [],
      citationCount: it["is-referenced-by-count"] ?? null,
      raw: it
    }));
  } catch (error: any) {
    console.error(`[Crossref] Search failed: ${error.message}`);
    return [];
  }
}
