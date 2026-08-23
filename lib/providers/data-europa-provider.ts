/**
 * data.europa.eu Provider — EU Open Data Portal (1M+ datasets)
 *
 * Free, no API key required. The official EU open data portal aggregating
 * datasets from EU institutions, member states, and regional governments.
 * Covers: environment, economy, transport, agriculture, justice, education,
 * health, population, science, technology, government.
 *
 * KEY VALUE: Government open data with structured metadata. Complements
 * Eurostat/ECB with granular datasets from 36+ countries. Each result
 * includes distribution URLs (CSV, JSON, XML, API endpoints).
 *
 * API: https://data.europa.eu/api/hub/search/search?q={query}&limit={limit}&page=0
 * Docs: https://dataeuropa.gitlab.io/data-provider-manual/api-documentation/
 */

import { fetchFromProvider } from '../http-client';

export async function searchDataEuropa(query: string, limit = 15): Promise<any[]> {
  try {
    const url = `https://data.europa.eu/api/hub/search/search?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 50)}&page=0`;

    const data: any = await fetchFromProvider('data-europa', url, {
      timeout: 20000,
      retries: 2,
      headers: { 'Accept': 'application/json' },
    });

    const results = data?.results || [];
    console.log(`[data.europa.eu] Found ${results.length} datasets`);

    return results.slice(0, limit).map((item: any) => {
      const title = item?.title?.en || item?.title?.[0] || item?.name || 'Untitled';
      const description = item?.description?.en || item?.description?.[0] || null;
      const catalog = item?.catalog || item?.publisher || null;
      const keywords = item?.keywords || item?.tags || [];
      const distributions = item?.distributions || [];
      const modified = item?.modified || item?.modificationDate || null;
      const issued = item?.issued || item?.publicationDate || null;
      const year = issued ? parseInt(String(issued).slice(0, 4)) : null;

      // Find best distribution URL (prefer API/JSON over CSV)
      const apiDist = distributions.find((d: any) =>
        d?.format?.id?.includes('api') || d?.format?.id?.includes('json') || d?.accessURL?.includes('api')
      );
      const anyDist = distributions[0];
      const accessUrl = apiDist?.accessURL || anyDist?.accessURL || anyDist?.downloadURL || item?.landingPage || '';

      return {
        id: `data-europa:${item?.id || Math.random()}`,
        provider: 'data-europa',
        type: 'dataset',
        title,
        abstract: description,
        doi: null,
        year: year && !isNaN(year) ? year : null,
        publishedDate: issued,
        authors: [],
        institutions: catalog ? [catalog] : ['EU Open Data'],
        citationCount: 0,
        qualityScore: 55,
        oaStatus: 'open',
        hasFullText: false,
        documentType: 'dataset',
        issuer: catalog || 'data.europa.eu',
        issuerType: 'government',
        classification: 'government',
        language: 'en',
        contentFormat: 'data',
        url: accessUrl,
        keywords: Array.isArray(keywords) ? keywords.slice(0, 10) : [],
        raw: item,
      };
    });
  } catch (err: any) {
    console.warn(`[data.europa.eu] Error: ${err.message}`);
    return [];
  }
}
