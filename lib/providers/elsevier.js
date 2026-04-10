/**
 * elsevier Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210127759
 */

import { searchOpenAlex } from './openalex.js';

export async function searchElsevier(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210127759'
  });
}

export default { searchElsevier };
