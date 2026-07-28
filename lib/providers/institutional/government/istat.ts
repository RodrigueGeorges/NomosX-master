/**
 * ISTAT — Italian National Statistics (SDMX REST API)
 * API: https://esploradati.istat.it/SDMXWS/rest/ (free, no key)
 * 4,700+ datasets: demographics, employment, economy, health, territory
 */

import axios from 'axios';

const ISTAT_API = 'https://esploradati.istat.it/SDMXWS/rest';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchISTAT(query: string, limit = 15): Promise<any[]> {
  console.log(`[ISTAT] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // List all dataflows and filter by query
    const { data } = await axios.get(`${ISTAT_API}/dataflow/IT1/all`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/vnd.sdmx.structure+json;version=1.0' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    const dataflows = data?.data?.dataflows ?? data?.dataflows ?? [];
    const qLower = query.toLowerCase();
    const terms = qLower.split(/\s+/).filter(t => t.length > 3);

    for (const df of dataflows) {
      if (sources.length >= limit) break;
      const id = df?.id ?? '';
      const name = df?.name ?? '';
      const desc = df?.description ?? '';
      const text = `${id} ${name} ${desc}`.toLowerCase();

      if (terms.some(t => text.includes(t))) {
        sources.push({
          id: `istat:${id}`,
          provider: 'istat',
          type: 'dataset',
          title: `ISTAT — ${name || id}`,
          abstract: `Italian national statistics dataset: ${name}. ${desc?.slice(0, 300) || ''}. Relevant to: ${query}`,
          url: `https://esploradati.istat.it/dataset/${id}`,
          pdfUrl: null,
          year: new Date().getFullYear(),
          issuer: 'ISTAT (Italian National Statistics)',
          issuerType: 'government',
          language: 'it',
          oaStatus: 'open',
          hasFullText: true,
          topics: ['italy', 'statistics', 'government', 'data'],
          raw: { source: 'istat', dataflowId: id },
        });
      }
    }

    // Fallback: add ISTAT portal reference
    if (sources.length === 0) {
      sources.push({
        id: `istat:portal`,
        provider: 'istat',
        type: 'dataset',
        title: `ISTAT — Italian National Statistics Portal (4,700+ datasets)`,
        abstract: `Italian national statistics covering demographics, employment, economy, health, territory. Relevant to: ${query}`,
        url: 'https://esploradati.istat.it/',
        pdfUrl: null,
        year: new Date().getFullYear(),
        issuer: 'ISTAT (Italian National Statistics)',
        issuerType: 'government',
        language: 'it',
        oaStatus: 'open',
        hasFullText: false,
        topics: ['italy', 'statistics', 'government'],
        raw: { source: 'istat', searchQuery: query },
      });
    }

    console.log(`[ISTAT] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[ISTAT] Search failed: ${error.message}`);
  }

  return sources;
}
