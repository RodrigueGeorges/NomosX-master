/**
 * IMF - International Monetary Fund
 * Uses OpenAlex with IMF ROR filter (reliable, no API key required)
 * ROR: https://ror.org/02dy6h082
 */

import { searchByInstitution } from '../openalex-institution';

export async function searchIMF(query: string, limit = 15): Promise<any[]> {
  return searchByInstitution('International Monetary Fund', query, 'imf', {
    limit,
    issuer: 'IMF',
    issuerType: 'economic',
  });
}
