/**
 * NomosX Domain Detection Utility
 * 
 * Enterprise-grade domain classification for text analysis
 * Implements multiple detection strategies for maximum accuracy
 */

import type { DomainExpertise } from './types';

// ============================================================================
// DOMAIN KEYWORD MAPPINGS
// ============================================================================

const DOMAIN_KEYWORDS: Record<DomainExpertise, string[]> = {
  economics: [
    'economics', 'economic', 'market', 'markets', 'financial', 'finance', 'monetary', 'fiscal',
    'gdp', 'inflation', 'unemployment', 'trade', 'currency', 'investment', 'recession',
    'supply', 'demand', 'price', 'pricing', 'cost', 'benefit', 'profit', 'loss', 'capital'
  ],
  technology: [
    'technology', 'tech', 'software', 'hardware', 'ai', 'artificial intelligence', 'machine learning',
    'algorithm', 'computing', 'computer', 'digital', 'data', 'programming', 'code', 'app',
    'internet', 'web', 'cloud', 'cybersecurity', 'blockchain', 'automation', 'robotics'
  ],
  policy: [
    'policy', 'policies', 'government', 'governance', 'regulation', 'regulations', 'law', 'legal',
    'legislation', 'parliament', 'congress', 'administration', 'public sector', 'bureaucracy',
    'reform', 'compliance', 'oversight', 'accountability', 'transparency', 'ethics'
  ],
  health: [
    'health', 'healthcare', 'medical', 'medicine', 'clinical', 'hospital', 'patient', 'treatment',
    'disease', 'epidemic', 'pandemic', 'vaccine', 'pharmaceutical', 'drug', 'therapy', 'diagnosis',
    'public health', 'epidemiology', 'biomedical', 'wellness', 'mental health'
  ],
  security: [
    'security', 'defense', 'military', 'intelligence', 'terrorism', 'cyber', 'cybersecurity',
    'threat', 'risk', 'protection', 'surveillance', 'espionage', 'warfare', 'conflict',
    'national security', 'homeland security', 'border', 'immigration', 'counterterrorism'
  ],
  law: [
    'law', 'legal', 'court', 'courts', 'judge', 'justice', 'constitutional', 'statute', 'regulation',
    'litigation', 'contract', 'tort', 'criminal', 'civil', 'rights', 'jurisdiction', 'precedent',
    'legal system', 'rule of law', 'enforcement', 'compliance'
  ],
  environment: [
    'environment', 'environmental', 'climate', 'climate change', 'global warming', 'carbon',
    'emissions', 'pollution', 'sustainability', 'renewable', 'energy', 'conservation',
    'ecosystem', 'biodiversity', 'green', 'eco', 'carbon footprint', 'recycling'
  ],
  quantitative: [
    'statistics', 'statistical', 'data', 'analysis', 'analytics', 'quantitative', 'mathematical',
    'model', 'modeling', 'simulation', 'probability', 'hypothesis', 'research', 'methodology',
    'sample', 'survey', 'experiment', 'measurement', 'metrics', 'evaluation', 'assessment'
  ],
  finance: [
    'finance', 'financial', 'banking', 'investment', 'investments', 'stock', 'stocks', 'bond',
    'portfolio', 'asset', 'capital', 'credit', 'debt', 'loan', 'mortgage', 'insurance',
    'risk', 'return', 'dividend', 'market', 'trading', 'wealth', 'fintech', 'cryptocurrency'
  ],
  'social-sciences': [
    'sociology', 'psychology', 'anthropology', 'social', 'society', 'culture', 'behavior',
    'demographics', 'population', 'community', 'family', 'education', 'inequality', 'poverty',
    'urban', 'rural', 'migration', 'identity', 'gender', 'race', 'class'
  ],
  humanities: [
    'history', 'historical', 'philosophy', 'philosophical', 'literature', 'literary', 'art',
    'culture', 'cultural', 'religion', 'religious', 'ethics', 'ethical', 'humanities',
    'language', 'linguistics', 'archaeology', 'music', 'theater', 'film', 'media'
  ],
  'energy-advanced': [
    'energy', 'power', 'electricity', 'nuclear', 'solar', 'wind', 'hydro', 'geothermal', 'biomass',
    'battery', 'storage', 'grid', 'infrastructure', 'renewable', 'sustainable', 'efficiency',
    'consumption', 'production', 'distribution', 'transmission', 'smart grid'
  ],
  geopolitics: [
    'geopolitics', 'geopolitical', 'international', 'foreign', 'diplomacy', 'diplomatic',
    'relations', 'global', 'world', 'nation', 'national', 'sovereignty', 'border', 'territory',
    'conflict', 'cooperation', 'treaty', 'alliance', 'sanctions', 'trade war', 'cold war'
  ],
  'digital-society': [
    'digital society', 'social media', 'online', 'internet', 'web', 'platform', 'network',
    'virtual', 'cyberspace', 'digital rights', 'privacy', 'data protection', 'surveillance',
    'censorship', 'fake news', 'misinformation', 'digital divide', 'e-democracy'
  ],
  'cognitive-science': [
    'cognitive', 'cognition', 'brain', 'neuroscience', 'psychology', 'mind', 'consciousness',
    'perception', 'memory', 'learning', 'attention', 'reasoning', 'decision making',
    'artificial intelligence', 'human-computer interaction', 'cognitive bias'
  ],
  'behavioral-economics': [
    'behavioral economics', 'behavioral', 'nudge', 'choice architecture', 'prospect theory',
    'loss aversion', 'cognitive bias', 'heuristics', 'rationality', 'irrationality',
    'decision making', 'preferences', 'incentives', 'behavioral finance'
  ],
  'urban-studies': [
    'urban', 'city', 'cities', 'urbanization', 'planning', 'development', 'infrastructure',
    'housing', 'transportation', 'public transit', 'zoning', 'gentrification', 'suburban',
    'metropolitan', 'smart city', 'sustainable development', 'urban design'
  ],
  bioethics: [
    'bioethics', 'ethics', 'medical ethics', 'genetic', 'genetics', 'biotechnology', 'cloning',
    'stem cell', 'euthanasia', 'abortion', 'reproductive rights', 'research ethics', 'clinical trials',
    'informed consent', 'human subjects', 'genetic engineering', 'synthetic biology'
  ],
  'complexity-science': [
    'complexity', 'complex systems', 'chaos', 'emergence', 'network', 'networks', 'systems',
    'dynamics', 'nonlinear', 'feedback', 'adaptation', 'self-organization', 'fractals',
    'cellular automata', 'agent-based modeling', 'system dynamics'
  ],
  'computational-social-science': [
    'computational social science', 'big data', 'social data', 'social networks', 'network analysis',
    'social computing', 'digital trace', 'online behavior', 'social media analytics', 'text mining',
    'sentiment analysis', 'predictive modeling', 'simulation', 'agent-based modeling'
  ],
  'development-economics': [
    'development', 'developing', 'poverty', 'microfinance', 'foreign aid', 'emerging markets',
    'global south', 'low income', 'middle income', 'structural transformation', 'capability',
    'institutional economics', 'human capital', 'agricultural economics', 'aid effectiveness'
  ],
  'risk-analysis': [
    'risk', 'uncertainty', 'probability', 'systemic risk', 'financial risk', 'operational risk',
    'catastrophe', 'scenario planning', 'monte carlo', 'value at risk', 'stress test', 'tail risk',
    'black swan', 'enterprise risk', 'contagion', 'cascading failure', 'resilience'
  ]
};

// ============================================================================
// DOMAIN DETECTION FUNCTIONS
// ============================================================================

export interface DomainDetectionResult {
  domain: DomainExpertise;
  confidence: number;
  evidence: string[];
  alternativeDomains: Array<{
    domain: DomainExpertise;
    confidence: number;
  }>;
}

/**
 * Detect the primary domain for a given text
 * Uses keyword matching with confidence scoring
 */
export function detectDomain(
  text: string,
  options: { minConfidence?: number; maxResults?: number } = {}
): DomainDetectionResult {
  const minConfidence = options.minConfidence || 0.1;
  const maxResults = options.maxResults || 3;
  
  const textLower = text.toLowerCase();
  const domainScores: Array<{ domain: DomainExpertise; score: number; evidence: string[] }> = [];

  // Score each domain based on keyword matches
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    const evidence: string[] = [];

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = textLower.match(regex);
      if (matches) {
        score += matches.length;
        evidence.push(...matches.slice(0, 3)); // Keep top 3 matches as evidence
      }
    }

    // Normalize score by text length
    const normalizedScore = score / (textLower.length / 1000);
    
    if (normalizedScore >= minConfidence) {
      domainScores.push({
        domain: domain as DomainExpertise,
        score: normalizedScore,
        evidence: [...new Set(evidence)] // Remove duplicates
      });
    }
  }

  // Sort by score (highest first)
  domainScores.sort((a, b) => b.score - a.score);

  if (domainScores.length === 0) {
    // Default to quantitative if no domain detected
    return {
      domain: 'quantitative',
      confidence: 0.05,
      evidence: [],
      alternativeDomains: []
    };
  }

  const primary = domainScores[0];
  const alternatives = domainScores.slice(1, maxResults).map(d => ({
    domain: d.domain,
    confidence: d.score
  }));

  return {
    domain: primary.domain,
    confidence: primary.score,
    evidence: primary.evidence,
    alternativeDomains: alternatives
  };
}

/**
 * Detect multiple domains for a text (multi-domain analysis)
 */
export function detectMultipleDomains(
  text: string,
  options: { minConfidence?: number; maxResults?: number } = {}
): DomainDetectionResult[] {
  const minConfidence = options.minConfidence || 0.1;
  const maxResults = options.maxResults || 5;
  
  const textLower = text.toLowerCase();
  const domainScores: Array<{ domain: DomainExpertise; score: number; evidence: string[] }> = [];

  // Score each domain
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    const evidence: string[] = [];

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = textLower.match(regex);
      if (matches) {
        score += matches.length;
        evidence.push(...matches.slice(0, 2));
      }
    }

    const normalizedScore = score / (textLower.length / 1000);
    
    if (normalizedScore >= minConfidence) {
      domainScores.push({
        domain: domain as DomainExpertise,
        score: normalizedScore,
        evidence: [...new Set(evidence)]
      });
    }
  }

  // Sort by score and return top results
  domainScores.sort((a, b) => b.score - a.score);
  
  return domainScores.slice(0, maxResults).map(d => ({
    domain: d.domain,
    confidence: d.score,
    evidence: d.evidence,
    alternativeDomains: []
  }));
}

/**
 * Quick domain detection (optimized for performance)
 */
export function quickDomainDetection(text: string): DomainExpertise {
  const result = detectDomain(text, { minConfidence: 0.05, maxResults: 1 });
  return result.domain;
}

/**
 * Validate if a domain string is valid
 */
export function isValidDomain(domain: string): domain is DomainExpertise {
  return domain in DOMAIN_KEYWORDS;
}

/**
 * Get all available domains
 */
export function getAllDomains(): DomainExpertise[] {
  return Object.keys(DOMAIN_KEYWORDS) as DomainExpertise[];
}

/**
 * Get keywords for a specific domain
 */
export function getDomainKeywords(domain: DomainExpertise): string[] {
  return DOMAIN_KEYWORDS[domain] || [];
}
