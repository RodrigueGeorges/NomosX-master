/**
 * accenture Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/00v8f0m76
 */

import { searchOpenAlex } from '../openalex.js';

export async function searchAccenture(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/00v8f0m76'
  });
}

export default { searchAccenture };
