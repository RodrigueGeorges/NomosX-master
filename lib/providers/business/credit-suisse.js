/**
 * credit-suisse Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/05h634p83
 */

import { searchOpenAlex } from '../openalex';

export async function searchCreditsuisse(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/05h634p83'
  });
}

export default { searchCreditsuisse };
