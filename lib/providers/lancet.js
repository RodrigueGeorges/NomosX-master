/**
 * lancet Provider - Academic Implementation
 * Source ID: https://openalex.org/S4210154350
 */

import { searchOpenAlex } from './openalex.js';

export async function searchLancet(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'primary_location.source.id:https://openalex.org/S4210154350'
  });
}

export default { searchLancet };
