/**
 * unep Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/054e0wg16
 */

import { searchOpenAlex } from '../openalex';

export async function searchUnep(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/054e0wg16'
  });
}

export default { searchUnep };
