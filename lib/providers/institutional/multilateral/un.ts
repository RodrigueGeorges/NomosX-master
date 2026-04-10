/**
 * UN - United Nations Research
 * Uses OpenAlex with UN ROR filter (reliable, no API key required)
 * ROR: https://ror.org/0304whf06
 */

import { searchOpenAlex } from '../../openalex';

export async function searchUN(query: string, limit = 15): Promise<any[]> {
  console.log(`[UN] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/0304whf06',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `un:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'un',
      issuer: 'United Nations',
      issuerType: 'multilateral',
    }));
    console.log(`[UN] Found ${mapped.length} documents`);
    return mapped;
  } catch (error: any) {
    console.error(`[UN] Search failed: ${error.message}`);
    return [];
  }
}
