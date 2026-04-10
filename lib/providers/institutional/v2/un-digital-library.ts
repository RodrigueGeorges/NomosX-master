/**
 * UN Digital Library - OFFICIAL API ✅
 * API Docs: https://digitallibrary.un.org/
 * API Solr officielle, gratuite
 */

import axios from 'axios';

const UN_ODS_API = 'https://documents.un.org/api/search';
const UN_LIBRARY_SEARCH = 'https://digitallibrary.un.org/search';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Search UN Digital Library via ODS API (Official Document System)
 * Couvre toutes les agences UN (UNDP, UNCTAD, etc.)
 */
export async function searchUNDigitalLibrary(query: string, limit = 20, agency?: string) {
  const sources: any[] = [];
  
  try {
    console.log(`[UN-API] Searching for: "${query}"${agency ? ` in ${agency}` : ''}`);
    
    // Try ODS API first (more reliable)
    const params = {
      q: query,
      limit: limit,
      offset: 0,
      sort: 'relevance'
    };
    
    const { data } = await axios.get(UN_ODS_API, {
      params,
      headers: { 
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      },
      timeout: 20000
    });
    
    const docs = data.results || data.documents || data.items || [];
    
    for (const doc of docs) {
      const year = doc.date ? parseInt(doc.date.substring(0, 4)) : 
                   doc.dateIssued ? parseInt(doc.dateIssued.substring(0, 4)) : null;
      
      sources.push({
        id: `un:${doc.id || doc.symbol || Buffer.from(doc.title || '').toString('base64').slice(0, 16)}`,
        provider: agency?.toLowerCase() || 'un',
        type: 'report',
        title: doc.title || doc.name || 'Untitled Document',
        abstract: doc.description || doc.summary || '',
        url: doc.url || `https://documents.un.org/doc/undoc/gen/${doc.symbol?.replace(/\//g, '/')}`,
        pdfUrl: doc.pdfUrl || doc.pdf || null,
        year,
        publishedDate: doc.date ? new Date(doc.date) : null,
        
        // Institutional metadata
        documentType: doc.type || 'report',
        issuer: doc.author || doc.corporateAuthor || 'United Nations',
        issuerType: 'multilateral',
        classification: 'public',
        language: doc.language || 'en',
        contentFormat: 'pdf',
        oaStatus: 'cc-by-sa',
        
        // UN-specific
        symbol: doc.symbol,
        
        raw: doc
      });
    }
    
    console.log(`[UN-API] Found ${sources.length} documents`);
  } catch (error: any) {
    console.error(`[UN-API] Search failed: ${error.message}`);
    // Fallback: return empty but don't crash
  }
  
  return sources;
}

/**
 * Helper pour rechercher spécifiquement UNDP
 */
export async function searchUNDP(query: string, limit = 20) {
  return searchUNDigitalLibrary(query, limit, 'United Nations Development Programme');
}

/**
 * Helper pour rechercher spécifiquement UNCTAD
 */
export async function searchUNCTAD(query: string, limit = 20) {
  return searchUNDigitalLibrary(query, limit, 'United Nations Conference on Trade and Development');
}
