/**
 * microsoft-research Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/02w7f3w92
 */

import { searchOpenAlex } from '../openalex';

export async function searchMicrosoftresearch(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/02w7f3w92'
  });
}

export default { searchMicrosoftresearch };
