/**
 * SIPRI - Stockholm International Peace Research Institute
 * Uses OpenAlex with SIPRI ROR filter
 * ROR: https://ror.org/05e8ym512
 */

import { searchOpenAlex } from '../../openalex';

export async function searchSIPRI(query: string, limit = 15): Promise<any[]> {
  console.log(`[SIPRI] Searching via OpenAlex ROR for: "${query}"`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/05e8ym512',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `sipri:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'sipri',
      issuer: 'SIPRI',
      issuerType: 'think-tank',
    }));
    if (mapped.length === 0) {
      const fallback = await searchOpenAlex(`${query} SIPRI arms control military expenditure`, limit, {});
      return fallback.map(r => ({
        ...r,
        id: `sipri:${r.id?.replace('https://openalex.org/', '') || ''}`,
        provider: 'sipri',
        issuer: 'SIPRI',
        issuerType: 'think-tank',
      }));
    }
    console.log(`[SIPRI] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[SIPRI] Search failed: ${error.message}`);
    return [];
  }
}
