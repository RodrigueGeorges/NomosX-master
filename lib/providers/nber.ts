/**
 * NBER Provider — National Bureau of Economic Research
 * 30,000+ working papers from top economists.
 * Uses the NBER website search API (public, no key required).
 * 
 * KEY VALUE: Pre-publication working papers from Nobel laureates and top economists.
 * Many seminal papers (Acemoglu, Banerjee, Duflo, Autor, etc.) appear here first.
 */

import { searchByInstitution } from './institutional/openalex-institution';

export async function searchNBER(query: string, limit = 20): Promise<any[]> {
  return searchByInstitution('National Bureau of Economic Research', query, 'nber', {
    limit,
    issuer: 'NBER',
    issuerType: 'economic',
  });
}
