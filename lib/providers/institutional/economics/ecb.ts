/**
 * ECB - European Central Bank
 * Uses OpenAlex with ECB ROR filter (reliable, no API key required)
 * ROR: https://ror.org/04bwf3862
 */

import { searchOpenAlex } from '../../openalex';

export async function searchECB(query: string, limit = 15): Promise<any[]> {
  console.log(`[ECB] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/04bwf3862',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `ecb:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'ecb',
      issuer: 'ECB',
      issuerType: 'economic',
    }));
    console.log(`[ECB] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[ECB] Search failed: ${error.message}`);
    return [];
  }
}
