/**
 * facebook-research Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/059zyyv27
 */

import { searchOpenAlex } from '../openalex';

export async function searchFacebookresearch(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/059zyyv27'
  });
}

export default { searchFacebookresearch };
