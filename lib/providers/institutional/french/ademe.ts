/**
 * ADEME - Agence de la transition écologique (France)
 * Uses OpenAlex with ADEME ROR filter
 * ROR: https://ror.org/04f7e0t38
 */

import { searchOpenAlex } from '../../openalex';

export async function searchADEME(query: string, limit = 15): Promise<any[]> {
  console.log(`[ADEME] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/04f7e0t38',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `ademe:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'ademe',
      issuer: 'ADEME',
      issuerType: 'environment',
    }));
    console.log(`[ADEME] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[ADEME] Search failed: ${error.message}`);
    return [];
  }
}
