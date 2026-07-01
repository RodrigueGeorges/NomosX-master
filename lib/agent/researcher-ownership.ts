/**
 * NomosX Researcher Ownership System
 * 
 * CTO-Level Architecture: Domain-based editorial ownership system
 * Maps PhD researchers to their primary domains with pipeline tier selection.
 * 
 * Purpose:
 * - Assign editorial responsibility for research domains
 * - Select appropriate pipeline tiers based on topic complexity
 * - Provide researcher sign-off mechanisms for quality control
 * - Enable domain-specific provider preferences
 * 
 * Architecture Principles:
 * - Single source of truth for domain ownership
 * - Type-safe with centralized DomainExpertise
 * - Configurable pipeline tiers and thresholds
 * - Integration with auto-publisher and quality gates
 */

import { DomainExpertise, AutoPublisherLineage } from './types';
import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ============================================================================
// RESEARCHER REGISTRY - Domain Ownership Mapping
// ============================================================================

export interface ResearcherProfile {
  id: string;
  name: string;
  title: string;
  institution: string;
  domains: DomainExpertise[];
  keywords: string[];
  providers: string[];
  publicationCadence: 'weekly' | 'biweekly' | 'monthly';
  minQualityThreshold: number;
  maxBriefPerRun: number;
  preferredFormats: ('brief' | 'strategic')[];
  focusAreas: string[];
  costThreshold: number;
}

export const RESEARCHER_REGISTRY: Record<DomainExpertise, ResearcherProfile> = {
  // CORE 9 DOMAINS
  "economics": {
    id: "economics",
    name: "Dr. Elena Vasquez",
    title: "Economic Policy Analyst & Behavioral Economics Expert",
    institution: "MIT / Department of Economics",
    domains: ["economics"],
    keywords: [
      "macroeconomics", "microeconomics", "monetary policy", "fiscal policy", "behavioral economics",
      "market dynamics", "economic growth", "inflation", "unemployment", "trade", "finance",
      "investment", "risk", "economic modeling", "econometrics", "economic theory", "policy"
    ],
    providers: ["openalex", "repec", "nber", "ssrn", "jstor", "elsevier", "springer"],
    publicationCadence: "weekly",
    minQualityThreshold: 72,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Macroeconomic policy effectiveness and transmission mechanisms",
      "Behavioral economics applications to public policy",
      "Market failures and regulatory interventions",
      "International trade dynamics and currency regimes"
    ],
    costThreshold: 15.0
  },

  "technology": {
    id: "technology",
    name: "Dr. James Chen",
    title: "AI Research Scientist & Technology Policy Expert",
    institution: "Stanford / Computer Science Department",
    domains: ["technology"],
    keywords: [
      "artificial intelligence", "machine learning", "deep learning", "neural networks", "natural language",
      "computer vision", "robotics", "automation", "algorithms", "data science", "big data", "cloud computing",
      "cybersecurity", "privacy", "blockchain", "quantum computing", "emerging tech", "innovation"
    ],
    providers: ["arxiv", "openalex", "ieee", "acm", "nature", "science", "techcrunch"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "AI safety and alignment research",
      "Technology policy and regulation frameworks",
      "Ethical implications of emerging technologies",
      "Innovation ecosystems and digital transformation"
    ],
    costThreshold: 12.0
  },

  "policy": {
    id: "policy",
    name: "Dr. Amara Okafor",
    title: "Public Policy Expert & Governance Analyst",
    institution: "Harvard Kennedy School",
    domains: ["policy"],
    keywords: [
      "public policy", "governance", "regulation", "administration", "policy analysis", "implementation",
      "evaluation", "public administration", "government", "legislation", "regulatory reform", "policy design",
      "institutional analysis", "public sector", "policy instruments", "governance innovation", "policy outcomes"
    ],
    providers: ["openalex", "ssrn", "jstor", "gao", "oecd", "world bank", "brookings"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Policy implementation and effectiveness evaluation",
      "Governance reforms and institutional innovation",
      "Evidence-based policy making methodologies",
      "Cross-sectoral policy coordination and integration"
    ],
    costThreshold: 10.0
  },

  "health": {
    id: "health",
    name: "Dr. Sarah Lindström",
    title: "Epidemiologist & Public Health Research Expert",
    institution: "Johns Hopkins / School of Public Health",
    domains: ["health"],
    keywords: [
      "epidemiology", "public health", "disease", "pandemic", "vaccination", "healthcare", "medicine",
      "clinical trials", "biostatistics", "health policy", "global health", "preventive medicine", "outbreak",
      "mortality", "morbidity", "health systems", "health economics", "medical research", "population health"
    ],
    providers: ["pubmed", "openalex", "who", "cdc", "lancet", "nejm", "jama"],
    publicationCadence: "biweekly",
    minQualityThreshold: 75,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Infectious disease epidemiology and pandemic preparedness",
      "Health system resilience and healthcare delivery",
      "Public health intervention effectiveness",
      "Global health governance and policy coordination"
    ],
    costThreshold: 18.0
  },

  "security": {
    id: "security",
    name: "Dr. Marcus Webb",
    title: "Security Studies Expert & Defense Analyst",
    institution: "King's College London / Department of War Studies",
    domains: ["security"],
    keywords: [
      "security", "defense", "military", "cybersecurity", "terrorism", "conflict", "warfare", "intelligence",
      "national security", "geopolitical risk", "strategic studies", "deterrence", "security policy", "hybrid warfare",
      "information warfare", "cyber defense", "critical infrastructure", "security architecture", "threat analysis"
    ],
    providers: ["openalex", "rand", "csis", "iiss", "brookings", "war on the rocks", "foreign affairs"],
    publicationCadence: "biweekly",
    minQualityThreshold: 73,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Cybersecurity threats and defense strategies",
      "Geopolitical security dynamics and conflict analysis",
      "Intelligence methodologies and threat assessment",
      "Security sector reform and capacity building"
    ],
    costThreshold: 20.0
  },

  "law": {
    id: "law",
    name: "Dr. Isabelle Moreau",
    title: "Legal Scholar & Regulatory Expert",
    institution: "Yale Law School",
    domains: ["law"],
    keywords: [
      "law", "legal", "regulation", "legislation", "jurisprudence", "constitutional law", "administrative law",
      "international law", "compliance", "legal framework", "judicial review", "legal precedent", "regulatory policy",
      "legal interpretation", "rule of law", "legal institutions", "legal reform", "compliance mechanisms", "legal analysis"
    ],
    providers: ["openalex", "ssrn", "heinonline", "jstor", "westlaw", "lexisnexis", "courtlistener"],
    publicationCadence: "biweekly",
    minQualityThreshold: 74,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Regulatory frameworks and compliance mechanisms",
      "Constitutional law and judicial review processes",
      "International law and cross-border legal issues",
      "Legal technology and innovation in legal services"
    ],
    costThreshold: 15.0
  },

  "environment": {
    id: "environment",
    name: "Dr. Kenji Tanaka",
    title: "Environmental Scientist & Climate Policy Expert",
    institution: "UC Berkeley / Energy and Resources Group",
    domains: ["environment"],
    keywords: [
      "environment", "climate", "sustainability", "green", "renewable energy", "carbon", "emissions", "pollution",
      "conservation", "biodiversity", "ecosystem", "environmental policy", "climate change", "sustainable development",
      "environmental impact", "carbon footprint", "green technology", "climate adaptation", "environmental economics", "ecology"
    ],
    providers: ["openalex", "nature", "science", "climate", "ipcc", "epa", "noaa", "nasa"],
    publicationCadence: "weekly",
    minQualityThreshold: 71,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Climate change mitigation and adaptation strategies",
      "Renewable energy transition and policy frameworks",
      "Biodiversity conservation and ecosystem management",
      "Environmental economics and sustainable development"
    ],
    costThreshold: 14.0
  },

  "quantitative": {
    id: "quantitative",
    name: "Dr. Priya Sharma",
    title: "Quantitative Methods Expert & Statistical Analyst",
    institution: "University of Cambridge / Department of Statistics",
    domains: ["quantitative"],
    keywords: [
      "statistics", "quantitative", "methods", "analysis", "data", "modeling", "regression", "econometrics",
      "bayesian", "machine learning", "causal inference", "experimental design", "survey methodology", "time series",
      "multivariate analysis", "statistical inference", "hypothesis testing", "data visualization", "predictive modeling", "simulation"
    ],
    providers: ["openalex", "arxiv", "jstor", "ssrn", "crossref", "nature", "science"],
    publicationCadence: "monthly",
    minQualityThreshold: 76,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Advanced statistical methods for causal inference",
      "Machine learning applications in social sciences",
      "Experimental design and survey methodology",
      "Data visualization and communication of uncertainty"
    ],
    costThreshold: 25.0
  },

  "finance": {
    id: "finance",
    name: "Dr. Michael Roberts",
    title: "Financial Markets & Investment Expert",
    institution: "Wharton School / University of Pennsylvania",
    domains: ["finance"],
    keywords: [
      "finance", "financial", "markets", "banking", "investment", "portfolio", "risk", "derivatives", "asset pricing",
      "corporate finance", "financial regulation", "fintech", "cryptocurrency", "market structure", "liquidity",
      "capital markets", "financial intermediation", "risk management", "financial modeling", "market microstructure"
    ],
    providers: ["openalex", "ssrn", "repec", "jstor", "bis", "federal reserve", "ecb"],
    publicationCadence: "weekly",
    minQualityThreshold: 73,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Financial market structure and regulation",
      "Risk management and systemic stability",
      "FinTech innovation and digital finance",
      "Corporate finance and investment strategies"
    ],
    costThreshold: 16.0
  },

  // ADVANCED 6 DOMAINS
  "social-sciences": {
    id: "social-sciences",
    name: "Dr. María González",
    title: "Sociologist & Social Dynamics Expert",
    institution: "UC Berkeley / Institute for Social Research",
    domains: ["social-sciences"],
    keywords: [
      "social", "sociology", "anthropology", "psychology", "political science", "social research", "qualitative",
      "ethnography", "survey", "interview", "focus group", "social theory", "social structure", "social change",
      "social inequality", "social networks", "social capital", "social movements", "social policy", "demographics"
    ],
    providers: ["openalex", "ssrn", "jstor", "sage", "wiley", "tandfonline", "cambridge"],
    publicationCadence: "biweekly",
    minQualityThreshold: 71,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Social inequality and demographic change",
      "Social movements and collective action",
      "Interdisciplinary social research methodologies",
      "Social theory and contemporary social issues"
    ],
    costThreshold: 12.0
  },

  "humanities": {
    id: "humanities",
    name: "Dr. Thomas Weber",
    title: "Philosopher & Ethics Expert",
    institution: "Sorbonne / Collège de France",
    domains: ["humanities"],
    keywords: [
      "humanities", "culture", "history", "philosophy", "literature", "arts", "cultural studies", "humanistic",
      "interpretation", "critical theory", "historical analysis", "philosophical inquiry", "literary analysis",
      "cultural heritage", "digital humanities", "humanities computing", "cultural criticism", "intellectual history"
    ],
    providers: ["openalex", "jstor", "project muse", "cambridge", "oxford", "tandfonline"],
    publicationCadence: "monthly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Digital humanities and computational approaches to cultural analysis",
      "Cultural theory and criticism in contemporary society",
      "Historical perspectives on current social issues",
      "Interdisciplinary approaches to humanities research"
    ],
    costThreshold: 10.0
  },

  "energy-advanced": {
    id: "energy-advanced",
    name: "Dr. Fatima Al-Rashid",
    title: "Energy Systems & Grid Integration Expert",
    institution: "Imperial College London / Energy Futures Lab",
    domains: ["energy-advanced"],
    keywords: [
      "energy", "power", "electricity", "grid", "storage", "nuclear", "hydrogen", "solar", "wind", "geothermal",
      "energy systems", "energy transition", "energy efficiency", "energy policy", "energy markets", "energy security",
      "energy infrastructure", "smart grid", "microgrid", "energy storage", "distributed generation", "energy modeling"
    ],
    providers: ["openalex", "nature energy", "energy policy", "iea", "epri", "nrel", "ieee"],
    publicationCadence: "biweekly",
    minQualityThreshold: 72,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Energy system integration and smart grid technologies",
      "Advanced energy storage and grid modernization",
      "Nuclear energy and advanced reactor technologies",
      "Energy market design and regulatory frameworks"
    ],
    costThreshold: 18.0
  },

  "geopolitics": {
    id: "geopolitics",
    name: "Dr. Sergei Petrov",
    title: "International Relations & Geopolitics Expert",
    institution: "Geneva Graduate Institute / European Council on Foreign Relations",
    domains: ["geopolitics"],
    keywords: [
      "geopolitics", "international", "relations", "foreign policy", "diplomacy", "global", "world order", "power",
      "sovereignty", "alliances", "conflict resolution", "international institutions", "global governance", "regional studies",
      "strategic studies", "international law", "trade policy", "sanctions", "development policy", "humanitarian intervention"
    ],
    providers: ["openalex", "foreign affairs", "foreign policy", "the economist", "chatham house", "carnegie"],
    publicationCadence: "weekly",
    minQualityThreshold: 71,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Great power competition and strategic stability",
      "Regional security architectures and conflict resolution",
      "International institutions and global governance",
      "Economic statecraft and strategic trade policies"
    ],
    costThreshold: 15.0
  },

  "digital-society": {
    id: "digital-society",
    name: "Dr. Kwame Osei",
    title: "Digital Sociologist & Technology Impact Expert",
    institution: "MIT Media Lab / Oxford Internet Institute",
    domains: ["digital-society"],
    keywords: [
      "digital", "society", "internet", "social media", "online", "digital transformation", "digital divide",
      "platform economy", "gig economy", "digital rights", "privacy", "surveillance", "digital citizenship",
      "online communities", "digital culture", "information society", "digital inclusion", "digital literacy", "cyberculture"
    ],
    providers: ["openalex", "ssrn", "jstor", "first monday", "new media & society", "information communication"],
    publicationCadence: "biweekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Digital inequality and inclusion strategies",
      "Platform governance and the digital economy",
      "Privacy, surveillance, and digital rights",
      "Social media's impact on democracy and society"
    ],
    costThreshold: 12.0
  },

  "cognitive-science": {
    id: "cognitive-science",
    name: "Dr. Lisa Chang",
    title: "Cognitive Neuroscientist & Decision Science Expert",
    institution: "UCL / Max Planck Institute for Human Development",
    domains: ["cognitive-science"],
    keywords: [
      "cognitive", "psychology", "neuroscience", "decision making", "behavior", "cognition", "brain", "mind",
      "perception", "attention", "memory", "learning", "reasoning", "problem solving", "cognitive bias",
      "neuroeconomics", "behavioral science", "cognitive modeling", "artificial intelligence", "human-computer interaction"
    ],
    providers: ["openalex", "psychology", "nature neuroscience", "cognitive science", "neuroimage", "frontiers"],
    publicationCadence: "monthly",
    minQualityThreshold: 73,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Decision making under uncertainty and risk",
      "Cognitive biases and behavioral interventions",
      "Neuroeconomics and the neural basis of economic behavior",
      "Human-computer interaction and cognitive ergonomics"
    ],
    costThreshold: 20.0
  },

  // SPECIALIZED DOMAINS
  "behavioral-economics": {
    id: "behavioral-economics",
    name: "Dr. Rachel Kim",
    title: "Behavioral Economist & Choice Architecture Expert",
    institution: "University of Chicago / NBER / ideas42",
    domains: ["behavioral-economics"],
    keywords: [
      "behavioral", "economics", "psychology", "decision", "bias", "heuristics", "nudge", "prospect theory",
      "behavioral finance", "consumer behavior", "policy design", "choice architecture", "behavioral insights",
      "experimental economics", "cognitive psychology", "social preferences", "time preferences", "risk preferences"
    ],
    providers: ["openalex", "ssrn", "jstor", "nature human behavior", "psychological science", "journal of behavioral economics"],
    publicationCadence: "monthly",
    minQualityThreshold: 74,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Behavioral interventions for public policy",
      "Financial decision making and behavioral finance",
      "Consumer choice and market behavior",
      "Experimental methods in behavioral economics"
    ],
    costThreshold: 16.0
  },

  "urban-studies": {
    id: "urban-studies",
    name: "Dr. Carlos Rodriguez",
    title: "Urban Planner & Smart Cities Expert",
    institution: "MIT / Lincoln Institute of Land Policy",
    domains: ["urban-studies"],
    keywords: [
      "urban", "city", "planning", "urbanization", "metropolitan", "infrastructure", "housing", "transportation",
      "urban design", "smart cities", "urban economics", "urban policy", "sustainable urban development", "urban governance",
      "urban sociology", "urban geography", "urban ecology", "urban regeneration", "urban resilience", "community development"
    ],
    providers: ["openalex", "urban studies", "cities", "journal of planning education", "urban affairs review", "landscape"],
    publicationCadence: "monthly",
    minQualityThreshold: 71,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Sustainable urban development and smart city initiatives",
      "Housing policy and affordable housing strategies",
      "Urban transportation and infrastructure planning",
      "Urban governance and metropolitan coordination"
    ],
    costThreshold: 14.0
  },

  "bioethics": {
    id: "bioethics",
    name: "Dr. Sophie Martin",
    title: "Bioethicist & Medical Ethics Expert",
    institution: "Johns Hopkins / Hastings Center",
    domains: ["bioethics"],
    keywords: [
      "bioethics", "ethics", "medical", "biomedical", "research ethics", "clinical ethics", "genetics", "genomics",
      "reproductive ethics", "end-of-life", "pandemic ethics", "public health ethics", "human subjects", "informed consent",
      "ethical frameworks", "moral philosophy", "applied ethics", "health policy ethics", "biotechnology ethics", "neuroethics"
    ],
    providers: ["openalex", "jstor", "bioethics", "journal of medical ethics", " Hastings center report", "theoretical medicine"],
    publicationCadence: "monthly",
    minQualityThreshold: 75,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Ethical implications of emerging biotechnologies",
      "Pandemic ethics and public health moral dilemmas",
      "Research ethics and human subject protections",
      "End-of-life care and medical decision making"
    ],
    costThreshold: 18.0
  },

  "complexity-science": {
    id: "complexity-science",
    name: "Dr. Michael Zhang",
    title: "Complexity Scientist & Complex Systems Expert",
    institution: "Oxford / Santa Fe Institute",
    domains: ["complexity-science"],
    keywords: [
      "complexity", "complex systems", "emergence", "nonlinear", "dynamics", "chaos", "fractals", "network theory",
      "agent-based modeling", "self-organization", "adaptation", "system dynamics", "complexity economics", "complex networks",
      "scaling laws", "phase transitions", "critical phenomena", "complex adaptive systems", "systems thinking", "interconnectedness"
    ],
    providers: ["openalex", "arxiv", "nature", "science", "physical review", "complexity", "chaos", "physica"],
    publicationCadence: "monthly",
    minQualityThreshold: 76,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Complex systems approaches to social and economic phenomena",
      "Agent-based modeling for policy simulation",
      "Network theory and systemic risk analysis",
      "Emergence and self-organization in complex systems"
    ],
    costThreshold: 22.0
  },

  "computational-social-science": {
    id: "computational-social-science",
    name: "Dr. David Liu",
    title: "Computational Social Scientist & Network Analysis Expert",
    institution: "Carnegie Mellon / Santa Fe Institute / Microsoft Research",
    domains: ["computational-social-science"],
    keywords: [
      "computational", "social", "network", "big data", "social media", "agent based", "simulation", "modeling",
      "digital trace", "online behavior", "social computing", "network analysis", "social data", "machine learning",
      "social simulation", "complex systems", "emergence", "predictive modeling", "digital humanities", "computational methods"
    ],
    providers: ["openalex", "arxiv", "ssrn", "plos one", "nature", "science", "joi"],
    publicationCadence: "monthly",
    minQualityThreshold: 73,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Network analysis of misinformation spread and social influence",
      "Computational approaches to detecting and measuring social phenomena",
      "Big data methods for understanding collective behavior",
      "Agent-based modeling for policy simulation and intervention testing"
    ],
    costThreshold: 20.0
  },

  "development-economics": {
    id: "development-economics",
    name: "Dr. Amina Diallo",
    title: "Development Economist & Global South Expert",
    institution: "London School of Economics / J-PAL / UNDP",
    domains: ["development-economics"],
    keywords: [
      "development", "poverty", "emerging markets", "foreign aid", "microfinance", "institutional economics",
      "human capital", "agricultural economics", "south-south cooperation", "economic growth", "low income",
      "middle income", "structural transformation", "capability approach", "aid effectiveness", "development policy",
      "global south", "inequality", "food security", "land reform", "demographic dividend"
    ],
    providers: ["openalex", "ssrn", "repec", "worldbank", "undp-research", "jstor", "crossref"],
    publicationCadence: "biweekly",
    minQualityThreshold: 72,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Poverty alleviation and RCT-based intervention evaluation",
      "Institutional quality and economic growth in developing countries",
      "Aid effectiveness and donor-recipient dynamics",
      "Structural transformation and global value chain participation"
    ],
    costThreshold: 16.0
  },

  "risk-analysis": {
    id: "risk-analysis",
    name: "Dr. Anika Johansson",
    title: "Risk Analyst & Uncertainty Modeling Expert",
    institution: "London School of Economics / Swiss Re / BIS",
    domains: ["risk-analysis"],
    keywords: [
      "risk", "uncertainty", "probability", "systemic risk", "financial risk", "operational risk",
      "catastrophe", "scenario planning", "monte carlo", "value at risk", "stress testing", "tail risk",
      "black swan", "enterprise risk", "contagion", "cascading failure", "resilience", "risk management",
      "risk assessment", "risk mitigation", "insurance", "reinsurance"
    ],
    providers: ["openalex", "ssrn", "bis", "imf", "nature", "science", "crossref", "repec"],
    publicationCadence: "biweekly",
    minQualityThreshold: 75,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Systemic risk analysis and financial contagion modeling",
      "Tail risk and extreme event quantification",
      "Scenario planning and stress testing methodologies",
      "Cascading failures and multi-layer risk assessment"
    ],
    costThreshold: 20.0
  }
};

// ============================================================================
// VERTICAL ↔ RESEARCHER MAPPING — Links DB verticals to researcher domains
// ============================================================================

export const VERTICAL_RESEARCHER_MAP: Record<string, DomainExpertise[]> = {
  "climate-energy":          ["environment", "energy-advanced"],
  "macro-finance":           ["economics", "finance", "risk-analysis"],
  "geopolitics":             ["geopolitics", "security"],
  "tech-innovation":         ["technology", "digital-society", "computational-social-science"],
  "social-policy":           ["policy", "social-sciences", "behavioral-economics"],
  "health-bioethics":        ["health", "bioethics"],
  "law-regulation":          ["law"],
  "cognitive-behavioral":    ["cognitive-science", "behavioral-economics"],
  "development-global":      ["development-economics", "urban-studies"],
  "complexity-quantitative": ["complexity-science", "quantitative", "risk-analysis"],
  "humanities-ethics":       ["humanities"],
};

/**
 * Gets the best matching vertical slug for a given topic.
 * Uses researcher keyword matching to find the domain, then maps to vertical.
 */
export function getVerticalForTopic(topic: string): string | null {
  const owner = getPrimaryOwner(topic);
  if (!owner) return null;

  // Find which vertical contains this researcher's domain
  for (const [verticalSlug, domains] of Object.entries(VERTICAL_RESEARCHER_MAP)) {
    if (domains.includes(owner.domain)) {
      return verticalSlug;
    }
  }
  return null;
}

/**
 * Gets the lead researcher for a vertical slug
 */
export function getLeadResearcherForVertical(verticalSlug: string): ResearcherProfile | null {
  const domains = VERTICAL_RESEARCHER_MAP[verticalSlug];
  if (!domains || domains.length === 0) return null;
  return RESEARCHER_REGISTRY[domains[0]] || null;
}

/**
 * Gets all researcher providers for a vertical (merged, deduplicated)
 */
export function getProvidersForVertical(verticalSlug: string): string[] {
  const domains = VERTICAL_RESEARCHER_MAP[verticalSlug];
  if (!domains) return ["openalex", "crossref", "semanticscholar"];

  const providerSet = new Set<string>();
  for (const domain of domains) {
    const researcher = RESEARCHER_REGISTRY[domain];
    if (researcher) {
      researcher.providers.forEach(p => providerSet.add(p));
    }
  }
  return Array.from(providerSet);
}

// ============================================================================
// PIPELINE TIER DEFINITIONS
// ============================================================================

export type PipelineTier = 'standard' | 'premium' | 'strategic';

export interface PipelineTierConfig {
  tier: PipelineTier;
  description: string;
  estimatedCost: { min: number; max: number };
  estimatedDuration: { min: number; max: number };
  agents: string[];
  qualityThreshold: number;
  useHarvardCouncil: boolean;
  useCriticalLoop: boolean;
  useDebate: boolean;
  useMetaAnalysis: boolean;
  useDevilsAdvocate: boolean;
}

export const PIPELINE_TIERS: Record<PipelineTier, PipelineTierConfig> = {
  standard: {
    tier: 'standard',
    description: 'ANALYST V3 + Guard + Editor - Fast, cost-effective analysis',
    estimatedCost: { min: 0.80, max: 1.50 },
    estimatedDuration: { min: 30, max: 60 },
    agents: ['scout', 'index', 'rank', 'reader-v3', 'analyst-v3', 'guard', 'editor'],
    qualityThreshold: 65,
    useHarvardCouncil: false,
    useCriticalLoop: false,
    useDebate: false,
    useMetaAnalysis: false,
    useDevilsAdvocate: false
  },
  
  premium: {
    tier: 'premium',
    description: 'Harvard Council (3 experts) + Critical Loop V2 - Enhanced analysis',
    estimatedCost: { min: 2.50, max: 4.00 },
    estimatedDuration: { min: 90, max: 150 },
    agents: ['scout', 'index', 'rank', 'reader-v3', 'analyst-v3', 'harvard-council', 'critical-loop-v2', 'guard', 'editor'],
    qualityThreshold: 75,
    useHarvardCouncil: true,
    useCriticalLoop: true,
    useDebate: false,
    useMetaAnalysis: false,
    useDevilsAdvocate: false
  },
  
  strategic: {
    tier: 'strategic',
    description: 'Full pipeline: Council (8 experts) + Debate + Meta-Analysis + Devil\'s Advocate',
    estimatedCost: { min: 8.0, max: 15.0 },
    estimatedDuration: { min: 300, max: 600 },
    agents: ['scout', 'index', 'rank', 'reader-v3', 'analyst-v3', 'harvard-council', 'critical-loop-v2', 'debate-agent', 'meta-analysis', 'devils-advocate', 'guard', 'editor'],
    qualityThreshold: 85,
    useHarvardCouncil: true,
    useCriticalLoop: true,
    useDebate: true,
    useMetaAnalysis: true,
    useDevilsAdvocate: true
  }
};

// ============================================================================
// CORE FUNCTIONS - Domain Detection & Ownership
// ============================================================================

export interface DomainScore {
  domain: DomainExpertise;
  score: number;
  researcher: ResearcherProfile;
  matchedKeywords: string[];
}

/**
 * Detects domain ownership for a given topic using keyword matching
 * Returns sorted list of domains with scores above threshold
 */
export function detectOwners(topic: string, threshold: number = 0.3): DomainScore[] {
  const topicLower = topic.toLowerCase();
  const scores: DomainScore[] = [];

  for (const [domain, researcher] of Object.entries(RESEARCHER_REGISTRY)) {
    const matchedKeywords: string[] = [];
    let totalScore = 0;

    // Keyword matching with weighted scoring
    for (const keyword of researcher.keywords) {
      const keywordLower = keyword.toLowerCase();
      
      // Exact phrase match (highest weight)
      if (topicLower.includes(keywordLower)) {
        totalScore += 2.0;
        matchedKeywords.push(keyword);
        continue;
      }

      // Partial word matching
      const keywordWords = keywordLower.split(' ');
      let keywordScore = 0;
      
      for (const word of keywordWords) {
        if (topicLower.includes(word)) {
          keywordScore += 0.5;
        }
      }
      
      if (keywordScore > 0) {
        totalScore += keywordScore;
        matchedKeywords.push(keyword);
      }
    }

    // Normalize score by keyword count
    const normalizedScore = totalScore / researcher.keywords.length;
    
    if (normalizedScore >= threshold) {
      scores.push({
        domain: domain as DomainExpertise,
        score: normalizedScore,
        researcher,
        matchedKeywords
      });
    }
  }

  // Sort by score descending
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Gets the primary owner (highest scoring domain) for a topic
 */
export function getPrimaryOwner(topic: string): DomainScore | null {
  const owners = detectOwners(topic, 0.2);
  return owners.length > 0 ? owners[0] : null;
}

/**
 * Selects appropriate pipeline tier based on topic complexity and owner preferences
 */
export function selectPipelineTier(
  topic: string, 
  format: 'brief' | 'strategic' = 'brief',
  forceTier?: PipelineTier,
  maxCostUsd?: number
): { tier: PipelineTier; config: PipelineTierConfig; owner: DomainScore | null } {
  const owner = getPrimaryOwner(topic);
  
  // If force tier specified, use it
  if (forceTier) {
    return {
      tier: forceTier,
      config: PIPELINE_TIERS[forceTier],
      owner
    };
  }

  // Cost-based tier selection
  if (maxCostUsd) {
    if (maxCostUsd <= 2.0) {
      return { tier: 'standard', config: PIPELINE_TIERS.standard, owner };
    } else if (maxCostUsd <= 6.0) {
      return { tier: 'premium', config: PIPELINE_TIERS.premium, owner };
    }
  }

  // Format-based selection
  if (format === 'strategic') {
    return { tier: 'strategic', config: PIPELINE_TIERS.strategic, owner };
  }

  // Owner preference-based selection
  if (owner) {
    if (owner.researcher.preferredFormats.includes('strategic')) {
      return { tier: 'premium', config: PIPELINE_TIERS.premium, owner };
    }
  }

  // Default to standard
  return { tier: 'standard', config: PIPELINE_TIERS.standard, owner };
}

// ============================================================================
// RESEARCHER AGENDA & SIGN-OFF FUNCTIONS
// ============================================================================

export interface ResearcherAgenda {
  researcherId: string;
  researcherName: string;
  standingTopics: string[];
  priorityAreas: string[];
  upcomingDeadlines: Array<{ topic: string; deadline: Date; priority: 'high' | 'medium' | 'low' }>;
  capacityUtilization: number;
}

/**
 * Gets the standing research agenda for a specific researcher
 */
export function getResearcherAgenda(researcherId: string): ResearcherAgenda {
  const researcher = Object.values(RESEARCHER_REGISTRY).find(r => r.id === researcherId);
  
  if (!researcher) {
    throw new Error(`Researcher not found: ${researcherId}`);
  }

  return {
    researcherId,
    researcherName: researcher.name,
    standingTopics: researcher.focusAreas,
    priorityAreas: researcher.focusAreas.slice(0, 3), // Top 3 focus areas
    upcomingDeadlines: [], // Would be populated from database in real implementation
    capacityUtilization: researcher.maxBriefPerRun > 1 ? 0.7 : 0.9
  };
}

/**
 * Gets the complete think tank agenda across all researchers
 */
export function getThinkTankAgenda(): ResearcherAgenda[] {
  return Object.values(RESEARCHER_REGISTRY).map(researcher => ({
    researcherId: researcher.id,
    researcherName: researcher.name,
    standingTopics: researcher.focusAreas,
    priorityAreas: researcher.focusAreas.slice(0, 3),
    upcomingDeadlines: [],
    capacityUtilization: researcher.maxBriefPerRun > 1 ? 0.7 : 0.9
  }));
}

export interface SignOffResult {
  approved: boolean;
  researcherName: string;
  domain: DomainExpertise;
  decision: 'approve' | 'reject' | 'revise';
  confidence: number;
  comments: string[];
  timestamp: Date;
  trustScore: number;
}

/**
 * LLM-based researcher sign-off for publication quality control.
 * The researcher's persona reviews the brief and decides approve/revise/reject.
 */
export async function requestResearcherSignOff(
  topic: string,
  html: string,
  trustScore: number,
  researcherId?: string
): Promise<SignOffResult> {
  // Auto-select researcher if not specified
  const owner = researcherId 
    ? Object.values(RESEARCHER_REGISTRY).find(r => r.id === researcherId)
    : getPrimaryOwner(topic)?.researcher;

  if (!owner) {
    throw new Error('No suitable researcher found for sign-off');
  }

  // Truncate HTML to avoid token overflow (keep first 3000 chars)
  const truncatedHtml = html.length > 3000 ? html.slice(0, 3000) + '\n[...truncated...]' : html;

  try {
    const result = await callLLM({
      messages: [
        {
          role: "system",
          content: `You are ${owner.name}, ${owner.title} at ${owner.institution}.
You specialize in: ${owner.focusAreas.join('; ')}.
Your quality threshold is ${owner.minQualityThreshold}/100.

You are reviewing a research brief for publication sign-off. Evaluate it with the rigor expected of a PhD-level domain expert. Consider:
- Accuracy and evidence quality
- Methodological soundness
- Citation quality and source reliability
- Completeness of analysis
- Appropriate caveats and uncertainty acknowledgment

Return JSON:
{
  "decision": "approve" | "revise" | "reject",
  "confidence": 0.0-1.0,
  "comments": ["specific comment 1", "specific comment 2", ...]
}`
        },
        {
          role: "user",
          content: `TOPIC: "${topic}"
TRUST SCORE: ${trustScore}/100

BRIEF CONTENT:
${truncatedHtml}

Review this brief and provide your sign-off decision.`
        }
      ],
      temperature: 0.1,
      maxTokens: 800,
      jsonMode: true,
      enableCache: true,
      task: 'fact_check',
    });

    let parsed: { decision?: string; confidence?: number; comments?: string[] };
    try {
      parsed = parseJson<any>(result.content) ?? {};
    } catch {
      console.warn(`[SIGN-OFF] JSON.parse failed for ${owner.name}, using fallback`);
      parsed = {};
    }
    const rawDecision = parsed.decision || (trustScore >= owner.minQualityThreshold ? 'approve' : 'revise');
    const decision: 'approve' | 'reject' | 'revise' =
      rawDecision === 'approve' || rawDecision === 'reject' || rawDecision === 'revise'
        ? rawDecision
        : 'revise';

    return {
      approved: decision === 'approve',
      researcherName: owner.name,
      domain: owner.id as DomainExpertise,
      decision,
      confidence: parsed.confidence || 0.5,
      comments: parsed.comments || [],
      timestamp: new Date(),
      trustScore
    };
  } catch (err) {
    console.warn(`[SIGN-OFF] LLM-based sign-off failed for ${owner.name}, falling back to threshold:`, err);
    // Graceful fallback to threshold-based decision
    const approved = trustScore >= owner.minQualityThreshold;
    return {
      approved,
      researcherName: owner.name,
      domain: owner.id as DomainExpertise,
      decision: approved ? 'approve' : (trustScore >= owner.minQualityThreshold * 0.8 ? 'revise' : 'reject'),
      confidence: Math.min(trustScore / owner.minQualityThreshold, 1.0),
      comments: [`[Fallback] ${approved ? 'Approved' : 'Requires revision'} based on threshold (${trustScore}/${owner.minQualityThreshold}).`],
      timestamp: new Date(),
      trustScore
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets all researchers for a given domain
 */
export function getResearchersByDomain(domain: DomainExpertise): ResearcherProfile[] {
  return Object.values(RESEARCHER_REGISTRY).filter(r => r.domains.includes(domain));
}

/**
 * Gets researcher by ID
 */
export function getResearcherById(researcherId: string): ResearcherProfile | undefined {
  return Object.values(RESEARCHER_REGISTRY).find(r => r.id === researcherId);
}

/**
 * Validates if a domain is supported
 */
export function isValidDomain(domain: string): domain is DomainExpertise {
  return domain in RESEARCHER_REGISTRY;
}

/**
 * Gets provider recommendations for a domain
 */
export function getRecommendedProviders(domain: DomainExpertise): string[] {
  const researcher = RESEARCHER_REGISTRY[domain];
  return researcher ? researcher.providers : [];
}

// ============================================================================
// EXPORTS
// ============================================================================

// All functions and types are already exported above - no need to re-export
