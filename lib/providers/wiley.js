/**
 * wiley Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210128438
 */

import { searchOpenAlex } from './openalex.js';

export async function searchWiley(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210128438'
  });
}

export default { searchWiley };
