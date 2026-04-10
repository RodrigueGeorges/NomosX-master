/**
 * CDC - Centers for Disease Control and Prevention
 * Uses OpenAlex with CDC ROR filter + CDC Public Health Reports API
 * ROR: https://ror.org/03bp5hc32
 */

import { searchOpenAlex } from '../../openalex';

export async function searchCDC(query: string, limit = 15): Promise<any[]> {
  console.log(`[CDC] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/03bp5hc32',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `cdc:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'cdc',
      issuer: 'CDC',
      issuerType: 'health',
    }));
    console.log(`[CDC] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[CDC] Search failed: ${error.message}`);
    return [];
  }
}
