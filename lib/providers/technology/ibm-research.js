/**
 * ibm-research Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/02js37d36
 */

import { searchOpenAlex } from '../openalex';

export async function searchIbmresearch(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/02js37d36'
  });
}

export default { searchIbmresearch };
