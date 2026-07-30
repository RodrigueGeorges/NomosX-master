/**
 * OSTI.gov Provider — US Department of Energy science & technology research.
 * Free API, no key required. Strong in: energy, physics, materials, chemistry.
 *
 * API docs: https://www.osti.gov/api/v1/docs
 * Endpoint: https://www.osti.gov/api/v1/records
 */

const OSTI_ENDPOINT = "https://www.osti.gov/api/v1/records";

export async function searchOSTI(query: string, limit = 20): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      rows: String(Math.min(limit, 100)),
      page: '0',
    });

    const response = await fetch(`${OSTI_ENDPOINT}?${params}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/OSTI] HTTP ${response.status}`);
      return [];
    }

    const records = await response.json() as any[];

    if (!Array.isArray(records)) {
      console.warn('[SCOUT/OSTI] unexpected response format');
      return [];
    }

    return records.slice(0, limit).map((item: any, idx: number) => {
      const doi = item.doi || '';
      const url = item.doi ? `https://doi.org/${item.doi}` : (item.osti_id ? `https://www.osti.gov/biblio/${item.osti_id}` : '');
      const slug = (doi || item.osti_id || url).replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = item.publication_date || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      const authors = (item.authors || []).map((a: any) => ({
        name: a.full_name || a.name || '',
      })).filter((a: any) => a.name);

      const institutions: string[] = [];
      if (item.research_orgs) {
        (Array.isArray(item.research_orgs) ? item.research_orgs : [item.research_orgs]).forEach((org: string) => {
          if (org) institutions.push(org);
        });
      }

      return {
        id: `osti:${slug || idx}`,
        provider: 'osti',
        type: 'report',
        title: item.title || 'Untitled',
        abstract: item.abstract || item.description || null,
        url,
        doi: doi || null,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: null,
        qualityScore: 60,
        oaStatus: 'open',
        hasFullText: !!item.fulltext,
        contentLength: item.abstract?.length || 0,
        raw: item,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/OSTI] Error: ${err.message}`);
    return [];
  }
}
