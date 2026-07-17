/**
 * ECB - European Central Bank
 * Uses OpenAlex with ECB ROR filter (reliable, no API key required)
 * ROR: https://ror.org/04bwf3862
 */

import { searchByInstitution } from '../openalex-institution';

export async function searchECB(query: string, limit = 15): Promise<any[]> {
  return searchByInstitution('European Central Bank', query, 'ecb', {
    limit,
    issuer: 'ECB',
    issuerType: 'economic',
  });
}
