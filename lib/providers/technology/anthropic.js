/**
 * anthropic Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/056y0v115
 */

import { searchOpenAlex } from '../openalex';

export async function searchAnthropic(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/056y0v115'
  });
}

export default { searchAnthropic };
