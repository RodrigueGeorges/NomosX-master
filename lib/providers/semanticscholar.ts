/**
 * Semantic Scholar Provider - VERSION 2.0 OPTIMISÉE
 * 200M+ papers, API gratuite, abstracts riches
 * 
 * OPTIMISATIONS V2:
 * - Content-First: filtre abstracts < 200 chars
 * - Augmente limit par défaut à 50
 * - Ajoute contentLength pour scoring
 * - Extraction DOI et metadata enrichie
 */

import { fetchFromProvider } from '../http-client';
import { env } from '../env';

export async function searchSemanticScholar(query: string, limit = 50): Promise<any[]> {
  const base = env.SEMANTICSCHOLAR_API;
  const url = `${base}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=paperId,title,abstract,year,citationCount,authors,openAccessPdf,url,externalIds,venue,publicationTypes`;
  
  try {
    const data: any = await fetchFromProvider("semanticscholar", url, { timeout: 15000 });
    const items = data?.data || [];
    
    console.log(`[SemanticScholar] Found ${items.length} papers`);
    
    // STRATÉGIE CONTENT-FIRST: Filtrer papers sans abstract riche
    const richPapers = items
      .filter((p: any) => {
        const hasAbstract = p.abstract && p.abstract.length >= 200;
        const hasTitle = p.title && p.title.length > 0;
        return hasAbstract && hasTitle;
      })
      .map((p: any) => {
        const abstractLen = p.abstract?.length || 0;
        
        return {
          id: `semanticscholar:${p.paperId}`,
          provider: "semanticscholar",
          type: "paper",
          title: p.title || "",
          abstract: p.abstract || null,
          year: p.year ?? null,
          doi: p.externalIds?.DOI || null,
          url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
          pdfUrl: p.openAccessPdf?.url ?? null,
          oaStatus: p.openAccessPdf?.url ? "oa" : null,
          authors: (p.authors || [])
            .map((a: any) => ({ name: a.name, authorId: a.authorId }))
            .filter((a: any) => a.name),
          institutions: [],
          topics: p.publicationTypes || [],
          jelCodes: [],
          citationCount: p.citationCount ?? null,
          
          // NOUVEAUX CHAMPS V2 pour Content-First
          contentLength: abstractLen,
          hasFullText: true,
          contentQuality: abstractLen >= 1000 ? "excellent" : abstractLen >= 500 ? "good" : "acceptable",
          venue: p.venue || null,
          
          raw: p
        };
      });
    
    const filterRate = Math.round((richPapers.length / items.length) * 100);
    console.log(`[SemanticScholar] ${richPapers.length}/${items.length} with rich abstracts (${filterRate}%)`);
    
    return richPapers;
    
  } catch (error: any) {
    console.error(`[SemanticScholar] Search failed: ${error.message}`);
    return [];
  }
}
