/**
 * IMF — Real SDMX API (primary) + OpenAlex fallback
 * Primary: IMF SDMX JSON service (dataservices.imf.org)
 * Fallback: OpenAlex with IMF ROR filter
 */

import { searchIMFSDMX } from '../v2/imf-sdmx';
import { searchByInstitution } from '../openalex-institution';

export async function searchIMF(query: string, limit = 15): Promise<any[]> {
  // Try real IMF SDMX API first
  const apiResults = await searchIMFSDMX(query, limit);
  if (apiResults.length > 0) {
    return apiResults;
  }
  // Fallback to OpenAlex
  return searchByInstitution('International Monetary Fund', query, 'imf', {
    limit,
    issuer: 'IMF',
    issuerType: 'economic',
  });
}
