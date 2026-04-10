/**
 * UNDP - United Nations Development Programme
 * Uses OpenAlex with UNDP ROR filter (reliable, no API key required)
 * ROR: https://ror.org/01bhm6w13
 */

import { searchOpenAlex } from '../../openalex';

export async function searchUNDP(query: string, limit = 15): Promise<any[]> {
  console.log(`[UNDP] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/01bhm6w13',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `undp:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'undp',
      issuer: 'UNDP',
      issuerType: 'multilateral',
    }));
    console.log(`[UNDP] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[UNDP] Search failed: ${error.message}`);
    return [];
  }
}
