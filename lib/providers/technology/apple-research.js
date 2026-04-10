/**
 * apple-research Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/059hsda18
 */

import { searchOpenAlex } from '../openalex';

export async function searchAppleresearch(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/059hsda18'
  });
}

export default { searchAppleresearch };
