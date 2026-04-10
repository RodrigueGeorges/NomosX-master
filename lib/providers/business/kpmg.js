/**
 * kpmg Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/04cwh4511
 */

import { searchOpenAlex } from '../openalex';

export async function searchKpmg(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/04cwh4511'
  });
}

export default { searchKpmg };
