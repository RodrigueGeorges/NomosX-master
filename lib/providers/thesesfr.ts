/**
 * Theses.fr Provider - Thèses françaises
 * API: https://theses.fr/api/v1
 * 
 * Accès aux thèses de doctorat françaises
 */

import { fetchFromProvider } from '../http-client';

const THESESFR_API = process.env.THESESFR_API || "https://theses.fr/api/v1";

export async function searchThesesFr(query: string, limit = 15): Promise<any[]> {
  try {
    console.log(`[ThesesFr] Searching for: "${query}"`);
    
    // API theses.fr - recherche par mots-clés
    const url = `${THESESFR_API}/theses/recherche?q=${encodeURIComponent(query)}&nombre=${limit}&tri=pertinence`;
    
    const data: any = await fetchFromProvider("thesesfr", url, { timeout: 20000 });
    
    const theses = data?.theses || data?.results || [];
    
    console.log(`[ThesesFr] Found ${theses.length} theses`);
    
    return theses.map((thesis: any) => {
      const year = thesis.dateSoutenance 
        ? parseInt(thesis.dateSoutenance.substring(0, 4))
        : thesis.annee 
        ? parseInt(thesis.annee)
        : null;
      
      const authors = thesis.auteur 
        ? [{ name: thesis.auteur.prenom + " " + thesis.auteur.nom }]
        : thesis.auteurs 
        ? thesis.auteurs.map((a: any) => ({ name: a.prenom + " " + a.nom }))
        : [];
      
      const directeurs = thesis.directeurs 
        ? thesis.directeurs.map((d: any) => ({ name: d.prenom + " " + d.nom, role: "directeur" }))
        : [];
      
      const institutions = thesis.etablissement 
        ? [{ name: thesis.etablissement.nom || thesis.etablissement }]
        : [];
      
      // URL du PDF si disponible
      const nnt = thesis.nnt || thesis.id;
      const pdfUrl = thesis.urlDocument || (nnt ? `https://theses.fr/${nnt}/document` : null);
      
      return {
        id: `thesesfr:${nnt || thesis.id}`,
        provider: "thesesfr",
        type: "thesis",
        title: thesis.titrePrincipal || thesis.titre || "",
        abstract: thesis.resume || thesis.resumeFr || thesis.resumeEn || null,
        year,
        doi: thesis.doi || null,
        url: nnt ? `https://theses.fr/${nnt}` : thesis.url,
        pdfUrl,
        oaStatus: pdfUrl ? "oa" : null,
        authors: [...authors, ...directeurs],
        institutions,
        topics: thesis.sujets || thesis.motsCles || [],
        jelCodes: [],
        citationCount: null,
        
        // Metadata spécifiques thèses
        nnt,
        discipline: thesis.discipline,
        ecoleDoctorale: thesis.ecoleDoctorale,
        dateSoutenance: thesis.dateSoutenance,
        
        // Content-First flags
        hasFullText: !!pdfUrl,
        contentSource: pdfUrl ? "thesesfr" : null,
        
        raw: thesis
      };
    }).filter((t: any) => t.title);
    
  } catch (error: any) {
    console.error(`[ThesesFr] Search failed: ${error.message}`);
    return [];
  }
}

/**
 * Récupérer une thèse par son NNT
 */
export async function getThesisByNNT(nnt: string): Promise<any | null> {
  try {
    const url = `${THESESFR_API}/theses/${nnt}`;
    const data = await fetchFromProvider("thesesfr", url, { timeout: 10000 });
    return data;
  } catch (error: any) {
    console.error(`[ThesesFr] Get thesis ${nnt} failed: ${error.message}`);
    return null;
  }
}
