/**
 * BIS - Bank for International Settlements
 * Uses OpenAlex with BIS ROR filter (reliable, no API key required)
 * ROR: https://ror.org/00dp1x996
 */

import { searchByInstitution } from '../openalex-institution';

export async function searchBIS(query: string, limit = 15): Promise<any[]> {
  return searchByInstitution('Bank for International Settlements', query, 'bis', {
    limit,
    issuer: 'BIS',
    issuerType: 'economic',
  });
}
