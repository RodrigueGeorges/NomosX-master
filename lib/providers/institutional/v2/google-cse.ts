/**
 * Google Custom Search Engine - Pour sites sans API
 * Solution FIABLE pour ODNI, NATO, NSA, ENISA
 * 
 * Setup:
 * 1. Créer CSE sur https://programmablesearchengine.google.com/
 * 2. Ajouter sites: dni.gov, nato.int, nsa.gov, enisa.europa.eu
 * 3. Get API key: https://developers.google.com/custom-search/v1/introduction
 */

import axios from 'axios';

const GOOGLE_CSE_BASE = 'https://www.googleapis.com/customsearch/v1';

interface GoogleCSEConfig {
  apiKey: string;
  cx: string; // Search Engine ID
}

/**
 * Search via Google Custom Search Engine
 * Plus fiable que le scraping direct !
 */
export async function searchViaGoogleCSE(
  query: string,
  site: string,
  limit = 10,
  config: GoogleCSEConfig = {
    apiKey: process.env.GOOGLE_CSE_KEY || '',
    cx: process.env.GOOGLE_CSE_CX || ''
  }
) {
  if (!config.apiKey || !config.cx) {
    console.warn('[Google CSE] API key or CX missing, skipping');
    return [];
  }
  
  const sources: any[] = [];
  
  try {
    console.log(`[Google-CSE] Searching "${query}" on ${site}...`);
    
    const params: Record<string, string | number> = {
      key: config.apiKey,
      cx: config.cx,
      q: `${query} site:${site}`,
      num: Math.min(10, limit)
    };
    
    const { data } = await axios.get(GOOGLE_CSE_BASE, {
      params,
      timeout: 15000,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (data.items) {
      for (const item of data.items) {
        // Extract year from metadata or content
        const yearMatch = item.snippet?.match(/\b(19|20)\d{2}\b/) || 
                          item.title?.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();
        
        sources.push({
          id: `google-cse:${Buffer.from(item.link).toString('base64').slice(0, 24)}`,
          provider: siteToProvider(site),
          type: 'report',
          title: item.title || 'Untitled',
          abstract: item.snippet || '',
          url: item.link,
          pdfUrl: item.link.endsWith('.pdf') ? item.link : null,
          year,
          publishedDate: null,
          
          // Metadata inférée du site
          documentType: 'report',
          issuer: siteToIssuer(site),
          issuerType: siteToIssuerType(site),
          classification: 'public',
          language: 'en',
          contentFormat: item.link.endsWith('.pdf') ? 'pdf' : 'html',
          oaStatus: 'public-domain',
          hasFullText: true,
          
          raw: item
        });
      }
    }
    
    console.log(`[Google-CSE] Found ${sources.length} results on ${site}`);
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.error('[Google-CSE] Rate limit hit, consider upgrading quota');
    } else {
      console.error(`[Google-CSE] Search failed: ${error.message}`);
    }
  }
  
  return sources;
}

/**
 * Convenience functions pour chaque provider
 */

export async function searchODNIViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'dni.gov', limit);
}

export async function searchNATOViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'nato.int', limit);
}

export async function searchNSAViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'nsa.gov', limit);
}

export async function searchENISAViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'enisa.europa.eu', limit);
}

// Think Tanks & Policy Labs (Innovative)
export async function searchLawZeroViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'lawzero.org', limit);
}

export async function searchGovAIViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'governance.ai', limit);
}

export async function searchIAPSViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'iaps.ai', limit);
}

export async function searchCAIPViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'centeraipolicy.org', limit);
}

export async function searchAIPIViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'theaipi.org', limit);
}

export async function searchCSETViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'cset.georgetown.edu', limit);
}

export async function searchAINowViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'ainowinstitute.org', limit);
}

export async function searchDataSocietyViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'datasociety.net', limit);
}

export async function searchAbundanceViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'abundance.institute', limit);
}

export async function searchCAIDPViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'caidp.org', limit);
}

export async function searchSCSPViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'scsp.ai', limit);
}

export async function searchIFPViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'progress.institute', limit);
}

export async function searchCDTViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'cdt.org', limit);
}

export async function searchBrookingsViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'brookings.edu', limit);
}

export async function searchFAIViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'thefai.org', limit);
}

export async function searchCNASViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'cnas.org', limit);
}

export async function searchRANDViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'rand.org', limit);
}

export async function searchNewAmericaViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'newamerica.org', limit);
}

export async function searchAspenDigitalViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'aspendigital.org', limit);
}

export async function searchRStreetViaGoogle(query: string, limit = 10) {
  return searchViaGoogleCSE(query, 'rstreet.org', limit);
}

// Helpers
function siteToProvider(site: string): string {
  const map: Record<string, string> = {
    'dni.gov': 'odni',
    'nato.int': 'nato',
    'nsa.gov': 'nsa',
    'enisa.europa.eu': 'enisa',
    'lawzero.org': 'lawzero',
    'governance.ai': 'govai',
    'iaps.ai': 'iaps',
    'centeraipolicy.org': 'caip',
    'theaipi.org': 'aipi',
    'cset.georgetown.edu': 'cset',
    'ainowinstitute.org': 'ainow',
    'datasociety.net': 'datasociety',
    'abundance.institute': 'abundance',
    'caidp.org': 'caidp',
    'scsp.ai': 'scsp',
    'progress.institute': 'ifp',
    'cdt.org': 'cdt',
    'brookings.edu': 'brookings',
    'thefai.org': 'fai',
    'cnas.org': 'cnas',
    'rand.org': 'rand',
    'newamerica.org': 'newamerica',
    'aspendigital.org': 'aspen-digital',
    'rstreet.org': 'rstreet'
  };
  return map[site] || site;
}

function siteToIssuer(site: string): string {
  const map: Record<string, string> = {
    'dni.gov': 'ODNI',
    'nato.int': 'NATO',
    'nsa.gov': 'NSA',
    'enisa.europa.eu': 'ENISA',
    'lawzero.org': 'LawZero',
    'governance.ai': 'GovAI',
    'iaps.ai': 'Institute for AI Policy and Strategy',
    'centeraipolicy.org': 'Center for AI Policy',
    'theaipi.org': 'AI Policy Institute',
    'cset.georgetown.edu': 'Center for Security and Emerging Technology',
    'ainowinstitute.org': 'AI Now Institute',
    'datasociety.net': 'Data & Society',
    'abundance.institute': 'Abundance Institute',
    'caidp.org': 'Center for AI and Digital Policy',
    'scsp.ai': 'Special Competitive Studies Project',
    'progress.institute': 'Institute for Progress',
    'cdt.org': 'Center for Democracy and Technology',
    'brookings.edu': 'Brookings Institution',
    'thefai.org': 'Foundation for American Innovation',
    'cnas.org': 'Center for a New American Security',
    'rand.org': 'RAND Corporation',
    'newamerica.org': 'New America',
    'aspendigital.org': 'Aspen Digital',
    'rstreet.org': 'R Street Institute'
  };
  return map[site] || site;
}

function siteToIssuerType(site: string): string {
  const map: Record<string, string> = {
    'dni.gov': 'intelligence',
    'nato.int': 'defense',
    'nsa.gov': 'intelligence',
    'enisa.europa.eu': 'cyber',
    'lawzero.org': 'think-tank',
    'governance.ai': 'think-tank',
    'iaps.ai': 'think-tank',
    'centeraipolicy.org': 'think-tank',
    'theaipi.org': 'think-tank',
    'cset.georgetown.edu': 'think-tank',
    'ainowinstitute.org': 'think-tank',
    'datasociety.net': 'think-tank',
    'abundance.institute': 'think-tank',
    'caidp.org': 'think-tank',
    'scsp.ai': 'think-tank',
    'progress.institute': 'think-tank',
    'cdt.org': 'think-tank',
    'brookings.edu': 'think-tank',
    'thefai.org': 'think-tank',
    'cnas.org': 'think-tank',
    'rand.org': 'think-tank',
    'newamerica.org': 'think-tank',
    'aspendigital.org': 'think-tank',
    'rstreet.org': 'think-tank'
  };
  return map[site] || 'multilateral';
}
