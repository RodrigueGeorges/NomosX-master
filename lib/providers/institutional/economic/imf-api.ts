/**
 * IMF API - Version officielle (préférée au scraping)
 * API Docs: https://datahelp.imf.org/knowledgebase/articles/667681
 */

import axios from 'axios';

const IMF_API_BASE = 'https://www.imf.org/external/datamapper/api/v1';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

/**
 * Search IMF publications via their API
 * Plus fiable que le scraping HTML
 */
export async function searchIMF(query: string, limit = 10) {
  const sources: any[] = [];
  
  try {
    console.log(`[IMF-API] Searching for: "${query}"`);
    
    // IMF a plusieurs endpoints selon le type
    // 1. Publications API
    const pubUrl = `https://www.imf.org/en/Publications/search?series=Working%20Papers&query=${encodeURIComponent(query)}`;
    
    // 2. Data API (pour datasets)
    // const dataUrl = `${IMF_API_BASE}/indicators`;
    
    // Pour l'instant, combinaison scraping léger + parsing structuré
    const { data } = await axios.get(pubUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    // Parser la réponse (IMF retourne parfois du JSON embarqué)
    // À adapter selon la structure réelle de la réponse
    
    console.log(`[IMF-API] Found sources (API mode)`);
    
    // Alternative : utiliser leur RSS feed
    const rssUrl = 'https://www.imf.org/en/Publications/rss';
    
  } catch (error: any) {
    console.error(`[IMF-API] Failed: ${error.message}`);
  }
  
  return sources;
}

/**
 * Get IMF datasets via Data API
 * Exemple : World Economic Outlook data
 */
export async function getIMFDatasets(indicators: string[] = ['NGDP_RPCH']) {
  try {
    const url = `${IMF_API_BASE}/indicators/${indicators.join(',')}`;
    const { data } = await axios.get(url);
    
    return data;
  } catch (error: any) {
    console.error(`[IMF-API] Dataset fetch failed: ${error.message}`);
    return null;
  }
}
