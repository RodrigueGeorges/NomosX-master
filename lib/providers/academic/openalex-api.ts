/**
 * OPENALEX API - Academic Search Provider
 * Recherche de publications académiques via OpenAlex
 */

export async function searchOpenAlex(query: string, limit: number = 10): Promise<any[]> {
  try {
    const response = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}`, {
      headers: {
        'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.results.map((item: any) => ({
      id: `openalex:${item.id}`,
      provider: 'openalex',
      type: 'academic',
      title: item.title || 'No title',
      abstract: item.abstract || '',
      url: item.id,
      pdfUrl: item.primary_location?.pdf_url || '',
      year: item.publication_year || new Date().getFullYear(),
      authors: item.authorships?.map((a: any) => a.author.display_name) || [],
      citationCount: item.cited_by_count || 0,
      oaStatus: item.open_access?.is_oa ? 'open' : 'closed',
      documentType: item.type || 'unknown',
      issuer: item.primary_location?.source?.display_name || '',
      issuerType: 'journal',
      classification: 'academic',
      publishedDate: item.publication_date || '',
      language: 'en',
      contentFormat: 'text',
      raw: item
    }));
  } catch (error: any) {
    console.error('OpenAlex API error:', error.message);
    return [];
  }
}
