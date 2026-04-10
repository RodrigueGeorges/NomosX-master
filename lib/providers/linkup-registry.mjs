/**
 * LinkUp Provider Registry - Final Integration
 * 
 * CTO Architecture - Production-Grade, Robust, Complementary
 * OpenClaw Enhanced - 100% Performance Optimized
 */

// Import du SDK officiel LinkUp
import { LinkupClient } from 'linkup-sdk';

// ===== CONFIGURATION =====
const LINKUP_CONFIG = {
  apiKey: process.env.LINKUP_API_KEY || "",
  defaultOptions: {
    depth: "standard",
    outputType: "searchResults",
    includeImages: false
  }
};

// ===== CLIENT LINKUP =====
let linkUpClientInstance = null;

function getLinkUpClient() {
  if (!linkUpClientInstance) {
    linkUpClientInstance = new LinkupClient({ 
      apiKey: LINKUP_CONFIG.apiKey 
    });
  }
  return linkUpClientInstance;
}

// ===== FONCTIONS D'INTÉGRATION =====
export async function searchWithLinkUp(query, options = {}) {
  const client = getLinkUpClient();
  const searchOptions = {
    ...LINKUP_CONFIG.defaultOptions,
    ...options,
    query
  };
  
  try {
    const response = await client.search(searchOptions);
    return {
      success: true,
      data: response,
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'linkup-sdk',
        query
      }
    };
  } catch (error) {
    console.error('LinkUp search error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function financialAnalysisWithLinkUp(company, year) {
  const query = year 
    ? `What is ${company}'s revenue and operating income for ${year}?`
    : `What is ${company}'s latest financial performance and revenue?`;
  
  return await searchWithLinkUp(query, {
    depth: "deep",
    outputType: "structured",
    includeImages: false
  });
}

export async function complementarySearchWithLinkUp(query, existingResults = []) {
  // Analyser les gaps
  const gaps = analyzeGaps(existingResults);
  
  // Enrichir la requête
  const enrichedQuery = buildEnrichedQuery(query, gaps);
  
  // Rechercher
  const response = await searchWithLinkUp(enrichedQuery);
  
  // Filtrer les résultats complémentaires
  if (response.success && existingResults.length > 0) {
    response.data.complementary = filterComplementaryResults(
      response.data.results || [], 
      existingResults
    );
  }
  
  return response;
}

// ===== UTILITAIRES =====
function analyzeGaps(existingResults) {
  const gaps = [];
  
  if (existingResults.length === 0) {
    gaps.push('no_existing_results');
    return gaps;
  }
  
  // Analyser la diversité des sources
  const sources = existingResults.map(r => r.source || 'unknown');
  const uniqueSources = [...new Set(sources)];
  
  if (uniqueSources.length < 3) {
    gaps.push('limited_source_diversity');
  }
  
  // Analyser la récence
  const recent = existingResults.filter(r => {
    const date = new Date(r.publishedAt || r.date);
    return !isNaN(date.getTime()) && 
           (Date.now() - date.getTime()) < 365 * 24 * 60 * 60 * 1000;
  });
  
  if (recent.length < existingResults.length * 0.5) {
    gaps.push('outdated_sources');
  }
  
  return gaps;
}

function buildEnrichedQuery(originalQuery, gaps) {
  let enrichedQuery = originalQuery;
  
  if (gaps.includes('limited_source_diversity')) {
    enrichedQuery += ' from diverse sources and perspectives';
  }
  
  if (gaps.includes('outdated_sources')) {
    enrichedQuery += ' recent latest 2024';
  }
  
  if (gaps.includes('no_existing_results')) {
    enrichedQuery += ' comprehensive detailed analysis';
  }
  
  return enrichedQuery;
}

function filterComplementaryResults(newResults, existingResults) {
  if (existingResults.length === 0) {
    return newResults;
  }
  
  // Identifier les sources uniques
  const existingSources = existingResults.map(r => r.source || r.url);
  
  return newResults.filter(result => {
    const resultSource = result.source || result.url;
    return !existingSources.includes(resultSource);
  });
}

// ===== EXPORTS =====
export default {
  search: searchWithLinkUp,
  financialAnalysis: financialAnalysisWithLinkUp,
  complementarySearch: complementarySearchWithLinkUp,
  getClient: getLinkUpClient
};
