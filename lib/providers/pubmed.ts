/**
 * PubMed/NCBI Provider - Sciences biomédicales et de la santé
 * API: https://www.ncbi.nlm.nih.gov/books/NBK25501/
 */

import { fetchFromProvider } from '../http-client';

export async function searchPubMed(query: string, retmax = 20): Promise<any[]> {
  try {
    // Step 1: Search pour obtenir les IDs
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&retmode=json&sort=relevance`;
    const searchData: any = await fetchFromProvider("pubmed", searchUrl, { timeout: 15000 });
    
    const idList = searchData?.esearchresult?.idlist || [];
    if (idList.length === 0) {
      return [];
    }
    
    // Step 2: Fetch details pour chaque ID
    const ids = idList.join(",");
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids}&retmode=xml`;
    const xmlText: string = await fetchFromProvider("pubmed", fetchUrl, { 
      timeout: 20000,
      responseType: "text"
    });
    
    // Parse XML (simple regex)
    const articles = xmlText.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
    
    return articles.map((articleXml): any => {
      const getPMID = (xml: string) => {
        const match = xml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
        return match ? match[1].trim() : "";
      };
      
      const getTitle = (xml: string) => {
        const match = xml.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
        return match ? match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
      };
      
      const getAbstract = (xml: string) => {
        const match = xml.match(/<Abstract>([\s\S]*?)<\/Abstract>/);
        if (!match) return null;
        const abstractTexts = match[1].match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g) || [];
        return abstractTexts
          .map(t => t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
          .join(" ")
          .trim() || null;
      };
      
      const getYear = (xml: string) => {
        const match = xml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
        return match ? parseInt(match[1]) : null;
      };
      
      const getAuthors = (xml: string) => {
        const authorMatches = xml.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) || [];
        return authorMatches.map(a => {
          const lastName = a.match(/<LastName>(.*?)<\/LastName>/)?.[1] || "";
          const foreName = a.match(/<ForeName>(.*?)<\/ForeName>/)?.[1] || "";
          const name = `${foreName} ${lastName}`.trim();
          return name ? { name } : null;
        }).filter(Boolean) as Array<{ name: string }>;
      };
      
      const getDOI = (xml: string) => {
        const match = xml.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/);
        return match ? match[1].trim() : null;
      };
      
      const getMeSH = (xml: string) => {
        const meshMatches = xml.match(/<DescriptorName[^>]*>(.*?)<\/DescriptorName>/g) || [];
        return meshMatches.map(m => {
          const match = m.match(/>(.*?)</);
          return match ? match[1] : "";
        }).filter(Boolean);
      };
      
      const pmid = getPMID(articleXml);
      const title = getTitle(articleXml);
      const abstract = getAbstract(articleXml);
      const year = getYear(articleXml);
      const authors = getAuthors(articleXml);
      const doi = getDOI(articleXml);
      const meshTerms = getMeSH(articleXml);
      
      return {
        id: `pubmed:${pmid}`,
        provider: "pubmed",
        type: "paper",
        title,
        abstract,
        year,
        doi,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        pdfUrl: null, // PubMed ne fournit pas directement les PDFs
        oaStatus: null,
        authors,
        institutions: [],
        topics: meshTerms,
        jelCodes: [],
        citationCount: null,
        raw: { articleXml }
      };
    }).filter(a => a.title);
    
  } catch (error: any) {
    console.error(`[PubMed] Search failed: ${error.message}`);
    return [];
  }
}
