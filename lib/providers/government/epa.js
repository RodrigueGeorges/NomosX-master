/**
 * epa Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/04ay93s32
 */

import { searchOpenAlex } from '../openalex';

export async function searchEpa(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/04ay93s32'
  });
}

export default { searchEpa };
