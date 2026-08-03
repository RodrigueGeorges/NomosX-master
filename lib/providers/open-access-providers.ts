/**
 * Open Access Providers — 5 free APIs, no key required.
 *
 * 1. PLOS — Public Library of Science (Solr API) — OA science full-text
 * 2. Federal Register — US regulation & executive documents
 * 3. SEC EDGAR — US financial filings full-text search
 * 4. World Bank Documents & Reports — development research
 * 5. CORDIS — EU-funded research projects
 *
 * All follow the SCOUT normalized result shape (same as osti-provider).
 */

import { fetchFromProvider } from '../http-client';

function slugify(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();
}

// ============================================================================
// 1. PLOS — https://api.plos.org/solr/examples/
// ============================================================================

export async function searchPLOS(query: string, limit = 20): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: `everything:${query}`,
      fq: 'doc_type:full',
      fl: 'id,title,abstract,author_display,publication_date,journal,counter_total_all',
      wt: 'json',
      rows: String(Math.min(limit, 50)),
    });

    const data: any = await fetchFromProvider('plos', `https://api.plos.org/search?${params}`, {
      timeout: 15000,
      retries: 2,
      retryDelay: 2000,
    });

    const docs = data?.response?.docs || [];
    return docs.slice(0, limit).map((d: any, idx: number) => {
      const doi = d.id || '';
      const year = d.publication_date ? new Date(d.publication_date).getFullYear() : new Date().getFullYear();
      return {
        id: `plos:${slugify(doi) || idx}`,
        provider: 'plos',
        type: 'journal-article',
        title: d.title || 'Untitled',
        abstract: Array.isArray(d.abstract) ? d.abstract.join(' ').trim() : (d.abstract || null),
        url: doi ? `https://doi.org/${doi}` : null,
        doi: doi || null,
        year,
        publishedDate: d.publication_date || null,
        authors: (d.author_display || []).map((name: string) => ({ name })),
        institutions: d.journal ? [d.journal] : [],
        citationCount: null,
        qualityScore: 70,
        oaStatus: 'open',
        hasFullText: true,
        contentLength: (Array.isArray(d.abstract) ? d.abstract.join(' ') : d.abstract || '').length,
        raw: d,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/PLOS] Error: ${err.message}`);
    return [];
  }
}

// ============================================================================
// 2. Federal Register — https://www.federalregister.gov/developers/documentation/api/v1
// ============================================================================

export async function searchFederalRegister(query: string, limit = 15): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      'conditions[term]': query,
      'per_page': String(Math.min(limit, 50)),
      'order': 'relevance',
      'fields[]': 'title',
    });
    // fields[] must repeat — build manually
    const fields = ['title', 'abstract', 'document_number', 'publication_date', 'html_url', 'type', 'agencies']
      .map(f => `fields[]=${f}`).join('&');
    const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[term]=${encodeURIComponent(query)}&per_page=${Math.min(limit, 50)}&order=relevance&${fields}`;

    const data: any = await fetchFromProvider('federal-register', url, {
      timeout: 15000,
      retries: 2,
      retryDelay: 2000,
    });

    const results = data?.results || [];
    return results.slice(0, limit).map((d: any, idx: number) => {
      const year = d.publication_date ? new Date(d.publication_date).getFullYear() : new Date().getFullYear();
      return {
        id: `federal-register:${slugify(d.document_number || d.title || String(idx))}`,
        provider: 'federal-register',
        type: 'regulation',
        title: d.title || 'Untitled',
        abstract: d.abstract || null,
        url: d.html_url || null,
        doi: null,
        year,
        publishedDate: d.publication_date || null,
        authors: [],
        institutions: (d.agencies || []).map((a: any) => a.name || a.raw_name).filter(Boolean),
        citationCount: null,
        qualityScore: 65,
        oaStatus: 'open',
        hasFullText: true,
        contentLength: d.abstract?.length || 0,
        raw: d,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/FederalRegister] Error: ${err.message}`);
    return [];
  }
}

// ============================================================================
// 3. SEC EDGAR full-text search — https://efts.sec.gov/LATEST/search-index?q=
// ============================================================================

export async function searchSECEdgar(query: string, limit = 15): Promise<any[]> {
  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${query}"`)}&dateRange=custom&startdt=2020-01-01&enddt=${new Date().toISOString().slice(0, 10)}`;

    const data: any = await fetchFromProvider('sec-edgar', url, {
      timeout: 15000,
      retries: 2,
      retryDelay: 2000,
      headers: {
        // SEC requires a declared User-Agent
        'User-Agent': 'NomosX Research contact@nomosx.com',
        'Accept': 'application/json',
      },
    });

    const hits = data?.hits?.hits || [];
    return hits.slice(0, limit).map((h: any, idx: number) => {
      const src = h._source || {};
      const adsh = (src.adsh || '').replace(/-/g, '');
      const cik = (src.ciks || [])[0] || '';
      const fileDate = src.file_date || null;
      const year = fileDate ? new Date(fileDate).getFullYear() : new Date().getFullYear();
      const displayNames = src.display_names || [];
      const url2 = cik && adsh
        ? `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${adsh}/${h._id?.split(':')[1] || ''}`
        : `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}`;
      return {
        id: `sec-edgar:${slugify(h._id || String(idx))}`,
        provider: 'sec-edgar',
        type: 'filing',
        title: `${displayNames[0] || 'SEC Filing'} — ${src.form || ''} (${fileDate || 'n.d.'})`,
        abstract: null,
        url: url2,
        doi: null,
        year,
        publishedDate: fileDate,
        authors: [],
        institutions: displayNames,
        citationCount: null,
        qualityScore: 60,
        oaStatus: 'open',
        hasFullText: true,
        contentLength: 0,
        raw: src,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/SECEdgar] Error: ${err.message}`);
    return [];
  }
}

// ============================================================================
// 4. World Bank Documents & Reports — https://documents.worldbank.org/en/publication/documents-reports/api
// ============================================================================

export async function searchWorldBankDocs(query: string, limit = 15): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      format: 'json',
      qterm: query,
      rows: String(Math.min(limit, 50)),
      fl: 'docna,abstracts,url,docdt,display_title,pdfurl,count',
      srt: 'score',
      order: 'desc',
    });

    const data: any = await fetchFromProvider('worldbank-docs', `https://search.worldbank.org/api/v3/wds?${params}`, {
      timeout: 20000,
      retries: 2,
      retryDelay: 2000,
    });

    const docs = Object.values(data?.documents || {}).filter((d: any) => d && typeof d === 'object' && (d.display_title || d.docna));
    return docs.slice(0, limit).map((d: any, idx: number) => {
      const title = typeof d.display_title === 'string' ? d.display_title : (d.docna?.[0]?.docna || 'Untitled');
      const abstract = d.abstracts?.['cdata!'] || d.abstracts || null;
      const year = d.docdt ? new Date(d.docdt).getFullYear() : new Date().getFullYear();
      return {
        id: `worldbank-docs:${slugify(d.id || title || String(idx))}`,
        provider: 'worldbank-docs',
        type: 'report',
        title,
        abstract: typeof abstract === 'string' ? abstract : null,
        url: d.url || d.pdfurl || null,
        doi: null,
        year,
        publishedDate: d.docdt || null,
        authors: [],
        institutions: ['World Bank'],
        citationCount: null,
        qualityScore: 68,
        oaStatus: 'open',
        hasFullText: !!d.pdfurl,
        contentLength: typeof abstract === 'string' ? abstract.length : 0,
        raw: d,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/WorldBankDocs] Error: ${err.message}`);
    return [];
  }
}

// ============================================================================
// 5. CORDIS — EU research projects — https://cordis.europa.eu/about/search-api
// ============================================================================

export async function searchCORDIS(query: string, limit = 15): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: `'${query}'`,
      format: 'json',
      num: String(Math.min(limit, 50)),
      p: '1',
    });

    const data: any = await fetchFromProvider('cordis', `https://cordis.europa.eu/api/search/results?${params}`, {
      timeout: 20000,
      retries: 2,
      retryDelay: 2000,
    });

    const results = data?.payload?.results || data?.results || [];
    return results.slice(0, limit).map((r: any, idx: number) => {
      const year = r.startDate ? new Date(r.startDate).getFullYear()
        : r.contentUpdateDate ? new Date(r.contentUpdateDate).getFullYear()
        : new Date().getFullYear();
      return {
        id: `cordis:${slugify(r.rcn || r.id || r.title || String(idx))}`,
        provider: 'cordis',
        type: 'research-project',
        title: r.title || 'Untitled',
        abstract: r.teaser || r.objective || null,
        url: r.rcn ? `https://cordis.europa.eu/project/rcn/${r.rcn}` : (r.url || null),
        doi: null,
        year,
        publishedDate: r.startDate || null,
        authors: [],
        institutions: r.coordinator ? [r.coordinator] : ['European Commission'],
        citationCount: null,
        qualityScore: 62,
        oaStatus: 'open',
        hasFullText: false,
        contentLength: (r.teaser || r.objective || '').length,
        raw: r,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/CORDIS] Error: ${err.message}`);
    return [];
  }
}
