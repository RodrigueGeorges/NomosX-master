/**
 * adl Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/03mv07c21
 */

import { searchOpenAlex } from '../openalex';

export async function searchAdl(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/03mv07c21'
  });
}

export default { searchAdl };
