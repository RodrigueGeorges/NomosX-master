/**
 * Légifrance - French Official Legal Database
 * Uses Légifrance PISTE API (api.piste.gouv.fr)
 * Covers: legislation, regulations, court decisions, official journals
 * Requires: LEGIFRANCE_API_KEY (PISTE OAuth2)
 */

export async function searchLegifrance(query: string, limit = 15): Promise<any[]> {
  console.log(`[LEGIFRANCE] Searching PISTE API for: "${query}"`);

  const apiKey = process.env.LEGIFRANCE_API_KEY;
  if (!apiKey) {
    console.log('[LEGIFRANCE] No LEGIFRANCE_API_KEY — skipping');
    return [];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const tokenRes = await fetch('https://oauth.piste.gouv.fr/api/oauth/token', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: apiKey,
        client_secret: process.env.LEGIFRANCE_API_SECRET || '',
        scope: 'openid',
      }),
    });

    if (!tokenRes.ok) {
      clearTimeout(timeout);
      throw new Error(`OAuth failed: HTTP ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const searchRes = await fetch('https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recherche: {
          champs: [{ typeChamp: 'ALL', criteres: [{ typeRecherche: 'UN_DES_MOTS', valeur: query }] }],
          pageNumber: 1,
          pageSize: limit,
          sort: 'PERTINENCE',
          typePagination: 'DEFAUT',
        },
        fond: 'ALL',
      }),
    });
    clearTimeout(timeout);

    if (!searchRes.ok) throw new Error(`Search failed: HTTP ${searchRes.status}`);

    const data = await searchRes.json();
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
