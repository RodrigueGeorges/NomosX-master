/**
 * France Stratégie - French government think tank (PM office)
 * Uses OpenAlex enriched keyword search + Sciences Po proxy
 * France Stratégie has limited OpenAlex indexing, uses thematic enrichment
 */

import { searchOpenAlex } from '../../openalex';

export async function searchFranceStrategie(query: string, limit = 15): Promise<any[]> {
  console.log(`[FranceStratégie] Searching for: "${query}"`);
  try {
    const results = await searchOpenAlex(
      `${query} politique publique France stratégie prospective`,
      limit,
      { filter: 'authorships.institutions.ror:https://ror.org/00mpxgs49' } // Sciences Po proxy
    );
    const mapped = results.map(r => ({
      ...r,
      id: `france-strategie:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'france-strategie',
      issuer: 'France Stratégie',
      issuerType: 'think_tank',
    }));
    console.log(`[FranceStratégie] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[FranceStratégie] Search failed: ${error.message}`);
    return [];
  }
}
