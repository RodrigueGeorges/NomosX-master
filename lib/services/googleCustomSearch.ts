/**
 * Google Custom Search JSON API Service
 * 
 * Service production-ready pour interroger l'API Google Custom Search.
 * Utilisé pour crawler les sources institutionnelles et think tanks.
 * 
 * @see https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list
 */

import axios, { AxiosError } from 'axios';

// ============================================================================
// Configuration
// ============================================================================

const GOOGLE_CSE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const DEFAULT_TIMEOUT = 15000; // 15 seconds
const MAX_RESULTS_PER_PAGE = 10; // Google CSE limit

// ============================================================================
// Types
// ============================================================================

export interface GoogleCSEConfig {
  apiKey: string;
  cx: string;
}

export interface SearchOptions {
  /** Number of results (max 10 per request) */
  num?: number;
  /** Start index for pagination (1-based) */
  start?: number;
  /** Date restriction (e.g., 'd7' for last 7 days, 'm1' for last month) */
  dateRestrict?: string;
  /** Language restriction (e.g., 'lang_en', 'lang_fr') */
  lr?: string;
  /** Geolocation (e.g., 'us', 'fr') */
  gl?: string;
  /** File type filter (e.g., 'pdf') */
  fileType?: string;
  /** Sort by date (date:a for ascending, date:d for descending) */
  sort?: string;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
  publishedDate: string | null;
  displayLink: string;
  fileFormat: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  searchTime: number;
  nextStartIndex: number | null;
  query: string;
}

export class GoogleCSEError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public googleError?: string
  ) {
    super(message);
    this.name = 'GoogleCSEError';
  }
}

// ============================================================================
// Configuration Validation
// ============================================================================

function getConfig(): GoogleCSEConfig {
  const apiKey = process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!apiKey) {
    throw new GoogleCSEError(
      'GOOGLE_CSE_API_KEY ou GOOGLE_CSE_KEY non défini. ' +
      'Ajoutez votre clé API Google dans les variables d\'environnement.',
      500
    );
  }

  if (!cx) {
    throw new GoogleCSEError(
      'GOOGLE_CSE_CX non défini. ' +
      'Ajoutez votre Search Engine ID dans les variables d\'environnement.',
      500
    );
  }

  return { apiKey, cx };
}

// ============================================================================
// Core Search Function
// ============================================================================

/**
 * Recherche via Google Custom Search JSON API
 * 
 * @param query - Requête de recherche
 * @param options - Options de recherche (pagination, filtres, etc.)
 * @returns Résultats normalisés
 * 
 * @example
 * const results = await searchGoogle('AI policy site:brookings.edu');
 * console.log(results.results[0].title);
 */
export async function searchGoogle(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const config = getConfig();
  
  const params: Record<string, string | number> = {
    key: config.apiKey,
    cx: config.cx,
    q: query,
    num: Math.min(options.num || 10, MAX_RESULTS_PER_PAGE),
  };

  // Optional parameters
  if (options.start) params.start = options.start;
  if (options.dateRestrict) params.dateRestrict = options.dateRestrict;
  if (options.lr) params.lr = options.lr;
  if (options.gl) params.gl = options.gl;
  if (options.fileType) params.fileType = options.fileType;
  if (options.sort) params.sort = options.sort;

  console.log(`[Google-CSE] Searching: "${query}" (num=${params.num})`);

  try {
    const startTime = Date.now();
    
    const { data } = await axios.get(GOOGLE_CSE_ENDPOINT, {
      params,
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NomosX/1.0 (Think Tank Research Platform)'
      }
    });

    const searchTime = Date.now() - startTime;
    const totalResults = parseInt(data.searchInformation?.totalResults || '0', 10);

    // Normalize results
    const results: SearchResult[] = (data.items || []).map((item: any) => ({
      title: item.title || 'Untitled',
      link: item.link || '',
      snippet: item.snippet || '',
      source: extractSource(item.link),
      publishedDate: extractDate(item),
      displayLink: item.displayLink || '',
      fileFormat: item.fileFormat || (item.link?.endsWith('.pdf') ? 'PDF' : null)
    }));

    // Calculate next page start index
    const currentStart = options.start || 1;
    const nextStartIndex = currentStart + results.length < totalResults 
      ? currentStart + results.length 
      : null;

    console.log(`[Google-CSE] Found ${results.length} results (${totalResults} total) in ${searchTime}ms`);

    return {
      results,
      totalResults,
      searchTime,
      nextStartIndex,
      query
    };

  } catch (error) {
    handleError(error);
    throw error; // TypeScript requires this
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Recherche sur un site spécifique
 * 
 * @example
 * const results = await searchSite('AI governance', 'brookings.edu');
 */
export async function searchSite(
  query: string,
  site: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  return searchGoogle(`${query} site:${site}`, options);
}

/**
 * Recherche de PDFs uniquement
 * 
 * @example
 * const results = await searchPDFs('cybersecurity framework');
 */
export async function searchPDFs(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  return searchGoogle(query, { ...options, fileType: 'pdf' });
}

/**
 * Recherche avec pagination automatique
 * 
 * @param query - Requête de recherche
 * @param maxResults - Nombre maximum de résultats (default: 30)
 * @returns Tous les résultats agrégés
 */
export async function searchDeepWeb(
  query: string,
  maxResults: number = 30
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  let startIndex = 1;
  
  while (allResults.length < maxResults) {
    const remaining = maxResults - allResults.length;
    const num = Math.min(remaining, MAX_RESULTS_PER_PAGE);
    
    try {
      const response = await searchGoogle(query, { num, start: startIndex });
      allResults.push(...response.results);
      
      if (!response.nextStartIndex || response.results.length === 0) {
        break; // No more results
      }
      
      startIndex = response.nextStartIndex;
      
      // Rate limiting - wait 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error('[Google-CSE] Pagination stopped due to error:', error);
      break;
    }
  }
  
  return allResults.slice(0, maxResults);
}

/**
 * Recherche récente (derniers N jours)
 * 
 * @example
 * const results = await searchRecent('AI regulation', 7); // Last 7 days
 */
export async function searchRecent(
  query: string,
  days: number = 7,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  return searchGoogle(query, { ...options, dateRestrict: `d${days}` });
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractSource(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function extractDate(item: any): string | null {
  // Try pagemap metatags first
  const metatags = item.pagemap?.metatags?.[0];
  if (metatags) {
    const dateFields = [
      'article:published_time',
      'og:published_time',
      'date',
      'dc.date',
      'datePublished'
    ];
    for (const field of dateFields) {
      if (metatags[field]) {
        return metatags[field];
      }
    }
  }
  
  // Try to extract from snippet
  const dateMatch = item.snippet?.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2}, \d{4}|\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) {
    return dateMatch[1];
  }
  
  return null;
}

function handleError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;
    const status = axiosError.response?.status || 500;
    const googleMessage = axiosError.response?.data?.error?.message;
    const googleErrors = axiosError.response?.data?.error?.errors;
    
    // Log raw error for debugging
    console.error('[Google-CSE] API Error:', {
      status,
      message: googleMessage,
      errors: googleErrors,
      url: axiosError.config?.url,
      params: axiosError.config?.params
    });

    // Specific error messages
    switch (status) {
      case 400:
        throw new GoogleCSEError(
          `Paramètres invalides: ${googleMessage || 'Vérifiez la requête'}`,
          400,
          googleMessage
        );
      
      case 403:
        if (googleMessage?.includes('API key')) {
          throw new GoogleCSEError(
            'Clé API invalide ou non autorisée. Vérifiez GOOGLE_CSE_API_KEY.',
            403,
            googleMessage
          );
        }
        if (googleMessage?.includes('Custom Search')) {
          throw new GoogleCSEError(
            'L\'API Custom Search n\'est pas activée sur ce projet Google Cloud. ' +
            'Activez-la sur: https://console.cloud.google.com/apis/library/customsearch.googleapis.com',
            403,
            googleMessage
          );
        }
        if (googleMessage?.includes('billing')) {
          throw new GoogleCSEError(
            'Facturation non activée sur le projet Google Cloud. ' +
            'Activez-la sur: https://console.cloud.google.com/billing',
            403,
            googleMessage
          );
        }
        throw new GoogleCSEError(
          `Accès refusé: ${googleMessage || 'Vérifiez les permissions'}`,
          403,
          googleMessage
        );
      
      case 429:
        throw new GoogleCSEError(
          'Quota dépassé. Limite: 100 requêtes/jour (gratuit) ou 10,000/jour (payant).',
          429,
          googleMessage
        );
      
      default:
        throw new GoogleCSEError(
          `Erreur Google API (${status}): ${googleMessage || axiosError.message}`,
          status,
          googleMessage
        );
    }
  }
  
  // Non-Axios error
  throw new GoogleCSEError(
    `Erreur inattendue: ${error instanceof Error ? error.message : String(error)}`,
    500
  );
}

// ============================================================================
// Test Function
// ============================================================================

/**
 * Test simple de l'API Google Custom Search
 * Vérifie que les credentials sont valides et que l'API répond.
 */
export async function testGoogleCSE(): Promise<boolean> {
  console.log('\n[Google-CSE] === TEST DE CONNEXION ===\n');
  
  // Check environment variables
  const apiKey = process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  
  console.log(`API Key: ${apiKey ? `${apiKey.substring(0, 10)}...` : '❌ NON DÉFINI'}`);
  console.log(`CX: ${cx ? cx : '❌ NON DÉFINI'}`);
  
  if (!apiKey || !cx) {
    console.error('\n❌ Variables d\'environnement manquantes');
    return false;
  }
  
  try {
    const response = await searchGoogle('test', { num: 1 });
    
    console.log(`\n✅ SUCCÈS`);
    console.log(`   Résultats: ${response.totalResults}`);
    console.log(`   Temps: ${response.searchTime}ms`);
    
    if (response.results.length > 0) {
      console.log(`   Premier résultat: ${response.results[0].title}`);
    }
    
    return true;
    
  } catch (error) {
    if (error instanceof GoogleCSEError) {
      console.error(`\n❌ ERREUR (${error.statusCode}): ${error.message}`);
      if (error.googleError) {
        console.error(`   Message Google: ${error.googleError}`);
      }
    } else {
      console.error('\n❌ ERREUR INATTENDUE:', error);
    }
    return false;
  }
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  search: searchGoogle,
  searchSite,
  searchPDFs,
  searchDeepWeb,
  searchRecent,
  test: testGoogleCSE
};
