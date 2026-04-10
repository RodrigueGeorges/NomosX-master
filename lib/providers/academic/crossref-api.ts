/**
 * CROSSREF API - Academic Search Provider
 * Recherche de publications académiques via Crossref
 */

export async function searchCrossref(query: string, limit: number = 10): Promise<any[]> {
  try {
    const response = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`, {
      headers: {
        'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Crossref API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.message.items.map((item: any) => ({
      id: `crossref:${item.DOI}`,
      provider: 'crossref',
      type: 'academic',
      title: item.title?.[0] || 'No title',
      abstract: item.abstract || '',
      url: item.URL,
      pdfUrl: item.link?.find((link: any) => link['content-type'] === 'application/pdf')?.URL || '',
      year: item.published?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      authors: item.author?.map((a: any) => `${a.given} ${a.family}`) || [],
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
    console.error('Crossref API error:', error.message);
    return [];
  }
}
