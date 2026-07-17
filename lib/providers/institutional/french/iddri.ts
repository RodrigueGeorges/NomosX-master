/**
 * IDDRI - Institut du développement durable et des relations internationales
 * Uses OpenAlex with IDDRI ROR filter
 * ROR: https://ror.org/02j05s068
 */

import { searchOpenAlex } from '../../openalex';

export async function searchIDDRI(query: string, limit = 15): Promise<any[]> {
  console.log(`[IDDRI] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02j05s068',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `iddri:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'iddri',
      issuer: 'IDDRI',
      issuerType: 'think-tank',
    }));
    if (mapped.length === 0) {
      const fallback = await searchOpenAlex(`${query} sustainable development international relations France`, limit, {});
      return fallback.map(r => ({
        ...r,
        id: `iddri:${r.id?.replace('https://openalex.org/', '') || ''}`,
        provider: 'iddri',
        issuer: 'IDDRI',
        issuerType: 'think-tank',
      }));
    }
    console.log(`[IDDRI] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[IDDRI] Search failed: ${error.message}`);
    return [];
  }
}
