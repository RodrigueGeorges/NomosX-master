/**
 * ipcc Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/029qjm428
 */

import { searchOpenAlex } from '../openalex';

export async function searchIpcc(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/029qjm428'
  });
}

export default { searchIpcc };
