/**
 * ECFR - European Council on Foreign Relations
 * Uses OpenAlex with ECFR ROR filter
 * ROR: https://ror.org/03q12x978
 */

import { searchOpenAlex } from '../../openalex';

export async function searchECFR(query: string, limit = 15): Promise<any[]> {
  console.log(`[ECFR] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/03q12x978',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `ecfr:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'ecfr',
      issuer: 'ECFR',
      issuerType: 'think-tank',
    }));
    if (mapped.length === 0) {
      const fallback = await searchOpenAlex(`${query} European Council Foreign Relations`, limit, {});
      return fallback.map(r => ({
        ...r,
        id: `ecfr:${r.id?.replace('https://openalex.org/', '') || ''}`,
        provider: 'ecfr',
        issuer: 'ECFR',
        issuerType: 'think-tank',
      }));
    }
    console.log(`[ECFR] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[ECFR] Search failed: ${error.message}`);
    return [];
  }
}
