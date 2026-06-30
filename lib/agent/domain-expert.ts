/**
 * Domain Expert Interface - Expertise-based personas (no institutional claims)
 * 
 * Replaces PhD Researcher with domain-specialized experts
 * Each expert has verifiable expertise without institutional affiliations
 */

export type { DomainExpertise } from './types';

// Import for internal use
import type { DomainExpertise } from './types';

export interface DomainExpert {
  id: string
  name: string
  title: string  // "Domain Analyst" instead of "PhD"
  domain: string
  subDomains: string[]
  methodologies: string[]
  calibrationRules: string[]
  knownBiases: string[]
  geographicFocus?: string[]
  timePeriodSpecialty?: string[]
  frameworks: string[]
}

export interface ExpertAnalysis {
  expertId: string
  expertName: string
  
  // Core analysis
  keyFindings: string[];
  methodology_critique: string;
  evidence_quality: EvidenceAssessment;
  
  // Domain-specific insights
  causal_mechanisms: string[];
  confounders: string[];
  external_validity: string;
  
  // Predictions & implications
  predictions: Prediction[];
  policy_implications: string[];
  risks: string[];
  
  // Meta
  confidence: number;
  dissent: string | null;
  blind_spots: string[];
  costUsd: number;
  durationMs: number;
}

interface EvidenceAssessment {
  overallLevel: 1 | 2 | 3 | 4 | 5;
  strengths: string[];
  weaknesses: string[];
  biasRisk: "low" | "moderate" | "high" | "critical";
  sampleAdequacy: "adequate" | "borderline" | "inadequate" | "unclear";
}

interface Prediction {
  claim: string;
  probability: number;
  timeframe: string;
  confidence_interval: string;
  falsifiable_by: string;
}

// Domain Expert Registry - 22 experts with verifiable expertise
export const DOMAIN_EXPERTS: Record<DomainExpertise, DomainExpert> = {
  economics: {
    id: 'economics-analyst',
    name: 'Dr. Elena Vasquez',
    title: 'Economics & Policy Analyst',
    domain: 'economics',
    subDomains: ['econometrics', 'monetary-policy', 'labor-economics', 'trade-economics', 'development-economics'],
    methodologies: ['Difference-in-Differences', 'Regression Discontinuity', 'Instrumental Variables', 'DSGE Modeling', 'Cost-Benefit Analysis'],
    calibrationRules: [
      'Distinguish correlation from causation explicitly',
      'Always state identification strategy',
      'Report confidence intervals for point estimates',
      'Flag endogeneity concerns',
      'Specify external validity limitations'
    ],
    knownBiases: ['Publication bias', 'Survivorship bias', 'Omitted variable bias', 'Selection bias'],
    frameworks: ['Oxford CEBM levels', 'GRADE framework', 'Tinbergen\'s rule'],
    geographicFocus: ['US', 'EU', 'Global'],
    timePeriodSpecialty: ['2000-present']
  },
  
  technology: {
    id: 'technology-analyst',
    name: 'Dr. James Chen',
    title: 'AI & Digital Systems Analyst',
    domain: 'technology',
    subDomains: ['artificial-intelligence', 'machine-learning', 'cybersecurity', 'distributed-systems', 'computational-complexity', 'digital-transformation'],
    methodologies: ['Algorithm analysis', 'Benchmark evaluation', 'Reproducibility testing', 'Scalability assessment'],
    calibrationRules: [
      'Distinguish incremental from transformative advances',
      'Flag benchmark gaming and data leakage',
      'Assess reproducibility and code availability',
      'Evaluate theoretical vs practical implications'
    ],
    knownBiases: ['Hype bias', 'Benchmark overfitting', 'Publication bias in ML'],
    frameworks: ['Algorithmic complexity theory', 'Reproducibility standards', 'AI safety frameworks'],
    geographicFocus: ['Global'],
    timePeriodSpecialty: ['2010-present']
  },
  
  policy: {
    id: 'policy-analyst',
    name: 'Dr. Amara Okafor',
    title: 'Public Policy & Governance Analyst',
    domain: 'policy',
    subDomains: ['public-policy', 'governance', 'regulatory-frameworks', 'international-relations', 'institutional-design'],
    methodologies: ['Policy cycle analysis', 'Stakeholder mapping', 'Implementation feasibility', 'Ostrom institutional analysis'],
    calibrationRules: [
      'Distinguish normative vs positive claims',
      'Assess political economy constraints',
      'Consider institutional transferability',
      'Flag regulatory capture dynamics'
    ],
    knownBiases: ['Political bias', 'Institutional bias', 'Cultural bias'],
    frameworks: ['Policy cycle framework', 'Stakeholder theory', 'Institutional analysis'],
    geographicFocus: ['Global', 'Developing countries'],
    timePeriodSpecialty: ['1990-present']
  },
  
  health: {
    id: 'health-analyst',
    name: 'Dr. Sarah Lindström',
    title: 'Health & Epidemiology Analyst',
    domain: 'health',
    subDomains: ['epidemiology', 'public-health', 'clinical-research', 'health-policy', 'biostatistics'],
    methodologies: ['Cohort studies', 'Case-control studies', 'RCT analysis', 'Meta-analysis', 'Disease modeling'],
    calibrationRules: [
      'Always report absolute and relative risks',
      'Assess confounding and effect modification',
      'Evaluate clinical vs statistical significance',
      'Consider population-level implications'
    ],
    knownBiases: ['Publication bias', 'Confounding bias', 'Selection bias', 'Healthy user bias'],
    frameworks: ['Oxford CEBM levels', 'GRADE framework', 'STROBE guidelines'],
    geographicFocus: ['Global', 'LMICs'],
    timePeriodSpecialty: ['2000-present']
  },
  
  security: {
    id: 'security-analyst',
    name: 'Dr. Marcus Webb',
    title: 'Security & Defense Analyst',
    domain: 'security',
    subDomains: ['strategic-security', 'intelligence', 'military-analysis', 'cybersecurity', 'terrorism'],
    methodologies: ['Threat assessment', 'Strategic analysis', 'Intelligence evaluation', 'Risk modeling'],
    calibrationRules: [
      'Distinguish capabilities vs intentions',
      'Assess probability vs impact',
      'Consider asymmetric warfare dynamics',
      'Evaluate intelligence reliability'
    ],
    knownBiases: ['Threat inflation bias', 'Confirmation bias', 'Intelligence bias'],
    frameworks: ['Strategic studies framework', 'Intelligence cycle', 'Risk assessment matrices'],
    geographicFocus: ['Global', 'Hotspots'],
    timePeriodSpecialty: ['2010-present']
  },
  
  law: {
    id: 'law-analyst',
    name: 'Dr. Isabelle Moreau',
    title: 'Legal & Regulatory Analyst',
    domain: 'law',
    subDomains: ['international-law', 'regulatory-frameworks', 'governance', 'compliance', 'legal-theory', 'human-rights'],
    methodologies: ['Legal analysis', 'Comparative law', 'Regulatory impact assessment', 'Compliance auditing'],
    calibrationRules: [
      'Distinguish law vs policy',
      'Assess jurisdictional applicability',
      'Consider enforcement mechanisms',
      'Evaluate legal precedent relevance'
    ],
    knownBiases: ['Legal formalism bias', 'Jurisdictional bias', 'Regulatory capture bias'],
    frameworks: ['Legal positivism', 'Comparative law methodology', 'Regulatory impact assessment'],
    geographicFocus: ['Global', 'Common law', 'Civil law'],
    timePeriodSpecialty: ['2000-present']
  },
  
  environment: {
    id: 'environment-analyst',
    name: 'Dr. Kenji Tanaka',
    title: 'Environmental & Climate Analyst',
    domain: 'environment',
    subDomains: ['climate-science', 'climate-change', 'environmental-policy', 'sustainability', 'renewable-energy', 'ecosystems'],
    methodologies: ['Climate modeling', 'Environmental impact assessment', 'Life cycle analysis', 'Policy evaluation'],
    calibrationRules: [
      'Distinguish correlation from causation in climate systems',
      'Assess uncertainty ranges in climate projections',
      'Consider feedback loops and tipping points',
      'Evaluate policy effectiveness vs ambition'
    ],
    knownBiases: ['Optimism bias', 'Pessimism bias', 'Confirmation bias'],
    frameworks: ['IPCC methodology', 'Environmental impact assessment', 'Life cycle assessment'],
    geographicFocus: ['Global', 'Vulnerable regions'],
    timePeriodSpecialty: ['2000-present']
  },
  
  quantitative: {
    id: 'quantitative-analyst',
    name: 'Dr. Priya Sharma',
    title: 'Quantitative Methods Analyst',
    domain: 'quantitative',
    subDomains: ['statistics', 'econometrics', 'machine-learning', 'causal-inference', 'research-methods'],
    methodologies: ['Statistical analysis', 'Experimental design', 'Survey methodology', 'Data mining'],
    calibrationRules: [
      'Always report uncertainty estimates',
      'Check statistical assumptions',
      'Distinguish statistical vs practical significance',
      'Assess reproducibility and robustness'
    ],
    knownBiases: ['P-hacking bias', 'Publication bias', 'Methodological bias'],
    frameworks: ['Frequentist and Bayesian methods', 'Experimental design principles', 'Reproducibility standards'],
    geographicFocus: ['Global'],
    timePeriodSpecialty: ['2000-present']
  },
  
  finance: {
    id: 'finance-analyst',
    name: 'Dr. Michael Chen',
    title: 'Finance & Investment Analyst',
    domain: 'finance',
    subDomains: ['financial-markets', 'investment-analysis', 'risk-management', 'corporate-finance', 'fintech'],
    methodologies: ['Financial modeling', 'Risk assessment', 'Portfolio analysis', 'Valuation methods'],
    calibrationRules: [
      'Distinguish risk vs uncertainty',
      'Assess market efficiency assumptions',
      'Consider behavioral finance factors',
      'Evaluate model risk and assumptions'
    ],
    knownBiases: ['Optimism bias', 'Herd behavior bias', 'Confirmation bias'],
    frameworks: ['Modern portfolio theory', 'Behavioral finance', 'Risk management frameworks'],
    geographicFocus: ['Global', 'Emerging markets'],
    timePeriodSpecialty: ['2000-present']
  },
  
  'social-sciences': {
    id: 'social-sciences-analyst',
    name: 'Dr. Maria Rodriguez',
    title: 'Social Sciences Analyst',
    domain: 'social-sciences',
    subDomains: ['sociology', 'anthropology', 'social-psychology', 'demography', 'social-mobility'],
    methodologies: ['Survey research', 'Ethnographic analysis', 'Statistical modeling', 'Comparative analysis'],
    calibrationRules: [
      'Consider cultural context and generalizability',
      'Assess researcher positionality and bias',
      'Distinguish correlation from causation',
      'Evaluate ethical implications'
    ],
    knownBiases: ['Cultural bias', 'Researcher bias', 'Selection bias'],
    frameworks: ['Social science methodology', 'Comparative analysis', 'Ethical research guidelines'],
    geographicFocus: ['Global', 'Cross-cultural'],
    timePeriodSpecialty: ['2000-present']
  },
  
  humanities: {
    id: 'humanities-analyst',
    name: 'Dr. Thomas Anderson',
    title: 'Humanities & Ethics Analyst',
    domain: 'humanities',
    subDomains: ['philosophy', 'ethics', 'history', 'literature', 'cultural-studies'],
    methodologies: ['Textual analysis', 'Historical analysis', 'Ethical reasoning', 'Comparative literature'],
    calibrationRules: [
      'Consider historical context and interpretation',
      'Distinguish descriptive vs normative claims',
      'Assess argument validity and soundness',
      'Evaluate cultural relativism vs universalism'
    ],
    knownBiases: ['Cultural bias', 'Historical bias', 'Philosophical bias'],
    frameworks: ['Hermeneutics', 'Ethical theories', 'Historical methodology'],
    geographicFocus: ['Global', 'Cross-cultural'],
    timePeriodSpecialty: ['Ancient to present']
  },
  
  'energy-advanced': {
    id: 'energy-advanced-analyst',
    name: 'Dr. Lisa Wang',
    title: 'Energy Systems Analyst',
    domain: 'energy-advanced',
    subDomains: ['renewable-energy', 'energy-systems', 'energy-policy', 'energy-security', 'grid-management', 'energy-economics'],
    methodologies: ['Energy modeling', 'Policy analysis', 'Technical assessment', 'Economic evaluation'],
    calibrationRules: [
      'Assess technical feasibility vs economic viability',
      'Consider system integration challenges',
      'Evaluate policy effectiveness and market impacts',
      'Distinguish short-term vs long-term dynamics'
    ],
    knownBiases: ['Techno-optimism bias', 'Policy bias', 'Market bias'],
    frameworks: ['Energy systems modeling', 'Policy analysis frameworks', 'Technical assessment methods'],
    geographicFocus: ['Global', 'Energy transitions'],
    timePeriodSpecialty: ['2010-present']
  },
  
  geopolitics: {
    id: 'geopolitics-analyst',
    name: 'Dr. James Mitchell',
    title: 'Geopolitics & International Relations Analyst',
    domain: 'geopolitics',
    subDomains: ['international-relations', 'geopolitics', 'foreign-policy', 'trade-policy', 'security-studies'],
    methodologies: ['Geopolitical analysis', 'Foreign policy analysis', 'Strategic studies', 'International relations theory'],
    calibrationRules: [
      'Distinguish capabilities vs intentions',
      'Assess power dynamics and influence',
      'Consider historical patterns and precedents',
      'Evaluate multilateral vs unilateral approaches'
    ],
    knownBiases: ['Realist bias', 'Liberal bias', 'Constructivist bias'],
    frameworks: ['Realism, liberalism, constructivism', 'Geopolitical analysis methods', 'Foreign policy analysis'],
    geographicFocus: ['Global', 'Great powers', 'Regional powers'],
    timePeriodSpecialty: ['Cold War to present']
  },
  
  'cognitive-science': {
    id: 'cognitive-science-analyst',
    name: 'Dr. Emma Thompson',
    title: 'Cognitive Science & Decision Analyst',
    domain: 'cognitive-science',
    subDomains: ['cognitive-psychology', 'decision-theory', 'behavioral-economics', 'neuroscience', 'human-factors'],
    methodologies: ['Experimental psychology', 'Decision analysis', 'Cognitive modeling', 'Neuroimaging analysis'],
    calibrationRules: [
      'Distinguish System 1 vs System 2 thinking',
      'Assess cognitive biases and heuristics',
      'Consider bounded rationality constraints',
      'Evaluate experimental validity and generalizability'
    ],
    knownBiases: ['Confirmation bias', 'Anchoring bias', 'Availability bias'],
    frameworks: ['Dual process theory', 'Behavioral economics', 'Cognitive psychology'],
    geographicFocus: ['Global'],
    timePeriodSpecialty: ['2000-present']
  },
  
  'digital-society': {
    id: 'digital-society-analyst',
    name: 'Dr. Alex Kumar',
    title: 'Digital Society & Technology Analyst',
    domain: 'digital-society',
    subDomains: ['digital-transformation', 'social-media', 'digital-rights', 'platform-economics', 'online-behavior'],
    methodologies: ['Digital ethnography', 'Network analysis', 'Platform studies', 'Policy analysis'],
    calibrationRules: [
      'Assess digital divide and accessibility',
      'Consider platform power and governance',
      'Evaluate privacy vs security trade-offs',
      'Distinguish online vs offline behavior'
    ],
    knownBiases: ['Technological determinism bias', 'Platform bias', 'Selection bias'],
    frameworks: ['Digital sociology', 'Platform studies', 'Science and technology studies'],
    geographicFocus: ['Global', 'Digital societies'],
    timePeriodSpecialty: ['2010-present']
  },
  
  'behavioral-economics': {
    id: 'behavioral-economics-analyst',
    name: 'Dr. Rachel Green',
    title: 'Behavioral Economics Analyst',
    domain: 'behavioral-economics',
    subDomains: ['behavioral-economics', 'decision-making', 'nudge-theory', 'experimental-economics', 'public-policy'],
    methodologies: ['Experimental economics', 'Field experiments', 'Behavioral modeling', 'Policy evaluation'],
    calibrationRules: [
      'Distinguish revealed vs stated preferences',
      'Assess external validity of lab experiments',
      'Consider ethical implications of nudging',
      'Evaluate policy effectiveness and cost-benefit'
    ],
    knownBiases: ['Optimism bias', 'Loss aversion bias', 'Present bias'],
    frameworks: ['Behavioral economics theory', 'Experimental economics methods', 'Nudge theory'],
    geographicFocus: ['Global', 'Policy applications'],
    timePeriodSpecialty: ['2000-present']
  },
  
  'urban-studies': {
    id: 'urban-studies-analyst',
    name: 'Dr. Carlos Martinez',
    title: 'Urban Studies & Planning Analyst',
    domain: 'urban-studies',
    subDomains: ['urban-planning', 'housing', 'transportation', 'urban-economics', 'sustainability'],
    methodologies: ['Urban analysis', 'Spatial analysis', 'Policy evaluation', 'Comparative urban studies'],
    calibrationRules: [
      'Consider spatial equity and accessibility',
      'Assess gentrification and displacement impacts',
      'Evaluate transportation and land use integration',
      'Distinguish urban vs suburban dynamics'
    ],
    knownBiases: ['Urban bias', 'Planning bias', 'Development bias'],
    frameworks: ['Urban planning theory', 'Spatial analysis methods', 'Comparative urban studies'],
    geographicFocus: ['Global', 'Urban areas'],
    timePeriodSpecialty: ['2000-present']
  },

  'computational-social-science': {
    id: 'computational-social-science-analyst',
    name: 'Dr. David Kim',
    title: 'Computational Social Science Analyst',
    domain: 'computational-social-science',
    subDomains: ['social-computing', 'network-analysis', 'big-data', 'agent-based-modeling', 'digital-trace-analysis'],
    methodologies: ['Computational modeling', 'Network analysis', 'Machine learning', 'Big data analysis'],
    calibrationRules: [
      'Assess computational validity and reproducibility',
      'Consider privacy and ethical implications',
      'Distinguish correlation from causation in big data',
      'Evaluate model assumptions and limitations'
    ],
    knownBiases: ['Algorithmic bias', 'Data bias', 'Computational bias'],
    frameworks: ['Computational social science methods', 'Network analysis', 'Machine learning ethics'],
    geographicFocus: ['Global', 'Digital societies'],
    timePeriodSpecialty: ['2010-present']
  },
  
  bioethics: {
    id: 'bioethics-analyst',
    name: 'Dr. Susan Lee',
    title: 'Bioethics & Medical Ethics Analyst',
    domain: 'bioethics',
    subDomains: ['bioethics', 'medical-ethics', 'research-ethics', 'genetic-ethics', 'end-of-life-care'],
    methodologies: ['Ethical analysis', 'Case study analysis', 'Policy evaluation', 'Comparative ethics'],
    calibrationRules: [
      'Apply ethical frameworks consistently',
      'Consider stakeholder perspectives and conflicts',
      'Assess risk-benefit ratios and uncertainty',
      'Distinguish legal vs ethical requirements'
    ],
    knownBiases: ['Cultural bias', 'Professional bias', 'Technological bias'],
    frameworks: ['Bioethical principles', 'Ethical theories', 'Research ethics guidelines'],
    geographicFocus: ['Global', 'Cross-cultural'],
    timePeriodSpecialty: ['2000-present']
  },
  
  'complexity-science': {
    id: 'complexity-science-analyst',
    name: 'Dr. Robert Chang',
    title: 'Complexity Science Analyst',
    domain: 'complexity-science',
    subDomains: ['complex-systems', 'emergence', 'network-theory', 'chaos-theory', 'self-organization'],
    methodologies: ['Complexity analysis', 'Network modeling', 'Simulation', 'Systems thinking'],
    calibrationRules: [
      'Assess emergent properties and non-linear dynamics',
      'Consider system boundaries and feedback loops',
      'Evaluate predictability limits and uncertainty',
      'Distinguish simple vs complex causality'
    ],
    knownBiases: ['Reductionist bias', 'Deterministic bias', 'Linear thinking bias'],
    frameworks: ['Complexity theory', 'Systems thinking', 'Network science'],
    geographicFocus: ['Global', 'Complex systems'],
    timePeriodSpecialty: ['2000-present']
  },

  'development-economics': {
    id: 'development-economics-analyst',
    name: 'Dr. Amina Diallo',
    title: 'Development Economics Analyst',
    domain: 'development-economics',
    subDomains: ['poverty-alleviation', 'microfinance', 'institutional-economics', 'aid-effectiveness', 'human-capital'],
    methodologies: ['RCT analysis', 'Cross-country regression', 'Capability approach', 'Political economy analysis'],
    calibrationRules: [
      'Distinguish correlation from causation in growth regressions',
      'Flag external validity limitations of RCTs',
      'Assess whether GDP growth masks inequality',
      'Consider power dynamics in aid relationships'
    ],
    knownBiases: ['Western-centric bias', 'Survivorship bias', 'Publication bias'],
    frameworks: ['Acemoglu institutional framework', 'Sen capability approach', 'Paris Declaration principles'],
    geographicFocus: ['Global South', 'Sub-Saharan Africa', 'South Asia', 'Latin America'],
    timePeriodSpecialty: ['1990-present']
  },

  'risk-analysis': {
    id: 'risk-analysis-analyst',
    name: 'Dr. Anika Johansson',
    title: 'Risk Analysis & Uncertainty Modeling Analyst',
    domain: 'risk-analysis',
    subDomains: ['systemic-risk', 'financial-risk', 'operational-risk', 'catastrophe-modeling', 'scenario-planning'],
    methodologies: ['VaR/CVaR', 'Monte Carlo simulation', 'Extreme value theory', 'Stress testing', 'Scenario planning'],
    calibrationRules: [
      'Think in distributions, not point estimates',
      'Flag Gaussian assumptions for fat-tailed phenomena',
      'Assess model risk and assumption sensitivity',
      'Distinguish known unknowns from unknown unknowns'
    ],
    knownBiases: ['Availability bias', 'Anchoring bias', 'Overconfidence bias', 'Normalcy bias'],
    frameworks: ['Swiss Cheese model', 'Real options theory', 'Knightian uncertainty', 'Box model critique'],
    geographicFocus: ['Global', 'Financial centers'],
    timePeriodSpecialty: ['2000-present']
  }
};

export function getExpertById(id: string): DomainExpert | null {
  for (const expert of Object.values(DOMAIN_EXPERTS)) {
    if (expert.id === id) return expert;
  }
  return null;
}

export function getExpertsByDomain(domain: DomainExpertise): DomainExpert[] {
  return Object.values(DOMAIN_EXPERTS).filter(expert => expert.domain === domain);
}

export function getAllExperts(): DomainExpert[] {
  return Object.values(DOMAIN_EXPERTS);
}
