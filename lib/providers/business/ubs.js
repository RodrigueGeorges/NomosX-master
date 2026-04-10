/**
 * ubs Provider - OpenAlex Implementation
 * ROR ID: https://ror.org/0410qm569
 */

import { searchOpenAlex } from '../openalex';

export async function searchUbs(query, limit = 100) {
  return searchOpenAlex(query, limit, {
    filter: 'authorships.institutions.ror:https://ror.org/0410qm569'
  });
}

export default { searchUbs };
