/**
 * IMF - International Monetary Fund
 * Uses OpenAlex with IMF ROR filter (reliable, no API key required)
 * ROR: https://ror.org/02dy6h082
 */

import { searchOpenAlex } from '../../openalex';

export async function searchIMF(query: string, limit = 15): Promise<any[]> {
  console.log(`[IMF] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02dy6h082',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `imf:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'imf',
      issuer: 'IMF',
      issuerType: 'economic',
    }));
    console.log(`[IMF] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[IMF] Search failed: ${error.message}`);
    return [];
  }
}
