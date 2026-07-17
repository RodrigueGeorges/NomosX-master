/**
 * Mendeley Provider — Research publications via OpenAlex (no broken ROR filter)
 */
import { searchOpenAlex } from '../openalex';

export async function searchMendeley(query, limit = 100) {
  const results = await searchOpenAlex(query, limit, {});
  return results.map((r) => ({
    ...r,
    id: `mendeley:${String(r.id).replace('https://openalex.org/', '')}`,
    provider: 'mendeley',
    type: 'dataset',
  }));
}

export default { searchMendeley };
