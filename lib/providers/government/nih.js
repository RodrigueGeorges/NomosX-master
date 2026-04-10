/**
 * nih Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/05h1kgg64
 */

import { searchOpenAlex } from '../openalex';

export async function searchNih(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/05h1kgg64'
  });
}

export default { searchNih };
