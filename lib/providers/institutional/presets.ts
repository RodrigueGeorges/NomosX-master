/**
 * Presets intelligents pour providers institutionnels
 * Recommandations automatiques selon le type de question
 */

import type {Providers} from '@/lib/agent/pipeline-v2';

export interface ProviderPreset {
  name: string;
  description: string;
  providers: Providers;
  academicRatio: number; // 0-1, ratio académique vs institutionnel
  useCase: string;
}

/**
 * Détecte automatiquement le meilleur preset selon la question
 */
export function detectPreset(question: string): ProviderPreset {
  const q = question.toLowerCase();
  
  // GÉOPOLITIQUE & SÉCURITÉ NATIONALE
  if (
    q.match(/threat|security|warfare|military|defense|geopolit|strategic|intelligence|spy|espionage/i)
  ) {
    return PRESETS.geopolitics;
  }
  
  // CYBERSÉCURITÉ
  if (
    q.match(/cyber|hack|ransomware|vulnerabilit|malware|breach|infrastructure|critical|attack/i)
  ) {
    return PRESETS.cybersecurity;
  }
  
  // ÉCONOMIE & FINANCE
  if (
    q.match(/econom|inflation|gdp|debt|fiscal|monetary|finance|bank|imf|world bank|trade/i)
  ) {
    return PRESETS.economics;
  }
  
  // POLITIQUE PUBLIQUE
  if (
    q.match(/policy|regulation|law|governance|government|public|reform|legislation/i)
  ) {
    return PRESETS.publicPolicy;
  }
  
  // CLIMAT & ENVIRONNEMENT
  if (
    q.match(/climate|environment|carbon|emission|renewable|energy|sustainability|green/i)
  ) {
    return PRESETS.climate;
  }
  
  // TECH & INNOVATION
  if (
    q.match(/artificial intelligence|ai|technology|innovation|digital|tech|software|algorithm/i)
  ) {
    return PRESETS.technology;
  }

  // DISRUPTIF / FRONTIER POLICY
  if (
    q.match(/disrupt|frontier|ai safety|alignment|governance ai|compute policy|frontier model/i)
  ) {
    return PRESETS.disruptive;
  }
  
  // HISTORIQUE / DÉCLASSIFIÉ
  if (
    q.match(/histor|cold war|declassified|archive|past|former|previous|19\d{2}|20[01]\d/i)
  ) {
    return PRESETS.historical;
  }
  
  // DEFAULT: Mix équilibré
  return PRESETS.balanced;
}

/**
 * Presets prédéfinis
 */
export const PRESETS: Record<string, ProviderPreset> = {
  // GÉOPOLITIQUE & SÉCURITÉ
  geopolitics: {
    name: 'Géopolitique & Sécurité',
    description: 'Intelligence, défense, stratégie militaire',
    providers: [
      // Intelligence (priorité)
      'odni', 'uk-jic', 'nsa',
      // Défense
      'nato', 'eeas', 'sgdsn',
      // Académique (contexte)
      'openalex', 'semanticscholar'
    ],
    academicRatio: 0.25,
    useCase: 'Threat assessments, stratégie militaire, relations internationales'
  },
  
  // CYBERSÉCURITÉ
  cybersecurity: {
    name: 'Cybersécurité',
    description: 'Vulnérabilités, menaces, standards',
    providers: [
      // Cyber (priorité)
      'cisa', 'enisa', 'nist',
      // Intelligence
      'nsa', 'odni',
      // Académique
      'openalex', 'semanticscholar', 'arxiv'
    ],
    academicRatio: 0.3,
    useCase: 'Alertes cyber, vulnérabilités critiques, standards techniques'
  },
  
  // ÉCONOMIE & FINANCE
  economics: {
    name: 'Économie & Finance',
    description: 'Politique monétaire, commerce, développement',
    providers: [
      // Économique (priorité)
      'imf', 'worldbank', 'oecd', 'bis',
      // Multilatéral
      'unctad',
      // Académique
      'openalex', 'crossref'
    ],
    academicRatio: 0.3,
    useCase: 'Politique économique, données macroéconomiques, développement'
  },
  
  // POLITIQUE PUBLIQUE
  publicPolicy: {
    name: 'Politique Publique',
    description: 'Régulation, gouvernance, réformes',
    providers: [
      // Multilatéral
      'oecd', 'un', 'undp',
      // Économique
      'imf', 'worldbank',
      // Académique
      'openalex', 'semanticscholar'
    ],
    academicRatio: 0.4,
    useCase: 'Policy making, régulation, réformes structurelles'
  },
  
  // CLIMAT & ENVIRONNEMENT
  climate: {
    name: 'Climat & Environnement',
    description: 'Changement climatique, énergie, durabilité',
    providers: [
      // Multilatéral
      'un', 'undp', 'worldbank',
      // Économique
      'imf', 'oecd',
      // Académique (important pour climat)
      'openalex', 'semanticscholar', 'crossref'
    ],
    academicRatio: 0.5,
    useCase: 'Politique climatique, transition énergétique, développement durable'
  },
  
  // TECHNOLOGIE & INNOVATION
  technology: {
    name: 'Technologie & IA',
    description: 'Innovation, digital, algorithmes',
    providers: [
      // Cyber/Standards
      'nist', 'enisa',
      // Intelligence (pour IA & sécurité)
      'odni',
      // Académique (crucial pour tech)
      'openalex', 'semanticscholar', 'arxiv'
    ],
    academicRatio: 0.6,
    useCase: 'IA, cybersécurité, innovation technologique'
  },

  // DISRUPTIF / FRONTIER POLICY
  disruptive: {
    name: 'Disruptif & Frontier Policy',
    description: 'Think tanks innovants, gouvernance IA avancée',
    providers: [
      // Think tanks innovants
      'lawzero', 'govai', 'iaps', 'caip', 'aipi',
      'cset', 'ainow', 'datasociety', 'abundance', 'caidp',
      'scsp', 'ifp', 'cdt', 'brookings', 'fai',
      'cnas', 'rand', 'newamerica', 'aspen-digital', 'rstreet',
      // Académique (ancrage scientifique)
      'openalex', 'semanticscholar', 'arxiv'
    ],
    academicRatio: 0.4,
    useCase: 'AI safety, compute governance, policy innovation'
  },
  
  // HISTORIQUE
  historical: {
    name: 'Historique & Archives',
    description: 'Documents déclassifiés, contexte historique',
    providers: [
      // Archives (priorité)
      'cia-foia', 'nara', 'uk-archives', 'archives-fr',
      // Académique
      'openalex', 'hal'
    ],
    academicRatio: 0.3,
    useCase: 'Recherche historique, documents déclassifiés, analyse rétrospective'
  },
  
  // ÉQUILIBRÉ (default)
  balanced: {
    name: 'Équilibré',
    description: 'Mix institutionnel + académique',
    providers: [
      // Intelligence
      'odni',
      // Défense
      'nato',
      // Économique
      'imf', 'oecd',
      // Cyber
      'cisa',
      // Académique
      'openalex', 'semanticscholar', 'crossref'
    ],
    academicRatio: 0.5,
    useCase: 'Questions générales, vue d\'ensemble'
  },
  
  // FRANCE-SPÉCIFIQUE
  france: {
    name: 'France',
    description: 'Sources françaises prioritaires',
    providers: [
      // France
      'sgdsn', 'archives-fr',
      // EU
      'eeas', 'enisa',
      // International
      'nato', 'oecd',
      // Académique français
      'hal', 'thesesfr', 'openalex'
    ],
    academicRatio: 0.4,
    useCase: 'Politique française, doctrine militaire FR, contexte européen'
  }
};

/**
 * Recommande les meilleurs providers pour une question
 */
export function recommendProviders(question: string): {
  preset: ProviderPreset;
  rationale: string;
} {
  const preset = detectPreset(question);
  
  let rationale = `Preset "${preset.name}" recommandé car la question concerne ${preset.description.toLowerCase()}. `;
  rationale += `Mix : ${Math.round((1 - preset.academicRatio) * 100)}% institutionnel, ${Math.round(preset.academicRatio * 100)}% académique. `;
  rationale += `Use case : ${preset.useCase}.`;
  
  return { preset, rationale };
}

/**
 * Exemples pour documentation
 */
export const PRESET_EXAMPLES = {
  geopolitics: [
    "What are Russia's strategic objectives in Ukraine?",
    "How does NATO assess hybrid warfare threats?",
    "What is China's military modernization strategy?"
  ],
  cybersecurity: [
    "What are the most critical vulnerabilities in critical infrastructure?",
    "How does ENISA assess ransomware threats in EU?",
    "What are NIST recommendations for post-quantum cryptography?"
  ],
  economics: [
    "What is IMF's outlook on global inflation in 2026?",
    "How sustainable is US public debt?",
    "What are the economic impacts of carbon taxes?"
  ],
  publicPolicy: [
    "Should the EU implement a carbon border adjustment mechanism?",
    "How effective are wealth taxes in reducing inequality?",
    "What are OECD recommendations for pension reform?"
  ],
  climate: [
    "What is the most cost-effective path to net-zero by 2050?",
    "How can developing countries finance climate adaptation?",
    "What are the economic impacts of renewable energy transition?"
  ],
  technology: [
    "What are the main AI safety challenges?",
    "How should governments regulate large language models?",
    "What are the cybersecurity implications of quantum computing?"
  ],
  disruptive: [
    "What are the governance options for frontier AI models?",
    "How should compute access be regulated for advanced AI?",
    "What policy levers reduce catastrophic AI risks?"
  ],
  historical: [
    "What did US intelligence know about Soviet nuclear program in 1980s?",
    "How did NATO respond to the fall of the Berlin Wall?",
    "What were CIA assessments of Iraqi WMD capabilities in 2002?"
  ],
  france: [
    "Quelle est la stratégie de défense française face aux menaces hybrides?",
    "Comment la France se positionne sur l'autonomie stratégique européenne?",
    "Quels sont les risques cyber identifiés par le SGDSN?"
  ]
};
