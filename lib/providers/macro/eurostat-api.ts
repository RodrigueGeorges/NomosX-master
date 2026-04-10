/**
 * EUROSTAT API PROVIDER - Macroéconomique européen
 * API officielle Eurostat pour données statistiques européennes
 */

import { z } from 'zod';

const EurostatResultSchema = z.object({
  code: z.string(),
  label: z.string(),
  description: z.string().optional(),
  values: z.array(z.number()),
  time: z.array(z.string()),
  unit: z.string().optional(),
  geo: z.string().optional()
});

export type EurostatResult = z.infer<typeof EurostatResultSchema>;

export async function searchEurostat(query: string, limit = 15): Promise<any[]> {
  const baseUrl = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
  
  try {
    // Mapping des requêtes vers datasets Eurostat pertinents
    const queryMappings = {
      'inflation': 'prc_hicp_manr', // Harmonized indices of consumer prices
      'gdp': 'namq_10_gdp', // Quarterly GDP
      'unemployment': 'une_m_q', // Unemployment by sex and age
      'trade': 'une_rt_a', // International trade
      'interest': 'irt_st_m', // Interest rates
      'debt': 'gov_10q_debt', // Government debt
      'deficit': 'gov_10q_ggdebt', // Government deficit
      'investment': 'namq_10_fi', // Investment
      'consumption': 'namq_10_cp', // Consumption
      'production': 'sts_inpr_m', // Production
    };

    // Chercher le dataset le plus pertinent
    const datasetCode = Object.keys(queryMappings).find(key => 
      query.toLowerCase().includes(key)
    ) || 'prc_hicp_manr'; // Default: inflation

    const dataset = queryMappings[datasetCode as keyof typeof queryMappings];
    
    // Construire l'URL API
    const url = `${baseUrl}/${dataset}?format=json&lang=fr`;
    
    console.log(`[Eurostat] Fetching dataset: ${dataset}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NomosX/1.0'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`Eurostat API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Transformer les données Eurostat en format NomosX
    const sources = await transformEurostatToSources(data, dataset, query);
    
    return sources.slice(0, limit);

  } catch (error: any) {
    console.error(`[Eurostat] Error: ${error.message}`);
    
    // Fallback: datasets core connus
    return getEurostatFallback(query, limit);
  }
}

async function transformEurostatToSources(data: any, dataset: string, query: string): Promise<any[]> {
  const sources: any[] = [];
  
  try {
    // Extraire les métadonnées
    const label = data?.label?.fr || dataset;
    const description = generateDescription(dataset, query);
    
    // Créer une source pour le dataset principal
    sources.push({
      id: `eurostat:${dataset}`,
      provider: 'eurostat',
      type: 'dataset',
      title: `Eurostat — ${label}`,
      abstract: description,
      url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=fr`,
      pdfUrl: '',
      year: new Date().getFullYear(),
      publishedDate: new Date().toISOString(),
      authors: [],
      citationCount: 0,
      qualityScore: 85,
      noveltyScore: 70,
      documentType: 'statistical_dataset',
      issuer: 'Eurostat (European Commission)',
      issuerType: 'government',
      classification: 'macro_economics',
      language: 'fr',
      contentFormat: 'json',
      oaStatus: 'open',
      hasFullText: true,
      raw: {
        source: 'eurostat-api',
        dataset,
        query,
        dataPoints: data?.value ? Object.keys(data.value).length : 0,
        lastUpdated: data?.updated || new Date().toISOString(),
        fallback: false
      }
    });

    // Ajouter des sous-séries si disponibles
    if (data?.structure?.dimensions?.observation) {
      const dimensions = data.structure.dimensions.observation;
      const timeDimension = dimensions.find((d: any) => d.id === 'time');
      
      if (timeDimension?.role?.time) {
        const latestPeriod = timeDimension.values?.slice(-3); // 3 dernières périodes
        
        latestPeriod?.forEach((period: any, index: number) => {
          sources.push({
            id: `eurostat:${dataset}:${period.id}`,
            provider: 'eurostat',
            type: 'timeseries',
            title: `Eurostat — ${label} (${period.id})`,
            abstract: `Série temporelle pour ${label}, période ${period.id}`,
            url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=fr`,
            year: parseInt(period.id) || new Date().getFullYear(),
            publishedDate: period.id ? `${period.id}-01-01` : new Date().toISOString(),
            authors: [],
            citationCount: 0,
            qualityScore: 80,
            noveltyScore: 65,
            documentType: 'timeseries',
            issuer: 'Eurostat (European Commission)',
            issuerType: 'government',
            classification: 'macro_economics',
            language: 'fr',
            contentFormat: 'json',
            oaStatus: 'open',
            hasFullText: true,
            raw: {
              source: 'eurostat-timeseries',
              dataset,
              period: period.id,
              query,
              fallback: false
            }
          });
        });
      }
    }

  } catch (error: any) {
    console.error(`[Eurostat] Transform error: ${error.message}`);
  }

  return sources;
}

function generateDescription(dataset: string, query: string): string {
  const descriptions: Record<string, string> = {
    'prc_hicp_manr': 'Indices harmonisés des prix à la consommation (HICP) - Données mensuelles sur l\'inflation pour la zone euro et les pays membres',
    'namq_10_gdp': 'Produit intérieur brut (PIB) trimestriel - Données du PIB en volume et en valeur pour les économies européennes',
    'une_m_q': 'Taux de chômage trimestriel - Données sur l\'emploi et le chômage par sexe et groupe d\'âge',
    'une_rt_a': 'Commerce international trimestriel - Importations et exportations de biens et services',
    'irt_st_m': 'Taux d\'intérêt mensuels - Données sur les taux directeurs et taux de marché',
    'gov_10q_debt': 'Dette publique trimestrielle - Ratio dette/PIB et dette nominale par pays',
    'gov_10q_ggdebt': 'Déficit public trimestriel - Ratio déficit/PIB et solde budgétaire',
    'namq_10_fi': 'Formation brute de capital fixe - Données trimestrielles sur l\'investissement',
    'namq_10_cp': 'Consommation finale des ménages - Données trimestrielles sur la consommation',
    'sts_inpr_m': 'Indice de production industrielle mensuel - Données sur la production industrielle'
  };

  return descriptions[dataset] || `Dataset Eurostat pour ${query} - Données statistiques officielles européennes`;
}

function getEurostatFallback(query: string, limit: number): any[] {
  const fallbackDatasets = [
    {
      id: 'eurostat:prc_hicp_manr',
      title: 'Eurostat — Indices harmonisés des prix à la consommation (HICP)',
      description: 'Données mensuelles sur l\'inflation pour la zone euro et les pays membres',
      url: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_manr/default/table?lang=fr'
    },
    {
      id: 'eurostat:namq_10_gdp',
      title: 'Eurostat — Produit intérieur brut (PIB) trimestriel',
      description: 'Données du PIB en volume et en valeur pour les économies européennes',
      url: 'https://ec.europa.eu/eurostat/databrowser/view/namq_10_gdp/default/table?lang=fr'
    },
    {
      id: 'eurostat:une_m_q',
      title: 'Eurostat — Taux de chômage trimestriel',
      description: 'Données sur l\'emploi et le chômage par sexe et groupe d\'âge',
      url: 'https://ec.europa.eu/eurostat/databrowser/view/une_m_q/default/table?lang=fr'
    }
  ];

  return fallbackDatasets.slice(0, limit).map((dataset, index) => ({
    id: dataset.id,
    provider: 'eurostat',
    type: 'dataset',
    title: dataset.title,
    abstract: dataset.description,
    url: dataset.url,
    pdfUrl: '',
    year: new Date().getFullYear(),
    publishedDate: new Date().toISOString(),
    authors: [],
    citationCount: 0,
    qualityScore: 75,
    noveltyScore: 60,
    documentType: 'statistical_dataset',
    issuer: 'Eurostat (European Commission)',
    issuerType: 'government',
    classification: 'macro_economics',
    language: 'fr',
    contentFormat: 'json',
    oaStatus: 'open',
    hasFullText: true,
    raw: {
      source: 'eurostat-fallback',
      query,
      fallback: true
    }
  }));
}
