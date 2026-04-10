/**
 * wri Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/047ktk903
 */

import { searchOpenAlex } from '../openalex';

export async function searchWri(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/047ktk903'
  });
}

export default { searchWri };
