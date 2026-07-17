/**
 * EMA - European Medicines Agency
 * Uses OpenAlex with EMA ROR filter
 * ROR: https://ror.org/01z0wsw92
 */

import { searchOpenAlex } from '../../openalex';

export async function searchEMA(query: string, limit = 15): Promise<any[]> {
  console.log(`[EMA] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/01z0wsw92',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `ema:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'ema',
      issuer: 'EMA',
      issuerType: 'health',
    }));
    console.log(`[EMA] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[EMA] Search failed: ${error.message}`);
    return [];
  }
}
