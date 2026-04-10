/**
 * ZENODO API - Data Repository Search Provider
 * Recherche de datasets et publications via Zenodo
 */

export async function searchZenodo(query: string, limit: number = 10): Promise<any[]> {
  try {
    const response = await fetch(`https://zenodo.org/api/records?q=${encodeURIComponent(query)}&size=${limit}`, {
      headers: {
        'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Zenodo API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.hits.hits.map((hit: any) => ({
      id: `zenodo:${hit.id}`,
      provider: 'zenodo',
      type: hit.metadata?.resource_type?.type || 'unknown',
      title: hit.metadata?.title || 'No title',
      abstract: hit.metadata?.description || '',
      url: hit.links?.self || '',
      pdfUrl: '',
      year: new Date(hit.metadata?.publication_date).getFullYear(),
      authors: hit.metadata?.creators?.map((c: any) => c.name) || [],
      citationCount: 0,
      oaStatus: 'open',
      documentType: hit.metadata?.resource_type?.type || 'unknown',
      issuer: 'Zenodo',
      issuerType: 'repository',
      classification: 'data',
      publishedDate: hit.metadata?.publication_date || '',
      language: hit.metadata?.language || 'en',
      contentFormat: 'mixed',
      raw: hit
    }));
  } catch (error: any) {
    console.error('Zenodo API error:', error.message);
    return [];
  }
}
