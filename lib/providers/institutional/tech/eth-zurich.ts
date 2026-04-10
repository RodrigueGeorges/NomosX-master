/**
 * ETH Zurich - Swiss Federal Institute of Technology
 * Uses OpenAlex with ETH Zurich ROR filter
 * ROR: https://ror.org/05a28rw58
 */

import { searchOpenAlex } from '../../openalex';

export async function searchETHZurich(query: string, limit = 15): Promise<any[]> {
  console.log(`[ETHZurich] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/05a28rw58',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `eth-zurich:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'eth-zurich',
      issuer: 'ETH Zurich',
      issuerType: 'academic',
    }));
    console.log(`[ETHZurich] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[ETHZurich] Search failed: ${error.message}`);
    return [];
  }
}
