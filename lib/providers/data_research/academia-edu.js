/**
 * Academia.edu Provider — Research publications via OpenAlex (no broken ROR filter)
 */
import { searchOpenAlex } from '../openalex';

export async function searchAcademiaedu(query, limit = 100) {
  const results = await searchOpenAlex(query, limit, {});
  return results.map((r) => ({
    ...r,
    id: `academia-edu:${String(r.id).replace('https://openalex.org/', '')}`,
    provider: 'academia-edu',
    type: 'paper',
  }));
}

export default { searchAcademiaedu };
