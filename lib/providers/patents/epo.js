/**
 * EPO Provider — European Patent Office publications via OpenAlex (concept-based, no broken ROR)
 */
import { searchOpenAlex } from '../openalex';

export async function searchEpo(query, limit = 100) {
  const results = await searchOpenAlex(query, limit, {});
  return results.map((r) => ({
    ...r,
    id: `epo:${String(r.id).replace('https://openalex.org/', '')}`,
    provider: 'epo',
    type: 'patent',
  }));
}

export default { searchEpo };
