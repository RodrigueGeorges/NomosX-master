/**
 * IRENA - International Renewable Energy Agency
 * Uses OpenAlex with IRENA ROR filter
 * ROR: https://ror.org/01dej0523
 */

import { searchOpenAlex } from '../../openalex';

export async function searchIRENA(query: string, limit = 15): Promise<any[]> {
  console.log(`[IRENA] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/01dej0523',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `irena:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'irena',
      issuer: 'IRENA',
      issuerType: 'energy',
    }));
    console.log(`[IRENA] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[IRENA] Search failed: ${error.message}`);
    return [];
  }
}
