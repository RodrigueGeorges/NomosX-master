/**
 * NIST Publications - RSS + Database search
 * Site très stable avec plusieurs feeds
 */

import axios from 'axios';
import Parser from 'rss-parser';

const NIST_CSRC_API = 'https://csrc.nist.gov/CSRC/media/feeds/publications/all-pubs.json';
const NIST_NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const parser = new Parser({ headers: { 'User-Agent': USER_AGENT } });

/**
 * Search NIST publications via CSRC JSON feed + NVD API
 * Multiple sources for reliability
 */
export async function searchNIST(query: string, limit = 20) {
  const sources: any[] = [];
  const queryLower = query.toLowerCase();
  
  try {
    console.log(`[NIST] Searching for: "${query}"`);
    
    // Try CSRC publications feed
    try {
      const { data } = await axios.get(NIST_CSRC_API, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 15000
      });
      
      const pubs = Array.isArray(data) ? data : (data.publications || []);
      
      const filtered = pubs
        .filter((pub: any) => 
          pub.title?.toLowerCase().includes(queryLower) ||
          pub.abstract?.toLowerCase().includes(queryLower) ||
          pub.keywords?.some((k: string) => k.toLowerCase().includes(queryLower))
        )
        .slice(0, limit);
      
      for (const pub of filtered) {
        const year = pub.releaseDate ? parseInt(pub.releaseDate.substring(0, 4)) : null;
        
        let docType = 'standard';
        if (pub.series === 'SP') docType = 'special-publication';
        if (pub.series === 'FIPS') docType = 'fips';
        if (pub.series === 'IR') docType = 'internal-report';
        
        sources.push({
          id: `nist:${pub.id || pub.docIdentifier || Buffer.from(pub.title || '').toString('base64').slice(0, 16)}`,
          provider: 'nist',
          type: 'standard',
          title: pub.title || 'Untitled',
          abstract: pub.abstract || '',
          url: pub.detailUrl || pub.url || `https://csrc.nist.gov/publications/detail/${pub.series?.toLowerCase()}/${pub.docIdentifier}`,
          pdfUrl: pub.pdfUrl || null,
          year,
          publishedDate: pub.releaseDate ? new Date(pub.releaseDate) : null,
          
          documentType: docType,
          issuer: 'NIST',
          issuerType: 'cyber',
          classification: 'public',
          language: 'en',
          contentFormat: 'pdf',
          oaStatus: 'public-domain',
          
          raw: pub
        });
      }
    } catch (csrcError: any) {
      console.log(`[NIST] CSRC feed unavailable: ${csrcError.message}`);
    }
    
    // If no results from CSRC, try NVD for cyber-related queries
    if (sources.length === 0 && (queryLower.includes('cyber') || queryLower.includes('vulnerability'))) {
      try {
        const { data } = await axios.get(NIST_NVD_API, {
          params: { keywordSearch: query, resultsPerPage: limit },
          headers: { 'User-Agent': USER_AGENT },
          timeout: 15000
        });
        
        for (const vuln of (data.vulnerabilities || []).slice(0, limit)) {
          const cve = vuln.cve;
          sources.push({
            id: `nist:${cve.id}`,
            provider: 'nist',
            type: 'advisory',
            title: cve.id,
            abstract: cve.descriptions?.[0]?.value || '',
            url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
            year: cve.published ? parseInt(cve.published.substring(0, 4)) : null,
            publishedDate: cve.published ? new Date(cve.published) : null,
            
            documentType: 'cve',
            issuer: 'NIST NVD',
            issuerType: 'cyber',
            classification: 'public',
            language: 'en',
            contentFormat: 'html',
            oaStatus: 'public-domain',
            
            raw: cve
          });
        }
      } catch (nvdError: any) {
        console.log(`[NIST] NVD API unavailable: ${nvdError.message}`);
      }
    }
    
    console.log(`[NIST] Found ${sources.length} publications`);
  } catch (error: any) {
    console.error(`[NIST] Search failed: ${error.message}`);
  }
  
  return sources;
}
