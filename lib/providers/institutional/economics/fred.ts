/**
 * FRED - Federal Reserve Economic Data (St. Louis Fed)
 * Primary: FRED API (free, requires key from env or fallback)
 * API: https://fred.stlouisfed.org/docs/api/fred/
 * Fallback: OpenAlex with Federal Reserve Board ROR: 03yd7cn72
 */

import axios from 'axios';
import { searchOpenAlex } from '../../openalex';

const FRED_API = 'https://api.stlouisfed.org/fred';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchFRED(query: string, limit = 15): Promise<any[]> {
  console.log(`[FRED] Searching for: "${query}"`);

  const apiKey = process.env.FRED_API_KEY;
  if (apiKey) {
    try {
      const { data } = await axios.get(`${FRED_API}/series/search`, {
        params: { search_text: query, limit, api_key: apiKey, file_type: 'json' },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 15000,
      });

      const series: any[] = data?.seriess || [];
      if (series.length > 0) {
        const mapped = series.slice(0, limit).map((s: any) => ({
          id: `fred:${s.id}`,
          provider: 'fred',
          type: 'dataset',
          title: s.title || '',
          abstract: `${s.title} — Frequence: ${s.frequency}, Unité: ${s.units}. Dernière mise à jour: ${s.last_updated}`,
          url: `https://fred.stlouisfed.org/series/${s.id}`,
          pdfUrl: null,
          year: s.last_updated ? new Date(s.last_updated).getFullYear() : null,
          issuer: 'Federal Reserve (FRED)',
          issuerType: 'economic',
          language: 'en',
          oaStatus: 'public-domain',
          hasFullText: true,
          raw: { source: 'fred', seriesId: s.id, searchQuery: query },
        }));
        console.log(`[FRED] API found ${mapped.length} series`);
        return mapped;
      }
    } catch {
      // fall through to OpenAlex
    }
  }

  // Fallback: OpenAlex with Federal Reserve Board ROR
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/03yd7cn72',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `fred:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'fred',
      issuer: 'Federal Reserve',
      issuerType: 'economic',
    }));
    console.log(`[FRED] OpenAlex fallback found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[FRED] Search failed: ${error.message}`);
    return [];
  }
}
