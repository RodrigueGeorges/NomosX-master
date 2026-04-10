/**
 * dataverse Provider - OpenAlex Implementation
 * ROR ID: undefined
 */

import { searchOpenAlex } from '../openalex';

export async function searchDataverse(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:undefined'
  });
}

export default { searchDataverse };
