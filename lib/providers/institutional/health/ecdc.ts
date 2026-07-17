/**
 * ECDC - European Centre for Disease Prevention and Control
 * Uses OpenAlex with ECDC ROR filter
 * ROR: https://ror.org/00s9v1h75
 */

import { searchOpenAlex } from '../../openalex';

export async function searchECDC(query: string, limit = 15): Promise<any[]> {
  console.log(`[ECDC] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/00s9v1h75',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `ecdc:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'ecdc',
      issuer: 'ECDC',
      issuerType: 'health',
    }));
    console.log(`[ECDC] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[ECDC] Search failed: ${error.message}`);
    return [];
  }
}
