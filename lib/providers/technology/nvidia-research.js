/**
 * nvidia-research Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/03jdj4y14
 */

import { searchOpenAlex } from '../openalex';

export async function searchNvidiaresearch(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/03jdj4y14'
  });
}

export default { searchNvidiaresearch };
