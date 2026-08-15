/**
 * CyberLeninka Provider — Russian Open Access Academic Database
 *
 * CyberLeninka (cyberleninka.ru) is Russia's largest free open-access
 * scientific digital library. It indexes 2M+ Russian-language articles
 * from 1000+ journals across all disciplines, integrated with RSCI
 * (Russian Science Citation Index).
 *
 * API: Public search endpoint (JSON), no key required.
 * Lang: Primarily Russian, some English abstracts.
 *
 * KEY VALUE: Russian-language STEM, social sciences, and humanities
 * research not indexed in Western databases (Scopus/Web of Science).
 */

import { fetchFromProvider } from '../../http-client';

export async function searchCyberLeninka(query: string, limit = 20): Promise<any[]> {
  const pageSize = Math.min(limit, 50);
  // CyberLeninka search API — returns JSON with article metadata
  const url = `https://cyberleninka.ru/api/search?q=${encodeURIComponent(query)}&limit=${pageSize}&offset=0`;

  try {
    const data: any = await fetchFromProvider("cyberleninka", url, {
      timeout: 12000,
      retries: 1,
      headers: {
        Accept: "application/json",
        "User-Agent": "NomosX Research Bot (+https://nomosx.com)",
        "Accept-Language": "ru,en;q=0.8",
      },
    });

    const articles: any[] = data?.articles || data?.results || data?.data || [];

    console.log(`[CyberLeninka] Found ${articles.length} articles`);

    const papers = articles
      .filter((a: any) => a.title || a.name)
      .map((a: any) => {
        const abstract = a.abstract || a.annotation || a.summary || "";
        const abstractLen = abstract.length;
        const articleId = a.id || a._id || a.articleId;
        const year = a.year || a.publishYear || (a.date ? new Date(a.date).getFullYear() : null);

        return {
          id: `cyberleninka:${articleId || encodeURIComponent(a.title || a.name || '').slice(0, 40)}`,
          provider: "cyberleninka",
          type: "journal_article",
          title: a.title || a.name || "",
          abstract: abstract || null,
          year,
          doi: a.doi || null,
          url: articleId ? `https://cyberleninka.ru/article/n/${articleId}` : (a.url || null),
          pdfUrl: a.pdfUrl || null,
          oaStatus: "oa",
          authors: (a.authors || []).map((au: any) => ({
            name: typeof au === 'string' ? au : (au.name || au.fullName || ""),
            institution: typeof au === 'object' ? (au.affiliation || au.institution || null) : null,
          })).filter((au: any) => au.name),
          institutions: (a.affiliations || []).map((i: any) => typeof i === 'string' ? i : (i.name || i)).filter(Boolean),
          topics: a.keywords || a.tags || [],
          jelCodes: [],
          citationCount: a.citationCount ?? a.citations ?? null,
          language: a.language || "ru",
          contentLength: abstractLen,
          hasFullText: !!a.pdfUrl || !!a.fulltext,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : abstractLen >= 200 ? "acceptable" : "minimal",
          raw: a,
        };
      });

    console.log(`[CyberLeninka] ${papers.length}/${articles.length} with metadata`);
    return papers;
  } catch (error: any) {
    console.error(`[CyberLeninka] Search failed: ${error.message}`);
    return [];
  }
}
