/**
 * sage Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210105361
 */

import { searchOpenAlex } from './openalex.js';

export async function searchSage(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210105361'
  });
}

export default { searchSage };
