/**
 * EIB - European Investment Bank
 * Uses OpenAlex with EIB ROR filter
 * ROR: https://ror.org/03zxry661
 */

import { searchOpenAlex } from '../../openalex';

export async function searchEIB(query: string, limit = 15): Promise<any[]> {
  console.log(`[EIB] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/03zxry661',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `eib:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'eib',
      issuer: 'EIB',
      issuerType: 'economic',
    }));
    console.log(`[EIB] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[EIB] Search failed: ${error.message}`);
    return [];
  }
}
