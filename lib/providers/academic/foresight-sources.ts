/**
 * Foresight & Prospective Sources — Reports from strategic foresight
 * organizations for prospective research.
 *
 * - Club of Rome (Meadows, Limits to Growth, etc.)
 * - Millennium Project (State of the Future)
 * - OECD Future Studies
 * - RAND Corporation (foresight reports)
 *
 * These are critical for strategic/prospective analysis where
 * foundational texts matter more than recent journal articles.
 *
 * Uses Crossref + web search fallbacks since most foresight
 * organizations publish reports rather than journal articles.
 */

import { fetchFromProvider } from '../../http-client';

// ─── Club of Rome ─────────────────────────────────────────────────
//
// Club of Rome reports (Meadows "Limits to Growth", etc.) are
// registered in Crossref. We search with "Club of Rome" as a
// query enhancer and filter for book/report types.

export async function searchClubOfRome(query: string, limit = 10): Promise<any[]> {
  try {
    const enhancedQuery = `"Club of Rome" ${query}`.slice(0, 500);
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(enhancedQuery)}&filter=type:book,type:report&rows=${limit * 2}`;

    const data: any = await fetchFromProvider('club-of-rome', url, { timeout: 20000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });
    if (!data) {
      console.warn(`[SCOUT/ClubOfRome] Crossref request failed`);
      return [];
    }
    const items = data?.message?.items || [];

    return items
      .filter((item: any) => {
        const title = (item.title?.[0] || '').toLowerCase();
        const publisher = (item.publisher || '').toLowerCase();
        const container = (item['container-title']?.[0] || '').toLowerCase();
        return title.includes('club of rome') || title.includes('limits to growth')
          || title.includes('meadows') || publisher.includes('club of rome')
          || container.includes('club of rome');
      })
      .slice(0, limit)
      .map((item: any) => ({
        id: `club-of-rome:${item.DOI || Math.random()}`,
        provider: 'club-of-rome',
        type: 'report',
        title: item.title?.[0] || 'Club of Rome Report',
        abstract: item.abstract || null,
        url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
        doi: item.DOI || null,
        year: item.published?.dateParts?.[0]?.[0] || null,
        publishedDate: item.published?.dateParts?.[0]?.join('-') || '',
        authors: (item.author || []).map((a: any) => ({
          name: `${a.given || ''} ${a.family || ''}`.trim(),
        })),
        institutions: ['Club of Rome'],
        citationCount: item['is-referenced-by-count'] || 0,
        qualityScore: 90,
        oaStatus: 'closed',
        hasFullText: false,
        documentType: item.type || 'book',
        issuer: 'Club of Rome',
        issuerType: 'think-tank',
        classification: 'academic',
        language: 'en',
        contentFormat: 'text',
        raw: item,
      }));
  } catch (err: any) {
    console.warn(`[SCOUT/ClubOfRome] Error: ${err.message}`);
    return [];
  }
}

// ─── Millennium Project ───────────────────────────────────────────
//
// The Millennium Project publishes "State of the Future" reports.
// We search Crossref and Internet Archive for these.

export async function searchMillenniumProject(query: string, limit = 10): Promise<any[]> {
  try {
    const enhancedQuery = `"Millennium Project" ${query}`.slice(0, 500);

    // Search Crossref for Millennium Project publications
    const crossrefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(enhancedQuery)}&rows=${limit * 2}`;
    const iaUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`"Millennium Project" ${query} AND mediatype:texts`)}&fl=identifier,title,creator,date,description,subject&rows=${limit}&output=json`;
    const [crossrefResult, iaResult] = await Promise.allSettled([
      fetchFromProvider('millennium-project', crossrefUrl, { timeout: 20000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } }),
      fetchFromProvider('millennium-project', iaUrl, { timeout: 20000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } }),
    ]);

    const results: any[] = [];

    // Parse Crossref results
    if (crossrefResult.status === 'fulfilled' && crossrefResult.value) {
      const data = crossrefResult.value as any;
      const items = data?.message?.items || [];
      for (const item of items) {
        const title = (item.title?.[0] || '').toLowerCase();
        if (title.includes('millennium') || title.includes('future')
            || title.includes('foresight') || title.includes('prospective')) {
          results.push({
            id: `millennium-project:${item.DOI || Math.random()}`,
            provider: 'millennium-project',
            type: 'report',
            title: item.title?.[0] || 'Millennium Project Report',
            abstract: item.abstract || null,
            url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
            doi: item.DOI || null,
            year: item.published?.dateParts?.[0]?.[0] || null,
            publishedDate: item.published?.dateParts?.[0]?.join('-') || '',
            authors: (item.author || []).map((a: any) => ({
              name: `${a.given || ''} ${a.family || ''}`.trim(),
            })),
            institutions: ['Millennium Project'],
            citationCount: item['is-referenced-by-count'] || 0,
            qualityScore: 85,
            oaStatus: 'closed',
            hasFullText: false,
            documentType: item.type || 'report',
            issuer: 'Millennium Project',
            issuerType: 'think-tank',
            classification: 'academic',
            language: 'en',
            contentFormat: 'text',
            raw: item,
          });
        }
      }
    }

    // Parse Internet Archive results
    if (iaResult.status === 'fulfilled' && iaResult.value) {
      const iaData = iaResult.value as any;
      const iaDocs = iaData?.response?.docs || [];
      for (const doc of iaDocs) {
        const year = doc.date ? parseInt(String(doc.date).slice(0, 4)) : null;
        results.push({
          id: `millennium-project-ia:${doc.identifier}`,
          provider: 'millennium-project',
          type: 'report',
          title: doc.title || 'Untitled',
          abstract: doc.description?.slice(0, 1500) || null,
          url: `https://archive.org/details/${doc.identifier}`,
          doi: null,
          year: year && !isNaN(year) ? year : null,
          publishedDate: doc.date || null,
          authors: Array.isArray(doc.creator) ? doc.creator.map((c: string) => ({ name: c })) : [],
          institutions: ['Millennium Project'],
          citationCount: 0,
          qualityScore: 80,
          oaStatus: 'open',
          hasFullText: true,
          documentType: 'report',
          issuer: 'Millennium Project',
          issuerType: 'think-tank',
          classification: 'academic',
          language: 'en',
          contentFormat: 'text',
          raw: doc,
        });
      }
    }

    return results.slice(0, limit);
  } catch (err: any) {
    console.warn(`[SCOUT/MillenniumProject] Error: ${err.message}`);
    return [];
  }
}
