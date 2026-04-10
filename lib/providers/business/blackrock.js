/**
 * blackrock Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/02rm2we09
 */

import { searchOpenAlex } from '../openalex.js';

export async function searchBlackrock(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/02rm2we09'
  });
}

export default { searchBlackrock };
