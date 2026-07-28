/**
 * Fingrid — Finnish transmission system operator
 * API: https://api.fingrid.fi/api (free, no key for public endpoints)
 * Real-time Finnish grid data at 3-min resolution
 */

import axios from 'axios';

const FINGRID_API = 'https://api.fingrid.fi/api';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchFingrid(query: string, limit = 10): Promise<any[]> {
  console.log(`[Fingrid] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // Get available datasets/events
    const { data } = await axios.get(`${FINGRID_API}/events`, {
      params: { pageSize: limit },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 10000,
    }).catch(() => ({ data: null }));

    const events = Array.isArray(data) ? data : data?.data ?? [];
    for (const event of events.slice(0, limit)) {
      sources.push({
        id: `fingrid:${event.id ?? event.eventId}`,
        provider: 'fingrid',
        type: 'dataset',
        title: `Fingrid — ${event.name ?? event.title ?? 'Grid Event'} (Finland)`,
        abstract: `Finnish grid data from Fingrid: ${event.name ?? event.title}. ${event.description ?? ''}. Relevant to: ${query}`,
        url: `https://www.fingrid.fi/en/electricity-market-data/datahub/`,
        pdfUrl: null,
        year: new Date().getFullYear(),
        issuer: 'Fingrid (Finnish TSO)',
        issuerType: 'energy',
        language: 'en',
        oaStatus: 'open',
        hasFullText: false,
        topics: ['electricity', 'finland', 'grid', 'energy'],
        raw: { source: 'fingrid', eventId: event.id ?? event.eventId },
      });
    }

    // Always add a reference to real-time generation
    if (sources.length < limit) {
      sources.push({
        id: `fingrid:realtime-generation`,
        provider: 'fingrid',
        type: 'dataset',
        title: `Fingrid — Real-time Finnish Electricity Generation (3-min resolution)`,
        abstract: `Finnish real-time generation data at 3-minute resolution including wind, hydro, nuclear, and imports. Relevant to: ${query}`,
        url: `https://www.fingrid.fi/en/electricity-market-data/electricity-market-information/`,
        pdfUrl: null,
        year: new Date().getFullYear(),
        issuer: 'Fingrid (Finnish TSO)',
        issuerType: 'energy',
        language: 'en',
        oaStatus: 'open',
        hasFullText: false,
        topics: ['electricity', 'finland', 'generation', 'realtime'],
        raw: { source: 'fingrid', type: 'realtime-generation' },
      });
    }

    console.log(`[Fingrid] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[Fingrid] Search failed: ${error.message}`);
  }

  return sources;
}
