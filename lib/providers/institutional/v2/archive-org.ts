/**
 * Archive.org Advanced Search API
 * SOLUTION pour CIA FOIA, documents historiques
 * API gratuite, très stable
 */

import axios from 'axios';

const ARCHIVE_API_BASE = 'https://archive.org/advancedsearch.php';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

/**
 * Search Archive.org collections
 * Beaucoup de docs gouvernementaux déclassifiés ici !
 */
export async function searchArchiveOrg(
  query: string,
  collection: string,
  limit = 20
) {
  const sources: any[] = [];
  
  try {
    console.log(`[Archive.org] Searching "${query}" in collection: ${collection}`);
    
    const fullQuery = `${query} AND collection:${collection}`;
    
    const params = {
      q: fullQuery,
      rows: limit,
      page: 1,
      output: 'json',
      'fl[]': ['identifier', 'title', 'description', 'date', 'subject', 'creator', 'format', 'downloads']
    };
    
    const { data } = await axios.get(ARCHIVE_API_BASE, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    if (data.response?.docs) {
      for (const doc of data.response.docs) {
        const year = doc.date ? parseInt(doc.date.match(/\d{4}/)?.[0] || '') : null;
        
        sources.push({
          id: `archive-org:${doc.identifier}`,
          provider: collectionToProvider(collection),
          type: 'archival',
          title: doc.title || 'Untitled Document',
          abstract: doc.description || '',
          url: `https://archive.org/details/${doc.identifier}`,
          pdfUrl: doc.format?.includes('PDF') ? `https://archive.org/download/${doc.identifier}/${doc.identifier}.pdf` : null,
          year,
          publishedDate: doc.date ? new Date(doc.date) : null,
          
          // Metadata
          documentType: 'declassified',
          issuer: collectionToIssuer(collection),
          issuerType: 'intelligence',
          classification: 'declassified',
          language: 'en',
          contentFormat: doc.format || 'pdf',
          oaStatus: 'public-domain',
          hasFullText: true,
          
          // Archive.org specific
          downloads: doc.downloads || 0,
          
          raw: doc
        });
      }
    }
    
    console.log(`[Archive.org] Found ${sources.length} documents`);
  } catch (error: any) {
    console.error(`[Archive.org] Search failed: ${error.message}`);
  }
  
  return sources;
}

/**
 * CIA FOIA via Archive.org
 * Collection massive de docs déclassifiés CIA
 */
export async function searchCIAFOIAViaArchive(query: string, limit = 20) {
  return searchArchiveOrg(query, 'cia-collection', limit);
}

/**
 * FBI Records via Archive.org
 */
export async function searchFBIViaArchive(query: string, limit = 20) {
  return searchArchiveOrg(query, 'fbifiles', limit);
}

/**
 * JFK Assassination Records
 */
export async function searchJFKRecords(query: string, limit = 20) {
  return searchArchiveOrg(query, 'jfk-assassination-records', limit);
}

// Helpers
function collectionToProvider(collection: string): string {
  const map: Record<string, string> = {
    'cia-collection': 'cia-foia',
    'fbifiles': 'fbi',
    'jfk-assassination-records': 'nara'
  };
  return map[collection] || 'archive-org';
}

function collectionToIssuer(collection: string): string {
  const map: Record<string, string> = {
    'cia-collection': 'CIA',
    'fbifiles': 'FBI',
    'jfk-assassination-records': 'NARA'
  };
  return map[collection] || 'Unknown';
}
