/**
 * SciELO Provider — Scientific Electronic Library Online
 *
 * SciELO (scielo.org) is the premier open-access platform for Latin
 * American, Caribbean, African, and Iberian research. Indexes 1500+
 * journals with 1.5M+ articles, primarily in Portuguese, Spanish,
 * and English. Operated by BIREME/PAHO/WHO and FAPESP.
 *
 * API: Public REST API (JSON), no key required.
 * Docs: https://github.com/scieloorg/api
 *
 * KEY VALUE: Global South research, tropical medicine, public health,
 * social sciences from Latin America — perspectives systematically
 * absent from Scopus/Web of Science indexes.
 */

import { fetchFromProvider } from '../../http-client';

export async function searchSciELO(query: string, limit = 20): Promise<any[]> {
  const pageSize = Math.min(limit, 50);
  // SciELO API — article search endpoint
  const url = `https://api.scielo.org/v1/articles?q=${encodeURIComponent(query)}&count=${pageSize}&offset=0`;

  try {
    const data: any = await fetchFromProvider("scielo", url, {
      timeout: 12000,
      retries: 1,
      headers: {
        Accept: "application/json",
        "User-Agent": "NomosX Research Bot (+https://nomosx.com)",
        "Accept-Language": "pt,es,en;q=0.7",
      },
    });

    const articles: any[] = data?.articles || data?.items || data?.results || [];

    console.log(`[SciELO] Found ${articles.length} articles`);

    const papers = articles
      .filter((a: any) => a.title || (a.titles && a.titles.length > 0))
      .map((a: any) => {
        const titleEntry = a.titles?.find((t: any) => t.language === 'en') || a.titles?.[0];
        const title = titleEntry?.title || a.title || "";
        const abstractEntry = a.abstracts?.find((ab: any) => ab.language === 'en') || a.abstracts?.[0];
        const abstract = abstractEntry?.text || a.abstract || "";
        const abstractLen = abstract.length;
        const articleId = a.id || a._id || a.pid;
        const year = a.publicationYear || a.year || (a.processingDate ? new Date(a.processingDate).getFullYear() : null);

        return {
          id: `scielo:${articleId || encodeURIComponent(title).slice(0, 40)}`,
          provider: "scielo",
          type: "journal_article",
          title,
          abstract: abstract || null,
          year,
          doi: a.doi || null,
          url: a.url || (articleId ? `https://www.scielo.org/article/${articleId}` : null),
          pdfUrl: a.pdfUrl || a.fulltextPdf || null,
          oaStatus: "oa",
          authors: (a.authors || []).map((au: any) => ({
            name: au.name || `${au.givenNames || ''} ${au.surname || ''}`.trim() || "",
            institution: au.affiliation || au.institution || null,
          })).filter((au: any) => au.name),
          institutions: (a.affiliations || []).map((i: any) => i.institution || i.name || i).filter(Boolean),
          topics: a.keywords || a.subjects || [],
          jelCodes: [],
          citationCount: a.citationCount ?? null,
          language: a.originalLanguage || a.language || "pt",
          journal: a.journalTitle || a.journal || null,
          contentLength: abstractLen,
          hasFullText: !!a.pdfUrl || !!a.fulltextPdf,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : abstractLen >= 200 ? "acceptable" : "minimal",
          raw: a,
        };
      });

    console.log(`[SciELO] ${papers.length}/${articles.length} with metadata`);
    return papers;
  } catch (error: any) {
    console.error(`[SciELO] Search failed: ${error.message}`);
    return [];
  }
}
