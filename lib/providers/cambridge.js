/**
 * cambridge Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210147341
 */

import { searchOpenAlex } from './openalex.js';

export async function searchCambridge(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210147341'
  });
}

export default { searchCambridge };
