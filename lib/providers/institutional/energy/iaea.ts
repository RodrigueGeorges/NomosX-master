/**
 * IAEA - International Atomic Energy Agency
 * Uses OpenAlex with IAEA ROR filter (reliable, no API key required)
 * ROR: https://ror.org/02zt1gg83
 */

import { searchOpenAlex } from '../../openalex';

export async function searchIAEA(query: string, limit = 15): Promise<any[]> {
  console.log(`[IAEA] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02zt1gg83',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `iaea:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'iaea',
      issuer: 'IAEA',
      issuerType: 'multilateral',
    }));
    console.log(`[IAEA] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[IAEA] Search failed: ${error.message}`);
    return [];
  }
}
