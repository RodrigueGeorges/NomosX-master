
import { fetchFromProvider } from '../http-client';
import { env } from '../env';

function normalizeDOI(doi: string): string {
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
}

export async function unpaywallByDoi(doi: string): Promise<{ pdfUrl?: string | null; oaStatus?: string | null; bestUrl?: string | null; raw?: any }> {
  const email = env.UNPAYWALL_EMAIL;
  if (!email) {
    return { pdfUrl: null, oaStatus: null, bestUrl: null, raw: null };
  }

  const cleanDOI = normalizeDOI(doi);
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDOI)}?email=${encodeURIComponent(email)}`;
  
  try {
    const data: any = await fetchFromProvider("unpaywall", url, { timeout: 10000, retries: 2 });
    const pdf = data?.best_oa_location?.url_for_pdf || data?.best_oa_location?.url || null;
    const best = data?.best_oa_location?.url || null;
    const status = data?.oa_status || (data?.is_oa ? "oa" : null);
    return { pdfUrl: pdf, oaStatus: status, bestUrl: best, raw: data };
  } catch (error: any) {
    console.error(`[Unpaywall] Lookup failed for ${cleanDOI}: ${error.message}`);
    return { pdfUrl: null, oaStatus: null, bestUrl: null, raw: null };
  }
}
