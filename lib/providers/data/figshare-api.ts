/**
 * FIGSHARE API - Data Repository Search Provider
 * Recherche de datasets via Figshare
 */

export async function searchFigshare(query: string, limit: number = 10): Promise<any[]> {
  try {
    const response = await fetch(`https://api.figshare.com/v2/articles?search=${encodeURIComponent(query)}&page_size=${limit}`, {
      headers: {
        'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Figshare API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.map((item: any) => ({
      id: `figshare:${item.id}`,
      provider: 'figshare',
      type: 'dataset',
      title: item.title || 'No title',
      abstract: item.description || '',
      url: item.url || '',
      pdfUrl: '',
      year: new Date(item.published_date).getFullYear(),
      authors: item.authors?.map((a: any) => a.full_name) || [],
      citationCount: 0,
      oaStatus: 'open',
      documentType: 'dataset',
      issuer: 'Figshare',
      issuerType: 'repository',
      classification: 'data',
      publishedDate: item.published_date || '',
      language: 'en',
      contentFormat: 'mixed',
      raw: item
    }));
  } catch (error: any) {
    console.error('Figshare API error:', error.message);
    return [];
  }
}
