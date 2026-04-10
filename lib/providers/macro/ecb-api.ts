/**
 * ECB API PROVIDER - Macroéconomique européen
 * API officielle BCE pour données monétaires et financières
 */

import { z } from 'zod';

const ECBResultSchema = z.object({
  series: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    observations: z.array(z.object({
      period: z.string(),
      value: z.number()
    }))
  })
});

export type ECBResult = z.infer<typeof ECBResultSchema>;

export async function searchECB(query: string, limit = 15): Promise<any[]> {
  const baseUrl = 'https://data-api.ecb.europa.eu/service/data';
  
  try {
    // Mapping des requêtes vers datasets BCE pertinents
    const queryMappings = {
      'inflation': 'ICP/M.U2.N.000000.4.INFL', // Inflation rate
      'interest': 'FM/M.U2.EUR.4F.BB.U2.EUR', // ECB interest rates
      'money': 'BS/M.U2.N.V.A20.BS.A4', // Money supply M2
      'gdp': 'BOP/Q.EU.I8.W0.S01.S1.V.TT', // Balance of payments
      'exchange': 'EXR/M.USD.EUR.SP00.A', // Exchange rates
      'credit': 'BS/M.N.L.V.A20.BS.A4', // Credit to non-financial corporations
      'debt': 'CI/M.N.V.A20.BS.A4', // Government debt securities
      'liquidity': 'LI/M.U2.N.V.A20.BS.A4', // Liquidity
      'banking': 'BS/M.N.V.A20.BS.A4', // Banking sector
      'cpi': 'ICP/M.U2.N.000000.4.INFL' // Consumer Price Index (alternative)
    };

    // Chercher le dataset le plus pertinent
    const datasetCode = Object.keys(queryMappings).find(key => 
      query.toLowerCase().includes(key)
    ) || 'ICP/M.U2.N.000000.4.INFL'; // Default: inflation

    const dataset = queryMappings[datasetCode as keyof typeof queryMappings];
    
    // Construire l'URL API SDMX
    const url = `${baseUrl}/${dataset}?format=json`;
    
    console.log(`[ECB] Fetching dataset: ${dataset}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.sdmx.structure+json;version=1.0,application/json',
        'Accept-Language': 'en'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`ECB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Transformer les données BCE en format NomosX
    const sources = await transformECBToSources(data, dataset, query);
    
    return sources.slice(0, limit);

  } catch (error: any) {
    console.error(`[ECB] Error: ${error.message}`);
    
    // Fallback: datasets core connus
    return getECBFallback(query, limit);
  }
}

async function transformECBToSources(data: any, dataset: string, query: string): Promise<any[]> {
  const sources: any[] = [];
  
  try {
    // Extraire les métadonnées
    const dataStructure = data?.structure;
    const dataSetInfo = dataStructure?.data?.dataSets?.[0];
    const seriesInfo = dataStructure?.data?.series?.[0];
    
    const title = generateTitle(dataset, query);
    const description = generateECBDescription(dataset, query);
    
    // Créer une source pour le dataset principal
    sources.push({
      id: `ecb:${dataset.replace(/[^a-zA-Z0-9]/g, '_')}`,
      provider: 'ecb',
      type: 'dataset',
      title: `ECB — ${title}`,
      abstract: description,
      url: `https://sdw-wsrest.ecb.europa.eu/service/data/${dataset}`,
      pdfUrl: '',
      year: new Date().getFullYear(),
      publishedDate: new Date().toISOString(),
      authors: [],
      citationCount: 0,
      qualityScore: 88,
      noveltyScore: 72,
      documentType: 'monetary_dataset',
      issuer: 'European Central Bank',
      issuerType: 'government',
      classification: 'monetary_economics',
      language: 'en',
      contentFormat: 'json',
      oaStatus: 'open',
      hasFullText: true,
      raw: {
        source: 'ecb-api',
        dataset,
        query,
        dataPoints: dataSetInfo?.series?.length || 0,
        lastUpdated: dataStructure?.meta?.prepared || new Date().toISOString(),
        fallback: false
      }
    });

    // Ajouter des séries temporelles si disponibles
    if (seriesInfo) {
      const observations = dataSetInfo?.series?.[0]?.observations || {};
      const latestPeriods = Object.entries(observations).slice(-5); // 5 dernières périodes
      
      latestPeriods?.forEach(([period, value], index: number) => {
        const periodDate = period.split('-')[0]; // Extraire l'année
        
        sources.push({
          id: `ecb:${dataset.replace(/[^a-zA-Z0-9]/g, '_')}:${period}`,
          provider: 'ecb',
          type: 'timeseries',
          title: `ECB — ${title} (${period})`,
          abstract: `Série temporelle BCE pour ${title}, période ${period}`,
          url: `https://sdw-wsrest.ecb.europa.eu/service/data/${dataset}`,
          year: parseInt(periodDate) || new Date().getFullYear(),
          publishedDate: `${periodDate}-01-01`,
          authors: [],
          citationCount: 0,
          qualityScore: 85,
          noveltyScore: 68,
          documentType: 'timeseries',
          issuer: 'European Central Bank',
          issuerType: 'government',
          classification: 'monetary_economics',
          language: 'en',
          contentFormat: 'json',
          oaStatus: 'open',
          hasFullText: true,
          raw: {
            source: 'ecb-timeseries',
            dataset,
            period,
            value: value,
            query,
            fallback: false
          }
        });
      });
    }

  } catch (error: any) {
    console.error(`[ECB] Transform error: ${error.message}`);
  }

  return sources;
}

function generateTitle(dataset: string, query: string): string {
  const titles: Record<string, string> = {
    'ICP/M.U2.N.000000.4.INFL': 'Euro Area Inflation Rate',
    'FM/M.U2.EUR.4F.BB.U2.EUR': 'ECB Policy Interest Rates',
    'BS/M.U2.N.V.A20.BS.A4': 'Euro Area Money Supply (M2)',
    'BOP/Q.EU.I8.W0.S01.S1.V.TT': 'Euro Area Balance of Payments',
    'EXR/M.USD.EUR.SP00.A': 'USD/EUR Exchange Rate',
    'BS/M.N.L.V.A20.BS.A4': 'Credit to Non-Financial Corporations',
    'CI/M.N.V.A20.BS.A4': 'Government Debt Securities',
    'LI/M.U2.N.V.A20.BS.A4': 'Banking Sector Liquidity'
  };

  return titles[dataset] || `ECB Dataset for ${query}`;
}

function generateECBDescription(dataset: string, query: string): string {
  const descriptions: Record<string, string> = {
    'ICP/M.U2.N.000000.4.INFL': 'Taux d\'inflation annuel de la zone euro - Données mensuelles de l\'indice des prix à la consommation harmonisé (IPCH)',
    'FM/M.U2.EUR.4F.BB.U2.EUR': 'Taux d\'intérêt directeurs de la BCE - Données quotidiennes sur les taux de refinancement et de dépôt',
    'BS/M.U2.N.V.A20.BS.A4': 'Agrégats monétaires M2 de la zone euro - Données mensuelles sur la masse monétaire au sens large',
    'BOP/Q.EU.I8.W0.S01.S1.V.TT': 'Balance des paiements de la zone euro - Données trimestrielles sur les transactions externes',
    'EXR/M.USD.EUR.SP00.A': 'Taux de change USD/EUR - Données quotidiennes du taux de change de référence',
    'BS/M.N.L.V.A20.BS.A4': 'Crédit aux sociétés non financières - Données mensuelles sur l\'encours de crédit',
    'CI/M.N.V.A20.BS.A4': 'Titres de dette publique - Données mensuelles sur les émissions gouvernementales',
    'LI/M.U2.N.V.A20.BS.A4': 'Liquidité du secteur bancaire - Données mensuelles sur les ratios de liquidité'
  };

  return descriptions[dataset] || `Dataset BCE pour ${query} - Données monétaires et financières officielles européennes`;
}

function getECBFallback(query: string, limit: number): any[] {
  const fallbackDatasets = [
    {
      id: 'ecb:ICP_M_U2_N_000000_4_INFL',
      title: 'ECB — Euro Area Inflation Rate',
      description: 'Taux d\'inflation annuel de la zone euro - Données mensuelles de l\'IPCH',
      url: 'https://sdw-wsrest.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.INFL'
    },
    {
      id: 'ecb:FM_M_U2_EUR_4F_BB_U2_EUR',
      title: 'ECB — Policy Interest Rates',
      description: 'Taux d\'intérêt directeurs de la BCE - Données quotidiennes',
      url: 'https://sdw-wsrest.ecb.europa.eu/service/data/FM/M.U2.EUR.4F.BB.U2.EUR'
    },
    {
      id: 'ecb:BS_M_U2_N_V_A20_BS_A4',
      title: 'ECB — Money Supply (M2)',
      description: 'Agrégats monétaires M2 de la zone euro - Données mensuelles',
      url: 'https://sdw-wsrest.ecb.europa.eu/service/data/BS/M.U2.N.V.A20.BS.A4'
    }
  ];

  return fallbackDatasets.slice(0, limit).map((dataset, index) => ({
    id: dataset.id,
    provider: 'ecb',
    type: 'dataset',
    title: dataset.title,
    abstract: dataset.description,
    url: dataset.url,
    pdfUrl: '',
    year: new Date().getFullYear(),
    publishedDate: new Date().toISOString(),
    authors: [],
    citationCount: 0,
    qualityScore: 78,
    noveltyScore: 65,
    documentType: 'monetary_dataset',
    issuer: 'European Central Bank',
    issuerType: 'government',
    classification: 'monetary_economics',
    language: 'en',
    contentFormat: 'json',
    oaStatus: 'open',
    hasFullText: true,
    raw: {
      source: 'ecb-fallback',
      query,
      fallback: true
    }
  }));
}
