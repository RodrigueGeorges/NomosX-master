/**
 * deloitte Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/049kt3f30
 */

import { searchOpenAlex } from '../openalex';

export async function searchDeloitte(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/049kt3f30'
  });
}

export default { searchDeloitte };
