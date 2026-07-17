/**
 * NBER - National Bureau of Economic Research
 * Uses OpenAlex with NBER ROR filter
 * ROR: https://ror.org/05d5mza29
 */

import { searchByInstitution } from '../openalex-institution';

export async function searchNBER(query: string, limit = 15): Promise<any[]> {
  return searchByInstitution('National Bureau of Economic Research', query, 'nber', {
    limit,
    issuer: 'NBER',
    issuerType: 'economic',
  });
}
