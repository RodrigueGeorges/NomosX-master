/**
 * BASE (Bielefeld Academic Search Engine) Provider - Méta-moteur académique
 * API: https://www.base-search.net/about/en/about_develop.php
 */

import { fetchFromProvider } from '../http-client';

export async function searchBASE(query: string, hits = 20): Promise<any[]> {
  const url = `https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi?func=PerformSearch&query=${encodeURIComponent(query)}&format=json&hits=${hits}&type=all&sortby=relevance`;
  
  try {
    const data: any = await fetchFromProvider("base", url, { timeout: 15000 });
    const docs = data?.response?.docs || [];
    
    return docs.map((doc: any) => {
      return {
        id: doc.id,
        provider: "base",
        type: "academic",
        title: doc.dctitle || doc.title,
        abstract: doc.dcdescription || doc.description,
        authors: Array.isArray(doc.dccreator) ? doc.dccreator.map((author: string) => ({ name: author, institution: null })) : [],
        journal: doc.dcpublisher || "Unknown",
        year: parseInt(doc.dcdate?.substring(0, 4)) || null,
        doi: doc.dcdentifier?.find((id: string) => id.includes('doi:'))?.replace('doi:', '') || null,
        url: doc.dcidentifier?.find((id: string) => id.startsWith('http://')) || null,
        trustScore: 0.7,
        raw: doc
      };
    });
  } catch (error) {
    console.error('BASE search failed:', error);
    return [];
  }
}

// Legacy export for backward compatibility
export async function searchBase(query: string, hits = 20) {
  return searchBASE(query, hits);
}

export default { searchBASE, searchBase };
