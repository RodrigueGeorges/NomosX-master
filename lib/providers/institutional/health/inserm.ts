/**
 * INSERM - Institut national de la santé et de la recherche médicale (France)
 * Uses OpenAlex with INSERM ROR filter
 * ROR: https://ror.org/02vjkv261
 */

import { searchOpenAlex } from '../../openalex';

export async function searchINSERM(query: string, limit = 15): Promise<any[]> {
  console.log(`[INSERM] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02vjkv261',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `inserm:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'inserm',
      issuer: 'INSERM',
      issuerType: 'health',
    }));
    console.log(`[INSERM] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[INSERM] Search failed: ${error.message}`);
    return [];
  }
}
