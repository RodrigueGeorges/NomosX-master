/**
 * ENTSOG — European Network of Transmission System Operators for Gas
 * API: https://transparency.entsog.eu/api/v1/ (free, no key required)
 * Provides EU gas infrastructure, capacity, and flow data
 */

import axios from 'axios';

const ENTSOG_API = 'https://transparency.entsog.eu/api/v1';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchENTSOG(query: string, limit = 15): Promise<any[]> {
  console.log(`[ENTSOG] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // Get connection points and operators matching query
    const qLower = query.toLowerCase();
    const terms = qLower.split(/\s+/).filter(t => t.length > 3);

    // 1. Search connection points
    const { data: cpData } = await axios.get(`${ENTSOG_API}/connectionPoints`, {
      params: { limit: 100, indicator: 'BiDirectional' },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    const connectionPoints = cpData?.connectionPoints || [];
    for (const cp of connectionPoints) {
      if (sources.length >= limit) break;
      const name = cp?.pointLabel || cp?.pointIdentifier || '';
      const country = cp?.country || '';
      const text = `${name} ${country}`.toLowerCase();
      if (terms.some(t => text.includes(t))) {
        sources.push({
          id: `entsog:cp:${cp.id || cp.pointIdentifier}`,
          provider: 'entsog',
          type: 'dataset',
          title: `ENTSOG Connection Point: ${name} (${country})`,
          abstract: `Gas transmission connection point at ${name}, ${country}. Operator: ${cp.operatorLabel || 'N/A'}.`,
          url: `https://transparency.entsog.eu/#/connectionPoints?pointIdentifier=${cp.pointIdentifier}`,
          pdfUrl: null,
          year: new Date().getFullYear(),
          issuer: 'ENTSOG',
          issuerType: 'energy',
          language: 'en',
          oaStatus: 'cc-by',
          hasFullText: false,
          topics: ['gas', 'energy', 'infrastructure', 'europe'],
          raw: { source: 'entsog', type: 'connectionPoint', ...cp },
        });
      }
    }

    // 2. Get operators
    if (sources.length < limit) {
      const { data: opData } = await axios.get(`${ENTSOG_API}/operators`, {
        params: { limit: 100 },
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
        timeout: 15000,
      }).catch(() => ({ data: null }));

      const operators = opData?.operators || [];
      for (const op of operators) {
        if (sources.length >= limit) break;
        const name = op?.label || op?.name || '';
        const country = op?.country || '';
        const text = `${name} ${country}`.toLowerCase();
        if (terms.some(t => text.includes(t))) {
          sources.push({
            id: `entsog:op:${op.id || op.identifier}`,
            provider: 'entsog',
            type: 'dataset',
            title: `ENTSOG Operator: ${name} (${country})`,
            abstract: `Gas transmission system operator: ${name}, ${country}.`,
            url: `https://transparency.entsog.eu/#/operators?operatorIdentifier=${op.identifier}`,
            pdfUrl: null,
            year: new Date().getFullYear(),
            issuer: 'ENTSOG',
            issuerType: 'energy',
            language: 'en',
            oaStatus: 'cc-by',
            hasFullText: false,
            topics: ['gas', 'energy', 'operator', 'europe'],
            raw: { source: 'entsog', type: 'operator', ...op },
          });
        }
      }
    }

    // 3. Always include a reference to ENTSOG transparency platform
    if (sources.length === 0) {
      sources.push({
        id: `entsog:platform`,
        provider: 'entsog',
        type: 'dataset',
        title: `ENTSOG Transparency Platform — EU Gas Infrastructure Data`,
        abstract: `European gas transmission system data including physical flows, capacities, and infrastructure details. Relevant to: ${query}`,
        url: 'https://transparency.entsog.eu/',
        pdfUrl: null,
        year: new Date().getFullYear(),
        issuer: 'ENTSOG',
        issuerType: 'energy',
        language: 'en',
        oaStatus: 'cc-by',
        hasFullText: false,
        topics: ['gas', 'energy', 'transparency', 'europe'],
        raw: { source: 'entsog', searchQuery: query },
      });
    }

    console.log(`[ENTSOG] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[ENTSOG] Search failed: ${error.message}`);
  }

  return sources;
}
