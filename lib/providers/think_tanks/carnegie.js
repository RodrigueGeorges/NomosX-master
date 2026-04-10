/**
 * carnegie Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/022hhet17
 */

import { searchOpenAlex } from '../openalex';

export async function searchCarnegie(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/022hhet17'
  });
}

export default { searchCarnegie };
