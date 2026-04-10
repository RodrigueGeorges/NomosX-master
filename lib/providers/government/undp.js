/**
 * undp Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/051777d98
 */

import { searchOpenAlex } from '../openalex';

export async function searchUndp(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/051777d98'
  });
}

export default { searchUndp };
