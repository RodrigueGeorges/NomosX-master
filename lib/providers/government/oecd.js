/**
 * oecd Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/0438wbg98
 */

import { searchOpenAlex } from '../openalex';

export async function searchOecd(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/0438wbg98'
  });
}

export default { searchOecd };
