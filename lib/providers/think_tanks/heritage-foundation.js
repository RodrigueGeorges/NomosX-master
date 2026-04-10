/**
 * heritage-foundation Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/02fz4s018
 */

import { searchOpenAlex } from '../openalex';

export async function searchHeritagefoundation(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/02fz4s018'
  });
}

export default { searchHeritagefoundation };
