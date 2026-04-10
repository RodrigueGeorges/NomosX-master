/**
 * cell Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210126426
 */

import { searchOpenAlex } from './openalex.js';

export async function searchCell(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210126426'
  });
}

export default { searchCell };
