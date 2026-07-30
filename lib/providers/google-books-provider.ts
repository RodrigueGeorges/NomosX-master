/**
 * Google Books Provider — covers books, monographs, book chapters.
 * Free API, no key required (with rate limits). Key recommended for higher quota.
 *
 * API docs: https://developers.google.com/books/docs/overview
 * Endpoint: https://www.googleapis.com/books/v1/volumes
 */

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

    const response = await fetch(`${GOOGLE_BOOKS_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/GoogleBooks] HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const items = data?.items || [];

    if (!Array.isArray(items)) {
      console.warn('[SCOUT/GoogleBooks] unexpected response format');
      return [];
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

      const authors = (info.authors || []).map((name: string) => ({ name })).filter((a: any) => a.name);

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
