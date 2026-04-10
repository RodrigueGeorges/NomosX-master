/**
 * nsf Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/021nxhr62
 */

import { searchOpenAlex } from '../openalex';

export async function searchNsf(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/021nxhr62'
  });
}

export default { searchNsf };
