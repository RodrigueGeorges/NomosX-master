/**
 * PUBMED API - Academic Medical Search Provider
 * Recherche de publications médicales via PubMed
 */

export async function searchPubMed(query: string, limit: number = 10): Promise<any[]> {
  try {
    // Search step
    const searchResponse = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json`, {
      headers: {
        'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)'
      }
    });
    
    if (!searchResponse.ok) {
      throw new Error(`PubMed search error: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    const pmids = searchData.esearchresult.idlist;
    
    if (!pmids.length) return [];
    
    // Fetch details
    const summaryResponse = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`, {
      headers: {
        'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)'
      }
    });
    
    if (!summaryResponse.ok) {
      throw new Error(`PubMed summary error: ${summaryResponse.status}`);
    }
    
    const summaryData = await summaryResponse.json();
    
    return Object.entries(summaryData.result).filter(([key]) => key !== 'uids').map(([pmid, item]: [string, any]) => ({
      id: `pubmed:${pmid}`,
      provider: 'pubmed',
      type: 'academic',
      title: item.title || 'No title',
      abstract: '', // Would need efetch for abstract
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}`,
      pdfUrl: '',
      year: parseInt(item.pubdate?.split(' ')[0] || new Date().getFullYear()),
      authors: item.authors?.map((a: any) => a.name) || [],
      citationCount: 0, // PubMed doesn't provide citation count in summary
      oaStatus: 'unknown',
      documentType: 'journal-article',
      issuer: item.source || '',
      issuerType: 'journal',
      classification: 'medical',
      publishedDate: item.pubdate || '',
      language: 'en',
      contentFormat: 'text',
      raw: item
    }));
  } catch (error: any) {
    console.error('PubMed API error:', error.message);
    return [];
  }
}
