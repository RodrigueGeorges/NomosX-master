/**
 * goldman-sachs Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/031rnv444
 */

import { searchOpenAlex } from '../openalex';

export async function searchGoldmansachs(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/031rnv444'
  });
}

export default { searchGoldmansachs };
