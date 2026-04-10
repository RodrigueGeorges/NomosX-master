/**
 * INRAE - Institut national de recherche pour l'agriculture, l'alimentation et l'environnement
 * Uses OpenAlex with INRAE ROR filter
 * ROR: https://ror.org/003vg9w96
 */

import { searchOpenAlex } from '../../openalex';

export async function searchINRAE(query: string, limit = 15): Promise<any[]> {
  console.log(`[INRAE] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/003vg9w96',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `inrae:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'inrae',
      issuer: 'INRAE',
      issuerType: 'environment',
    }));
    console.log(`[INRAE] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[INRAE] Search failed: ${error.message}`);
    return [];
  }
}
