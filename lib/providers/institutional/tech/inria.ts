/**
 * INRIA - Institut national de recherche en sciences et technologies du numérique
 * Uses OpenAlex with INRIA ROR filter
 * ROR: https://ror.org/02kvxyf05
 */

import { searchOpenAlex } from '../../openalex';

export async function searchINRIA(query: string, limit = 15): Promise<any[]> {
  console.log(`[INRIA] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02kvxyf05',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `inria:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'inria',
      issuer: 'INRIA',
      issuerType: 'technology',
    }));
    console.log(`[INRIA] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[INRIA] Search failed: ${error.message}`);
    return [];
  }
}
