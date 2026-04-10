/**
 * ThesesFr-HAL Bridge
 * 
 * Enrichit les thèses de theses.fr avec les données HAL
 * pour récupérer le texte intégral quand disponible
 */

import { fetchFromProvider } from '../http-client';

const HAL_API = "https://api.archives-ouvertes.fr/search";

/**
 * Recherche une thèse dans HAL par son titre ou auteur
 */
async function findThesisInHAL(thesis: any): Promise<any | null> {
  try {
    // Construire une requête de recherche
    const title = thesis.title || thesis.titrePrincipal;
    const author = thesis.authors?.[0]?.name || "";
    
    if (!title) return null;
    
    // Recherche par titre (échappé)
    const escapedTitle = title.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, "\\$&");
    const query = `title_s:"${escapedTitle.slice(0, 100)}"`;
    
    const url = `${HAL_API}/?q=${encodeURIComponent(query)}&wt=json&rows=5&fl=docid,title_s,abstract_s,fileMain_s,uri_s,doiId_s`;
    
    const data: any = await fetchFromProvider("hal", url, { timeout: 10000 });
    const docs = data?.response?.docs || [];
    
    if (docs.length === 0) return null;
    
    // Prendre le premier résultat (le plus pertinent)
    const halDoc = docs[0];
    
    return {
      halId: halDoc.docid,
      halUri: halDoc.uri_s,
      halPdfUrl: halDoc.fileMain_s,
      halAbstract: Array.isArray(halDoc.abstract_s) 
        ? halDoc.abstract_s.join(" ") 
        : halDoc.abstract_s,
      halDoi: halDoc.doiId_s
    };
    
  } catch (error: any) {
    // Silently fail - HAL enrichment is optional
    return null;
  }
}

/**
 * Enrichit une liste de thèses avec les données HAL
 * Limite le nombre de requêtes parallèles
 */
export async function enrichManyThesesWithHAL(
  theses: any[], 
  concurrency = 5
): Promise<any[]> {
  if (theses.length === 0) return [];
  
  console.log(`[HAL-Bridge] Enriching ${theses.length} theses...`);
  
  const enriched: any[] = [];
  
  // Process in batches to respect rate limits
  for (let i = 0; i < theses.length; i += concurrency) {
    const batch = theses.slice(i, i + concurrency);
    
    const results = await Promise.allSettled(
      batch.map(async (thesis) => {
        const halData = await findThesisInHAL(thesis);
        
        if (halData && halData.halPdfUrl) {
          return {
            ...thesis,
            pdfUrl: halData.halPdfUrl || thesis.pdfUrl,
            halId: halData.halId,
            halUri: halData.halUri,
            abstract: halData.halAbstract || thesis.abstract,
            doi: halData.halDoi || thesis.doi,
            hasFullText: true,
            contentSource: "hal"
          };
        }
        
        return thesis;
      })
    );
    
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        enriched.push(result.value);
      }
    });
    
    // Small delay between batches
    if (i + concurrency < theses.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  const withHAL = enriched.filter(t => t.contentSource === "hal").length;
  console.log(`[HAL-Bridge] ${withHAL}/${theses.length} matched with HAL`);
  
  return enriched;
}

/**
 * Enrichit une seule thèse avec HAL
 */
export async function enrichThesisWithHAL(thesis: any): Promise<any> {
  const halData = await findThesisInHAL(thesis);
  
  if (!halData) return thesis;
  
  return {
    ...thesis,
    pdfUrl: halData.halPdfUrl || thesis.pdfUrl,
    halId: halData.halId,
    halUri: halData.halUri,
    abstract: halData.halAbstract || thesis.abstract,
    doi: halData.halDoi || thesis.doi,
    hasFullText: !!halData.halPdfUrl,
    contentSource: halData.halPdfUrl ? "hal" : thesis.contentSource
  };
}
