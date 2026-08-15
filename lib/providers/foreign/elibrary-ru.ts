/**
 * eLibrary.ru Provider — Russian Scientific Electronic Library
 *
 * eLibrary.ru is Russia's largest academic e-library, integrated with
 * RSCI (Russian Science Citation Index). Contains 30M+ publications
 * from 20000+ Russian and international journals. Operated by the
 * Russian Foundation for Basic Research.
 *
 * API: Official API requires organizational license + Science Index access.
 *   Set ELIBRARY_API_TOKEN environment variable if you have API access.
 *   Without it, falls back to ethical scraping of the public search page.
 *
 * Scraping approach: Uses the public search HTML page with respectful
 * rate limiting (1 req/3s), proper User-Agent, and robots.txt compliance.
 *
 * KEY VALUE: Russian-language research across all disciplines, including
 * publications from Russian Academy of Sciences (RAS) institutes.
 *
 * Graceful skip: If no API token and scraping fails, returns empty array.
 */

import { fetchFromProvider } from '../../http-client';

export async function searchELibrary(query: string, limit = 20): Promise<any[]> {
  const apiToken = process.env.ELIBRARY_API_TOKEN;
  const pageSize = Math.min(limit, 25);

  // ── PRIORITY 1: Official API (if token available) ──
  if (apiToken) {
    try {
      const url = `https://elibrary.ru/api/publications/search?query=${encodeURIComponent(query)}&limit=${pageSize}&apikey=${apiToken}`;
      const data: any = await fetchFromProvider("elibrary-ru", url, {
        timeout: 12000,
        retries: 1,
        headers: {
          Accept: "application/json",
          "User-Agent": "NomosX Research Bot (+https://nomosx.com)",
        },
      });
      const articles = data?.publications || data?.results || [];
      if (articles.length > 0) {
        return parseELibraryArticles(articles, 'elibrary-ru');
      }
    } catch (error: any) {
      console.warn(`[eLibrary.ru] API failed, falling back to scraping: ${error.message}`);
    }
  }

  // ── PRIORITY 2: Ethical scraping of public search ──
  try {
    const url = `https://elibrary.ru/search.asp?q=${encodeURIComponent(query)}&search_open=1&items_per_page=${pageSize}`;
    const html: string = await fetchFromProvider("elibrary-ru", url, {
      timeout: 15000,
      retries: 1,
      headers: {
        Accept: "text/html",
        "User-Agent": "NomosX Research Bot (+https://nomosx.com)",
        "Accept-Language": "ru,en;q=0.8",
      },
    });

    // Parse HTML table rows — eLibrary search results are in table.rezsultstr
    const articles = parseELibraryHTML(html, pageSize);
    return parseELibraryArticles(articles, 'elibrary-ru');
  } catch (error: any) {
    console.error(`[eLibrary.ru] Search failed: ${error.message}`);
    return [];
  }
}

function parseELibraryHTML(html: string, limit: number): any[] {
  const articles: any[] = [];
  // Extract article entries from the HTML table
  // eLibrary uses <tr> rows with class patterns for results
  const rowRegex = /<tr[^>]*class="[^"]*(?:result|res)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;

  while ((match = rowRegex.exec(html)) !== null && articles.length < limit) {
    const rowHtml = match[1];
    // Extract title from links
    const titleMatch = rowHtml.match(/<a[^>]*href="([^"]*item\.asp\?id=([^"]+))"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const url = titleMatch[1].startsWith('http') ? titleMatch[1] : `https://elibrary.ru/${titleMatch[1]}`;
    const articleId = titleMatch[2];
    const title = titleMatch[3].replace(/<[^>]+>/g, '').trim();

    // Extract year from the row
    const yearMatch = rowHtml.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0]) : null;

    // Extract authors
    const authorMatches = rowHtml.matchAll(/<a[^>]*href="[^"]*authoritem[^"]*"[^>]*>([\s\S]*?)<\/a>/gi);
    const authors = Array.from(authorMatches).map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);

    articles.push({
      id: articleId,
      title,
      url,
      year,
      authors: authors.map(a => ({ name: a })),
      abstract: null, // eLibrary search page doesn't show abstracts
      doi: null,
      raw: { html: rowHtml.slice(0, 500) },
    });
  }

  return articles;
}

function parseELibraryArticles(articles: any[], provider: string): any[] {
  console.log(`[eLibrary.ru] Found ${articles.length} articles`);

  const papers = articles
    .filter((a: any) => a.title)
    .map((a: any) => {
      const abstract = a.abstract || a.annotation || "";
      const abstractLen = abstract.length;
      const articleId = a.id || a._id || a.publicationId;

      return {
        id: `elibrary-ru:${articleId || encodeURIComponent(a.title).slice(0, 40)}`,
        provider,
        type: "journal_article",
        title: a.title || "",
        abstract: abstract || null,
        year: a.year || a.publicationYear || null,
        doi: a.doi || null,
        url: a.url || (articleId ? `https://elibrary.ru/item.asp?id=${articleId}` : null),
        pdfUrl: a.pdfUrl || null,
        oaStatus: "oa",
        authors: (a.authors || []).map((au: any) => ({
          name: typeof au === 'string' ? au : (au.name || au.fullName || ""),
          institution: typeof au === 'object' ? (au.affiliation || au.institution || null) : null,
        })).filter((au: any) => au.name),
        institutions: (a.institutions || a.affiliations || []).map((i: any) => typeof i === 'string' ? i : (i.name || i)).filter(Boolean),
        topics: a.keywords || [],
        jelCodes: [],
        citationCount: a.citationCount ?? null,
        language: a.language || "ru",
        contentLength: abstractLen,
        hasFullText: !!a.pdfUrl,
        contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : abstractLen >= 200 ? "acceptable" : "minimal",
        raw: a,
      };
    });

  console.log(`[eLibrary.ru] ${papers.length}/${articles.length} with metadata`);
  return papers;
}
