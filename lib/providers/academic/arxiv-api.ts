/**
 * ARXIV API - Academic Preprint Search Provider
 * Recherche de preprints via arXiv
 */

export async function searchArXiv(query: string, limit: number = 10): Promise<any[]> {
  try {
    const response = await fetch(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${limit}`, {
      headers: {
        'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`arXiv API error: ${response.status}`);
    }
    
    const xmlText = await response.text();
    
    // Simple XML parsing
    const entries = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    
    return entries.map((entry: string) => {
      const titleMatch = entry.match(/<title>(.*?)<\/title>/);
      const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/);
      const idMatch = entry.match(/<id>(.*?)<\/id>/);
      const yearMatch = entry.match(/<published>(\d{4})<\/published>/);
      const authorMatches = entry.matchAll(/<name>(.*?)<\/name>/g);
      
      return {
        id: `arxiv:${idMatch?.[1] || Date.now()}`,
        provider: 'arxiv',
        type: 'preprint',
        title: titleMatch?.[1] || 'No title',
        abstract: summaryMatch?.[1] || '',
        url: idMatch?.[1] || '',
        pdfUrl: idMatch?.[1]?.replace('/abs/', '/pdf/') + '.pdf' || '',
        year: parseInt(String(yearMatch?.[1] || new Date().getFullYear())),
        authors: Array.from(authorMatches).map(match => match[1]) || [],
        citationCount: 0, // arXiv doesn't provide citation count
        oaStatus: 'open',
        documentType: 'preprint',
        issuer: 'arXiv',
        issuerType: 'repository',
        classification: 'academic',
        publishedDate: '',
        language: 'en',
        contentFormat: 'text',
        raw: entry
      };
    });
  } catch (error: any) {
    console.error('arXiv API error:', error.message);
    return [];
  }
}
