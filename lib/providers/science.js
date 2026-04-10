/**
 * science Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210194065
 */

import { searchOpenAlex } from './openalex.js';

export async function searchScience(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210194065'
  });
}

export default { searchScience };
