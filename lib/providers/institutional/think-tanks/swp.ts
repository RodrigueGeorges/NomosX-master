/**
 * SWP - Stiftung Wissenschaft und Politik (German Institute for International and Security Affairs)
 * Uses OpenAlex with SWP ROR filter
 * ROR: https://ror.org/03b6thg82
 */

import { searchOpenAlex } from '../../openalex';

export async function searchSWP(query: string, limit = 15): Promise<any[]> {
  console.log(`[SWP] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/03b6thg82',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `swp:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'swp',
      issuer: 'SWP',
      issuerType: 'think-tank',
    }));
    if (mapped.length === 0) {
      const fallback = await searchOpenAlex(`${query} Stiftung Wissenschaft Politik security`, limit, {});
      return fallback.map(r => ({
        ...r,
        id: `swp:${r.id?.replace('https://openalex.org/', '') || ''}`,
        provider: 'swp',
        issuer: 'SWP',
        issuerType: 'think-tank',
      }));
    }
    console.log(`[SWP] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[SWP] Search failed: ${error.message}`);
    return [];
  }
}
