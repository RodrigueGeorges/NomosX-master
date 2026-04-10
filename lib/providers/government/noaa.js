/**
 * noaa Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/02z5nhe81
 */

import { searchOpenAlex } from '../openalex';

export async function searchNoaa(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/02z5nhe81'
  });
}

export default { searchNoaa };
