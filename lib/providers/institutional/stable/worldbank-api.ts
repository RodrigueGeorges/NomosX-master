/**
 * World Bank API - STABLE & PRODUCTION-READY
 * API Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 */

import axios from 'axios';

const WB_API_BASE = 'https://search.worldbank.org/api/v2/wds';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

/**
 * Search World Bank documents via official API
 * 100% fiable, maintenu par World Bank
 */
export async function searchWorldBankAPI(query: string, limit = 15) {
  const sources: any[] = [];
  
  try {
    console.log(`[WorldBank-API] Searching for: "${query}"`);
    
    const params = {
      format: 'json',
      qterm: query,
      rows: limit,
      fl: 'id,docty,display_title,abstracts,docdt,pdfurl,url'
    };
    
    const { data } = await axios.get(WB_API_BASE, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    if (data.documents) {
      // L'API retourne un objet {D123: {...}, D456: {...}}, pas un array
      const docs = typeof data.documents === 'object' && !Array.isArray(data.documents)
        ? Object.values(data.documents)
        : data.documents;
      
      for (const doc of docs) {
        // Skip facets or non-document entries
        if (!doc || typeof doc !== 'object' || !doc.id) continue;
        
        const year = doc.docdt ? parseInt(doc.docdt.substring(0, 4)) : new Date().getFullYear();
        const abstractText = doc.abstracts?.['cdata!'] || doc.abstracts || '';
        
        sources.push({
          id: `worldbank:${doc.id}`,
          provider: 'worldbank',
          type: 'report',
          title: doc.display_title || doc.repnme?.repnme || 'Untitled',
          abstract: typeof abstractText === 'string' ? abstractText : '',
          url: doc.url || `https://documents.worldbank.org/en/publication/documents-reports/documentdetail/${doc.guid || doc.id}`,
          pdfUrl: doc.pdfurl || null,
          year,
          publishedDate: doc.docdt ? new Date(doc.docdt) : null,
          
          // Institutional metadata
          documentType: doc.docty === 'Working Paper' ? 'working-paper' : (doc.docty?.toLowerCase() || 'report'),
          issuer: 'World Bank',
          issuerType: 'economic',
          classification: 'public',
          language: doc.lang || 'en',
          contentFormat: doc.pdfurl ? 'pdf' : 'html',
          oaStatus: 'cc-by',
          
          raw: doc
        });
      }
    }
    
    console.log(`[WorldBank-API] Found ${sources.length} documents`);
  } catch (error: any) {
    console.error(`[WorldBank-API] Search failed: ${error.message}`);
  }
  
  return sources;
}
