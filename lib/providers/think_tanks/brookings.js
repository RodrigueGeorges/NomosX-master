/**
 * brookings Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/04aj4sh46
 */

import { searchOpenAlex } from '../openalex';

export async function searchBrookings(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/04aj4sh46'
  });
}

export default { searchBrookings };
