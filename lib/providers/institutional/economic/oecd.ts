/**
 * OECD - Organisation for Economic Co-operation and Development
 * Uses OpenAlex with OECD ROR filter (reliable, no API key required)
 * ROR: https://ror.org/05n14r570
 */

import { searchOpenAlex } from '../../openalex';

export async function searchOECD(query: string, limit = 15): Promise<any[]> {
  console.log(`[OECD] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/05n14r570',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `oecd:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'oecd',
      issuer: 'OECD',
      issuerType: 'economic',
    }));
    console.log(`[OECD] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[OECD] Search failed: ${error.message}`);
    return [];
  }
}
