/**
 * J-STAGE Provider — Japan Science and Technology Agency (JST)
 *
 * J-STAGE (jstage.jst.go.jp) is Japan's largest platform for academic
 * publications, hosting 3000+ Japanese journals across all disciplines.
 * Developed and operated by JST. Contains 3M+ articles, many with English
 * abstracts even when the full text is in Japanese.
 *
 * API: Public REST API (JSON), no key required.
 * Docs: https://www.jstage.jst.go.jp/site/api/
 *
 * KEY VALUE: Japanese-language research, unique STEM and social science
 * perspectives from Japan, often not indexed in Western databases.
 */

import { fetchFromProvider } from '../../http-client';

export async function searchJStage(query: string, limit = 20): Promise<any[]> {
  const pageSize = Math.min(limit, 50);
  // J-STAGE search API — returns JSON with article metadata
  const url = `https://www.jstage.jst.go.jp/api/publications/search?q=${encodeURIComponent(query)}&count=${pageSize}&start=1`;

  try {
    const data: any = await fetchFromProvider("jstage", url, {
      timeout: 12000,
      retries: 1,
      headers: {
        Accept: "application/json",
        "User-Agent": "NomosX Research Bot (+https://nomosx.com)",
        "Accept-Language": "ja,en;q=0.8",
      },
    });

    const articles: any[] = data?.results || data?.publications || data?.items || [];

    console.log(`[J-STAGE] Found ${articles.length} articles`);

    const papers = articles
      .filter((a: any) => a.title || a.articleTitle)
      .map((a: any) => {
        const title = a.title || a.articleTitle || "";
        const abstract = a.abstract || a.summary || "";
        const abstractLen = abstract.length;
        const articleId = a.id || a.publicationId || a.articleId;
        const year = a.publicationYear || a.year || (a.publicationDate ? new Date(a.publicationDate).getFullYear() : null);

        return {
          id: `jstage:${articleId || encodeURIComponent(title).slice(0, 40)}`,
          provider: "jstage",
          type: "journal_article",
          title,
          abstract: abstract || null,
          year,
          doi: a.doi || a.DOI || null,
          url: a.url || (articleId ? `https://www.jstage.jst.go.jp/article/${articleId}` : null),
          pdfUrl: a.pdfUrl || null,
          oaStatus: a.openAccess ? "oa" : "closed",
          authors: (a.authors || a.creator || []).map((au: any) => ({
            name: typeof au === 'string' ? au : (au.name || au.fullName || au.author || ""),
            institution: typeof au === 'object' ? (au.affiliation || au.institution || null) : null,
          })).filter((au: any) => au.name),
          institutions: (a.affiliations || []).map((i: any) => typeof i === 'string' ? i : (i.name || i)).filter(Boolean),
          topics: a.keywords || a.subjects || [],
          jelCodes: [],
          citationCount: a.citationCount ?? null,
          language: a.language || "ja",
          journal: a.journalTitle || a.containerTitle || null,
          contentLength: abstractLen,
          hasFullText: !!a.pdfUrl || !!a.fulltext,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : abstractLen >= 200 ? "acceptable" : "minimal",
          raw: a,
        };
      });

    console.log(`[J-STAGE] ${papers.length}/${articles.length} with metadata`);
    return papers;
  } catch (error: any) {
    console.error(`[J-STAGE] Search failed: ${error.message}`);
    return [];
  }
}
