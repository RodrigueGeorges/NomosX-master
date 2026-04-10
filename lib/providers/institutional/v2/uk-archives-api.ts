/**
 * UK National Archives - OFFICIAL DISCOVERY API ✅
 * API Docs: https://www.nationalarchives.gov.uk/help/discovery-for-developers-about-the-application-programming-interface-api/
 * API officielle, gratuite, bien documentée
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const UK_DISCOVERY_API = 'http://discovery.nationalarchives.gov.uk/API/search/records';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

/**
 * Search UK National Archives via Discovery API
 * API officielle avec résultats structurés
 */
export async function searchUKArchives(query: string, limit = 20) {
  const sources: any[] = [];
  
  try {
    console.log(`[UK-Archives-API] Searching for: "${query}"`);
    
    const params = {
      'sps.searchQuery': query,
      'sps.recordsPerPage': limit,
      'sps.sortByOption': 'RELEVANCE'
    };
    
    const { data } = await axios.get(UK_DISCOVERY_API, {
      params,
      headers: { 
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      },
      timeout: 20000
    });
    
    // API retourne XML par défaut, mais accepte JSON
    const records = data.records || [];
    
    for (const record of records.slice(0, limit)) {
      const year = record.coveringDates ? 
        parseInt(record.coveringDates.match(/\d{4}/)?.[0] || '') : null;
      
      sources.push({
        id: `uk-archives:${record.id}`,
        provider: 'uk-archives',
        type: 'archival',
        title: record.title || 'Untitled Record',
        abstract: record.scopeContent?.description || '',
        url: `https://discovery.nationalarchives.gov.uk/details/r/${record.id}`,
        year,
        publishedDate: null,
        
        // Institutional metadata
        documentType: record.level || 'record',
        issuer: 'UK National Archives',
        issuerType: 'intelligence',
        classification: record.accessCondition === 'Open' ? 'unclassified' : 'restricted',
        language: 'en',
        contentFormat: 'digital',
        oaStatus: record.accessCondition === 'Open' ? 'public-domain' : 'restricted',
        hasFullText: record.accessCondition === 'Open',
        
        // UK-specific
        reference: record.reference,
        department: record.administrativeBackground,
        
        raw: record
      });
    }
    
    console.log(`[UK-Archives-API] Found ${sources.length} records`);
  } catch (error: any) {
    console.error(`[UK-Archives-API] Search failed: ${error.message}`);
  }
  
  return sources;
}
