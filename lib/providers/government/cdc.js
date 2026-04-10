/**
 * cdc Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/04w11tv37
 */

import { searchOpenAlex } from '../openalex';

export async function searchCdc(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/04w11tv37'
  });
}

export default { searchCdc };
