/**
 * rand Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/00f2z7n96
 */

import { searchOpenAlex } from '../openalex';

export async function searchRand(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/00f2z7n96'
  });
}

export default { searchRand };
