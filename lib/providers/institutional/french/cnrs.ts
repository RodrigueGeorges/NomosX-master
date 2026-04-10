/**
 * CNRS - Centre national de la recherche scientifique
 * Uses OpenAlex with CNRS ROR filter
 * ROR: https://ror.org/02feahw73
 */

import { searchOpenAlex } from '../../openalex';

export async function searchCNRS(query: string, limit = 15): Promise<any[]> {
  console.log(`[CNRS] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02feahw73',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `cnrs:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'cnrs',
      issuer: 'CNRS',
      issuerType: 'academic',
    }));
    console.log(`[CNRS] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[CNRS] Search failed: ${error.message}`);
    return [];
  }
}
