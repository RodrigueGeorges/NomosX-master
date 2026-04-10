/**
 * google-ai Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/00971b260
 */

import { searchOpenAlex } from '../openalex';

export async function searchGoogleai(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/00971b260'
  });
}

export default { searchGoogleai };
