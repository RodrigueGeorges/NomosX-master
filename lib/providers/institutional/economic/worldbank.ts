/**
 * World Bank Open Knowledge Repository
 * Uses OpenAlex with World Bank ROR filter (reliable, no API key required)
 * ROR: https://ror.org/00gm7vv14
 */

import { searchByInstitution } from '../openalex-institution';

export async function searchWorldBank(query: string, limit = 15): Promise<any[]> {
  return searchByInstitution('World Bank', query, 'worldbank', {
    limit,
    issuer: 'World Bank',
    issuerType: 'economic',
  });
}
