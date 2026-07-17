/**
 * RePEc Provider — Research Papers in Economics
 * 4M+ working papers, journal articles, and books in economics.
 * Uses the IDEAS/RePEc search API.
 * 
 * KEY VALUE: THE #1 source for economics research worldwide.
 * Covers working papers from central banks, universities, and research institutes.
 * Free API via IDEAS search endpoint.
 */

import { searchOpenAlex } from './openalex';

/**
 * NOTE: The legacy IDEAS/RePEc `htsearch` endpoint is a public HTML search
 * interface, not a JSON API — it returns HTML and times out. RePEc working
 * papers are fully indexed in OpenAlex, so we route through OpenAlex filtered
 * by the Economics concept (C162324750) to get reliable economics results.
 */
export async function searchRePEc(query: string, limit = 20): Promise<any[]> {
  try {
    const results = await searchOpenAlex(query, Math.min(limit, 25), {
      filter: "concepts.id:C162324750", // Economics
    });

    console.log(`[RePEc] Found ${results.length} economics papers (via OpenAlex)`);

    return results.map((r: any) => ({
      ...r,
      id: `repec:${String(r.id).replace("https://openalex.org/", "")}`,
      provider: "repec",
      type: "working_paper",
    }));
  } catch (error: any) {
    console.error(`[RePEc] Search failed: ${error.message}`);
    return [];
  }
}
