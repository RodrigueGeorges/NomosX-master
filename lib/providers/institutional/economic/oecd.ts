/**
 * OECD - Organisation for Economic Co-operation and Development
 * Uses OpenAlex with OECD ROR filter (reliable, no API key required)
 * ROR: https://ror.org/05n14r570
 */

import { searchByInstitution } from '../openalex-institution';

export async function searchOECD(query: string, limit = 15): Promise<any[]> {
  return searchByInstitution(
    'Organisation for Economic Co-operation and Development',
    query,
    'oecd',
    { limit, issuer: 'OECD', issuerType: 'economic' }
  );
}
