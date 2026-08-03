/**
 * Foundational Academic Sources — Books, reports, and reference texts
 * for prospective/strategic research.
 *
 * These providers cover sources that journal databases miss:
 * - IPCC/GIEC assessment reports
 * - Internet Archive (millions of books, reports, historical documents)
 * - HathiTrust (academic books from research libraries)
 * - Open Library (book metadata with ISBNs)
 * - JSTOR (archived journal articles — via Crossref DOI prefix)
 *
 * All APIs are free and require no authentication (with rate limits).
 */

// ─── IPCC / GIEC ──────────────────────────────────────────────────
//
// IPCC reports are published by Cambridge University Press and have DOIs
// registered in Crossref. We search Crossref with "IPCC" as a query filter
// combined with the user's research question to find relevant assessment
// reports, working group contributions, and technical papers.
//
// This avoids the OpenAlex 429 problem entirely.

export async function searchIPCC(query: string, limit = 15): Promise<any[]> {
  try {
    const enhancedQuery = `IPCC ${query}`.slice(0, 500);
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(enhancedQuery)}&filter=type:report,type:book&rows=${limit}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/IPCC] Crossref HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const items = data?.message?.items || [];

    return items
      .filter((item: any) => {
        const title = (item.title?.[0] || '').toLowerCase();
        const container = (item['container-title']?.[0] || '').toLowerCase();
        const publisher = (item.publisher || '').toLowerCase();
        return title.includes('ipcc') || title.includes('climate change')
          || container.includes('ipcc') || publisher.includes('cambridge')
          || publisher.includes('ipcc');
      })
      .slice(0, limit)
      .map((item: any) => ({
        id: `ipcc:${item.DOI || item.URL || Math.random()}`,
        provider: 'ipcc',
        type: 'report',
        title: item.title?.[0] || 'IPCC Report',
        abstract: item.abstract || null,
        url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
        doi: item.DOI || null,
        year: item.published?.dateParts?.[0]?.[0] || new Date().getFullYear(),
        publishedDate: item.published?.dateParts?.[0]?.join('-') || '',
        authors: (item.author || []).map((a: any) => ({
          name: `${a.given || ''} ${a.family || ''}`.trim(),
        })),
        institutions: ['IPCC'],
        citationCount: item['is-referenced-by-count'] || 0,
        qualityScore: 95,
        oaStatus: 'open',
        documentType: item.type || 'report',
        issuer: 'IPCC',
        issuerType: 'international-body',
        classification: 'academic',
        language: 'en',
        contentFormat: 'text',
        raw: item,
      }));
  } catch (err: any) {
    console.warn(`[SCOUT/IPCC] Error: ${err.message}`);
    return [];
  }
}

// ─── Internet Archive ─────────────────────────────────────────────
//
// The Internet Archive has millions of books, reports, and historical
// documents. Their advanced search API is free and returns JSON.
//
// API docs: https://archive.org/advancedsearch.php
// We search the "texts" collection for academic/research material.

export async function searchInternetArchive(query: string, limit = 20): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: `(${query}) AND mediatype:texts`,
      fl: 'identifier,title,creator,date,description,subject,publisher,language,downloads',
      sort: 'downloads desc',
      rows: String(Math.min(limit, 40)),
      output: 'json',
    });

    const response = await fetch(`https://archive.org/advancedsearch.php?${params}`, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/InternetArchive] HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const docs = data?.response?.docs || [];

    return docs.slice(0, limit).map((doc: any) => {
      const year = doc.date ? parseInt(String(doc.date).slice(0, 4)) : null;
      const creators = Array.isArray(doc.creator) ? doc.creator : (doc.creator ? [doc.creator] : []);
      const subjects = Array.isArray(doc.subject) ? doc.subject : (doc.subject ? [doc.subject] : []);

      return {
        id: `internet-archive:${doc.identifier}`,
        provider: 'internet-archive',
        type: 'book',
        title: doc.title || 'Untitled',
        abstract: doc.description?.slice(0, 2000) || subjects.join(', ') || null,
        url: `https://archive.org/details/${doc.identifier}`,
        doi: null,
        isbn: null,
        year: year && !isNaN(year) ? year : null,
        publishedDate: doc.date || null,
        authors: creators.map((c: string) => ({ name: c })),
        institutions: doc.publisher ? [doc.publisher] : [],
        citationCount: 0,
        qualityScore: 60,
        oaStatus: 'open',
        hasFullText: true,
        documentType: 'book',
        issuer: doc.publisher || 'Internet Archive',
        issuerType: 'archive',
        classification: 'academic',
        language: doc.language || 'en',
        contentFormat: 'text',
        raw: doc,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/InternetArchive] Error: ${err.message}`);
    return [];
  }
}

// ─── HathiTrust ───────────────────────────────────────────────────
//
// HathiTrust is a partnership of research libraries holding millions
// of digitized books. Their API provides bibliographic search.
//
// API docs: https://www.hathitrust.org/hathifiles_description
// We use the catalog API for bibliographic search.

export async function searchHathiTrust(query: string, limit = 15): Promise<any[]> {
  try {
    const url = `https://catalog.hathitrust.org/api/volumes?q=${encodeURIComponent(query)}&format=json&limit=${limit}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/HathiTrust] HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const items = data?.items || data?.records || [];

    if (!Array.isArray(items)) return [];

    return items.slice(0, limit).map((item: any) => {
      const record = item.record || item;
      const title = record.title || record.titles?.[0] || 'Untitled';
      const year = record.publishDate || record.year || null;
      const authors = record.authors || record.contributors || [];
      const subjects = record.subjects || [];

      return {
        id: `hathitrust:${item.itemURL || item.htid || Math.random()}`,
        provider: 'hathitrust',
        type: 'book',
        title,
        abstract: subjects.join(', ').slice(0, 1000) || null,
        url: item.itemURL || `https://babel.hathitrust.org/cgi/pt?id=${item.htid}`,
        doi: null,
        isbn: record.isbn?.[0] || null,
        year: year && !isNaN(year) ? year : null,
        publishedDate: null,
        authors: authors.map((a: any) => ({ name: typeof a === 'string' ? a : a.name || '' })),
        institutions: record.publisher ? [record.publisher] : [],
        citationCount: 0,
        qualityScore: 65,
        oaStatus: record.rights?.includes('pd') || record.rights?.includes('ic') ? 'open' : 'closed',
        hasFullText: record.rights?.includes('pd') || false,
        documentType: 'book',
        issuer: record.publisher || 'HathiTrust',
        issuerType: 'library',
        classification: 'academic',
        language: record.language || 'en',
        contentFormat: 'text',
        raw: record,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/HathiTrust] Error: ${err.message}`);
    return [];
  }
}

// ─── Open Library ─────────────────────────────────────────────────
//
// Open Library is an open project by Internet Archive providing
// book metadata with ISBNs, covers, and author info.
//
// API docs: https://openlibrary.org/developers/api
// Search endpoint: https://openlibrary.org/search.json

export async function searchOpenLibrary(query: string, limit = 15): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(limit, 40)),
      fields: 'key,title,author_name,first_publish_year,publisher,isbn,subject,language,edition_count',
    });

    const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/OpenLibrary] HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const docs = data?.docs || [];

    return docs.slice(0, limit).map((doc: any) => ({
      id: `open-library:${doc.key?.split('/').pop() || Math.random()}`,
      provider: 'open-library',
      type: 'book',
      title: doc.title || 'Untitled',
      abstract: doc.subject?.slice(0, 10).join(', ') || null,
      url: `https://openlibrary.org${doc.key || ''}`,
      doi: null,
      isbn: doc.isbn?.[0] || null,
      year: doc.first_publish_year || null,
      publishedDate: null,
      authors: (doc.author_name || []).map((name: string) => ({ name })),
      institutions: (doc.publisher || []).slice(0, 2),
      citationCount: doc.edition_count || 0,
      qualityScore: 55,
      oaStatus: 'open',
      hasFullText: false,
      documentType: 'book',
      issuer: doc.publisher?.[0] || 'Open Library',
      issuerType: 'library',
      classification: 'academic',
      language: doc.language?.[0] || 'en',
      contentFormat: 'text',
      raw: doc,
    }));
  } catch (err: any) {
    console.warn(`[SCOUT/OpenLibrary] Error: ${err.message}`);
    return [];
  }
}

// ─── JSTOR (via Crossref DOI prefix) ──────────────────────────────
//
// JSTOR content has DOIs registered in Crossref with publisher "JSTOR"
// or DOI prefix 10.2307. We search Crossref filtered by this prefix
// to find archived journal articles.
//
// This avoids the need for JSTOR API authentication.

export async function searchJSTOR(query: string, limit = 15): Promise<any[]> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&filter=prefix:10.2307&rows=${limit}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/JSTOR] Crossref HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const items = data?.message?.items || [];

    return items.slice(0, limit).map((item: any) => ({
      id: `jstor:${item.DOI || Math.random()}`,
      provider: 'jstor',
      type: 'academic',
      title: item.title?.[0] || 'Untitled',
      abstract: item.abstract || null,
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      doi: item.DOI || null,
      year: item.published?.dateParts?.[0]?.[0] || null,
      publishedDate: item.published?.dateParts?.[0]?.join('-') || '',
      authors: (item.author || []).map((a: any) => ({
        name: `${a.given || ''} ${a.family || ''}`.trim(),
      })),
      institutions: [],
      citationCount: item['is-referenced-by-count'] || 0,
      qualityScore: 75,
      oaStatus: 'closed',
      hasFullText: false,
      documentType: item.type || 'journal-article',
      issuer: item['container-title']?.[0] || 'JSTOR',
      issuerType: 'journal',
      classification: 'academic',
      language: 'en',
      contentFormat: 'text',
      raw: item,
    }));
  } catch (err: any) {
    console.warn(`[SCOUT/JSTOR] Error: ${err.message}`);
    return [];
  }
}

// ─── UNESCO Digital Library ───────────────────────────────────────
//
// UNESCO Digital Library (UNESDOC) hosts reports, publications,
// and policy documents. We use their public search API.
//
// API: https://unesdoc.unesco.org/search?...

export async function searchUNESCO(query: string, limit = 15): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(limit, 30)),
      sort: 'date_desc',
    });

    const response = await fetch(`https://unesdoc.unesco.org/api/search?${params}`, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/UNESCO] HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const items = data?.results || data?.items || [];

    if (!Array.isArray(items)) return [];

    return items.slice(0, limit).map((item: any) => ({
      id: `unesco:${item.id || item.identifier || Math.random()}`,
      provider: 'unesco',
      type: 'report',
      title: item.title || item.titre || 'Untitled',
      abstract: item.description || item.abstract || null,
      url: item.url || item.link || '',
      doi: item.doi || null,
      isbn: item.isbn || null,
      year: item.date ? parseInt(String(item.date).slice(0, 4)) : null,
      publishedDate: item.date || null,
      authors: (item.authors || item.auteurs || []).map((a: any) => ({
        name: typeof a === 'string' ? a : a.name || a.nom || '',
      })),
      institutions: ['UNESCO'],
      citationCount: 0,
      qualityScore: 85,
      oaStatus: 'open',
      hasFullText: true,
      documentType: 'report',
      issuer: 'UNESCO',
      issuerType: 'international-body',
      classification: 'academic',
      language: item.language || item.langue || 'en',
      contentFormat: 'text',
      raw: item,
    }));
  } catch (err: any) {
    console.warn(`[SCOUT/UNESCO] Error: ${err.message}`);
    return [];
  }
}
