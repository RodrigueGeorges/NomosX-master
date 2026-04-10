/**
 * NBER - National Bureau of Economic Research
 * Uses OpenAlex with NBER ROR filter
 * ROR: https://ror.org/05d5mza29
 */

import { searchOpenAlex } from '../../openalex';

export async function searchNBER(query: string, limit = 15): Promise<any[]> {
  console.log(`[NBER] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/05d5mza29',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `nber:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'nber',
      issuer: 'NBER',
      issuerType: 'economic',
    }));
    console.log(`[NBER] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[NBER] Search failed: ${error.message}`);
    return [];
  }
}
