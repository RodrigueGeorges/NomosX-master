/**
 * morgan-stanley Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/03csd5507
 */

import { searchOpenAlex } from '../openalex';

export async function searchMorganstanley(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/03csd5507'
  });
}

export default { searchMorganstanley };
