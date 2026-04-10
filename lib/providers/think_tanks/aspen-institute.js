/**
 * aspen-institute Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/0174e3t82
 */

import { searchOpenAlex } from '../openalex';

export async function searchAspeninstitute(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/0174e3t82'
  });
}

// Legacy export for backward compatibility
export async function searchAspen(query, limit = 100) {
  return searchAspeninstitute(query, limit);
}

export default { searchAspeninstitute, searchAspen };
