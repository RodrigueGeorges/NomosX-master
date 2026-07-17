/**
 * SGDSN / French Defense & Security Research
 * Uses OpenAlex with French strategic research institute ROR filters:
 *   - IFRI (Institut français des relations internationales): 00ny8df12
 *   - Sciences Po Paris: 00mpxgs49
 */

import { searchOpenAlex } from '../../openalex';

export async function searchSGDSN(query: string, limit = 15): Promise<any[]> {
  console.log(`[SGDSN] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const [ifriResults, scipoResults] = await Promise.allSettled([
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/00ny8df12',
      }),
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/00mpxgs49',
      }),
    ]);

    const results = [
      ...(ifriResults.status === 'fulfilled' ? ifriResults.value : []),
      ...(scipoResults.status === 'fulfilled' ? scipoResults.value : []),
    ].slice(0, limit);

    const mapped = results.map(r => ({
      ...r,
      id: `sgdsn:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'sgdsn',
      issuer: 'IFRI/SciencesPo',
      issuerType: 'defense',
    }));
    console.log(`[SGDSN] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[SGDSN] Search failed: ${error.message}`);
    return [];
  }
}
