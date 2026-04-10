/**
 * cato-institute Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/04kfydn45
 */

import { searchOpenAlex } from '../openalex';

export async function searchCatoinstitute(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/04kfydn45'
  });
}

// Legacy export for backward compatibility
export async function searchCato(query, limit = 100) {
  return searchCatoinstitute(query, limit);
}

export default { searchCatoinstitute, searchCato };
