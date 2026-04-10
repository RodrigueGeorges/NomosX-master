/**
 * jpmorgan Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/01x3kkr08
 */

import { searchOpenAlex } from '../openalex';

export async function searchJpmorgan(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/01x3kkr08'
  });
}

export default { searchJpmorgan };
