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
import { getResearcher } from '../researchers';

// ============================================================================
// RESEARCHER REGISTRY - Domain Ownership Mapping
// 
// F-B9 FIX: lib/researchers.ts is the single source of truth for UI-facing
// researcher identity (name, title, institution, color, etc.).
// This registry holds pipeline-specific config (providers, cadence, thresholds).
// Use getResearcherUIName(domain) to get the display name from the unified registry.
// ============================================================================

/** Get the UI-facing researcher name from the unified registry in lib/researchers.ts */
export function getResearcherUIName(domain: DomainExpertise): string {
  return getResearcher(domain)?.name ?? domain;
}

/** Get the UI-facing researcher title from the unified registry */
export function getResearcherUITitle(domain: DomainExpertise): string {
  return getResearcher(domain)?.title ?? '';
}

/** Get the UI-facing researcher institution from the unified registry */
export function getResearcherUIInstitution(domain: DomainExpertise): string {
  return getResearcher(domain)?.institution ?? '';
}

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
  },
  "anthropology": {
    id: "anthropology",
    name: "Dr. Amara Diallo",
    title: "Anthropology & Cultural Analysis Expert",
    institution: "EHESS Paris",
    domains: ["anthropology"],
    keywords: [
      "anthropology", "ethnography", "culture", "ritual", "myth", "symbol",
      "ontological turn", "perspectivism", "structuralism", "thick description",
      "nature culture", "indigenous", "post-colonial", "multispecies"
    ],
    providers: ["openalex", "crossref", "hal", "persee", "jstor", "philpapers"],
    publicationCadence: "monthly",
    minQualityThreshold: 75,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Ontological pluralism and non-Western worldviews",
      "Cultural analysis of technology and governance",
      "Post-colonial anthropology and decolonial thought"
    ],
    costThreshold: 15.0
  },
  "history": {
    id: "history",
    name: "Dr. Henri Lefort",
    title: "History & Historical Analysis Expert",
    institution: "Sorbonne",
    domains: ["history"],
    keywords: [
      "history", "historical", "longue durée", "annales", "archival",
      "intellectual history", "conceptual history", "postcolonial", "genealogy",
      "counterfactual", "temporal", "century", "precedent"
    ],
    providers: ["openalex", "crossref", "jstor", "hal", "persee", "internet-archive"],
    publicationCadence: "biweekly",
    minQualityThreshold: 75,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Historical analogues and structural patterns across centuries",
      "Conceptual history and the genealogy of present categories",
      "Post-colonial history and the critique of Eurocentric narratives"
    ],
    costThreshold: 15.0
  },
  "religious-studies": {
    id: "religious-studies",
    name: "Dr. Sophia Chen",
    title: "Religious Studies & Political Theology Expert",
    institution: "Harvard Divinity School",
    domains: ["religious-studies"],
    keywords: [
      "religion", "religious", "theology", "sacred", "secular", "spiritual",
      "church", "islam", "buddhism", "hinduism", "confucianism", "interfaith",
      "political theology", "secularization", "deprivatization", "religious authority"
    ],
    providers: ["openalex", "crossref", "jstor", "hal", "philpapers", "persee"],
    publicationCadence: "biweekly",
    minQualityThreshold: 75,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Religion and AI governance — normative frameworks and ontological assumptions",
      "Political theology and the public role of religion",
      "Comparative theology and interfaith dialogue on technology"
    ],
    costThreshold: 15.0
  },
  "non-western-philosophy": {
    id: "non-western-philosophy",
    name: "Dr. Kenji Watanabe",
    title: "Non-Western Philosophy & Comparative Thought Expert",
    institution: "University of Tokyo",
    domains: ["non-western-philosophy"],
    keywords: [
      "confucian", "buddhist", "islamic philosophy", "falsafa", "ubuntu",
      "advaita vedanta", "madhyamaka", "african philosophy", "eastern philosophy",
      "comparative philosophy", "non-western", "decolonial philosophy"
    ],
    providers: ["openalex", "crossref", "jstor", "hal", "philpapers"],
    publicationCadence: "monthly",
    minQualityThreshold: 75,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Non-Western philosophical perspectives on technology and governance",
      "Comparative ethics and cross-cultural dialogue",
      "Decolonial philosophy and the critique of Western universalism"
    ],
    costThreshold: 15.0
  },

  // ── SUB-DISCIPLINE LENSES (Sprint 19 — PhD-level granularity) ──

  "sociology": {
    id: "sociology",
    name: "Dr. Léa Moreau",
    title: "Sociologist — Institutions, Stratification & Collective Action",
    institution: "EHESS / Centre de Sociologie",
    domains: ["sociology"],
    keywords: ["social class", "stratification", "institution", "habitus", "field", "social capital", "collective action", "social movements", "norms", "socialization", "network", "segmentation", "mobility", "anomie", "solidarity"],
    providers: ["sociology", "isidore", "persee", "openalex", "ssrn", "hal", "core"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Institutional change and field dynamics (Bourdieu, DiMaggio)",
      "Stratification, inequality and social reproduction",
      "Collective action and social movements"
    ],
    costThreshold: 12.0
  },

  "psychology": {
    id: "psychology",
    name: "Dr. Naomi Feld",
    title: "Psychologist — Cognitive Biases, Behavior & Decision Science",
    institution: "University of Cambridge / Department of Psychology",
    domains: ["psychology"],
    keywords: ["cognitive bias", "heuristic", "decision making", "behavior", "motivation", "identity", "group dynamics", "polarization", "persuasion", "emotion", "cognition", "nudge", "prospect theory", "social identity"],
    providers: ["psychology", "pubmed", "semanticscholar", "openalex", "crossref", "core"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Judgment and decision-making under uncertainty",
      "Group dynamics, identity and polarization",
      "Behavioral mechanisms in policy and persuasion"
    ],
    costThreshold: 12.0
  },

  "political-science": {
    id: "political-science",
    name: "Dr. Marcus Hale",
    title: "Political Scientist — Regimes, Parties & Comparative Politics",
    institution: "Oxford / Department of Politics and IR",
    domains: ["political-science"],
    keywords: ["democracy", "authoritarianism", "regime", "elections", "parties", "populism", "polarization", "state capacity", "veto players", "coalition", "legitimacy", "democratic backsliding", "federalism"],
    providers: ["political-science", "openalex", "ssrn", "crossref", "isidore", "persee", "brookings", "rand"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Democratic backsliding and regime transitions",
      "Party systems, populism and polarization",
      "Institutional design and veto-player analysis"
    ],
    costThreshold: 12.0
  },

  "demography": {
    id: "demography",
    name: "Dr. Ingrid Halvorsen",
    title: "Demographer — Population Structure, Fertility & Migration",
    institution: "INED / Institut National d'Études Démographiques",
    domains: ["demography"],
    keywords: ["fertility", "mortality", "migration", "aging", "population structure", "cohort", "demographic transition", "dependency ratio", "life expectancy", "urbanization", "population momentum", "replacement level"],
    providers: ["openalex", "crossref", "worldbank", "un", "undp", "isidore", "persee", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Fertility decline and the second demographic transition",
      "Population aging and dependency ratios",
      "Migration systems and diaspora dynamics"
    ],
    costThreshold: 12.0
  },

  "criminology": {
    id: "criminology",
    name: "Dr. Rafael Ortega",
    title: "Criminologist — Crime Patterns, Policing & Penal Systems",
    institution: "University of Maryland / Criminology",
    domains: ["criminology"],
    keywords: ["crime", "policing", "incarceration", "recidivism", "deterrence", "organized crime", "violence", "penal system", "routine activities", "hot spots", "labeling", "restorative justice"],
    providers: ["unodc", "openalex", "ssrn", "crossref", "core", "doaj"],
    publicationCadence: "monthly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Crime concentration and place-based analysis",
      "Deterrence, legitimacy and procedural justice",
      "Organized crime markets and illicit networks"
    ],
    costThreshold: 12.0
  },

  "education": {
    id: "education",
    name: "Dr. Priya Raman",
    title: "Education Researcher — Learning Sciences & Education Systems",
    institution: "UCL Institute of Education",
    domains: ["education"],
    keywords: ["education", "learning", "curriculum", "pedagogy", "achievement gap", "literacy", "school system", "higher education", "skills", "cognitive development", "educational inequality", "PISA"],
    providers: ["eric", "openalex", "crossref", "isidore", "oecd", "worldbank", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Achievement gaps and educational inequality",
      "Evidence-based pedagogy and learning science",
      "Education systems and human capital formation"
    ],
    costThreshold: 10.0
  },

  "philosophy": {
    id: "philosophy",
    name: "Dr. Élise Fontaine",
    title: "Philosopher — Ethics, Epistemology & Political Philosophy",
    institution: "ENS Paris / Département de Philosophie",
    domains: ["philosophy"],
    keywords: ["ethics", "epistemology", "justice", "normativity", "utilitarianism", "deontology", "virtue ethics", "contractualism", "truth", "knowledge", "consciousness", "free will", "political philosophy", "metaethics"],
    providers: ["philpapers", "isidore", "openalex", "crossref", "persee", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 72,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Normative frameworks for policy and technology",
      "Epistemic norms — what counts as justified belief",
      "Justice theories applied to institutions"
    ],
    costThreshold: 12.0
  },

  "linguistics": {
    id: "linguistics",
    name: "Dr. Yuki Tanaka",
    title: "Linguist — Semantics, Discourse & Language Policy",
    institution: "MIT / Linguistics",
    domains: ["linguistics"],
    keywords: ["semantics", "pragmatics", "discourse", "framing", "language policy", "multilingualism", "metaphor", "speech acts", "narrative", "translation", "sociolinguistics", "language ideology"],
    providers: ["openalex", "crossref", "isidore", "persee", "core", "semanticscholar"],
    publicationCadence: "monthly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Framing and discourse in political communication",
      "Language policy and linguistic diversity",
      "Metaphor and narrative in public reasoning"
    ],
    costThreshold: 10.0
  },

  "media-studies": {
    id: "media-studies",
    name: "Dr. Carla Jimenez",
    title: "Media & Communication Scholar — Platforms, Disinformation & Public Sphere",
    institution: "LSE / Media and Communications",
    domains: ["media-studies"],
    keywords: ["media", "platform", "disinformation", "public sphere", "propaganda", "attention economy", "algorithmic curation", "journalism", "echo chamber", "framing", "media ownership", "influence operations"],
    providers: ["openalex", "crossref", "ssrn", "isidore", "core", "eventregistry", "gdelt-news"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Platform power and the restructuring of the public sphere",
      "Disinformation ecosystems and influence operations",
      "Media ownership, capture and trust"
    ],
    costThreshold: 10.0
  },

  "epidemiology": {
    id: "epidemiology",
    name: "Dr. Sofia Lindqvist",
    title: "Epidemiologist — Disease Dynamics & Population Health Methods",
    institution: "Karolinska Institutet",
    domains: ["epidemiology"],
    keywords: ["epidemic", "incidence", "prevalence", "R0", "transmission", "outbreak", "cohort study", "case-control", "confounding", "surveillance", "vaccine effectiveness", "herd immunity", "contact tracing"],
    providers: ["pubmed", "europepmc", "openalex", "crossref", "who", "cdc", "the-lancet", "nature-medicine"],
    publicationCadence: "weekly",
    minQualityThreshold: 72,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Transmission dynamics and outbreak trajectories",
      "Causal inference in observational health data",
      "Surveillance systems and early warning"
    ],
    costThreshold: 12.0
  },

  "public-health": {
    id: "public-health",
    name: "Dr. Kwame Asante",
    title: "Public Health Expert — Health Systems & Population Interventions",
    institution: "Johns Hopkins Bloomberg School of Public Health",
    domains: ["public-health"],
    keywords: ["public health", "health system", "prevention", "health equity", "social determinants", "universal coverage", "health policy", "screening", "primary care", "health promotion", "mortality burden"],
    providers: ["pubmed", "europepmc", "openalex", "who", "worldbank", "the-lancet", "crossref"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Social determinants and health equity",
      "Health system capacity and universal coverage",
      "Prevention economics and intervention evaluation"
    ],
    costThreshold: 12.0
  },

  "international-relations": {
    id: "international-relations",
    name: "Dr. Viktor Andersson",
    title: "IR Scholar — Grand Strategy, Alliances & World Order",
    institution: "Princeton / School of Public and International Affairs",
    domains: ["international-relations"],
    keywords: ["international relations", "balance of power", "alliance", "hegemony", "deterrence", "security dilemma", "world order", "multipolarity", "soft power", "interdependence", "regime theory", "grand strategy"],
    providers: ["openalex", "crossref", "ssrn", "cfr", "chatham-house", "iiss", "rand", "carnegie", "isidore"],
    publicationCadence: "weekly",
    minQualityThreshold: 72,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Balance of power and polarity transitions",
      "Alliance formation, credibility and extended deterrence",
      "International order theory — liberal, realist, constructivist"
    ],
    costThreshold: 12.0
  },

  // ── SUB-DISCIPLINE LENSES II (Sprint 19 batch 3 — toward 50 domains) ──

  "migration-studies": {
    id: "migration-studies",
    name: "Dr. Amara Diallo",
    title: "Migration & Mobility Analyst — Flows, Borders & Integration",
    institution: "University of Amsterdam / IMISCOE",
    domains: ["migration-studies"],
    keywords: ["migration", "immigration", "emigration", "diaspora", "remittances", "asylum", "refugee", "border", "integration", "transnationalism", "brain drain", "labor mobility", "deportation", "statelessness"],
    providers: ["openalex", "crossref", "isidore", "persee", "sociology", "worldbank", "undp", "oecd", "mega-stats", "core"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Migration systems and flow dynamics (push-pull, networks, feedback)",
      "Border regimes, asylum systems and mobility governance",
      "Integration outcomes and transnationalism"
    ],
    costThreshold: 12.0
  },

  "science-technology-studies": {
    id: "science-technology-studies",
    name: "Dr. Hannah Lindgren",
    title: "STS Analyst — Science, Technology & Society",
    institution: "Cornell / Department of Science & Technology Studies",
    domains: ["science-technology-studies"],
    keywords: ["science studies", "technology", "innovation", "sociotechnical", "actor-network", "laboratory", "expertise", "controversy", "standardization", "infrastructure", "scientific practice", "knowledge production"],
    providers: ["openalex", "crossref", "isidore", "philpapers", "core", "hal", "arxiv"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "How scientific facts and technical artifacts are constructed (SCOT, ANT)",
      "Co-production of science and social order",
      "Expertise, controversy and the politics of knowledge"
    ],
    costThreshold: 12.0
  },

  "epistemology": {
    id: "epistemology",
    name: "Dr. Simon Ashworth",
    title: "Epistemologist — Knowledge, Justification & Truth",
    institution: "University of St Andrews / Arché",
    domains: ["epistemology"],
    keywords: ["knowledge", "justification", "truth", "belief", "epistemic", "skepticism", "testimony", "disagreement", "evidence", "rationality", "epistemic injustice", "relativism", "certainty"],
    providers: ["philpapers", "isidore", "persee", "openalex", "crossref", "core", "hal"],
    publicationCadence: "monthly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Analysis of knowledge — Gettier, reliabilism, virtue epistemology",
      "Social epistemology: testimony, disagreement, epistemic injustice",
      "Epistemic norms in public reasoning and expertise"
    ],
    costThreshold: 10.0
  },

  "international-law": {
    id: "international-law",
    name: "Dr. Claudia Reyes",
    title: "International Law Analyst — Treaties, Courts & State Responsibility",
    institution: "Graduate Institute Geneva / International Law",
    domains: ["international-law"],
    keywords: ["international law", "treaty", "customary law", "ICJ", "ICC", "human rights law", "humanitarian law", "jus cogens", "state responsibility", "sovereignty", "sanctions", "law of the sea", "WTO law"],
    providers: ["openalex", "crossref", "isidore", "persee", "eur-lex", "overton", "un", "mega-eu", "core"],
    publicationCadence: "weekly",
    minQualityThreshold: 72,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Treaty interpretation and customary international law",
      "International courts, tribunals and enforcement gaps",
      "Sanctions, use of force and accountability mechanisms"
    ],
    costThreshold: 12.0
  },

  "conflict-studies": {
    id: "conflict-studies",
    name: "Dr. Tomas Lindberg",
    title: "Peace & Conflict Analyst — War Dynamics, Bargaining & Resolution",
    institution: "Uppsala University / Peace and Conflict Research",
    domains: ["conflict-studies"],
    keywords: ["conflict", "war", "civil war", "insurgency", "peacebuilding", "ceasefire", "mediation", "political violence", "terrorism", "rebellion", "peace process", "atrocity", "coups", "armed group"],
    providers: ["openalex", "crossref", "political-science", "isidore", "sipri", "ecfr", "swp", "mega-thinktanks", "global-think-tanks", "eventregistry"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Onset, duration and termination of armed conflict (bargaining model)",
      "Greed vs grievance, opportunity structures for rebellion",
      "Peace processes, mediation and post-conflict institutions"
    ],
    costThreshold: 12.0
  },

  "political-economy": {
    id: "political-economy",
    name: "Dr. Marisa Conti",
    title: "Political Economy Analyst — Capitalism, States & Distribution",
    institution: "LSE / Political Economy",
    domains: ["political-economy"],
    keywords: ["political economy", "capitalism", "varieties of capitalism", "distribution", "rent-seeking", "elite", "state capacity", "extraction", "globalization", "inequality", "growth model", "welfare state"],
    providers: ["openalex", "crossref", "sociology", "nber", "repec", "worldbank", "imf", "oecd", "bis", "core"],
    publicationCadence: "weekly",
    minQualityThreshold: 72,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Varieties of capitalism and growth-model analysis",
      "State-market relations, extraction and elite bargains",
      "Globalization, trade politics and distributional conflict"
    ],
    costThreshold: 12.0
  },

  "public-administration": {
    id: "public-administration",
    name: "Dr. Oliver Grant",
    title: "Public Administration Analyst — Bureaucracy, Governance & Delivery",
    institution: "Sciences Po / School of Public Affairs",
    domains: ["public-administration"],
    keywords: ["public administration", "bureaucracy", "civil service", "governance", "public sector", "policy implementation", "state capacity", "public management", "street-level", "regulation", "administrative burden"],
    providers: ["openalex", "crossref", "political-science", "isidore", "oecd", "worldbank", "overton", "mega-eu", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 68,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Bureaucratic behavior and street-level implementation",
      "New Public Management reforms and their pathologies",
      "State capacity, administrative burden and delivery"
    ],
    costThreshold: 10.0
  },

  "gender-studies": {
    id: "gender-studies",
    name: "Dr. Fatima Hassan",
    title: "Gender & Intersectionality Analyst",
    institution: "Rutgers / Department of Women's and Gender Studies",
    domains: ["gender-studies"],
    keywords: ["gender", "feminism", "intersectionality", "patriarchy", "care economy", "gender gap", "masculinity", "reproductive rights", "gender equality", "sexual division of labor", "representation"],
    providers: ["openalex", "crossref", "sociology", "isidore", "persee", "core", "doaj", "plos"],
    publicationCadence: "monthly",
    minQualityThreshold: 68,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Intersectionality — gender × race × class compounding",
      "Care economy, unpaid work and the sexual division of labor",
      "Gender gaps in representation, labor markets and institutions"
    ],
    costThreshold: 10.0
  },

  "area-studies": {
    id: "area-studies",
    name: "Dr. Zainab Al-Rashid",
    title: "Area Studies Analyst — Regional Deep Knowledge",
    institution: "SOAS University of London / Area Studies",
    domains: ["area-studies"],
    keywords: ["area studies", "regional studies", "middle east", "africa", "asia", "latin america", "postcolonial", "local knowledge", "regional politics", "language", "cultural context"],
    providers: ["openalex", "crossref", "history", "isidore", "persee", "ajol", "dialnet", "riss", "shodhganga"],
    publicationCadence: "monthly",
    minQualityThreshold: 68,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Regional political economy and cultural context",
      "Local-language sources and indigenous knowledge systems",
      "Postcolonial critique of universalist framings"
    ],
    costThreshold: 10.0
  },

  "labor-studies": {
    id: "labor-studies",
    name: "Dr. Henrik Johansson",
    title: "Labor & Work Analyst — Employment, Unions & Skills",
    institution: "University of Manchester / Work & Equalities Institute",
    domains: ["labor-studies"],
    keywords: ["labor market", "employment", "unemployment", "wages", "unions", "collective bargaining", "precarity", "gig economy", "skills", "automation", "working conditions", "industrial relations"],
    providers: ["openalex", "crossref", "sociology", "nber", "repec", "oecd", "worldbank", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 68,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Labor market segmentation and insider-outsider dynamics",
      "Union decline, collective bargaining and wage effects",
      "Automation, skills and task-content of work"
    ],
    costThreshold: 10.0
  },

  "ethics-of-technology": {
    id: "ethics-of-technology",
    name: "Dr. Rhea Kapoor",
    title: "Technology Ethics Analyst — AI, Platforms & Responsible Innovation",
    institution: "Oxford Internet Institute",
    domains: ["ethics-of-technology"],
    keywords: ["AI ethics", "algorithmic bias", "platform governance", "surveillance", "privacy", "autonomous systems", "dual-use", "responsible innovation", "value alignment", "digital rights", "data ethics"],
    providers: ["philpapers", "openalex", "crossref", "arxiv", "isidore", "hf-papers", "openreview"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Algorithmic fairness, accountability and transparency",
      "Value-sensitive design and responsible innovation",
      "Dual-use assessment and governance gaps"
    ],
    costThreshold: 12.0
  },

  "archaeology": {
    id: "archaeology",
    name: "Dr. Petros Andreadis",
    title: "Archaeology Analyst — Material Culture & Deep Time",
    institution: "UCL / Institute of Archaeology",
    domains: ["archaeology"],
    keywords: ["archaeology", "excavation", "material culture", "ancient", "prehistory", "artifact", "collapse", "civilization", "heritage", "dating", "settlement", "deep time"],
    providers: ["openalex", "crossref", "isidore", "persee", "hal", "core", "openaire", "zenodo"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Collapse and transformation of past societies (Tainter, Diamond-critique)",
      "Material culture as evidence for social structure",
      "Deep-time perspectives on contemporary challenges"
    ],
    costThreshold: 8.0
  },

  "neuroscience": {
    id: "neuroscience",
    name: "Dr. Lena Vogt",
    title: "Neuroscience Analyst — Brain, Mind & Behavior",
    institution: "Max Planck / Cognitive Neuroscience",
    domains: ["neuroscience"],
    keywords: ["neuroscience", "brain", "neural", "cognition", "consciousness", "fmri", "neuron", "cortex", "neuroimaging", "mental health", "neurological"],
    providers: ["pubmed", "europepmc", "biorxiv", "openalex", "semantic-scholar", "plos", "nih", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Brain-behavior claims and their evidential limits (reverse inference problem)",
      "Neurotechnology, BCIs and their societal implications",
      "Replication and methodology crises in neuroimaging"
    ],
    costThreshold: 10.0
  },

  "data-science": {
    id: "data-science",
    name: "Dr. Kenji Nakamura",
    title: "Data Science Analyst — ML Systems & Methodology",
    institution: "ETH Zurich / Data Science",
    domains: ["data-science"],
    keywords: ["data science", "machine learning", "model", "dataset", "benchmark", "algorithm", "prediction", "mlops", "feature", "training data", "statistical learning"],
    providers: ["dblp", "arxiv", "openreview", "semantic-scholar", "hf-papers", "papers-with-code", "openalex", "core"],
    publicationCadence: "weekly",
    minQualityThreshold: 65,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Benchmark validity and leaderboard-driven overclaiming",
      "Causal ML vs correlational prediction — what the model actually learned",
      "Data provenance, drift and deployment failure modes"
    ],
    costThreshold: 10.0
  },

  "economic-history": {
    id: "economic-history",
    name: "Dr. Ingrid Halvorsen",
    title: "Economic History Analyst — Growth, Institutions & Deep Time",
    institution: "LSE / Economic History",
    domains: ["economic-history"],
    keywords: ["economic history", "cliometrics", "great divergence", "industrial revolution", "historical growth", "persistence", "colonial legacy", "serfdom", "mercantilism", "gold standard", "depression"],
    providers: ["nber", "repec", "openalex", "crossref", "history", "persee", "core", "worldbank"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Historical roots of present-day development gaps",
      "Great Divergence and industrialization debates",
      "What past crises (gold standard, depressions) teach about current policy"
    ],
    costThreshold: 8.0
  },

  "social-psychology": {
    id: "social-psychology",
    name: "Dr. Naomi Berger",
    title: "Social Psychology Analyst — Groups, Identity & Influence",
    institution: "University of Amsterdam / Social Psychology",
    domains: ["social-psychology"],
    keywords: ["social psychology", "identity", "prejudice", "conformity", "group dynamics", "persuasion", "attitude", "polarization", "stereotype", "obedience", "intergroup"],
    providers: ["psychology", "openalex", "semantic-scholar", "crossref", "eric", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Polarization and intergroup conflict mechanisms",
      "Replication-crisis literacies — which classic findings survived",
      "Persuasion, propaganda and resistance to influence"
    ],
    costThreshold: 8.0
  },

  "organizational-studies": {
    id: "organizational-studies",
    name: "Dr. Marcus Thorne",
    title: "Organizational Studies Analyst — Bureaucracies & Institutions",
    institution: "Stanford / Organizational Behavior",
    domains: ["organizational-studies"],
    keywords: ["organization", "bureaucracy", "institutional theory", "management", "firm", "corporate culture", "organizational change", "governance structure", "decision-making", "hierarchy"],
    providers: ["openalex", "crossref", "sociology", "repec", "nber", "core", "mega-thinktanks"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Why organizations fail to adapt (isomorphism, inertia, garbage-can decisions)",
      "High-reliability organizing and failure forensics (Challenger, Deepwater)",
      "Institutional decay and reform feasibility"
    ],
    costThreshold: 8.0
  },

  "science-policy": {
    id: "science-policy",
    name: "Dr. Aurora Lindqvist",
    title: "Science Policy Analyst — Research Systems & Innovation",
    institution: "SPRU Sussex / Science Policy",
    domains: ["science-policy"],
    keywords: ["science policy", "research funding", "innovation policy", "r&d", "peer review", "research evaluation", "open science", "scientometrics", "university", "mission-oriented"],
    providers: ["global-science", "oecd", "openalex", "overton", "crossref", "core", "mega-thinktanks"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Research funding allocation and its distortions",
      "Metrics-driven science and evaluation gaming (Goodhart)",
      "Mission-oriented vs curiosity-driven research debates"
    ],
    costThreshold: 8.0
  },

  "development-studies": {
    id: "development-studies",
    name: "Dr. Amara Osei",
    title: "Development Studies Analyst — Poverty, Aid & Transformation",
    institution: "SOAS / Development Studies",
    domains: ["development-studies"],
    keywords: ["development", "poverty", "aid", "global south", "capability", "dependency", "inequality", "rct", "structural transformation", "informal economy", "decolonization"],
    providers: ["worldbank", "undp", "oecd", "openalex", "repec", "ajol", "dialnet", "core", "unctad"],
    publicationCadence: "weekly",
    minQualityThreshold: 65,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Aid effectiveness and the RCT-vs-structure debate",
      "Dependency, unequal exchange and post-development critiques",
      "Informal economies and what GDP misses in the global South"
    ],
    costThreshold: 10.0
  },

  "comparative-politics": {
    id: "comparative-politics",
    name: "Dr. Tomasz Wojcik",
    title: "Comparative Politics Analyst — Regimes & Institutions",
    institution: "Sciences Po / Comparative Politics",
    domains: ["comparative-politics"],
    keywords: ["regime", "democratization", "authoritarianism", "electoral system", "party system", "state capacity", "constitutional", "comparative politics", "presidentialism", "hybrid regime"],
    providers: ["political-science", "openalex", "crossref", "overton", "core", "mega-thinktanks", "gdelt-news"],
    publicationCadence: "weekly",
    minQualityThreshold: 65,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Democratic backsliding and authoritarian resilience",
      "Electoral and institutional design effects",
      "State capacity as the hidden variable in policy outcomes"
    ],
    costThreshold: 10.0
  },

  "social-theory": {
    id: "social-theory",
    name: "Dr. Camille Deschamps",
    title: "Social Theory Analyst — Power, Structure & Modernity",
    institution: "EHESS Paris / Social Theory",
    domains: ["social-theory"],
    keywords: ["social theory", "habitus", "field theory", "critical theory", "modernity", "power", "structuration", "capital", "agency", "social ontology", "bourdieu", "foucault"],
    providers: ["isidore", "persee", "sociology", "philpapers", "openalex", "hal", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Structure-agency dynamics in contemporary transformations",
      "Power beyond coercion — symbolic, epistemic, algorithmic",
      "Applying grand theory (Bourdieu, Foucault, Luhmann) to current events"
    ],
    costThreshold: 8.0
  },

  "philosophy-of-science": {
    id: "philosophy-of-science",
    name: "Dr. Elias Brandt",
    title: "Philosophy of Science Analyst — Evidence & Method",
    institution: "University of Pittsburgh / HPS",
    domains: ["philosophy-of-science"],
    keywords: ["philosophy of science", "epistemology of science", "falsification", "paradigm", "scientific realism", "methodology", "underdetermination", "replication", "evidence", "models"],
    providers: ["philpapers", "openalex", "crossref", "isidore", "core", "arxiv"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "What counts as evidence — and what a model can never tell you",
      "Replication crises through a HPS lens",
      "Scientific consensus: how it forms and when it fails"
    ],
    costThreshold: 8.0
  },

  "law-and-economics": {
    id: "law-and-economics",
    name: "Dr. Sofia Rinaldi",
    title: "Law & Economics Analyst — Rules, Incentives & Institutions",
    institution: "University of Chicago / Law & Economics",
    domains: ["law-and-economics"],
    keywords: ["law and economics", "transaction costs", "property rights", "liability", "regulation", "antitrust", "contract", "coase", "institutional economics", "legal origins", "tort"],
    providers: ["nber", "repec", "eur-lex", "openalex", "crossref", "core", "mega-thinktanks"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "How legal rules price behavior — incentives hidden in doctrine",
      "Antitrust and market power in the platform era",
      "Institutional design: when law creates markets vs when it distorts them"
    ],
    costThreshold: 8.0
  },

  "intelligence-studies": {
    id: "intelligence-studies",
    name: "Dr. James Callahan",
    title: "Intelligence Studies Analyst — Warning, Surprise & Statecraft",
    institution: "King's College London / War Studies",
    domains: ["intelligence-studies"],
    keywords: ["intelligence", "espionage", "surveillance", "warning", "strategic surprise", "covert action", "declassified", "threat assessment", "signals intelligence", "analysis tradecraft"],
    providers: ["cia-foia", "odni", "uk-jic", "global-intelligence", "nato", "sipri", "openalex", "crossref", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 70,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Intelligence failure forensics (Pearl Harbor, 9/11, Iraq WMD)",
      "Analytic tradecraft — ACH, structured techniques, politicization",
      "Declassified records as a corrective to official narratives"
    ],
    costThreshold: 10.0
  },

  "military-studies": {
    id: "military-studies",
    name: "Dr. Viktor Brandt",
    title: "Military Studies Analyst — Strategy, Deterrence & Warfare",
    institution: "King's College London / War Studies",
    domains: ["military-studies"],
    keywords: ["military", "warfare", "deterrence", "strategy", "defense", "armed forces", "war", "escalation", "operations", "logistics", "combat"],
    providers: ["sipri", "nato", "cia-foia", "odni", "uk-jic", "global-intelligence", "openalex", "crossref", "core"],
    publicationCadence: "weekly",
    minQualityThreshold: 70,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Deterrence credibility and escalation dynamics",
      "Warfare transformation — drones, precision, attrition economics",
      "Civil-military relations and defense-industrial capacity"
    ],
    costThreshold: 12.0
  },

  "futures-studies": {
    id: "futures-studies",
    name: "Dr. Yuki Tanaka-Delacroix",
    title: "Futures Studies Analyst — Scenarios & Foresight Method",
    institution: "UNESCO / Futures Literacy",
    domains: ["futures-studies"],
    keywords: ["foresight", "futures", "scenario", "horizon scanning", "weak signals", "wild cards", "long-term", "anticipation", "futures literacy", "trends"],
    providers: ["openalex", "crossref", "isidore", "core", "overton", "mega-thinktanks", "linkup"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["strategic"],
    focusAreas: [
      "Scenario method rigor — plausibility vs preference",
      "Weak-signal detection and wild-card integration",
      "Foresight evaluation — which methods actually predict better"
    ],
    costThreshold: 8.0
  },

  "economic-sociology": {
    id: "economic-sociology",
    name: "Dr. Helena Weiss",
    title: "Economic Sociology Analyst — Markets as Social Structures",
    institution: "MPIfG Cologne / Economic Sociology",
    domains: ["economic-sociology"],
    keywords: ["economic sociology", "embeddedness", "markets", "networks", "trust", "performativity", "moral economy", "commodification", "social capital", "gift economy"],
    providers: ["sociology", "openalex", "crossref", "repec", "nber", "core", "isidore"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Markets as social constructions — networks, trust, legitimacy",
      "Performativity — when economic models create the economy",
      "Commodification limits — what money cannot buy without corruption"
    ],
    costThreshold: 8.0
  },

  "historical-sociology": {
    id: "historical-sociology",
    name: "Dr. Robert Ashworth",
    title: "Historical Sociology Analyst — States, Revolutions & Longue Durée",
    institution: "Northwestern / Historical Sociology",
    domains: ["historical-sociology"],
    keywords: ["historical sociology", "state formation", "revolution", "social movements", "longue durée", "contentious politics", "empire", "modernity", "comparative history"],
    providers: ["sociology", "history", "openalex", "crossref", "isidore", "persee", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "State formation and decay — war-making as state-making",
      "Revolutionary processes — Skocpol's structural conditions",
      "Long-run patterns in contention and mobilization"
    ],
    costThreshold: 8.0
  },

  "environmental-economics": {
    id: "environmental-economics",
    name: "Dr. Greta Lindholm",
    title: "Environmental Economics Analyst — Pricing, Commons & Climate Policy",
    institution: "LSE / Environmental Economics",
    domains: ["environmental-economics"],
    keywords: ["carbon pricing", "externalities", "natural capital", "climate economics", "cap and trade", "carbon tax", "ecosystem services", "discount rate", "green transition", "emissions"],
    providers: ["openalex", "crossref", "repec", "nber", "oecd", "worldbank", "eea", "core"],
    publicationCadence: "weekly",
    minQualityThreshold: 65,
    maxBriefPerRun: 2,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Carbon pricing design and political feasibility",
      "Natural capital valuation — uses and abuses",
      "Discount-rate choices and intergenerational ethics"
    ],
    costThreshold: 10.0
  },

  "health-economics": {
    id: "health-economics",
    name: "Dr. Fatima Al-Rashid",
    title: "Health Economics Analyst — Systems, Pricing & Access",
    institution: "LSE / Health Policy",
    domains: ["health-economics"],
    keywords: ["health economics", "healthcare", "pharma", "health insurance", "qaly", "health system", "drug pricing", "medical costs", "universal coverage", "health policy"],
    providers: ["pubmed", "europepmc", "who-gho", "nih", "openalex", "repec", "nber", "oecd", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Health system design — insurance models and access tradeoffs",
      "Pharma pricing, patents and innovation incentives",
      "Cost-effectiveness logic and its ethical limits"
    ],
    costThreshold: 10.0
  },

  "legal-theory": {
    id: "legal-theory",
    name: "Dr. Anton Bergmann",
    title: "Legal Theory Analyst — Jurisprudence & Legal Reasoning",
    institution: "Oxford / Jurisprudence",
    domains: ["legal-theory"],
    keywords: ["jurisprudence", "legal theory", "positivism", "natural law", "legal realism", "constitutional theory", "rule of law", "legal interpretation", "hohfeld", "normativity"],
    providers: ["philpapers", "openalex", "crossref", "eur-lex", "core", "isidore"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "What law is — positivism vs natural law vs interpretivism in live cases",
      "Rule of law erosion — formal vs substantive standards",
      "Legal reasoning under uncertainty — interpretation as politics"
    ],
    costThreshold: 8.0
  },

  "postcolonial-studies": {
    id: "postcolonial-studies",
    name: "Dr. Leila Haddad",
    title: "Postcolonial Studies Analyst — Empire, Coloniality & Representation",
    institution: "SOAS / Postcolonial Studies",
    domains: ["postcolonial-studies"],
    keywords: ["postcolonial", "colonialism", "decolonization", "orientalism", "subaltern", "empire", "coloniality", "imperialism", "race", "representation"],
    providers: ["isidore", "persee", "openalex", "crossref", "sociology", "ajol", "dialnet", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "Coloniality persisting after empire — power without formal rule",
      "Representation politics — who speaks for whom in global discourse",
      "Decolonization of knowledge and institutions"
    ],
    costThreshold: 8.0
  },

  "communication-studies": {
    id: "communication-studies",
    name: "Dr. Paul Verhoeven",
    title: "Communication Studies Analyst — Media, Propaganda & Public Sphere",
    institution: "University of Amsterdam / Media Studies",
    domains: ["communication-studies"],
    keywords: ["media", "propaganda", "public sphere", "framing", "agenda-setting", "journalism", "misinformation", "platform", "communication", "broadcasting"],
    providers: ["openalex", "crossref", "sociology", "isidore", "core", "gdelt-news", "linkup"],
    publicationCadence: "weekly",
    minQualityThreshold: 65,
    maxBriefPerRun: 2,
    preferredFormats: ["brief"],
    focusAreas: [
      "Propaganda models in the platform era",
      "Agenda-setting and framing effects on public opinion",
      "Public sphere fragmentation and its democratic costs"
    ],
    costThreshold: 8.0
  },

  "public-finance": {
    id: "public-finance",
    name: "Dr. Catherine Moreau",
    title: "Public Finance Analyst — Taxation, Debt & Fiscal Federalism",
    institution: "Paris School of Economics",
    domains: ["public-finance"],
    keywords: ["taxation", "fiscal policy", "public debt", "budget", "tax incidence", "fiscal federalism", "austerity", "public spending", "optimal tax", "fiscal rules"],
    providers: ["nber", "repec", "oecd", "worldbank", "imf", "openalex", "crossref", "core", "insee", "eurostat"],
    publicationCadence: "weekly",
    minQualityThreshold: 65,
    maxBriefPerRun: 2,
    preferredFormats: ["brief"],
    focusAreas: [
      "Tax incidence — who really pays",
      "Debt sustainability thresholds and fiscal rules",
      "Fiscal federalism — who taxes, who spends, who is accountable"
    ],
    costThreshold: 10.0
  },

  "political-anthropology": {
    id: "political-anthropology",
    name: "Dr. David Graeber-Lindt",
    title: "Political Anthropology Analyst — State, Resistance & Everyday Politics",
    institution: "LSE / Anthropology",
    domains: ["political-anthropology"],
    keywords: ["political anthropology", "state formation", "resistance", "anarchism", "indigenous politics", "everyday politics", "zomia", "statelessness", "power", "legibility"],
    providers: ["isidore", "persee", "openalex", "crossref", "sociology", "ajol", "core"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief"],
    focusAreas: [
      "How states see — legibility, simplification and their failures",
      "Everyday resistance and non-compliance as politics",
      "Non-state political orders — past and present"
    ],
    costThreshold: 8.0
  },

  "food-systems": {
    id: "food-systems",
    name: "Dr. Amina Diallo",
    title: "Food Systems Analyst — Agriculture, Hunger & Agri-food Power",
    institution: "Wageningen / Agrifood Systems",
    domains: ["food-systems"],
    keywords: ["food", "agriculture", "hunger", "famine", "food security", "agri-food", "farming", "nutrition", "food sovereignty", "supply chain", "land use"],
    providers: ["fao", "worldbank", "openalex", "crossref", "oecd", "unctad", "ajol", "core", "gdelt-news"],
    publicationCadence: "monthly",
    minQualityThreshold: 65,
    maxBriefPerRun: 1,
    preferredFormats: ["brief", "strategic"],
    focusAreas: [
      "Food regimes and the political economy of hunger",
      "Famine is political — Sen's entitlement approach applied",
      "Agri-food corporate power and supply chain fragility"
    ],
    costThreshold: 10.0
  },
};

// ============================================================================
// VERTICAL ↔ RESEARCHER MAPPING — Links DB verticals to researcher domains
// ============================================================================

export const VERTICAL_RESEARCHER_MAP: Record<string, DomainExpertise[]> = {
  "climate-energy":          ["environment", "energy-advanced", "environmental-economics"],
  "macro-finance":           ["economics", "finance", "risk-analysis", "political-economy", "economic-history", "law-and-economics", "public-finance", "economic-sociology"],
  "geopolitics":             ["geopolitics", "security", "international-relations", "conflict-studies", "international-law", "area-studies", "intelligence-studies", "comparative-politics", "military-studies"],
  "tech-innovation":         ["technology", "digital-society", "computational-social-science", "media-studies", "science-technology-studies", "ethics-of-technology", "data-science", "science-policy", "communication-studies", "futures-studies"],
  "social-policy":           ["policy", "social-sciences", "behavioral-economics", "sociology", "demography", "education", "political-science", "migration-studies", "gender-studies", "public-administration", "labor-studies", "social-psychology", "organizational-studies", "social-theory", "public-finance", "communication-studies"],
  "health-bioethics":        ["health", "bioethics", "epidemiology", "public-health", "neuroscience", "health-economics"],
  "law-regulation":          ["law", "criminology", "international-law", "law-and-economics", "legal-theory"],
  "cognitive-behavioral":    ["cognitive-science", "behavioral-economics", "psychology", "neuroscience", "social-psychology"],
  "development-global":      ["development-economics", "urban-studies", "migration-studies", "development-studies", "postcolonial-studies", "food-systems"],
  "complexity-quantitative": ["complexity-science", "quantitative", "risk-analysis", "data-science", "futures-studies"],
  "humanities-ethics":       ["humanities", "philosophy", "epistemology", "linguistics", "anthropology", "history", "religious-studies", "non-western-philosophy", "archaeology", "economic-history", "philosophy-of-science", "social-theory", "historical-sociology", "political-anthropology", "postcolonial-studies", "legal-theory", "economic-sociology"],
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
      maxTokens: 1500,
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
