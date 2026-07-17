/**
 * EDA - European Defence Agency / EU Defence Research
 * Uses OpenAlex with EU defence research ROR filters:
 *   - EUISS (EU Institute for Security Studies): 01bmvkm47
 *   - FOI (Swedish Defence Research Agency): 02mkv8r24
 */

import { searchOpenAlex } from '../../openalex';

export async function searchEDA(query: string, limit = 15): Promise<any[]> {
  console.log(`[EDA] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const [euissResults, foiResults] = await Promise.allSettled([
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/01bmvkm47',
      }),
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/02mkv8r24',
      }),
    ]);

    const results = [
      ...(euissResults.status === 'fulfilled' ? euissResults.value : []),
      ...(foiResults.status === 'fulfilled' ? foiResults.value : []),
    ].slice(0, limit);

    const mapped = results.map(r => ({
      ...r,
      id: `eda:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'eda',
      issuer: 'EDA/EUISS',
      issuerType: 'defense',
    }));
    console.log(`[EDA] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[EDA] Search failed: ${error.message}`);
    return [];
  }
}
