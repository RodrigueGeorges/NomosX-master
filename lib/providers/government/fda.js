/**
 * fda Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/04pwevm04
 */

import { searchOpenAlex } from '../openalex';

export async function searchFda(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/04pwevm04'
  });
}

export default { searchFda };
