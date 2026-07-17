/**
 * Dataverse Provider — Research datasets via OpenAlex (no broken ROR filter)
 */
import { searchOpenAlex } from '../openalex';

export async function searchDataverse(query, limit = 100) {
  const results = await searchOpenAlex(query, limit, {});
  return results.map((r) => ({
    ...r,
    id: `dataverse:${String(r.id).replace('https://openalex.org/', '')}`,
    provider: 'dataverse',
    type: 'dataset',
  }));
}

export default { searchDataverse };
