/**
 * DataCite Provider — 40M+ research datasets with DOIs.
 * Free API, no key required. Covers research data across all disciplines.
 *
 * API docs: https://support.datacite.org/docs/api
 * Endpoint: https://api.datacite.org/dois
 */

const DATACITE_ENDPOINT = "https://api.datacite.org/dois";

export async function searchDataCite(query: string, limit = 20): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      'query': query,
      'page[size]': String(Math.min(limit, 50)),
      'page[number]': '1',
    });

    const response = await fetch(`${DATACITE_ENDPOINT}?${params}`, {
      headers: { 'Accept': 'application/vnd.api+json' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/DataCite] HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const items = data?.data || [];

    if (!Array.isArray(items)) {
      console.warn('[SCOUT/DataCite] unexpected response format');
      return [];
    }

    return items.slice(0, limit).map((item: any, idx: number) => {
      const attrs = item.attributes || {};
      const doi = attrs.doi || item.id || '';
      const url = attrs.url || `https://doi.org/${doi}`;
      const slug = doi.replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = attrs.published || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      const creators = attrs.creators || [];
      const authors = creators.map((c: any) => ({
        name: c.name || `${c.givenName || ''} ${c.familyName || ''}`.trim(),
      })).filter((a: any) => a.name);

      const institutions: string[] = [];
      if (attrs.publisher) institutions.push(attrs.publisher);

      const descriptions = attrs.descriptions || [];
      const abstract = descriptions.find((d: any) => d.descriptionType === 'Abstract')?.description || null;

      return {
        id: `datacite:${slug || idx}`,
        provider: 'datacite',
        type: 'dataset',
        title: attrs.titles?.[0]?.title || 'Untitled',
        abstract,
        url,
        doi: doi || null,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: null,
        qualityScore: 50,
        oaStatus: 'open',
        hasFullText: false,
        contentLength: abstract?.length || 0,
        raw: attrs,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/DataCite] Error: ${err.message}`);
    return [];
  }
}
