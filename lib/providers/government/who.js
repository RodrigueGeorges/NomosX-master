/**
 * who Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/01f80g185
 */

import { searchOpenAlex } from '../openalex';

export async function searchWho(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/01f80g185'
  });
}

export default { searchWho };
