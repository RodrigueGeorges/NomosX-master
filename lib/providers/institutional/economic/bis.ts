/**
 * BIS — Real RSS API (primary) + OpenAlex fallback
 * Primary: BIS RSS feed (www.bis.org/doclist/all.rss)
 * Fallback: OpenAlex with BIS ROR filter
 */

import { searchBIS as searchBISReal } from '../v2/bis-papers';
import { searchByInstitution } from '../openalex-institution';

export async function searchBIS(query: string, limit = 15): Promise<any[]> {
  // Try real BIS RSS first
  const apiResults = await searchBISReal(query, limit);
  if (apiResults.length > 0) {
    return apiResults;
  }
  // Fallback to OpenAlex
  return searchByInstitution('Bank for International Settlements', query, 'bis', {
    limit,
    issuer: 'BIS',
    issuerType: 'economic',
  });
}
