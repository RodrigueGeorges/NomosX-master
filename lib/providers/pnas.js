/**
 * pnas Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210168350
 */

import { searchOpenAlex } from './openalex.js';

export async function searchPnas(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210168350'
  });
}

export default { searchPnas };
