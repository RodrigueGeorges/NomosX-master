/**
 * Max Planck PuRe — Publication repository
 * API: https://pure.mpg.de/rest/ (public, read-only, no key)
 * Replaces OpenAlex wrapper with real institutional API
 */

import axios from 'axios';

const PURE_API = 'https://pure.mpg.de/rest';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchMaxPlanckPuRe(query: string, limit = 15): Promise<any[]> {
  console.log(`[MaxPlanck-PuRe] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // PuRe REST API — search items with query
    const { data } = await axios.get(`${PURE_API}/items`, {
      params: {
        q: query,
        limit,
        type: 'publication',
      },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    // Response format: { numberOfRecords, records: [{ data: {...} }] }
    const rawItems = data?.records ?? data?.item ?? data?.items ?? (Array.isArray(data) ? data : []);
    const items = Array.isArray(rawItems) ? rawItems : [rawItems].filter(Boolean);
    for (const record of items) {
      const item = record?.data ?? record; // records wrap the actual item in .data
      const metadata = item?.metadata ?? item?.properties ?? {};
      const title = metadata?.title ?? item?.title ?? metadata?.name ?? '';
      const abstract = metadata?.abstract ?? metadata?.description ?? item?.abstract ?? '';
      const creators = metadata?.creators ?? metadata?.authors ?? item?.creators ?? [];
      const date = metadata?.date ?? item?.date ?? metadata?.published ?? '';
      const doi = metadata?.doi ?? item?.doi ?? metadata?.identifier?.find?.((i: any) => i?.type === 'doi')?.id;

      if (title) {
        sources.push({
          id: `max-planck-pure:${item.id ?? item.objid}`,
          provider: 'max-planck',
          type: 'institutional-repo',
          title,
          abstract: typeof abstract === 'string' ? abstract.slice(0, 2000) : '',
          authors: creators.map((c: any) => c?.person?.displayName ?? c?.name ?? '').filter(Boolean),
          url: `https://pure.mpg.de/pubman/item/${item.id ?? item.objid}`,
          pdfUrl: item?.files?.find?.((f: any) => f?.mimeType === 'application/pdf')?.url ?? null,
          doi,
          year: date ? new Date(date).getFullYear() : null,
          publishedDate: date ? new Date(date) : null,
          venue: metadata?.journal ?? metadata?.publisher ?? 'Max Planck Society',
          issuer: 'Max Planck Society',
          issuerType: 'academic',
          language: metadata?.language ?? 'en',
          oaStatus: 'open',
          hasFullText: !!item?.files?.some?.((f: any) => f?.mimeType === 'application/pdf'),
          topics: ['max-planck', 'research', 'science'],
          raw: { source: 'max-planck-pure', itemId: item.id ?? item.objid },
        });
      }
    }

    console.log(`[MaxPlanck-PuRe] Found ${sources.length} publications`);
  } catch (error: any) {
    console.error(`[MaxPlanck-PuRe] Search failed: ${error.message}`);
  }

  return sources;
}
