/**
 * openai-research Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/05wx9n238
 */

import { searchOpenAlex } from '../openalex';

export async function searchOpenairesearch(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/05wx9n238'
  });
}

export default { searchOpenairesearch };
