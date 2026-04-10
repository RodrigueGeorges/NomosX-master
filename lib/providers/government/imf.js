/**
 * imf Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/05m4rmw09
 */

import { searchOpenAlex } from '../openalex';

export async function searchImf(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/05m4rmw09'
  });
}

export default { searchImf };
