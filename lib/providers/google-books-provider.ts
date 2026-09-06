/**
 * Google Books Provider — covers books, monographs, book chapters.
 * Free API, no key required (with rate limits). Key recommended for higher quota.
 *
 * API docs: https://developers.google.com/books/docs/overview
 * Endpoint: https://www.googleapis.com/books/v1/volumes
 */

import { fetchFromProvider } from '../http-client';

const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const GOOGLE_BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes";

export async function searchGoogleBooks(query: string, limit = 15): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(limit, 40)),
      printType: 'books',
    });

    if (GOOGLE_BOOKS_API_KEY) {
      params.set('key', GOOGLE_BOOKS_API_KEY);
    }

    const data: any = await fetchFromProvider('google-books', `${GOOGLE_BOOKS_ENDPOINT}?${params}`, {
      timeout: 20000,
      retries: 1,
      retryDelay: 3000,
    });

    const items = data?.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      // Fallback: Open Library (free, no key, same book coverage)
      try {
        const olParams = new URLSearchParams({
          q: query,
          limit: String(Math.min(limit, 20)),
          fields: 'key,title,author_name,first_publish_year,publisher,isbn,subject,language,edition_count',
        });
        const olData: any = await fetchFromProvider('google-books',
          `https://openlibrary.org/search.json?${olParams}`,
          { timeout: 15000, retries: 1, headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' } });
        const olDocs = olData?.docs || [];
        return olDocs.slice(0, limit).map((doc: any) => ({
          id: `google-books:ol-${doc.key?.split('/').pop() || Math.random()}`,
          provider: 'google-books',
          type: 'book',
          title: doc.title || 'Untitled',
          abstract: doc.subject?.slice(0, 10).join(', ') || null,
          url: `https://openlibrary.org${doc.key || ''}`,
          doi: null,
          isbn: doc.isbn?.[0] || null,
          year: doc.first_publish_year || null,
          publishedDate: null,
          authors: (Array.isArray(doc.author_name) ? doc.author_name : []).map((name: string) => ({ name })),
          institutions: (Array.isArray(doc.publisher) ? doc.publisher : []).slice(0, 2),
          citationCount: doc.edition_count || 0,
          qualityScore: 50,
          oaStatus: 'open',
          hasFullText: false,
          contentLength: 0,
          raw: doc,
        }));
      } catch {
        console.warn('[SCOUT/GoogleBooks] No results and Open Library fallback failed');
        return [];
      }
    }

    return items.slice(0, limit).map((item: any, idx: number) => {
      const info = item.volumeInfo || {};
      const id = item.id || '';
      const url = info.infoLink || `https://books.google.com/books?id=${id}`;
      const slug = id.replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = info.publishedDate || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
        else if (/^\d{4}/.test(publishedDate)) year = parseInt(publishedDate.slice(0, 4));
      }

      const authors = (Array.isArray(info.authors) ? info.authors : []).map((name: string) => ({ name })).filter((a: any) => a.name);

      const institutions: string[] = [];
      if (info.publisher) institutions.push(info.publisher);

      const isbn = info.industryIdentifiers?.find((i: any) => i.type === 'ISBN_13')?.identifier
        || info.industryIdentifiers?.find((i: any) => i.type === 'ISBN_10')?.identifier
        || null;

      return {
        id: `google-books:${slug || idx}`,
        provider: 'google-books',
        type: 'book',
        title: info.title || 'Untitled',
        abstract: info.description || null,
        url,
        doi: null,
        isbn,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: null,
        qualityScore: 55,
        oaStatus: info.accessInfo?.viewability === 'PARTIAL' ? 'partial' : 'closed',
        hasFullText: info.accessInfo?.viewability === 'ALL_PAGES',
        contentLength: info.description?.length || 0,
        raw: info,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/GoogleBooks] Error: ${err.message}`);
    return [];
  }
}
