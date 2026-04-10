/**
 * greenpeace Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/00r6a4r84
 */

import { searchOpenAlex } from '../openalex';

export async function searchGreenpeace(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/00r6a4r84'
  });
}

export default { searchGreenpeace };
