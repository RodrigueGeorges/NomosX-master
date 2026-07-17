/**
 * OpenAIRE Provider — European Open Science Graph
 * 100M+ research outputs financés par l'UE (Horizon 2020, Horizon Europe).
 * Excellent pour: sciences exactes, SHS, interdisciplinaire européen.
 * API: https://api.openaire.eu/
 * Gratuite, sans clé.
 */

import { fetchFromProvider } from '../http-client';

export async function searchOpenAIRE(query: string, limit = 20): Promise<any[]> {
  const url = `https://api.openaire.eu/search/publications?keywords=${encodeURIComponent(query)}&size=${Math.min(limit, 50)}&format=json`;

  try {
    const data: any = await fetchFromProvider('openaire', url, { timeout: 15000, retries: 3 });
    const results: any[] = data?.response?.results?.result || [];

    const mapped = results
      .map((r: any) => {
        const metadata = r.metadata?.['oaf:entity']?.['oaf:result'] || {};
        const titleNode = metadata.title;
        const title = Array.isArray(titleNode)
          ? (titleNode.find((t: any) => t['@classid'] === 'main title')?.['$'] || titleNode[0]?.['$'] || '')
          : (titleNode?.['$'] || titleNode || '');

        const descNode = metadata.description;
        const abstract = Array.isArray(descNode) ? descNode[0]?.['$'] : (descNode?.['$'] || null);

        const creators = metadata.creator;
        const authors = (Array.isArray(creators) ? creators : (creators ? [creators] : []))
          .map((c: any) => ({ name: c['$'] || c.name || String(c) }))
          .filter((a: any) => a.name && a.name.length > 1);

        const doi = (() => {
          const pids = metadata.pid;
          const pidArr = Array.isArray(pids) ? pids : (pids ? [pids] : []);
          return pidArr.find((p: any) => p['@classid'] === 'doi')?.['$'] || null;
        })();

        const yearRaw = metadata.dateofacceptance?.['$'] || metadata.year?.['$'];
        const year = yearRaw ? parseInt(String(yearRaw).slice(0, 4)) : null;

        const bestUrl = (() => {
          const instances = metadata.instance;
          const instanceArr = Array.isArray(instances) ? instances : (instances ? [instances] : []);
          const webResource = instanceArr[0]?.webresource;
          const wr = Array.isArray(webResource) ? webResource[0] : webResource;
          return wr?.url?.['$'] || (doi ? `https://doi.org/${doi}` : null);
        })();

        return {
          id: `openaire:${r.header?.['dri:objIdentifier']?.['$'] || Math.random().toString(36).slice(2)}`,
          provider: 'openaire',
          type: 'paper',
          title: String(title).replace(/<[^>]+>/g, '').trim(),
          abstract: abstract ? String(abstract).replace(/<[^>]+>/g, '').slice(0, 3000) : null,
          year,
          doi,
          url: bestUrl,
          pdfUrl: null,
          oaStatus: 'oa',
          authors,
          institutions: [],
          topics: [],
          jelCodes: [],
          citationCount: null,
          issuer: 'OpenAIRE (EU)',
          issuerType: 'eu-research',
          language: metadata.language?.['@classname'] || 'en',
          raw: r,
        };
      })
      .filter((r: any) => r.title.length > 3 && r.abstract);

    console.log(`[OpenAIRE] Found ${mapped.length} EU research outputs`);
    return mapped;
  } catch (error: any) {
    console.error(`[OpenAIRE] Search failed: ${error.message}`);
    return [];
  }
}
