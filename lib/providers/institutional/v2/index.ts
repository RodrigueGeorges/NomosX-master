/**
 * INSTITUTIONAL PROVIDERS V2 - 21 PROVIDERS COMPLETS
 * Solutions créatives et RÉELLES pour chaque provider
 */

// ==========================================
// APIS OFFICIELLES (Rock-solid) ✅✅
// ==========================================
export * from '../stable/worldbank-api';
export * from '../stable/cisa-advisories';
export * from './nara-api';
export * from './uk-archives-api';
export * from './un-digital-library';

// ==========================================
// APIS TIERCES (Très fiables) ✅
// ==========================================
export {
  searchENISAViaGoogle
} from './google-cse';

export {
  searchFBIViaArchive
} from './archive-org';

export {
  searchENISAViaEUData
} from './eu-open-data';

// ==========================================
// FRANCE (data.gouv.fr + Légifrance)
// ==========================================
export {
  searchArchivesNationales
} from './france-gov';

// ==========================================
// ÉCONOMIE
// ==========================================
// ✅ IMF: SDMX (official IMF dataservices) with robust fallbacks;
export * from './imf-sdmx';
// ⚠️ Legacy fallbacks (scraping / RSS) - keep for robustness;
export * from './imf-elibrary';

// ✅ OECD: SDMX (separate domain, not behind OECD website Cloudflare)
export * from './oecd-sdmx';
// ⚠️ Legacy fallback;
export * from './oecd-ilibrary';

export * from './bis-papers';
export * from './nist-publications';

// ==========================================
// CONFIGURATION
// ==========================================

export interface InstitutionalProviderV2 {
  id: string;
  name: string;
  category: 'intelligence' | 'defense' | 'economic' | 'multilateral' | 'cyber';
  priority: number;
  method: 'api-official' | 'api-third-party' | 'scraping-smart';
  reliability: number; // 0-100
  cost: number; // $ per 1000 requests
  rateLimit: number; // ms between requests
  requiresAuth: boolean;
  authEnvVar?: string;
}

export const INSTITUTIONAL_PROVIDERS_V2: Record<string, InstitutionalProviderV2> = {
  // ✅✅ APIs Officielles (95%+)
  'worldbank': {
    id: 'worldbank',
    name: 'World Bank',
    category: 'economic',
    priority: 1,
    method: 'api-official',
    reliability: 95,
    cost: 0,
    rateLimit: 500,
    requiresAuth: false
  },
  'cisa': {
    id: 'cisa',
    name: 'CISA',
    category: 'cyber',
    priority: 1,
    method: 'api-official',
    reliability: 95,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  'nara': {
    id: 'nara',
    name: 'NARA',
    category: 'intelligence',
    priority: 1,
    method: 'api-official',
    reliability: 95,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  'uk-archives': {
    id: 'uk-archives',
    name: 'UK National Archives',
    category: 'intelligence',
    priority: 1,
    method: 'api-official',
    reliability: 95,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  'un': {
    id: 'un',
    name: 'UN Digital Library',
    category: 'multilateral',
    priority: 1,
    method: 'api-official',
    reliability: 90,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  'nist': {
    id: 'nist',
    name: 'NIST',
    category: 'cyber',
    priority: 1,
    method: 'api-official',
    reliability: 95,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  
  // ✅ APIs Tierces (80-94%)
  'odni': {
    id: 'odni',
    name: 'ODNI',
    category: 'intelligence',
    priority: 2,
    method: 'api-third-party',
    reliability: 90,
    cost: 0.005, // Google CSE pricing
    rateLimit: 1000,
    requiresAuth: true,
    authEnvVar: 'GOOGLE_CSE_KEY'
  },
  'nato': {
    id: 'nato',
    name: 'NATO',
    category: 'defense',
    priority: 2,
    method: 'api-third-party',
    reliability: 85,
    cost: 0.005,
    rateLimit: 1000,
    requiresAuth: true,
    authEnvVar: 'GOOGLE_CSE_KEY'
  },
  'nsa': {
    id: 'nsa',
    name: 'NSA',
    category: 'intelligence',
    priority: 2,
    method: 'api-third-party',
    reliability: 70,
    cost: 0.005,
    rateLimit: 1000,
    requiresAuth: true,
    authEnvVar: 'GOOGLE_CSE_KEY'
  },
  'cia-foia': {
    id: 'cia-foia',
    name: 'CIA FOIA',
    category: 'intelligence',
    priority: 2,
    method: 'api-third-party',
    reliability: 85,
    cost: 0,
    rateLimit: 2000,
    requiresAuth: false
  },
  'eeas': {
    id: 'eeas',
    name: 'EEAS',
    category: 'defense',
    priority: 2,
    method: 'api-third-party',
    reliability: 85,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  'eda': {
    id: 'eda',
    name: 'EDA',
    category: 'defense',
    priority: 2,
    method: 'api-third-party',
    reliability: 70,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  'enisa': {
    id: 'enisa',
    name: 'ENISA',
    category: 'cyber',
    priority: 2,
    method: 'api-third-party',
    reliability: 80,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  'undp': {
    id: 'undp',
    name: 'UNDP',
    category: 'multilateral',
    priority: 2,
    method: 'api-official',
    reliability: 90,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  'unctad': {
    id: 'unctad',
    name: 'UNCTAD',
    category: 'multilateral',
    priority: 2,
    method: 'api-official',
    reliability: 90,
    cost: 0,
    rateLimit: 1000,
    requiresAuth: false
  },
  
  // ⚠️ Scraping intelligent (65-85%)
  'imf': {
    id: 'imf',
    name: 'IMF',
    category: 'economic',
    priority: 3,
    method: 'scraping-smart',
    reliability: 85,
    cost: 0,
    rateLimit: 2000,
    requiresAuth: false
  },
  'oecd': {
    id: 'oecd',
    name: 'OECD',
    category: 'economic',
    priority: 3,
    method: 'scraping-smart',
    reliability: 85,
    cost: 0,
    rateLimit: 2000,
    requiresAuth: false
  },
  'bis': {
    id: 'bis',
    name: 'BIS',
    category: 'economic',
    priority: 3,
    method: 'scraping-smart',
    reliability: 90,
    cost: 0,
    rateLimit: 2000,
    requiresAuth: false
  },
  'ministere-armees': {
    id: 'ministere-armees',
    name: 'Ministère des Armées',
    category: 'defense',
    priority: 3,
    method: 'scraping-smart',
    reliability: 75,
    cost: 0,
    rateLimit: 2000,
    requiresAuth: false
  },
  'sgdsn': {
    id: 'sgdsn',
    name: 'SGDSN',
    category: 'intelligence',
    priority: 3,
    method: 'scraping-smart',
    reliability: 70,
    cost: 0,
    rateLimit: 2000,
    requiresAuth: false
  },
  'archives-fr': {
    id: 'archives-fr',
    name: 'Archives Nationales',
    category: 'intelligence',
    priority: 3,
    method: 'scraping-smart',
    reliability: 75,
    cost: 0,
    rateLimit: 2000,
    requiresAuth: false
  },
  'uk-jic': {
    id: 'uk-jic',
    name: 'UK JIC',
    category: 'intelligence',
    priority: 3,
    method: 'scraping-smart',
    reliability: 70,
    cost: 0,
    rateLimit: 2000,
    requiresAuth: false
  }
};

/**
 * Get provider config
 */
export function getProviderConfig(providerId: string): InstitutionalProviderV2 | undefined {
  return INSTITUTIONAL_PROVIDERS_V2[providerId];
}

/**
 * Get all providers by category
 */
export function getProvidersByCategory(category: string): InstitutionalProviderV2[] {
  return Object.values(INSTITUTIONAL_PROVIDERS_V2)
    .filter(p => p.category === category)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Get providers by reliability threshold
 */
export function getReliableProviders(minReliability = 80): InstitutionalProviderV2[] {
  return Object.values(INSTITUTIONAL_PROVIDERS_V2)
    .filter(p => p.reliability >= minReliability)
    .sort((a, b) => b.reliability - a.reliability);
}

/**
 * Estimate cost for N requests across providers
 */
export function estimateCost(providers: string[], requestsPerProvider = 100): number {
  return providers.reduce((total, id) => {
    const config = INSTITUTIONAL_PROVIDERS_V2[id];
    return total + (config ? config.cost * requestsPerProvider / 1000 : 0);
  }, 0);
}

/**
 * Check which providers require auth
 */
export function checkAuthRequirements(): { provider: string; envVar: string }[] {
  return Object.values(INSTITUTIONAL_PROVIDERS_V2)
    .filter(p => p.requiresAuth)
    .map(p => ({ provider: p.id, envVar: p.authEnvVar! }));
}

// TODO: Implement searchNIST when available
// export { searchNIST }
