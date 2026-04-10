/**
 * wilson-center Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/00whzh260
 */

import { searchOpenAlex } from '../openalex';

export async function searchWilsoncenter(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/00whzh260'
  });
}

export default { searchWilsoncenter };
