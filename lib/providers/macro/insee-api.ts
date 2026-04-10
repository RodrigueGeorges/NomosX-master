/**
 * INSEE API PROVIDER - Macroéconomique français
 * API officielle INSEE pour données statistiques françaises
 */

import { z } from 'zod';

const INSEEResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  data: z.array(z.object({
      period: z.string(),
      value: z.number()
  }))
});

export type INSEEResult = z.infer<typeof INSEEResultSchema>;

export async function searchINSEE(query: string, limit = 15): Promise<any[]> {
  const baseUrl = 'https://api.insee.fr/series/BDM/V1/data';
  
  try {
    // Mapping des requêtes vers datasets INSEE pertinents
    const queryMappings = {
      'inflation': 'IPC-2015-0.1', // Indice des prix à la consommation
      'gdp': 'PIB-TRIM-2015-CV', // PIB trimestriel
      'unemployment': 'CHOMAGE-TRIM', // Chômage trimestriel
      'trade': 'Echanges-COMEXT', // Commerce extérieur
      'interest': 'TAUX-INTERET', // Taux d'intérêt
      'debt': 'DETTES', // Dette publique
      'deficit': 'DEFICIT', // Déficit public
      'investment': 'FBCF', // Formation brute de capital fixe
      'consumption': 'CONSOMMATION', // Consommation
      'production': 'INDICE-PROD', // Indice de production
      'emploi': 'EMPLOI', // Emploi
      'salaire': 'SALAIRE-HORAIRE' // Salaire horaire
    };

    // Chercher le dataset le plus pertinent
    const datasetCode = Object.keys(queryMappings).find(key => 
      query.toLowerCase().includes(key)
    ) || 'IPC-2015-0.1'; // Default: inflation

    const dataset = queryMappings[datasetCode as keyof typeof queryMappings];
    
    // Construire l'URL API INSEE
    const url = `${baseUrl}/${dataset}?format=json`;
    
    console.log(`[INSEE] Fetching dataset: ${dataset}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.INSEE_API_KEY || ''}`,
        'Accept-Language': 'fr'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.warn(`[INSEE] API key required or invalid, using fallback`);
        throw new Error('INSEE API authentication required');
      }
      throw new Error(`INSEE API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Transformer les données INSEE en format NomosX
    const sources = await transformINSEEToSources(data, dataset, query);
    
    return sources.slice(0, limit);

  } catch (error: any) {
    console.error(`[INSEE] Error: ${error.message}`);
    
    // Fallback: datasets core connus
    return getINSEEFallback(query, limit);
  }
}

async function transformINSEEToSources(data: any, dataset: string, query: string): Promise<any[]> {
  const sources: any[] = [];
  
  try {
    // Extraire les métadonnées
    const label = data?.label?.fr || dataset;
    const description = generateINSEEDescription(dataset, query);
    
    // Créer une source pour le dataset principal
    sources.push({
      id: `insee:${dataset}`,
      provider: 'insee',
      type: 'dataset',
      title: `INSEE — ${label}`,
      abstract: description,
      url: `https://www.insee.fr/fr/series/${dataset}`,
      pdfUrl: '',
      year: new Date().getFullYear(),
      publishedDate: new Date().toISOString(),
      authors: [],
      citationCount: 0,
      qualityScore: 86,
      noveltyScore: 71,
      documentType: 'statistical_dataset',
      issuer: 'INSEE (Institut National de la Statistique)',
      issuerType: 'government',
      classification: 'macro_economics',
      language: 'fr',
      contentFormat: 'json',
      oaStatus: 'open',
      hasFullText: true,
      raw: {
        source: 'insee-api',
        dataset,
        query,
        dataPoints: data?.observations?.length || 0,
        lastUpdated: data?.updated || new Date().toISOString(),
        fallback: false
      }
    });

    // Ajouter des séries temporelles si disponibles
    if (data?.observations) {
      const latestPeriods = data.observations.slice(-5); // 5 dernières périodes
      
      latestPeriods?.forEach((obs: any, index: number) => {
        const periodDate = obs.period || obs.date || new Date().getFullYear().toString();
        
        sources.push({
          id: `insee:${dataset}:${periodDate}`,
          provider: 'insee',
          type: 'timeseries',
          title: `INSEE — ${label} (${periodDate})`,
          abstract: `Série temporelle INSEE pour ${label}, période ${periodDate}`,
          url: `https://www.insee.fr/fr/series/${dataset}`,
          year: parseInt(periodDate) || new Date().getFullYear(),
          publishedDate: `${periodDate}-01-01`,
          authors: [],
          citationCount: 0,
          qualityScore: 82,
          noveltyScore: 67,
          documentType: 'timeseries',
          issuer: 'INSEE (Institut National de la Statistique)',
          issuerType: 'government',
          classification: 'macro_economics',
          language: 'fr',
          contentFormat: 'json',
          oaStatus: 'open',
          hasFullText: true,
          raw: {
            source: 'insee-timeseries',
            dataset,
            period: periodDate,
            value: obs.value,
            query,
            fallback: false
          }
        });
      });
    }

  } catch (error: any) {
    console.error(`[INSEE] Transform error: ${error.message}`);
  }

  return sources;
}

function generateINSEEDescription(dataset: string, query: string): string {
  const descriptions: Record<string, string> = {
    'IPC-2015-0.1': 'Indice des prix à la consommation - Données mensuelles sur l\'inflation française (base 2015)',
    'PIB-TRIM-2015-CV': 'Produit intérieur brut trimestriel - Données du PIB français en volume et en valeur',
    'CHOMAGE-TRIM': 'Taux de chômage trimestriel - Données sur le chômage en France par catégorie',
    'Echanges-COMEXT': 'Commerce extérieur mensuel - Importations et exportations françaises de biens',
    'TAUX-INTERET': 'Taux d\'intérêt - Données sur les taux monétaires et obligataires français',
    'DETTES': 'Dette publique - Données sur l\'endettement de l\'État français',
    'DEFICIT': 'Déficit public - Données sur le solde budgétaire français',
    'FBCF': 'Formation brute de capital fixe - Données trimestrielles sur l\'investissement',
    'CONSOMMATION': 'Consommation finale des ménages - Données mensuelles sur la consommation',
    'INDICE-PROD': 'Indice de production industrielle - Données mensuelles sur l\'activité industrielle',
    'EMPLOI': 'Emploi salarié - Données trimestrielles sur l\'emploi en France',
    'SALAIRE-HORAIRE': 'Salaire horaire moyen - Données mensuelles sur les salaires'
  };

  return descriptions[dataset] || `Dataset INSEE pour ${query} - Données statistiques officielles françaises`;
}

function getINSEEFallback(query: string, limit: number): any[] {
  const fallbackDatasets = [
    {
      id: 'insee:IPC-2015-0.1',
      title: 'INSEE — Indice des prix à la consommation',
      description: 'Données mensuelles sur l\'inflation française (base 2015)',
      url: 'https://www.insee.fr/fr/series/IPC-2015-0.1'
    },
    {
      id: 'insee:PIB-TRIM-2015-CV',
      title: 'INSEE — Produit intérieur brut trimestriel',
      description: 'Données du PIB français en volume et en valeur',
      url: 'https://www.insee.fr/fr/series/PIB-TRIM-2015-CV'
    },
    {
      id: 'insee:CHOMAGE-TRIM',
      title: 'INSEE — Taux de chômage trimestriel',
      description: 'Données sur le chômage en France par catégorie',
      url: 'https://www.insee.fr/fr/series/CHOMAGE-TRIM'
    }
  ];

  return fallbackDatasets.slice(0, limit).map((dataset, index) => ({
    id: dataset.id,
    provider: 'insee',
    type: 'dataset',
    title: dataset.title,
    abstract: dataset.description,
    url: dataset.url,
    pdfUrl: '',
    year: new Date().getFullYear(),
    publishedDate: new Date().toISOString(),
    authors: [],
    citationCount: 0,
    qualityScore: 76,
    noveltyScore: 63,
    documentType: 'statistical_dataset',
    issuer: 'INSEE (Institut National de la Statistique)',
    issuerType: 'government',
    classification: 'macro_economics',
    language: 'fr',
    contentFormat: 'json',
    oaStatus: 'open',
    hasFullText: true,
    raw: {
      source: 'insee-fallback',
      query,
      fallback: true
    }
  }));
}
