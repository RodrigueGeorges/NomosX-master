/**
 * Max Planck Society - German premier research organisation
 * Uses OpenAlex with Max Planck Society ROR filter
 * ROR: https://ror.org/01hhn8329
 */

import { searchOpenAlex } from '../../openalex';

export async function searchMaxPlanck(query: string, limit = 15): Promise<any[]> {
  console.log(`[MaxPlanck] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/01hhn8329',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `max-planck:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'max-planck',
      issuer: 'Max Planck Society',
      issuerType: 'academic',
    }));
    console.log(`[MaxPlanck] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[MaxPlanck] Search failed: ${error.message}`);
    return [];
  }
}
