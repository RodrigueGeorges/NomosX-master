/**
 * CORE Provider — 300M+ open access research papers
 * The world's largest aggregator of open access research.
 * Covers ALL disciplines: STEM, social sciences, humanities, law, arts.
 * API: https://core.ac.uk/documentation/api
 * 
 * KEY VALUE: Fills humanities/social science gap that PubMed/arXiv don't cover.
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

export async function searchCORE(query: string, limit = 30): Promise<any[]> {
  const apiKey = env.CORE_API_KEY;
  if (!apiKey) {
    console.warn('[CORE] No API key configured');
    return [];
  }
  
  const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&pageSize=${limit}&apiKey=${apiKey}`;
  
  try {
    const data: any = await fetchFromProvider("core", url, { timeout: 15000 });
    const results = data?.results || [];
    
    return results.map((item: any) => ({
      id: `core:${item.id}`,
      provider: "core",
      type: "academic",
      title: item.title,
      abstract: item.description || item.abstract,
      authors: item.authors?.map((author: any) => ({ name: author.name, institution: null })) || [],
      journal: item.journal?.title || "Unknown",
      year: item.yearPublished || null,
      doi: item.doi || null,
      url: item.downloadUrl || item.sourceUrl,
      trustScore: 0.7,
      raw: item
    }));
  } catch (error) {
    console.error('CORE search failed:', error);
    return [];
  }
}

// Legacy export for backward compatibility
export async function searchCore(query: string, limit = 30) {
  return searchCORE(query, limit);
}

export default { searchCORE, searchCore };
