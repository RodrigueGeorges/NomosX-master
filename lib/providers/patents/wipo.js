/**
 * WIPO Provider — World Intellectual Property Office publications via OpenAlex
 */
import { searchOpenAlex } from '../openalex';

export async function searchWipo(query, limit = 100) {
  const results = await searchOpenAlex(query, limit, {});
  return results.map((r) => ({
    ...r,
    id: `wipo:${String(r.id).replace('https://openalex.org/', '')}`,
    provider: 'wipo',
    type: 'patent',
  }));
}

export default { searchWipo };
