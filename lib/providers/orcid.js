/**
 * orcid Provider - Academic Implementation

 */

import { searchOpenAlex } from '../openalex';

export async function searchOrcid(query, limit = 100) {
  return searchOpenAlex(query, limit);
}

export default { searchOrcid };
