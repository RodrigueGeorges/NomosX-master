/**
 * WHO Direct API - World Health Organization
 * Uses WHO IRIS repository API (institutional repository, no key required)
 * Also queries OpenAlex with WHO ROR for peer-reviewed outputs
 * ROR: https://ror.org/01f80g185
 */

import { searchOpenAlex } from '../../openalex';
import { fetchFromProvider } from '../../../http-client';

export async function searchWHODirect(query: string, limit = 15): Promise<any[]> {
  console.log(`[WHO-DIRECT] Searching WHO IRIS + OpenAlex for: "${query}"`);

  const [irisResults, openAlexResults] = await Promise.allSettled([
    searchWHOIRIS(query, Math.ceil(limit * 0.5)),
    searchOpenAlex(query, Math.ceil(limit * 0.5), {
      filter: 'authorships.institutions.ror:https://ror.org/01f80g185',
    }),
  ]);

  const irisItems = irisResults.status === 'fulfilled' ? irisResults.value : [];
  const oaItems = openAlexResults.status === 'fulfilled'
    ? openAlexResults.value.map((r: any) => ({
        ...r,
        id: `who:${r.id?.replace('https://openalex.org/', '') || ''}`,
        provider: 'who-direct',
        issuer: 'WHO',
        issuerType: 'health',
      }))
    : [];

  const seenIds = new Set<string>();
  const combined: any[] = [];
  for (const item of [...irisItems, ...oaItems]) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      combined.push(item);
    }
  }

  const result = combined.slice(0, limit);
  console.log(`[WHO-DIRECT] Found ${result.length} publications (IRIS: ${irisItems.length}, OA: ${oaItems.length})`);
  return result;
}

async function searchWHOIRIS(query: string, limit: number): Promise<any[]> {
  try {
    const encoded = encodeURIComponent(query);

    const data: any = await fetchFromProvider('who', `https://iris.who.int/rest/search?query=${encoded}&size=${limit}&scope=/`, { timeout: 12000, retries: 2, headers: { 'Accept': 'application/json', 'User-Agent': 'NomosX/1.0' } });
    if (!data) throw new Error('WHO IRIS request failed');

    return (data['search-results']?.entry || []).slice(0, limit).map((item: any) => ({
      id: `who-iris:${item['dc:identifier'] || item.id || Math.random()}`,
      title: item['dc:title'] || '',
      abstract: item['dc:description'] || '',
      url: item.link?.find((l: any) => l['@ref'] === 'self')?.['@href'] || '',
      publishedDate: item['prism:coverDate'] || item['dc:date'],
      authors: item['dc:creator'] ? [{ name: item['dc:creator'] }] : [],
      provider: 'who-direct',
      issuer: 'WHO',
      issuerType: 'health',
      qualityScore: 82,
    }));
  } catch (err: any) {
    console.warn(`[WHO-IRIS] Failed: ${err.message}`);
    return [];
  }
}
