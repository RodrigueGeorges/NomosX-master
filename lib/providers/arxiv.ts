/**
 * arXiv Provider - Preprints en physique, mathématiques, CS, etc.
 * API: https://info.arxiv.org/help/api/index.html
 */

import { fetchFromProvider } from '../http-client';

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  authors: Array<{ name: string }>;
  categories: string[];
  doi?: string;
  pdfUrl: string;
}

export async function searchArxiv(query: string, maxResults = 20): Promise<any[]> {
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
  
  try {
    const xmlText: string = await fetchFromProvider("arxiv", url, { 
      timeout: 15000,
      responseType: "text"
    });
    
    // Parse XML (simple regex pour éviter dépendance xml-parser)
    const entries = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    
    return entries.map((entryXml): any => {
      const getId = (xml: string) => {
        const match = xml.match(/<id>(.*?)<\/id>/);
        return match ? match[1].trim() : "";
      };
      
      const getTitle = (xml: string) => {
        const match = xml.match(/<title>([\s\S]*?)<\/title>/);
        return match ? match[1].replace(/\s+/g, " ").trim() : "";
      };
      
      const getSummary = (xml: string) => {
        const match = xml.match(/<summary>([\s\S]*?)<\/summary>/);
        return match ? match[1].replace(/\s+/g, " ").trim() : "";
      };
      
      const getPublished = (xml: string) => {
        const match = xml.match(/<published>(.*?)<\/published>/);
        return match ? match[1].trim() : "";
      };
      
      const getAuthors = (xml: string) => {
        const authorMatches = xml.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g) || [];
        return authorMatches.map(a => {
          const nameMatch = a.match(/<name>(.*?)<\/name>/);
          return { name: nameMatch ? nameMatch[1].trim() : "" };
        }).filter(a => a.name);
      };
      
      const getCategories = (xml: string) => {
        const catMatches = xml.match(/<category term="([^"]+)"/g) || [];
        return catMatches.map(c => {
          const match = c.match(/term="([^"]+)"/);
          return match ? match[1] : "";
        }).filter(Boolean);
      };
      
      const getDoi = (xml: string) => {
        const match = xml.match(/doi.org\/(10\.\d+\/[^\s<>"]+)/);
        return match ? match[1] : null;
      };
      
      const id = getId(entryXml);
      const arxivId = id.replace("http://arxiv.org/abs/", "");
      const title = getTitle(entryXml);
      const summary = getSummary(entryXml);
      const published = getPublished(entryXml);
      const year = published ? parseInt(published.substring(0, 4)) : null;
      const authors = getAuthors(entryXml);
      const categories = getCategories(entryXml);
      const doi = getDoi(entryXml);
      const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
      
      return {
        id: `arxiv:${arxivId}`,
        provider: "arxiv",
        type: "preprint",
        title,
        abstract: summary,
        year,
        doi,
        url: `https://arxiv.org/abs/${arxivId}`,
        pdfUrl,
        oaStatus: "oa", // arXiv est toujours open access
        authors,
        institutions: [],
        topics: categories,
        jelCodes: [],
        citationCount: null, // arXiv n'a pas de citation count
        raw: { entryXml }
      };
    }).filter(e => e.title); // Filter out invalid entries
    
  } catch (error: any) {
    console.error(`[arXiv] Search failed: ${error.message}`);
    return [];
  }
}
