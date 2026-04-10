/**
 * deutsche-bank Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/037hta489
 */

import { searchOpenAlex } from '../openalex';

export async function searchDeutschebank(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/037hta489'
  });
}

export default { searchDeutschebank };
