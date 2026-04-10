/**
 * worldbank Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/00ae7jd04
 */

import { searchOpenAlex } from '../openalex';

export async function searchWorldbank(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/00ae7jd04'
  });
}

export default { searchWorldbank };
