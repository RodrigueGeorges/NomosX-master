/**
 * iiss Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/03jzczt57
 */

import { searchOpenAlex } from '../openalex';

export async function searchIiss(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/03jzczt57'
  });
}

export default { searchIiss };
