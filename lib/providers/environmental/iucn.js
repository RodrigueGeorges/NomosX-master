/**
 * iucn Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/01szdrn56
 */

import { searchOpenAlex } from '../openalex';

export async function searchIucn(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/01szdrn56'
  });
}

export default { searchIucn };
