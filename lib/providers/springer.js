/**
 * springer Provider - Academic Implementation
 * Source ID: https://openalex.org/S4306401296
 */

import { searchOpenAlex } from './openalex.js';

export async function searchSpringer(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4306401296'
  });
}

export default { searchSpringer };
