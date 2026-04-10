/**
 * INSEE - Institut National de la Statistique et des Études Économiques (France)
 * Primary: INSEE public API (no key for basic endpoints)
 * Fallback: OpenAlex with INSEE ROR filter
 * INSEE ROR: 02cjnvs63
 */

import axios from 'axios';
import { searchOpenAlex } from '../../openalex';

const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchINSEE(query: string, limit = 15): Promise<any[]> {
  console.log(`[INSEE] Searching for: "${query}"`);

  try {
    // INSEE Studies & Working Papers via their catalog API
    const { data } = await axios.get('https://www.insee.fr/fr/recherche', {
      params: { q: query, debut: 0, longueur: limit, collections: 'etudes-et-syntheses,dossiers-et-documents,series-et-rapports' },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });

    // INSEE catalog returns JSON with results array
    const items: any[] = data?.results || data?.hits?.hits || [];
    if (items.length > 0) {
      const mapped = items.slice(0, limit).map((item: any) => {
        const src = item._source || item;
        const url = src.url || `https://www.insee.fr${src.uri || ''}`;
        return {
          id: `insee:${src.id || Buffer.from(url).toString('base64').slice(0, 16)}`,
          provider: 'insee',
          type: 'report',
          title: src.titre || src.title || '',
          abstract: src.description || src.abstract || `Publication INSEE sur ${query}`,
          url,
          pdfUrl: src.urlPdf || null,
          year: src.dateDiffusion ? new Date(src.dateDiffusion).getFullYear() : null,
          issuer: 'INSEE',
          issuerType: 'statistics',
          language: 'fr',
          oaStatus: 'public-domain',
          hasFullText: true,
          raw: { source: 'insee', searchQuery: query },
        };
      });
      console.log(`[INSEE] API found ${mapped.length} publications`);
      return mapped;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Fallback: OpenAlex ROR filter
  try {
    const results = await searchOpenAlex(query, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02cjnvs63',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `insee:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'insee',
      issuer: 'INSEE',
      issuerType: 'statistics',
    }));
    console.log(`[INSEE] OpenAlex fallback found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[INSEE] Search failed: ${error.message}`);
    return [];
  }
}
