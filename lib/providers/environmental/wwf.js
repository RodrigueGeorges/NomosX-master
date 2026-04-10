/**
 * wwf Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/00ppaw753
 */

import { searchOpenAlex } from '../openalex';

export async function searchWwf(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/00ppaw753'
  });
}

export default { searchWwf };
