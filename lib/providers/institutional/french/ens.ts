/**
 * ENS - Écoles Normales Supérieures (Paris, Lyon, PSL)
 * Uses OpenAlex with multi-ROR filter covering ENS Paris + ENS Lyon
 * ENS Paris ROR: 05a0dhs15 | ENS Lyon ROR: 04zmssz18
 */

import { searchOpenAlex } from '../../openalex';

export async function searchENS(query: string, limit = 15): Promise<any[]> {
  console.log(`[ENS] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const [parisResults, lyonResults] = await Promise.allSettled([
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/05a0dhs15',
      }),
      searchOpenAlex(query, Math.ceil(limit / 2), {
        filter: 'authorships.institutions.ror:https://ror.org/04zmssz18',
      }),
    ]);

    const results = [
      ...(parisResults.status === 'fulfilled' ? parisResults.value : []),
      ...(lyonResults.status === 'fulfilled' ? lyonResults.value : []),
    ].slice(0, limit);

    const mapped = results.map(r => ({
      ...r,
      id: `ens:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'ens',
      issuer: 'ENS',
      issuerType: 'academic',
    }));
    console.log(`[ENS] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[ENS] Search failed: ${error.message}`);
    return [];
  }
}
