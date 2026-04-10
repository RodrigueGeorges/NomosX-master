/**
 * NIH - National Institutes of Health (Enriched)
 * Combines OpenAlex NIH ROR filter with PubMed Central full-text search
 * ROR: https://ror.org/01cwqze88
 */

import { searchOpenAlex } from '../../openalex';
import { searchPubMed } from '../../pubmed';

export async function searchNIH(query: string, limit = 15): Promise<any[]> {
  console.log(`[NIH] Enriched search for: "${query}"`);
  try {
    const [openAlexResults, pubmedResults] = await Promise.allSettled([
      searchOpenAlex(query, Math.ceil(limit * 0.6), {
        filter: 'authorships.institutions.ror:https://ror.org/01cwqze88',
      }),
      searchPubMed(query, Math.ceil(limit * 0.6)),
    ]);

    const oaItems = openAlexResults.status === 'fulfilled' ? openAlexResults.value : [];
    const pmItems = pubmedResults.status === 'fulfilled' ? pubmedResults.value : [];

    const seenIds = new Set<string>();
    const combined: any[] = [];

    for (const r of oaItems) {
      const id = `nih:${r.id?.replace('https://openalex.org/', '') || ''}`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combined.push({ ...r, id, provider: 'nih', issuer: 'NIH', issuerType: 'health' });
      }
    }

    for (const r of pmItems) {
      const id = `nih:pubmed:${r.id || ''}`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combined.push({ ...r, id, provider: 'nih', issuer: 'NIH/PubMed', issuerType: 'health' });
      }
    }

    const result = combined.slice(0, limit);
    console.log(`[NIH] Found ${result.length} publications (OA: ${oaItems.length}, PubMed: ${pmItems.length})`);
    return result;
  } catch (error: any) {
    console.error(`[NIH] Search failed: ${error.message}`);
    return [];
  }
}
