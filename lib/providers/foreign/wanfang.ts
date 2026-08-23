/**
 * Wanfang Data Provider — Chinese Academic Database
 *
 * Wanfang Data (wanfangdata.com.cn) is one of China's three major
 * academic databases (alongside CNKI and CQVIP). It indexes Chinese
 * journals, dissertations, conference papers, patents, standards,
 * and technical reports. Contains 80M+ records across all disciplines.
 *
 * API: Open API requiring X-Ca-AppKey + Authorization (APPCODE) headers.
 *   Set WANFANG_APPKEY and WANFANG_APPCODE environment variables.
 * Docs: https://github.com/wanfangdata/wfdata-open-skills
 *
 * KEY VALUE: Chinese-language research — STEM, social sciences, policy,
 * and technical reports not indexed in Western databases. Essential for
 * understanding Chinese academic discourse on any topic.
 *
 * Graceful skip: If WANFANG_APPKEY is not set, returns empty array.
 */

import { httpPost } from '../../http-client';

export async function searchWanfang(query: string, limit = 20): Promise<any[]> {
  const appKey = process.env.WANFANG_APPKEY;
  const appCode = process.env.WANFANG_APPCODE;

  if (!appKey || !appCode) {
    console.log('[Wanfang] No WANFANG_APPKEY/WANFANG_APPCODE set, skipping');
    return [];
  }

  const pageSize = Math.min(limit, 50);
  // Wanfang Open API — keyword search across periodicals and theses
  const url = `https://api.wanfangdata.com.cn/open/search/query`;
  const body = {
    query,
    collections: ["OpenPeriodical", "OpenThesis", "OpenConference"],
    rows: pageSize,
    start: 0,
  };

  try {
    const data: any = await httpPost(url, body, {
      timeout: 12000,
      retries: 2,
      headers: {
        'X-Ca-AppKey': appKey,
        'Authorization': `APPCODE ${appCode}`,
        'Accept': 'application/json',
        "User-Agent": "NomosX Research Bot (+https://nomosx.com)",
        "Accept-Language": "zh,en;q=0.8",
      },
    });
    if (!data) {
      console.warn(`[Wanfang] No data returned`);
      return [];
    }

    const articles: any[] = data?.results || data?.data || data?.records || [];

    console.log(`[Wanfang] Found ${articles.length} articles`);

    const papers = articles
      .filter((a: any) => a.title || a.docTitle)
      .map((a: any) => {
        const title = a.title || a.docTitle || "";
        const abstract = a.abstract || a.summary || a.description || "";
        const abstractLen = abstract.length;
        const docId = a.id || a.docId || a._id;
        const year = a.year || a.publishYear || a.publishDate?.slice(0, 4) || null;

        return {
          id: `wanfang:${docId || encodeURIComponent(title).slice(0, 40)}`,
          provider: "wanfang",
          type: a.collectionType === 'OpenThesis' ? 'thesis' : a.collectionType === 'OpenConference' ? 'conference_paper' : 'journal_article',
          title,
          abstract: abstract || null,
          year,
          doi: a.doi || null,
          url: a.url || (docId ? `https://d.wanfangdata.com.cn/periodical/${docId}` : null),
          pdfUrl: a.pdfUrl || null,
          oaStatus: "oa",
          authors: (a.authors || []).map((au: any) => ({
            name: typeof au === 'string' ? au : (au.name || au.author || ""),
            institution: typeof au === 'object' ? (au.affiliation || au.institution || null) : null,
          })).filter((au: any) => au.name),
          institutions: (a.institutions || a.affiliations || []).map((i: any) => typeof i === 'string' ? i : (i.name || i)).filter(Boolean),
          topics: a.keywords || a.subjects || [],
          jelCodes: [],
          citationCount: a.citationCount ?? null,
          language: a.language || "zh",
          journal: a.journalTitle || a.source || null,
          contentLength: abstractLen,
          hasFullText: !!a.pdfUrl,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : abstractLen >= 200 ? "acceptable" : "minimal",
          raw: a,
        };
      });

    console.log(`[Wanfang] ${papers.length}/${articles.length} with metadata`);
    return papers;
  } catch (error: any) {
    console.error(`[Wanfang] Search failed: ${error.message}`);
    return [];
  }
}
