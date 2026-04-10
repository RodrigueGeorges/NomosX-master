
import { fetchFromProvider } from '../http-client';
import { invertedIndexToText } from '../text';
import { env } from '../env';

type Work = any;
type Resp = { results?: Work[] };

function normalizeDOI(doi: string | null): string | null {
  if (!doi) return null;
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
}

export async function searchOpenAlex(query: string, perPage = 25, options?: { filter?: string }): Promise<any[]> {
  const base = env.OPENALEX_API;
  let url = `${base}?search=${encodeURIComponent(query)}&per-page=${perPage}`;
  
  if (options?.filter) {
    url += `&filter=${encodeURIComponent(options.filter)}`;
  }
  
  try {
    const data = await fetchFromProvider<Resp>("openalex", url, { timeout: 15000 });
    
    return (data.results ?? []).map((w: any) => ({
      id: w.id,
      provider: "openalex",
      type: "paper",
      title: w.title || "",
      abstract: invertedIndexToText(w.abstract_inverted_index) || null,
      year: w.publication_year ?? null,
      doi: normalizeDOI(w.doi),
      url: w.primary_location?.landing_page_url ?? null,
      pdfUrl: w.primary_location?.pdf_url ?? null,
      oaStatus: w.open_access?.oa_status ?? (w.primary_location?.is_oa ? "oa" : null),
      authors: (w.authorships ?? []).map((a: any) => ({
        name: a.author?.display_name,
        orcid: a.author?.orcid?.replace("https://orcid.org/", ""),
      })).filter((a: any) => a.name),
      institutions: (w.authorships ?? []).flatMap((a: any) => 
        (a.institutions ?? []).map((i: any) => ({
          name: i.display_name,
          rorId: i.ror?.replace("https://ror.org/", ""),
        }))
      ).filter((i: any) => i.name),
      topics: (w.topics ?? []).map((t: any) => t.display_name).filter(Boolean),
      jelCodes: [],
      citationCount: w.cited_by_count ?? null,
      raw: w
    }));
  } catch (error: any) {
    console.error(`[OpenAlex] Search failed: ${error.message}`);
    return [];
  }
}
