/**
 * taylor-francis Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210130455
 */

import { searchOpenAlex } from './openalex.js';

export async function searchTaylorfrancis(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210130455'
  });
}

export default { searchTaylorfrancis };
