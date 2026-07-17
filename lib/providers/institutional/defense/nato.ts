/**
 * NATO / Defense Research
 * Uses OpenAlex with dual ROR filter:
 *   - NATO ROR: https://ror.org/05xagc088
 *   - RAND Corporation ROR: https://ror.org/00f2z7n96 (leading defense research institution)
 */

import { searchOpenAlex } from '../../openalex';

export async function searchNATO(query: string, limit = 15): Promise<any[]> {
  console.log(`[NATO] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const [natoResults, randResults] = await Promise.allSettled([
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/05xagc088',
      }),
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/00f2z7n96',
      }),
    ]);

    const results = [
      ...(natoResults.status === 'fulfilled' ? natoResults.value : []),
      ...(randResults.status === 'fulfilled' ? randResults.value : []),
    ].slice(0, limit);

    const mapped = results.map(r => ({
      ...r,
      id: `nato:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'nato',
      issuer: 'NATO/RAND',
      issuerType: 'defense',
    }));
    console.log(`[NATO] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[NATO] Search failed: ${error.message}`);
    return [];
  }
}
