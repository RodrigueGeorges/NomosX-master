/**
 * nasa Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/027ka1x80
 */

import { searchOpenAlex } from '../openalex';

export async function searchNasa(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/027ka1x80'
  });
}

export default { searchNasa };
