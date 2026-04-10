/**
 * World Bank Open Knowledge Repository
 * Uses OpenAlex with World Bank ROR filter (reliable, no API key required)
 * ROR: https://ror.org/00gm7vv14
 */

import { searchOpenAlex } from '../../openalex';

export async function searchWorldBank(query: string, limit = 15): Promise<any[]> {
  console.log(`[WorldBank] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/00gm7vv14',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `worldbank:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'worldbank',
      issuer: 'World Bank',
      issuerType: 'economic',
    }));
    console.log(`[WorldBank] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[WorldBank] Search failed: ${error.message}`);
    return [];
  }
}
