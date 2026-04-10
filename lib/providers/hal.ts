/**
 * HAL (Hyper Articles en Ligne) Provider - Archive ouverte française
 * API: https://api.archives-ouvertes.fr/docs/search
 */

import { fetchFromProvider } from '../http-client';

/**
 * HAL Provider - VERSION 2.0 FIX
 * 1M+ documents français, API gratuite
 * 
 * FIX V2:
 * - Parser abstract_s correctement (était 0% avant)
 * - Content-First: filtre abstracts < 200 chars
 * - Augmente limit à 50
 * - Meilleure extraction metadata
 */
export async function searchHAL(query: string, rows = 50): Promise<any[]> {
  const url = `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&wt=json&rows=${rows}&sort=producedDate_tdate desc&fl=docid,title_s,abstract_s,authFullName_s,producedDate_tdate,doiId_s,uri_s,fileMain_s,domain_s,keyword_s,citationFull_s`;
  
  try {
    const data: any = await fetchFromProvider("hal", url, { timeout: 15000 });
    const docs = data?.response?.docs || [];
    
    console.log(`[HAL] Found ${docs.length} documents`);
    
    // STRATÉGIE CONTENT-FIRST: Filtrer docs sans abstract riche
    const richDocs = docs
      .filter((doc: any) => {
        // FIX: Parser abstract_s qui peut être string ou array
        const abstract = Array.isArray(doc.abstract_s) 
          ? doc.abstract_s.join(" ")  // Concaténer si array
          : doc.abstract_s;
        
        const title = Array.isArray(doc.title_s) ? doc.title_s[0] : doc.title_s;
        
        const hasAbstract = abstract && abstract.length >= 200;
        const hasTitle = title && title.length > 0;
        
        return hasAbstract && hasTitle;
      })
      .map((doc: any) => {
        const year = doc.producedDate_tdate ? parseInt(doc.producedDate_tdate.substring(0, 4)) : null;
        const authors = Array.isArray(doc.authFullName_s) 
          ? doc.authFullName_s.map((name: string) => ({ name }))
          : doc.authFullName_s 
          ? [{ name: doc.authFullName_s }]
          : [];
        
        const topics = Array.isArray(doc.domain_s) ? doc.domain_s : doc.domain_s ? [doc.domain_s] : [];
        const keywords = Array.isArray(doc.keyword_s) ? doc.keyword_s : doc.keyword_s ? [doc.keyword_s] : [];
        
        // FIX: Extraire abstract correctement
        const abstract = Array.isArray(doc.abstract_s) 
          ? doc.abstract_s.join(" ")
          : doc.abstract_s;
        
        const title = Array.isArray(doc.title_s) ? doc.title_s[0] : doc.title_s;
        
        const abstractLen = abstract?.length || 0;
        
        return {
          id: `hal:${doc.docid}`,
          provider: "hal",
          type: "paper",
          title: title || "",
          abstract: abstract || null,
          year,
          doi: doc.doiId_s || null,
          url: doc.uri_s || `https://hal.science/${doc.docid}`,
          pdfUrl: doc.fileMain_s || null,
          oaStatus: doc.fileMain_s ? "oa" : null,
          authors,
          institutions: [],
          topics: [...topics, ...keywords].filter(Boolean),
          jelCodes: [],
          citationCount: doc.citationFull_s ? (Array.isArray(doc.citationFull_s) ? doc.citationFull_s.length : 1) : null,
          
          // NOUVEAUX CHAMPS V2 pour Content-First
          contentLength: abstractLen,
          hasFullText: true,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : "acceptable",
          
          raw: doc
        };
      });
    
    const filterRate = docs.length > 0 ? Math.round((richDocs.length / docs.length) * 100) : 0;
    console.log(`[HAL] ${richDocs.length}/${docs.length} with rich abstracts (${filterRate}%)`);
    
    return richDocs;
    
  } catch (error: any) {
    console.error(`[HAL] Search failed: ${error.message}`);
    return [];
  }
}
