/**
 * iea Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/020frhs78
 */

import { searchOpenAlex } from '../openalex';

export async function searchIea(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/020frhs78'
  });
}

export default { searchIea };
