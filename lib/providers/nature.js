/**
 * nature Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210124757
 */

import { searchOpenAlex } from './openalex.js';

export async function searchNature(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210124757'
  });
}

export default { searchNature };
