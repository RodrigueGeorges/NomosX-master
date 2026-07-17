/**
 * EEAS - European External Action Service / EU Security Research
 * Uses OpenAlex with EUISS ROR filter (EU Institute for Security Studies)
 * EUISS ROR: https://ror.org/01bmvkm47
 * EU Commission ROR: https://ror.org/00k4n6c32
 */

import { searchOpenAlex } from '../../openalex';

export async function searchEEAS(query: string, limit = 15): Promise<any[]> {
  console.log(`[EEAS] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const [euissResults, euResults] = await Promise.allSettled([
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/01bmvkm47',
      }),
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/00k4n6c32',
      }),
    ]);

    const results = [
      ...(euissResults.status === 'fulfilled' ? euissResults.value : []),
      ...(euResults.status === 'fulfilled' ? euResults.value : []),
    ].slice(0, limit);

    const mapped = results.map(r => ({
      ...r,
      id: `eeas:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'eeas',
      issuer: 'EEAS/EUISS',
      issuerType: 'defense',
    }));
    console.log(`[EEAS] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[EEAS] Search failed: ${error.message}`);
    return [];
  }
}
