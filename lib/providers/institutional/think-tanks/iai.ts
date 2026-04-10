/**
 * IAI - Istituto Affari Internazionali (Italian Institute for International Affairs)
 * Uses OpenAlex with IAI ROR filter
 * ROR: https://ror.org/03fcxyy92
 */

import { searchOpenAlex } from '../../openalex';

export async function searchIAI(query: string, limit = 15): Promise<any[]> {
  console.log(`[IAI] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/03fcxyy92',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `iai:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'iai',
      issuer: 'IAI',
      issuerType: 'think-tank',
    }));
    if (mapped.length === 0) {
      const fallback = await searchOpenAlex(`${query} Istituto Affari Internazionali European security`, limit, {});
      return fallback.map(r => ({
        ...r,
        id: `iai:${r.id?.replace('https://openalex.org/', '') || ''}`,
        provider: 'iai',
        issuer: 'IAI',
        issuerType: 'think-tank',
      }));
    }
    console.log(`[IAI] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[IAI] Search failed: ${error.message}`);
    return [];
  }
}
