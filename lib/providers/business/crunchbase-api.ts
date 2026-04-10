/**
 * CRUNCHBASE API - Business Company Search Provider
 * Recherche d'entreprises via Crunchbase (web scraping fallback)
 */

export async function searchCrunchbase(query: string, limit: number = 10): Promise<any[]> {
  try {
    // Note: Crunchbase requires API key, this is a web scraping fallback
    const response = await fetch(`https://www.crunchbase.com/search?q=${encodeURIComponent(query)}&page=1`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Crunchbase scraping error: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Simple scraping for company profiles
    const companyMatches = html.match(/crunchbase\.com\/[^\/]+\/[^\/]+/g) || [];
    const uniqueCompanies = [...new Set(companyMatches)];
    
    return uniqueCompanies.slice(0, limit).map((companyUrl: string, i: number) => {
      const companySlug = companyUrl.split('/')[2];
      
      return {
        id: `crunchbase:${Date.now()}-${i}`,
        provider: 'crunchbase',
        type: 'company',
        title: `Company: ${companySlug}`,
        abstract: `Company profile from Crunchbase - ${companySlug}`,
        url: `https://${companyUrl}`,
        pdfUrl: '',
        year: new Date().getFullYear(),
        authors: ['Crunchbase'],
        citationCount: 0,
        oaStatus: 'open',
        documentType: 'company-profile',
        issuer: 'Crunchbase',
        issuerType: 'database',
        classification: 'business',
        publishedDate: '',
        language: 'en',
        contentFormat: 'html',
        raw: { companyUrl, companySlug }
      };
    });
  } catch (error: any) {
    console.error('Crunchbase API error:', error.message);
    return [];
  }
}
