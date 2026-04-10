/**
 * cfr Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/05s96xm34
 */

import { searchOpenAlex } from '../openalex';

export async function searchCfr(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/05s96xm34'
  });
}

export default { searchCfr };
