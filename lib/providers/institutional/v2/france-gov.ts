/**
 * France Government Data - data.gouv.fr API
 * SOLUTION pour Ministère Armées, SGDSN, Archives Nationales
 */

import axios from 'axios';

const DATA_GOUV_API = 'https://www.data.gouv.fr/api/1';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

// Organization IDs on data.gouv.fr
const ORGS = {
  'ministere-armees': 'ministere-des-armees',
  'sgdsn': 'secretariat-general-de-la-defense-et-de-la-securite-nationale',
  'archives-fr': 'archives-nationales'
};

/**
 * Search data.gouv.fr by organization
 */
async function searchDataGouvFR(orgSlug: string, query: string, limit = 20) {
  const sources: any[] = [];
  
  try {
    console.log(`[data.gouv.fr] Searching "${query}" for org: ${orgSlug}`);
    
    const params = {
      q: query,
      organization: orgSlug,
      page_size: limit
    };
    
    const { data } = await axios.get(`${DATA_GOUV_API}/datasets/`, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000
    });
    
    if (data.data) {
      for (const dataset of data.data) {
        const year = dataset.created_at ? new Date(dataset.created_at).getFullYear() : null;
        
        sources.push({
          id: `data-gouv:${dataset.id}`,
          provider: orgSlugToProvider(orgSlug),
          type: 'dataset',
          title: dataset.title || 'Sans titre',
          abstract: dataset.description || '',
          url: `https://www.data.gouv.fr/fr/datasets/${dataset.slug}`,
          year,
          publishedDate: dataset.created_at ? new Date(dataset.created_at) : null,
          
          // Metadata
          documentType: 'dataset',
          issuer: dataset.organization?.name || orgSlug,
          issuerType: orgSlugToIssuerType(orgSlug),
          classification: 'public',
          language: 'fr',
          contentFormat: dataset.resources?.[0]?.format || 'csv',
          oaStatus: dataset.license === 'fr-lo' ? 'open' : 'cc-by',
          hasFullText: Boolean(dataset.resources?.length),
          
          raw: dataset
        });
      }
    }
    
    console.log(`[data.gouv.fr] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[data.gouv.fr] Search failed: ${error.message}`);
  }
  
  return sources;
}

/**
 * Ministère des Armées
 */
export async function searchMinistereArmees(query: string, limit = 20) {
  return searchDataGouvFR(ORGS['ministere-armees'], query, limit);
}

/**
 * SGDSN
 */
export async function searchSGDSN(query: string, limit = 20) {
  return searchDataGouvFR(ORGS['sgdsn'], query, limit);
}

/**
 * Archives Nationales
 */
export async function searchArchivesNationales(query: string, limit = 20) {
  return searchDataGouvFR(ORGS['archives-fr'], query, limit);
}

// Helpers
function orgSlugToProvider(slug: string): string {
  for (const [key, value] of Object.entries(ORGS)) {
    if (value === slug) return key;
  }
  return 'france-gov';
}

function orgSlugToIssuerType(slug: string): string {
  if (slug.includes('armees')) return 'defense';
  if (slug.includes('sgdsn')) return 'intelligence';
  if (slug.includes('archives')) return 'intelligence';
  return 'multilateral';
}
