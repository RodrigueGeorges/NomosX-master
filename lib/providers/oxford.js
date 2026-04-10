/**
 * oxford Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210144750
 */

import { searchOpenAlex } from './openalex.js';

export async function searchOxford(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210144750'
  });
}

export default { searchOxford };
