/**
 * World Bank — Real API (primary) + OpenAlex fallback
 * Primary: World Bank official API (search.worldbank.org/api/v2/wds)
 * Fallback: OpenAlex with World Bank ROR filter
 */

import { searchWorldBankAPI } from '../stable/worldbank-api';
import { searchByInstitution } from '../openalex-institution';

export async function searchWorldBank(query: string, limit = 15): Promise<any[]> {
  // Try real API first
  const apiResults = await searchWorldBankAPI(query, limit);
  if (apiResults.length > 0) {
    return apiResults;
  }
  // Fallback to OpenAlex
  return searchByInstitution('World Bank', query, 'worldbank', {
    limit,
    issuer: 'World Bank',
    issuerType: 'economic',
  });
}
