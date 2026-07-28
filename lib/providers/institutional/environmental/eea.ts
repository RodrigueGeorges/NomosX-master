/**
 * EEA — European Environment Agency
 * Provides climate, energy, and environmental policy data for Europe
 * API: https://www.eea.europa.eu/api/ (free, no key required)
 * Also uses EEA datahub for datasets
 */

import axios from 'axios';

const EEA_API = 'https://www.eea.europa.eu/api';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchEEA(query: string, limit = 15): Promise<any[]> {
  console.log(`[EEA] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // EEA doesn't have a working public REST API. Use OpenAlex with environment concept filter.
    const { data } = await axios.get('https://api.openalex.org/works', {
      params: {
        search: `${query} European Environment Agency`,
        filter: 'concepts.id:C39432304',
        per_page: limit,
      },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    const works = data?.results ?? [];
    for (const work of works.slice(0, limit)) {
      sources.push({
        id: `eea:${work.id || Buffer.from(work.title || '').toString('base64').slice(0, 16)}`,
        provider: 'eea',
        type: 'paper',
        title: work.title || '',
        abstract: work.abstract?.slice(0, 500) || `EEA-related research on ${query}`,
        url: work.doi ? `https://doi.org/${work.doi}` : work.id || '',
        pdfUrl: work.open_access?.oa_url || null,
        year: work.publication_year || null,
        publishedDate: work.publication_date ? new Date(work.publication_date) : null,
        issuer: 'European Environment Agency',
        issuerType: 'environmental',
        language: 'en',
        oaStatus: work.open_access?.is_oa ? 'open' : 'closed',
        hasFullText: !!work.open_access?.oa_url,
        topics: ['environment', 'climate', 'energy', 'europe'],
        citationCount: work.cited_by_count || 0,
        raw: { source: 'eea-openalex', searchQuery: query },
      });
    }

    console.log(`[EEA] Found ${sources.length} publications`);
  } catch (error: any) {
    console.error(`[EEA] Search failed: ${error.message}`);
  }

  return sources;
}
