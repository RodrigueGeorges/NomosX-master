/**
 * ResearchGate Provider — Research publications via OpenAlex (no broken ROR filter)
 */
import { searchOpenAlex } from '../openalex';

export async function searchResearchgate(query, limit = 100) {
  const results = await searchOpenAlex(query, limit, {});
  return results.map((r) => ({
    ...r,
    id: `researchgate:${String(r.id).replace('https://openalex.org/', '')}`,
    provider: 'researchgate',
    type: 'paper',
  }));
}

export default { searchResearchgate };
