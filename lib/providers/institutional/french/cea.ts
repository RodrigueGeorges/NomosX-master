/**
 * CEA - Commissariat à l'Énergie Atomique et aux Énergies Alternatives (France)
 * Uses OpenAlex with CEA ROR filter
 * ROR: https://ror.org/02s377d40
 */

import { searchOpenAlex } from '../../openalex';

export async function searchCEA(query: string, limit = 15): Promise<any[]> {
  console.log(`[CEA] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02s377d40',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `cea:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'cea',
      issuer: 'CEA',
      issuerType: 'energy',
    }));
    console.log(`[CEA] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[CEA] Search failed: ${error.message}`);
    return [];
  }
}
