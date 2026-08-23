/**
 * Légifrance - French Official Legal Database
 * Uses Légifrance PISTE API (api.piste.gouv.fr)
 * Covers: legislation, regulations, court decisions, official journals
 * Requires: LEGIFRANCE_API_KEY (PISTE OAuth2)
 */

import { httpPost } from '../../../http-client';

export async function searchLegifrance(query: string, limit = 15): Promise<any[]> {
  console.log(`[LEGIFRANCE] Searching PISTE API for: "${query}"`);

  const apiKey = process.env.LEGIFRANCE_API_KEY;
  if (!apiKey) {
    console.log('[LEGIFRANCE] No LEGIFRANCE_API_KEY — skipping');
    return [];
  }

  try {
    const tokenData: any = await httpPost('https://oauth.piste.gouv.fr/api/oauth/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: apiKey,
        client_secret: process.env.LEGIFRANCE_API_SECRET || '',
        scope: 'openid',
      }).toString(),
      {
        timeout: 15000,
        retries: 2,
        rateLimiterKey: 'legifrance',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

    if (!tokenData) {
      throw new Error('OAuth request failed');
    }
    const accessToken = tokenData.access_token;

    const data: any = await httpPost('https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/search', {
      recherche: {
        champs: [{ typeChamp: 'ALL', criteres: [{ typeRecherche: 'UN_DES_MOTS', valeur: query }] }],
        pageNumber: 1,
        pageSize: limit,
        sort: 'PERTINENCE',
        typePagination: 'DEFAUT',
      },
      fond: 'ALL',
    }, {
      timeout: 15000,
      retries: 2,
      rateLimiterKey: 'legifrance',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!data) throw new Error('Search request failed');
    const items = data.results || [];

    return items.slice(0, limit).map((item: any) => ({
      id: `legifrance:${item.id || item.cid || ''}`,
      title: item.titre || item.title || '',
      abstract: item.resume || item.description || '',
      url: `https://www.legifrance.gouv.fr/jorf/id/${item.id}`,
      publishedDate: item.datePublication || item.dateTexte,
      provider: 'legifrance',
      issuer: 'Légifrance',
      issuerType: 'government',
      qualityScore: 80,
      language: 'fr',
      sourceType: item.nature || 'legislation',
    }));
  } catch (error: any) {
    console.error(`[LEGIFRANCE] Search failed: ${error.message}`);
    return [];
  }
}
