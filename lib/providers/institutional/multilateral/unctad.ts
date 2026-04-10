/**
 * UNCTAD - United Nations Conference on Trade and Development
 * Uses OpenAlex with UNCTAD ROR filter (reliable, no API key required)
 * ROR: https://ror.org/02szg9b20
 */

import { searchOpenAlex } from '../../openalex';

export async function searchUNCTAD(query: string, limit = 15): Promise<any[]> {
  console.log(`[UNCTAD] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02szg9b20',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `unctad:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'unctad',
      issuer: 'UNCTAD',
      issuerType: 'multilateral',
    }));
    console.log(`[UNCTAD] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[UNCTAD] Search failed: ${error.message}`);
    return [];
  }
}
