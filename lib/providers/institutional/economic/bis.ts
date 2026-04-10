/**
 * BIS - Bank for International Settlements
 * Uses OpenAlex with BIS ROR filter (reliable, no API key required)
 * ROR: https://ror.org/00dp1x996
 */

import { searchOpenAlex } from '../../openalex';

export async function searchBIS(query: string, limit = 15): Promise<any[]> {
  console.log(`[BIS] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/00dp1x996',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `bis:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'bis',
      issuer: 'BIS',
      issuerType: 'economic',
    }));
    console.log(`[BIS] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[BIS] Search failed: ${error.message}`);
    return [];
  }
}
