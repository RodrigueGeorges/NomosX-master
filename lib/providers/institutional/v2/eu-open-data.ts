/**
 * EU Open Data Portal API
 * SOLUTION pour EEAS, EDA, ENISA
 * API officielle, gratuite
 */

import axios from 'axios';

const EU_DATA_API = 'https://data.europa.eu/api/hub/search/datasets';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

/**
 * Search EU Open Data Portal
 * Agrège toutes les institutions EU
 */
export async function searchEUOpenData(
  query: string,
  publisher?: string,
  limit = 20
) {
  const sources: any[] = [];
  
  try {
    console.log(`[EU-OpenData] Searching "${query}"${publisher ? ` by ${publisher}` : ''}`);
    
    const params: any = {
      q: query,
      limit,
      sort: 'relevance+desc'
    };
    
    if (publisher) {
      params['filter[publisher]'] = publisher;
    }
    
    const { data } = await axios.get(EU_DATA_API, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    if (data.results) {
      for (const item of data.results) {
        const year = item.issued ? new Date(item.issued).getFullYear() : null;
        
        sources.push({
          id: `eu-data:${item.id}`,
          provider: publisherToProvider(publisher),
          type: 'dataset',
          title: item.title || 'Untitled Dataset',
          abstract: item.description || '',
          url: item.landingPage || `https://data.europa.eu/data/datasets/${item.id}`,
          year,
          publishedDate: item.issued ? new Date(item.issued) : null,
          
          // Metadata
          documentType: 'dataset',
          issuer: item.publisher?.name || publisher || 'European Union',
          issuerType: 'multilateral',
          classification: 'public',
          language: item.language?.[0] || 'en',
          contentFormat: item.format?.[0] || 'api',
          oaStatus: 'cc-by',
          hasFullText: Boolean(item.distribution),
          
          raw: item
        });
      }
    }
    
    console.log(`[EU-OpenData] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[EU-OpenData] Search failed: ${error.message}`);
  }
  
  return sources;
}

/**
 * Convenience functions
 */

export async function searchEEAS(query: string, limit = 20) {
  return searchEUOpenData(query, 'European External Action Service', limit);
}

export async function searchEDA(query: string, limit = 20) {
  return searchEUOpenData(query, 'European Defence Agency', limit);
}

export async function searchENISAViaEUData(query: string, limit = 20) {
  return searchEUOpenData(query, 'European Union Agency for Cybersecurity', limit);
}

// Helper
function publisherToProvider(publisher?: string): string {
  if (!publisher) return 'eu';
  
  const map: Record<string, string> = {
    'European External Action Service': 'eeas',
    'European Defence Agency': 'eda',
    'European Union Agency for Cybersecurity': 'enisa'
  };
  
  return map[publisher] || 'eu';
}
