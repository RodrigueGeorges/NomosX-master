/**
 * chatham-house Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/034vnkd20
 */

import { searchOpenAlex } from '../openalex';

export async function searchChathamhouse(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/034vnkd20'
  });
}

export default { searchChathamhouse };
