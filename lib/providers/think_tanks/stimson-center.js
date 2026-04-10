/**
 * stimson-center Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/029wtm372
 */

import { searchOpenAlex } from '../openalex';

export async function searchStimsoncenter(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/029wtm372'
  });
}

export default { searchStimsoncenter };
