/**
 * Allen Institute for AI (AI2)
 * Uses OpenAlex with Allen AI ROR filter
 * ROR: https://ror.org/05w520734
 */

import { searchOpenAlex } from '../../openalex';

export async function searchAllenAI(query: string, limit = 15): Promise<any[]> {
  console.log(`[AllenAI] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/05w520734',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `allen-ai:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'allen-ai',
      issuer: 'Allen Institute for AI',
      issuerType: 'technology',
    }));
    console.log(`[AllenAI] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[AllenAI] Search failed: ${error.message}`);
    return [];
  }
}
