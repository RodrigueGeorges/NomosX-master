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

import { fetchFromProvider } from '../../http-client';

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

    const data: any = await fetchFromProvider('ipcc', url, { timeout: 20000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });
    if (!data) {
      console.warn(`[SCOUT/IPCC] Crossref request failed`);
      return [];
    }
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

    const data: any = await fetchFromProvider('internet-archive', `https://archive.org/advancedsearch.php?${params}`, { timeout: 20000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });
    if (!data) {
      console.warn(`[SCOUT/InternetArchive] Request failed`);
      return [];
    }
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

// ─── HathiTrust (via Open Library + Crossref books) ───────────────
//
// HathiTrust's bibliographic API is NOT a search API — it requires
// ISBN/OCLC/htid identifiers. We use Open Library (which indexes many
// HathiTrust items) for book search, and Crossref filtered to books
// for academic monographs. This gives us HathiTrust-like coverage
// without the broken catalog endpoint.

export async function searchHathiTrust(query: string, limit = 15): Promise<any[]> {
  try {
    // Strategy 1: Open Library (indexes HathiTrust digitized books)
    const olParams = new URLSearchParams({
      q: query,
      limit: String(Math.min(limit, 20)),
      fields: 'key,title,author_name,first_publish_year,publisher,isbn,subject,language,edition_count',
    });
    const olData: any = await fetchFromProvider('hathitrust',
      `https://openlibrary.org/search.json?${olParams}`,
      { timeout: 15000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });

    const olDocs = olData?.docs || [];
    const olResults = olDocs.slice(0, Math.ceil(limit * 0.6)).map((doc: any) => ({
      id: `hathitrust:ol-${doc.key?.split('/').pop() || Math.random()}`,
      provider: 'hathitrust',
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
      qualityScore: 60,
      oaStatus: 'open',
      hasFullText: false,
      documentType: 'book',
      issuer: doc.publisher?.[0] || 'HathiTrust/OpenLibrary',
      issuerType: 'library',
      classification: 'academic',
      language: doc.language?.[0] || 'en',
      contentFormat: 'text',
      raw: doc,
    }));

    // Strategy 2: Crossref filtered to books/reports
    const crUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&filter=type:book,type:book-chapter,type:report&rows=${Math.floor(limit * 0.4)}`;
    const crData: any = await fetchFromProvider('hathitrust', crUrl,
      { timeout: 20000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });

    const crItems = crData?.message?.items || [];
    const crResults = crItems.slice(0, Math.floor(limit * 0.4)).map((item: any) => ({
      id: `hathitrust:cr-${item.DOI || Math.random()}`,
      provider: 'hathitrust',
      type: 'book',
      title: item.title?.[0] || 'Untitled',
      abstract: item.abstract || null,
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      doi: item.DOI || null,
      isbn: item.ISBN?.[0] || null,
      year: item.published?.dateParts?.[0]?.[0] || null,
      publishedDate: item.published?.dateParts?.[0]?.join('-') || '',
      authors: (item.author || []).map((a: any) => ({ name: `${a.given || ''} ${a.family || ''}`.trim() })),
      institutions: [item.publisher].filter(Boolean),
      citationCount: item['is-referenced-by-count'] || 0,
      qualityScore: 65,
      oaStatus: 'closed',
      hasFullText: false,
      documentType: item.type || 'book',
      issuer: item.publisher || 'HathiTrust/Crossref',
      issuerType: 'publisher',
      classification: 'academic',
      language: 'en',
      contentFormat: 'text',
      raw: item,
    }));

    const all = [...olResults, ...crResults].slice(0, limit);
    console.log(`[SCOUT/HathiTrust] Found ${all.length} books (OpenLibrary: ${olResults.length}, Crossref: ${crResults.length})`);
    return all;
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

    const data: any = await fetchFromProvider('open-library', `https://openlibrary.org/search.json?${params}`, { timeout: 15000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });
    if (!data) {
      console.warn(`[SCOUT/OpenLibrary] Request failed`);
      return [];
    }
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

    const data: any = await fetchFromProvider('jstor', url, { timeout: 20000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });
    if (!data) {
      console.warn(`[SCOUT/JSTOR] Crossref request failed`);
      return [];
    }
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

// ─── UNESCO Digital Library (via DataHub Opendatasoft API) ────────
//
// UNESCO Digital Library (UNESDOC) hosts reports, publications,
// and policy documents. The old unesdoc.unesco.org/api/search endpoint
// returns 403. We use the official UNESCO DataHub Opendatasoft Explore API
// which provides access to the UNESDOC catalogue (dataset doc001).
//
// API: https://data.unesco.org/api/explore/v2.1
// Dataset: doc001 (UNESDOC Catalogue)
// No key required for public read access.

export async function searchUNESCO(query: string, limit = 15): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(limit, 30)),
      sort: '-date',
      lang: 'en',
    });

    const data: any = await fetchFromProvider('unesco',
      `https://data.unesco.org/api/explore/v2.1/catalog/datasets/doc001/records?${params}`,
      { timeout: 20000, retries: 2, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });
    if (!data) {
      console.warn(`[SCOUT/UNESCO] DataHub request failed`);
      return [];
    }
    const items = data?.records || data?.results || [];

    if (!Array.isArray(items)) return [];

    return items.slice(0, limit).map((item: any) => {
      const fields = item.record?.fields || item.fields || item;
      const title = fields.title || fields.titre || fields.name || 'Untitled';
      const description = fields.description || fields.abstract || fields.summary || null;
      const date = fields.date || fields.publication_date || fields.date_pub || null;
      const year = date ? parseInt(String(date).slice(0, 4)) : null;
      const docUrl = fields.url || fields.link || fields.uri || '';
      const docId = fields.id || fields.identifier || item.record?.id || Math.random();

      return {
        id: `unesco:${docId}`,
        provider: 'unesco',
        type: 'report',
        title,
        abstract: description,
        url: docUrl,
        doi: fields.doi || null,
        isbn: fields.isbn || null,
        year: year && !isNaN(year) ? year : null,
        publishedDate: date,
        authors: (fields.authors || fields.auteurs || fields.creator || []).map((a: any) => ({
          name: typeof a === 'string' ? a : a.name || a.nom || '',
        })),
        institutions: ['UNESCO'],
        citationCount: 0,
        qualityScore: 85,
        oaStatus: 'open',
        hasFullText: true,
        documentType: fields.type || fields.document_type || 'report',
        issuer: 'UNESCO',
        issuerType: 'international-body',
        classification: 'academic',
        language: fields.language || fields.langue || 'en',
        contentFormat: 'text',
        raw: fields,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/UNESCO] Error: ${err.message}`);
    return [];
  }
}
