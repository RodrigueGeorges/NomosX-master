/**
 * ENISA - European Union Agency for Cybersecurity
 * Uses OpenAlex with ENISA ROR filter (reliable, no API key required)
 * ROR: https://ror.org/00wqx6897
 */

import { searchOpenAlex } from '../../openalex';

export async function searchENISA(query: string, limit = 15): Promise<any[]> {
  console.log(`[ENISA] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/00wqx6897',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `enisa:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'enisa',
      issuer: 'ENISA',
      issuerType: 'cyber',
    }));
    console.log(`[ENISA] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[ENISA] Search failed: ${error.message}`);
    return [];
  }
}
