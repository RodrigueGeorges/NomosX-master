/**
 * INSEE Melodi API Provider
 * API: https://api.insee.fr/melodi
 * Documentation: https://www.insee.fr/fr/information/2114819
 * 
 * Accès aux données statistiques françaises via l'API Melodi
 * Nécessite une clé API INSEE
 */

import { fetchFromProvider } from '../http-client';

const MELODI_BASE_URL = "https://api.insee.fr/melodi";

/**
 * Récupérer tous les jeux de données disponibles
 */
export async function getMelodiCatalog(): Promise<any[]> {
  try {
    const url = `${MELODI_BASE_URL}/catalog/all`;
    const data = await fetchFromProvider("melodi", url, { timeout: 15000 });
    return data || [];
  } catch (error: any) {
    console.error(`[MELODI] Catalog fetch failed: ${error.message}`);
    return [];
  }
}

/**
 * Récupérer les métadonnées d'un jeu de données spécifique
 */
export async function getMelodiDataset(datasetId: string): Promise<any | null> {
  try {
    const url = `${MELODI_BASE_URL}/catalog/${datasetId}`;
    const data = await fetchFromProvider("melodi", url, { timeout: 10000 });
    return data;
  } catch (error: any) {
    console.error(`[MELODI] Dataset ${datasetId} fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Récupérer les dimensions et modalités d'un jeu de données
 */
export async function getMelodiRange(datasetId: string): Promise<any | null> {
  try {
    const url = `${MELODI_BASE_URL}/range/${datasetId}`;
    const data = await fetchFromProvider("melodi", url, { timeout: 10000 });
    return data;
  } catch (error: any) {
    console.error(`[MELODI] Range ${datasetId} fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Récupérer les données filtrées d'un jeu de données
 */
export async function getMelodiData(
  datasetId: string, 
  filters: Record<string, string> = {},
  maxResult = 100
): Promise<any> {
  try {
    const params = new URLSearchParams();
    
    // Ajouter les filtres
    Object.entries(filters).forEach(([dimension, codes]) => {
      if (Array.isArray(codes)) {
        codes.forEach(code => params.append(dimension, code));
      } else {
        params.append(dimension, codes);
      }
    });
    
    // Ajouter la limite
    params.append('maxResult', maxResult.toString());
    
    const url = `${MELODI_BASE_URL}/data/${datasetId}?${params}`;
    const data = await fetchFromProvider("melodi", url, { timeout: 20000 });
    
    return data;
  } catch (error: any) {
    console.error(`[MELODI] Data ${datasetId} fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Compter le nombre d'observations pour une requête
 */
export async function getMelodiCount(
  datasetId: string, 
  filters: Record<string, string> = {}
): Promise<number> {
  try {
    const params = new URLSearchParams();
    
    // Ajouter les filtres
    Object.entries(filters).forEach(([dimension, codes]) => {
      if (Array.isArray(codes)) {
        codes.forEach(code => params.append(dimension, code));
      } else {
        params.append(dimension, codes);
      }
    });
    
    // Paramètres pour compter uniquement
    params.append('maxResult', '0');
    params.append('totalCount', 'true');
    
    const url = `${MELODI_BASE_URL}/data/${datasetId}?${params}`;
    const data = await fetchFromProvider("melodi", url, { timeout: 10000 });
    
    return data?.totalCount || 0;
  } catch (error: any) {
    console.error(`[MELODI] Count ${datasetId} failed: ${error.message}`);
    return 0;
  }
}

/**
 * Recherche de jeux de données pertinents pour une query
 */
export async function searchMelodi(query: string, limit = 10): Promise<any[]> {
  try {
    console.log(`[MELODI] Searching for: "${query}"`);
    
    // 1. Récupérer le catalogue complet
    const catalog = await getMelodiCatalog();
    
    if (!catalog || catalog.length === 0) {
      console.log(`[MELODI] No catalog available`);
      return [];
    }
    
    // 2. Filtrer par pertinence (titre, description, mots-clés)
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/);
    
    const relevantDatasets = catalog
      .filter((dataset: any) => {
        const title = (dataset.title || dataset.label || '').toLowerCase();
        const description = (dataset.description || '').toLowerCase();
        const keywordsField = (dataset.keywords || []).join(' ').toLowerCase();
        
        // Score de pertinence
        let score = 0;
        
        // Titre exact
        if (title.includes(queryLower)) score += 10;
        
        // Mots-clés dans le titre
        keywords.forEach(keyword => {
          if (title.includes(keyword)) score += 3;
          if (description.includes(keyword)) score += 2;
          if (keywordsField.includes(keyword)) score += 1;
        });
        
        return score > 0;
      })
      .sort((a: any, b: any) => {
        // Trier par pertinence puis par date de mise à jour
        const scoreA = calculateRelevanceScore(a, queryLower, keywords);
        const scoreB = calculateRelevanceScore(b, queryLower, keywords);
        
        if (scoreA !== scoreB) return scoreB - scoreA;
        
        // En cas d'égalité, plus récent d'abord
        const dateA = new Date(a.updated || a.created || '1970-01-01');
        const dateB = new Date(b.updated || b.created || '1970-01-01');
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, limit);
    
    // 3. Enrichir avec les métadonnées détaillées
    const enrichedDatasets = await Promise.allSettled(
      relevantDatasets.map(async (dataset: any) => {
        const metadata = await getMelodiDataset(dataset.id);
        const range = await getMelodiRange(dataset.id);
        const count = await getMelodiCount(dataset.id);
        
        return {
          id: `melodi:${dataset.id}`,
          provider: 'melodi',
          type: 'dataset',
          title: dataset.title || dataset.label || '',
          abstract: dataset.description || '',
          year: extractYear(dataset),
          url: `https://www.insee.fr/fr/metadonnees/cog/${dataset.id}`,
          
          // Métadonnées INSEE
          datasetId: dataset.id,
          frequency: metadata?.frequency || '',
          territorialGranularity: metadata?.territorialGranularity || '',
          temporalCoverage: metadata?.temporalCoverage || '',
          
          // Métadonnées enrichies
          dimensions: range?.dimensions || [],
          totalObservations: count,
          
          // Métadonnées institutionnelles
          documentType: 'statistical-dataset',
          issuer: 'INSEE',
          issuerType: 'statistical',
          classification: 'public',
          language: 'fr',
          contentFormat: 'json',
          oaStatus: 'insee-open-data',
          hasFullText: true,
          
          // URL directe vers les données CSV
          csvUrl: `${MELODI_BASE_URL}/file/${dataset.id}/${dataset.id}_CSV_FR`,
          
          raw: { 
            source: 'melodi', 
            searchQuery: query,
            metadata,
            range,
            catalog: dataset
          }
        };
      })
    );
    
    const results = enrichedDatasets
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    
    console.log(`[MELODI] Found ${results.length} relevant datasets`);
    return results;
    
  } catch (error: any) {
    console.error(`[MELODI] Search failed: ${error.message}`);
    return [];
  }
}

/**
 * Calculer le score de pertinence pour un jeu de données
 */
function calculateRelevanceScore(dataset: any, queryLower: string, keywords: string[]): number {
  const title = (dataset.title || dataset.label || '').toLowerCase();
  const description = (dataset.description || '').toLowerCase();
  const keywordsField = (dataset.keywords || []).join(' ').toLowerCase();
  
  let score = 0;
  
  // Titre exact
  if (title.includes(queryLower)) score += 10;
  
  // Mots-clés
  keywords.forEach(keyword => {
    if (title.includes(keyword)) score += 3;
    if (description.includes(keyword)) score += 2;
    if (keywordsField.includes(keyword)) score += 1;
  });
  
  return score;
}

/**
 * Extraire l'année d'un jeu de données
 */
function extractYear(dataset: any): number | null {
  // Essayer différentes propriétés de date
  const dateFields = ['updated', 'created', 'published', 'releaseDate'];
  
  for (const field of dateFields) {
    if (dataset[field]) {
      const match = String(dataset[field]).match(/\b(20\d{2})\b/);
      if (match) return parseInt(match[1]);
    }
  }
  
  return null;
}
