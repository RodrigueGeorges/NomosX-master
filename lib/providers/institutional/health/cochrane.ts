/**
 * Cochrane - Cochrane Library (systematic reviews)
 * Uses OpenAlex with Cochrane Collaboration ROR filter
 * ROR: https://ror.org/00dbkrq51
 */

import { searchOpenAlex } from '../../openalex';

export async function searchCochrane(query: string, limit = 15): Promise<any[]> {
  console.log(`[Cochrane] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/00dbkrq51',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `cochrane:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'cochrane',
      issuer: 'Cochrane',
      issuerType: 'health',
    }));
    console.log(`[Cochrane] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[Cochrane] Search failed: ${error.message}`);
    return [];
  }
}
