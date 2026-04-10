/**
 * new-america Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/008zvz098
 */

import { searchOpenAlex } from '../openalex';

export async function searchNewamerica(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/008zvz098'
  });
}

export default { searchNewamerica };
