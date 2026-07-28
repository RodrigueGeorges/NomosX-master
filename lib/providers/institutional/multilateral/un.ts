/**
 * UN — Real Digital Library API (primary) + OpenAlex fallback
 * Primary: UN ODS API (documents.un.org/api/search)
 * Fallback: OpenAlex with UN ROR filter
 */

import { searchUNDigitalLibrary } from '../v2/un-digital-library';
import { searchOpenAlex } from '../../openalex';

export async function searchUN(query: string, limit = 15): Promise<any[]> {
  // Try real UN API first
  const apiResults = await searchUNDigitalLibrary(query, limit);
  if (apiResults.length > 0) {
    return apiResults;
  }
  // Fallback to OpenAlex
  console.log(`[UN] API returned 0 results, falling back to OpenAlex ROR`);
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/006kxhp52',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `un:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'un',
      issuer: 'United Nations',
      issuerType: 'multilateral',
    }));
    console.log(`[UN] OpenAlex fallback found ${mapped.length} documents`);
    return mapped;
  } catch (error: any) {
    console.error(`[UN] Search failed: ${error.message}`);
    return [];
  }
}
