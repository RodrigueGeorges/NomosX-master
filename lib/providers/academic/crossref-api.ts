/**
 * CROSSREF API - Academic Search Provider
 * Recherche de publications académiques via Crossref
 */

import { fetchFromProvider } from '../../http-client';

export async function searchCrossref(query: string, limit: number = 10): Promise<any[]> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`;
    const data: any = await fetchFromProvider("crossref", url, {
      timeout: 15000,
      retries: 4,
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
    });
    
    const items = data.message.items || [];
    console.log(`[Crossref] Found ${items.length} works for "${query.slice(0, 50)}"`);
    
    return items.map((item: any) => ({
      id: `crossref:${item.DOI}`,
      provider: 'crossref',
      type: 'academic',
      title: item.title?.[0] || 'No title',
      abstract: item.abstract || '',
      url: item.URL,
      pdfUrl: item.link?.find((link: any) => link['content-type'] === 'application/pdf')?.URL || '',
      year: item.published?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      authors: (item.author || []).map((a: any) => ({
        name: `${a.given} ${a.family}`.trim(),
      })).filter((a: any) => a.name),
      citationCount: item['is-referenced-by-count'] || 0,
      oaStatus: item.license ? 'open' : 'unknown',
      documentType: 'journal-article',
      issuer: item['container-title']?.[0] || '',
      issuerType: 'journal',
      classification: 'academic',
      publishedDate: item.published?.['date-parts']?.[0]?.join('-') || '',
      language: 'en',
      contentFormat: 'text',
      raw: item
    }));
  } catch (error: any) {
    console.error(`[Crossref] Search failed: ${error.message}`);
    return [];
  }
}
