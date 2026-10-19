/**
 * NomosX RESEARCHER KNOWLEDGE BASE SYSTEM
 * 
 * Each PhD researcher has:
 * 1. A dedicated knowledge base (key concepts, frameworks, reference papers)
 * 2. Domain-specific tools (APIs they can query directly)
 * 3. Private memory (past analyses, predictions, lessons learned)
 * 4. Methodology preferences (how they approach research)
 * 
 * This replaces the shallow "system prompt only" approach with
 * true specialization — like giving each researcher their own library.
 * 
 * Architecture pattern: RAG-lite
 * - Static KB loaded from structured files (no vector DB needed for v1)
 * - Dynamic memory from AgentMemory + ResearcherIdentity (already exists)
 * - Tool access via typed functions per domain
 */

import { DomainExpertise } from '../types';
export type { DomainExpertise };
import { RESEARCHER_REGISTRY } from '../researcher-ownership';

// ============================================================================
// TYPES
// ============================================================================

export interface ResearcherKB {
  /** Domain identifier */
  domain: DomainExpertise;
  /** Researcher name */
  researcherName: string;
  /** Key concepts this researcher must know */
  keyConcepts: KeyConcept[];
  /** Analytical frameworks used by this researcher */
  frameworks: AnalyticalFramework[];
  /** Reference papers/studies this researcher should cite */
  referencePapers: ReferencePaper[];
  /** Domain-specific data sources this researcher can query */
  dataSources: DataSource[];
  /** Methodological preferences */
  methodology: MethodologyProfile;
  /** Quality criteria specific to this domain */
  qualityCriteria: QualityCriteria;
  /** Current standing research questions */
  standingQuestions: string[];
  /** Known biases to watch for in this domain */
  knownBiases: string[];
}

export interface KeyConcept {
  name: string;
  definition: string;
  importance?: 'foundational' | 'advanced' | 'emerging';
  relatedConcepts?: string[];
}

export interface AnalyticalFramework {
  name: string;
  description: string;
  whenToUse: string;
  steps?: string[];
}

export interface ReferencePaper {
  title: string;
  authors: string | string[];
  year: number;
  journal?: string;
  significance?: string;
  doi?: string;
  /** Phase 4 alias for significance */
  keyInsight?: string;
}

export interface DataSource {
  name: string;
  type: 'api' | 'database' | 'feed' | 'manual' | 'dataset' | 'research' | 'tool' | 'journal' | 'reference' | 'report';
  description?: string;
  /** API endpoint or URL */
  endpoint?: string;
  /** URL alias for endpoint (Phase 4) */
  url?: string;
  /** Whether this source requires an API key */
  requiresKey?: boolean;
  /** Environment variable for the API key */
  keyEnvVar?: string;
  /** What kind of data this provides */
  dataType?: string;
  /** Coverage description (Phase 4) */
  coverage?: string;
}

export interface MethodologyProfile {
  /** Primary research approach — accepts free-form string for Phase 4 entries */
  approach: string;
  /** Preferred evidence hierarchy */
  evidenceHierarchy: string[];
  /** Statistical methods used */
  statisticalMethods?: string[];
  /** How to handle uncertainty */
  uncertaintyApproach: string;
  /** Minimum evidence standards */
  minimumEvidence: string;
}

export interface QualityCriteria {
  /** Minimum number of sources */
  minSources: number;
  /** Minimum source quality score */
  minQuality: number;
  /** Required evidence level (1-5, Oxford CEBM) — optional for Phase 4 entries */
  minEvidenceLevel?: number;
  /** Whether peer review is required */
  requirePeerReview: boolean;
  /** Acceptable source age (years) */
  maxSourceAge: number;
  /** Special requirements */
  specialRequirements: string[];
}

// ============================================================================
// KNOWLEDGE BASES — One per researcher
// ============================================================================

export const RESEARCHER_KBS: Partial<Record<DomainExpertise, ResearcherKB>> = {
  policy: {
    domain: 'policy',
    researcherName: 'Dr. Eunomia (Εὐνομία)',
    keyConcepts: [
      { name: 'Policy Cycle', definition: 'Agenda setting → Formulation → Adoption → Implementation → Evaluation — each stage has different actors, incentives, and failure modes', importance: 'foundational', relatedConcepts: ['policy window', 'incrementalism', 'punctuated equilibrium'] },
      { name: 'Institutional Design', definition: 'How rules, norms, and enforcement mechanisms shape collective outcomes — Ostrom\'s 8 design principles', importance: 'foundational', relatedConcepts: ['common pool resources', 'polycentric governance', 'institutional fit'] },
      { name: 'Regulatory Capture', definition: 'When regulatory agencies serve the interests of the industries they regulate rather than the public interest', importance: 'advanced', relatedConcepts: ['revolving door', 'rent-seeking', 'information asymmetry'] },
      { name: 'Evidence-Based Policy', definition: 'Using rigorous research evidence to inform policy decisions — what works initiatives, systematic reviews, RCTs in governance', importance: 'emerging', relatedConcepts: ['policy labs', 'behavioral insights', 'randomized evaluation'] },
    ],
    frameworks: [
      { name: 'Stakeholder Mapping', description: 'Identify who wins, who loses, who has veto power, and who can form coalitions', whenToUse: 'Any policy reform analysis', steps: ['Identify stakeholders', 'Map interests and power', 'Assess coalitions', 'Predict veto points'] },
      { name: 'Implementation Analysis', description: 'Assess political, administrative, fiscal, and legal feasibility of proposed reforms', whenToUse: 'Evaluating policy proposals', steps: ['Political feasibility', 'Administrative capacity', 'Fiscal cost', 'Legal authority', 'Timeline assessment'] },
      { name: 'Comparative Policy Analysis', description: 'Compare how different countries/jurisdictions address the same policy problem', whenToUse: 'Learning from international experience', steps: ['Select comparators', 'Map institutional differences', 'Assess transferability', 'Identify adaptation needs'] },
    ],
    referencePapers: [
      { title: 'Governing the Commons', authors: 'Elinor Ostrom', year: 1990, journal: 'Cambridge University Press', significance: 'Nobel-winning framework for institutional analysis of collective action' },
      { title: 'Agendas, Alternatives, and Public Policies', authors: 'John Kingdon', year: 1984, journal: 'Longman', significance: 'Definitive model of policy agenda setting (multiple streams)' },
      { title: 'Theories of the Policy Process', authors: 'Paul Sabatier', year: 2007, journal: 'Westview Press', significance: 'Comprehensive review of policy process theories (advocacy coalition, punctuated equilibrium, etc.)' },
      { title: 'The Tools of Government in the Modern State', authors: 'Christopher Hood', year: 1983, journal: 'Macmillan', significance: 'Foundational taxonomy of policy instruments (nodality, authority, treasure, organization)' },
      { title: 'Politics in Time: History, Institutions, and Political Analysis', authors: 'Paul Pierson', year: 2004, journal: 'Princeton University Press', significance: 'Path dependence and historical institutionalism in policy analysis' },
      { title: 'Regulatory Legitimacy: A Study of the National Health Service', authors: 'Giandomenico Majone', year: 1996, journal: 'Oxford University Press', significance: 'Foundational work on the regulatory state and delegation to independent agencies' },
      { title: 'Studying Public Policy: Policy Cycles and Policy Subsystems', authors: 'Michael Howlett et al.', year: 2009, journal: 'Oxford University Press', significance: 'Standard textbook integrating multiple policy process frameworks' },
      { title: 'Nudge: Improving Decisions About Health, Wealth, and Happiness', authors: 'Thaler & Sunstein', year: 2008, journal: 'Yale University Press', significance: 'Foundational work on behavioral public policy and choice architecture' },
      { title: 'The Art and Craft of Policy Analysis', authors: 'Aaron Wildavsky', year: 1979, journal: 'Macmillan', significance: 'Canonical policy analysis text — puzzling vs powering, incrementalism' },
      { title: 'Politics: Who Gets What, When, How', authors: 'Harold Lasswell', year: 1936, journal: 'McGraw-Hill', significance: 'Foundational definition of politics and policy as resource allocation' },
      { title: 'A Primer for Policy Analysis', authors: 'Stokey & Zeckhauser', year: 1978, journal: 'W.W. Norton', significance: 'Foundational textbook on rational policy analysis and cost-benefit framework' },
    ],
    dataSources: [
      { name: 'OECD STIP Compass', type: 'api', description: 'Science, Technology and Innovation Policy database — 6000+ policy initiatives', endpoint: 'https://stip.oecd.org/api', requiresKey: false, dataType: 'policy initiatives' },
      { name: 'World Bank Governance Indicators', type: 'api', description: 'Voice, accountability, stability, effectiveness, rule of law, corruption for 200+ countries', endpoint: 'https://api.worldbank.org/v2', requiresKey: false, dataType: 'governance indicators' },
      { name: 'Federal Register', type: 'api', description: 'US federal regulations and proposed rules', endpoint: 'https://www.federalregister.gov/api/v1', requiresKey: false, dataType: 'US regulations' },
    ],
    methodology: {
      approach: 'qualitative',
      evidenceHierarchy: ['Systematic policy evaluation (with counterfactual)', 'Multi-country comparative study', 'Single-country case study with process tracing', 'Expert elicitation', 'Stakeholder interviews'],
      statisticalMethods: ['Process tracing', 'Qualitative Comparative Analysis (QCA)', 'Difference-in-Differences for policy evaluation', 'Synthetic control for policy impact'],
      uncertaintyApproach: 'Distinguish between normative claims (what should be) and positive claims (what is). Flag when institutional context limits transferability.',
      minimumEvidence: 'At least one well-documented policy case with implementation data',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 70,
      minEvidenceLevel: 3,
      requirePeerReview: false,
      maxSourceAge: 8,
      specialRequirements: ['Must assess implementation feasibility', 'Must identify veto points and political constraints'],
    },
    standingQuestions: [
      'How are governments adapting regulatory frameworks for emerging technologies?',
      'What institutional designs best handle cross-border policy challenges?',
      'How effective are evidence-based policy initiatives across different governance contexts?',
    ],
    knownBiases: [
      'WEIRD institutional bias (analyzing all governance through Western democratic lens)',
      'Success bias in comparative policy (we study policies that "worked", not failures)',
      'Technocratic bias (ignoring political economy constraints)',
      'Status quo bias in institutional analysis',
    ],
  },

  economics: {
    domain: 'economics',
    researcherName: 'Dr. Ploutos (Πλοῦτος)',
    keyConcepts: [
      { name: 'Causal Inference', definition: 'Methods to establish cause-effect from observational data (IV, DiD, RDD, synthetic control)', importance: 'foundational', relatedConcepts: ['endogeneity', 'selection bias', 'natural experiments'] },
      { name: 'General Equilibrium', definition: 'Economy-wide effects that partial models miss — spillovers, feedback loops, second-order effects', importance: 'foundational', relatedConcepts: ['partial equilibrium', 'DSGE', 'CGE models'] },
      { name: 'Monetary Transmission', definition: 'How central bank actions affect real economy through interest rates, credit, expectations, exchange rates', importance: 'advanced', relatedConcepts: ['zero lower bound', 'quantitative easing', 'forward guidance'] },
      { name: 'Fiscal Multipliers', definition: 'GDP impact per dollar of government spending — varies by context (recession vs boom, open vs closed economy)', importance: 'advanced', relatedConcepts: ['automatic stabilizers', 'crowding out', 'Ricardian equivalence'] },
    ],
    frameworks: [
      { name: 'Tinbergen Rule', description: 'One instrument per policy target', whenToUse: 'Evaluating policy packages', steps: ['Identify targets', 'Count instruments', 'Check independence', 'Assess assignment'] },
      { name: 'Cost-Benefit Analysis', description: 'Systematic comparison of costs and benefits with discounting', whenToUse: 'Policy evaluation', steps: ['Identify effects', 'Monetize', 'Discount', 'Sensitivity analysis'] },
    ],
    referencePapers: [
      { title: 'Mostly Harmless Econometrics', authors: 'Angrist & Pischke', year: 2009, journal: 'Princeton University Press', significance: 'Gold standard for causal inference methods' },
      { title: 'The Fiscal Multiplier in Small Open Economies', authors: 'Ilzetzki, Mendoza & Végh', year: 2013, journal: 'Journal of Monetary Economics', significance: 'Definitive evidence on fiscal multiplier heterogeneity' },
      { title: 'Why Nations Fail: The Origins of Power, Prosperity, and Poverty', authors: 'Acemoglu & Robinson', year: 2012, journal: 'Crown Publishing', significance: 'Institutional foundations of economic outcomes — extractive vs inclusive institutions' },
      { title: 'The General Theory of Employment, Interest and Money', authors: 'John Maynard Keynes', year: 1936, journal: 'Macmillan', significance: 'Foundational macroeconomics — aggregate demand, liquidity trap, fiscal policy' },
      { title: 'Capital in the Twenty-First Century', authors: 'Thomas Piketty', year: 2014, journal: 'Harvard University Press', significance: 'Definitive work on wealth inequality dynamics (r > g)' },
      { title: 'One Economics, Many Recipes: Globalization, Institutions, and Economic Growth', authors: 'Dani Rodrik', year: 2007, journal: 'Princeton University Press', significance: 'Institutional diversity and context-specific growth strategies' },
      { title: 'This Time Is Different: Eight Centuries of Financial Folly', authors: 'Reinhart & Rogoff', year: 2009, journal: 'Princeton University Press', significance: 'Definitive history of financial crises and sovereign defaults' },
      { title: 'The Great Convergence', authors: 'Richard Baldwin', year: 2016, journal: 'Harvard University Press', significance: 'Globalization second unbundling and supply chain trade' },
      { title: 'A Contribution to the Theory of Economic Growth', authors: 'Robert Solow', year: 1956, journal: 'Quarterly Journal of Economics', significance: 'Nobel-winning neoclassical growth model — foundational for all modern growth theory' },
      { title: 'The Problem of Social Cost', authors: 'Ronald Coase', year: 1960, journal: 'Journal of Law and Economics', significance: 'Nobel-winning work on externalities, transaction costs, and property rights — Coase theorem' },
    ],
    dataSources: [
      { name: 'FRED', type: 'api', description: 'Federal Reserve Economic Data — 800K+ time series', endpoint: 'https://api.stlouisfed.org/fred', requiresKey: true, keyEnvVar: 'FRED_API_KEY', dataType: 'economic indicators' },
      { name: 'World Bank Open Data', type: 'api', description: 'Development indicators for 200+ countries', endpoint: 'https://api.worldbank.org/v2', requiresKey: false, dataType: 'development indicators' },
      { name: 'ECB Statistical Data Warehouse', type: 'api', description: 'Euro area monetary and financial statistics', endpoint: 'https://data-api.ecb.europa.eu/service/data', requiresKey: false, dataType: 'monetary statistics' },
    ],
    methodology: {
      approach: 'quantitative',
      evidenceHierarchy: ['RCT / Natural experiment', 'Instrumental Variables', 'Difference-in-Differences', 'Regression Discontinuity', 'Panel data with fixed effects', 'Cross-sectional OLS'],
      statisticalMethods: ['IV regression', 'DiD', 'RDD', 'Synthetic control', 'Panel FE/RE', 'GMM'],
      uncertaintyApproach: 'Always report confidence intervals. Distinguish economic from statistical significance. Run sensitivity analyses.',
      minimumEvidence: 'At least one study with credible identification strategy',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 70,
      minEvidenceLevel: 3,
      requirePeerReview: true,
      maxSourceAge: 10,
      specialRequirements: ['Must assess identification strategy', 'Must check for endogeneity'],
    },
    standingQuestions: [
      'What is the current state of fiscal vs monetary policy effectiveness?',
      'How are supply chain disruptions affecting trade patterns?',
      'What are the distributional effects of current inflation?',
    ],
    knownBiases: [
      'Publication bias toward statistically significant results',
      'Endogeneity in cross-country growth regressions',
      'File drawer problem in RCT literature',
      'WEIRD sample bias in behavioral economics',
    ],
  },

  technology: {
    domain: 'technology',
    researcherName: 'Dr. Hephaestus (Ἥφαιστος)',
    keyConcepts: [
      { name: 'Scaling Laws', definition: 'Predictable performance improvement with more data/compute/parameters (Chinchilla, Kaplan)', importance: 'foundational', relatedConcepts: ['compute-optimal training', 'emergent abilities', 'bitter lesson'] },
      { name: 'AI Alignment', definition: 'Ensuring AI systems pursue intended goals — RLHF, constitutional AI, interpretability', importance: 'foundational', relatedConcepts: ['reward hacking', 'mesa-optimization', 'corrigibility'] },
      { name: 'Benchmark Saturation', definition: 'When SOTA approaches human performance, benchmarks lose discriminative power', importance: 'advanced', relatedConcepts: ['benchmark gaming', 'data contamination', 'evaluation crisis'] },
      { name: 'Dual Use', definition: 'Technology that has both civilian and military applications — requires governance frameworks', importance: 'emerging', relatedConcepts: ['export controls', 'responsible disclosure', 'compute governance'] },
    ],
    frameworks: [
      { name: 'Technology Readiness Level (TRL)', description: 'NASA/EU scale 1-9 for technology maturity', whenToUse: 'Assessing deployment readiness', steps: ['Identify TRL', 'Assess gaps to next level', 'Estimate timeline', 'Identify blockers'] },
      { name: 'Responsible AI Assessment', description: 'Evaluate AI systems for fairness, transparency, accountability', whenToUse: 'Any AI deployment analysis', steps: ['Identify stakeholders', 'Assess bias', 'Check transparency', 'Evaluate accountability', 'Consider dual use'] },
    ],
    referencePapers: [
      { title: 'Scaling Data-Constrained Language Models', authors: 'Muennighoff et al.', year: 2024, journal: 'NeurIPS', significance: 'Definitive scaling laws for LLMs with data constraints' },
      { title: 'Sparks of AGI', authors: 'Bubeck et al.', year: 2023, journal: 'Microsoft Research', significance: 'Controversial but influential early GPT-4 capability assessment' },
      { title: 'A Mathematical Theory of Communication', authors: 'Claude Shannon', year: 1948, journal: 'Bell System Technical Journal', significance: 'Foundational information theory — entropy, channel capacity, coding theorems' },
      { title: 'Computing Machinery and Intelligence', authors: 'Alan Turing', year: 1950, journal: 'Mind', significance: 'Foundational paper on AI — the Turing Test and machine intelligence criteria' },
      { title: 'Artificial Intelligence: A Modern Approach', authors: 'Russell & Norvig', year: 2020, journal: 'Pearson', significance: 'Definitive AI textbook — rational agent framework, search, learning, reasoning' },
      { title: 'Power and Progress: Our Thousand-Year Struggle Over Technology and Prosperity', authors: 'Acemoglu & Johnson', year: 2023, journal: 'PublicAffairs', significance: 'How technology choices shape inequality — directed technical change' },
      { title: 'The Second Machine Age: Work, Progress, and Prosperity in a Time of Brilliant Technologies', authors: 'Brynjolfsson & McAfee', year: 2014, journal: 'W.W. Norton', significance: 'Definitive work on digital transformation and economic impact of AI/automation' },
      { title: 'Superintelligence: Paths, Dangers, Strategies', authors: 'Nick Bostrom', year: 2014, journal: 'Oxford University Press', significance: 'Foundational work on AI existential risk and alignment' },
      { title: 'The Sciences of the Artificial', authors: 'Herbert Simon', year: 1969, journal: 'MIT Press', significance: 'Nobel laureate — foundational theory of design, bounded rationality, and artificial systems' },
      { title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: 2017, journal: 'NeurIPS', significance: 'The Transformer architecture paper — foundation of all modern LLMs (GPT, Claude, Gemini)' },
      { title: 'Reinforcement Learning: An Introduction', authors: 'Sutton & Barto', year: 2018, journal: 'MIT Press', significance: 'Definitive textbook on RL — Markov decision processes, TD learning, policy gradient' },
    ],
    dataSources: [
      { name: 'Papers With Code', type: 'api', description: 'ML benchmarks, SOTA results, code repositories', endpoint: 'https://paperswithcode.com/api/v1', requiresKey: false, dataType: 'ML benchmarks and SOTA' },
      { name: 'arXiv', type: 'feed', description: 'Preprint server — cs.AI, cs.LG, cs.CL categories', endpoint: 'https://export.arxiv.org/api/query', requiresKey: false, dataType: 'preprints' },
      { name: 'Epoch AI', type: 'api', description: 'Compute trends, training costs, model capabilities tracking', endpoint: 'https://epochai.org/data', requiresKey: false, dataType: 'AI compute trends' },
    ],
    methodology: {
      approach: 'mixed',
      evidenceHierarchy: ['Reproduced results with code', 'Peer-reviewed with ablation studies', 'Preprint with benchmarks', 'Technical report', 'Blog post with evidence'],
      statisticalMethods: ['Ablation studies', 'Scaling law regression', 'A/B testing', 'Statistical significance testing'],
      uncertaintyApproach: 'Distinguish between incremental and transformative advances. Flag benchmark gaming. Check for data contamination.',
      minimumEvidence: 'Reproducible results on standard benchmarks, or clear theoretical contribution',
    },
    qualityCriteria: {
      minSources: 4,
      minQuality: 65,
      minEvidenceLevel: 3,
      requirePeerReview: false, // Preprints accepted in fast-moving AI
      maxSourceAge: 3, // AI moves fast
      specialRequirements: ['Must check reproducibility', 'Must assess benchmark validity'],
    },
    standingQuestions: [
      'What are the latest developments in AI safety and alignment?',
      'How are scaling laws evolving with new architectures?',
      'What governance frameworks are emerging for frontier AI?',
    ],
    knownBiases: [
      'Hype cycle amplification in AI research',
      'Cherry-picked benchmark results',
      'Corporate PR masquerading as research',
      'Survivorship bias in startup success stories',
    ],
  },

  health: {
    domain: 'health',
    researcherName: 'Dr. Hygeia (Ὑγίεια)',
    keyConcepts: [
      { name: 'Bradford Hill Criteria', definition: '9 criteria for causal inference in epidemiology: strength, consistency, specificity, temporality, gradient, plausibility, coherence, experiment, analogy', importance: 'foundational', relatedConcepts: ['causation vs correlation', 'confounding', 'effect modification'] },
      { name: 'Number Needed to Treat (NNT)', definition: 'Number of patients needed to treat to prevent one adverse outcome — converts relative risk to clinical significance', importance: 'foundational', relatedConcepts: ['absolute risk reduction', 'relative risk', 'clinical significance'] },
      { name: 'Antimicrobial Resistance', definition: 'Global health threat where bacteria evolve resistance to antibiotics — WHO priority pathogen list', importance: 'emerging', relatedConcepts: ['AMR surveillance', 'antibiotic stewardship', 'one health'] },
    ],
    frameworks: [
      { name: 'GRADE Framework', description: 'Grading of Recommendations, Assessment, Development and Evaluations', whenToUse: 'Systematic evidence assessment', steps: ['Rate study quality', 'Assess consistency', 'Check directness', 'Evaluate precision', 'Assess publication bias'] },
      { name: 'PRISMA', description: 'Preferred Reporting Items for Systematic Reviews', whenToUse: 'Evaluating systematic reviews', steps: ['Check search strategy', 'Assess inclusion criteria', 'Evaluate risk of bias', 'Check meta-analysis methods'] },
    ],
    referencePapers: [
      { title: 'Global Burden of Disease Study', authors: 'GBD Collaborators', year: 2024, journal: 'The Lancet', significance: 'Definitive reference for global disease burden and trends' },
      { title: 'Evidence-Based Medicine: How to Practice and Teach EBM', authors: 'Sackett et al.', year: 2000, journal: 'Churchill Livingstone', significance: 'Foundational textbook of evidence-based medicine — hierarchy of evidence' },
      { title: 'Cochrane Handbook for Systematic Reviews of Interventions', authors: 'Higgins & Green', year: 2011, journal: 'Cochrane Collaboration', significance: 'Gold standard methodology for systematic reviews and meta-analysis' },
      { title: 'The Environment and Disease: Association or Causation?', authors: 'Austin Bradford Hill', year: 1965, journal: 'Proceedings of the Royal Society of Medicine', significance: 'Original Bradford Hill criteria for causal inference in epidemiology' },
      { title: 'Global Health 101', authors: 'Richard Skolnik', year: 2016, journal: 'Jones & Bartlett', significance: 'Standard textbook on global health systems, financing, and burden of disease' },
      { title: 'The Lancet Commission on Pollution and Health', authors: 'Landrigan et al.', year: 2017, journal: 'The Lancet', significance: 'Definitive assessment of pollution health impact — 9M deaths/year globally' },
      { title: 'Disease Control Priorities (3rd Edition)', authors: 'DCP3 Editors', year: 2018, journal: 'World Bank', significance: 'Definitive cost-effectiveness analysis of health interventions in LMICs' },
      { title: 'Modern Epidemiology', authors: 'Rothman, Greenland & Lash', year: 2008, journal: 'Lippincott Williams & Wilkins', significance: 'Definitive graduate-level epidemiology textbook — study design, confounding, interaction' },
      { title: 'Uses of Epidemiology', authors: 'John Morris', year: 1957, journal: 'Little Brown', significance: 'Foundational text defining epidemiology applications beyond infectious disease' },
    ],
    dataSources: [
      { name: 'PubMed', type: 'api', description: '36M+ biomedical citations', endpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils', requiresKey: false, dataType: 'biomedical literature' },
      { name: 'WHO Disease Outbreak News', type: 'feed', description: 'Real-time disease outbreak alerts', endpoint: 'https://www.who.int/feeds/entity/don/en/rss.xml', requiresKey: false, dataType: 'outbreak alerts' },
      { name: 'Our World in Data', type: 'api', description: 'Global health and development statistics', endpoint: 'https://owid.cloud/admin/api', requiresKey: false, dataType: 'health statistics' },
    ],
    methodology: {
      approach: 'quantitative',
      evidenceHierarchy: ['Systematic review/meta-analysis', 'RCT', 'Cohort study', 'Case-control', 'Cross-sectional', 'Expert opinion'],
      statisticalMethods: ['Meta-analysis', 'Cox regression', 'Kaplan-Meier', 'Logistic regression', 'Poisson regression'],
      uncertaintyApproach: 'Report absolute AND relative risk. Always compute NNT. Assess clinical vs statistical significance separately.',
      minimumEvidence: 'At least one well-designed cohort study or RCT',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 75,
      minEvidenceLevel: 2,
      requirePeerReview: true,
      maxSourceAge: 5,
      specialRequirements: ['Must check CONSORT/STROBE compliance', 'Must assess publication bias'],
    },
    standingQuestions: [
      'What are the latest developments in pandemic preparedness?',
      'How is antimicrobial resistance evolving globally?',
      'What are the most promising mRNA therapeutic applications beyond COVID?',
    ],
    knownBiases: [
      'Publication bias toward positive results in clinical trials',
      'Industry funding bias in pharmaceutical research',
      'Healthy user bias in observational studies',
      'Ecological fallacy in country-level comparisons',
    ],
  },

  security: {
    domain: 'security',
    researcherName: 'Dr. Athena (Ἀθηνᾶ)',
    keyConcepts: [
      { name: 'Escalation Dynamics', definition: 'How conflicts escalate through action-reaction cycles, miscalculation, and commitment traps', importance: 'foundational', relatedConcepts: ['deterrence', 'brinkmanship', 'security dilemma'] },
      { name: 'Hybrid Warfare', definition: 'Blend of conventional military, cyber, information operations, and economic pressure below threshold of conventional war', importance: 'advanced', relatedConcepts: ['gray zone', 'information warfare', 'proxy conflict'] },
      { name: 'Intelligence Analysis', definition: 'Structured analytic techniques: ACH, key assumptions check, red team, pre-mortem', importance: 'foundational', relatedConcepts: ['cognitive bias', 'mirror imaging', 'groupthink'] },
    ],
    frameworks: [
      { name: 'Analysis of Competing Hypotheses (ACH)', description: 'Systematic evaluation of multiple hypotheses against evidence', whenToUse: 'Ambiguous situations with multiple explanations', steps: ['Generate hypotheses', 'List evidence', 'Build matrix', 'Refine', 'Assess sensitivity'] },
      { name: 'Source Reliability Matrix', description: 'Rate source reliability × information credibility', whenToUse: 'Evaluating intelligence quality', steps: ['Rate source (A-F)', 'Rate information (1-6)', 'Combined assessment'] },
    ],
    referencePapers: [
      { title: 'Destined for War', authors: 'Graham Allison', year: 2017, journal: 'Houghton Mifflin', significance: 'Thucydides Trap framework for great power competition' },
      { title: 'Arms and Influence', authors: 'Thomas Schelling', year: 1966, journal: 'Yale University Press', significance: 'Foundational work on deterrence, coercion, and strategic bargaining' },
      { title: 'Perception and Misperception in International Politics', authors: 'Robert Jervis', year: 1976, journal: 'Princeton University Press', significance: 'Cognitive biases in security decision-making and escalation dynamics' },
      { title: 'The Tragedy of Great Power Politics', authors: 'John Mearsheimer', year: 2001, journal: 'W.W. Norton', significance: 'Offensive realism theory — great power competition is structural' },
      { title: 'The Origins of Alliances', authors: 'Stephen Walt', year: 1987, journal: 'Cornell University Press', significance: 'Balance of threat theory — states ally against strongest threat, not strongest power' },
      { title: 'Counterinsurgency', authors: 'David Kilcullen', year: 2010, journal: 'Oxford University Press', significance: 'Definitive modern COIN doctrine — population-centric, hybrid threats' },
      { title: 'Strategies of Containment', authors: 'John Lewis Gaddis', year: 1982, journal: 'Oxford University Press', significance: 'Definitive history of Cold War containment strategy and grand strategy' },
      { title: 'The Shield of Achilles: War, Peace, and the Course of History', authors: 'Philip Bobbitt', year: 2002, journal: 'Anchor Books', significance: 'Constitutional order and epochal wars — market state vs nation state' },
      { title: 'Man, the State, and War', authors: 'Kenneth Waltz', year: 1959, journal: 'Columbia University Press', significance: 'Foundational IR theory — three levels of analysis (individual, state, system)' },
      { title: 'On War', authors: 'Carl von Clausewitz', year: 1832, journal: 'Penguin Classics', significance: 'Foundational treatise on war — fog of war, friction, center of gravity, politics by other means' },
      { title: 'Rationalist Explanations for War', authors: 'James Fearon', year: 1995, journal: 'International Organization', significance: 'Canonical formal theory of why rational states fight wars — commitment problems, private information' },
      { title: 'The Spread of Nuclear Weapons: An Enduring Debate', authors: 'Sagan & Waltz', year: 1995, journal: 'W.W. Norton', significance: 'Canonical debate — Waltz (more nukes = more stability) vs Sagan (organizational risks)' },
    ],
    dataSources: [
      { name: 'GDELT Project', type: 'api', description: 'Global event monitoring — conflict tone, article volume', endpoint: 'https://api.gdeltproject.org/api/v2/doc/doc', requiresKey: false, dataType: 'conflict monitoring' },
      { name: 'SIPRI', type: 'feed', description: 'Arms transfers, military expenditure, conflict data', endpoint: 'https://www.sipri.org', requiresKey: false, dataType: 'defense statistics' },
      { name: 'NVD/NIST', type: 'api', description: 'National Vulnerability Database — CVEs', endpoint: 'https://services.nvd.nist.gov/rest/json/cves/2.0', requiresKey: false, dataType: 'cyber vulnerabilities' },
    ],
    methodology: {
      approach: 'qualitative',
      evidenceHierarchy: ['Multi-source corroborated intelligence', 'Single-source high-reliability', 'Open-source analysis', 'Expert assessment', 'Speculation'],
      statisticalMethods: ['Bayesian updating', 'Scenario analysis', 'Game theory', 'Network analysis'],
      uncertaintyApproach: 'Think in probabilities. Distinguish secrets (knowable) from mysteries (uncertain). Use confidence levels (low/medium/high).',
      minimumEvidence: 'At least two independent sources for factual claims',
    },
    qualityCriteria: {
      minSources: 4,
      minQuality: 70,
      minEvidenceLevel: 3,
      requirePeerReview: false, // Much security analysis is from think tanks
      maxSourceAge: 5,
      specialRequirements: ['Must apply ACH for ambiguous situations', 'Must check for mirror imaging'],
    },
    standingQuestions: [
      'How is the Russia-Ukraine conflict reshaping European security architecture?',
      'What are the implications of AI for military decision-making?',
      'How are cyber capabilities changing deterrence dynamics?',
    ],
    knownBiases: [
      'Mirror imaging (projecting own logic onto adversaries)',
      'Ethnocentric bias in threat assessment',
      'Anchoring on worst-case scenarios',
      'Overreliance on single-source intelligence',
    ],
  },

  law: {
    domain: 'law',
    researcherName: 'Dr. Themis (Θέμις)',
    keyConcepts: [
      { name: 'Proportionality Analysis', definition: 'Three-step test: legitimate aim, necessity, proportionality stricto sensu — the core balancing test in constitutional and human rights law', importance: 'foundational', relatedConcepts: ['margin of appreciation', 'judicial review', 'fundamental rights'] },
      { name: 'Regulatory Sandboxes', definition: 'Controlled environments for testing innovative products under relaxed regulations — key to AI, fintech, and biotech governance', importance: 'emerging', relatedConcepts: ['innovation principle', 'precautionary principle', 'regulatory agility'] },
      { name: 'Brussels Effect', definition: 'EU regulatory standards becoming de facto global standards through market power — unilateral regulatory globalization', importance: 'advanced', relatedConcepts: ['regulatory competition', 'California effect', 'race to the top'] },
      { name: 'Lex Mercatoria', definition: 'Transnational commercial law emerging from merchant practice, arbitration, and international trade customs — governance beyond the state', importance: 'advanced', relatedConcepts: ['international arbitration', 'soft law', 'UNCITRAL', 'harmonization'] },
      { name: 'Algorithmic Accountability', definition: 'Legal frameworks for auditing, explaining, and contesting automated decisions — EU AI Act, DSA, GDPR Art.22', importance: 'emerging', relatedConcepts: ['explainability', 'right to explanation', 'impact assessment', 'bias audits'] },
    ],
    frameworks: [
      { name: 'Regulatory Impact Assessment', description: 'Systematic evaluation of proposed regulation effects on stakeholders, economy, and rights', whenToUse: 'Analyzing new regulations or regulatory reform proposals', steps: ['Problem definition', 'Baseline scenario', 'Option analysis', 'Impact assessment', 'Monitoring plan'] },
      { name: 'Comparative Legal Analysis', description: 'Systematic comparison of how different jurisdictions address the same legal issue — functional equivalence method', whenToUse: 'When assessing legal transplants, regulatory convergence, or best practices across jurisdictions', steps: ['Identify legal problem', 'Select comparator jurisdictions', 'Map functional equivalents', 'Assess contextual factors', 'Evaluate transferability'] },
      { name: 'Rights-Based Assessment', description: 'Evaluate policies through fundamental rights lens — necessity, proportionality, non-discrimination, and due process', whenToUse: 'When assessing impact of technology, policy, or business practice on civil liberties', steps: ['Identify affected rights', 'Assess interference severity', 'Check legal basis', 'Apply proportionality test', 'Evaluate safeguards'] },
    ],
    referencePapers: [
      { title: 'The Brussels Effect', authors: 'Anu Bradford', year: 2020, journal: 'Oxford University Press', significance: 'Definitive work on EU regulatory globalization' },
      { title: 'The EU AI Act: A Comprehensive Overview', authors: 'Michael Veale & Frederik Zuiderveen Borgesius', year: 2023, journal: 'Computer Law & Security Review', significance: 'First systematic legal analysis of the EU AI Act risk classification framework' },
      { title: 'Law and Artificial Intelligence', authors: 'Woodrow Barfield & Ugo Pagallo', year: 2020, journal: 'Edward Elgar Publishing', significance: 'Comprehensive treatment of how AI challenges existing legal frameworks across domains' },
      { title: 'The Concept of Law', authors: 'H.L.A. Hart', year: 1961, journal: 'Oxford University Press', significance: 'Foundational legal philosophy — rules of recognition, primary/secondary rules, legal positivism' },
      { title: 'Taking Rights Seriously', authors: 'Ronald Dworkin', year: 1977, journal: 'Harvard University Press', significance: 'Rights as trumps — critique of legal positivism, principled adjudication' },
      { title: 'Nudge: Improving Decisions About Health, Wealth, and Happiness', authors: 'Thaler & Sunstein', year: 2008, journal: 'Yale University Press', significance: 'Libertarian paternalism and regulatory choice architecture' },
      { title: 'Code: And Other Laws of Cyberspace', authors: 'Lawrence Lessig', year: 1999, journal: 'Basic Books', significance: 'Code is law — architecture as regulatory instrument in cyberspace' },
      { title: 'Law for the Computer Age', authors: 'Mireille Hildebrandt', year: 2020, journal: 'Oxford University Press', significance: 'Legal tech, computational law, and the future of legal protection in data-driven societies' },
      { title: 'The Morality of Law', authors: 'Lon Fuller', year: 1964, journal: 'Yale University Press', significance: 'Inner morality of law — eight desiderata of legal systems, natural law vs positivism debate' },
      { title: 'The Constitution of Liberty', authors: 'F.A. Hayek', year: 1960, journal: 'University of Chicago Press', significance: 'Definitive classical liberal legal philosophy — rule of law, spontaneous order, individual freedom' },
      { title: 'The Path of the Law', authors: 'Oliver Wendell Holmes', year: 1897, journal: 'Harvard Law Review', significance: 'Foundational legal realist text — law as prediction, bad man theory' },
    ],
    dataSources: [
      { name: 'EUR-Lex', type: 'api', description: 'EU legislation database — directives, regulations, case law', endpoint: 'https://eur-lex.europa.eu/eurlex-ws/rest', requiresKey: false, dataType: 'EU legislation' },
      { name: 'Federal Register', type: 'api', description: 'US federal regulations and proposed rules', endpoint: 'https://www.federalregister.gov/api/v1', requiresKey: false, dataType: 'US regulations' },
      { name: 'HUDOC (ECtHR)', type: 'api', description: 'European Court of Human Rights case law database — 50K+ judgments on fundamental rights', endpoint: 'https://hudoc.echr.coe.int', requiresKey: false, dataType: 'human rights case law' },
    ],
    methodology: {
      approach: 'qualitative',
      evidenceHierarchy: ['Binding court decisions', 'Statutory text', 'Regulatory guidance', 'Academic commentary', 'Policy proposals'],
      statisticalMethods: ['Case law analysis', 'Comparative law methodology', 'Regulatory impact assessment'],
      uncertaintyApproach: 'Distinguish lex lata (law as is) from lex ferenda (law as should be). Flag untested legal instruments.',
      minimumEvidence: 'Primary legal sources (statutes, case law) for any legal claim',
    },
    qualityCriteria: {
      minSources: 4,
      minQuality: 72,
      minEvidenceLevel: 3,
      requirePeerReview: false,
      maxSourceAge: 8,
      specialRequirements: ['Must cite primary legal sources', 'Must distinguish between jurisdictions'],
    },
    standingQuestions: [
      'How is the EU AI Act being implemented across member states?',
      'What are the emerging frameworks for platform governance?',
      'How are data protection regulations evolving post-GDPR?',
    ],
    knownBiases: [
      'Jurisdictional bias (analyzing all law through one legal system)',
      'Formalist bias (ignoring enforcement gaps)',
      'Pro-regulation bias in academic legal literature',
    ],
  },

  environment: {
    domain: 'environment',
    researcherName: 'Dr. Gaia (Γαία)',
    keyConcepts: [
      { name: 'Planetary Boundaries', definition: '9 Earth system processes with quantified safe operating spaces — 6 of 9 already transgressed (Rockström/Steffen 2023)', importance: 'foundational', relatedConcepts: ['tipping points', 'safe operating space', 'Anthropocene'] },
      { name: 'Jevons Paradox', definition: 'Efficiency improvements can increase total resource use rather than decrease it — critical for evaluating green growth claims', importance: 'advanced', relatedConcepts: ['rebound effect', 'decoupling', 'dematerialization'] },
      { name: 'Stranded Assets', definition: 'Fossil fuel infrastructure that loses value under decarbonization scenarios — $1-4T at risk globally', importance: 'advanced', relatedConcepts: ['carbon bubble', 'transition risk', 'just transition'] },
      { name: 'Carbon Budget', definition: 'Remaining CO2 emissions compatible with temperature targets — ~400 GtCO2 for 1.5°C (50% probability, from 2023)', importance: 'foundational', relatedConcepts: ['emissions pathways', 'net-zero', 'carbon neutrality', 'overshoot'] },
      { name: 'Nature-Based Solutions', definition: 'Ecosystem management, conservation, and restoration to address societal challenges — carbon sequestration, flood protection, biodiversity', importance: 'emerging', relatedConcepts: ['ecosystem services', 'biodiversity credits', 'rewilding', 'blue carbon'] },
    ],
    frameworks: [
      { name: 'Lifecycle Assessment (LCA)', description: 'Cradle-to-grave environmental impact analysis across all stages of product/service life', whenToUse: 'Comparing solutions or technologies for environmental impact', steps: ['Goal & scope', 'Inventory analysis', 'Impact assessment', 'Interpretation'] },
      { name: 'DPSIR Framework', description: 'Drivers → Pressures → State → Impact → Response — causal chain for environmental assessment', whenToUse: 'When analyzing environmental degradation causes, consequences, and policy responses', steps: ['Identify drivers', 'Map pressures', 'Assess state change', 'Evaluate impacts', 'Design responses'] },
      { name: 'Shared Socioeconomic Pathways (SSPs)', description: 'Five narratives of future societal development (SSP1-5) used as scenarios for climate modeling', whenToUse: 'When evaluating long-term climate projections, adaptation needs, or mitigation pathways', steps: ['Select SSP scenario', 'Apply RCP forcing', 'Model outcomes', 'Assess uncertainty', 'Compare pathways'] },
    ],
    referencePapers: [
      { title: 'IPCC AR6 Synthesis Report', authors: 'IPCC', year: 2023, journal: 'IPCC', significance: 'Definitive state of climate science and mitigation pathways' },
      { title: 'A safe operating space for humanity', authors: 'Johan Rockstrom et al.', year: 2009, journal: 'Nature', significance: 'Original planetary boundaries framework — foundational for Earth system governance' },
      { title: 'Global Carbon Budget 2023', authors: 'Friedlingstein et al.', year: 2023, journal: 'Earth System Science Data', significance: 'Annual authoritative assessment of global CO2 emissions, sinks, and remaining budget' },
      { title: 'The Limits to Growth', authors: 'Meadows et al.', year: 1972, journal: 'Club of Rome', significance: 'Foundational systems dynamics work on resource constraints and exponential growth' },
      { title: 'Our Common Future (Brundtland Report)', authors: 'WCED', year: 1987, journal: 'Oxford University Press', significance: 'Definitive definition of sustainable development — intergenerational equity' },
      { title: 'The Stern Review: The Economics of Climate Change', authors: 'Nicholas Stern', year: 2006, journal: 'HM Treasury', significance: 'Landmark cost-benefit analysis of climate action vs inaction' },
      { title: 'The Climate Casino: Risk, Uncertainty, and Economics for a Warming World', authors: 'William Nordhaus', year: 2013, journal: 'Yale University Press', significance: 'Nobel laureate integrated assessment model (DICE) and carbon pricing' },
      { title: 'Doughnut Economics: Seven Ways to Think Like a 21st-Century Economist', authors: 'Kate Raworth', year: 2017, journal: 'Chelsea Green', significance: 'Regenerative and distributive economics framework — social foundation + ecological ceiling' },
      { title: 'IPBES Global Assessment Report on Biodiversity and Ecosystem Services', authors: 'IPBES', year: 2019, journal: 'IPBES', significance: 'Definitive assessment of biodiversity loss and ecosystem degradation — 1M species at risk' },
      { title: 'The Tragedy of the Commons', authors: 'Garrett Hardin', year: 1968, journal: 'Science', significance: 'Foundational paper on common-pool resource depletion — still debated and referenced' },
      { title: 'Silent Spring', authors: 'Rachel Carson', year: 1962, journal: 'Houghton Mifflin', significance: 'Foundational environmental science — launched the modern environmental movement' },
      { title: 'Thinking in Systems: A Primer', authors: 'Donella Meadows', year: 2008, journal: 'Chelsea Green', significance: 'Definitive systems thinking primer — feedback loops, leverage points, stocks and flows' },
    ],
    dataSources: [
      { name: 'NASA GISS', type: 'api', description: 'Global temperature anomaly data', endpoint: 'https://data.giss.nasa.gov/gistemp', requiresKey: false, dataType: 'temperature anomalies' },
      { name: 'Open-Meteo Climate', type: 'api', description: 'Historical and forecast climate data', endpoint: 'https://archive-api.open-meteo.com', requiresKey: false, dataType: 'climate data' },
      { name: 'IEA Data', type: 'api', description: 'Energy statistics and projections', endpoint: 'https://api.iea.org', requiresKey: false, dataType: 'energy statistics' },
    ],
    methodology: {
      approach: 'mixed',
      evidenceHierarchy: ['IPCC assessment reports', 'Peer-reviewed multi-model studies', 'Single model studies', 'Observational data analysis', 'Expert elicitation'],
      statisticalMethods: ['Climate model ensembles', 'Attribution analysis', 'Scenario analysis (SSPs)', 'LCA', 'Techno-economic assessment'],
      uncertaintyApproach: 'Use IPCC uncertainty language (likely, very likely, etc.). Distinguish deep uncertainty (>2050) from near-term projections.',
      minimumEvidence: 'Peer-reviewed studies, preferably multi-model ensembles',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 72,
      minEvidenceLevel: 2,
      requirePeerReview: true,
      maxSourceAge: 5,
      specialRequirements: ['Must check emissions scenarios used', 'Must assess rebound effects'],
    },
    standingQuestions: [
      'What is the current trajectory of global emissions vs Paris targets?',
      'Which clean energy technologies are reaching cost parity?',
      'How are climate tipping points being reassessed?',
    ],
    knownBiases: [
      'Optimism bias in technology deployment projections',
      'Anchoring on outdated emissions scenarios',
      'Neglect of indirect land use change effects',
      'Publication bias toward alarming findings',
    ],
  },

  geopolitics: {
    domain: 'geopolitics',
    researcherName: 'Dr. Atlas (Ἄτλας)',
    keyConcepts: [
      { name: 'Thucydides Trap', definition: 'Structural stress when a rising power threatens a ruling power — 12 of 16 historical cases led to war (Allison 2017)', importance: 'foundational', relatedConcepts: ['power transition theory', 'security dilemma', 'hegemonic stability'] },
      { name: 'Multipolarity', definition: 'International system with multiple great powers — less stable than bipolarity per neorealism, emerging post-2020', importance: 'foundational', relatedConcepts: ['balance of power', 'concert of powers', 'regional hegemony'] },
      { name: 'Economic Statecraft', definition: 'Use of economic tools (sanctions, trade, investment) as instruments of foreign policy — weaponized interdependence', importance: 'advanced', relatedConcepts: ['weaponized interdependence', 'decoupling', 'friend-shoring', 'de-dollarization'] },
      { name: 'Gray Zone Conflict', definition: 'Competitive interactions below the threshold of conventional war — cyber, information warfare, economic coercion, proxy operations', importance: 'advanced', relatedConcepts: ['hybrid warfare', 'salami tactics', 'escalation management', 'deterrence'] },
      { name: 'Techno-Geopolitics', definition: 'Competition over critical technologies (AI, semiconductors, quantum, biotech) as a new axis of great power rivalry', importance: 'emerging', relatedConcepts: ['chip war', 'tech sovereignty', 'digital iron curtain', 'export controls'] },
    ],
    frameworks: [
      { name: 'Three IR Paradigms', description: 'Evaluate through realist, liberal, and constructivist lenses simultaneously for comprehensive analysis', whenToUse: 'Any geopolitical analysis', steps: ['Realist analysis (power, interests)', 'Liberal analysis (institutions, norms)', 'Constructivist analysis (identity, ideas)', 'Synthesize'] },
      { name: 'Scenario Planning (Shell Method)', description: 'Structured exploration of 2-4 plausible futures based on key uncertainties — not prediction but preparedness', whenToUse: 'When assessing long-term geopolitical trajectories or strategic planning under uncertainty', steps: ['Identify driving forces', 'Isolate key uncertainties', 'Build scenario matrix', 'Develop narratives', 'Identify signposts'] },
      { name: 'Escalation Ladder', description: 'Kahn\'s structured progression from disagreement to total war — 44 rungs with decision points and off-ramps', whenToUse: 'When analyzing crisis dynamics, deterrence credibility, or conflict escalation risks', steps: ['Identify current rung', 'Map escalation triggers', 'Assess off-ramps', 'Evaluate red lines', 'Model adversary calculus'] },
    ],
    referencePapers: [
      { title: 'The Tragedy of Great Power Politics', authors: 'John Mearsheimer', year: 2001, journal: 'W.W. Norton', significance: 'Definitive statement of offensive realism' },
      { title: 'Destined for War: Can America and China Escape Thucydides\'s Trap?', authors: 'Graham Allison', year: 2017, journal: 'Houghton Mifflin Harcourt', significance: 'Foundational analysis of US-China power transition through historical case studies' },
      { title: 'Chip War: The Fight for the World\'s Most Critical Technology', authors: 'Chris Miller', year: 2022, journal: 'Scribner', significance: 'Definitive account of semiconductor geopolitics and tech competition' },
    ],
    dataSources: [
      { name: 'GDELT', type: 'api', description: 'Global event monitoring and conflict tone analysis — 300M+ events', endpoint: 'https://api.gdeltproject.org/api/v2/doc/doc', requiresKey: false, dataType: 'global events' },
      { name: 'UN Voting Records', type: 'api', description: 'UN General Assembly voting patterns — alignment tracking for 193 states', endpoint: 'https://digitallibrary.un.org', requiresKey: false, dataType: 'diplomatic alignment' },
      { name: 'SIPRI', type: 'feed', description: 'Arms transfers, military expenditure data for 170+ countries', endpoint: 'https://www.sipri.org', requiresKey: false, dataType: 'defense & arms data' },
    ],
    methodology: {
      approach: 'qualitative',
      evidenceHierarchy: ['Primary diplomatic sources', 'Multi-source journalistic investigation', 'Think tank analysis', 'Academic IR theory', 'Op-ed/commentary'],
      statisticalMethods: ['Event data analysis', 'Alliance network analysis', 'Trade dependency metrics'],
      uncertaintyApproach: 'Apply scenario planning. Distinguish between predictable trends and wild cards. Avoid deterministic forecasts.',
      minimumEvidence: 'Multiple independent sources for factual claims about state behavior',
    },
    qualityCriteria: {
      minSources: 4,
      minQuality: 70,
      minEvidenceLevel: 3,
      requirePeerReview: false,
      maxSourceAge: 5,
      specialRequirements: ['Must apply multiple IR theory lenses', 'Must check for ethnocentric assumptions'],
    },
    standingQuestions: [
      'How is the US-China strategic competition evolving?',
      'What are the implications of multipolarity for global governance?',
      'How are regional security architectures adapting?',
    ],
    knownBiases: [
      'Western-centric analysis of non-Western actors',
      'Status quo bias in alliance analysis',
      'Overreliance on historical analogies',
      'Rational actor assumption when actors are not rational',
    ],
  },

  finance: {
    domain: 'finance',
    researcherName: 'Dr. Hermes (Ἑρμῆς)',
    keyConcepts: [
      { name: 'Systemic Risk', definition: 'Risk of cascading failures across the financial system — contagion, too-big-to-fail, interconnectedness', importance: 'foundational', relatedConcepts: ['counterparty risk', 'liquidity spirals', 'fire sales'] },
      { name: 'Market Microstructure', definition: 'How exchange mechanisms affect price formation — order flow, bid-ask spreads, information asymmetry', importance: 'advanced', relatedConcepts: ['high-frequency trading', 'dark pools', 'market making'] },
      { name: 'Yield Curve Dynamics', definition: 'Term structure of interest rates as economic signal — inversion as recession predictor, carry trade implications', importance: 'foundational', relatedConcepts: ['term premium', 'expectations hypothesis', 'monetary transmission', 'duration risk'] },
      { name: 'ESG Integration', definition: 'Incorporating environmental, social, governance factors into investment decisions — materiality debate, greenwashing risk', importance: 'emerging', relatedConcepts: ['climate risk disclosure', 'TCFD', 'double materiality', 'stranded assets'] },
      { name: 'Crypto & DeFi Risk', definition: 'Risks from decentralized finance — smart contract vulnerabilities, stablecoin depegging, regulatory arbitrage, systemic contagion', importance: 'emerging', relatedConcepts: ['stablecoins', 'CBDC', 'tokenization', 'MiCA regulation'] },
    ],
    frameworks: [
      { name: 'Stress Testing', description: 'Evaluate portfolio/system resilience under adverse scenarios — CCAR, EBA methodology', whenToUse: 'Risk assessment, capital adequacy, or regulatory compliance', steps: ['Define scenarios', 'Model transmission', 'Assess impact', 'Evaluate mitigation'] },
      { name: 'Factor Model Analysis', description: 'Decompose returns into systematic factors (Fama-French, Carhart, macro factors) to separate alpha from beta', whenToUse: 'When evaluating investment performance, portfolio construction, or risk attribution', steps: ['Identify factors', 'Estimate loadings', 'Decompose returns', 'Assess residual alpha'] },
      { name: 'Minsky Financial Instability', description: 'Financial system naturally progresses from hedge → speculative → Ponzi financing as stability breeds risk-taking', whenToUse: 'When assessing credit cycle dynamics, financial stability, or bubble formation', steps: ['Assess financing structures', 'Measure leverage trends', 'Check stability assumptions', 'Identify Minsky moment triggers'] },
    ],
    referencePapers: [
      { title: 'This Time Is Different', authors: 'Reinhart & Rogoff', year: 2009, journal: 'Princeton University Press', significance: '800 years of financial crises — patterns and warning signs' },
      { title: 'The Black Swan', authors: 'Nassim Nicholas Taleb', year: 2007, journal: 'Random House', significance: 'Foundational critique of financial risk models — fat tails and Knightian uncertainty' },
      { title: 'Flash Boys', authors: 'Michael Lewis', year: 2014, journal: 'W.W. Norton', significance: 'Definitive account of high-frequency trading and market microstructure dysfunction' },
    ],
    dataSources: [
      { name: 'FRED', type: 'api', description: 'Financial market indicators — VIX, yield curves, credit spreads', endpoint: 'https://api.stlouisfed.org/fred', requiresKey: true, keyEnvVar: 'FRED_API_KEY', dataType: 'financial indicators' },
      { name: 'ECB SDW', type: 'api', description: 'Euro area financial statistics', endpoint: 'https://data-api.ecb.europa.eu/service/data', requiresKey: false, dataType: 'financial statistics' },
      { name: 'BIS Statistics', type: 'feed', description: 'Bank for International Settlements — global banking data', endpoint: 'https://data.bis.org', requiresKey: false, dataType: 'banking statistics' },
    ],
    methodology: {
      approach: 'quantitative',
      evidenceHierarchy: ['Peer-reviewed with out-of-sample validation', 'Working papers (NBER, BIS)', 'Central bank reports', 'Practitioner research', 'Market commentary'],
      statisticalMethods: ['VaR/CVaR', 'GARCH models', 'Copula dependence', 'Factor models', 'Network analysis'],
      uncertaintyApproach: 'Report tail risks explicitly. Use fat-tailed distributions, not Gaussian. Stress test assumptions.',
      minimumEvidence: 'Quantitative evidence with out-of-sample validation',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 72,
      minEvidenceLevel: 3,
      requirePeerReview: true,
      maxSourceAge: 5,
      specialRequirements: ['Must assess systemic risk implications', 'Must check for survivorship bias'],
    },
    standingQuestions: [
      'What are the current systemic risk indicators?',
      'How is the digital asset market affecting traditional finance?',
      'What are the implications of higher-for-longer interest rates?',
    ],
    knownBiases: [
      'Survivorship bias in fund performance data',
      'Pro-cyclicality in risk models',
      'Recency bias in market commentary',
      'Gaussian distribution assumption for fat-tailed risks',
    ],
  },

  quantitative: {
    domain: 'quantitative',
    researcherName: 'Dr. Lachesis (Λάχεσις)',
    keyConcepts: [
      { name: 'Rubin Causal Model', definition: 'Potential outcomes framework — treatment effect = Y(1) - Y(0), fundamental problem of causal inference', importance: 'foundational', relatedConcepts: ['SUTVA', 'ignorability', 'positivity'] },
      { name: 'DAG Reasoning', definition: 'Directed acyclic graphs for encoding causal assumptions and identifying adjustment sets (Pearl)', importance: 'foundational', relatedConcepts: ['d-separation', 'backdoor criterion', 'front-door criterion'] },
      { name: 'Replication Crisis', definition: 'Failure to reproduce findings — p-hacking, HARKing, low power, researcher degrees of freedom — reshaping statistical practice', importance: 'advanced', relatedConcepts: ['pre-registration', 'power analysis', 'many analysts'] },
      { name: 'Bayesian Inference', definition: 'Updating beliefs with data via Bayes theorem — posterior ∝ likelihood × prior. Coherent uncertainty quantification vs frequentist point estimates', importance: 'foundational', relatedConcepts: ['prior elicitation', 'MCMC', 'credible intervals', 'model comparison'] },
      { name: 'Machine Learning for Causal Inference', definition: 'Using ML for heterogeneous treatment effects (causal forests), double ML, targeted learning — merging prediction with causal identification', importance: 'emerging', relatedConcepts: ['CATE estimation', 'double/debiased ML', 'targeted minimum loss', 'causal forests'] },
    ],
    frameworks: [
      { name: 'PICO Framework', description: 'Population, Intervention, Comparison, Outcome — systematic approach to structuring causal research questions', whenToUse: 'Formulating any causal question or evaluating intervention studies', steps: ['Define population', 'Specify intervention', 'Identify comparator', 'Measure outcome'] },
      { name: 'Sensitivity Analysis', description: 'Assess how robust conclusions are to violations of key assumptions — Rosenbaum bounds, E-values, omitted variable bias', whenToUse: 'After any causal analysis to assess how strong confounding would need to be to overturn results', steps: ['Identify key assumptions', 'Parameterize violations', 'Compute bounds', 'Report robustness'] },
      { name: 'Meta-Analysis Protocol', description: 'Systematic quantitative synthesis — fixed/random effects, heterogeneity (I²), publication bias (funnel plots, trim-and-fill)', whenToUse: 'When synthesizing multiple studies on the same question to estimate pooled effect sizes', steps: ['Systematic search', 'Study selection (PRISMA)', 'Extract effect sizes', 'Model heterogeneity', 'Assess publication bias'] },
    ],
    referencePapers: [
      { title: 'The Book of Why', authors: 'Judea Pearl', year: 2018, journal: 'Basic Books', significance: 'Accessible introduction to causal reasoning and DAGs — transformed applied statistics' },
      { title: 'Mostly Harmless Econometrics', authors: 'Angrist & Pischke', year: 2009, journal: 'Princeton University Press', significance: 'Gold standard for applied causal inference — IV, DiD, RDD clearly explained' },
      { title: 'Statistical Rethinking', authors: 'Richard McElreath', year: 2020, journal: 'CRC Press', significance: 'Modern Bayesian approach to applied statistics with causal reasoning — reshaping how scientists analyze data' },
    ],
    dataSources: [
      { name: 'arXiv stat.ML', type: 'feed', description: 'Statistics and machine learning methodology preprints', endpoint: 'https://export.arxiv.org/api/query', requiresKey: false, dataType: 'methodology papers' },
      { name: 'Open Science Framework', type: 'api', description: 'Pre-registrations, replications, and open data — 600K+ projects', endpoint: 'https://api.osf.io/v2/', requiresKey: false, dataType: 'pre-registrations and open data' },
      { name: 'Cochrane Library', type: 'feed', description: 'Gold standard systematic reviews and meta-analyses in health and beyond', endpoint: 'https://www.cochranelibrary.com', requiresKey: false, dataType: 'systematic reviews' },
    ],
    methodology: {
      approach: 'quantitative',
      evidenceHierarchy: ['Pre-registered RCT with adequate power', 'Natural experiment with strong instrument', 'Well-identified observational study', 'Descriptive analysis', 'Theoretical result'],
      statisticalMethods: ['Causal inference (IV, DiD, RDD)', 'Bayesian inference', 'Meta-analysis', 'Power analysis', 'Multiple testing correction'],
      uncertaintyApproach: 'Think in distributions. Report Bayesian credible intervals when possible. Always assess statistical power.',
      minimumEvidence: 'Pre-registered study or strong theoretical justification for methodology',
    },
    qualityCriteria: {
      minSources: 4,
      minQuality: 75,
      minEvidenceLevel: 2,
      requirePeerReview: true,
      maxSourceAge: 5,
      specialRequirements: ['Must check for p-hacking', 'Must assess identification strategy', 'Must report effect sizes'],
    },
    standingQuestions: [
      'What are the latest advances in causal inference for observational data?',
      'How is the replication crisis reshaping statistical practice?',
      'What role does machine learning play in causal discovery?',
    ],
    knownBiases: [
      'p-hacking and researcher degrees of freedom',
      'Multiple testing without correction',
      'Overconfidence in frequentist p-values',
      'Neglect of external validity',
    ],
  },

  // ============================================================================
  // ADVANCED DOMAINS — 6 NEW KBs
  // ============================================================================

  'social-sciences': {
    domain: 'social-sciences',
    researcherName: 'Dr. Hestia (Ἑστία)',
    keyConcepts: [
      { name: 'Social Stratification', definition: 'Hierarchical arrangement of individuals in society based on wealth, power, and prestige, shaping life chances and mobility.' },
      { name: 'Intersectionality', definition: 'Framework analyzing how race, class, gender, sexuality, and other identities intersect to create unique experiences of privilege and oppression (Crenshaw 1989).' },
      { name: 'Social Capital', definition: 'Resources embedded in social networks — bonding (within-group) vs bridging (cross-group) capital (Putnam 2000, Bourdieu 1986).' },
      { name: 'Institutional Theory', definition: 'How institutions (rules, norms, cultural-cognitive elements) shape organizational and individual behavior (DiMaggio & Powell, Scott).' },
      { name: 'Collective Action', definition: 'Logic of group mobilization, free-rider problems, and how social movements overcome coordination challenges (Olson 1965, Ostrom 1990).' },
    ],
    frameworks: [
      { name: 'Bourdieu\'s Field Theory', description: 'Analyzes social space through field, habitus, and capital (economic, cultural, social, symbolic)', whenToUse: 'When analyzing power dynamics, cultural reproduction, or class-based inequalities' },
      { name: 'Grounded Theory', description: 'Inductive methodology building theory from systematic qualitative data analysis', whenToUse: 'When exploring understudied phenomena or generating new theoretical insights from empirical data' },
      { name: 'World-Systems Analysis', description: 'Wallerstein\'s framework analyzing global inequality through core-periphery-semiperiphery dynamics', whenToUse: 'When analyzing global inequalities, development, or international division of labor' },
    ],
    referencePapers: [
      { doi: '10.2307/2657553', title: 'Bowling Alone: The Collapse and Revival of American Community', authors: ['Robert Putnam'], year: 2000, keyInsight: 'Declining social capital in America threatens democratic participation' },
      { doi: '10.1086/228943', title: 'The Forms of Capital', authors: ['Pierre Bourdieu'], year: 1986, keyInsight: 'Capital exists in economic, cultural, and social forms that reproduce inequality' },
    ],
    dataSources: [
      { name: 'World Values Survey', type: 'dataset', url: 'https://www.worldvaluessurvey.org', coverage: 'Cross-national survey data on values, beliefs, social capital across 100+ countries' },
      { name: 'General Social Survey (GSS)', type: 'dataset', url: 'https://gss.norc.org', coverage: 'US societal trends since 1972 — attitudes, behaviors, demographics' },
      { name: 'European Social Survey', type: 'dataset', url: 'https://www.europeansocialsurvey.org', coverage: 'Cross-national survey of social attitudes in 30+ European countries' },
    ],
    methodology: {
      approach: 'Mixed methods — quantitative surveys with qualitative depth (interviews, ethnography, discourse analysis)',
      evidenceHierarchy: ['Longitudinal panel studies', 'Cross-national comparative surveys', 'Ethnographic fieldwork', 'Cross-sectional surveys', 'Case studies'],
      uncertaintyApproach: 'Confidence intervals + reflexive acknowledgment of researcher positionality',
      minimumEvidence: 'At least 3 independent studies from different contexts',
    },
    qualityCriteria: {
      minSources: 6,
      minQuality: 60,
      requirePeerReview: true,
      maxSourceAge: 15,
      specialRequirements: ['Must check for WEIRD sample bias', 'Must assess ecological validity', 'Must consider intersectional dimensions'],
    },
    standingQuestions: [
      'How is digital technology reshaping social stratification and mobility?',
      'What drives the global rise of populism and social polarization?',
      'How do social networks mediate collective action in the digital age?',
    ],
    knownBiases: [
      'WEIRD sample bias (Western, Educated, Industrialized, Rich, Democratic)',
      'Social desirability bias in survey responses',
      'Eurocentric theoretical frameworks applied universally',
      'Selection bias in qualitative sampling',
    ],
  },

  humanities: {
    domain: 'humanities',
    researcherName: 'Dr. Apollo (Ἀπόλλων)',
    keyConcepts: [
      { name: 'Rawlsian Justice', definition: 'Justice as fairness — principles chosen behind a veil of ignorance: equal basic liberties and difference principle (Rawls 1971).' },
      { name: 'Precautionary Principle', definition: 'When an activity raises threats of harm, precautionary measures should be taken even if causal relationships are not fully established.' },
      { name: 'Epistemic Injustice', definition: 'Wrongful denial of someone\'s capacity as a knower — testimonial injustice (credibility deficit) and hermeneutical injustice (interpretive marginalization) (Fricker 2007).' },
      { name: 'Moral Realism vs Anti-Realism', definition: 'Debate over whether moral facts exist independently of human attitudes, or are constructed through social agreement.' },
      { name: 'Capabilities Approach', definition: 'Evaluating well-being by what people are able to do and be, not just resources they possess (Sen, Nussbaum).' },
    ],
    frameworks: [
      { name: 'Reflective Equilibrium', description: 'Method of achieving coherence between moral judgments, principles, and background theories through iterative adjustment', whenToUse: 'When conflicting moral intuitions need systematic reconciliation' },
      { name: 'Discourse Ethics', description: 'Habermas\'s framework: valid norms are those all affected could accept in rational discourse under ideal conditions', whenToUse: 'When evaluating legitimacy of norms, policies, or institutional procedures' },
      { name: 'Virtue Ethics', description: 'Evaluating actions through character traits (virtues/vices) and human flourishing (eudaimonia) rather than rules or consequences', whenToUse: 'When assessing professional ethics, institutional culture, or character-based policy arguments' },
    ],
    referencePapers: [
      { doi: '10.4159/9780674042605', title: 'A Theory of Justice', authors: ['John Rawls'], year: 1971, keyInsight: 'Justice requires principles chosen behind a veil of ignorance' },
      { doi: '10.1093/0198237073.001.0001', title: 'Development as Freedom', authors: ['Amartya Sen'], year: 1999, keyInsight: 'Development should be evaluated by expansion of human capabilities, not GDP' },
    ],
    dataSources: [
      { name: 'PhilPapers', type: 'database', url: 'https://philpapers.org', coverage: 'Comprehensive index of philosophy research — 2.5M+ entries' },
      { name: 'Stanford Encyclopedia of Philosophy', type: 'reference', url: 'https://plato.stanford.edu', coverage: 'Authoritative peer-reviewed articles on all areas of philosophy' },
    ],
    methodology: {
      approach: 'Conceptual analysis, argument reconstruction, normative evaluation, hermeneutic interpretation',
      evidenceHierarchy: ['Systematic philosophical argument', 'Peer-reviewed philosophy journals', 'Historical primary sources', 'Empirical evidence (when relevant)', 'Expert opinion'],
      uncertaintyApproach: 'Explicit acknowledgment of contested premises and logical validity vs soundness distinction',
      minimumEvidence: 'At least 2 well-constructed arguments from different philosophical traditions',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 55,
      requirePeerReview: true,
      maxSourceAge: 50,
      specialRequirements: ['Must distinguish descriptive from normative claims', 'Must assess logical validity of arguments', 'Must consider multiple ethical traditions'],
    },
    standingQuestions: [
      'What are the ethical limits of AI decision-making in high-stakes contexts?',
      'How should democratic theory adapt to digital communication platforms?',
      'Can the precautionary principle be operationalized without stalling innovation?',
    ],
    knownBiases: [
      'Western philosophical canon bias — neglect of non-Western traditions',
      'Armchair reasoning without empirical grounding',
      'Status quo bias in applied ethics',
      'False dichotomies in ethical framing',
    ],
  },

  'energy-advanced': {
    domain: 'energy-advanced',
    researcherName: 'Dr. Helios (Ἥλιος)',
    keyConcepts: [
      { name: 'Levelized Cost of Energy (LCOE)', definition: 'Total lifecycle cost of energy generation per unit of electricity, enabling comparison across technologies (solar, wind, nuclear, gas).' },
      { name: 'Grid Flexibility', definition: 'Power system\'s ability to accommodate variability and uncertainty from renewable generation through storage, demand response, and interconnection.' },
      { name: 'Capacity Factor', definition: 'Ratio of actual energy output to maximum possible output — key metric for comparing renewable vs baseload generation reliability.' },
      { name: 'Energy Trilemma', definition: 'Balancing energy security, affordability, and environmental sustainability — the core policy trade-off (World Energy Council).' },
      { name: 'Sector Coupling', definition: 'Integration of electricity, heat, transport, and industry sectors to maximize renewable energy utilization and system efficiency.' },
    ],
    frameworks: [
      { name: 'Energy System Optimization', description: 'Mathematical modeling of generation, transmission, and distribution to minimize cost while meeting demand and reliability constraints', whenToUse: 'When evaluating grid investment decisions, technology mix, or capacity planning' },
      { name: 'Technology Readiness Level (TRL)', description: 'NASA-derived scale (1-9) assessing maturity of energy technologies from basic research to commercial deployment', whenToUse: 'When assessing feasibility of emerging energy technologies or comparing innovation pathways' },
      { name: 'Marginal Abatement Cost Curve', description: 'Ranks decarbonization measures by cost per ton CO2 avoided, identifying low-hanging fruit vs expensive interventions', whenToUse: 'When prioritizing climate mitigation investments in the energy sector' },
    ],
    referencePapers: [
      { doi: '10.1038/s41560-020-00696-3', title: 'Net-zero emissions energy systems', authors: ['Steven Davis', 'et al.'], year: 2018, keyInsight: 'Reaching net-zero requires transforming not just electricity but industry, transport, and buildings' },
      { doi: '10.1016/j.joule.2019.06.003', title: 'The technological and economic prospects for CO2 utilization and removal', authors: ['Cameron Hepburn', 'et al.'], year: 2019, keyInsight: 'Most CO2 utilization pathways have limited climate benefit without permanent storage' },
    ],
    dataSources: [
      { name: 'IEA World Energy Outlook', type: 'database', url: 'https://www.iea.org/weo', coverage: 'Comprehensive global energy projections, scenarios, and technology assessments' },
      { name: 'IRENA Statistics', type: 'dataset', url: 'https://www.irena.org/Statistics', coverage: 'Renewable energy capacity, generation, costs, and investment data globally' },
      { name: 'BloombergNEF', type: 'database', url: 'https://about.bnef.com', coverage: 'Energy transition investment data, technology cost curves, market analysis' },
    ],
    methodology: {
      approach: 'Quantitative energy systems modeling with techno-economic analysis and scenario planning',
      evidenceHierarchy: ['Integrated assessment models', 'Techno-economic analyses', 'Field demonstration data', 'Laboratory results', 'Expert elicitation'],
      uncertaintyApproach: 'Scenario-based analysis with sensitivity testing on key parameters (discount rate, technology costs, policy assumptions)',
      minimumEvidence: 'At least 3 independent modeling studies or real-world deployment data',
    },
    qualityCriteria: {
      minSources: 6,
      minQuality: 65,
      requirePeerReview: true,
      maxSourceAge: 5,
      specialRequirements: ['Must check technology cost assumptions', 'Must assess grid integration requirements', 'Must consider full lifecycle emissions'],
    },
    standingQuestions: [
      'What is the optimal storage mix (batteries, hydrogen, pumped hydro) for high-renewable grids?',
      'Can nuclear power play a significant role in decarbonization given cost overruns and construction delays?',
      'How should developing countries sequence their energy transitions?',
    ],
    knownBiases: [
      'Technology optimism bias in cost projections',
      'Ignoring social acceptance and land-use constraints for renewables',
      'Underestimating grid integration costs at high renewable penetration',
      'Fossil fuel industry funding bias in transition timeline studies',
    ],
  },

  'digital-society': {
    domain: 'digital-society',
    researcherName: 'Dr. Iris (Ἶρις)',
    keyConcepts: [
      { name: 'Platform Capitalism', definition: 'Economic model where digital platforms extract value from network effects, data, and algorithmic intermediation (Srnicek 2017).' },
      { name: 'Algorithmic Governance', definition: 'Use of algorithms to regulate behavior, allocate resources, and make decisions traditionally made by humans or institutions.' },
      { name: 'Digital Divide', definition: 'Unequal access to and ability to use digital technologies — first-level (access), second-level (skills), third-level (outcomes).' },
      { name: 'Surveillance Capitalism', definition: 'Business model that commodifies personal data for behavioral prediction and modification (Zuboff 2019).' },
      { name: 'Datafication', definition: 'Transformation of social action into quantified data, enabling real-time tracking and analysis of human behavior.' },
    ],
    frameworks: [
      { name: 'Actor-Network Theory', description: 'Treats human and non-human actors (algorithms, platforms, devices) as equally important in social networks', whenToUse: 'When analyzing how technology mediates social relations or when human-technology boundaries blur' },
      { name: 'Platform Governance', description: 'Analyzes rules, norms, and architecture that govern platform ecosystems — content moderation, competition, data protection', whenToUse: 'When evaluating regulation of digital platforms or assessing platform power' },
      { name: 'Digital Rights Framework', description: 'Applies human rights principles (privacy, expression, non-discrimination) to digital contexts', whenToUse: 'When assessing ethical implications of digital technologies on civil liberties' },
    ],
    referencePapers: [
      { doi: '10.1093/oso/9780190905286.001.0001', title: 'The Age of Surveillance Capitalism', authors: ['Shoshana Zuboff'], year: 2019, keyInsight: 'Tech companies have created a new form of capitalism based on prediction and modification of human behavior' },
      { doi: '10.1093/oso/9780198849520.001.0001', title: 'The Oxford Handbook of Digital Technology and Society', authors: ['various'], year: 2021, keyInsight: 'Comprehensive mapping of how digital technologies transform social structures and institutions' },
    ],
    dataSources: [
      { name: 'Oxford Internet Institute', type: 'research', url: 'https://www.oii.ox.ac.uk', coverage: 'Research on internet governance, digital rights, platform regulation, and online behavior' },
      { name: 'Digital Economy & Society Index (DESI)', type: 'dataset', url: 'https://digital-strategy.ec.europa.eu/en/policies/desi', coverage: 'EU digital economy indicators — connectivity, human capital, digital public services' },
      { name: 'Freedom House — Freedom on the Net', type: 'report', url: 'https://freedomhouse.org/report/freedom-net', coverage: 'Annual assessment of internet freedom across 70 countries' },
    ],
    methodology: {
      approach: 'Critical digital methods — combining computational analysis of digital traces with qualitative interpretation',
      evidenceHierarchy: ['Large-scale platform data analysis', 'Experimental studies of algorithmic effects', 'Qualitative user studies', 'Policy analysis', 'Expert commentary'],
      uncertaintyApproach: 'Triangulation of computational and qualitative evidence with explicit acknowledgment of platform data limitations',
      minimumEvidence: 'At least 3 studies from different methodological traditions',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 60,
      requirePeerReview: false,
      maxSourceAge: 5,
      specialRequirements: ['Must assess platform power dynamics', 'Must consider digital inequality dimensions', 'Must evaluate data ethics'],
    },
    standingQuestions: [
      'How should AI systems be governed to prevent algorithmic discrimination?',
      'Can platform regulation restore competitive markets without stifling innovation?',
      'How does datafication reshape the social contract between citizens and states?',
    ],
    knownBiases: [
      'Technological determinism — attributing social change solely to technology',
      'Silicon Valley solutionism bias',
      'Neglect of Global South digital realities',
      'Platform data access asymmetry biasing research toward platform-friendly findings',
    ],
  },

  'cognitive-science': {
    domain: 'cognitive-science',
    researcherName: 'Dr. Metis (Μῆτις)',
    keyConcepts: [
      { name: 'Dual-Process Theory', definition: 'System 1 (fast, automatic, heuristic) vs System 2 (slow, deliberate, analytical) thinking — explains biases and rationality (Kahneman 2011).' },
      { name: 'Bounded Rationality', definition: 'Humans optimize within cognitive constraints — satisficing rather than maximizing (Simon 1955).' },
      { name: 'Embodied Cognition', definition: 'Cognitive processes are shaped by the body\'s interactions with the environment, not just abstract computation.' },
      { name: 'Predictive Processing', definition: 'Brain as a prediction machine — perception and action arise from minimizing prediction errors (Clark 2013, Friston).' },
      { name: 'Cognitive Load Theory', definition: 'Working memory has limited capacity — instructional design must manage intrinsic, extraneous, and germane cognitive load.' },
    ],
    frameworks: [
      { name: 'Bayesian Cognition', description: 'Models human inference as approximate Bayesian updating — prior beliefs revised with new evidence', whenToUse: 'When modeling decision-making under uncertainty or evaluating how people update beliefs' },
      { name: 'Connectionism', description: 'Cognitive processes modeled as parallel distributed processing in neural networks', whenToUse: 'When analyzing learning, memory, or pattern recognition in cognitive systems' },
      { name: 'Ecological Rationality', description: 'Heuristics are not biases but evolved adaptations matched to environmental structures (Gigerenzer)', whenToUse: 'When evaluating whether cognitive shortcuts are adaptive or maladaptive in specific contexts' },
    ],
    referencePapers: [
      { doi: '10.1126/science.185.4157.1124', title: 'Judgment Under Uncertainty: Heuristics and Biases', authors: ['Amos Tversky', 'Daniel Kahneman'], year: 1974, keyInsight: 'Systematic cognitive biases (anchoring, availability, representativeness) shape human judgment' },
      { doi: '10.1017/CBO9780511816796', title: 'Supersizing the Mind: Embodiment, Action, and Cognitive Extension', authors: ['Andy Clark'], year: 2008, keyInsight: 'Cognition extends beyond the brain into the body and environment' },
    ],
    dataSources: [
      { name: 'CogSci Proceedings', type: 'database', url: 'https://cognitivesciencesociety.org', coverage: 'Annual proceedings of the Cognitive Science Society — interdisciplinary research' },
      { name: 'OpenNeuro', type: 'dataset', url: 'https://openneuro.org', coverage: 'Open neuroimaging datasets (fMRI, EEG, MEG) for reproducible cognitive neuroscience' },
      { name: 'Many Labs Project', type: 'dataset', url: 'https://osf.io/wx7ck/', coverage: 'Large-scale replication studies of classic cognitive and social psychology findings' },
    ],
    methodology: {
      approach: 'Experimental cognitive psychology with computational modeling and neuroimaging validation',
      evidenceHierarchy: ['Meta-analyses of behavioral experiments', 'Pre-registered replications', 'Neuroimaging studies with behavioral validation', 'Single behavioral experiments', 'Computational simulations'],
      uncertaintyApproach: 'Bayesian analysis with effect size reporting and replication status assessment',
      minimumEvidence: 'At least 2 replicated findings or 1 meta-analysis',
    },
    qualityCriteria: {
      minSources: 6,
      minQuality: 65,
      requirePeerReview: true,
      maxSourceAge: 10,
      specialRequirements: ['Must check replication status of cited findings', 'Must assess sample sizes and power', 'Must distinguish lab effects from real-world generalization'],
    },
    standingQuestions: [
      'How should the replication crisis reshape our confidence in classic cognitive findings?',
      'Can predictive processing provide a unified theory of cognition?',
      'What are the cognitive mechanisms underlying misinformation susceptibility?',
    ],
    knownBiases: [
      'WEIRD participant pools in cognitive experiments',
      'Reverse inference fallacy in neuroimaging (brain region X active ≠ process Y)',
      'Publication bias toward novel/surprising findings',
      'Overgeneralization from lab to real-world cognition',
    ],
  },

  'behavioral-economics': {
    domain: 'behavioral-economics',
    researcherName: 'Dr. Dionysus (Διόνυσος)',
    keyConcepts: [
      { name: 'Prospect Theory', definition: 'Decision-making framework where losses loom larger than gains, probability weighting is nonlinear, and reference points matter (Kahneman & Tversky 1979).' },
      { name: 'Nudge Theory', definition: 'Choice architecture can steer behavior without restricting options — defaults, framing, social norms (Thaler & Sunstein 2008).' },
      { name: 'Present Bias', definition: 'Systematic overweighting of immediate rewards vs future outcomes — hyperbolic discounting explains procrastination and under-saving.' },
      { name: 'Mental Accounting', definition: 'People categorize and treat money differently depending on subjective criteria (source, intended use), violating fungibility.' },
      { name: 'Social Preferences', definition: 'People care about fairness, reciprocity, and inequality — not just self-interest (Fehr & Schmidt 1999).' },
    ],
    frameworks: [
      { name: 'Choice Architecture', description: 'Systematic design of decision environments — defaults, ordering, framing, feedback — to improve decisions', whenToUse: 'When designing policies or interventions to improve individual decision-making' },
      { name: 'EAST Framework', description: 'Behavioral Insights Team framework: Make it Easy, Attractive, Social, Timely', whenToUse: 'When designing practical behavioral interventions for policy implementation' },
      { name: 'Dual-Self Models', description: 'Formal models of self-control conflicts between present-biased and forward-looking selves', whenToUse: 'When analyzing addiction, savings, or health behavior where self-control matters' },
    ],
    referencePapers: [
      { doi: '10.2307/1914185', title: 'Prospect Theory: An Analysis of Decision under Risk', authors: ['Daniel Kahneman', 'Amos Tversky'], year: 1979, keyInsight: 'Losses hurt ~2x more than equivalent gains please — reference dependence shapes all decisions' },
      { doi: '10.1126/science.1232491', title: 'Poverty Impedes Cognitive Function', authors: ['Anandi Mani', 'et al.'], year: 2013, keyInsight: 'Scarcity itself taxes cognitive bandwidth, impairing decision quality' },
    ],
    dataSources: [
      { name: 'NBER Working Papers (Behavioral)', type: 'database', url: 'https://www.nber.org/papers?page=1&perPage=50&q=behavioral', coverage: 'Cutting-edge behavioral economics research before journal publication' },
      { name: 'ideas42', type: 'research', url: 'https://www.ideas42.org', coverage: 'Applied behavioral science projects — health, finance, education, criminal justice' },
      { name: 'Behavioural Insights Team', type: 'research', url: 'https://www.bi.team', coverage: 'UK government nudge unit — RCTs of behavioral interventions in public policy' },
    ],
    methodology: {
      approach: 'Field experiments (RCTs) combined with lab experiments and structural behavioral modeling',
      evidenceHierarchy: ['Large-scale field RCTs', 'Lab experiments with real stakes', 'Natural experiments', 'Survey experiments', 'Observational data with behavioral identification'],
      uncertaintyApproach: 'Pre-registration + exact p-values + effect sizes with confidence intervals',
      minimumEvidence: 'At least 1 field experiment or 2 well-powered lab studies',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 65,
      requirePeerReview: true,
      maxSourceAge: 10,
      specialRequirements: ['Must check for demand effects in lab studies', 'Must assess external validity of lab findings', 'Must consider ethical implications of nudges'],
    },
    standingQuestions: [
      'When do nudges backfire or have unintended consequences?',
      'How should libertarian paternalism balance autonomy and welfare?',
      'Can behavioral insights address systemic poverty or only individual-level decisions?',
    ],
    knownBiases: [
      'Lab-field gap — behavioral effects often smaller in real world',
      'Publication bias toward successful nudge interventions',
      'Neglect of heterogeneous treatment effects across populations',
      'Paternalism creep — nudges expanding into manipulation',
    ],
  },

  // ============================================================================
  // SPECIALIZED DOMAINS — 6 NEW KBs
  // ============================================================================

  'urban-studies': {
    domain: 'urban-studies',
    researcherName: 'Dr. Daedalus (Δαίδαλος)',
    keyConcepts: [
      { name: 'Urban Metabolism', definition: 'Cities as systems consuming resources (energy, water, materials) and producing outputs (waste, emissions) — framework for sustainable urban planning.' },
      { name: 'Transit-Oriented Development', definition: 'Urban design concentrating mixed-use development around public transit stations to reduce car dependency and sprawl.' },
      { name: 'Gentrification', definition: 'Neighborhood transformation through capital investment and demographic change — displacement of lower-income residents by wealthier newcomers.' },
      { name: 'Spatial Mismatch', definition: 'Disconnect between where low-income people live and where jobs are located, creating barriers to employment and social mobility (Kain 1968).' },
      { name: '15-Minute City', definition: 'Urban planning concept where all daily necessities (work, shopping, health, education, leisure) are accessible within 15 minutes by walking or cycling (Moreno).' },
    ],
    frameworks: [
      { name: 'New Urbanism', description: 'Design principles promoting walkable, mixed-use, diverse neighborhoods as alternative to car-dependent sprawl', whenToUse: 'When evaluating urban design proposals, zoning reform, or neighborhood-scale planning' },
      { name: 'Urban Resilience Framework', description: 'Capacity of urban systems to prepare for, respond to, and recover from shocks (climate, economic, health crises)', whenToUse: 'When assessing city vulnerability to climate change, pandemics, or economic disruption' },
      { name: 'Right to the City', description: 'Lefebvre\'s concept that urban inhabitants have a collective right to shape the city — participation, appropriation, and access', whenToUse: 'When evaluating urban governance, public space, or displacement/exclusion issues' },
    ],
    referencePapers: [
      { doi: '10.1111/1468-2427.12252', title: 'Planetary Urbanization and the Built Environment', authors: ['Neil Brenner'], year: 2014, keyInsight: 'Urbanization extends far beyond city boundaries — rural/urban binary is obsolete' },
      { doi: '10.1016/j.landurbplan.2016.09.025', title: 'Smart Cities: A Systematic Literature Review', authors: ['various'], year: 2017, keyInsight: 'Smart city initiatives must balance technology with social equity and governance' },
    ],
    dataSources: [
      { name: 'UN-Habitat Urban Data', type: 'dataset', url: 'https://data.unhabitat.org', coverage: 'Global urban indicators — housing, infrastructure, inequality, SDG 11 tracking' },
      { name: 'Lincoln Institute of Land Policy', type: 'research', url: 'https://www.lincolninst.edu', coverage: 'Land use policy, property taxation, urban economics research' },
      { name: 'OECD Metropolitan Database', type: 'dataset', url: 'https://stats.oecd.org/Index.aspx?DataSetCode=CITIES', coverage: 'Comparable metropolitan statistics across OECD countries' },
    ],
    methodology: {
      approach: 'Mixed methods — GIS spatial analysis, urban modeling, participatory research, comparative case studies',
      evidenceHierarchy: ['Longitudinal urban panel data', 'Quasi-experimental evaluations of urban policies', 'GIS spatial analysis', 'Comparative case studies', 'Qualitative community research'],
      uncertaintyApproach: 'Spatial sensitivity analysis with acknowledgment of contextual uniqueness of urban systems',
      minimumEvidence: 'At least 3 cities/contexts for comparative claims',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 60,
      requirePeerReview: true,
      maxSourceAge: 10,
      specialRequirements: ['Must consider equity and displacement effects', 'Must assess scalability across different urban contexts', 'Must include community perspective'],
    },
    standingQuestions: [
      'How can cities grow while preventing displacement of vulnerable populations?',
      'What urban forms best support decarbonization and resilience simultaneously?',
      'Can smart city technology reduce or does it deepen urban inequality?',
    ],
    knownBiases: [
      'Global North urban models applied uncritically to Global South cities',
      'Technology solutionism in smart city discourse',
      'Survivorship bias — studying successful cities while ignoring failures',
      'Developer-driven narratives dominating urban planning discourse',
    ],
  },

  bioethics: {
    domain: 'bioethics',
    researcherName: 'Dr. Asclepius (Ἀσκληπιός)',
    keyConcepts: [
      { name: 'Principlism', definition: 'Four principles of biomedical ethics: autonomy, beneficence, non-maleficence, justice — the dominant framework in clinical and research ethics (Beauchamp & Childress).' },
      { name: 'Informed Consent', definition: 'Ethical and legal requirement that individuals voluntarily agree to medical treatment or research participation based on adequate understanding.' },
      { name: 'Dual-Use Research', definition: 'Research that could be misused to cause harm (bioweapons, gain-of-function) — raises questions about scientific freedom vs biosecurity.' },
      { name: 'Enhancement vs Treatment', definition: 'Ethical distinction between restoring normal function (treatment) and augmenting beyond normal (enhancement) — blurred by genomics and neurotechnology.' },
      { name: 'Global Health Justice', definition: 'Equitable distribution of health resources, access to medicines, and clinical trial benefits across nations — challenges pharmaceutical IP regimes.' },
    ],
    frameworks: [
      { name: 'Belmont Principles', description: 'Research ethics framework: respect for persons, beneficence, justice — basis for IRB review of human subjects research', whenToUse: 'When evaluating research ethics, clinical trials, or human experimentation' },
      { name: 'Precautionary Principle (Bioethics)', description: 'When potential harm is severe or irreversible, take preventive action even without full scientific certainty', whenToUse: 'When assessing emerging biotechnologies (gene editing, synthetic biology, AI in healthcare)' },
      { name: 'Capabilities Approach (Health)', description: 'Health justice evaluated by whether people can achieve core health-related capabilities, not just access to services', whenToUse: 'When evaluating health equity, disability rights, or global health resource allocation' },
    ],
    referencePapers: [
      { doi: '10.1093/acprof:oso/9780199924585.001.0001', title: 'Principles of Biomedical Ethics (7th ed.)', authors: ['Tom Beauchamp', 'James Childress'], year: 2013, keyInsight: 'Four-principle framework remains the standard for resolving bioethical dilemmas' },
      { doi: '10.1038/d41586-019-00673-1', title: 'CRISPR babies: when will the world be ready?', authors: ['David Cyranoski'], year: 2019, keyInsight: 'He Jiankui case exposed governance gaps in human germline editing' },
    ],
    dataSources: [
      { name: 'Hastings Center Report', type: 'journal', url: 'https://www.thehastingscenter.org', coverage: 'Leading bioethics journal — clinical ethics, research ethics, public health ethics' },
      { name: 'WHO Ethics & Governance', type: 'reference', url: 'https://www.who.int/ethics', coverage: 'Global health ethics guidelines, pandemic ethics, genomics governance' },
      { name: 'Nuffield Council on Bioethics', type: 'research', url: 'https://www.nuffieldbioethics.org', coverage: 'UK independent bioethics body — genome editing, AI in healthcare, research ethics' },
    ],
    methodology: {
      approach: 'Normative analysis combining ethical theory, case analysis, stakeholder engagement, and empirical ethics',
      evidenceHierarchy: ['Systematic ethical analysis with multiple frameworks', 'Empirical bioethics (surveys/interviews on moral attitudes)', 'Case law and regulatory precedent', 'Expert consensus statements', 'Individual philosophical arguments'],
      uncertaintyApproach: 'Explicit mapping of contested values and reasonable disagreement zones',
      minimumEvidence: 'At least 2 ethical frameworks applied to the same issue',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 55,
      requirePeerReview: true,
      maxSourceAge: 15,
      specialRequirements: ['Must apply multiple ethical frameworks', 'Must consider vulnerable populations', 'Must assess cultural context of ethical norms'],
    },
    standingQuestions: [
      'Should human germline editing be permitted for non-therapeutic enhancement?',
      'How should AI diagnostic systems handle informed consent and explainability?',
      'What ethical framework should govern pandemic resource allocation?',
    ],
    knownBiases: [
      'Western bioethics frameworks assuming individual autonomy as supreme value',
      'Institutional review boards as compliance theater vs genuine ethical deliberation',
      'Pharmaceutical industry framing of access to medicines debates',
      'Neglect of disability perspectives in enhancement debates',
    ],
  },

  'complexity-science': {
    domain: 'complexity-science',
    researcherName: 'Dr. Proteus (Πρωτεύς)',
    keyConcepts: [
      { name: 'Emergence', definition: 'Macro-level patterns arising from micro-level interactions that cannot be predicted from individual components alone — the hallmark of complex systems.' },
      { name: 'Tipping Points', definition: 'Critical thresholds where small changes trigger large, potentially irreversible shifts in system behavior — relevant to climate, finance, and social systems.' },
      { name: 'Power Laws', definition: 'Statistical distributions where frequency decreases as a power of magnitude — found in earthquakes, city sizes, wealth distribution, network connectivity.' },
      { name: 'Feedback Loops', definition: 'Positive (amplifying) and negative (stabilizing) feedback mechanisms that drive nonlinear dynamics in complex systems.' },
      { name: 'Adaptive Systems', definition: 'Complex adaptive systems (CAS) where agents learn, adapt, and co-evolve — from immune systems to markets to ecosystems (Holland, Gell-Mann).' },
    ],
    frameworks: [
      { name: 'Agent-Based Modeling', description: 'Computational simulation of autonomous agents interacting according to rules, producing emergent macro-behavior', whenToUse: 'When analytical models are intractable or when emergence from heterogeneous agents matters' },
      { name: 'Network Science', description: 'Analysis of systems through graph theory — degree distributions, clustering, centrality, community structure', whenToUse: 'When analyzing contagion, influence, resilience, or structure of interconnected systems' },
      { name: 'Nonlinear Dynamics', description: 'Mathematical analysis of systems with disproportionate responses — bifurcations, chaos, attractors, phase transitions', whenToUse: 'When analyzing systems that exhibit sudden regime changes, oscillations, or chaotic behavior' },
    ],
    referencePapers: [
      { doi: '10.1126/science.284.5411.87', title: 'Emergence of Scaling in Random Networks', authors: ['Albert-László Barabási', 'Réka Albert'], year: 1999, keyInsight: 'Many real networks follow power-law degree distributions — preferential attachment mechanism' },
      { doi: '10.1038/nature08227', title: 'Tipping elements in the Earth\'s climate system', authors: ['Timothy Lenton', 'et al.'], year: 2008, keyInsight: 'Multiple climate subsystems have tipping points that could trigger cascading failures' },
    ],
    dataSources: [
      { name: 'Santa Fe Institute', type: 'research', url: 'https://www.santafe.edu', coverage: 'Leading complexity research institute — foundational papers, working papers, complexity explorer' },
      { name: 'NetLogo Models Library', type: 'tool', url: 'https://ccl.northwestern.edu/netlogo/models/', coverage: 'Agent-based model library covering social, biological, and physical complex systems' },
      { name: 'Complexity Science Hub Vienna', type: 'research', url: 'https://www.csh.ac.at', coverage: 'European complexity science research — social systems, economics, health' },
    ],
    methodology: {
      approach: 'Computational modeling (ABM, network simulation) validated against empirical data, with analytical theory where possible',
      evidenceHierarchy: ['Empirically validated computational models', 'Statistical analysis of real-world complex systems', 'Analytical mathematical models', 'Stylized computational models', 'Qualitative systems analysis'],
      uncertaintyApproach: 'Ensemble simulation with sensitivity analysis on model parameters and initial conditions',
      minimumEvidence: 'At least 1 validated model + 1 empirical dataset showing predicted patterns',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 60,
      requirePeerReview: true,
      maxSourceAge: 10,
      specialRequirements: ['Must distinguish genuine complexity from mere complication', 'Must validate models against empirical data', 'Must assess robustness of findings to model assumptions'],
    },
    standingQuestions: [
      'Can we develop early warning signals for tipping points in social and ecological systems?',
      'How do cascading failures propagate across interconnected infrastructure networks?',
      'What universal principles govern the emergence of cooperation in complex adaptive systems?',
    ],
    knownBiases: [
      'Overfitting complex models to historical data (curse of dimensionality)',
      'Seeing complexity where simpler explanations suffice (Occam\'s razor violation)',
      'Power law fitting without rigorous statistical testing',
      'Neglect of boundary conditions and external forcing in systems models',
    ],
  },

  'computational-social-science': {
    domain: 'computational-social-science',
    researcherName: 'Dr. Arachne (Ἀράχνη)',
    keyConcepts: [
      { name: 'Digital Trace Data', definition: 'Behavioral data generated as byproduct of digital interactions — social media posts, web browsing, mobile location — enabling large-scale social analysis.' },
      { name: 'Natural Language Processing for Social Science', definition: 'Using NLP (topic models, sentiment analysis, word embeddings) to analyze large text corpora for social patterns.' },
      { name: 'Algorithmic Fairness', definition: 'Ensuring machine learning systems do not discriminate — tensions between different fairness definitions (demographic parity, equalized odds, individual fairness).' },
      { name: 'Social Simulation', definition: 'Agent-based models of social phenomena — segregation (Schelling), cooperation (Axelrod), opinion dynamics, diffusion of innovation.' },
      { name: 'Causal Inference from Observational Data', definition: 'Methods to extract causal relationships from non-experimental data — instrumental variables, regression discontinuity, difference-in-differences, synthetic control.' },
    ],
    frameworks: [
      { name: 'Computational Text Analysis', description: 'Pipeline: preprocessing → representation (TF-IDF, embeddings) → analysis (topic modeling, classification, clustering)', whenToUse: 'When analyzing large text corpora for political discourse, media framing, or cultural trends' },
      { name: 'Network Analysis Pipeline', description: 'Data collection → network construction → structural analysis → community detection → dynamic evolution', whenToUse: 'When mapping social structures, information diffusion, or influence networks' },
      { name: 'Machine Learning for Social Prediction', description: 'Supervised learning for social outcome prediction with emphasis on interpretability and fairness', whenToUse: 'When predicting social outcomes (crime, health, mobility) while assessing ethical implications' },
    ],
    referencePapers: [
      { doi: '10.1126/science.aaz8170', title: 'Computational Social Science: Obstacles and Opportunities', authors: ['David Lazer', 'et al.'], year: 2020, keyInsight: 'CSS must address reproducibility, ethics, and theory integration to fulfill its potential' },
      { doi: '10.1038/s41586-021-03660-7', title: 'Using social and behavioural science to support COVID-19 pandemic response', authors: ['Jay Van Bavel', 'et al.'], year: 2020, keyInsight: 'Computational social science can rapidly inform pandemic policy through digital data analysis' },
    ],
    dataSources: [
      { name: 'ICPSR', type: 'dataset', url: 'https://www.icpsr.umich.edu', coverage: 'Largest social science data archive — 16,000+ studies, survey data, geospatial data' },
      { name: 'Social Science One', type: 'dataset', url: 'https://socialscience.one', coverage: 'Academic access to industry data (Facebook, etc.) for social science research' },
      { name: 'Pushshift', type: 'dataset', url: 'https://pushshift.io', coverage: 'Reddit data archive for computational social science — billions of comments and posts' },
    ],
    methodology: {
      approach: 'Computational methods (ML, NLP, network analysis) applied to social questions with theory-driven hypothesis testing',
      evidenceHierarchy: ['Pre-registered computational studies with held-out test sets', 'Replicated computational findings across platforms/datasets', 'Novel computational analysis with robustness checks', 'Exploratory data analysis', 'Proof-of-concept models'],
      uncertaintyApproach: 'Cross-validation + bootstrapped confidence intervals + out-of-sample prediction evaluation',
      minimumEvidence: 'At least 2 independent datasets or 1 dataset with rigorous robustness checks',
    },
    qualityCriteria: {
      minSources: 5,
      minQuality: 60,
      requirePeerReview: false,
      maxSourceAge: 7,
      specialRequirements: ['Must assess data representativeness and platform bias', 'Must report model interpretability', 'Must evaluate fairness implications'],
    },
    standingQuestions: [
      'How can computational social science maintain theoretical rigor while leveraging big data?',
      'What are the privacy and consent implications of digital trace data research?',
      'Can large language models serve as valid models of human social behavior?',
    ],
    knownBiases: [
      'Platform-dependent findings not generalizing to other platforms or offline',
      'Sampling bias in digital trace data (not everyone is online equally)',
      'Algorithmic confounding from platform recommendation systems',
      'Measurement validity — digital proxies may not capture intended constructs',
    ],
  },

  'development-economics': {
    domain: 'development-economics',
    researcherName: 'Dr. Demeter (Δημήτηρ)',
    keyConcepts: [
      { name: 'Randomized Controlled Trials (RCTs)', definition: 'Gold standard for evaluating development interventions — random assignment to treatment/control groups to estimate causal impact (Banerjee & Duflo).' },
      { name: 'Structural Transformation', definition: 'Economy-wide shift from agriculture to industry to services — the classic development pathway, now questioned in age of premature deindustrialization.' },
      { name: 'Institutional Quality', definition: 'Inclusive vs extractive institutions as fundamental determinant of long-run development — property rights, rule of law, governance (Acemoglu & Robinson).' },
      { name: 'Human Capital Theory', definition: 'Investment in education and health as driver of productivity and economic growth — returns to education, health shocks, nutrition interventions.' },
      { name: 'Resource Curse', definition: 'Paradox where resource-rich countries often have slower growth — Dutch disease, rent-seeking, institutional deterioration (Sachs & Warner).' },
    ],
    frameworks: [
      { name: 'J-PAL Evaluation Methodology', description: 'Rigorous impact evaluation using RCTs, power calculations, pre-analysis plans, and external validity assessment', whenToUse: 'When evaluating specific development interventions (education, health, microfinance, governance)' },
      { name: 'Growth Diagnostics', description: 'Hausmann-Rodrik-Velasco framework: identify binding constraints to growth through decision tree analysis', whenToUse: 'When diagnosing why a country is not growing and prioritizing policy reforms' },
      { name: 'Capability Approach', description: 'Sen\'s framework evaluating development by expansion of human freedoms and capabilities, not just income', whenToUse: 'When assessing development beyond GDP — multidimensional poverty, inequality, well-being' },
    ],
    referencePapers: [
      { doi: '10.1257/aer.91.5.1369', title: 'The Colonial Origins of Comparative Development', authors: ['Daron Acemoglu', 'Simon Johnson', 'James Robinson'], year: 2001, keyInsight: 'Institutional quality (shaped by colonial history) is the fundamental cause of development differences' },
      { doi: '10.1126/science.1232491', title: 'Poor Economics: A Radical Rethinking of the Way to Fight Global Poverty', authors: ['Abhijit Banerjee', 'Esther Duflo'], year: 2011, keyInsight: 'Micro-level RCTs reveal that poverty traps operate through specific mechanisms, not just lack of resources' },
    ],
    dataSources: [
      { name: 'World Bank Open Data', type: 'dataset', url: 'https://data.worldbank.org', coverage: 'Comprehensive development indicators — 1400+ indicators for 217 economies' },
      { name: 'J-PAL Evidence Review', type: 'research', url: 'https://www.povertyactionlab.org/evidence-review', coverage: 'Systematic reviews of RCT evidence on development interventions' },
      { name: 'Penn World Table', type: 'dataset', url: 'https://www.rug.nl/ggdc/productivity/pwt/', coverage: 'Cross-country GDP, capital, productivity data — essential for growth regressions' },
      { name: 'UNDP Human Development Reports', type: 'report', url: 'https://hdr.undp.org', coverage: 'HDI rankings, multidimensional poverty data, capability-based development metrics' },
    ],
    methodology: {
      approach: 'Causal inference through RCTs and quasi-experimental methods, complemented by structural modeling',
      evidenceHierarchy: ['Well-powered RCTs with long-term follow-up', 'Quasi-experimental studies (RDD, IV, DiD)', 'Cross-country growth regressions with instruments', 'Case studies with process tracing', 'Descriptive statistics and correlations'],
      uncertaintyApproach: 'Standard errors clustered at appropriate level + explicit discussion of external validity',
      minimumEvidence: 'At least 1 RCT or quasi-experiment, or 3 correlational studies with robustness checks',
    },
    qualityCriteria: {
      minSources: 6,
      minQuality: 65,
      requirePeerReview: true,
      maxSourceAge: 12,
      specialRequirements: ['Must assess external validity across contexts', 'Must consider political economy constraints', 'Must distinguish correlation from causation in cross-country data'],
    },
    standingQuestions: [
      'Can developing countries industrialize in the age of automation and AI?',
      'What explains the divergence of development trajectories in Sub-Saharan Africa?',
      'How should climate adaptation be financed in the most vulnerable countries?',
    ],
    knownBiases: [
      'RCT fetishism — overvaluing micro interventions while ignoring structural factors',
      'Washington Consensus residuals in policy recommendations',
      'Neglect of power dynamics in donor-recipient relationships',
      'External validity limitations of context-specific RCTs',
    ],
  },

  'risk-analysis': {
    domain: 'risk-analysis',
    researcherName: 'Dr. Cassandra (Κασσάνδρα)',
    keyConcepts: [
      { name: 'Value at Risk (VaR)', definition: 'Maximum expected loss at a given confidence level over a given time period — standard risk measure, but fails to capture tail risk.' },
      { name: 'Systemic Risk', definition: 'Risk that failure of one entity triggers cascading failures across an interconnected system — too-big-to-fail, contagion, fire sales.' },
      { name: 'Black Swan Events', definition: 'Rare, high-impact events that are unpredictable by standard models — fat tails, Knightian uncertainty (Taleb 2007).' },
      { name: 'Expected Shortfall (CVaR)', definition: 'Average loss beyond VaR threshold — captures tail risk better than VaR and is coherent risk measure (satisfies subadditivity).' },
      { name: 'Scenario Planning', definition: 'Structured exploration of plausible futures — not forecasting but preparing for multiple contingencies (Shell method, Schwartz).' },
    ],
    frameworks: [
      { name: 'Enterprise Risk Management (ERM)', description: 'Holistic framework for identifying, assessing, and managing risks across an entire organization (COSO, ISO 31000)', whenToUse: 'When evaluating organizational risk governance or designing risk management systems' },
      { name: 'Extreme Value Theory', description: 'Statistical theory for modeling rare events in distribution tails — GEV, POT methods for estimating extreme quantiles', whenToUse: 'When modeling catastrophic losses, natural disasters, or financial crises' },
      { name: 'Swiss Cheese Model', description: 'Multi-layer defense model where failures align through multiple barriers — used in aviation, healthcare, nuclear safety', whenToUse: 'When analyzing cascading failures or designing multi-layer risk mitigation' },
    ],
    referencePapers: [
      { doi: '10.1111/j.1540-6261.2005.00741.x', title: 'An Empirical Analysis of the Dynamic Relation between Investment-Grade Bonds and Credit Default Swaps', authors: ['Roberto Blanco', 'et al.'], year: 2005, keyInsight: 'CDS spreads are leading indicators of credit risk — markets price risk faster than ratings agencies' },
      { doi: '10.1257/aer.99.4.1588', title: 'The Economics of Structured Finance', authors: ['Joshua Coval', 'Jakub Jurek', 'Erik Stafford'], year: 2009, keyInsight: 'Structured finance created systemic risk by concentrating correlation risk in senior tranches' },
    ],
    dataSources: [
      { name: 'BIS Statistics', type: 'dataset', url: 'https://www.bis.org/statistics/', coverage: 'Global banking, derivatives, credit, and financial market statistics' },
      { name: 'World Economic Forum Global Risks Report', type: 'report', url: 'https://www.weforum.org/publications/global-risks-report-2025', coverage: 'Annual assessment of top global risks — likelihood, impact, interconnections' },
      { name: 'EM-DAT International Disaster Database', type: 'dataset', url: 'https://www.emdat.be', coverage: 'Global natural and technological disaster data — frequency, impact, trends since 1900' },
      { name: 'Swiss Re Sigma', type: 'report', url: 'https://www.swissre.com/institute/research/sigma-research.html', coverage: 'Global catastrophe and insurance industry risk data and analysis' },
    ],
    methodology: {
      approach: 'Quantitative risk modeling (Monte Carlo, extreme value theory) with scenario-based stress testing and qualitative expert elicitation',
      evidenceHierarchy: ['Empirically calibrated quantitative risk models', 'Stress test results from regulatory exercises', 'Historical event analysis', 'Expert elicitation with structured protocols', 'Qualitative risk assessment'],
      uncertaintyApproach: 'Probability distributions (not point estimates), sensitivity analysis, and explicit Knightian uncertainty acknowledgment',
      minimumEvidence: 'At least 2 quantitative models or 1 model + historical validation',
    },
    qualityCriteria: {
      minSources: 6,
      minQuality: 65,
      requirePeerReview: true,
      maxSourceAge: 8,
      specialRequirements: ['Must distinguish risk from uncertainty', 'Must assess model assumptions and tail behavior', 'Must consider systemic and cascading effects'],
    },
    standingQuestions: [
      'How can we develop better early warning systems for systemic financial crises?',
      'What are the risk implications of AI systems making autonomous decisions in critical infrastructure?',
      'How should climate-related financial risk be integrated into regulatory frameworks?',
    ],
    knownBiases: [
      'Gaussian assumption in risk models — underestimates fat tails and Black Swans',
      'Recency bias — overweighting recent events in risk assessment',
      'Model risk — false confidence from sophisticated quantitative models',
      'Pro-cyclicality — risk measures that amplify rather than dampen market cycles',
    ],
  },

  // ── DEEP-DOMAIN LENSES (Sprint: 200-PhD knowledge layer) ──

  anthropology: {
    domain: 'anthropology',
    researcherName: 'Dr. Anthropos (Ἄνθρωπος)',
    keyConcepts: [
      { name: 'Cultural Relativism', definition: 'Understanding practices within their own cultural logic before judging them — Boas\'s foundational counter to ethnocentric ranking', importance: 'foundational', relatedConcepts: ['ethnocentrism', 'emic/etic', 'cultural particularism'] },
      { name: 'Thick Description', definition: 'Geertz\'s method — description that captures context and meaning, not just behavior; a wink vs a twitch', importance: 'foundational', relatedConcepts: ['interpretive anthropology', 'semiotics', 'fieldwork'] },
      { name: 'Social Structure & Kinship', definition: 'How kinship, lineage, and alliance organize societies — from Lévi-Strauss\'s alliance theory to segmentary lineage systems', importance: 'foundational', relatedConcepts: ['segmentary lineage', 'alliance theory', 'descent'] },
      { name: 'Political Order Beyond the State', definition: 'How stateless societies produce order — acephalous systems, big men, ritual authority; the anthropological answer to Hobbes', importance: 'advanced', relatedConcepts: ['acephalous societies', 'customary law', 'governance without government'] },
      { name: 'The Gift & Reciprocity', definition: 'Mauss — exchange creates social bonds; gifts are never free, they obligate. Reciprocity as the grammar of social cohesion', importance: 'foundational', relatedConcepts: ['potlatch', 'kula ring', 'obligation'] },
    ],
    frameworks: [
      { name: 'Emic/Etic Analysis', description: 'Distinguish the insider\'s own categories (emic) from the analyst\'s comparative categories (etic) — most policy failures come from applying etic categories as if they were emic', whenToUse: 'Analyzing any practice, norm, or institution in a different cultural context', steps: ['Document the practice as insiders describe it', 'Identify insider categories and logics', 'Translate to comparative categories without losing insider meaning', 'Flag where translation distorts'] },
      { name: 'Functionalist vs Interpretive Reading', description: 'Ask both: what does this practice DO (function, reproduction, adaptation) and what does it MEAN (symbol, identity, cosmology)', whenToUse: 'Analyzing rituals, norms, institutions', steps: ['Functional analysis: what problem does it solve?', 'Interpretive analysis: what does it mean to participants?', 'Note where the two readings diverge'] },
      { name: 'Scale Shift (Micro→Macro)', description: 'Move between village-level observation and global structure — the anthropological discipline of seeing the universal in the particular', whenToUse: 'Connecting local practices to global forces', steps: ['Describe the local phenomenon precisely', 'Identify the wider system it sits in', 'Trace how macro forces are locally reworked'] },
    ],
    referencePapers: [
      { title: 'The Interpretation of Cultures', authors: 'Clifford Geertz', year: 1973, journal: 'Basic Books', significance: 'Defined interpretive anthropology — culture as "webs of significance"; thick description as method' },
      { title: 'The Gift', authors: 'Marcel Mauss', year: 1925, journal: 'L\'Année Sociologique', significance: 'Reciprocity and obligation as the foundations of social order — still the reference on exchange' },
      { title: 'The Elementary Structures of Kinship', authors: 'Claude Lévi-Strauss', year: 1949, journal: 'PUF', significance: 'Structuralist analysis of kinship — alliance through exchange of women; foundation of structural anthropology' },
      { title: 'Seeing Like a State', authors: 'James C. Scott', year: 1998, journal: 'Yale University Press', significance: 'How states simplify societies into legible forms — and destroy local knowledge (metis) in the process' },
      { title: 'Europe and the People Without History', authors: 'Eric Wolf', year: 1982, journal: 'University of California Press', significance: 'Corrected anthropology\'s ahistorical bias — non-Western peoples were always inside global political economy' },
    ],
    dataSources: [
      { name: 'eHRAF World Cultures', type: 'database', description: 'Cross-cultural ethnographic database — systematic comparison across societies', coverage: 'global ethnography' },
      { name: 'Persee/Isidore', type: 'api', description: 'French humanities corpus — anthropological literature', coverage: 'francophone anthropology' },
      { name: 'OpenAlex anthropology filter', type: 'api', description: 'Concept-filtered scholarly works', coverage: 'peer-reviewed anthropology' },
    ],
    methodology: {
      approach: 'Interpretive-ethnographic — understand categories before comparing them',
      evidenceHierarchy: ['Ethnographic fieldwork', 'Comparative ethnography (eHRAF)', 'Historical sources', 'Survey/quantitative corroboration'],
      uncertaintyApproach: 'Cultural claims require emic grounding — flag where interpretation exceeds documentation',
      minimumEvidence: 'At least one ethnographic or historically-grounded source; never generalize from a single society',
    },
    qualityCriteria: {
      minSources: 8,
      minQuality: 65,
      requirePeerReview: false,
      maxSourceAge: 50,
      specialRequirements: ['Must distinguish emic from etic claims', 'Must flag ethnocentric framings', 'Must ground generalizations in named societies, not "culture" as abstraction'],
    },
    standingQuestions: [
      'How do stateless and customary institutions produce order where formal governance is weak?',
      'Which local knowledge systems (metis) are being destroyed by administrative legibility — and at what cost?',
      'How do reciprocity and gift economies persist inside market economies?',
    ],
    knownBiases: [
      'Ethnocentrism — judging practices by the analyst\'s own cultural categories',
      'Noble savage romanticism — idealizing non-Western societies as pristine or harmonious',
      'Ahistoricism — treating cultures as timeless essences rather than historical products',
      'Methodological nationalism — assuming societies are bounded units aligned with states',
    ],
  },

  history: {
    domain: 'history',
    researcherName: 'Dr. Historia (Ἱστορία)',
    keyConcepts: [
      { name: 'Longue Durée', definition: 'Braudel — history moves at three speeds: geographical/structural time, conjunctural time, event time. Events are foam on deeper currents', importance: 'foundational', relatedConcepts: ['Braudel', 'Annales school', 'structural time', 'conjuncture'] },
      { name: 'Path Dependence', definition: 'Early institutional choices constrain later options — contingency matters, small events lock in large structures', importance: 'foundational', relatedConcepts: ['critical junctures', 'lock-in', 'increasing returns'] },
      { name: 'Historical Institutionalism', definition: 'Institutions are carriers of history — Pierson, Thelen; timing and sequence explain outcomes that interest alone cannot', importance: 'advanced', relatedConcepts: ['sequencing', 'layering', 'institutional drift'] },
      { name: 'Contingency vs Structure', definition: 'The central historiographical tension — how much of an outcome was inevitable (structure) vs accidental (contingency)?', importance: 'foundational', relatedConcepts: ['counterfactuals', 'agency', 'determinism'] },
      { name: 'Anachronism & Presentism', definition: 'The cardinal sin — projecting present categories (nation, market, identity) onto periods where they did not exist', importance: 'foundational', relatedConcepts: ['periodization', 'historical context'] },
    ],
    frameworks: [
      { name: 'Braudelian Time Analysis', description: 'Decompose the phenomenon into its three temporal layers before analyzing events', whenToUse: 'Any question about change, crisis, or continuity', steps: ['Structural layer: what slow-moving conditions (geography, demography, technology) frame the event?', 'Conjunctural layer: what medium-term cycles (economic, political) are in play?', 'Event layer: what triggered the outcome now, and could another trigger have done the same?'] },
      { name: 'Counterfactual Probing', description: 'Test causal claims by asking what minimally-different world would produce a different outcome — disciplines claims of inevitability', whenToUse: 'Evaluating causal narratives', steps: ['State the causal claim', 'Construct the minimal counterfactual', 'Assess whether the outcome survives — if yes, the claimed cause was not decisive'] },
      { name: 'Precedent/Analogue Mapping', description: 'Locate the case in a reference class of historical analogues — Tetlock/GJP base rates come from this move', whenToUse: 'Forecasting or comparing cases', steps: ['Define the reference class precisely', 'Identify the 3-5 closest analogues', 'Note where the current case diverges from the class', 'Weight the base rate accordingly'] },
    ],
    referencePapers: [
      { title: 'The Mediterranean and the Mediterranean World in the Age of Philip II', authors: 'Fernand Braudel', year: 1949, journal: 'Colin', significance: 'The longue durée manifesto — geography and structure over events' },
      { title: 'The Structure of Scientific Revolutions', authors: 'Thomas Kuhn', year: 1962, journal: 'University of Chicago Press', significance: 'Paradigm shifts — knowledge advances by rupture, not accumulation' },
      { title: 'The Great Transformation', authors: 'Karl Polanyi', year: 1944, journal: 'Farrar & Rinehart', significance: 'Markets are instituted, not natural — the double movement of marketization and social protection' },
      { title: 'The Making of the English Working Class', authors: 'E.P. Thompson', year: 1963, journal: 'Gollancz', significance: 'Class as historical experience, not structural position — rescued agency from determinism' },
      { title: 'Imagined Communities', authors: 'Benedict Anderson', year: 1983, journal: 'Verso', significance: 'Nations as imagined communities — print-capitalism made nationalism thinkable' },
    ],
    dataSources: [
      { name: 'Persee/Isidore', type: 'api', description: 'French humanities corpus — Annales tradition and francophone historiography', coverage: 'francophone history' },
      { name: 'history provider (OpenAlex filtered)', type: 'api', description: 'Peer-reviewed historical literature', coverage: 'global historiography' },
      { name: 'HathiTrust/Internet Archive', type: 'database', description: 'Primary sources and digitized books', coverage: 'primary sources' },
    ],
    methodology: {
      approach: 'Source-critical — establish what the evidence can and cannot show before interpreting',
      evidenceHierarchy: ['Primary sources', 'Historiographical consensus (with debate map)', 'Quantitative/cliometric corroboration', 'Analogical reasoning'],
      uncertaintyApproach: 'Distinguish what is documented from what is inferred — mark interpretation layers explicitly',
      minimumEvidence: 'Claims about the past require primary or peer-reviewed historiography — no present-day analogy alone',
    },
    qualityCriteria: {
      minSources: 8,
      minQuality: 65,
      requirePeerReview: false,
      maxSourceAge: 100,
      specialRequirements: ['Must flag anachronistic framings', 'Must separate structure from event', 'Must acknowledge historiographical debates rather than asserting one reading'],
    },
    standingQuestions: [
      'Which present-day "novelties" are actually structural continuities — and which are true ruptures?',
      'What is the reference class for this phenomenon, and what does the base rate of the class imply?',
      'Where is path dependence doing hidden work in current institutional arrangements?',
    ],
    knownBiases: [
      'Presentism — reading current categories and concerns into the past',
      'Whig history — narrating the past as inevitable progress toward the present',
      'Great-man bias — attributing structural outcomes to individual decisions',
      'Survivorship bias in sources — the archive preserves the victors\' record',
    ],
  },

  "religious-studies": {
    domain: 'religious-studies',
    researcherName: 'Dr. Threskeia (Θρησκεία)',
    keyConcepts: [
      { name: 'Secularization Debate', definition: 'The contested thesis that modernization erodes religion — largely falsified outside Western Europe; "desecularization" (Berger\'s reversal) is the live position', importance: 'foundational', relatedConcepts: ['desecularization', 'post-secular', 'multiple modernities'] },
      { name: 'Political Theology', definition: 'How theological concepts migrate into political form — Schmitt: "all significant concepts of the modern theory of the state are secularized theological concepts"', importance: 'foundational', relatedConcepts: ['sovereignty', 'exception', 'messianism'] },
      { name: 'Lived Religion', definition: 'Religion as practiced, not as prescribed — the gap between official doctrine and everyday devotion', importance: 'advanced', relatedConcepts: ['popular religion', 'material religion', 'practice'] },
      { name: 'Civil Religion', definition: 'Bellah — the quasi-religious sacred symbols and rituals of the political community itself (constitutions, flags, martyrs)', importance: 'advanced', relatedConcepts: ['nationalism', 'sacred', 'ritual'] },
      { name: 'Religion as Social Fact', definition: 'Durkheim — religion is society worshipping itself; the sacred/profane distinction produces moral community', importance: 'foundational', relatedConcepts: ['collective effervescence', 'totemism', 'social cohesion'] },
    ],
    frameworks: [
      { name: 'Doctrine-Practice Gap Analysis', description: 'Separate official theology from lived practice — political effects flow from the latter', whenToUse: 'Any claim about what "a religion" does politically', steps: ['Identify the doctrinal position', 'Document actual practice/variation', 'Analyze which level drives the political outcome'] },
      { name: 'Political Theology Tracing', description: 'Trace political concepts back to theological sources — sovereignty, exception, sacrifice, martyrdom', whenToUse: 'Analyzing sacralized politics, nationalism, legitimacy', steps: ['Identify the political concept', 'Locate its theological genealogy', 'Assess whether the religious charge still operates'] },
      { name: 'Religious Market Analysis', description: 'Stark/Fi nke — treat religious vitality as a function of competition and supply, not just demand decline', whenToUse: 'Explaining revival, pluralization, switching', steps: ['Map the supply side (denominations, movements)', 'Assess competition and regulation', 'Explain vitality without assuming secularization'] },
    ],
    referencePapers: [
      { title: 'The Elementary Forms of Religious Life', authors: 'Émile Durkheim', year: 1912, journal: 'Alcan', significance: 'Religion as social glue — the sacred/profane distinction as the root of moral order' },
      { title: 'Political Theology', authors: 'Carl Schmitt', year: 1922, journal: 'Duncker & Humblot', significance: 'Sovereign as the one who decides the exception — secularized theology of state' },
      { title: 'The Protestant Ethic and the Spirit of Capitalism', authors: 'Max Weber', year: 1905, journal: 'Archiv', significance: 'Religious ethics shaping economic conduct — the template for religion-causality debates' },
      { title: 'The Desecularization of the World', authors: 'Peter L. Berger (ed.)', year: 1999, journal: 'Eerdmans', significance: 'The secularization thesis retracted by its own champion — religion resurges globally' },
      { title: 'A Secular Age', authors: 'Charles Taylor', year: 2007, journal: 'Harvard University Press', significance: 'Secularity as a condition of belief, not the absence of religion — the definitive genealogy' },
    ],
    dataSources: [
      { name: 'PhilPapers', type: 'api', description: 'Philosophy of religion and theology literature', coverage: 'peer-reviewed philosophy/theology' },
      { name: 'Persee/Isidore', type: 'api', description: 'French religious studies and history of religions', coverage: 'francophone scholarship' },
      { name: 'Pew Research Religion', type: 'dataset', description: 'Global religious demography and attitudes', coverage: 'quantitative religion data' },
    ],
    methodology: {
      approach: 'Non-confessional analysis — study religion as a social and political fact without adjudicating truth claims',
      evidenceHierarchy: ['Empirical religion data (Pew, ARDA)', 'Peer-reviewed religious studies', 'Historiography of religion', 'Primary religious texts (as objects of study)'],
      uncertaintyApproach: 'Never claim what a religion "really" teaches — report the range of internal interpretation',
      minimumEvidence: 'Claims about religious behavior require empirical data; claims about doctrine require primary texts in context',
    },
    qualityCriteria: {
      minSources: 8,
      minQuality: 65,
      requirePeerReview: false,
      maxSourceAge: 50,
      specialRequirements: ['Must distinguish doctrine from lived practice', 'Must avoid both apologetics and reductive dismissal', 'Must map internal diversity of the tradition'],
    },
    standingQuestions: [
      'Where is religion resurging as a political force, and through which institutional channels?',
      'Which secular political concepts still carry theological charge?',
      'How do religious markets respond to state regulation and pluralization?',
    ],
    knownBiases: [
      'Secularization assumption — treating religious decline as inevitable or complete',
      'Essentialism — treating religions as unified actors with single doctrines',
      'Western Protestant bias — using belief-centered religion as the template for all traditions',
      'Reductionism — explaining religion away as "really" economics or politics',
    ],
  },

  "non-western-philosophy": {
    domain: 'non-western-philosophy',
    researcherName: 'Dr. Gnosis (Γνῶσις)',
    keyConcepts: [
      { name: 'Confucian Order Ethics', definition: 'Order through ritual propriety (li), role ethics, and relational hierarchy — governance by exemplary virtue rather than law alone', importance: 'foundational', relatedConcepts: ['ren', 'li', 'junzi', 'harmony'] },
      { name: 'Daoist Wu-Wei', definition: 'Action through non-forcing — effective governance works with the grain of things; the strategic logic of indirect action', importance: 'foundational', relatedConcepts: ['wu-wei', 'ziran', 'strategic minimalism'] },
      { name: 'Buddhist Interdependence', definition: 'Pratītyasamutpāda — nothing exists independently; a systems-ontology predating complexity science by two millennia', importance: 'foundational', relatedConcepts: ['dependent origination', 'emptiness', 'middle way'] },
      { name: 'Ubuntu Ethics', definition: 'Southern African relational personhood — "I am because we are"; personhood constituted by community, grounding communitarian alternatives to liberal individualism', importance: 'advanced', relatedConcepts: ['communalism', 'relational personhood', 'consensus'] },
      { name: 'Islamic Jurisprudential Pluralism', definition: 'The madhhab system — multiple legitimate schools of interpretation (Hanafi, Maliki, Shafi\'i, Hanbali, Ja\'fari) with ijtihad as reasoning method', importance: 'advanced', relatedConcepts: ['ijtihad', 'fiqh', 'maqasid'] },
      { name: 'Non-Western IR Theory', definition: 'Zhao Tingyang\'s Tianxia, Kautilya\'s mandala, the relational turn — alternatives to Westphalian anarchy as the default world-order grammar', importance: 'emerging', relatedConcepts: ['tianxia', 'mandala', 'relational IR'] },
    ],
    frameworks: [
      { name: 'Tradition-Internal Analysis', description: 'Analyze a tradition\'s concepts on their own terms before translating to Western categories — the inverse of the anthropological emic rule', whenToUse: 'Any use of non-Western concepts', steps: ['State the concept in its tradition', 'Identify the Western category it is usually mapped to', 'Flag what the mapping loses'] },
      { name: 'Comparative Political Philosophy', description: 'Place traditions in genuine dialogue — same problem (order, justice, the good), different grammars', whenToUse: 'Institutional and normative comparison', steps: ['Define the shared problem', 'Present each tradition\'s answer in its own terms', 'Compare mechanisms, not just conclusions'] },
      { name: 'Concept Migration Tracking', description: 'Track how a concept mutates when adopted outside its tradition — ubuntu in policy, wu-wei in management, tianxia in IR', whenToUse: 'Evaluating "non-Western" framings in policy documents', steps: ['Identify the original concept', 'Document its migrated use', 'Assess fidelity and instrumentalization'] },
    ],
    referencePapers: [
      { title: 'The Analects', authors: 'Confucius', year: -475, journal: 'classical', significance: 'Role ethics and ritual order — the East Asian grammar of legitimate governance' },
      { title: 'Tao Te Ching', authors: 'Laozi', year: -400, journal: 'classical', significance: 'Wu-wei and indirect action — strategic thought that inverts Western command models' },
      { title: 'The Arthashastra', authors: 'Kautilya', year: -300, journal: 'classical', significance: 'Realist statecraft predating Machiavelli by 1800 years — mandala theory of interstate relations' },
      { title: 'Person and Community in African Traditional Thought', authors: 'Ifeanyi Menkiti', year: 1984, journal: 'in Menkiti/Gyekye debates', significance: 'The Ubuntu position — personhood as constituted by community' },
      { title: 'The Tianxia System', authors: 'Zhao Tingyang', year: 2005, journal: 'Jiangsu Education Press', significance: '"All-under-heaven" — a non-Westphalian world-order theory with real policy uptake in Beijing' },
      { title: 'Maqasid al-Shari\'a literature', authors: 'al-Shatibi / Auda', year: 1388, journal: 'classical-modern', significance: 'Objectives-based jurisprudence — purposive legal reasoning as Islamic method' },
    ],
    dataSources: [
      { name: 'PhilPapers', type: 'api', description: 'Comparative and non-Western philosophy literature', coverage: 'peer-reviewed philosophy' },
      { name: 'Chinese Text Project', type: 'database', description: 'Classical Chinese texts with translations', coverage: 'pre-Qin and Han texts' },
      { name: 'Isidore/Persee', type: 'api', description: 'Francophone scholarship on non-Western thought', coverage: 'oriental studies, african studies' },
    ],
    methodology: {
      approach: 'Comparative without flattening — traditions as genuine alternatives, not exotic illustrations',
      evidenceHierarchy: ['Primary texts in scholarly translation', 'Peer-reviewed comparative philosophy', 'Tradition-internal scholarship', 'Policy uptake documents'],
      uncertaintyApproach: 'Translations distort — flag concepts that resist Western categories (ren, li, ubuntu, tianxia)',
      minimumEvidence: 'Claims about a tradition require its primary texts or specialist scholarship — no secondhand popularizations',
    },
    qualityCriteria: {
      minSources: 8,
      minQuality: 65,
      requirePeerReview: false,
      maxSourceAge: 2500,
      specialRequirements: ['Must present traditions in their own terms first', 'Must avoid both orientalizing exoticism and forced Western mapping', 'Must name the school/tradition, not "Eastern thought" as bloc'],
    },
    standingQuestions: [
      'Where do non-Western order concepts (tianxia, ubuntu, wu-wei) offer mechanisms Western frameworks lack?',
      'Which governance claims would look different under Confucian relationality than under liberal individualism?',
      'How are non-Western concepts being instrumentalized in actual policy (Belt & Road tianxia, South African ubuntu jurisprudence)?',
    ],
    knownBiases: [
      'Orientalism — flattening traditions into mystical or static caricatures (Said\'s critique)',
      'Forced equivalence — translating concepts into the nearest Western term and losing the difference',
      'Bloc thinking — "Eastern thought" as if Confucian, Buddhist, Islamic, and African traditions were one',
      'Museumification — treating living traditions as finished historical artifacts',
    ],
  },

  // ── SUB-DISCIPLINE KBs (Sprint 19 — PhD-level granularity) ──

  sociology: {
    domain: 'sociology',
    researcherName: 'Dr. Demos (Δῆμος)',
    keyConcepts: [
      { name: 'Field & Habitus', definition: 'Bourdieu — social life as fields of struggle where positions and dispositions (habitus) interact; capital (economic, cultural, social, symbolic) is the currency', importance: 'foundational', relatedConcepts: ['capital forms', 'doxa', 'symbolic violence'] },
      { name: 'Institutional Isomorphism', definition: 'DiMaggio & Powell — organizations in a field converge through coercive, mimetic, and normative pressures, not efficiency', importance: 'foundational', relatedConcepts: ['new institutionalism', 'organizational fields'] },
      { name: 'Social Capital', definition: 'Resources embedded in networks — bonding (within-group) vs bridging (across-group); Coleman, Putnam, Bourdieu diverge on what it does', importance: 'foundational', relatedConcepts: ['networks', 'trust', 'civic engagement'] },
      { name: 'Anomie & Social Integration', definition: 'Durkheim — normlessness follows rapid change; suicide rates index the health of social bonds, not individual psychology alone', importance: 'foundational', relatedConcepts: ['social integration', 'collective conscience'] },
      { name: 'Social Closure', definition: 'Weber/Parkin — groups monopolize opportunities by excluding outsiders (credentials, licenses, citizenship)', importance: 'advanced', relatedConcepts: ['credentialism', 'exclusion', 'professionalization'] },
    ],
    frameworks: [
      { name: 'Field Analysis', description: 'Map the arena: positions, capitals at stake, dominant actors, rules of the game — then explain strategies', whenToUse: 'Institutional change, elite behavior, sectoral competition', steps: ['Define the field boundaries', 'Identify positions and capitals', 'Map dominant/dominated poles', 'Explain strategies as position-taking'] },
      { name: 'Stratification Decomposition', description: 'Decompose inequality into class, status, and power dimensions — not just income', whenToUse: 'Inequality claims', steps: ['Separate economic/cultural/social capital', 'Trace reproduction mechanisms', 'Identify closure points'] },
      { name: 'Movement Framing Analysis', description: 'Collective action succeeds by diagnostic, prognostic, motivational framing aligned with constituent identities', whenToUse: 'Protests, movements, mobilization', steps: ['Diagnostic frame (problem)', 'Prognostic frame (solution)', 'Motivational frame (call to act)', 'Frame resonance with audience'] },
    ],
    referencePapers: [
      { title: 'Distinction', authors: 'Pierre Bourdieu', year: 1979, journal: 'Minuit', significance: 'Taste as class weapon — the definitive account of cultural reproduction' },
      { title: 'Suicide', authors: 'Émile Durkheim', year: 1897, journal: 'Alcan', significance: 'The founding demonstration that social facts explain individual acts' },
      { title: 'The Logic of Collective Action', authors: 'Mancur Olson', year: 1965, journal: 'Harvard UP', significance: 'Free-rider problem — large groups cannot mobilize without selective incentives' },
      { title: 'Bowling Alone', authors: 'Robert Putnam', year: 2000, journal: 'Simon & Schuster', significance: 'Decline of American social capital — the reference on civic disengagement' },
      { title: 'The Strength of Weak Ties', authors: 'Mark Granovetter', year: 1973, journal: 'American Journal of Sociology', significance: 'Weak ties bridge structural holes — information flows through acquaintances, not intimates' },
    ],
    dataSources: [
      { name: 'sociology provider (SocINDEX/OpenAlex)', type: 'api', coverage: 'peer-reviewed sociology' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone sociology' },
      { name: 'World Bank indicators', type: 'api', coverage: 'comparative social data' },
    ],
    methodology: {
      approach: 'Structure before agency — locate actors in fields before explaining choices',
      evidenceHierarchy: ['Peer-reviewed sociology', 'Large-N survey data', 'Ethnography', 'Case studies'],
      uncertaintyApproach: 'Sociological claims need mechanism + population specification — no "society does X" without saying which society, which mechanism',
      minimumEvidence: 'Named population, named mechanism, comparative or longitudinal anchor',
    },
    qualityCriteria: {
      minSources: 10, minQuality: 65, requirePeerReview: true, maxSourceAge: 30,
      specialRequirements: ['Must specify the social mechanism', 'Must name the population scope', 'Must engage stratification/field dynamics where relevant'],
    },
    standingQuestions: [
      'Which institutions are undergoing isomorphism vs genuine differentiation?',
      'Where is social capital being built vs destroyed — and by which mechanism?',
      'What closure mechanisms are hardening (credentials, citizenship, platforms)?',
    ],
    knownBiases: [
      'Individualist reductionism — explaining structural outcomes by individual choices',
      'Functionalism — assuming every practice exists because it serves a function',
      'Survey-response artifacts — stated attitudes vs revealed behavior gap',
      'Western sample bias — most sociology generalizes from WEIRD populations',
    ],
  },

  psychology: {
    domain: 'psychology',
    researcherName: 'Dr. Psyche (Ψυχή)',
    keyConcepts: [
      { name: 'Prospect Theory', definition: 'Kahneman & Tversky — losses loom ~2× larger than gains; reference-dependent valuation, not expected utility', importance: 'foundational', relatedConcepts: ['loss aversion', 'framing effects', 'reference point'] },
      { name: 'Dual-Process Cognition', definition: 'System 1 (fast, associative, automatic) vs System 2 (slow, deliberate) — most judgment is System 1 with System 2 rationalizing', importance: 'foundational', relatedConcepts: ['heuristics', 'automaticity', 'cognitive ease'] },
      { name: 'Social Identity Theory', definition: 'Tajfel/Turner — minimal group assignment produces in-group favoritism; identity precedes interest', importance: 'foundational', relatedConcepts: ['in-group/out-group', 'self-categorization', 'polarization'] },
      { name: 'Motivated Reasoning', definition: 'Reasoning is goal-directed — people process evidence to reach preferred conclusions; sophistication can increase bias', importance: 'advanced', relatedConcepts: ['identity-protective cognition', 'confirmation bias'] },
      { name: 'Replication Crisis', definition: 'Priming, ego depletion, power posing failed replication — know which findings survived (cognitive biases core did)', importance: 'emerging', relatedConcepts: ['publication bias', 'p-hacking', 'registered reports'] },
    ],
    frameworks: [
      { name: 'Bias-to-Behavior Mapping', description: 'Name the mechanism, the conditions that trigger it, and the behavioral signature — not just "bias" as a label', whenToUse: 'Explaining collective behavior', steps: ['Which bias/heuristic?', 'What triggers it here?', 'What behavior does it predict?', 'What evidence would falsify?'] },
      { name: 'Identity-First Analysis', description: 'Ask whose identity is threatened before asking about interests — identity-protective cognition defeats factual correction', whenToUse: 'Polarization, resistance to evidence, policy backlash', steps: ['Identify threatened identity', 'Map the identity-protective response', 'Design identity-consonant framing'] },
      { name: 'Replication-Aware Weighting', description: 'Weight findings by replication status — pre-registered multi-lab replications > single famous studies', whenToUse: 'Citing psychological effects', steps: ['Check replication status (OSC 2015, Many Labs)', 'Prefer meta-analyses over single studies', 'Flag contested effects explicitly'] },
    ],
    referencePapers: [
      { title: 'Judgment under Uncertainty: Heuristics and Biases', authors: 'Tversky & Kahneman', year: 1974, journal: 'Science', significance: 'The canon of cognitive biases — availability, representativeness, anchoring' },
      { title: 'Prospect Theory', authors: 'Kahneman & Tversky', year: 1979, journal: 'Econometrica', significance: 'Reference-dependent choice — the foundation of behavioral economics' },
      { title: 'Social Identity Theory', authors: 'Tajfel & Turner', year: 1979, journal: 'in The Social Psychology of Intergroup Relations', significance: 'Minimal group paradigm — identity generates discrimination with no history or stakes' },
      { title: 'Thinking, Fast and Slow', authors: 'Daniel Kahneman', year: 2011, journal: 'FSG', significance: 'Dual-process synthesis — the reference on judgment architecture' },
      { title: 'Estimating the Reproducibility of Psychological Science', authors: 'Open Science Collaboration', year: 2015, journal: 'Science', significance: '36% replication rate — the disciplinary reckoning every citation must respect' },
    ],
    dataSources: [
      { name: 'psychology provider (PsycINFO/OpenAlex)', type: 'api', coverage: 'peer-reviewed psychology' },
      { name: 'PubMed', type: 'api', coverage: 'clinical/cognitive psychology' },
      { name: 'Semantic Scholar', type: 'api', coverage: 'citation network' },
    ],
    methodology: {
      approach: 'Mechanism-first — name the cognitive/motivational mechanism before claiming behavioral outcomes',
      evidenceHierarchy: ['Replicated experiments / Many Labs', 'Meta-analyses', 'Single well-powered studies', 'Correlational studies (flagged)'],
      uncertaintyApproach: 'Replication status conditions confidence — famous ≠ robust',
      minimumEvidence: 'Effect must have survived at least attempted replication or carry a caveat',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 65, requirePeerReview: true, maxSourceAge: 30,
      specialRequirements: ['Must check replication status of cited effects', 'Must distinguish System 1 intuition from System 2 reasoning claims', 'Must not extrapolate lab findings to field behavior without caveat'],
    },
    standingQuestions: [
      'Which biases survive replication and which are artifacts of small samples?',
      'How do identity-protective mechanisms scale from individual to collective polarization?',
      'Where does nudging work, where does it backfire (reactance), and why?',
    ],
    knownBiases: [
      'Fundamental attribution error — over-ascribing behavior to disposition vs situation',
      'WEIRD bias — most psychological findings come from Western, Educated, Industrialized, Rich, Democratic samples',
      'Named-effect seduction — citing a famous study whose effect failed to replicate',
      'Lab-to-field leap — assuming lab effects operate at the same magnitude in the wild',
    ],
  },

  "political-science": {
    domain: 'political-science',
    researcherName: 'Dr. Kratos (Κράτος)',
    keyConcepts: [
      { name: 'Veto Players', definition: 'Tsebelis — policy stability is a function of the number and ideological distance of actors who can block change', importance: 'foundational', relatedConcepts: ['institutional players', 'partisan players', 'policy gridlock'] },
      { name: 'Democratic Backsliding', definition: 'Regime erosion by elected incumbents via legal means — courts packed, media bought, elections tilted; coups are the exception, not the rule', importance: 'foundational', relatedConcepts: ['executive aggrandizement', 'competitive authoritarianism', 'institutional forbearance'] },
      { name: 'Polity IV / Regime Spectrum', definition: 'Regimes sit on autocracy-democracy continua; the middle zone (anocracy) is the most conflict-prone', importance: 'foundational', relatedConcepts: ['anocracy', 'hybrid regimes', 'consolidation'] },
      { name: 'Duverger\'s Law', definition: 'Single-member plurality systems produce two-party competition — electoral institutions mechanically structure party systems', importance: 'advanced', relatedConcepts: ['electoral systems', 'strategic voting', 'party fragmentation'] },
      { name: 'Political Opportunity Structure', definition: 'Movements succeed when elite divisions, access points, and repression decline align — not from grievances alone', importance: 'advanced', relatedConcepts: ['contentious politics', 'mobilization'] },
    ],
    frameworks: [
      { name: 'Veto-Player Mapping', description: 'Identify every actor who can block the proposed change and their ideological distance from the status quo', whenToUse: 'Assessing feasibility of reforms, treaty ratification, legislation', steps: ['List institutional veto points', 'List partisan veto players', 'Compute win-set size — small win-set = policy stability'] },
      { name: 'Backsliding Diagnostic', description: 'Check the regime against the backsliding checklist — court packing, media capture, electoral manipulation, norm erosion', whenToUse: 'Evaluating democratic health claims', steps: ['Courts: packed or independent?', 'Media: captured or pluralist?', 'Elections: level playing field?', 'Norms: forbearance or constitutional hardball?'] },
      { name: 'Polity-Type Calibration', description: 'Classify the regime on the autocracy-anocracy-democracy spectrum before predicting behavior — anocracies behave differently', whenToUse: 'Any cross-national comparison', steps: ['Assign regime type (Polity/V-Dem)', 'Note transition direction', 'Adjust behavioral expectations'] },
    ],
    referencePapers: [
      { title: 'How Democracies Die', authors: 'Levitsky & Ziblatt', year: 2018, journal: 'Crown', significance: 'Backsliding via legal erosion — mutual toleration and forbearance as the guardrails' },
      { title: 'Veto Players', authors: 'George Tsebelis', year: 2002, journal: 'Princeton UP', significance: 'The workhorse model of policy stability and change' },
      { title: 'Problems of Democratic Transition and Consolidation', authors: 'Linz & Stepan', year: 1996, journal: 'Johns Hopkins UP', significance: 'Transition is not consolidation — the definitive comparative treatment' },
      { title: 'Competitive Authoritarianism', authors: 'Levitsky & Way', year: 2010, journal: 'Cambridge UP', significance: 'The hybrid regime category — elections real but uneven playing field' },
      { title: 'Patterns of Democracy', authors: 'Arend Lijphart', year: 1999, journal: 'Yale UP', significance: 'Majoritarian vs consensus systems — institutional design consequences' },
    ],
    dataSources: [
      { name: 'political-science provider', type: 'api', coverage: 'peer-reviewed political science' },
      { name: 'V-Dem / Polity', type: 'dataset', coverage: 'regime metrics' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone political science' },
    ],
    methodology: {
      approach: 'Institutionalist — institutions structure incentives; behavior follows rules before it follows preferences',
      evidenceHierarchy: ['Peer-reviewed comparative politics', 'Regime datasets (V-Dem, Polity)', 'Case studies with process tracing', 'Journalistic accounts (context only)'],
      uncertaintyApproach: 'Regime classifications carry error — report the metric used and its contested cases',
      minimumEvidence: 'Regime claims must reference a classification (Polity/V-Dem) or systematic evidence',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 65, requirePeerReview: true, maxSourceAge: 30,
      specialRequirements: ['Must classify regime type before predicting behavior', 'Must distinguish backsliding from consolidation', 'Must map veto players for any feasibility claim'],
    },
    standingQuestions: [
      'Which democracies are on the backsliding checklist right now — and at which stage?',
      'Where do electoral institutions mechanically produce the observed party system?',
      'Which incumbent moves are legal-but-erosive vs outright authoritarian?',
    ],
    knownBiases: [
      'Democratic triumphalism — assuming electoral democracy is the stable default',
      'Coup bias — watching for dramatic seizures while legal erosion proceeds unnoticed',
      'Case-selection bias — studying democracies that survived vs the reference class',
      'Institutional determinism — rules matter but informal norms carry them',
    ],
  },

  demography: {
    domain: 'demography',
    researcherName: 'Dr. Plethysmos (Πληθυσμός)',
    keyConcepts: [
      { name: 'Demographic Transition', definition: 'Mortality falls first, fertility follows with a lag — the boom window between them reshapes economies and polities', importance: 'foundational', relatedConcepts: ['fertility transition', 'mortality decline', 'population boom'] },
      { name: 'Dependency Ratio', definition: 'Non-working (young + old) per working-age population — the fiscal and care burden math of every pension and health system', importance: 'foundational', relatedConcepts: ['aging', 'support ratio', 'fiscal sustainability'] },
      { name: 'Population Momentum', definition: 'Even at replacement fertility, populations keep growing for decades because the young cohorts are already born', importance: 'advanced', relatedConcepts: ['age structure', 'cohort effects'] },
      { name: 'Second Demographic Transition', definition: 'Post-industrial fertility falls below replacement driven by values change (individual autonomy, cohabitation), not just economics', importance: 'advanced', relatedConcepts: ['sub-replacement fertility', 'postponement'] },
      { name: 'Migration Systems', definition: 'Migration flows are structured systems with feedback (networks, diasporas), not random individual moves', importance: 'advanced', relatedConcepts: ['diaspora', 'remittances', 'brain drain'] },
    ],
    frameworks: [
      { name: 'Cohort-Component Reasoning', description: 'Think in cohorts, not stocks — today\'s 20-year-olds are tomorrow\'s pension burden; aging is baked into the age pyramid', whenToUse: 'Any population-projection claim', steps: ['Draw the age pyramid', 'Track cohorts forward', 'Compute dependency trajectory'] },
      { name: 'Fertility Decomposition', description: 'Separate quantum (how many children) from tempo (when) — postponement depresses TFR mechanically without changing completed fertility', whenToUse: 'Reading fertility statistics', steps: ['Check tempo effects', 'Check quantum', 'Distinguish period from cohort fertility'] },
      { name: 'Demographic Dividend Test', description: 'The dividend requires the age structure AND jobs — a youth bulge without employment is a fragility multiplier, not a dividend', whenToUse: 'Growth/instability claims about young countries', steps: ['Verify working-age share rising', 'Check labor absorption capacity', 'Assess education quality'] },
    ],
    referencePapers: [
      { title: 'An Essay on the Principle of Population', authors: 'Thomas Malthus', year: 1798, journal: 'J. Johnson', significance: 'The original resource-vs-population argument — wrong on timing, right on structure' },
      { title: 'The Second Demographic Transition', authors: 'Lesthaeghe & van de Kaa', year: 1986, journal: 'in Population and Development Review tradition', significance: 'Values-driven fertility decline below replacement' },
      { title: 'National Transfer Accounts', authors: 'Lee & Mason', year: 2011, journal: 'Population and Development Review', significance: 'The accounting framework for intergenerational resource flows' },
      { title: 'The Empty Cradle', authors: 'Phillip Longman', year: 2004, journal: 'Basic Books', significance: 'The political economy of below-replacement fertility' },
    ],
    dataSources: [
      { name: 'UN World Population Prospects', type: 'dataset', coverage: 'global projections' },
      { name: 'World Bank demographic indicators', type: 'api', coverage: 'country panels' },
      { name: 'INED/OpenAlex demography', type: 'api', coverage: 'peer-reviewed demography' },
    ],
    methodology: {
      approach: 'Actuarial discipline — project cohorts, don\'t extrapolate headlines',
      evidenceHierarchy: ['UN/WPP and national statistical offices', 'Peer-reviewed demography', 'Census/registers', 'Surveys'],
      uncertaintyApproach: 'Projections carry variant ranges — always report medium vs low/high fertility scenarios',
      minimumEvidence: 'Population claims require a named source (UN, national stats) and a variant, not a single number',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: false, maxSourceAge: 15,
      specialRequirements: ['Must distinguish period from cohort measures', 'Must report projection variants', 'Must not present momentum as destiny without conditions'],
    },
    standingQuestions: [
      'Which countries are crossing the dependency-ratio tipping point this decade?',
      'Where is sub-replacement fertility translating into actual population decline?',
      'Which migration systems are restructuring origin and destination demographics simultaneously?',
    ],
    knownBiases: [
      'Malthusian reflex — treating population growth as automatically catastrophic',
      'Period-cohort confusion — mistaking tempo effects for fertility collapse',
      'Projecting without momentum — ignoring that tomorrow\'s workers are already born',
      'Homogeneous-country assumption — fertility/aging differ by class and region within states',
    ],
  },

  criminology: {
    domain: 'criminology',
    researcherName: 'Dr. Dike (Δίκη)',
    keyConcepts: [
      { name: 'Routine Activities Theory', definition: 'Cohen & Felson — crime requires a motivated offender, a suitable target, and the absence of a capable guardian; opportunities, not just dispositions', importance: 'foundational', relatedConcepts: ['situational crime prevention', 'guardianship'] },
      { name: 'Crime Concentration', definition: 'Crime clusters tightly in places (hot spots ~5% of addresses produce ~50% of calls) and in people (cohort studies: ~6% of a cohort)', importance: 'foundational', relatedConcepts: ['hot spots', 'crime and place', 'power few'] },
      { name: 'Procedural Justice', definition: 'Tyler — legitimacy drives compliance more than deterrence; fair process produces law-abiding behavior', importance: 'foundational', relatedConcepts: ['legitimacy', 'police-community relations'] },
      { name: 'Deterrence Limits', definition: 'Certainty beats severity — the deterrent effect of punishment is modest and driven by certainty and celerity, not harshness', importance: 'foundational', relatedConcepts: ['celerity', 'severity', 'marginal deterrence'] },
      { name: 'Labeling & Desistance', definition: 'Formal punishment can entrench criminal identity (labeling); desistance follows turning points — work, marriage, aging out', importance: 'advanced', relatedConcepts: ['desistance', 'life-course', 'stigma'] },
    ],
    frameworks: [
      { name: 'Crime Triangle Analysis', description: 'Offender-target-guardian: which corner is failing, and which intervention targets it?', whenToUse: 'Explaining a crime pattern', steps: ['Map offenders', 'Map targets', 'Map guardianship gaps', 'Identify the cheapest corner to change'] },
      { name: 'Deterrence Calibration', description: 'Before recommending punishment, check certainty/celerity/severity separately — most proposals raise severity, the weakest lever', whenToUse: 'Evaluating penal policy', steps: ['Current certainty level?', 'Celerity (speed of consequence)?', 'Severity? Then marginal deterrent effect expected'] },
      { name: 'Legitimacy Audit', description: 'Assess whether the intervention builds or burns procedural legitimacy — coercion without legitimacy is self-defeating', whenToUse: 'Policing and sentencing proposals', steps: ['Voice (are people heard)?', 'Neutrality (consistent rules)?', 'Respect?', 'Trustworthy motives?'] },
    ],
    referencePapers: [
      { title: 'Crime and Punishment: An Economic Approach', authors: 'Gary Becker', year: 1968, journal: 'Journal of Political Economy', significance: 'Rational-choice crime — launched the deterrence economics literature' },
      { title: 'Why People Obey the Law', authors: 'Tom Tyler', year: 1990, journal: 'Yale UP', significance: 'Legitimacy > deterrence — the procedural justice canon' },
      { title: 'Crime in the Making', authors: 'Sampson & Laub', year: 1993, journal: 'Harvard UP', significance: 'Life-course criminology — turning points explain desistance' },
      { title: 'Hot Spots of Predatory Crime', authors: 'Sherman, Gartin & Buerger', year: 1989, journal: 'Criminology', significance: 'Crime is hyper-concentrated — the empirical basis of place-based policing' },
    ],
    dataSources: [
      { name: 'UNODC statistics', type: 'api', coverage: 'global crime/drug/homicide data' },
      { name: 'OpenAlex criminology', type: 'api', coverage: 'peer-reviewed' },
      { name: 'National crime statistics (FBI UCR, Eurostat)', type: 'dataset', coverage: 'official crime data' },
    ],
    methodology: {
      approach: 'Pattern-first — locate concentration in places/people before proposing causes',
      evidenceHierarchy: ['RCTs (Campbell Collaboration)', 'Quasi-experimental (natural experiments)', 'Longitudinal cohorts', 'Official statistics (with reporting-bias caveats)'],
      uncertaintyApproach: 'Crime data measures reporting + enforcement activity as much as crime — always caveat the dark figure',
      minimumEvidence: 'Official stats flagged for reporting bias; no crime-trend claim from a single year',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 65, requirePeerReview: true, maxSourceAge: 20,
      specialRequirements: ['Must caveat official statistics (dark figure)', 'Must separate certainty/severity in deterrence claims', 'Must distinguish correlation from the crime-drop literature'],
    },
    standingQuestions: [
      'Which crime categories are concentrating in which places — and what changed in guardianship?',
      'Where do legitimacy deficits predict compliance collapse?',
      'What does the international crime-drop tell us about causes that are NOT country-specific?',
    ],
    knownBiases: [
      'Severity bias — reaching for harsher punishment when certainty is the operative lever',
      'Dark-figure blindness — treating recorded crime as total crime',
      'Media amplification — sensational crimes are the rarest crimes',
      'Single-cause theories — crime trends are multi-causal (demography, policing, economy, lead…)',
    ],
  },

  education: {
    domain: 'education',
    researcherName: 'Dr. Paideia (Παιδεία)',
    keyConcepts: [
      { name: 'Achievement Gap Mechanics', definition: 'Gaps open early and compound — summer learning loss, preschool access, and within-school tracking are the proximate mechanisms', importance: 'foundational', relatedConcepts: ['summer slide', 'tracking', 'early childhood'] },
      { name: 'Human Capital vs Signaling', definition: 'Does education build skills (Becker) or signal ability (Spence)? The answer changes what interventions are worth funding', importance: 'foundational', relatedConcepts: ['sheepskin effects', 'returns to education'] },
      { name: 'Education Production Function', definition: 'Hanushek — money matters less than assumed once family background is controlled; teacher quality is the largest school-side lever', importance: 'advanced', relatedConcepts: ['inputs vs outcomes', 'teacher effects'] },
      { name: 'Cognitive Load & Explicit Instruction', definition: 'Working memory is the bottleneck — guided/explicit instruction outperforms discovery learning for novices (Kirschner/Sweller)', importance: 'advanced', relatedConcepts: ['cognitive load theory', 'direct instruction'] },
      { name: 'Zone of Proximal Development', definition: 'Vygotsky — learning happens at the edge of competence with scaffolding; neither too easy nor too hard', importance: 'foundational', relatedConcepts: ['scaffolding', 'mastery learning'] },
    ],
    frameworks: [
      { name: 'Gap Mechanism Tracing', description: 'Locate where the gap opens — access, instruction quality, summer, tracking — before prescribing', whenToUse: 'Inequality in outcomes', steps: ['When does the gap open?', 'Which mechanism (access/quality/time/tracking)?', 'Which intervention closes that specific mechanism?'] },
      { name: 'Returns Decomposition', description: 'Separate human capital from signaling in any education-return claim — sheepskin effects betray signaling', whenToUse: 'Education investment cases', steps: ['Compare completers vs almost-completers', 'Check screening/selection', 'Assess skill content of the credential'] },
      { name: 'Evidence Hierarchy for Pedagogy', description: 'RCTs and meta-analyses (Hattie is weak on method — prefer EEF/I R) over testimonials', whenToUse: 'Evaluating pedagogical claims', steps: ['What does the best evidence say?', 'Effect size + cost + implementation fidelity', 'Does it transfer to this context?'] },
    ],
    referencePapers: [
      { title: 'Human Capital', authors: 'Gary Becker', year: 1964, journal: 'University of Chicago Press', significance: 'Education as investment — the framework policy still runs on' },
      { title: 'Mind in Society', authors: 'Lev Vygotsky', year: 1978, journal: 'Harvard UP', significance: 'ZPD and scaffolding — the developmental foundation of pedagogy' },
      { title: 'Why Minimal Guidance Does Not Work', authors: 'Kirschner, Sweller & Clark', year: 2006, journal: 'Educational Psychologist', significance: 'The evidence against pure discovery learning' },
      { title: 'Visible Learning', authors: 'John Hattie', year: 2009, journal: 'Routledge', significance: 'The largest meta-analytic synthesis — useful map, contested method' },
    ],
    dataSources: [
      { name: 'ERIC', type: 'api', coverage: 'education research literature' },
      { name: 'OECD/PISA', type: 'dataset', coverage: 'international assessments' },
      { name: 'OpenAlex education', type: 'api', coverage: 'peer-reviewed' },
    ],
    methodology: {
      approach: 'Mechanism + effect size — name the learning mechanism and the measured effect before recommending',
      evidenceHierarchy: ['RCTs (EEF, IES WWC)', 'Meta-analyses', 'Quasi-experimental', 'Correlational (flagged)'],
      uncertaintyApproach: 'Education effect sizes are modest — flag implementation fidelity and context dependence',
      minimumEvidence: 'Intervention claims need at least quasi-experimental evidence; PISA correlations are descriptive',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 65, requirePeerReview: true, maxSourceAge: 20,
      specialRequirements: ['Must cite effect sizes, not just direction', 'Must distinguish access from quality', 'Must note PISA\'s descriptive (non-causal) status'],
    },
    standingQuestions: [
      'Which interventions have the best cost-adjusted effect on the achievement gap?',
      'Where is credential inflation outpacing skill formation (signaling)?',
      'What does the post-pandemic learning loss evidence actually show by subgroup?',
    ],
    knownBiases: [
      'Silver-bullet pedagogy — single interventions claimed to transform outcomes',
      'Correlation-causation in international comparisons (PISA league-table reasoning)',
      'Credentialist drift — equating years of schooling with skills',
      'Ignoring family background — school effects are real but bounded',
    ],
  },

  philosophy: {
    domain: 'philosophy',
    researcherName: 'Dr. Sophia (Σοφία)',
    keyConcepts: [
      { name: 'Reflective Equilibrium', definition: 'Rawls/Goodman — justify moral claims by moving back and forth between intuitions and principles until they cohere; not deduction from self-evident axioms', importance: 'foundational', relatedConcepts: ['coherence', 'considered judgments', 'justification'] },
      { name: 'The Normative Triad', definition: 'Consequentialism (outcomes), deontology (duties/constraints), virtue ethics (character) — most normative disputes reduce to which framework is doing the work', importance: 'foundational', relatedConcepts: ['utility', 'dignity', 'flourishing'] },
      { name: 'Is-Ought Gap', definition: 'Hume — no valid inference from descriptive to normative premises without a bridge principle; detect when "is" smuggles "ought"', importance: 'foundational', relatedConcepts: ['naturalistic fallacy', 'normativity'] },
      { name: 'Gettier & the Knowledge Problem', definition: 'Justified true belief isn\'t sufficient for knowledge — lucky inferences break the analysis; epistemology\'s controlling counterexample', importance: 'advanced', relatedConcepts: ['epistemic luck', 'justification', 'reliabilism'] },
      { name: 'Veil of Ignorance', definition: 'Rawls — legitimate principles are those chosen without knowing one\'s position; a device for impartiality, not an endorsement of redistribution per se', importance: 'foundational', relatedConcepts: ['original position', 'impartiality', 'difference principle'] },
    ],
    frameworks: [
      { name: 'Normative Framework Explicitation', description: 'Make the operative ethical framework explicit before judging — most disagreements are framework clashes, not factual disputes', whenToUse: 'Any normative/policy claim', steps: ['Identify the operative framework (conseq/deont/virtue)', 'State what it implies here', 'Check what the rival frameworks say', 'Note where the conclusion is framework-dependent'] },
      { name: 'Is-Ought Auditing', description: 'Flag every inference from empirical premise to normative conclusion — require an explicit bridge principle', whenToUse: 'Policy arguments grounded in "the science" or "nature"', steps: ['List the empirical premises', 'Find where "ought" enters', 'Demand the bridge principle be stated'] },
      { name: 'Thought-Experiment Stress Test', description: 'Test principles against boundary cases — trolleys, ticking bombs, repugnant conclusions — to find where they break', whenToUse: 'Validating a proposed principle', steps: ['State the principle', 'Construct the hard case', 'Does the principle survive or produce absurdity?'] },
    ],
    referencePapers: [
      { title: 'A Theory of Justice', authors: 'John Rawls', year: 1971, journal: 'Harvard UP', significance: 'Justice as fairness — the reference point for 50 years of political philosophy' },
      { title: 'An Enquiry Concerning Human Understanding', authors: 'David Hume', year: 1748, journal: 'London', significance: 'Is-ought gap + induction problem — the twin foundations of epistemic humility' },
      { title: 'Is Justified True Belief Knowledge?', authors: 'Edmund Gettier', year: 1963, journal: 'Analysis', significance: 'Three pages that broke the standard analysis of knowledge' },
      { title: 'Naming and Necessity', authors: 'Saul Kripke', year: 1972, journal: 'Blackwell', significance: 'Rigid designation — transformed modal logic and philosophy of language' },
      { title: 'The Sources of Normativity', authors: 'Christine Korsgaard', year: 1996, journal: 'Cambridge UP', significance: 'The Kantian case for why anything can obligate at all' },
    ],
    dataSources: [
      { name: 'PhilPapers', type: 'api', coverage: 'peer-reviewed philosophy' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone philosophy' },
      { name: 'Stanford Encyclopedia of Philosophy', type: 'reference', coverage: 'authoritative entries' },
    ],
    methodology: {
      approach: 'Argumentative rigor — premises explicit, inferences valid, counterexamples hunted',
      evidenceHierarchy: ['Peer-reviewed philosophy', 'Canonical primary texts', 'SEP/reference works', 'Empirical evidence where the claim is empirical'],
      uncertaintyApproach: 'Philosophical positions carry named schools — attribute, don\'t assert ("utilitarians hold…" not "the truth is…")',
      minimumEvidence: 'Normative claims need the framework stated; empirical claims go to the relevant science',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 70, requirePeerReview: false, maxSourceAge: 2500,
      specialRequirements: ['Must name the ethical framework in use', 'Must attribute contested positions to schools', 'Must not present one framework\'s conclusion as neutral fact'],
    },
    standingQuestions: [
      'Which normative framework is silently doing the work in this policy debate?',
      'Where are empirical premises being laundered into normative conclusions?',
      'What does the hard case reveal about the principle being proposed?',
    ],
    knownBiases: [
      'Framework smuggling — presenting one ethical theory\'s output as neutral',
      'Intuition overfitting — treating contested intuitions as data',
      'Anachronistic reading — imposing modern categories on historical texts',
      'Western canon bias — defaulting to Anglo-European philosophy as "philosophy" tout court',
    ],
  },

  linguistics: {
    domain: 'linguistics',
    researcherName: 'Dr. Glossa (Γλῶσσα)',
    keyConcepts: [
      { name: 'Framing & Metaphor', definition: 'Lakoff — frames are cognitive structures; metaphorical thinking is constitutive, not decorative ("argument IS war")', importance: 'foundational', relatedConcepts: ['conceptual metaphor', 'frame semantics', 'moral framing'] },
      { name: 'Speech Acts', definition: 'Austin/Searle — utterances DO things (promise, order, declare); meaning exceeds literal content', importance: 'foundational', relatedConcepts: ['performatives', 'illocution', 'felicity conditions'] },
      { name: 'Gricean Maxims & Implicature', definition: 'Meaning is inferred through cooperative maxims (quantity, quality, relevance, manner) — violations generate implicature', importance: 'advanced', relatedConcepts: ['implicature', 'presupposition', 'cooperative principle'] },
      { name: 'Critical Discourse Analysis', definition: 'Fairclough/van Dijk — discourse constructs power relations; lexical choice, passivization, nominalization conceal or assign agency', importance: 'advanced', relatedConcepts: ['ideology', 'hegemony', 'representation'] },
      { name: 'Language Ideology', definition: 'Beliefs about language (standard=correct, dialect=deficient) are political positions wearing linguistic dress', importance: 'advanced', relatedConcepts: ['standardization', 'linguistic capital', 'multilingualism'] },
    ],
    frameworks: [
      { name: 'Frame Inventory', description: 'Extract the operative frames and metaphors in a discourse — they pre-structure what conclusions are thinkable', whenToUse: 'Analyzing political/media texts', steps: ['List the metaphors in use', 'Identify which frames they activate', 'What does the frame foreground/background?'] },
      { name: 'Agency Audit', description: 'Who is grammatically erased? Passives and nominalizations hide responsible actors', whenToUse: 'Accountability language analysis', steps: ['Find passives/nominalizations', 'Reconstruct the deleted agent', 'Ask why the construction was chosen'] },
      { name: 'Presupposition Excavation', description: 'Surface what a text treats as already-true — presuppositions do the quiet ideological work', whenToUse: 'Propaganda and framing analysis', steps: ['Extract presupposed content', 'Mark what is asserted vs assumed', 'Assess what the assumed content smuggles in'] },
    ],
    referencePapers: [
      { title: 'How to Do Things with Words', authors: 'J.L. Austin', year: 1962, journal: 'Clarendon', significance: 'Speech act theory — utterances as actions' },
      { title: 'Metaphors We Live By', authors: 'Lakoff & Johnson', year: 1980, journal: 'University of Chicago Press', significance: 'Conceptual metaphor — thought itself is metaphorically structured' },
      { title: 'Logic and Conversation', authors: 'H.P. Grice', year: 1975, journal: 'in Syntax and Semantics', significance: 'Implicature — how we mean more than we say' },
      { title: 'Language and Power', authors: 'Norman Fairclough', year: 1989, journal: 'Longman', significance: 'CDA manifesto — discourse as the site of power' },
    ],
    dataSources: [
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone linguistics' },
      { name: 'OpenAlex linguistics', type: 'api', coverage: 'peer-reviewed' },
      { name: 'Semantic Scholar', type: 'api', coverage: 'CL/NLP literature' },
    ],
    methodology: {
      approach: 'Text-internal first — analyze the linguistic structure before importing political claims about it',
      evidenceHierarchy: ['Corpus analysis', 'Peer-reviewed linguistics', 'Discourse analysis with quoted evidence', 'Native-speaker judgment (flagged)'],
      uncertaintyApproach: 'Interpretive claims need quoted textual evidence — no frame attribution without the frame\'s lexical traces',
      minimumEvidence: 'Discourse claims require quoted text; quantitative claims require corpus data',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: false, maxSourceAge: 50,
      specialRequirements: ['Must quote the analyzed text', 'Must distinguish assertion from presupposition', 'Must not conflate linguistic description with political verdict'],
    },
    standingQuestions: [
      'Which frames structure this debate, and who benefits from their dominance?',
      'Where are agents being grammatically erased from descriptions of harm?',
      'How do platform affordances (character limits, algorithms) reshape discourse form?',
    ],
    knownBiases: [
      'Over-reading ideology — finding oppression in every grammatical choice',
      'Standard-language bias — treating the prestige variety as linguistically superior',
      'Literalism — missing implicature and metaphor because they are not "in the words"',
      'Monolingual assumption — analyzing as if translation were transparent',
    ],
  },

  "media-studies": {
    domain: 'media-studies',
    researcherName: 'Dr. Angelia (Ἀγγελία)',
    keyConcepts: [
      { name: 'Agenda Setting & Framing', definition: 'Media don\'t tell us what to think but what to think about (McCombs/Shaw) and how to think it (Entman) — two distinct effects', importance: 'foundational', relatedConcepts: ['priming', 'second-level agenda setting', 'attribute salience'] },
      { name: 'Public Sphere', definition: 'Habermas — the arena where private persons assemble to form public opinion; its structural transformation tracks media ownership and platform logic', importance: 'foundational', relatedConcepts: ['deliberation', 'communicative action', 'refeudalization'] },
      { name: 'Platformization & Attention Economy', definition: 'Attention is the scarce resource; platforms monetize engagement → outrage and identity content are algorithmically favored', importance: 'foundational', relatedConcepts: ['algorithmic curation', 'engagement metrics', 'virality'] },
      { name: 'Propaganda Model / Manufacturing Consent', definition: 'Herman & Chomsky — media filtered by ownership, advertising, sourcing, flak, ideology; updated for platform era', importance: 'advanced', relatedConcepts: ['filters', 'elite media', 'manufacturing consent'] },
      { name: 'Networked Publics', definition: 'boyd — publics restructured by networked tech: persistence, replicability, scalability, searchability reshape social dynamics', importance: 'advanced', relatedConcepts: ['context collapse', 'networked publics', 'affordances'] },
    ],
    frameworks: [
      { name: 'Information Ecosystem Mapping', description: 'Map the full chain: producer → platform → algorithm → audience → feedback loop — no claim about "media effects" without the distribution path', whenToUse: 'Disinformation and influence analyses', steps: ['Who produces?', 'Which platforms distribute?', 'What does the algorithm amplify?', 'Who consumes and how?'] },
      { name: 'Platform Incentive Analysis', description: 'Ask what the platform\'s business model rewards — engagement-optimized feeds have predictable content biases', whenToUse: 'Any platform-content claim', steps: ['Revenue model?', 'Optimized metric?', 'What content wins under it?'] },
      { name: 'Source-to-Claim Tracing', description: 'Trace a narrative to its origin — coordinated campaigns leave forensic traces (synchronized timing, shared phrasing, seeded accounts)', whenToUse: 'Influence operation detection', steps: ['Earliest appearance?', 'Propagation pattern organic or coordinated?', 'Beneficiary analysis'] },
    ],
    referencePapers: [
      { title: 'The Structural Transformation of the Public Sphere', authors: 'Jürgen Habermas', year: 1962, journal: 'Luchterhand', significance: 'The reference on public opinion formation and its decay' },
      { title: 'Manufacturing Consent', authors: 'Herman & Chomsky', year: 1988, journal: 'Pantheon', significance: 'The propaganda model — structural media critique' },
      { title: 'The Wealth of Networks', authors: 'Yochai Benkler', year: 2006, journal: 'Yale UP', significance: 'Networked information production — the optimistic baseline to argue against' },
      { title: 'Agenda-Setting Function of Mass Media', authors: 'McCombs & Shaw', year: 1972, journal: 'Public Opinion Quarterly', significance: 'The founding empirical study' },
      { title: 'Network Propaganda', authors: 'Benkler, Faris & Roberts', year: 2018, journal: 'Oxford UP', significance: 'Asymmetric polarization in the networked public sphere — the field\'s current reference' },
    ],
    dataSources: [
      { name: 'GDELT', type: 'api', coverage: 'global news events and tone' },
      { name: 'EventRegistry', type: 'api', coverage: 'article-level event data' },
      { name: 'OpenAlex communication studies', type: 'api', coverage: 'peer-reviewed' },
    ],
    methodology: {
      approach: 'Ecosystem analysis — content claims require the distribution and incentive chain',
      evidenceHierarchy: ['Platform data/APIs (when accessible)', 'Peer-reviewed communication research', 'Computational studies with corpora', 'Case documentation'],
      uncertaintyApproach: 'Platform data access is degraded (API shutdowns) — flag measurement gaps explicitly',
      minimumEvidence: 'Claims about amplification require platform-mechanism evidence; claims about effects require exposure data',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 65, requirePeerReview: true, maxSourceAge: 15,
      specialRequirements: ['Must name the distribution mechanism', 'Must separate agenda-setting from framing claims', 'Must caveat platform data opacity'],
    },
    standingQuestions: [
      'Which narratives are amplified by algorithmic incentive vs human coordination?',
      'How does context collapse on platforms change what can be said publicly?',
      'Where is the public sphere fragmenting into incompatible information environments?',
    ],
    knownBiases: [
      'Techno-determinism — attributing all change to technology, ignoring users\' appropriation',
      'Echo-chamber overreach — the empirical evidence for strict echo chambers is weaker than the rhetoric',
      'Nostalgia bias — the pre-platform public sphere was never as deliberative as the myth',
      'Content-only analysis — ignoring distribution mechanics',
    ],
  },

  epidemiology: {
    domain: 'epidemiology',
    researcherName: 'Dr. Nosos (Νόσος)',
    keyConcepts: [
      { name: 'Bradford Hill Criteria', definition: 'Nine considerations (strength, consistency, temporality, dose-response…) for inferring causation from observational data — never a checklist verdict', importance: 'foundational', relatedConcepts: ['causal inference', 'temporality', 'dose-response'] },
      { name: 'Compartmental Models', definition: 'SIR/SEIR — transmission dynamics as flows between states; R0 is context-dependent, not a constant of the pathogen', importance: 'foundational', relatedConcepts: ['R0', 'effective reproduction number', 'herd immunity threshold'] },
      { name: 'Confounding & Colliders', definition: 'DAG literacy — adjusting for the wrong variables induces bias (collider), not just fails to remove it', importance: 'advanced', relatedConcepts: ['DAGs', 'selection bias', 'backdoor criterion'] },
      { name: 'Surveillance Artifacts', definition: 'Case counts measure testing + reporting capacity as much as incidence — the dark figure is the rule, not the exception', importance: 'foundational', relatedConcepts: ['ascertainment bias', 'denominator problems', 'reporting delay'] },
      { name: 'Effect Modification', definition: 'An exposure\'s effect differs across subgroups — average effects conceal heterogeneous risk', importance: 'advanced', relatedConcepts: ['interaction', 'stratification', 'heterogeneity'] },
    ],
    frameworks: [
      { name: 'Causal Claim Triage', description: 'Before accepting an observational association: temporality? confounding addressed? dose-response? alternative explanation?', whenToUse: 'Any "X causes Y" health claim', steps: ['Temporal order established?', 'Confounders adjusted?', 'Dose-response gradient?', 'Rival explanations ruled out?'] },
      { name: 'Transmission Scenario Decomposition', description: 'R is a product of contact rate × transmission probability × infectious duration — intervene on the cheapest factor', whenToUse: 'Outbreak projections', steps: ['Which factor dominates?', 'Which is modifiable?', 'What is the uncertainty on each?'] },
      { name: 'Denominator Audit', description: 'Every rate needs a denominator audit — who is counted, who is missed, what changed in ascertainment', whenToUse: 'Reading surveillance statistics', steps: ['Population covered?', 'Case definition stable?', 'Testing/reporting changed?'] },
    ],
    referencePapers: [
      { title: 'The Environment and Disease: Association or Causation?', authors: 'Austin Bradford Hill', year: 1965, journal: 'Proceedings of the Royal Society of Medicine', significance: 'The criteria for causal inference — the field\'s methodological canon' },
      { title: 'Causal Inference: What If', authors: 'Hernán & Robins', year: 2020, journal: 'Chapman & Hall', significance: 'The modern causal-inference bible for observational health data' },
      { title: 'Modern Epidemiology', authors: 'Rothman, Greenland & Lash', year: 2008, journal: 'LWW', significance: 'The reference textbook — measures, biases, design' },
      { title: 'On the Mode of Communication of Cholera', authors: 'John Snow', year: 1855, journal: 'Churchill', significance: 'The founding study — mapping, natural experiment, shoe-leather epidemiology' },
    ],
    dataSources: [
      { name: 'PubMed/EuropePMC', type: 'api', coverage: 'peer-reviewed epidemiology' },
      { name: 'WHO/CDC surveillance', type: 'api', coverage: 'official surveillance' },
      { name: 'Global Burden of Disease', type: 'dataset', coverage: 'comparative disease burden' },
    ],
    methodology: {
      approach: 'Design-aware causal inference — the study design determines what the data can show',
      evidenceHierarchy: ['RCTs', 'Natural experiments/quasi-experimental', 'Cohort studies', 'Case-control', 'Ecological (flagged)'],
      uncertaintyApproach: 'Report uncertainty bounds and ascertainment limits — case counts are never true incidence',
      minimumEvidence: 'Associations need adjustment strategy stated; transmission claims need mechanism or model',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 70, requirePeerReview: true, maxSourceAge: 15,
      specialRequirements: ['Must state the study design and its limits', 'Must caveat surveillance artifacts', 'Must distinguish population-level from individual-level risk'],
    },
    standingQuestions: [
      'Which current outbreak signals are surveillance artifacts vs real incidence change?',
      'Where do observational associations rest on unmeasured confounding?',
      'What is the effective (not nominal) reproduction number and its uncertainty?',
    ],
    knownBiases: [
      'Ecological fallacy — inferring individual risk from group-level associations',
      'Denominator blindness — rates without verified populations',
      'Dread risk — rare spectacular hazards overweighted vs chronic burdens',
      'Model worship — SEIR projections presented without their structural assumptions',
    ],
  },

  "public-health": {
    domain: 'public-health',
    researcherName: 'Dr. Prophylaxis (Προφύλαξις)',
    keyConcepts: [
      { name: 'Social Determinants of Health', definition: 'Marmot — health follows the social gradient at every level; healthcare explains a minority of population health', importance: 'foundational', relatedConcepts: ['health gradient', 'health equity', 'upstream causes'] },
      { name: 'Prevention Paradox', definition: 'Rose — a measure that brings large benefits to the community may offer little to each individual; shifting the whole curve beats treating the tail', importance: 'foundational', relatedConcepts: ['population strategy', 'high-risk strategy'] },
      { name: 'Health System Functions', definition: 'WHO building blocks — financing, workforce, information, products, service delivery, governance; weakness in one constrains all', importance: 'foundational', relatedConcepts: ['universal coverage', 'primary care', 'health financing'] },
      { name: 'QALY/DALY Cost-Effectiveness', definition: 'Standardized metrics for comparing interventions — powerful but ethically loaded (whose life-years count?)', importance: 'advanced', relatedConcepts: ['cost-effectiveness', 'burden of disease', 'priority setting'] },
      { name: 'Commercial Determinants', definition: 'Tobacco, alcohol, ultra-processed food industries as vectors of disease — the political economy of NCDs', importance: 'emerging', relatedConcepts: ['NCDs', 'industry influence', 'regulatory capture'] },
    ],
    frameworks: [
      { name: 'Upstream-Downstream Audit', description: 'For every intervention proposed, locate it on the upstream-downstream continuum — downstream interventions rarely solve upstream problems', whenToUse: 'Health policy evaluation', steps: ['What level does it target?', 'What produces the problem upstream?', 'Is this treating symptoms or causes?'] },
      { name: 'Equity Impact Check', description: 'Population-average improvements can widen gaps — check who benefits, who is reached last', whenToUse: 'Any health intervention assessment', steps: ['Baseline gradient?', 'Intervention reach by group?', 'Net equity effect?'] },
      { name: 'System Capacity Ledger', description: 'Assess interventions against system constraints — workforce, financing, supply chains — a good policy on a broken system fails', whenToUse: 'Feasibility analysis', steps: ['Workforce available?', 'Financing sustainable?', 'Delivery infrastructure exists?'] },
    ],
    referencePapers: [
      { title: 'The Status Syndrome', authors: 'Michael Marmot', year: 2004, journal: 'Bloomsbury', significance: 'The social gradient in health — Whitehall studies synthesized' },
      { title: 'The Strategy of Preventive Medicine', authors: 'Geoffrey Rose', year: 1992, journal: 'Oxford UP', significance: 'Population vs high-risk prevention — the field\'s strategic framework' },
      { title: 'The Spirit Level', authors: 'Wilkinson & Pickett', year: 2009, journal: 'Allen Lane', significance: 'Inequality and health outcomes — influential and contested' },
      { title: 'Ottawa Charter for Health Promotion', authors: 'WHO', year: 1986, journal: 'WHO', significance: 'Health promotion framed as enabling environments, not just behavior' },
    ],
    dataSources: [
      { name: 'WHO indicators', type: 'api', coverage: 'global health systems' },
      { name: 'PubMed/EuropePMC', type: 'api', coverage: 'peer-reviewed public health' },
      { name: 'World Bank health data', type: 'api', coverage: 'financing and coverage' },
    ],
    methodology: {
      approach: 'Systems + equity — interventions judged by system feasibility and distributional impact, not just efficacy',
      evidenceHierarchy: ['Systematic reviews (Cochrane)', 'Natural experiments', 'Implementation studies', 'Modeling (flagged with assumptions)'],
      uncertaintyApproach: 'Efficacy ≠ effectiveness ≠ implementation — flag which level the evidence supports',
      minimumEvidence: 'Intervention claims need implementation evidence; equity claims need stratified data',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 68, requirePeerReview: true, maxSourceAge: 15,
      specialRequirements: ['Must separate efficacy from implementation', 'Must assess equity impact', 'Must name the system constraint that binds'],
    },
    standingQuestions: [
      'Which interventions shift the population curve vs rescue the tail?',
      'Where are health-system capacity gaps binding harder than knowledge gaps?',
      'What is the commercial-determinants exposure in this NCD/behavior outcome?',
    ],
    knownBiases: [
      'Medical model bias — treating health problems as clinical problems',
      'Average-effect blindness — mean improvements masking widening gaps',
      'Lifestyle drift — reducing structural determinants to individual choices',
      'Pilot-to-scale fallacy — boutique implementations that cannot survive real budgets',
    ],
  },

  "international-relations": {
    domain: 'international-relations',
    researcherName: 'Dr. Oikumene (Οἰκουμένη)',
    keyConcepts: [
      { name: 'Balance of Power', definition: 'Waltz — states balance against capability (not intentions); bipolar, multipolar, unipolar systems have distinct stability logics', importance: 'foundational', relatedConcepts: ['polarity', 'balancing/bandwagoning', 'structural realism'] },
      { name: 'Security Dilemma', definition: 'Herz/Jervis — defensive measures by one state read as offensive by others; spiral dynamics without aggressor intent', importance: 'foundational', relatedConcepts: ['spiral model', 'arms racing', 'offense-defense balance'] },
      { name: 'Complex Interdependence', definition: 'Keohane & Nye — where military force is costly and economies entangled, power becomes issue-specific and institutions carry weight', importance: 'foundational', relatedConcepts: ['regimes', 'issue linkage', 'sensitivity/vulnerability'] },
      { name: 'Credibility & Costly Signaling', definition: 'Schelling — commitments are credible when abandoning them is costly; resolve is demonstrated, not declared', importance: 'advanced', relatedConcepts: ['tripwires', 'audience costs', 'brinkmanship'] },
      { name: 'Social Construction of Threat', definition: 'Wendt/Finnemore — anarchy is what states make of it; identities and norms, not just material power, produce threats', importance: 'advanced', relatedConcepts: ['constructivism', 'norms', 'identity'] },
    ],
    frameworks: [
      { name: 'Three-Level Analysis', description: 'Waltz\'s images — locate the explanation at system, state, or individual level before arguing', whenToUse: 'Any conflict/cooperation question', steps: ['System level: polarity, interdependence', 'State level: regime, domestic coalitions', 'Individual level: leader beliefs', 'Which level carries the causal weight?'] },
      { name: 'Deterrence Ledger', description: 'Assess credibility structurally: capability × resolve × communication — a commitment fails on the weakest leg', whenToUse: 'Extended deterrence and red-line questions', steps: ['Military capability sufficient?', 'Resolve demonstrable (skin in game)?', 'Communication clear to the adversary?'] },
      { name: 'Order Architecture Map', description: 'Map which institutions carry the order — alliances, regimes, norms — and which are load-bearing vs decorative', whenToUse: 'World-order questions', steps: ['List the order\'s institutions', 'Which generate compliance?', 'Which would be missed if gone?'] },
    ],
    referencePapers: [
      { title: 'Theory of International Politics', authors: 'Kenneth Waltz', year: 1979, journal: 'Addison-Wesley', significance: 'Structural realism — the baseline every IR theory argues against' },
      { title: 'After Hegemony', authors: 'Robert Keohane', year: 1984, journal: 'Princeton UP', significance: 'Institutions survive hegemonic decline — liberal institutionalism\'s canon' },
      { title: 'Social Theory of International Politics', authors: 'Alexander Wendt', year: 1999, journal: 'Cambridge UP', significance: '"Anarchy is what states make of it" — constructivism\'s founding text' },
      { title: 'The Strategy of Conflict', authors: 'Thomas Schelling', year: 1960, journal: 'Harvard UP', significance: 'Deterrence, focal points, bargaining — the strategist\'s bible' },
      { title: 'Perception and Misperception in International Politics', authors: 'Robert Jervis', year: 1976, journal: 'Princeton UP', significance: 'How decision-makers systematically misread each other' },
    ],
    dataSources: [
      { name: 'OpenAlex IR/political science', type: 'api', coverage: 'peer-reviewed IR' },
      { name: 'CFR/Chatham House/RAND/IISS', type: 'api', coverage: 'policy analysis' },
      { name: 'Correlates of War / UCDP', type: 'dataset', coverage: 'conflict data' },
    ],
    methodology: {
      approach: 'Structural first, agential second — system constraints before leader psychology',
      evidenceHierarchy: ['Peer-reviewed IR', 'Conflict datasets (UCDP, COW)', 'Declassified documents/memoirs', 'Journalistic accounts (context only)'],
      uncertaintyApproach: 'Intentions are unobservable — infer from capability + doctrine + revealed behavior, flag inference layers',
      minimumEvidence: 'Balance-of-power claims need capability metrics; intent claims need demonstrated behavior',
    },
    qualityCriteria: {
      minSources: 10, minQuality: 68, requirePeerReview: true, maxSourceAge: 30,
      specialRequirements: ['Must specify the IR theory lens in use', 'Must separate capability from intent', 'Must engage at least one rival explanation'],
    },
    standingQuestions: [
      'Where is the system\'s polarity actually shifting — measured in capability, not rhetoric?',
      'Which commitments are structurally credible vs declaratory?',
      'Which institutions are load-bearing for the current order — and what fills the gap if they fail?',
    ],
    knownBiases: [
      'Realism reflex — treating everything as power politics and missing institutional/ideational causes',
      'Intent inference from outcomes — assuming results were desired',
      'Western-order default — analyzing as if the post-1945 order were universal rather than constructed',
      'Pundit novelty bias — declaring "new era" on every election cycle; structure changes slowly',
    ],
  },

  // ── SUB-DISCIPLINE KBs II (Sprint 19 batch 3 — toward 50 domains) ──

  "migration-studies": {
    domain: 'migration-studies',
    researcherName: 'Dr. Metanastes (Μετανάστης)',
    keyConcepts: [
      { name: 'Migration Systems', definition: 'Flows are structured systems with feedback loops — networks, remittances, diasporas; not atomized individual decisions', importance: 'foundational', relatedConcepts: ['network effects', 'cumulative causation', 'diaspora'] },
      { name: 'New Economics of Labor Migration', definition: 'Stark — migration is a household risk-diversification strategy, not just individual wage-maximization', importance: 'foundational', relatedConcepts: ['household strategy', 'remittances', 'risk diversification'] },
      { name: 'Transnationalism', definition: 'Migrants maintain simultaneous social fields across borders — integration and origin-engagement are not zero-sum', importance: 'foundational', relatedConcepts: ['social fields', 'dual frames of reference', 'diaspora politics'] },
      { name: 'Replacement vs Substitution', definition: 'Migration rarely "replaces" native workers — labor markets segment; effects concentrate on prior migrants and specific sectors', importance: 'advanced', relatedConcepts: ['labor segmentation', 'complementarity', 'wage effects'] },
      { name: 'Migration Hump', definition: 'Development initially INCREASES emigration (people gain means to move) — aid-driven development does not cut short-term outflows', importance: 'advanced', relatedConcepts: ['mobility transition', 'aspiration-capability', 'de Haas'] },
    ],
    frameworks: [
      { name: 'System Mapping', description: 'Map origin-transit-destination as one system with feedback — corridor analysis beats country-pair snapshots', whenToUse: 'Any flow claim', steps: ['Identify corridors', 'Map feedback loops (networks, remittances)', 'Check policy reversals and their displacement effects'] },
      { name: 'Aspiration-Capability Audit', description: 'Migration needs BOTH aspiration and capability — policies blocking capability channel flows irregular, not stop them', whenToUse: 'Border policy evaluation', steps: ['Aspiration changed?', 'Capability changed?', 'Or just route displacement?'] },
      { name: 'Integration Outcome Decomposition', description: 'Separate labor-market, educational, social, and political integration — they move at different speeds', whenToUse: 'Integration claims', steps: ['Which dimension?', 'Which generation?', 'Which comparator group?'] },
    ],
    referencePapers: [
      { title: 'Worlds in Motion', authors: 'Massey, Arango et al.', year: 1998, journal: 'Oxford UP', significance: 'The synthesis of migration theories — the field\'s reference' },
      { title: 'The Age of Migration', authors: 'Castles & Miller', year: 1993, journal: 'Macmillan', significance: 'Migration as structural feature of the global system' },
      { title: 'Nations Unbound', authors: 'Basch, Glick Schiller & Szanton Blanc', year: 1994, journal: 'Gordon & Breach', significance: 'Transnationalism founding text' },
      { title: 'Migration Transitions', authors: 'Hein de Haas', year: 2010, journal: 'IMI Working Papers', significance: 'Aspiration-capability framework — development raises mobility' },
    ],
    dataSources: [
      { name: 'UN DESA / IOM data', type: 'dataset', coverage: 'global stock/flow data' },
      { name: 'World Bank migration & remittances', type: 'api', coverage: 'remittance flows' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone migration research' },
    ],
    methodology: {
      approach: 'System-first — corridors and feedback loops before individual motives',
      evidenceHierarchy: ['Administrative/registry data', 'Peer-reviewed demography/sociology', 'Survey panels', 'NGO reports (context)'],
      uncertaintyApproach: 'Irregular flows are systematically undercounted — flag estimation method',
      minimumEvidence: 'Flow claims need source + direction + period; stock claims need census/register anchor',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 65, requirePeerReview: true, maxSourceAge: 15,
      specialRequirements: ['Must distinguish stocks from flows', 'Must flag irregular-flow estimation uncertainty', 'Must not treat policy announcements as achieved outcomes'],
    },
    standingQuestions: [
      'Which corridors are restructuring — and by which mechanism (policy, conflict, labor demand)?',
      'Where is deterrence displacing routes rather than reducing flows?',
      'Which integration dimensions lag — and for which cohorts?',
    ],
    knownBiases: [
      'Sedentary bias — treating staying as natural and moving as deviant',
      'Methodological nationalism — framing migration through nation-state categories',
      'Crisis framing — permanent structural flows narrated as emergency',
      'Push-pull simplification — ignoring network feedback and aspiration-capability dynamics',
    ],
  },

  "science-technology-studies": {
    domain: 'science-technology-studies',
    researcherName: 'Dr. Mechanē (Μηχανή)',
    keyConcepts: [
      { name: 'Social Construction of Technology (SCOT)', definition: 'Pinch & Bijker — artifacts are shaped by relevant social groups and interpretive flexibility; closure stabilizes meaning', importance: 'foundational', relatedConcepts: ['interpretive flexibility', 'closure', 'relevant social groups'] },
      { name: 'Actor-Network Theory', definition: 'Latour/Callon/Law — agency is distributed across human and nonhuman actants; networks, not essences, produce outcomes', importance: 'foundational', relatedConcepts: ['actants', 'translation', 'enrollment', 'black-boxing'] },
      { name: 'Co-production', definition: 'Jasanoff — scientific knowledge and social order are produced together; "objective" science embeds political commitments', importance: 'foundational', relatedConcepts: ['sociotechnical imaginaries', 'civic epistemology'] },
      { name: 'Boundary Objects', definition: 'Star & Griesemer — objects robust enough to maintain identity across communities yet flexible enough for local use; how disciplines coordinate without consensus', importance: 'advanced', relatedConcepts: ['interoperability', 'trading zones'] },
      { name: 'Technological Momentum', definition: 'Hughes — systems acquire inertia as they scale; early choices become infrastructure and constrain later options', importance: 'advanced', relatedConcepts: ['path dependence', 'lock-in', 'large technical systems'] },
    ],
    frameworks: [
      { name: 'Controversy Mapping', description: 'Scientific controversies reveal where facts are still being negotiated — map actors, claims, closure mechanisms', whenToUse: 'Assessing "settled science" claims', steps: ['Who disputes?', 'On what grounds?', 'What would close the controversy?'] },
      { name: 'Sociotechnical Decomposition', description: 'No technology is neutral or autonomous — decompose artifact, social arrangement, and political embeddedness', whenToUse: 'Technology-impact claims', steps: ['What does the artifact do?', 'What social order does it presuppose?', 'What does it make harder/easier?'] },
      { name: 'Black-Box Opening', description: 'Open the black box: what assumptions, values, and labor are frozen inside the "neutral" system?', whenToUse: 'Algorithmic and infrastructure analysis', steps: ['What is treated as given?', 'Who built it and with what defaults?', 'Whose interests does stabilization serve?'] },
    ],
    referencePapers: [
      { title: 'Laboratory Life', authors: 'Latour & Woolgar', year: 1979, journal: 'Sage', significance: 'Ethnography of fact production — the founding STS text' },
      { title: 'The Social Construction of Technological Systems', authors: 'Bijker, Hughes & Pinch (eds)', year: 1987, journal: 'MIT Press', significance: 'SCOT + systems + ANT — the canonical collection' },
      { title: 'States of Knowledge', authors: 'Sheila Jasanoff', year: 2004, journal: 'Routledge', significance: 'Co-production — science and politics made together' },
      { title: 'Do Artifacts Have Politics?', authors: 'Langdon Winner', year: 1980, journal: 'Daedalus', significance: 'The classic argument that artifacts embody political order' },
    ],
    dataSources: [
      { name: 'OpenAlex STS', type: 'api', coverage: 'peer-reviewed STS' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone STS tradition (Callon, Latour)' },
      { name: 'HAL', type: 'api', coverage: 'European STS' },
    ],
    methodology: {
      approach: 'Follow the actors — trace networks and translations before theorizing',
      evidenceHierarchy: ['Peer-reviewed STS', 'Ethnographic studies', 'Documentary analysis', 'Technical specification analysis'],
      uncertaintyApproach: 'Interpretive field — attribute analytic frames, do not present constructions as uncovered truth',
      minimumEvidence: 'Claims about "how science works" need case evidence; normative critiques need named stakes',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 40,
      specialRequirements: ['Must name the analytic framework in use', 'Must not treat technical systems as apolitical', 'Must distinguish description from normative critique'],
    },
    standingQuestions: [
      'Where are scientific facts still under negotiation vs stabilized?',
      'What social order is embedded in this technical artifact?',
      'Whose expertise counts — and how was that boundary drawn?',
    ],
    knownBiases: [
      'Technological determinism — artifacts as autonomous causal forces',
      'Pure social reductionism — ignoring material constraints',
      'Symmetry abuse — treating fringe and mainstream claims as epistemically equal',
      'Presentism — judging historical scientific practice by current standards',
    ],
  },

  epistemology: {
    domain: 'epistemology',
    researcherName: 'Dr. Episteme (Ἐπιστήμη)',
    keyConcepts: [
      { name: 'Gettier Problem', definition: 'Justified true belief can be true by luck — knowledge needs something more (reliability, virtue, safety)', importance: 'foundational', relatedConcepts: ['epistemic luck', 'safety condition', 'JTB analysis'] },
      { name: 'Reliabilism vs Internalism', definition: 'Is justification about accessible reasons (internalist) or reliable belief-forming processes (externalist/reliabilist)?', importance: 'foundational', relatedConcepts: ['internalism', 'externalism', 'process reliability'] },
      { name: 'Epistemic Injustice', definition: 'Fricker — testimonial injustice (credibility deficit from prejudice) and hermeneutical injustice (no concepts to name experience)', importance: 'foundational', relatedConcepts: ['credibility', 'hermeneutical resources', 'standpoint'] },
      { name: 'Peer Disagreement', definition: 'When epistemic peers disagree, should you conciliate or stand fast? — conditions claims about expert consensus', importance: 'advanced', relatedConcepts: ['conciliationism', 'steadfastness', 'higher-order evidence'] },
      { name: 'Virtue Epistemology', definition: 'Knowledge as success through intellectual virtue (Sosa, Zagzebski) — agent-centered alternative to belief-focused analysis', importance: 'advanced', relatedConcepts: ['intellectual virtue', 'apt belief', 'epistemic responsibility'] },
    ],
    frameworks: [
      { name: 'Justification Audit', description: 'For any knowledge claim: what is the source, is it reliable, is there a Gettier-style luck problem?', whenToUse: 'Evaluating "we know that X" claims', steps: ['Source of belief?', 'Reliable process?', 'Luck element?', 'Higher-order evidence?'] },
      { name: 'Disagreement Protocol', description: 'When credible sources disagree — is it genuine peer disagreement (weight equally) or asymmetric reliability?', whenToUse: 'Conflicting expert claims', steps: ['Are the parties epistemic peers?', 'Same evidence?', 'Track records?', 'Independent formation?'] },
      { name: 'Standpoint Check', description: 'Ask whose epistemic position is being treated as default — marginalized positions can see what dominant positions miss', whenToUse: 'Assessing whose knowledge counts', steps: ['Whose testimony is discounted?', 'What hermeneutical gaps exist?', 'What does the marginal position see?'] },
    ],
    referencePapers: [
      { title: 'Is Justified True Belief Knowledge?', authors: 'Edmund Gettier', year: 1963, journal: 'Analysis', significance: 'Three pages that broke two millennia of epistemology' },
      { title: 'Epistemic Injustice', authors: 'Miranda Fricker', year: 2007, journal: 'Oxford UP', significance: 'Ethics meets epistemology — credibility and hermeneutical injustice' },
      { title: 'Epistemology and Cognition', authors: 'Alvin Goldman', year: 1986, journal: 'Harvard UP', significance: 'Reliabilism — the process-reliability foundation' },
      { title: 'Knowledge in a Social World', authors: 'Alvin Goldman', year: 1999, journal: 'Oxford UP', significance: 'Social epistemology — testimony, experts, institutions' },
    ],
    dataSources: [
      { name: 'PhilPapers', type: 'api', coverage: 'peer-reviewed epistemology' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone epistemology (Bachelard tradition)' },
      { name: 'Stanford Encyclopedia', type: 'reference', coverage: 'authoritative entries' },
    ],
    methodology: {
      approach: 'Analytic rigor — conditions, counterexamples, and the structure of justification',
      evidenceHierarchy: ['Peer-reviewed epistemology', 'Canonical texts', 'SEP reference', 'Cognitive science where empirical'],
      uncertaintyApproach: 'Positions are school-indexed — attribute, never assert as consensus',
      minimumEvidence: 'Claims about knowledge require the analysis be named (JTB, reliabilist, virtue…)',
    },
    qualityCriteria: {
      minSources: 5, minQuality: 70, requirePeerReview: false, maxSourceAge: 2500,
      specialRequirements: ['Must name the epistemic framework', 'Must handle Gettier-style luck where relevant', 'Must distinguish first-order belief from higher-order evidence'],
    },
    standingQuestions: [
      'Whose testimony is being systematically discounted — and at what epistemic cost?',
      'Where does disagreement between credible sources require conciliation vs steadfastness?',
      'What institutional arrangements produce reliable collective knowledge?',
    ],
    knownBiases: [
      'Justification fetishism — demanding certainty where reliability suffices',
      'Peer-privilege bias — treating credentialed consensus as proof',
      'Testimonial injustice — discounting sources by identity not track record',
      'Epistemic imperialism — applying one domain\'s standards to another domain',
    ],
  },

  "international-law": {
    domain: 'international-law',
    researcherName: 'Dr. Dikaion (Δίκαιον)',
    keyConcepts: [
      { name: 'Treaty Interpretation (VCLT 31-33)', definition: 'Ordinary meaning in context + object and purpose — not literalism, not pure purpose; the operative method of treaty law', importance: 'foundational', relatedConcepts: ['VCLT', 'object and purpose', 'subsequent practice'] },
      { name: 'Customary International Law', definition: 'State practice + opinio juris — binding even without treaty; proving it requires both elements, not one', importance: 'foundational', relatedConcepts: ['opinio juris', 'persistent objector', 'state practice'] },
      { name: 'State Responsibility', definition: 'Internationally wrongful acts trigger obligations of cessation/reparation — attribution rules determine whose conduct counts', importance: 'foundational', relatedConcepts: ['attribution', 'ILC Articles', 'reparation'] },
      { name: 'Jus Cogens', definition: 'Peremptory norms from which no derogation is permitted — genocide, torture, aggression; the ceiling of the normative hierarchy', importance: 'advanced', relatedConcepts: ['peremptory norms', 'erga omnes', 'non-derogation'] },
      { name: 'Compliance Without Enforcement', definition: 'Henkin — most states obey most law most of the time, without centralized enforcement; reputation, reciprocity, and legitimacy do the work', importance: 'foundational', relatedConcepts: ['managerial compliance', 'legitimacy', 'reciprocity'] },
    ],
    frameworks: [
      { name: 'Source Hierarchy Triage', description: 'Treaty > custom > general principles — identify the legal basis before assessing violation', whenToUse: 'Any "X violates international law" claim', steps: ['Treaty applicable and ratified?', 'Custom established (practice + opinio juris)?', 'Jus cogens implicated?', 'Derogation/reservation applies?'] },
      { name: 'Attribution Analysis', description: 'Whose conduct is it? State organ, de facto organ (Nicaragua test), or private actor? Attribution determines responsibility', whenToUse: 'Proxy forces, contractors, non-state actors', steps: ['Effective control (Nicaragua) or overall control (Tadić)?', 'State organ status?', 'Due diligence obligations?'] },
      { name: 'Enforcement Reality Check', description: 'International law lacks centralized enforcement — assess the actual compliance mechanism: reciprocity, reputation, domestic incorporation, sanctions', whenToUse: 'Feasibility of legal instruments', steps: ['What enforces this norm?', 'What is the violation cost?', 'Which fora have jurisdiction?'] },
    ],
    referencePapers: [
      { title: 'Vienna Convention on the Law of Treaties', authors: 'United Nations', year: 1969, journal: 'UN Treaty Series', significance: 'The treaty on treaties — interpretation rules' },
      { title: 'How Nations Behave', authors: 'Louis Henkin', year: 1979, journal: 'Columbia UP', significance: 'Compliance without enforcement — the managerial canon' },
      { title: 'From Apology to Utopia', authors: 'Martti Koskenniemi', year: 1989, journal: 'Cambridge UP', significance: 'Critical theory of international legal argument — indeterminacy thesis' },
      { title: 'The Concept of Law', authors: 'H.L.A. Hart', year: 1961, journal: 'Clarendon', significance: 'Primary/secondary rules — the analytic frame applied to international order' },
    ],
    dataSources: [
      { name: 'UN Treaty Collection / ICJ', type: 'dataset', coverage: 'primary law' },
      { name: 'EUR-Lex', type: 'api', coverage: 'EU law' },
      { name: 'OpenAlex law', type: 'api', coverage: 'peer-reviewed international law' },
    ],
    methodology: {
      approach: 'Source-first — identify the legal basis (treaty/custom/principle) before assessing violation or compliance',
      evidenceHierarchy: ['Treaty text and case law (ICJ, ICC, tribunals)', 'ILC materials', 'Peer-reviewed doctrine', 'State practice records'],
      uncertaintyApproach: 'Legal status claims need the instrument + ratification status + reservations',
      minimumEvidence: 'Violation claims require the norm identified, its source, and the attribution analysis',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 70, requirePeerReview: true, maxSourceAge: 60,
      specialRequirements: ['Must cite the instrument and its binding status', 'Must distinguish lex lata from lex ferenda', 'Must flag enforcement gaps honestly'],
    },
    standingQuestions: [
      'Which norms are treaty-bound vs customary vs merely aspirational?',
      'Where is the compliance gap widest — and which mechanism actually disciplines?',
      'Which courts have jurisdiction, and which actors are outside reach?',
    ],
    knownBiases: [
      'Legal fetishism — treating treaty ratification as compliance',
      'Enforcement nihilism — dismissing law because no world police exists',
      'Western-instrument bias — ignoring regional systems and non-Western legal traditions',
      'Headline violation bias — violations are salient; the compliant baseline is invisible',
    ],
  },

  "conflict-studies": {
    domain: 'conflict-studies',
    researcherName: 'Dr. Polemos (Πόλεμος)',
    keyConcepts: [
      { name: 'Bargaining Model of War', definition: 'Fearon — war is bargaining failure: private information, commitment problems, and issue indivisibilities make war ex post inefficient', importance: 'foundational', relatedConcepts: ['commitment problem', 'private information', 'issue indivisibility'] },
      { name: 'Greed vs Grievance', definition: 'Collier vs Fearon-Laitin — rebellion needs opportunity structure (finance, terrain, weak state) more than grievance; the debate that structured the field', importance: 'foundational', relatedConcepts: ['opportunity', 'lootable resources', 'state capacity'] },
      { name: 'Ethnic Security Dilemma', definition: 'Posen — when the state collapses, groups arm defensively, which reads as offensive to others; ethnic war without ancient hatreds', importance: 'foundational', relatedConcepts: ['security dilemma', 'emerging anarchy', 'group mobilization'] },
      { name: 'Conflict Trap', definition: 'Civil war is development in reverse and self-reinforcing — each war raises the risk of the next (collier)', importance: 'foundational', relatedConcepts: ['recurrence', 'post-conflict fragility'] },
      { name: 'Credible Commitment in Peace Processes', definition: 'Walter — settlements fail without third-party guarantees because neither side can credibly commit to disarm', importance: 'advanced', relatedConcepts: ['peacekeeping', 'security guarantees', 'power-sharing'] },
    ],
    frameworks: [
      { name: 'Onset Triage', description: 'Before predicting conflict: opportunity structure (finance, terrain, state weakness), motive, and trigger events — in that order', whenToUse: 'Conflict-risk assessment', steps: ['State capacity?', 'Financing available?', 'Terrain/demography favorable?', 'Trigger event plausible?'] },
      { name: 'Bargaining Diagnosis', description: 'Which bargaining failure is operative — private information, commitment problem, or indivisibility? Each needs different intervention', whenToUse: 'Evaluating negotiation prospects', steps: ['Information asymmetries?', 'Commitment credible?', 'Issue divisible?'] },
      { name: 'Recurrence Ledger', description: 'Post-conflict states relapse at high rates — check what changed structurally vs what merely paused', whenToUse: 'Post-agreement stability', steps: ['Spoilers present?', 'Guarantees credible?', 'Underlying grievances addressed or deferred?'] },
    ],
    referencePapers: [
      { title: 'Rationalist Explanations for War', authors: 'James Fearon', year: 1995, journal: 'International Organization', significance: 'The bargaining model — the field\'s analytic spine' },
      { title: 'Ethnicity, Insurgency, and Civil War', authors: 'Fearon & Laitin', year: 2003, journal: 'American Political Science Review', significance: 'Opportunity > grievance — the canonical empirical finding' },
      { title: 'The Security Dilemma and Ethnic Conflict', authors: 'Barry Posen', year: 1993, journal: 'Survival', significance: 'Security dilemma applied to intra-state violence' },
      { title: 'Breaking the Conflict Trap', authors: 'Paul Collier et al.', year: 2003, journal: 'World Bank/Oxford UP', significance: 'Conflict as development failure — policy canon' },
    ],
    dataSources: [
      { name: 'UCDP / ACLED', type: 'dataset', coverage: 'conflict events' },
      { name: 'SIPRI', type: 'api', coverage: 'arms transfers, military expenditure' },
      { name: 'OpenAlex political science', type: 'api', coverage: 'peer-reviewed conflict research' },
    ],
    methodology: {
      approach: 'Structure before narrative — opportunity and bargaining failure before grievance stories',
      evidenceHierarchy: ['Event datasets (UCDP, ACLED)', 'Peer-reviewed conflict research', 'Declassified documents', 'Journalistic accounts (context)'],
      uncertaintyApproach: 'Event data undercount remote violence — report coding choices and geographic bias',
      minimumEvidence: 'Conflict claims need event data or systematic evidence — anecdote is not trend',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 68, requirePeerReview: true, maxSourceAge: 20,
      specialRequirements: ['Must use UCDP/ACLED-type data for trend claims', 'Must name the bargaining failure in peace-process analysis', 'Must distinguish battle deaths from civilian victimization'],
    },
    standingQuestions: [
      'Which low-intensity conflicts are one trigger event from escalation?',
      'Where do peace processes lack credible third-party guarantees?',
      'Which "ethnic" conflicts are actually opportunity-driven insurgencies?',
    ],
    knownBiases: [
      'Ancient-hatreds fallacy — treating engineered polarization as primordial',
      'Grievance romanticism — assuming rebel motives are justice-seeking',
      'Event-counting bias — ignoring the denominator (population at risk)',
      'Ceasefire-as-peace — freezing is not resolving',
    ],
  },

  "political-economy": {
    domain: 'political-economy',
    researcherName: 'Dr. Ploutos (Πλοῦτος)',
    keyConcepts: [
      { name: 'Varieties of Capitalism', definition: 'Hall & Soskice — liberal vs coordinated market economies have distinct institutional complementarities; there is no single "efficient" capitalism', importance: 'foundational', relatedConcepts: ['institutional complementarity', 'LME/CME', 'comparative advantage of institutions'] },
      { name: 'Embedded Liberalism', definition: 'Ruggie — postwar order traded openness for domestic stability; dismantling that bargain explains the backlash', importance: 'foundational', relatedConcepts: ['compromise of embedded liberalism', 'double movement'] },
      { name: 'Polanyi\'s Double Movement', definition: 'Market expansion produces protective countermovements — disembedding markets generates social self-protection', importance: 'foundational', relatedConcepts: ['fictitious commodities', 'disembedding', 'countermovement'] },
      { name: 'Rent-Seeking & Extraction', definition: 'North/Acemoglu — institutions differ in whether elites extract or compete; extraction is stable, not an accident', importance: 'advanced', relatedConcepts: ['extractive institutions', 'limited access orders', 'elite bargain'] },
      { name: 'Growth Models', definition: 'Baccaro & Pontusson — post-Fordist economies are driven by debt-led, export-led, or consumption-led demand regimes; the model determines distributional politics', importance: 'advanced', relatedConcepts: ['demand regimes', 'export-led growth', 'debt-led growth'] },
    ],
    frameworks: [
      { name: 'Growth-Model Diagnosis', description: 'Identify which demand regime powers the economy — export, debt, or consumption — then predict where distributional conflict lands', whenToUse: 'Comparative capitalism analysis', steps: ['What drives demand?', 'Which sectors benefit?', 'Where is the political conflict?'] },
      { name: 'Institutional Complementarity Audit', description: 'Institutions work as bundles — reform one piece (labor law) without the bundle (vocational training) and the system fails', whenToUse: 'Reform feasibility', steps: ['What complements the target institution?', 'Is the bundle coherent?', 'What breaks if only one element changes?'] },
      { name: 'Extraction-vs-Competition Ledger', description: 'Does the institutional order enable competition or extraction? The answer predicts growth, inequality, and stability', whenToUse: 'Development and governance analysis', steps: ['Who controls access?', 'Are rents protected?', 'Is the elite bargain stable?'] },
    ],
    referencePapers: [
      { title: 'Varieties of Capitalism', authors: 'Hall & Soskice', year: 2001, journal: 'Oxford UP', significance: 'Institutional complementarities — the CPE canon' },
      { title: 'The Great Transformation', authors: 'Karl Polanyi', year: 1944, journal: 'Farrar & Rinehart', significance: 'Double movement — markets and social protection co-evolve' },
      { title: 'Why Nations Fail', authors: 'Acemoglu & Robinson', year: 2012, journal: 'Crown', significance: 'Extractive vs inclusive institutions — the popular synthesis' },
      { title: 'The Modern World-System', authors: 'Immanuel Wallerstein', year: 1974, journal: 'Academic Press', significance: 'Core-periphery — the world-systems baseline' },
    ],
    dataSources: [
      { name: 'NBER / RePEc working papers', type: 'api', coverage: 'frontier political economy' },
      { name: 'World Bank / IMF / OECD', type: 'api', coverage: 'institutional indicators' },
      { name: 'OpenAlex', type: 'api', coverage: 'peer-reviewed CPE/IPE' },
    ],
    methodology: {
      approach: 'Institutionalist — growth models and institutional bundles before aggregates',
      evidenceHierarchy: ['Peer-reviewed CPE/IPE', 'Working papers from frontier programs', 'Comparative datasets (LIS, OECD)', 'Historical institutional analysis'],
      uncertaintyApproach: 'Institutional complementarities make single-variable claims fragile — report the bundle',
      minimumEvidence: 'Capitalism-type claims need the variety named; reform feasibility needs complementarity audit',
    },
    qualityCriteria: {
      minSources: 10, minQuality: 70, requirePeerReview: true, maxSourceAge: 30,
      specialRequirements: ['Must name the growth model or variety', 'Must identify the elite bargain', 'Must engage the Polanyi problem (disembedding produces backlash)'],
    },
    standingQuestions: [
      'Which growth model is each major economy running — and where does it crack?',
      'Where is disembedding producing protective countermovements right now?',
      'Which institutional bundles are coherent vs internally contradictory?',
    ],
    knownBiases: [
      'Convergence myth — assuming all capitalism trends toward the liberal model',
      'Economism — treating political bargains as market failures',
      'Equilibrium bias — extracting orders are stable, not anomalies to be corrected',
      'Methodological nationalism — national models are embedded in a world system',
    ],
  },

  "public-administration": {
    domain: 'public-administration',
    researcherName: 'Dr. Diokesis (Διοίκησις)',
    keyConcepts: [
      { name: 'Street-Level Bureaucracy', definition: 'Lipsky — frontline workers (teachers, police, caseworkers) effectively make policy through discretion; formal rules ≠ delivered policy', importance: 'foundational', relatedConcepts: ['discretion', 'implementation gap', 'coping mechanisms'] },
      { name: 'New Public Management', definition: 'Market-inspired reforms — targets, competition, privatization — delivered efficiency gains and metric-gaming pathologies in equal measure', importance: 'foundational', relatedConcepts: ['targets', 'contracting out', 'performance management'] },
      { name: 'Administrative Burden', definition: 'Moynihan/Herd — learning, compliance, and psychological costs of accessing services are distributive policy instruments, not accidents', importance: 'advanced', relatedConcepts: ['sludge', 'take-up gap', 'hidden taxes'] },
      { name: 'State Capacity', definition: 'The ability to implement — extractive, coercive, and administrative infrastructure; policy ambition without capacity is rhetoric', importance: 'foundational', relatedConcepts: ['implementation capacity', 'Weberian bureaucracy', 'infrastructural power'] },
      { name: 'Garbage Can / Policy Windows', definition: 'March-Cohen/Kingdon — decisions emerge from streams (problems, solutions, politics) coupling at windows, not from rational choice', importance: 'advanced', relatedConcepts: ['policy windows', 'organized anarchy', 'multiple streams'] },
    ],
    frameworks: [
      { name: 'Implementation Chain Audit', description: 'Policy → street-level → outcome: trace where discretion, capacity, or incentives break the chain', whenToUse: 'Any "policy X will deliver Y" claim', steps: ['Who implements?', 'What discretion do they have?', 'What capacity?', 'What incentives?'] },
      { name: 'Burden Analysis', description: 'Quantify the learning/compliance/psychological costs a program imposes — burden is regressive by default', whenToUse: 'Evaluating welfare/administrative reforms', steps: ['Learning costs?', 'Compliance costs?', 'Psychological costs (stigma, stress)?', 'Who bears them?'] },
      { name: 'Capacity-First Feasibility', description: 'Before endorsing a reform, check whether the state can execute — administrative capacity is the binding constraint', whenToUse: 'Policy feasibility', steps: ['Personnel/skills?', 'Information systems?', 'Budget authority?', 'Political principals\' support?'] },
    ],
    referencePapers: [
      { title: 'Street-Level Bureaucracy', authors: 'Michael Lipsky', year: 1980, journal: 'Russell Sage', significance: 'Frontline discretion as policy — the field\'s cornerstone' },
      { title: 'Bureaucracy', authors: 'James Q. Wilson', year: 1989, journal: 'Basic Books', significance: 'What government agencies do and why — organizational realism' },
      { title: 'Administrative Burden', authors: 'Herd & Moynihan', year: 2018, journal: 'Russell Sage', significance: 'Burdens as policy design, not friction' },
      { title: 'Reinventing Government', authors: 'Osborne & Gaebler', year: 1992, journal: 'Addison-Wesley', significance: 'The NPM manifesto — influential and heavily critiqued' },
    ],
    dataSources: [
      { name: 'OECD governance data', type: 'api', coverage: 'comparative public administration' },
      { name: 'OpenAlex public administration', type: 'api', coverage: 'peer-reviewed' },
      { name: 'Overton policy documents', type: 'api', coverage: 'policy corpus' },
    ],
    methodology: {
      approach: 'Implementation-first — formal rules are the start of the analysis, not the end',
      evidenceHierarchy: ['Peer-reviewed PA/public management', 'Comparative governance indicators', 'Administrative data', 'Case studies'],
      uncertaintyApproach: 'Reform evaluations are notoriously context-dependent — flag transferability',
      minimumEvidence: 'Implementation claims need delivery-chain evidence, not just statute text',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 65, requirePeerReview: true, maxSourceAge: 25,
      specialRequirements: ['Must distinguish announced policy from implemented policy', 'Must assess administrative burden', 'Must name the capacity constraint'],
    },
    standingQuestions: [
      'Where does the implementation chain break between statute and street-level delivery?',
      'Which reforms impose administrative burdens that function as hidden rationing?',
      'Which states have capacity for the reforms being proposed — and which do not?',
    ],
    knownBiases: [
      'Formalism — equating rules-on-paper with practice',
      'NPM nostalgia — market metaphors misapplied to public goods',
      'Metric gaming blindness — targets distort behavior (Goodhart)',
      'Center-out bias — analyzing from the ministry, not the street',
    ],
  },

  "gender-studies": {
    domain: 'gender-studies',
    researcherName: 'Dr. Isotes (Ἰσότης)',
    keyConcepts: [
      { name: 'Intersectionality', definition: 'Crenshaw — gender, race, and class interact as systems, not additive categories; the unit of analysis is the intersection', importance: 'foundational', relatedConcepts: ['interlocking oppression', 'matrix of domination', 'single-axis analysis'] },
      { name: 'Gender Performativity', definition: 'Butler — gender is constituted through repeated stylized performance, not expression of inner essence; norms produce what they claim to describe', importance: 'foundational', relatedConcepts: ['performativity', 'heterosexual matrix', 'norms'] },
      { name: 'Care Economy', definition: 'Folbre — unpaid reproductive labor is economically productive but systematically unpriced; the economy runs on invisible work', importance: 'foundational', relatedConcepts: ['reproductive labor', 'unpaid work', 'care penalty'] },
      { name: 'Social Construction of Gender', definition: 'de Beauvoir — "one is not born a woman"; sex-role differentiation is a social project, not biology', importance: 'foundational', relatedConcepts: ['sex/gender distinction', 'social construction'] },
      { name: 'Second Shift & Time Use', definition: 'Hochschild — paid work + unpaid household labor produce a systematic time and energy deficit; leisure gap persists', importance: 'advanced', relatedConcepts: ['time use', 'mental load', 'household bargaining'] },
    ],
    frameworks: [
      { name: 'Intersectional Decomposition', description: 'Never analyze gender alone — intersect with class, race, legal status to find who is actually left behind', whenToUse: 'Inequality claims', steps: ['Which axes interact?', 'Which subgroup is worst off?', 'What single-axis analysis misses?'] },
      { name: 'Unpaid Labor Ledger', description: 'Quantify unpaid care and household work — GDP misses it; time-use surveys capture it', whenToUse: 'Economic and welfare analysis', steps: ['Time-use data?', 'Monetization method?', 'Distribution by gender/class?'] },
      { name: 'Representation Pipeline', description: 'Track where women/minorities exit — hiring, promotion, retention, leadership — the leak point determines the intervention', whenToUse: 'Institutional inequality', steps: ['Where does the cohort thin?', 'Which mechanism (selection, attrition, self-exclusion)?', 'Which intervention targets that point?'] },
    ],
    referencePapers: [
      { title: 'The Second Sex', authors: 'Simone de Beauvoir', year: 1949, journal: 'Gallimard', significance: 'The founding analysis of gender as social construction' },
      { title: 'Gender Trouble', authors: 'Judith Butler', year: 1990, journal: 'Routledge', significance: 'Performativity — gender as constituted performance' },
      { title: 'Demarginalizing the Intersection', authors: 'Kimberlé Crenshaw', year: 1989, journal: 'University of Chicago Legal Forum', significance: 'Intersectionality — the foundational intervention' },
      { title: 'The Second Shift', authors: 'Arlie Hochschild', year: 1989, journal: 'Viking', significance: 'The unpaid second shift — time-use evidence' },
    ],
    dataSources: [
      { name: 'OpenAlex gender studies', type: 'api', coverage: 'peer-reviewed' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone gender research' },
      { name: 'Time-use surveys (OECD, MTUS)', type: 'dataset', coverage: 'unpaid work' },
    ],
    methodology: {
      approach: 'Intersectional — gender never operates alone; intersect before concluding',
      evidenceHierarchy: ['Peer-reviewed gender studies', 'Time-use and labor data', 'Comparative institutional analysis', 'Qualitative research'],
      uncertaintyApproach: 'Self-report and observational data have known biases — triangulate',
      minimumEvidence: 'Inequality claims need intersectional breakdown; "women" as a uniform category is a red flag',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 20,
      specialRequirements: ['Must intersect with class/race/status where data permit', 'Must count unpaid work in welfare analysis', 'Must distinguish representation gaps by pipeline stage'],
    },
    standingQuestions: [
      'Which intersections produce the deepest disadvantage — and is policy addressing them?',
      'Where is unpaid care work constraining economic participation?',
      'At which pipeline stage does representation break down — and why there?',
    ],
    knownBiases: [
      'Single-axis analysis — gender alone conceals the intersection',
      'Sameness-difference trap — demanding equality means becoming identical',
      'Unpaid-work invisibility — GDP accounting erases the care economy',
      'Western-universal framing — gender regimes differ by institutional context',
    ],
  },

  "area-studies": {
    domain: 'area-studies',
    researcherName: 'Dr. Chora (Χώρα)',
    keyConcepts: [
      { name: 'Local Knowledge Primacy', definition: 'Geertz — thick description requires insider categories; external frameworks applied without translation produce systematic misreading', importance: 'foundational', relatedConcepts: ['thick description', 'emic/etic', 'verstehen'] },
      { name: 'Postcolonial Critique', definition: 'Said/Spivak/Chakrabarty — scholarship on "the rest" was written from colonial positions; categories carry that history', importance: 'foundational', relatedConcepts: ['orientalism', 'subaltern', 'provincializing Europe'] },
      { name: 'Imagined Communities', definition: 'Anderson — nations are imagined communities built by print capitalism, shared time, and ritual; not ancient facts', importance: 'foundational', relatedConcepts: ['nationalism', 'print capitalism', 'census/map/museum'] },
      { name: 'Provincializing Europe', definition: 'Chakrabarty — European historical categories are provincial, not universal; "hyperreal" Europe structures even anti-colonial thought', importance: 'advanced', relatedConcepts: ['historicism', 'translation of worlds'] },
      { name: 'Language-Source Hierarchy', definition: 'Analysis without local-language sources is structurally superficial — the key debates happen in the vernacular', importance: 'foundational', relatedConcepts: ['vernacular sources', 'translation politics', 'field access'] },
    ],
    frameworks: [
      { name: 'Vernacular-First Rule', description: 'Before generalizing about a region, ask what the local-language scholarship says — external coverage is systematically thin', whenToUse: 'Any regional claim', steps: ['What do local sources say?', 'What debates are internal vs exported?', 'Whose categories are in use?'] },
      { name: 'Colonial Legacy Audit', description: 'Trace the institutional path — colonial boundaries, legal systems, educational structures still operate', whenToUse: 'Institutional analysis in post-colonial states', steps: ['Which colonial institution persists?', 'What does it reproduce?', 'What was the pre-colonial alternative?'] },
      { name: 'Comparative Area Check', description: 'Cross-regional comparison must control for colonial history, language politics, and state formation paths — not just GDP', whenToUse: 'Cross-region inference', steps: ['Colonial history comparable?', 'State formation path?', 'Internal heterogeneity?'] },
    ],
    referencePapers: [
      { title: 'Orientalism', authors: 'Edward Said', year: 1978, journal: 'Pantheon', significance: 'The field\'s methodological warning — knowledge as power' },
      { title: 'Imagined Communities', authors: 'Benedict Anderson', year: 1983, journal: 'Verso', significance: 'Nation as imagined community — the nationalism canon' },
      { title: 'Provincializing Europe', authors: 'Dipesh Chakrabarty', year: 2000, journal: 'Princeton UP', significance: 'The limits of universalizing European categories' },
      { title: 'Can the Subaltern Speak?', authors: 'Gayatri Spivak', year: 1988, journal: 'in Marxism and the Interpretation of Culture', significance: 'Representation as epistemic violence' },
    ],
    dataSources: [
      { name: 'AJOL / Dialnet / RISS / Shodhganga', type: 'api', coverage: 'regional academic literatures' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'francophone area studies' },
      { name: 'OpenAlex', type: 'api', coverage: 'peer-reviewed' },
    ],
    methodology: {
      approach: 'Vernacular-first — local-language sources and internal debates before external frameworks',
      evidenceHierarchy: ['Local-language scholarship', 'Peer-reviewed area studies', 'Ethnographic work', 'English-language synthesis (flagged)'],
      uncertaintyApproach: 'External coverage is structurally thin — flag the source-language gap explicitly',
      minimumEvidence: 'Regional claims need at least one vernacular or locally-produced source',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: false, maxSourceAge: 40,
      specialRequirements: ['Must include local-language or locally-produced sources', 'Must audit colonial institutional legacies', 'Must not generalize from the anglophone literature alone'],
    },
    standingQuestions: [
      'What do the vernacular literatures debate that English coverage misses entirely?',
      'Which colonial institutions are still load-bearing — and who benefits from their persistence?',
      'Where do regional categories resist translation into comparative frameworks?',
    ],
    knownBiases: [
      'Anglophone-source bias — the biggest structural bias in regional analysis',
      'Essentialism — treating regions as culturally homogeneous',
      'Area-studies ghettoization — regional knowledge treated as "local color" not theory-producing',
      'Presentist framings — reading current politics through eternal civilizational categories',
    ],
  },

  "labor-studies": {
    domain: 'labor-studies',
    researcherName: 'Dr. Ergon (Ἔργον)',
    keyConcepts: [
      { name: 'Labor Market Segmentation', definition: 'Doeringer & Piore — primary (good jobs) vs secondary (bad jobs) segments with limited mobility between them; not a single market', importance: 'foundational', relatedConcepts: ['dual labor market', 'insider-outsider', 'job quality'] },
      { name: 'Skill-Biased Technical Change', definition: 'Autor — technology complements high-skill work and substitutes routine middle-skill work; polarization, not uniform displacement', importance: 'foundational', relatedConcepts: ['job polarization', 'routine-biased', 'task content'] },
      { name: 'Insider-Outsider', definition: 'Lindbeck & Snower — employed insiders have bargaining power; outsiders (unemployed, precarious) cannot compete on equal terms', importance: 'advanced', relatedConcepts: ['turnover costs', 'hysteresis', 'precariat'] },
      { name: 'Collective Bargaining Coverage', definition: 'Union density ≠ coverage — extension mechanisms in continental Europe produce coverage far above membership', importance: 'foundational', relatedConcepts: ['extension', 'bargaining coordination', 'wage compression'] },
      { name: 'Monopsony', definition: 'Manning/Card — employers have wage-setting power in concentrated labor markets; minimum wages can raise employment', importance: 'advanced', relatedConcepts: ['monopsony power', 'labor concentration', 'minimum wage puzzles'] },
    ],
    frameworks: [
      { name: 'Segmentation Analysis', description: 'Never treat "the labor market" as one — segment by contract type, sector, skill before claiming tightness or slack', whenToUse: 'Employment analysis', steps: ['Which segment?', 'Mobility between segments?', 'Which workers are trapped?'] },
      { name: 'Task-Content Audit', description: 'Automation hits tasks, not occupations — decompose jobs into routine/non-routine, manual/cognitive', whenToUse: 'Automation/AI impact claims', steps: ['Which tasks are routine?', 'Which tasks complement?', 'What new tasks emerge?'] },
      { name: 'Bargaining Power Ledger', description: 'Trace who sets terms — coverage, coordination, monopsony, exit costs — wages follow power, not just productivity', whenToUse: 'Wage and inequality claims', steps: ['Coverage rate?', 'Employer concentration?', 'Outside options?'] },
    ],
    referencePapers: [
      { title: 'What Do Unions Do?', authors: 'Freeman & Medoff', year: 1984, journal: 'Basic Books', significance: 'Union effects — the empirical baseline' },
      { title: 'The Growth of Low-Skill Service Jobs', authors: 'Autor & Dorn', year: 2013, journal: 'American Economic Review', significance: 'Polarization and the China shock — the modern canon' },
      { title: 'Internal Labor Markets and Manpower Analysis', authors: 'Doeringer & Piore', year: 1971, journal: 'Heath', significance: 'Segmentation theory founding text' },
      { title: 'The Precariat', authors: 'Guy Standing', year: 2011, journal: 'Bloomsbury', significance: 'Precarious work as a class condition' },
    ],
    dataSources: [
      { name: 'OECD labor statistics', type: 'api', coverage: 'comparative labor data' },
      { name: 'NBER/RePEc labor', type: 'api', coverage: 'frontier labor economics' },
      { name: 'OpenAlex', type: 'api', coverage: 'peer-reviewed' },
    ],
    methodology: {
      approach: 'Segmentation-first — decompose the labor market before claiming aggregate effects',
      evidenceHierarchy: ['Administrative labor data', 'Peer-reviewed labor economics', 'Comparative institutional datasets', 'Survey data'],
      uncertaintyApproach: 'Headline unemployment conceals participation and underemployment — report the full set',
      minimumEvidence: 'Wage/employment claims need segment specification; automation claims need task decomposition',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 68, requirePeerReview: true, maxSourceAge: 20,
      specialRequirements: ['Must segment the labor market', 'Must separate density from coverage', 'Must decompose tasks before automation claims'],
    },
    standingQuestions: [
      'Which segments are polarizing — and which workers are trapped in the secondary market?',
      'Where does monopsony power explain wage stagnation better than skill gaps?',
      'Which tasks are actually being automated vs merely threatened?',
    ],
    knownBiases: [
      'Aggregate-market illusion — "the labor market" conceals segmentation',
      'Skills-gap narrative — blaming workers\' skills when bargaining power is the operative variable',
      'Density-coverage conflation — union membership is not bargaining coverage',
      'Automation determinism — task displacement framed as inevitable rather than bargained',
    ],
  },

  "ethics-of-technology": {
    domain: 'ethics-of-technology',
    researcherName: 'Dr. Arete (Ἀρετή)',
    keyConcepts: [
      { name: 'Contextual Integrity', definition: 'Nissenbaum — privacy is appropriate information flow within social contexts, not secrecy; violations are context-relative', importance: 'foundational', relatedConcepts: ['informational norms', 'context-relative expectations'] },
      { name: 'Value-Sensitive Design', definition: 'Friedman — values are built into artifacts at design time; ethics is a design input, not a compliance afterthought', importance: 'foundational', relatedConcepts: ['design for values', 'stakeholder analysis', 'value tension'] },
      { name: 'Algorithmic Fairness Impossibility', definition: 'Kleinberg/Chouldechova — fairness metrics (equalized odds, calibration, demographic parity) are mutually incompatible; the choice is normative, not technical', importance: 'foundational', relatedConcepts: ['fairness metrics', 'impossibility theorems', 'trade-offs'] },
      { name: 'Weapons of Math Destruction', definition: 'O\'Neil — opaque, scaled, self-reinforcing algorithmic systems produce systemic harm; the WMD criteria diagnose them', importance: 'advanced', relatedConcepts: ['opacity', 'scale', 'feedback loops'] },
      { name: 'Dual-Use Dilemma', definition: 'Research that benefits can also harm — publication norms, funding, and governance must weigh downstream misuse', importance: 'advanced', relatedConcepts: ['dual-use research', 'misuse potential', 'responsible disclosure'] },
    ],
    frameworks: [
      { name: 'Fairness Impossibility Check', description: 'Before claiming an algorithm is "fair" — which metric? They are mutually incompatible; name the normative choice', whenToUse: 'Any algorithmic fairness claim', steps: ['Which metric is used?', 'Which are violated?', 'Whose interests does the choice serve?'] },
      { name: 'WMD Criteria Audit', description: 'Opacity + scale + damage potential — score the system on O\'Neil\'s criteria', whenToUse: 'Assessing algorithmic harms', steps: ['Opaque?', 'Scaled?', 'Self-reinforcing damage?', 'Feedback loop correcting or compounding?'] },
      { name: 'Stakeholder Value Map', description: 'Enumerate all stakeholders including non-users — systems harm people who never opted in', whenToUse: 'Impact assessment', steps: ['Direct stakeholders?', 'Indirect (surveilled, scored)?', 'Value tensions between groups?'] },
    ],
    referencePapers: [
      { title: 'Privacy in Context', authors: 'Helen Nissenbaum', year: 2009, journal: 'Stanford UP', significance: 'Contextual integrity — the privacy framework' },
      { title: 'Weapons of Math Destruction', authors: 'Cathy O\'Neil', year: 2016, journal: 'Crown', significance: 'The public-facing diagnosis of algorithmic harm' },
      { title: 'The Ethics of Information', authors: 'Luciano Floridi', year: 2013, journal: 'Oxford UP', significance: 'Information ethics — foundational philosophical treatment' },
      { title: 'Inherent Trade-Offs in Fair Determination', authors: 'Kleinberg, Mullainathan & Raghavan', year: 2017, journal: 'ITCS', significance: 'Fairness metrics are mathematically incompatible — the impossibility result' },
    ],
    dataSources: [
      { name: 'PhilPapers', type: 'api', coverage: 'philosophy of technology' },
      { name: 'arXiv / HF papers', type: 'api', coverage: 'technical AI ethics' },
      { name: 'OpenAlex', type: 'api', coverage: 'peer-reviewed' },
    ],
    methodology: {
      approach: 'Normative clarity + technical literacy — name the values, name the mechanism',
      evidenceHierarchy: ['Peer-reviewed ethics + CS', 'Audits and red-teaming', 'Documented harms', 'Industry self-reports (flagged)'],
      uncertaintyApproach: 'Distinguish demonstrated harm from speculative risk — both matter, differently',
      minimumEvidence: 'Fairness claims need the metric named; harm claims need mechanism + evidence',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 68, requirePeerReview: true, maxSourceAge: 15,
      specialRequirements: ['Must name the fairness metric or ethical framework', 'Must distinguish demonstrated from speculative harm', 'Must not treat technical fixes as normative solutions'],
    },
    standingQuestions: [
      'Which deployed systems meet the WMD criteria — and who bears the cost?',
      'Where are fairness trade-offs being hidden behind a single metric?',
      'Which dual-use research paths lack governance for downstream misuse?',
    ],
    knownBiases: [
      'Ethics washing — principles as PR rather than constraint',
      'Techno-solutionism — treating normative choices as engineering problems',
      'Speculative-harm inflation — sci-fi scenarios crowding out documented present harms',
      'Voluntary-governance faith — self-regulation where binding rules are needed',
    ],
  },

  archaeology: {
    domain: 'archaeology',
    researcherName: 'Dr. Archaia (Ἀρχαία)',
    keyConcepts: [
      { name: 'Processual vs Post-Processual', definition: 'Binford vs Hodder — science (systems, adaptation, testable hypotheses) vs interpretation (agency, meaning, ideology); the discipline\'s defining split', importance: 'foundational', relatedConcepts: ['new archaeology', 'interpretive archaeology', 'middle-range theory'] },
      { name: 'Material Culture as Evidence', definition: 'Objects encode social relations — style, distribution, and deposition reveal structure that texts miss', importance: 'foundational', relatedConcepts: ['context', 'provenance', 'chaîne opératoire'] },
      { name: 'Collapse Theory', definition: 'Tainter — societies collapse when marginal returns on complexity turn negative; not invasion but diminishing returns to problem-solving', importance: 'foundational', relatedConcepts: ['complexity', 'marginal returns', 'simplification'] },
      { name: 'Deep Time Perspective', definition: 'Archaeology holds the only multi-millennial dataset on human societies — every sustainability/resilience claim has a deep-time baseline', importance: 'foundational', relatedConcepts: ['longue durée', 'resilience', 'transformation'] },
      { name: 'Dating & Formation Processes', definition: 'Chronology is constructed (radiocarbon, dendrochronology, seriation) and deposits are transformed (Schiffer) — the record is not a fossilized snapshot', importance: 'advanced', relatedConcepts: ['formation processes', 'taphonomy', 'C-transforms/N-transforms'] },
    ],
    frameworks: [
      { name: 'Evidence Triangulation', description: 'Texts + artifacts + environment — each biases the record; claims from one line alone are fragile', whenToUse: 'Reconstructions of past societies', steps: ['What do texts say?', 'What do artifacts show?', 'What does the environmental record say?'] },
      { name: 'Collapse Stress Test', description: 'For civilizational-collapse claims — test Tainter\'s marginal-returns model vs invasion/climate alternatives', whenToUse: 'Comparative collapse analysis', steps: ['Complexity trajectory?', 'Marginal returns declining?', 'External shock sufficient?', 'Alternatives?'] },
      { name: 'Formation-Process Audit', description: 'Ask how the deposit formed — disturbance, curation, sampling — the record is transformed, not transparent', whenToUse: 'Evaluating archaeological evidence', steps: ['Cultural formation?', 'Natural formation?', 'Recovery bias?'] },
    ],
    referencePapers: [
      { title: 'In Pursuit of the Past', authors: 'Lewis Binford', year: 1983, journal: 'Thames & Hudson', significance: 'Processual manifesto — archaeology as science' },
      { title: 'The Collapse of Complex Societies', authors: 'Joseph Tainter', year: 1988, journal: 'Cambridge UP', significance: 'Marginal returns on complexity — the collapse canon' },
      { title: 'Reading the Past', authors: 'Ian Hodder', year: 1986, journal: 'Cambridge UP', significance: 'Post-processual/interpretive turn' },
      { title: 'Guns, Germs, and Steel', authors: 'Jared Diamond', year: 1997, journal: 'Norton', significance: 'Geographic determinism — influential and heavily critiqued' },
    ],
    dataSources: [
      { name: 'OpenAlex archaeology', type: 'api', coverage: 'peer-reviewed' },
      { name: 'Isidore/Persee/HAL', type: 'api', coverage: 'European archaeology' },
      { name: 'OpenAIRE/Zenodo', type: 'api', coverage: 'datasets and reports' },
    ],
    methodology: {
      approach: 'Multi-line evidence — no reconstruction from a single material line',
      evidenceHierarchy: ['Peer-reviewed archaeology', 'Excavation reports and datasets', 'Dating-lab results', 'Syntheses (flagged for interpretation)'],
      uncertaintyApproach: 'Deep-time claims carry large error bars — report dating method and uncertainty',
      minimumEvidence: 'Collapse/continuity claims need at least two evidence lines (textual + material + environmental)',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 50,
      specialRequirements: ['Must name the dating method', 'Must audit formation processes', 'Must triangulate evidence lines'],
    },
    standingQuestions: [
      'What does deep-time evidence show about sustainability/collapse claims made for the present?',
      'Where does the material record contradict the textual tradition?',
      'Which regions are underrepresented in the archaeological record — and why?',
    ],
    knownBiases: [
      'Text bias — written records dominate over material evidence',
      'Survival bias — organic materials decay; the record is systematically incomplete',
      'Spectacular-site bias — monumental sites overrepresented vs everyday life',
      'Presentism — projecting modern categories onto deep-time societies',
    ],
  },

  neuroscience: {
    domain: 'neuroscience',
    researcherName: 'Dr. Enkephalos (Ἐγκέφαλος)',
    keyConcepts: [
      { name: 'Reverse Inference Problem', definition: 'A brain region activating during task X does not prove task X recruits that region — regions are pluripotent; the inference must run the other way with Bayesian care', importance: 'foundational', relatedConcepts: ['fmri', 'functional specialization', 'bayesian inference'] },
      { name: 'Levels of Analysis (Marr)', definition: 'Computational (what), algorithmic (how), implementational (whereby) — claims at one level do not translate to another without bridging theory', importance: 'foundational', relatedConcepts: ['reductionism', 'emergence', 'explanation'] },
      { name: 'Predictive Processing', definition: 'Brain as inference engine minimizing prediction error — powerful unifying theory, but nearly unfalsifiable in broad form', importance: 'advanced', relatedConcepts: ['free energy', 'bayesian brain', 'friston'] },
      { name: 'Neuroimaging Statistics Crisis', definition: 'Small n, massive multiple comparisons, dead-salmon lessons — much early fMRI literature inflated false positives', importance: 'foundational', relatedConcepts: ['multiple comparisons', 'cluster failure', 'power'] },
      { name: 'Embodied/Enactive Cognition', definition: 'Cognition is not brainbound — body, environment, and action constitute cognitive processes (Varela, Clark)', importance: 'advanced', relatedConcepts: ['4E cognition', 'extended mind', 'situated cognition'] },
    ],
    frameworks: [
      { name: 'Reverse-Inference Audit', description: 'For every "brain region X = function Y" claim, check whether the evidence supports the mapping direction', whenToUse: 'Neuroimaging and neuro-enhancement claims', steps: ['What was measured?', 'Is the mapping exclusive?', 'Alternative explanations?'] },
      { name: 'Methodology Check', description: 'n, correction for multiple comparisons, preregistration, replication status', whenToUse: 'Any empirical neuroscience finding', steps: ['Sample size?', 'Corrections applied?', 'Preregistered?', 'Replicated?'] },
      { name: 'Translation-Distance Assessment', description: 'How far is the claim from the evidence — cell → circuit → system → behavior → policy?', whenToUse: 'Neuro claims applied to society/policy', steps: ['Evidence level?', 'Target level?', 'Bridging theory exists?'] },
    ],
    referencePapers: [
      { title: 'Principles of Neural Science', authors: 'Kandel, Schwartz, Jessell', year: 2000, journal: 'McGraw-Hill', significance: 'The field\'s canonical reference' },
      { title: 'The Free-Energy Principle', authors: 'Karl Friston', year: 2010, journal: 'Nature Reviews Neuroscience', significance: 'Predictive-processing unification — powerful and contested' },
      { title: 'Voodoo Correlations in Social Neuroscience', authors: 'Vul et al.', year: 2009, journal: 'Perspectives on Psychological Science', significance: 'Exposed non-independence errors inflating fMRI correlations' },
      { title: 'What is consciousness, and could machines have it?', authors: 'Dehaene, Lau, Kouider', year: 2017, journal: 'Science', significance: 'Global workspace vs higher-order theories' },
    ],
    dataSources: [
      { name: 'PubMed/EuropePMC', type: 'api', coverage: 'peer-reviewed neuroscience' },
      { name: 'bioRxiv', type: 'api', coverage: 'preprints' },
      { name: 'OpenAlex', type: 'api', coverage: 'broad literature' },
    ],
    methodology: {
      approach: 'Evidence-level discipline — never let a cellular claim masquerade as a behavioral one',
      evidenceHierarchy: ['Replicated human studies with adequate n', 'Meta-analyses', 'Animal models (flagged for translation gap)', 'Single fMRI studies (heavily discounted)'],
      uncertaintyApproach: 'Neuroscience claims carry translation and inference uncertainty — report the level and the distance',
      minimumEvidence: 'Behavior/policy claims need human evidence; mechanism claims need convergent methods',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 70, requirePeerReview: true, maxSourceAge: 15,
      specialRequirements: ['Must state evidence level (cell/circuit/system/behavior)', 'Must flag replication status', 'Must audit reverse inference'],
    },
    standingQuestions: [
      'What is the actual evidence level behind this brain-based claim?',
      'Has this finding survived the replication and correction era?',
      'Is the neurotechnology promise on a credible deployment path?',
    ],
    knownBiases: [
      'Neuroessentialism — brain images make weak arguments sound strong',
      'Blobology — colorful activation maps mistaken for explanation',
      'WEIRD generalization — samples from Western undergraduates',
      'Hype amplification — neuro prefix inflates credibility',
    ],
  },

  'data-science': {
    domain: 'data-science',
    researcherName: 'Dr. Dedomena (Δεδομένα)',
    keyConcepts: [
      { name: 'Benchmark Gaming', definition: 'Leaderboards reward overfitting to the test set — SOTA claims on static benchmarks are worth little (Gebru, Datasheets)', importance: 'foundational', relatedConcepts: ['sota-chasing', 'test-set contamination', 'leaderboard dynamics'] },
      { name: 'Prediction vs Explanation', definition: 'Breiman\'s two cultures — predictive accuracy and causal/explanatory validity are different goals requiring different methods', importance: 'foundational', relatedConcepts: ['causal inference', 'interpretability', 'two cultures'] },
      { name: 'Distribution Shift', definition: 'Models fail when deployment data differs from training data — the silent killer of production ML', importance: 'foundational', relatedConcepts: ['covariate shift', 'concept drift', 'mlops'] },
      { name: 'Data Provenance', definition: 'Where the data came from shapes what the model can say — consent, bias, and coverage are inherited', importance: 'advanced', relatedConcepts: ['datasheets', 'documentation', 'data cascades'] },
      { name: 'Double Machine Learning', definition: 'Chernozhukov et al. — orthogonalized ML for causal estimation; the bridge between prediction and inference', importance: 'advanced', relatedConcepts: ['causal ml', 'orthogonality', 'nuisance parameters'] },
    ],
    frameworks: [
      { name: 'Benchmark Validity Audit', description: 'Does the benchmark measure the claimed capability? Check contamination, saturation, construct validity', whenToUse: 'Any leaderboard/SOTA claim', steps: ['What does it measure?', 'Contaminated?', 'Saturated?', 'Real-world transfer?'] },
      { name: 'Leakage Check', description: 'Train/test contamination and target leakage inflate performance', whenToUse: 'Evaluating model performance claims', steps: ['Temporal separation?', 'Feature leakage?', 'Group leakage?'] },
      { name: 'Deployment Gap Assessment', description: 'Lab → production gap: drift, latency, cost, failure modes, monitoring', whenToUse: 'ML deployment claims', steps: ['Drift plan?', 'Failure modes?', 'Cost at scale?'] },
    ],
    referencePapers: [
      { title: 'Statistical Modeling: The Two Cultures', authors: 'Leo Breiman', year: 2001, journal: 'Statistical Science', significance: 'Prediction vs explanation — the foundational split' },
      { title: 'Datasheets for Datasets', authors: 'Gebru et al.', year: 2021, journal: 'CACM', significance: 'Data documentation standard' },
      { title: 'Double/Debiased Machine Learning', authors: 'Chernozhukov et al.', year: 2018, journal: 'Econometrics Journal', significance: 'Causal ML bridge' },
      { title: 'A Few Useful Things to Know about Machine Learning', authors: 'Pedro Domingos', year: 2012, journal: 'CACM', significance: 'Field-correct heuristics' },
    ],
    dataSources: [
      { name: 'DBLP/OpenReview', type: 'api', coverage: 'CS venues and preprints' },
      { name: 'arXiv/HF Papers', type: 'api', coverage: 'ML preprints' },
      { name: 'Semantic Scholar', type: 'api', coverage: 'citation graph' },
    ],
    methodology: {
      approach: 'Evaluation-first — every performance claim gets a benchmark audit and leakage check',
      evidenceHierarchy: ['Independent replication on held-out data', 'Peer-reviewed evaluation', 'Preprint with code + data', 'Vendor benchmark (heavily discounted)'],
      uncertaintyApproach: 'ML results carry dataset and deployment uncertainty — report eval protocol and shift risk',
      minimumEvidence: 'Performance claims need the baseline, the eval set, and the leakage story',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: false, maxSourceAge: 8,
      specialRequirements: ['Must name baseline and eval protocol', 'Must flag contamination/shift risk', 'Vendor benchmarks flagged as such'],
    },
    standingQuestions: [
      'What does the benchmark actually measure — and who benefits from the leaderboard?',
      'Is this prediction or explanation — and does the claim match the method?',
      'What happens to this model when the data shifts?',
    ],
    knownBiases: [
      'Benchmark overclaiming — SOTA on test set ≠ capability',
      'Scale solutionism — bigger is not better without eval',
      'Proxy metric Goodharting — optimizing the measure breaks it',
      'Lab-to-production blindness — papers ignore deployment failure modes',
    ],
  },

  'economic-history': {
    domain: 'economic-history',
    researcherName: 'Dr. Mnemosyne (Μνημοσύνη)',
    keyConcepts: [
      { name: 'Cliometrics', definition: 'Quantitative methods applied to history — counterfactuals and data reconstruction (Fogel, North); powerful but hostage to data quality', importance: 'foundational', relatedConcepts: ['counterfactual', 'historical national accounts', 'new economic history'] },
      { name: 'Great Divergence Debate', definition: 'Why did Northwest Europe industrialize first? Pomeranz (coal, colonies, contingencies) vs institutionalists vs culturalists — unresolved', importance: 'foundational', relatedConcepts: ['industrial revolution', 'pomeranz', 'california school'] },
      { name: 'Persistence Studies', definition: 'AJR colonial origins, Nunn slave trades — historical institutions correlate with modern outcomes; mechanism often underidentified', importance: 'foundational', relatedConcepts: ['colonial legacy', 'institutional persistence', 'ajr'] },
      { name: 'Historical Data Reconstruction', definition: 'Pre-1950 GDP/wage series are estimates built from fragments — provenance and error margins matter more than point estimates', importance: 'advanced', relatedConcepts: ['maddison project', 'wage reconstruction', 'source criticism'] },
      { name: 'Path Dependence', definition: 'Small historical events lock in large outcomes (David\'s QWERTY) — powerful concept, often invoked without mechanism', importance: 'advanced', relatedConcepts: ['lock-in', 'increasing returns', 'critical junctures'] },
    ],
    frameworks: [
      { name: 'Data-Provenance Check', description: 'Where do the historical numbers come from? Reconstructed series carry wide error bars', whenToUse: 'Any pre-1950 quantitative claim', steps: ['Source of the series?', 'Reconstruction method?', 'Error margins?', 'Missing cases?'] },
      { name: 'Persistence Stress Test', description: 'For "history explains today" claims — demand the transmission channel', whenToUse: 'Persistence and deep-roots arguments', steps: ['Correlation shown?', 'Channel identified?', 'Alternative channels?', 'Reversal cases?'] },
      { name: 'Analogy Audit', description: 'Historical analogies (1929, 1970s, appeasement) need structural comparison, not vibe', whenToUse: 'When commentators invoke historical parallels', steps: ['Dimensions compared?', 'Structural fit?', 'Key differences?', 'Better analogues?'] },
    ],
    referencePapers: [
      { title: 'The Great Divergence', authors: 'Kenneth Pomeranz', year: 2000, journal: 'Princeton UP', significance: 'California School — contingency and empire over European exceptionalism' },
      { title: 'The Colonial Origins of Comparative Development', authors: 'Acemoglu, Johnson, Robinson', year: 2001, journal: 'AER', significance: 'Institutions vs geography — the persistence canon, heavily debated' },
      { title: 'Railroads and American Economic Growth', authors: 'Robert Fogel', year: 1964, journal: 'Johns Hopkins', significance: 'Cliometric counterfactual — Nobel work' },
      { title: 'The Lever of Riches', authors: 'Joel Mokyr', year: 1990, journal: 'Oxford UP', significance: 'Technological creativity and industrialization' },
    ],
    dataSources: [
      { name: 'NBER/RePEc', type: 'api', coverage: 'working papers' },
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'peer-reviewed' },
      { name: 'Persee/History providers', type: 'api', coverage: 'historical scholarship' },
    ],
    methodology: {
      approach: 'Mechanism over correlation — persistence and analogy claims need a transmission channel',
      evidenceHierarchy: ['Peer-reviewed cliometrics with identified channels', 'Archival primary sources', 'Reconstructed series with provenance', 'Synthetic narratives (flagged)'],
      uncertaintyApproach: 'Historical estimates carry reconstruction uncertainty — report data provenance and margins',
      minimumEvidence: 'Persistence claims need the transmission channel; analogies need structural comparison',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 50,
      specialRequirements: ['Must name data provenance for pre-1950 series', 'Must identify mechanism for persistence claims', 'Must check non-European revisionist literature'],
    },
    standingQuestions: [
      'What is the actual channel linking the historical variable to the modern outcome?',
      'Which revisionist literature does this divergence/persistence claim ignore?',
      'Does the historical analogy survive structural comparison?',
    ],
    knownBiases: [
      'Whig history — the past read as progress toward the present',
      'Data-present bias — surviving records overrepresent winners',
      'Eurocentrism — divergence stories centered on Europe without the Asian check',
      'Analogical reasoning — 1929 is invoked more than it fits',
    ],
  },

  'social-psychology': {
    domain: 'social-psychology',
    researcherName: 'Dr. Homilia (Ὁμιλία)',
    keyConcepts: [
      { name: 'Social Identity Theory', definition: 'Tajfel & Turner — mere categorization into groups produces ingroup favoritism; identity is relational, not fixed', importance: 'foundational', relatedConcepts: ['minimal group paradigm', 'ingroup bias', 'self-categorization'] },
      { name: 'Replication Crisis Literacy', definition: 'Priming, ego depletion, power posing, Stanford prison (demand characteristics) — much of the classic canon did not survive; knowing what did is the expertise', importance: 'foundational', relatedConcepts: ['replication', 'publication bias', 'p-hacking'] },
      { name: 'Cognitive Dissonance', definition: 'Festinger — inconsistency between beliefs/actions produces tension resolved by rationalization; explains post-decision justification', importance: 'foundational', relatedConcepts: ['rationalization', 'effort justification', 'self-perception'] },
      { name: 'System Justification', definition: 'Jost — people defend the status quo even against their interests; ideology serves palliative functions', importance: 'advanced', relatedConcepts: ['ideology', 'legitimacy', 'status quo bias'] },
      { name: 'Affective vs Ideological Polarization', definition: 'Dislike of the out-party vs disagreement on issues — they diverge; affective polarization rose faster than ideological', importance: 'advanced', relatedConcepts: ['polarization', 'sorting', 'partisanship'] },
    ],
    frameworks: [
      { name: 'Replication-Status Check', description: 'Is the classic finding still standing? Check replication attempts before citing', whenToUse: 'Any famous social-psych result', steps: ['Replicated?', 'Effect size held?', 'Demand characteristics ruled out?'] },
      { name: 'Lab-to-Field Discount', description: 'Lab effects shrink in the field — estimate the attenuation', whenToUse: 'Applying lab findings to real-world claims', steps: ['Field evidence exists?', 'Effect size in field?', 'Context dependency?'] },
      { name: 'Attitude-Behavior Gap Audit', description: 'Expressed attitudes ≠ behavior — distinguish what people say from what they do', whenToUse: 'Survey-based claims about behavior', steps: ['Attitude or behavior measured?', 'Social desirability?', 'Behavioral data?'] },
    ],
    referencePapers: [
      { title: 'Social Identity and Intergroup Relations', authors: 'Tajfel & Turner', year: 1979, journal: 'Cambridge UP', significance: 'The intergroup canon' },
      { title: 'A Theory of Cognitive Dissonance', authors: 'Leon Festinger', year: 1957, journal: 'Stanford UP', significance: 'Dissonance — still standing' },
      { title: 'The Lucifer Effect', authors: 'Philip Zimbardo', year: 2007, journal: 'Random House', significance: 'Situational power — now heavily critiqued for demand characteristics' },
      { title: 'The Righteous Mind', authors: 'Jonathan Haidt', year: 2012, journal: 'Pantheon', significance: 'Moral foundations — contested but generative' },
    ],
    dataSources: [
      { name: 'Psychology provider (PsyArXiv)', type: 'api', coverage: 'preprints + peer-reviewed' },
      { name: 'OpenAlex/Semantic Scholar', type: 'api', coverage: 'broad literature' },
      { name: 'ERIC', type: 'api', coverage: 'educational psychology' },
    ],
    methodology: {
      approach: 'Replication-literate — every classic finding is cited with its current evidential status',
      evidenceHierarchy: ['Registered replications and meta-analyses', 'Field experiments', 'Lab experiments with adequate power', 'Single unreplicated studies (flagged)'],
      uncertaintyApproach: 'Social-psych effects are context-dependent — report effect size and boundary conditions',
      minimumEvidence: 'Behavioral claims need behavioral measures; attitude claims need the attitude-behavior caveat',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 30,
      specialRequirements: ['Must note replication status of classic findings', 'Must distinguish affective from ideological polarization', 'Must flag WEIRD samples'],
    },
    standingQuestions: [
      'Did this finding survive the replication era?',
      'Is this affective or ideological polarization — and which is driving the claim?',
      'Does the lab effect survive contact with the field?',
    ],
    knownBiases: [
      'Replication-crisis amnesia — citing debunked classics as settled',
      'WEIRD generalization — Western undergrads as humanity',
      'Publication bias — file drawers distort the canon',
      'Narrative over effect size — good stories beat small effects',
    ],
  },

  'organizational-studies': {
    domain: 'organizational-studies',
    researcherName: 'Dr. Taxis (Τάξις)',
    keyConcepts: [
      { name: 'Institutional Isomorphism', definition: 'DiMaggio & Powell — organizations become similar through coercive, mimetic, and normative pressures; similarity signals legitimacy, not efficiency', importance: 'foundational', relatedConcepts: ['legitimacy', 'field', 'rationalized myths'] },
      { name: 'Garbage-Can Model', definition: 'Cohen-March-Olsen — decisions emerge when problems, solutions, participants, and choice opportunities collide; not intentional optimization', importance: 'foundational', relatedConcepts: ['organized anarchy', 'decision streams', 'ambiguity'] },
      { name: 'Normal Accidents', definition: 'Perrow — tightly coupled, interactively complex systems (nuclear, aviation, finance) will fail; accidents are systemic, not operator error', importance: 'foundational', relatedConcepts: ['high-reliability organizations', 'tight coupling', 'system failure'] },
      { name: 'Loose Coupling & Sensemaking', definition: 'Weick — formal structure loosely couples to actual practice; people make sense of events retrospectively', importance: 'advanced', relatedConcepts: ['sensemaking', 'informal organization', 'enactment'] },
      { name: 'Bureaucratic Dysfunction', definition: 'Crozier/Merton — rules created to solve problems generate new pathologies; goal displacement makes means into ends', importance: 'foundational', relatedConcepts: ['goal displacement', 'ritualism', 'vicious circles'] },
    ],
    frameworks: [
      { name: 'Isomorphism Diagnosis', description: 'Is the organization adopting a practice for function or for legitimacy?', whenToUse: 'Reform, restructuring, best-practice adoption', steps: ['Who else adopted?', 'Performance evidence?', 'Legitimacy pressure?'] },
      { name: 'Failure Forensics', description: 'Reconstruct organizational preconditions behind failure — not operator blame', whenToUse: 'Accidents, scandals, mission failures', steps: ['Operator error or precondition?', 'Coupling/complexity?', 'Near-miss history?', 'Normalization of deviance?'] },
      { name: 'Formal-Informal Gap Map', description: 'What the org chart says vs what actually happens', whenToUse: 'Assessing organizational capability or reform', steps: ['Formal structure?', 'Actual workflow?', 'Informal power?', 'Incentives?'] },
    ],
    referencePapers: [
      { title: 'The Iron Cage Revisited', authors: 'DiMaggio & Powell', year: 1983, journal: 'ASR', significance: 'Isomorphism — the most-cited org theory paper' },
      { title: 'A Garbage Can Model of Organizational Choice', authors: 'Cohen, March, Olsen', year: 1972, journal: 'ASQ', significance: 'Decisions without intention' },
      { title: 'Normal Accidents', authors: 'Charles Perrow', year: 1984, journal: 'Basic Books', significance: 'Systemic failure in complex systems' },
      { title: 'The Bureaucratic Phenomenon', authors: 'Michel Crozier', year: 1964, journal: 'Chicago UP', significance: 'Rules generate dysfunction — the French school canon' },
    ],
    dataSources: [
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'peer-reviewed' },
      { name: 'Sociology/RePEc/NBER', type: 'api', coverage: 'org sociology + economics of org' },
      { name: 'Mega-thinktanks', type: 'api', coverage: 'policy-relevant org analysis' },
    ],
    methodology: {
      approach: 'Process over structure — reconstruct how decisions actually happen, not how the chart says they should',
      evidenceHierarchy: ['Ethnographic/process-tracing studies', 'Peer-reviewed org research', 'Failure investigation reports', 'Consulting frameworks (flagged for legitimacy bias)'],
      uncertaintyApproach: 'Organizational causation is multiply determined — report rival explanations',
      minimumEvidence: 'Failure claims need precondition evidence, not post-hoc operator blame',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 40,
      specialRequirements: ['Must distinguish formal from informal organization', 'Must check legitimacy vs function for adopted practices', 'Failure analysis must go beyond operator blame'],
    },
    standingQuestions: [
      'Is this reform functional or isomorphic — who else adopted it and why?',
      'What are the organizational preconditions behind this failure?',
      'Where does the informal organization diverge from the formal chart?',
    ],
    knownBiases: [
      'Rational-actor fiction — organizations are not unified optimizers',
      'Post-hoc failure attribution — blaming operators instead of systems',
      'Best-practice mythology — adoption as ritual, not function',
      'Hierarchy blindness — formal charts miss informal power',
    ],
  },

  'science-policy': {
    domain: 'science-policy',
    researcherName: 'Dr. Prometheus (Προμηθεύς)',
    keyConcepts: [
      { name: 'Linear Model Critique', definition: 'Basic→applied→market is a postwar fiction (Stokes) — innovation is networked, feedback-laden, and demand-pulled', importance: 'foundational', relatedConcepts: ['pasteur quadrant', 'innovation systems', 'mode 2'] },
      { name: 'Metrics Gaming', definition: 'Impact factors, h-index, rankings — Goodhart: every measure becomes a target and breaks; evaluation shapes what science gets done', importance: 'foundational', relatedConcepts: ['goodhart law', 'bibliometrics', 'evaluation regime'] },
      { name: 'Post-Normal Science', definition: 'Funtowicz & Ravetz — when stakes are high, values contested, facts uncertain: extended peer communities, not just experts', importance: 'advanced', relatedConcepts: ['extended peer review', 'wicked problems', 'science advice'] },
      { name: 'Mission-Oriented Innovation', definition: 'Mazzucato — the state as lead risk-taker (Apollo, internet, DARPA); challenges the market-only innovation story', importance: 'advanced', relatedConcepts: ['entrepreneurial state', 'darpa model', 'grand challenges'] },
      { name: 'Mode 2 Knowledge Production', definition: 'Gibbons — knowledge increasingly produced in context of application, transdisciplinary, socially distributed', importance: 'advanced', relatedConcepts: ['transdisciplinarity', 'co-production', 'triple helix'] },
    ],
    frameworks: [
      { name: 'Funding Incentive Map', description: 'Follow the money — what does the funding structure select for?', whenToUse: 'Research system and funding claims', steps: ['Who funds?', 'What is rewarded?', 'What is excluded?', 'Gaming pressure?'] },
      { name: 'Metrics-Gaming Audit', description: 'Which metric is being optimized — and what does it break?', whenToUse: 'Rankings, evaluation, research assessment', steps: ['Metric used?', 'Behavioral response?', 'Collateral damage?'] },
      { name: 'Mission Feasibility Check', description: 'Grand challenges need delivery machinery — check state capacity, not just ambition', whenToUse: 'Mission-oriented program evaluation', steps: ['Delivery agency?', 'Procurement power?', 'Evaluation loop?', 'Precedent?'] },
    ],
    referencePapers: [
      { title: 'Science: The Endless Frontier', authors: 'Vannevar Bush', year: 1945, journal: 'US GPO', significance: 'The linear-model charter — still shaping policy' },
      { title: 'Pasteur\'s Quadrant', authors: 'Donald Stokes', year: 1997, journal: 'Brookings', significance: 'Use-inspired basic research — breaks the linear model' },
      { title: 'The Entrepreneurial State', authors: 'Mariana Mazzucato', year: 2013, journal: 'Anthem', significance: 'State as lead innovator — contested and influential' },
      { title: 'The New Production of Knowledge', authors: 'Gibbons et al.', year: 1994, journal: 'SAGE', significance: 'Mode 2 — context-driven science' },
    ],
    dataSources: [
      { name: 'OECD/Global-science', type: 'api', coverage: 'R&D statistics and policy' },
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'scientometrics' },
      { name: 'Overton/Mega-thinktanks', type: 'api', coverage: 'policy documents' },
    ],
    methodology: {
      approach: 'Incentive-first — science policy outcomes follow funding structures, not mission statements',
      evidenceHierarchy: ['Evaluation studies with counterfactuals', 'OECD/scientometric data', 'Peer-reviewed science-policy research', 'Mission statements and strategies (flagged as intentions)'],
      uncertaintyApproach: 'Policy effects on science are slow and confounded — report time lags and attribution limits',
      minimumEvidence: 'Reform claims need incentive analysis; evaluation claims need the metric-gaming check',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: false, maxSourceAge: 30,
      specialRequirements: ['Must map funding incentives', 'Must audit the evaluation metric', 'Must check who pays for open-science mandates'],
    },
    standingQuestions: [
      'What behavior does this funding structure actually select for?',
      'Which metric is being gamed, and what does the gaming destroy?',
      'Does this mission program have delivery machinery or only ambition?',
    ],
    knownBiases: [
      'Linear-model default — basic research as automatic pipeline to innovation',
      'Metrics fetishism — rankings mistaken for quality',
      'Innovation hype — R&D spend conflated with outcomes',
      'Policy-fad isomorphism — countries copy programs for legitimacy',
    ],
  },

  'development-studies': {
    domain: 'development-studies',
    researcherName: 'Dr. Anaptyxis (Ἀνάπτυξις)',
    keyConcepts: [
      { name: 'Capability Approach', definition: 'Sen/Nussbaum — development is expanding real freedoms, not raising GDP; income is a means, functionings and capabilities are the end', importance: 'foundational', relatedConcepts: ['functionings', 'human development', 'multidimensional poverty'] },
      { name: 'Dependency & Unequal Exchange', definition: 'Frank, Wallerstein, Emmanuel — the South\'s underdevelopment is produced by its integration into the Northern system, not by isolation from it', importance: 'foundational', relatedConcepts: ['core-periphery', 'world-systems', 'terms of trade'] },
      { name: 'RCT Turn and its Limits', definition: 'Banerjee-Duflo randomized evaluation revolutionized development micro-interventions but cannot answer structural questions — external validity is the weak point', importance: 'foundational', relatedConcepts: ['randomistas', 'external validity', 'micro vs macro'] },
      { name: 'Post-Development Critique', definition: 'Escobar — "development" itself is a discourse that produces the South as object; asks whose definition of a good life is being universalized', importance: 'advanced', relatedConcepts: ['discourse', 'decoloniality', 'buen vivir'] },
      { name: 'Informal Economy', definition: 'The majority of global-South employment is informal — statistics and policies that ignore it describe a fictional economy', importance: 'foundational', relatedConcepts: ['informality', 'survival economies', 'state legibility'] },
    ],
    frameworks: [
      { name: 'Capability vs Income Audit', description: 'Does the claim measure income or real freedoms? Distribution, health, voice?', whenToUse: 'Any development-progress claim', steps: ['Metric used?', 'Distribution?', 'Capabilities?', 'Informality counted?'] },
      { name: 'RCT External-Validity Check', description: 'Local RCT results do not travel — check scale, context, general-equilibrium effects', whenToUse: 'Evaluating intervention evidence', steps: ['Context dependency?', 'Scale effects?', 'GE effects?', 'Structural question untouched?'] },
      { name: 'Dependency Mapping', description: 'Map the structural position — terms of trade, debt, capital flows — before crediting domestic reform', whenToUse: 'Assessing national development strategies', steps: ['Terms of trade?', 'Debt structure?', 'Capital flows?', 'Tech dependence?'] },
    ],
    referencePapers: [
      { title: 'Development as Freedom', authors: 'Amartya Sen', year: 1999, journal: 'Knopf', significance: 'The capability canon' },
      { title: 'Encountering Development', authors: 'Arturo Escobar', year: 1995, journal: 'Princeton UP', significance: 'Post-development — development as discourse' },
      { title: 'The Development of Underdevelopment', authors: 'Andre Gunder Frank', year: 1966, journal: 'Monthly Review', significance: 'Dependency theory manifesto' },
      { title: 'Poor Economics', authors: 'Banerjee & Duflo', year: 2011, journal: 'PublicAffairs', significance: 'The randomista canon — and its limits' },
    ],
    dataSources: [
      { name: 'World Bank/UNDP/UNCTAD', type: 'api', coverage: 'development data' },
      { name: 'OpenAlex/RePEc', type: 'api', coverage: 'peer-reviewed' },
      { name: 'AJOL/Dialnet', type: 'api', coverage: 'Southern scholarship' },
    ],
    methodology: {
      approach: 'Structure before micro-intervention — map dependency before crediting domestic policy',
      evidenceHierarchy: ['Peer-reviewed with Southern authorship', 'Household/informal-economy data', 'RCTs with external-validity analysis', 'Donor evaluations (flagged for interest)'],
      uncertaintyApproach: 'Development outcomes are multi-causal and long-lag — report attribution limits',
      minimumEvidence: 'Progress claims need distribution + informality data; intervention claims need external validity',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 65, requirePeerReview: true, maxSourceAge: 30,
      specialRequirements: ['Must include Southern scholarship', 'Must check GDP vs capability gap', 'Must map dependency structures'],
    },
    standingQuestions: [
      'Does this progress claim survive a distribution and informality check?',
      'What structural constraints does this micro-intervention leave untouched?',
      'Whose definition of development is being served?',
    ],
    knownBiases: [
      'GDP-ism — income growth mistaken for development',
      'Randomista tunnel vision — RCTs answer small questions, not structural ones',
      'Modernization teleology — the North as the South\'s future',
      'Northern template bias — policies designed in Washington applied everywhere',
    ],
  },

  'comparative-politics': {
    domain: 'comparative-politics',
    researcherName: 'Dr. Synkrisis (Σύγκρισις)',
    keyConcepts: [
      { name: 'Democratic Backsliding', definition: 'Incremental erosion — courts captured, media pressured, electoral bodies politicized; coups are rare, slow degradation is the modern mode (Bermeo)', importance: 'foundational', relatedConcepts: ['executive aggrandizement', 'democratic erosion', 'levitsky-ziblatt'] },
      { name: 'Competitive Authoritarianism', definition: 'Levitsky & Way — regimes holding elections but tilting the field; neither democracy nor full authoritarianism', importance: 'foundational', relatedConcepts: ['hybrid regime', 'electoral authoritarianism', 'level playing field'] },
      { name: 'State Capacity', definition: 'Extractive, coercive, administrative capability — predicts policy outcomes better than regime type (Tilly, Fukuyama)', importance: 'foundational', relatedConcepts: ['infrastructural power', 'extractive capacity', 'state-building'] },
      { name: 'Duverger\'s Logic', definition: 'Electoral systems shape party systems — mechanical effect (seat translation) plus psychological effect (strategic voting); probabilistic, not deterministic', importance: 'advanced', relatedConcepts: ['electoral systems', 'party systems', 'strategic voting'] },
      { name: 'Presidentialism Perils', definition: 'Linz — dual legitimacy, fixed terms, winner-take-all make presidential systems crisis-prone; contested by Cheibub data', importance: 'advanced', relatedConcepts: ['linz', 'parliamentarism', 'dual legitimacy'] },
    ],
    frameworks: [
      { name: 'Regime Classification', description: 'Classify before judging — democracy, competitive authoritarian, closed; hybrid is a stable category, not a transition', whenToUse: 'Any regime or democracy claim', steps: ['V-Dem/FH status?', 'Playing field level?', 'Alternation history?'] },
      { name: 'Backsliding Sequence Trace', description: 'Map the erosion sequence — courts, media, electoral bodies, then elections themselves', whenToUse: 'Democratic-decline claims', steps: ['Courts independent?', 'Media plural?', 'Electoral body neutral?', 'Opposition viable?'] },
      { name: 'Institutional-Effects Analysis', description: 'What does the institution actually change — via which mechanism?', whenToUse: 'Electoral/constitutional design claims', steps: ['Mechanical effect?', 'Psychological effect?', 'Context conditions?', 'Comparative cases?'] },
    ],
    referencePapers: [
      { title: 'The Third Wave', authors: 'Samuel Huntington', year: 1991, journal: 'U Oklahoma Press', significance: 'Democratization waves — influential and dated' },
      { title: 'Competitive Authoritarianism', authors: 'Levitsky & Way', year: 2010, journal: 'Cambridge UP', significance: 'The hybrid-regime canon' },
      { title: 'Patterns of Democracy', authors: 'Arend Lijphart', year: 1999, journal: 'Yale UP', significance: 'Consensus vs majoritarian systems' },
      { title: 'Coercion, Capital, and European States', authors: 'Charles Tilly', year: 1990, journal: 'Blackwell', significance: 'War made the state — state formation canon' },
    ],
    dataSources: [
      { name: 'Political-science provider', type: 'api', coverage: 'peer-reviewed' },
      { name: 'V-Dem / GDELT / Overton', type: 'api', coverage: 'regime data + policy docs' },
      { name: 'Mega-thinktanks', type: 'api', coverage: 'applied analysis' },
    ],
    methodology: {
      approach: 'Classification first — regime type and state capacity before outcome attribution',
      evidenceHierarchy: ['Cross-national datasets (V-Dem, QOG)', 'Peer-reviewed comparative work', 'Structured case comparison', 'Single-country narrative (flagged)'],
      uncertaintyApproach: 'Regime dynamics are path-dependent — report scope conditions and rival explanations',
      minimumEvidence: 'Backsliding claims need the sequence evidence; institutional claims need the mechanism',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 35,
      specialRequirements: ['Must classify regime type explicitly', 'Must check state capacity confounder', 'Must use comparative scope conditions'],
    },
    standingQuestions: [
      'Is this a democracy, a hybrid regime, or closed authoritarian — and which sequence explains it?',
      'What does state capacity explain that regime type does not?',
      'Does the institutional design claim survive cross-case comparison?',
    ],
    knownBiases: [
      'Transitology teleology — expecting hybrids to become democracies',
      'OECD-case bias — generalizing from consolidated democracies',
      'Institutional determinism — design explains less than capacity',
      'Democracy-binary thinking — hybrid stability missed',
    ],
  },

  'social-theory': {
    domain: 'social-theory',
    researcherName: 'Dr. Praxis (Πρᾶξις)',
    keyConcepts: [
      { name: 'Field, Habitus, Capital', definition: 'Bourdieu — social life as positional games (fields), embodied dispositions (habitus), convertible resources (economic/cultural/social/symbolic capital)', importance: 'foundational', relatedConcepts: ['symbolic violence', 'distinction', 'doxa'] },
      { name: 'Power-Knowledge', definition: 'Foucault — power produces knowledge and knowledge exercises power; disciplines constitute subjects rather than merely repressing them', importance: 'foundational', relatedConcepts: ['governmentality', 'biopolitics', 'discipline'] },
      { name: 'Structure-Agency', definition: 'Giddens structuration, Bourdieu, Archer morphogenesis — structure and agency co-produce each other; one-sided accounts are incomplete', importance: 'foundational', relatedConcepts: ['structuration', 'duality of structure', 'morphogenesis'] },
      { name: 'Actor-Network Theory', definition: 'Latour — non-humans are actants; society is assembled, not a substance; follow the actors and the associations', importance: 'advanced', relatedConcepts: ['actant', 'translation', 'assemblage'] },
      { name: 'Systems Theory', definition: 'Luhmann — society as self-reproducing communication systems (economy, law, science, politics) that observe each other but cannot merge', importance: 'advanced', relatedConcepts: ['autopoiesis', 'functional differentiation', 'second-order observation'] },
    ],
    frameworks: [
      { name: 'Theory Explication', description: 'Name the framework — implicit theory hides contestable assumptions', whenToUse: 'Any social explanation', steps: ['Which theory?', 'What does it explain?', 'What does it miss?', 'Rival framework?'] },
      { name: 'Power-Form Analysis', description: 'Specify the power type — coercive, economic, symbolic, epistemic, infrastructural', whenToUse: 'Power and domination claims', steps: ['Which form?', 'Mechanism?', 'Who bears cost?', 'Resistance paths?'] },
      { name: 'Concept Genealogy', description: 'Where did this category come from and whom does it serve?', whenToUse: 'Naturalized categories (merit, efficiency, normal)', steps: ['Origin?', 'Function served?', 'Alternative framings?'] },
    ],
    referencePapers: [
      { title: 'Distinction', authors: 'Pierre Bourdieu', year: 1979, journal: 'Minuit/Harvard UP', significance: 'Field-habitus-capital applied to taste' },
      { title: 'Discipline and Punish', authors: 'Michel Foucault', year: 1975, journal: 'Gallimard', significance: 'Power as productive, not merely repressive' },
      { title: 'The Constitution of Society', authors: 'Anthony Giddens', year: 1984, journal: 'Polity', significance: 'Structuration theory' },
      { title: 'The Transformation of the Public Sphere / Structural Transformation', authors: 'Jürgen Habermas', year: 1962, journal: 'Luchterhand', significance: 'Public sphere and communicative action foundations' },
    ],
    dataSources: [
      { name: 'Isidore/Persee/HAL', type: 'api', coverage: 'French SHS theory' },
      { name: 'Sociology provider', type: 'api', coverage: 'peer-reviewed theory' },
      { name: 'PhilPapers', type: 'api', coverage: 'philosophical theory' },
    ],
    methodology: {
      approach: 'Theory with empirical anchor — every conceptual move must do analytic work on the case',
      evidenceHierarchy: ['Peer-reviewed theory + empirical pairing', 'Canonical texts (read in context)', 'Applied theoretical studies', 'Pure commentary (flagged)'],
      uncertaintyApproach: 'Theory interprets, does not prove — report the framework\'s blind spots',
      minimumEvidence: 'Theoretical claims need empirical anchoring; empirical claims need theoretical framing',
    },
    qualityCriteria: {
      minSources: 5, minQuality: 65, requirePeerReview: false, maxSourceAge: 80,
      specialRequirements: ['Theory must do analytic work, not decorate', 'Must name the power form', 'Must genealogize naturalized categories'],
    },
    standingQuestions: [
      'Which theory is doing the work here — and what does it systematically miss?',
      'What form of power is operating — and who bears its cost?',
      'Where did this seemingly natural category come from?',
    ],
    knownBiases: [
      'Theory worship — canon cited as authority, not tool',
      'Jargon shielding — complexity as substitute for argument',
      'Presentism — theorists read as commenting on today',
      'Empirical thinness — theory without cases',
    ],
  },

  'philosophy-of-science': {
    domain: 'philosophy-of-science',
    researcherName: 'Dr. Theoria (Θεωρία)',
    keyConcepts: [
      { name: 'Underdetermination (Duhem-Quine)', definition: 'Data underdetermine theory — any result can be saved by adjusting auxiliaries; "the evidence proves X" always hides assumptions', importance: 'foundational', relatedConcepts: ['auxiliary hypotheses', 'holism', 'theory-ladenness'] },
      { name: 'Falsificationism and its Limits', definition: 'Popper — science advances by refutation, not confirmation; but real science does not abandon theories at the first anomaly (Lakatos)', importance: 'foundational', relatedConcepts: ['popper', 'demarcation', 'corroboration'] },
      { name: 'Paradigms and Revolutions', definition: 'Kuhn — normal science within paradigms, crisis, then revolution; competing paradigms are partially incommensurable', importance: 'foundational', relatedConcepts: ['normal science', 'incommensurability', 'scientific revolution'] },
      { name: 'Models as Instruments', definition: 'Models idealize, distort, and omit — they are tools for specific purposes, not mirrors of reality (Cartwright, Morgan-Morrison)', importance: 'advanced', relatedConcepts: ['idealization', 'abstraction', 'model-world relation'] },
      { name: 'Consensus Formation', definition: 'Scientific consensus can be genuine convergence or cascade/bandwagon — check how it formed (Oreskes, Beatty)', importance: 'advanced', relatedConcepts: ['epistemic communities', 'peer pressure', 'consensus conferences'] },
    ],
    frameworks: [
      { name: 'Auxiliary Assumption Audit', description: 'Which auxiliaries are doing the work in "the evidence shows X"?', whenToUse: 'Any evidential claim', steps: ['Core hypothesis?', 'Auxiliaries?', 'What breaks if an auxiliary fails?'] },
      { name: 'Model-Limitation Analysis', description: 'What does the model idealize away? What can it never show?', whenToUse: 'Model-based claims (climate, econ, epidemiology)', steps: ['Idealizations?', 'Exclusions?', 'Validation regime?', 'Out-of-scope claims?'] },
      { name: 'Consensus-Formation Review', description: 'How did the consensus form — convergence of independent lines or social cascade?', whenToUse: '"Scientists agree" claims', steps: ['Independent lines?', 'Dissent suppressed?', 'Career incentives?', 'Formation mechanism?'] },
    ],
    referencePapers: [
      { title: 'The Logic of Scientific Discovery', authors: 'Karl Popper', year: 1934, journal: 'Springer', significance: 'Falsificationism canon' },
      { title: 'The Structure of Scientific Revolutions', authors: 'Thomas Kuhn', year: 1962, journal: 'U Chicago Press', significance: 'Paradigms — the most-cited HPS work' },
      { title: 'Science and Social Values', authors: 'Helen Longino', year: 1990, journal: 'Princeton UP', significance: 'Social epistemology of objectivity' },
      { title: 'Merchants of Doubt', authors: 'Oreskes & Conway', year: 2010, journal: 'Bloomsbury', significance: 'Manufactured scientific controversy' },
    ],
    dataSources: [
      { name: 'PhilPapers', type: 'api', coverage: 'philosophy of science' },
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'peer-reviewed' },
      { name: 'Isidore/arXiv', type: 'api', coverage: 'European SHS + foundations' },
    ],
    methodology: {
      approach: 'Inference-structure discipline — every "evidence shows" claim gets its auxiliaries audited',
      evidenceHierarchy: ['Peer-reviewed HPS + primary science', 'Replication and metascience literature', 'Consensus-process documentation', 'Popular science (flagged)'],
      uncertaintyApproach: 'Epistemic status is part of the claim — report evidential strength explicitly',
      minimumEvidence: 'Consensus claims need the formation mechanism; model claims need limitation analysis',
    },
    qualityCriteria: {
      minSources: 5, minQuality: 65, requirePeerReview: true, maxSourceAge: 90,
      specialRequirements: ['Must name auxiliary assumptions', 'Must distinguish significance from evidential weight', 'Must check consensus formation'],
    },
    standingQuestions: [
      'Which auxiliary assumptions does this "evidence-based" claim rest on?',
      'What does the model idealize away — and is the claim still inside its scope?',
      'Is this consensus convergence or cascade?',
    ],
    knownBiases: [
      'Scientism — science as final arbiter beyond its competence',
      'Popperian naivety — theories are not discarded at first anomaly',
      'Consensus deference — agreement mistaken for convergence',
      'Methodological monism — one method for all questions',
    ],
  },

  'law-and-economics': {
    domain: 'law-and-economics',
    researcherName: 'Dr. Nomisma (Νόμισμα)',
    keyConcepts: [
      { name: 'Coase Theorem', definition: 'With zero transaction costs, allocation is efficient regardless of initial rights — but transaction costs are never zero, so institutions do the real work', importance: 'foundational', relatedConcepts: ['transaction costs', 'property rights', 'bargaining'] },
      { name: 'Efficient Breach and Liability Rules', definition: 'Calabresi-Melamed property vs liability rules; Posner — breach can be efficient when performance costs exceed gains; contested for ignoring distribution', importance: 'advanced', relatedConcepts: ['calabresi', 'contract remedies', 'incentives'] },
      { name: 'Legal Origins Theory', definition: 'La Porta et al. — common law vs civil law origins correlate with financial development; heavily critiqued for coding and mechanism', importance: 'advanced', relatedConcepts: ['legal families', 'financial development', 'comparative law'] },
      { name: 'Behavioral Law & Economics', definition: 'Jolls-Sunstein-Thaler — boundedly rational actors change the calculus of rules; debiasing through law', importance: 'advanced', relatedConcepts: ['nudge', 'bounded rationality', 'default rules'] },
      { name: 'Enforcement Gap', definition: 'Law on the books vs law in action — enforcement budget, capture, and capacity determine the real rule (Stigler, Ostrom)', importance: 'foundational', relatedConcepts: ['law in action', 'regulatory capture', 'compliance'] },
    ],
    frameworks: [
      { name: 'Incentive Analysis of Rules', description: 'Every rule prices behavior — map the incentive, intended and perverse', whenToUse: 'Any regulation or legal change', steps: ['Who faces the price?', 'Substitution effects?', 'Evasion paths?', 'Distributional incidence?'] },
      { name: 'Transaction-Cost Mapping', description: 'Who can bargain, who cannot — Coase assumes away what policy must solve', whenToUse: 'Property/liability and market-design claims', steps: ['Bargaining costs?', 'Asymmetric information?', 'Hold-out power?', 'Excluded parties?'] },
      { name: 'Enforcement Audit', description: 'Statute vs enforced reality — budget, capacity, capture', whenToUse: 'Assessing what a law will actually do', steps: ['Enforcer?', 'Budget?', 'Capture risk?', 'Compliance data?'] },
    ],
    referencePapers: [
      { title: 'The Problem of Social Cost', authors: 'Ronald Coase', year: 1960, journal: 'J Law & Economics', significance: 'Transaction costs — the field\'s founding paper' },
      { title: 'Economic Analysis of Law', authors: 'Richard Posner', year: 1973, journal: 'Little Brown', significance: 'The Chicago canon' },
      { title: 'Governing the Commons', authors: 'Elinor Ostrom', year: 1990, journal: 'Cambridge UP', significance: 'Institutional diversity beyond state/market — Nobel' },
      { title: 'One View of the Cathedral', authors: 'Calabresi & Melamed', year: 1972, journal: 'Harvard LR', significance: 'Property vs liability rules' },
    ],
    dataSources: [
      { name: 'NBER/RePEc', type: 'api', coverage: 'law-econ working papers' },
      { name: 'EUR-Lex', type: 'api', coverage: 'EU law' },
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'peer-reviewed' },
    ],
    methodology: {
      approach: 'Incentive-first — rules are prices; read what they price, not what they say',
      evidenceHierarchy: ['Peer-reviewed law-econ + empirical legal studies', 'Enforcement and compliance data', 'Case analysis with mechanism', 'Pure doctrinal argument (flagged)'],
      uncertaintyApproach: 'Efficiency claims carry distributional silence — report incidence separately',
      minimumEvidence: 'Regulatory claims need enforcement analysis; efficiency claims need distribution check',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: false, maxSourceAge: 50,
      specialRequirements: ['Must separate efficiency from distribution', 'Must audit enforcement capacity', 'Must map perverse incentives'],
    },
    standingQuestions: [
      'What behavior does this rule actually price — and who pays the transaction costs?',
      'Is the enforcement gap larger than the statutory change?',
      'Does the efficiency claim hide a distributional shift?',
    ],
    knownBiases: [
      'Efficiency fetishism — Kaldor-Hicks treated as normatively sufficient',
      'Chicago reductionism — non-market values discounted',
      'Power-blindness — bargaining power assumed equal',
      'Enforcement blindness — paper rules mistaken for real rules',
    ],
  },

  'intelligence-studies': {
    domain: 'intelligence-studies',
    researcherName: 'Dr. Phronesis (Φρόνησις)',
    keyConcepts: [
      { name: 'Analysis of Competing Hypotheses', definition: 'Heuer — evaluate evidence against ALL hypotheses, not the favored one; diagnosticity of evidence over quantity', importance: 'foundational', relatedConcepts: ['ach', 'diagnostic evidence', 'structured analytic techniques'] },
      { name: 'Intelligence Failure Typology', definition: 'Jervis/Betts — failures are usually analytic or policy-reception failures, not collection gaps; warning exists but is not heard', importance: 'foundational', relatedConcepts: ['warning-response gap', 'politicization', 'strategic surprise'] },
      { name: 'Strategic Surprise', definition: 'Wohlstetter on Pearl Harbor — signals were present but drowned in noise; the problem is signal-to-noise plus mindset', importance: 'foundational', relatedConcepts: ['signal vs noise', 'pearl harbor', 'estimative failure'] },
      { name: 'Politicization', definition: 'Intelligence bent to serve policy (Iraq WMD) — the gravest analytic sin; distinguish informing policy from servicing it', importance: 'foundational', relatedConcepts: ['cherry-picking', 'stovepiping', 'iraq wmd'] },
      { name: 'Declassification as Corrective', definition: 'Declassified records (CIA FOIA, NSA releases) systematically contradict memoirs and official narratives — privilege documents over recollection', importance: 'advanced', relatedConcepts: ['foia', 'official history', 'documentary record'] },
    ],
    frameworks: [
      { name: 'ACH Execution', description: 'List hypotheses, score evidence diagnosticity against each — the evidence matrix over narrative fit', whenToUse: 'Attribution, intent, and capability assessment', steps: ['All hypotheses listed?', 'Evidence diagnostic or consistent-with-everything?', 'Dissent preserved?'] },
      { name: 'Failure Forensics', description: 'Locate the failure — collection, analysis, dissemination, or reception?', whenToUse: 'Post-mortem on surprises and misses', steps: ['Was the signal collected?', 'Analyzed?', 'Disseminated?', 'Heard?', 'Acted on?'] },
      { name: 'Politicization Check', description: 'Is the assessment informing policy or servicing it?', whenToUse: 'Assessments that align suspiciously with policy preference', steps: ['Dissent channels open?', 'Alternative analyses suppressed?', 'Timeline vs policy decision?'] },
    ],
    referencePapers: [
      { title: 'Psychology of Intelligence Analysis', authors: 'Richards Heuer', year: 1999, journal: 'CIA Center for the Study of Intelligence', significance: 'The tradecraft canon — ACH and bias' },
      { title: 'Why Intelligence Fails', authors: 'Robert Jervis', year: 2010, journal: 'Cornell UP', significance: 'Failure typology — analysis over collection' },
      { title: 'Pearl Harbor: Warning and Decision', authors: 'Roberta Wohlstetter', year: 1962, journal: 'Stanford UP', significance: 'Signal-to-noise — the founding study' },
      { title: 'Analysis, War, and Decision', authors: 'Richard Betts', year: 1978, journal: 'World Politics', significance: 'The warning-response gap' },
    ],
    dataSources: [
      { name: 'CIA FOIA/ODNI/UK-JIC', type: 'api', coverage: 'declassified records + official assessments' },
      { name: 'NATO/SIPRI', type: 'api', coverage: 'alliance + security data' },
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'academic intelligence studies' },
    ],
    methodology: {
      approach: 'Structured tradecraft — ACH over narrative, documents over memoirs, receiver-audit over sender-blame',
      evidenceHierarchy: ['Declassified primary documents', 'Peer-reviewed intelligence studies', 'Official assessments (flagged for politicization check)', 'Memoirs and journalism (lowest — self-serving)'],
      uncertaintyApproach: 'Secret-domain evidence is systematically incomplete — report collection posture and absence-of-evidence limits',
      minimumEvidence: 'Attribution claims need an ACH table or equivalent; failure claims need the failure locus identified',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 70, requirePeerReview: false, maxSourceAge: 60,
      specialRequirements: ['Must run ACH or equivalent on attribution', 'Must check politicization', 'Must privilege declassified documents over memoirs'],
    },
    standingQuestions: [
      'Which hypothesis does the evidence actually discriminate — and which does it fit equally?',
      'Where in the chain (collect/analyze/disseminate/hear/act) did the failure occur?',
      'Is this assessment informing policy or servicing it?',
    ],
    knownBiases: [
      'Secrecy deference — classified sources assumed superior to open ones',
      'Mirror-imaging — adversary reasoned as ourselves',
      'Worst-case capture — low-probability high-impact treated as likely',
      'Politicization — assessment bent to policy preference',
    ],
  },

  'military-studies': {
    domain: 'military-studies',
    researcherName: 'Dr. Ares (Ἄρης)',
    keyConcepts: [
      { name: 'Clausewitzian Trinity', definition: 'War as interplay of passion (people), chance (army), reason (government) — friction and politics dominate any purely military reading', importance: 'foundational', relatedConcepts: ['friction', 'war as politics', 'center of gravity'] },
      { name: 'Deterrence Credibility', definition: 'Deterrence = capability × resolve × communication; a failure in any one collapses the whole (Schelling)', importance: 'foundational', relatedConcepts: ['compellence', 'escalation', 'signaling'] },
      { name: 'Escalation Dynamics', definition: 'Ladders run both ways — each rung needs an off-ramp; inadvertent escalation is the real risk, not deliberate war', importance: 'foundational', relatedConcepts: ['escalation dominance', 'off-ramps', 'inadvertent war'] },
      { name: 'Attrition & Logistics', definition: 'Amateurs talk tactics, professionals talk logistics — munitions depth, sustainment, and industrial base decide long wars', importance: 'foundational', relatedConcepts: ['defense-industrial base', 'munitions', 'sustainment'] },
      { name: 'RMA Skepticism', definition: 'Every "revolution in military affairs" claim must be tested against history — most predicted transformations underdelivered', importance: 'advanced', relatedConcepts: ['technology hype', 'drone warfare', 'precision strike'] },
    ],
    frameworks: [
      { name: 'Deterrence Credibility Audit', description: 'Score each leg: capability, resolve, communication', whenToUse: 'Any deterrence or red-line claim', steps: ['Capability real?', 'Resolve demonstrated?', 'Communication clear?'] },
      { name: 'Attrition Economics Check', description: 'Long wars are won by production, not battles — count munitions, industrial capacity, manpower pools', whenToUse: 'Protracted conflict analysis', steps: ['Munitions depth?', 'Industrial capacity?', 'Manpower?', 'Resupply lines?'] },
      { name: 'Escalation Map', description: 'Map rungs and off-ramps before predicting escalation', whenToUse: 'Crisis escalation scenarios', steps: ['Current rung?', 'Next rung cost?', 'Off-ramps exist?', 'Inadvertent path?'] },
    ],
    referencePapers: [
      { title: 'On War', authors: 'Carl von Clausewitz', year: 1832, journal: 'Dümmler', significance: 'War as politics — the field\'s foundation' },
      { title: 'Arms and Influence', authors: 'Thomas Schelling', year: 1966, journal: 'Yale UP', significance: 'Deterrence and coercion theory' },
      { title: 'Bombing to Win', authors: 'Robert Pape', year: 1996, journal: 'Cornell UP', significance: 'Airpower coercion — and its limits' },
      { title: 'The Revolution in Military Affairs debate', authors: 'various (Biddle, Freedman)', year: 2004, journal: 'International Security', significance: 'RMA skepticism canon' },
    ],
    dataSources: [
      { name: 'SIPRI', type: 'api', coverage: 'arms transfers, military expenditure' },
      { name: 'NATO/ODNI/UK-JIC', type: 'api', coverage: 'alliance + assessments' },
      { name: 'CIA FOIA', type: 'api', coverage: 'declassified history' },
    ],
    methodology: {
      approach: 'Material base first — capabilities and logistics before intentions and doctrine',
      evidenceHierarchy: ['Declassified/official capability data', 'Peer-reviewed security studies', 'Think-tank assessments (flagged for funding bias)', 'Media war reporting (lowest — fog)'],
      uncertaintyApproach: 'War is the domain of maximum uncertainty — report fog-of-war limits explicitly',
      minimumEvidence: 'Capability claims need material data; intention claims need doctrine + behavior convergence',
    },
    qualityCriteria: {
      minSources: 8, minQuality: 70, requirePeerReview: false, maxSourceAge: 30,
      specialRequirements: ['Must separate capability from intention', 'Must check attrition/logistics base', 'Must name escalation off-ramps'],
    },
    standingQuestions: [
      'Does the deterrence claim satisfy all three legs — capability, resolve, communication?',
      'What does the attrition math say that the battle narrative does not?',
      'Is this "revolution" claim surviving the historical RMA test?',
    ],
    knownBiases: [
      'Worst-case planning inflation — threats built for budget cycles',
      'Platform-count thinking — hardware tallies mistaken for power',
      'Mirror-imaging — adversary modeled as ourselves',
      'War-as-spectacle — visible combat over logistics and sustainment',
    ],
  },

  'futures-studies': {
    domain: 'futures-studies',
    researcherName: 'Dr. Mellon (Μέλλον)',
    keyConcepts: [
      { name: 'Scenario Planning', definition: 'Shell method — multiple plausible futures built on critical uncertainties; for decision robustness, not prediction', importance: 'foundational', relatedConcepts: ['critical uncertainties', 'predetermined elements', 'scenario logic'] },
      { name: 'Weak Signals & Wild Cards', definition: 'Early low-visibility indicators vs high-impact low-probability events — both get systematically underweighted', importance: 'foundational', relatedConcepts: ['horizon scanning', 'black swan', 'discontinuity'] },
      { name: 'Causal Layered Analysis', definition: 'Inayatullah — litany, systemic causes, worldview, myth/metaphor; depth of analysis determines depth of foresight', importance: 'advanced', relatedConcepts: ['cla', 'deep structure', 'narrative layers'] },
      { name: 'Futures Triangle', definition: 'Weight of the past, push of the present, pull of the future — map all three forces', importance: 'foundational', relatedConcepts: ['drivers', 'inertia', 'vision'] },
      { name: 'Forecasting Calibration', definition: 'Tetlock — forecasters can be measured; base rates + update discipline beat expertise without accountability', importance: 'foundational', relatedConcepts: ['brier score', 'superforecasting', 'track record'] },
    ],
    frameworks: [
      { name: 'Scenario Logic Audit', description: 'Are scenarios built on critical uncertainties (real axes) or just narrative variety?', whenToUse: 'Evaluating foresight products', steps: ['Axes are real uncertainties?', 'Scenarios distinguish decisions?', 'Indicators named?'] },
      { name: 'Weak-Signal Triage', description: 'Source quality × independence × specificity before a signal earns weight', whenToUse: 'Horizon scanning outputs', steps: ['Source credible?', 'Independent sources?', 'Falsifiable signal?'] },
      { name: 'Base-Rate Anchor', description: 'Start every forecast from the reference class frequency — then adjust', whenToUse: 'Any probability claim about the future', steps: ['Reference class?', 'Base rate?', 'Justified deviation?'] },
    ],
    referencePapers: [
      { title: 'The Art of the Long View', authors: 'Peter Schwartz', year: 1991, journal: 'Doubleday', significance: 'Scenario method canon' },
      { title: 'Superforecasting', authors: 'Tetlock & Gardner', year: 2015, journal: 'Crown', significance: 'Forecasting is measurable skill' },
      { title: 'Causal Layered Analysis Reader', authors: 'Sohail Inayatullah', year: 2004, journal: 'Tamkang UP', significance: 'Depth foresight method' },
      { title: 'Teaching about the Future (four futures)', authors: 'Jim Dator', year: 2009, journal: 'Palgrave', significance: 'Generic future archetypes' },
    ],
    dataSources: [
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'foresight journals' },
      { name: 'Overton/Mega-thinktanks', type: 'api', coverage: 'foresight reports' },
      { name: 'Isidore', type: 'api', coverage: 'European prospective' },
    ],
    methodology: {
      approach: 'Plausibility discipline — futures are decision tools, each needs drivers, indicators, and breaking conditions',
      evidenceHierarchy: ['Peer-reviewed foresight + evaluation studies', 'Forecasting track records', 'Institutional foresight (EEA, OECD)', 'Consulting trend decks (flagged)'],
      uncertaintyApproach: 'Futures carry structural uncertainty — probabilities are calibrated judgments, not measurements',
      minimumEvidence: 'Scenario claims need drivers + indicators; trend claims need breaking conditions',
    },
    qualityCriteria: {
      minSources: 5, minQuality: 60, requirePeerReview: false, maxSourceAge: 40,
      specialRequirements: ['Must distinguish exploratory from normative', 'Must name observable indicators per scenario', 'Must anchor probabilities in base rates'],
    },
    standingQuestions: [
      'What would falsify this scenario — and which indicators track it?',
      'Is this forecast calibrated by track record or by narrative appeal?',
      'Which weak signals are being dismissed without triage?',
    ],
    knownBiases: [
      'Linear extrapolation — tomorrow as today plus trend',
      'Trend worship — extrapolated curves mistaken for laws',
      'Wild-card neglect — low-probability high-impact systematically cut',
      'Present-order projection — current power structures assumed eternal',
    ],
  },

  'economic-sociology': {
    domain: 'economic-sociology',
    researcherName: 'Dr. Agora (Ἀγορά)',
    keyConcepts: [
      { name: 'Embeddedness', definition: 'Granovetter 1985 — economic action is embedded in social networks; both under- and over-socialized accounts fail', importance: 'foundational', relatedConcepts: ['networks', 'trust', 'social structure of markets'] },
      { name: 'Performativity', definition: 'Callon/MacKenzie — economics does not describe an economy, it performs one; models shape the markets they model (Black-Scholes)', importance: 'foundational', relatedConcepts: ['barnesian performativity', 'models as engines', 'counterperformativity'] },
      { name: 'Markets as Social Constructions', definition: 'Fligstein — markets are fields stabilized by incumbents, challengers, and shared conceptions of control', importance: 'foundational', relatedConcepts: ['market fields', 'conceptions of control', 'incumbency'] },
      { name: 'Moral Economy', definition: 'Thompson/Scott — economic arrangements carry moral norms; violations trigger resistance even when "efficient"', importance: 'advanced', relatedConcepts: ['fairness norms', 'subsistence ethics', 'legitimacy'] },
      { name: 'Commodification Limits', definition: 'Zelizer/Sandel — some exchanges corrupt what they trade; money transforms meaning', importance: 'advanced', relatedConcepts: ['contested commodities', 'sacred vs market', 'zelizer circuits'] },
    ],
    frameworks: [
      { name: 'Market Construction Map', description: 'Who built this market, with what rules, and whose networks stabilize it?', whenToUse: 'Any market-outcome claim', steps: ['Rules origin?', 'Stabilizing networks?', 'Excluded actors?'] },
      { name: 'Performativity Audit', description: 'Did the model/theory itself change the behavior it describes?', whenToUse: 'Financial models, ratings, benchmarks', steps: ['Model adoption scale?', 'Behavioral feedback?', 'Self-defeating loop?'] },
      { name: 'Trust-Network Check', description: 'What social relations carry the transactions that formal contracts cannot?', whenToUse: 'Assessing market functioning, especially in low-formality contexts', steps: ['Relational contracting?', 'Reputation mechanisms?', 'Formal-informal mix?'] },
    ],
    referencePapers: [
      { title: 'Economic Action and Social Structure: The Problem of Embeddedness', authors: 'Mark Granovetter', year: 1985, journal: 'AJS', significance: 'The founding paper — most cited in the field' },
      { title: 'The Great Transformation', authors: 'Karl Polanyi', year: 1944, journal: 'Farrar & Rinehart', significance: 'Market society as political construction' },
      { title: 'Do Economists Make Markets? (performativity)', authors: 'MacKenzie, Muniesa, Siu', year: 2007, journal: 'Princeton UP', significance: 'Performativity canon' },
      { title: 'The Social Meaning of Money', authors: 'Viviana Zelizer', year: 1994, journal: 'Basic Books', significance: 'Money is socially differentiated, not fungible' },
    ],
    dataSources: [
      { name: 'Sociology provider', type: 'api', coverage: 'peer-reviewed' },
      { name: 'OpenAlex/RePEc/NBER', type: 'api', coverage: 'socio-economics' },
      { name: 'Isidore', type: 'api', coverage: 'European economic sociology' },
    ],
    methodology: {
      approach: 'Social structure under the price surface — every market outcome has a network and a legitimacy story',
      evidenceHierarchy: ['Peer-reviewed economic sociology', 'Network/field empirical work', 'Historical-institutional case studies', 'Economics papers without social context (flagged)'],
      uncertaintyApproach: 'Social mechanisms are hard to isolate — report rival structural vs efficiency explanations',
      minimumEvidence: 'Market claims need the construction story; efficiency claims need the embeddedness check',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 40,
      specialRequirements: ['Must identify the market construction', 'Must check performativity loops', 'Must audit commodification limits'],
    },
    standingQuestions: [
      'Who constructed this market — and whose networks keep it stable?',
      'Is the economic model describing the economy or performing it?',
      'What moral norms does this "efficient" arrangement violate?',
    ],
    knownBiases: [
      'Market naturalism — markets read as spontaneous, not built',
      'Network romanticism — social relations assumed benign',
      'Performativity overreach — not every model performs',
      'Anti-market reflex — efficiency gains dismissed by reflex',
    ],
  },

  'historical-sociology': {
    domain: 'historical-sociology',
    researcherName: 'Dr. Chronos (Χρόνος)',
    keyConcepts: [
      { name: 'War Made the State', definition: 'Tilly — extraction + coercion + capital accumulation produced national states; states are protection rackets that won', importance: 'foundational', relatedConcepts: ['coercion-capital', 'state formation', 'bellicist theory'] },
      { name: 'Social Revolutions', definition: 'Skocpol — revolutions need state breakdown + international pressure + peasant autonomy; leaders ride structures they do not create', importance: 'foundational', relatedConcepts: ['structural conditions', 'state breakdown', 'class structure'] },
      { name: 'World-Systems', definition: 'Wallerstein — core/semiperiphery/periphery; national trajectories are positions in a system, not isolated stories', importance: 'foundational', relatedConcepts: ['core-periphery', 'unequal exchange', 'hegemonic cycles'] },
      { name: 'Critical Junctures', definition: 'Moments of loosened structure where agency matters disproportionately — then institutions lock back in', importance: 'advanced', relatedConcepts: ['path dependence', 'contingency', 'lock-in'] },
      { name: 'Contentious Politics', definition: 'Tilly-Tarrow-McAdam — episodes of claim-making; repertoires, opportunity structures, brokerage', importance: 'advanced', relatedConcepts: ['social movements', 'repertoires', 'political opportunity'] },
    ],
    frameworks: [
      { name: 'Structural Conditions Check', description: 'For revolution/transformation claims — state breakdown, international pressure, class structure first', whenToUse: 'Regime change and revolution analysis', steps: ['State capacity failing?', 'International pressure?', 'Mass mobilization capacity?', 'Elite splits?'] },
      { name: 'Critical-Juncture Test', description: 'Is this a real juncture (structure loosened) or ordinary variation?', whenToUse: 'Assessing moments of potential transformation', steps: ['Constraints loosened?', 'Agency variance?', 'Lock-in mechanism after?'] },
      { name: 'Scope-Condition Audit', description: 'Do categories and mechanisms travel across the cases compared?', whenToUse: 'Comparative-historical claims', steps: ['Categories commensurable?', 'Context differences?', 'Mechanism portable?'] },
    ],
    referencePapers: [
      { title: 'States and Social Revolutions', authors: 'Theda Skocpol', year: 1979, journal: 'Cambridge UP', significance: 'Structural revolution theory' },
      { title: 'Coercion, Capital, and European States', authors: 'Charles Tilly', year: 1990, journal: 'Blackwell', significance: 'War-making as state-making' },
      { title: 'The Modern World-System I', authors: 'Immanuel Wallerstein', year: 1974, journal: 'Academic Press', significance: 'Core-periphery canon' },
      { title: 'Social Origins of Dictatorship and Democracy', authors: 'Barrington Moore', year: 1966, journal: 'Beacon', significance: 'Routes to modernity — class coalitions' },
    ],
    dataSources: [
      { name: 'Sociology/History providers', type: 'api', coverage: 'peer-reviewed' },
      { name: 'Isidore/Persee', type: 'api', coverage: 'European historical sociology' },
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'broad literature' },
    ],
    methodology: {
      approach: 'Structure over event — the deep conditions explain the dramatic episode, not vice versa',
      evidenceHierarchy: ['Peer-reviewed comparative-historical work', 'Archival/documentary primary sources', 'Synthetic macro-histories', 'Journalistic narratives (flagged)'],
      uncertaintyApproach: 'Macro-historical claims carry selection and interpretation uncertainty — report case-selection logic',
      minimumEvidence: 'Structural claims need comparative cases; juncture claims need counterfactual discipline',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 60,
      specialRequirements: ['Must check structural conditions before agency', 'Must audit case selection', 'Must specify scope conditions'],
    },
    standingQuestions: [
      'What structural conditions make this outcome possible — and where else do they hold?',
      'Is this a critical juncture or normal politics with dramatic framing?',
      'Which non-Western trajectories does this account erase?',
    ],
    knownBiases: [
      'Outcome bias — cases selected on what happened',
      'Presentist projection — modern categories imposed on the past',
      'Great-event focus — drama over structure',
      'Western-trajectory universalism — European path as the path',
    ],
  },

  'environmental-economics': {
    domain: 'environmental-economics',
    researcherName: 'Dr. Oikos (Οἶκος)',
    keyConcepts: [
      { name: 'Externality Pricing', definition: 'Pigou — internalize external costs via tax; carbon pricing works when coverage is broad, level material, leakage controlled', importance: 'foundational', relatedConcepts: ['carbon tax', 'pigouvian', 'internalization'] },
      { name: 'Stern-Nordhaus Discount Debate', definition: 'The discount rate decides whether climate action is urgent (Stern ~1.4%) or gradual (Nordhaus ~4-5%) — an ethical parameter disguised as technical', importance: 'foundational', relatedConcepts: ['discount rate', 'intergenerational ethics', 'social cost of carbon'] },
      { name: 'Natural Capital & Valuation', definition: 'Ecosystem services priced to make nature visible to policy — powerful tool, contested commodification', importance: 'advanced', relatedConcepts: ['ecosystem services', 'natural capital accounts', 'teeb'] },
      { name: 'Environmental Kuznets Curve', definition: 'Claimed inverted-U of pollution vs income — empirically fragile, especially for carbon; do not assume growth cures pollution', importance: 'foundational', relatedConcepts: ['decoupling', 'ekc critique', 'green growth'] },
      { name: 'Commons Governance', definition: 'Ostrom — commons are governed successfully by communities under design principles; neither pure state nor pure market', importance: 'foundational', relatedConcepts: ['polycentric governance', 'design principles', 'commons'] },
    ],
    frameworks: [
      { name: 'Carbon Price Audit', description: 'Coverage, level, leakage — the three legs of pricing effectiveness', whenToUse: 'Carbon pricing/tax claims', steps: ['Coverage share?', 'Price level vs needed?', 'Leakage handled?', 'Revenue use?'] },
      { name: 'Discount Sensitivity', description: 'Run the claim under both Stern and Nordhaus rates — does the conclusion flip?', whenToUse: 'Long-horizon climate cost-benefit', steps: ['Rate used?', 'Ethical stance stated?', 'Sensitivity?', 'Conclusion robust?'] },
      { name: 'Incidence Check', description: 'Who pays — regressivity of environmental policy decides political survival', whenToUse: 'Green transition policy assessment', steps: ['Income incidence?', 'Region incidence?', 'Compensation design?'] },
    ],
    referencePapers: [
      { title: 'Stern Review on the Economics of Climate Change', authors: 'Nicholas Stern', year: 2006, journal: 'HM Treasury', significance: 'Low-discount urgency canon' },
      { title: 'The Climate Casino / DICE', authors: 'William Nordhaus', year: 2013, journal: 'Yale UP', significance: 'IAM-based gradualism — the counterposition' },
      { title: 'The Economics of Welfare (externalities)', authors: 'Arthur Pigou', year: 1920, journal: 'Macmillan', significance: 'Externality pricing origin' },
      { title: 'Governing the Commons', authors: 'Elinor Ostrom', year: 1990, journal: 'Cambridge UP', significance: 'Polycentric commons governance' },
    ],
    dataSources: [
      { name: 'RePEc/NBER/OECD', type: 'api', coverage: 'peer-reviewed + policy' },
      { name: 'EEA/WorldBank', type: 'api', coverage: 'environmental data' },
      { name: 'OpenAlex', type: 'api', coverage: 'broad literature' },
    ],
    methodology: {
      approach: 'Incidence and parameters first — distribution and discount rate decide everything downstream',
      evidenceHierarchy: ['Peer-reviewed environmental economics', 'IAM outputs with parameter disclosure', 'Policy evaluations with counterfactual', 'Advocacy cost estimates (flagged)'],
      uncertaintyApproach: 'Climate damages carry deep uncertainty — report parameter sensitivity and tail risks',
      minimumEvidence: 'Pricing claims need coverage+level+leakage; valuation claims need exclusions disclosed',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 25,
      specialRequirements: ['Must state the discount rate stance', 'Must check distributional incidence', 'Must not assert EKC decoupling without data'],
    },
    standingQuestions: [
      'Which discount-rate stance does this conclusion secretly depend on?',
      'Who pays — and does the compensation design survive politics?',
      'Is decoupling claimed on data or assumed from the Kuznets curve?',
    ],
    knownBiases: [
      'Pricing reductionism — the carbon price as sufficient condition',
      'Growth-compatibility assumption — degrowth options unexamined',
      'Valuation overreach — priced nature mistaken for nature',
      'Northern policy templates — OECD instruments exported without fit',
    ],
  },

  'health-economics': {
    domain: 'health-economics',
    researcherName: 'Dr. Therapeia (Θεραπεία)',
    keyConcepts: [
      { name: 'QALY & Cost-Effectiveness', definition: 'Quality-adjusted life years organize health spending decisions — ethically loaded: age, disability, and equity weights are contested', importance: 'foundational', relatedConcepts: ['qaly', 'cost-effectiveness threshold', 'nice'] },
      { name: 'Health System Typology', definition: 'Bismarck (insurance), Beveridge (national service), NHI hybrids — financing structure predicts outcomes better than spending level', importance: 'foundational', relatedConcepts: ['bismarck', 'beveridge', 'universal coverage'] },
      { name: 'Pharma Pricing-Innovation Tradeoff', definition: 'Patents and prices fund R&D — but the innovation counterfactual is contested (how much R&D is publicly seeded)', importance: 'foundational', relatedConcepts: ['drug pricing', 'patents', 'innovation incentive'] },
      { name: 'Moral Hazard vs Access', definition: 'Insurance inflates use (moral hazard) but cost-sharing deters necessary care too — the tradeoff is real both ways', importance: 'advanced', relatedConcepts: ['cost-sharing', 'rand experiment', 'access'] },
      { name: 'Social Determinants', definition: 'Health outcomes track income, education, environment more than medical spending — healthcare is the smaller determinant', importance: 'foundational', relatedConcepts: ['sdoh', 'marmot', 'health gradient'] },
    ],
    frameworks: [
      { name: 'QALY Ethics Audit', description: 'Which equity weights and thresholds does the cost-effectiveness claim encode?', whenToUse: 'Cost-effectiveness and coverage decisions', steps: ['Threshold?', 'Age/disability weights?', 'Equity exclusions?', 'Perspective (payer/societal)?'] },
      { name: 'System-Design Comparison', description: 'Compare financing structure, not spending level — Bismarck vs Beveridge vs market', whenToUse: 'Health reform assessment', steps: ['Financing mix?', 'Access rules?', 'Cost control mechanism?', 'Outcome metrics?'] },
      { name: 'Innovation Counterfactual', description: 'What would R&D look like at lower prices — and how much is publicly funded anyway?', whenToUse: 'Pharma pricing debates', steps: ['R&D cost claims verified?', 'Public funding share?', 'Innovation elasticity evidence?'] },
    ],
    referencePapers: [
      { title: 'Uncertainty and the Welfare Economics of Medical Care', authors: 'Kenneth Arrow', year: 1963, journal: 'AER', significance: 'Founding paper — health markets are special' },
      { title: 'The Demand for Health (Grossman model)', authors: 'Michael Grossman', year: 1972, journal: 'JPE', significance: 'Health as human capital' },
      { title: 'The RAND Health Insurance Experiment', authors: 'Manning et al.', year: 1987, journal: 'AER', significance: 'Cost-sharing reduces use — necessary and unnecessary alike' },
      { title: 'Pricing Lives / cost-effectiveness debates', authors: 'various (Neumann, Weinstein)', year: 2014, journal: 'JHE', significance: 'QALY methods and ethics' },
    ],
    dataSources: [
      { name: 'PubMed/EuropePMC/NIH', type: 'api', coverage: 'health economics literature' },
      { name: 'WHO-GHO/OECD', type: 'api', coverage: 'health system data' },
      { name: 'NBER/RePEc', type: 'api', coverage: 'working papers' },
    ],
    methodology: {
      approach: 'System structure over spending level — financing design determines who gets what at what price',
      evidenceHierarchy: ['Peer-reviewed health economics + natural experiments', 'OECD/WHO comparative data', 'HTA reports (NICE etc.)', 'Industry-funded studies (flagged)'],
      uncertaintyApproach: 'Health outcomes are multi-determined — separate medical-care effects from social determinants',
      minimumEvidence: 'System claims need financing-structure comparison; pricing claims need the innovation counterfactual',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 20,
      specialRequirements: ['Must state the QALY ethics stance', 'Must compare financing structure not just spend', 'Must flag industry funding'],
    },
    standingQuestions: [
      'Whose life-years does this cost-effectiveness ratio devalue?',
      'Is this a spending problem or a financing-structure problem?',
      'How much of this drug\'s R&D was publicly seeded?',
    ],
    knownBiases: [
      'Cost-containment tunnel vision — savings without outcome accounting',
      'QALY fetishism — the metric mistaken for the value',
      'Pharma capture — industry framing of the innovation tradeoff',
      'US-centrism — the outlier system treated as the model',
    ],
  },

  'legal-theory': {
    domain: 'legal-theory',
    researcherName: 'Dr. Themis (Θέμις)',
    keyConcepts: [
      { name: 'Positivism vs Natural Law', definition: 'Hart/Kelsen — law as social fact (rules of recognition) vs Fuller/Finnis — law tied to moral minimums; the frame decides what counts as law at all', importance: 'foundational', relatedConcepts: ['rule of recognition', 'internal morality of law', 'validity'] },
      { name: 'Legal Realism', definition: 'Holmes/Llewellyn — law is what courts do, not what texts say; doctrine underdetermines outcomes', importance: 'foundational', relatedConcepts: ['judicial behavior', 'indeterminacy', 'pragmatism'] },
      { name: 'Interpretivism', definition: 'Dworkin — law includes principles; judges fit AND justify the practice, integrity as constraint', importance: 'advanced', relatedConcepts: ['law as integrity', 'principles vs rules', 'right answer thesis'] },
      { name: 'Critical Legal Studies', definition: 'Law is politics by other means — doctrine masks contestable choices; indeterminacy thesis radicalized', importance: 'advanced', relatedConcepts: ['cls', 'indeterminacy', 'legal consciousness'] },
      { name: 'Rule of Law: Thin vs Thick', definition: 'Thin = formal legality (prospective, general, clear); thick adds rights and justice — claims must specify which', importance: 'foundational', relatedConcepts: ['formal legality', 'substantive rule of law', 'raz vs fuller'] },
    ],
    frameworks: [
      { name: 'Validity-Source Analysis', description: 'What makes this norm law — pedigree, morality, or practice? The theory in play decides', whenToUse: 'Disputed legal validity or retroactive rules', steps: ['Which theory?', 'Validity criteria?', 'Moral minimum engaged?'] },
      { name: 'Thin/Thick Rule-of-Law Check', description: 'Is the claim about formal legality or substantive justice — they diverge', whenToUse: 'Rule-of-law erosion claims', steps: ['Thin criteria met?', 'Thick criteria claimed?', 'Which is eroding?'] },
      { name: 'Doctrine-Practice Gap Audit', description: 'What courts do vs what doctrine says — realism check', whenToUse: 'Any legal-system assessment', steps: ['Doctrinal claim?', 'Actual adjudication pattern?', 'Gap systematic?'] },
    ],
    referencePapers: [
      { title: 'The Concept of Law', authors: 'H.L.A. Hart', year: 1961, journal: 'Oxford UP', significance: 'Positivism canon — rules of recognition' },
      { title: 'Law\'s Empire', authors: 'Ronald Dworkin', year: 1986, journal: 'Harvard UP', significance: 'Interpretivism — law as integrity' },
      { title: 'The Morality of Law', authors: 'Lon Fuller', year: 1964, journal: 'Yale UP', significance: 'Internal morality — eight desiderata' },
      { title: 'The Path of the Law', authors: 'O.W. Holmes', year: 1897, journal: 'Harvard LR', significance: 'Legal realism founding text' },
    ],
    dataSources: [
      { name: 'PhilPapers/Isidore', type: 'api', coverage: 'jurisprudence' },
      { name: 'EUR-Lex', type: 'api', coverage: 'EU law in action' },
      { name: 'OpenAlex/Crossref', type: 'api', coverage: 'peer-reviewed' },
    ],
    methodology: {
      approach: 'Name the theory — every legal-system claim embeds a jurisprudential position',
      evidenceHierarchy: ['Peer-reviewed jurisprudence + case analysis', 'Judicial decisions and doctrine', 'Comparative legal data', 'Legal commentary (flagged for position)'],
      uncertaintyApproach: 'Interpretive claims are contestable by design — report the rival reading',
      minimumEvidence: 'Rule-of-law claims need thin/thick specification; doctrine claims need practice check',
    },
    qualityCriteria: {
      minSources: 5, minQuality: 65, requirePeerReview: false, maxSourceAge: 100,
      specialRequirements: ['Must name the jurisprudential frame', 'Must separate doctrine from practice', 'Must specify thin vs thick rule of law'],
    },
    standingQuestions: [
      'Which theory of law makes this claim true — and would rivals deny it?',
      'Is the erosion formal (thin) or substantive (thick) — or both?',
      'Where does judicial practice diverge from doctrine here?',
    ],
    knownBiases: [
      'Doctrine fetishism — the text as the whole of law',
      'Western-canon centrism — one jurisprudential tradition as universal',
      'Formalism — rules read as self-applying',
      'Naturalizing the present — current arrangements as necessary',
    ],
  },

  'postcolonial-studies': {
    domain: 'postcolonial-studies',
    researcherName: 'Dr. Eleutheria (Ἐλευθερία)',
    keyConcepts: [
      { name: 'Orientalism', definition: 'Said — the "Orient" is a Western construction serving power; the Other as object of knowledge, never author of it', importance: 'foundational', relatedConcepts: ['representation', 'othering', 'discourse'] },
      { name: 'Coloniality of Power', definition: 'Quijano — colonialism ended but coloniality persists: racial hierarchy, labor control, epistemic authority outlive empire', importance: 'foundational', relatedConcepts: ['coloniality', 'modernity/coloniality', 'mignolo'] },
      { name: 'Subaltern Studies', definition: 'Guha, Spivak — history written by elites; the subaltern\'s own voice is systematically unreadable in the archive', importance: 'foundational', relatedConcepts: ['spivak', 'archive', 'voice'] },
      { name: 'Decoloniality', definition: 'Mignolo — delink from colonial epistemology; "epistemic disobedience" as method', importance: 'advanced', relatedConcepts: ['epistemic justice', 'delinking', 'pluriversality'] },
      { name: 'Hybridity', definition: 'Bhabha — colonial encounter produces hybrid forms, not copies; mimicry destabilizes the colonizer\'s authority', importance: 'advanced', relatedConcepts: ['mimicry', 'third space', 'ambivalence'] },
    ],
    frameworks: [
      { name: 'Representation Audit', description: 'Who speaks, who is spoken for, who is absent — and by what authority?', whenToUse: 'Any claim about the global South', steps: ['Author position?', 'Subaltern voice present?', 'Framing genealogy?'] },
      { name: 'Coloniality Mapping', description: 'Which colonial structures persist post-independence — racial labor, epistemic hierarchy, extractive relations?', whenToUse: 'Assessing postcolonial states and relations', steps: ['Formal empire gone?', 'Hierarchy persists?', 'Epistemic authority location?'] },
      { name: 'Category Genealogy', description: 'Where did "development", "modernity", "failed state" come from — whom do they serve?', whenToUse: 'Any naturalized global category', steps: ['Origin?', 'Function?', 'Alternative framings?'] },
    ],
    referencePapers: [
      { title: 'Orientalism', authors: 'Edward Said', year: 1978, journal: 'Pantheon', significance: 'The founding work' },
      { title: 'The Wretched of the Earth', authors: 'Frantz Fanon', year: 1961, journal: 'Maspéro', significance: 'Decolonization psychology and violence' },
      { title: 'Can the Subaltern Speak?', authors: 'Gayatri Spivak', year: 1988, journal: 'Marxism and the Interpretation of Culture', significance: 'Representation limits' },
      { title: 'Coloniality of Power, Eurocentrism, and Latin America', authors: 'Aníbal Quijano', year: 2000, journal: 'Nepantla', significance: 'Coloniality framework' },
    ],
    dataSources: [
      { name: 'Isidore/Persee', type: 'api', coverage: 'French SHS postcolonial' },
      { name: 'AJOL/Dialnet', type: 'api', coverage: 'Southern scholarship' },
      { name: 'OpenAlex/Sociology', type: 'api', coverage: 'peer-reviewed' },
    ],
    methodology: {
      approach: 'Position first — every account of the South is written from somewhere; locate the enunciation',
      evidenceHierarchy: ['Southern scholarship and primary voices', 'Peer-reviewed postcolonial work', 'Northern scholarship on the South (flag position)', 'Policy documents (audit categories)'],
      uncertaintyApproach: 'Coloniality claims are interpretive — pair with material evidence where available',
      minimumEvidence: 'Representation claims need the enunciation audit; category claims need the genealogy',
    },
    qualityCriteria: {
      minSources: 5, minQuality: 60, requirePeerReview: false, maxSourceAge: 70,
      specialRequirements: ['Must audit representation position', 'Must distinguish coloniality from colonialism', 'Must include Southern-authored sources'],
    },
    standingQuestions: [
      'Whose voice is missing from this account of the South?',
      'Which persisting colonial structure does "post"colonial language obscure?',
      'Where did this category come from — and whom does it serve?',
    ],
    knownBiases: [
      'Over-extension — every failure attributed to coloniality',
      'Romanticizing the subaltern — resistance assumed pure',
      'Text-centrism — discourse over material relations',
      'Western auto-critique as new centrism — self-flagellation as authority',
    ],
  },

  'communication-studies': {
    domain: 'communication-studies',
    researcherName: 'Dr. Rhema (Ῥῆμα)',
    keyConcepts: [
      { name: 'Propaganda Model', definition: 'Herman & Chomsky — five filters (ownership, advertising, sourcing, flak, ideology) shape news without conspiracy; structural, not intentional', importance: 'foundational', relatedConcepts: ['manufacturing consent', 'filters', 'structural bias'] },
      { name: 'Agenda-Setting & Framing', definition: 'Media tells us what to think about (agenda) and how to think about it (framing) — real but bounded effects', importance: 'foundational', relatedConcepts: ['agenda-setting', 'framing', 'priming'] },
      { name: 'Public Sphere', definition: 'Habermas — democratic legitimacy needs a space of rational-critical deliberation; platform fragmentation erodes it', importance: 'foundational', relatedConcepts: ['deliberation', 'structural transformation', 'echo chambers'] },
      { name: 'Medium Theory', definition: 'McLuhan — the medium restructures perception regardless of content; platform affordances ARE the message', importance: 'advanced', relatedConcepts: ['affordances', 'medium is the message', 'platformization'] },
      { name: 'Misinformation Ecology', definition: 'Misinformation is real but its prevalence and effect are often exaggerated — base rates and demand-side factors matter', importance: 'advanced', relatedConcepts: ['disinformation', 'infodemic', 'correction effects'] },
    ],
    frameworks: [
      { name: 'Propaganda-Model Test', description: 'Run the five filters on the coverage claim — ownership, advertising, sourcing, flak, ideology', whenToUse: 'Media bias/systematic coverage claims', steps: ['Ownership structure?', 'Ad pressure?', 'Sourcing dependency?', 'Flak visible?'] },
      { name: 'Framing Analysis', description: 'Which frame is doing the work — and what does it exclude?', whenToUse: 'Any media narrative claim', steps: ['Dominant frame?', 'Excluded aspects?', 'Counter-frames?'] },
      { name: 'Base-Rate Check on Misinformation', description: 'How prevalent is it actually — exposure and effect vs moral panic', whenToUse: 'Misinformation/disinformation claims', steps: ['Exposure data?', 'Behavioral effect size?', 'Demand-side drivers?'] },
    ],
    referencePapers: [
      { title: 'Manufacturing Consent', authors: 'Herman & Chomsky', year: 1988, journal: 'Pantheon', significance: 'Propaganda model canon' },
      { title: 'Understanding Media', authors: 'Marshall McLuhan', year: 1964, journal: 'McGraw-Hill', significance: 'Medium theory' },
      { title: 'The Structural Transformation of the Public Sphere', authors: 'Jürgen Habermas', year: 1962, journal: 'Luchterhand', significance: 'Public sphere canon' },
      { title: 'Encoding/Decoding', authors: 'Stuart Hall', year: 1973, journal: 'CCCS', significance: 'Audiences decode actively — dominant/negotiated/oppositional' },
    ],
    dataSources: [
      { name: 'OpenAlex/Sociology/Isidore', type: 'api', coverage: 'peer-reviewed' },
      { name: 'GDELT', type: 'api', coverage: 'global media flows' },
      { name: 'CORE', type: 'api', coverage: 'open access' },
    ],
    methodology: {
      approach: 'Structure before content — media systems shape what can be said before anyone says it',
      evidenceHierarchy: ['Peer-reviewed communication research', 'Content/frame analyses with method disclosed', 'Platform transparency data', 'Journalistic accounts (flagged)'],
      uncertaintyApproach: 'Media effects are conditional and small-to-moderate — report effect sizes, not just demonstrations',
      minimumEvidence: 'Bias claims need structural analysis; effect claims need measured effect sizes',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: false, maxSourceAge: 35,
      specialRequirements: ['Must run the five-filter structural check', 'Must report effect sizes for media-effect claims', 'Must check misinformation base rates'],
    },
    standingQuestions: [
      'Which of the five filters is doing the work in this coverage pattern?',
      'Is the public-sphere claim about structure or just content?',
      'Does the misinformation panic survive a base-rate check?',
    ],
    knownBiases: [
      'Media-panic cycles — every new technology declared apocalyptic',
      'Platform determinism — affordances mistaken for destiny',
      'Effects overestimation — demonstrations without effect sizes',
      'Western media-centrism — non-Western publics as blank canvas',
    ],
  },

  'public-finance': {
    domain: 'public-finance',
    researcherName: 'Dr. Tamias (Ταμίας)',
    keyConcepts: [
      { name: 'Tax Incidence', definition: 'Statutory payer ≠ economic bearer — elasticities decide who really pays (corporate tax partly on workers, VAT on consumers)', importance: 'foundational', relatedConcepts: ['incidence', 'elasticity', 'shifting'] },
      { name: 'Debt Dynamics', definition: 'r vs g plus primary balance — debt sustainability is arithmetic + confidence, not a fixed threshold (Reinhart-Rogoff lesson)', importance: 'foundational', relatedConcepts: ['r<g', 'primary balance', 'debt spiral'] },
      { name: 'Optimal Taxation', definition: 'Mirrlees — efficiency-equity tradeoff via elasticities; top rates can be high if avoidance is controlled (Saez)', importance: 'advanced', relatedConcepts: ['mirrlees', 'laffer debates', 'marginal rates'] },
      { name: 'Fiscal Federalism', definition: 'Oates — decentralize where preferences differ, centralize where externalities spill; misassignment breeds accountability failure', importance: 'advanced', relatedConcepts: ['subsidiarity', 'tax assignment', 'equalization'] },
      { name: 'Fiscal Rules & Gaming', definition: 'Deficit/debt rules discipline but invite creativity — off-balance entities, golden-rule carveouts, optimistic forecasts', importance: 'foundational', relatedConcepts: ['stability pact', 'creative accounting', 'fiscal councils'] },
    ],
    frameworks: [
      { name: 'Incidence Analysis', description: 'Who bears the tax economically — trace the elasticities, not the statute', whenToUse: 'Any tax policy claim', steps: ['Statutory payer?', 'Elasticity direction?', 'Real bearer?', 'Distribution?'] },
      { name: 'Debt Dynamics Decomposition', description: 'Split the debt path — r, g, primary balance, stock-flow adjustments', whenToUse: 'Debt sustainability claims', steps: ['r vs g?', 'Primary balance path?', 'Confidence/sudden stop risk?', 'Denominator effects?'] },
      { name: 'Fiscal-Rule Audit', description: 'Does the rule bind behavior or just the accounting?', whenToUse: 'Fiscal framework assessment', steps: ['Off-balance channels?', 'Forecast bias?', 'Enforcement?', 'Escape clauses?'] },
    ],
    referencePapers: [
      { title: 'The Theory of Public Finance', authors: 'Richard Musgrave', year: 1959, journal: 'McGraw-Hill', significance: 'The field\'s founding treatise' },
      { title: 'An Exploration in the Theory of Optimum Income Taxation', authors: 'James Mirrlees', year: 1971, journal: 'RES', significance: 'Optimal tax — Nobel work' },
      { title: 'Fiscal Federalism', authors: 'Wallace Oates', year: 1972, journal: 'Harcourt', significance: 'Decentralization theorem' },
      { title: 'Optimal Labor Income Taxation (review)', authors: 'Piketty & Saez', year: 2013, journal: 'Handbook of Public Economics', significance: 'Modern optimal-tax synthesis' },
    ],
    dataSources: [
      { name: 'NBER/RePEc', type: 'api', coverage: 'working papers' },
      { name: 'OECD/IMF/WorldBank', type: 'api', coverage: 'fiscal data' },
      { name: 'INSEE/Eurostat', type: 'api', coverage: 'European fiscal data' },
    ],
    methodology: {
      approach: 'Incidence before rhetoric — every fiscal claim gets a who-really-pays check',
      evidenceHierarchy: ['Peer-reviewed public economics', 'OECD/IMF fiscal data', 'Administrative tax data studies', 'Think-tank fiscal advocacy (flagged)'],
      uncertaintyApproach: 'Fiscal multipliers and elasticities are contested — report the range, not the point',
      minimumEvidence: 'Tax claims need incidence; debt claims need dynamics decomposition',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: true, maxSourceAge: 30,
      specialRequirements: ['Must compute real incidence', 'Must decompose debt dynamics (r,g,balance)', 'Must flag static-scoring limits'],
    },
    standingQuestions: [
      'Who really bears this tax — and what do the elasticities say?',
      'Is the debt path arithmetically sustainable at plausible r and g?',
      'Which fiscal rule is being gamed through which channel?',
    ],
    knownBiases: [
      'Austerity bias — consolidation treated as virtue regardless of context',
      'Static scoring — behavioral response ignored in revenue estimates',
      'Tax-competition race logic — capital mobility invoked to preempt debate',
      'Short-termism — this year\'s deficit over intergenerational incidence',
    ],
  },

  'political-anthropology': {
    domain: 'political-anthropology',
    researcherName: 'Dr. Ethnos (Ἔθνος)',
    keyConcepts: [
      { name: 'Seeing Like a State', definition: 'Scott — states render societies legible to control them; simplification destroys local knowledge (mētis) and produces disasters when pushed hard', importance: 'foundational', relatedConcepts: ['legibility', 'high modernism', 'metis'] },
      { name: 'Societies Against the State', definition: 'Clastres — many societies have mechanisms to PREVENT state formation; statelessness is often a political achievement, not a failure', importance: 'foundational', relatedConcepts: ['statelessness', 'power without coercion', 'primitive societies'] },
      { name: 'Zomia & Escape', definition: 'Scott — highland populations chose statelessness; the "uncivilized" fringe is often a refuge from states, not a remnant', importance: 'advanced', relatedConcepts: ['zomia', 'escape agriculture', 'state evasion'] },
      { name: 'Everyday Resistance', definition: 'Scott — foot-dragging, evasion, false compliance, pilfering are politics for the powerless; rebellion is the exception, resistance the norm', importance: 'foundational', relatedConcepts: ['weapons of the weak', 'hidden transcripts', 'infrapolitics'] },
      { name: 'Debt as Moral Relation', definition: 'Graeber — debt precedes money; obligation is the oldest social technology and the language of violence', importance: 'advanced', relatedConcepts: ['debt history', 'obligation', 'moral economy'] },
    ],
    frameworks: [
      { name: 'Legibility Audit', description: 'What simplification does the state impose — and what local knowledge does it destroy?', whenToUse: 'State projects, censuses, land titling, smart cities', steps: ['What is simplified?', 'Whose knowledge erased?', 'Failure mode?'] },
      { name: 'Non-State Order Check', description: 'Where the state is absent, what actually governs?', whenToUse: 'Failed-state and informal-order claims', steps: ['Customary authority?', 'Dispute mechanisms?', 'Why no state — refused or failed?'] },
      { name: 'Everyday-Resistance Reading', description: 'Read compliance carefully — quiet non-compliance is a political signal', whenToUse: 'Governance and policy-failure analysis', steps: ['Surface compliance?', 'Hidden transcript?', 'Evasion patterns?'] },
    ],
    referencePapers: [
      { title: 'Seeing Like a State', authors: 'James C. Scott', year: 1998, journal: 'Yale UP', significance: 'Legibility and high-modernist failure' },
      { title: 'The Art of Not Being Governed', authors: 'James C. Scott', year: 2009, journal: 'Yale UP', significance: 'Zomia — statelessness as choice' },
      { title: 'Society Against the State', authors: 'Pierre Clastres', year: 1974, journal: 'Minuit', significance: 'Anti-state political anthropology' },
      { title: 'Debt: The First 5000 Years', authors: 'David Graeber', year: 2011, journal: 'Melville House', significance: 'Debt as moral-political relation' },
    ],
    dataSources: [
      { name: 'Isidore/Persee', type: 'api', coverage: 'French anthropology' },
      { name: 'Sociology/AJOL', type: 'api', coverage: 'ethnography + Southern scholarship' },
      { name: 'OpenAlex/CORE', type: 'api', coverage: 'broad literature' },
    ],
    methodology: {
      approach: 'Ethnographic grounding — the view from the field corrects the view from the archive',
      evidenceHierarchy: ['Ethnographic fieldwork', 'Peer-reviewed anthropology', 'Historical records (flagged — written by states)', 'Administrative data (audit legibility bias)'],
      uncertaintyApproach: 'Marginal-population accounts are systematically distorted by state records — report the source position',
      minimumEvidence: 'Claims about non-state peoples need ethnographic support; state-account claims need legibility audit',
    },
    qualityCriteria: {
      minSources: 5, minQuality: 65, requirePeerReview: false, maxSourceAge: 50,
      specialRequirements: ['Must audit legibility bias in state sources', 'Must check non-state order before declaring failure', 'Must read everyday resistance as politics'],
    },
    standingQuestions: [
      'What does the state\'s simplification destroy here — and what does the margin know?',
      'Is this population resisting the state, or failing to reach it?',
      'Whose transcript are we reading — public or hidden?',
    ],
    knownBiases: [
      'Romanticizing the stateless — non-state orders have violence too',
      'State-blindness — mistaking state absence for social absence',
      'Exoticism — difference amplified for effect',
      'Scale-blindness — village findings universalized',
    ],
  },

  'food-systems': {
    domain: 'food-systems',
    researcherName: 'Dr. Sitos (Σῖτος)',
    keyConcepts: [
      { name: 'Entitlement Approach', definition: 'Sen — famines are entitlement failures, not food availability failures; people starve because they lose access, not because food vanishes', importance: 'foundational', relatedConcepts: ['famine', 'entitlements', 'exchange failure'] },
      { name: 'Food Regime Theory', definition: 'Friedmann & McMichael — successive global food orders (colonial, postwar, corporate) structure who eats what', importance: 'foundational', relatedConcepts: ['food regimes', 'corporate food regime', 'wto agriculture'] },
      { name: 'Food Sovereignty', definition: 'La Via Campesina — communities\' right to define their food systems vs food security\'s narrower access frame', importance: 'advanced', relatedConcepts: ['via campesina', 'agroecology', 'land rights'] },
      { name: 'Agri-food Concentration', definition: 'Seeds, inputs, trading, retail — a handful of firms dominate each node; concentration is power, not just efficiency', importance: 'foundational', relatedConcepts: ['abccd traders', 'seed oligopoly', 'market power'] },
      { name: 'Supply-Chain Fragility', definition: 'Just-in-time efficiency traded resilience — shocks propagate through concentrated, optimized chains', importance: 'advanced', relatedConcepts: ['resilience', 'just-in-time', 'food shocks'] },
    ],
    frameworks: [
      { name: 'Entitlement Analysis', description: 'For hunger/famine claims — who lost access, which entitlement failed (production, labor, trade, transfers)?', whenToUse: 'Famine and food-crisis analysis', steps: ['Food availability actually fell?', 'Which entitlements failed?', 'State response?', 'Conflict driver?'] },
      { name: 'Concentration Map', description: 'Measure firm concentration at each chain node — inputs, trading, processing, retail', whenToUse: 'Agri-food power claims', steps: ['CR4 per node?', 'Entry barriers?', 'Price transmission?'] },
      { name: 'Regime Identification', description: 'Which food regime structures this system — and who does it serve?', whenToUse: 'Global food governance claims', steps: ['Regime characteristics?', 'Winners/losers?', 'Transition signals?'] },
    ],
    referencePapers: [
      { title: 'Poverty and Famines', authors: 'Amartya Sen', year: 1981, journal: 'Oxford UP', significance: 'Entitlement approach — the famine canon' },
      { title: 'Food Regime articles', authors: 'Friedmann & McMichael', year: 1989, journal: 'Sociologia Ruralis', significance: 'Food regime theory' },
      { title: 'Stuffed and Starved', authors: 'Raj Patel', year: 2007, journal: 'Melville House', significance: 'Corporate food system critique' },
      { title: 'State of Food and Agriculture (annual)', authors: 'FAO', year: 2023, journal: 'FAO', significance: 'Baseline data series' },
    ],
    dataSources: [
      { name: 'FAO/WorldBank/UNCTAD', type: 'api', coverage: 'food & agriculture data' },
      { name: 'OpenAlex/AJOL', type: 'api', coverage: 'peer-reviewed + Southern scholarship' },
      { name: 'GDELT', type: 'api', coverage: 'food-crisis signals' },
    ],
    methodology: {
      approach: 'Entitlements before availability — hunger is a distribution and power problem before it is a production problem',
      evidenceHierarchy: ['FAO/academic food-systems research', 'Household and market data', 'Peer-reviewed agronomy/economics', 'Industry claims (flagged)'],
      uncertaintyApproach: 'Food systems are politically and climatically coupled — report both dimensions',
      minimumEvidence: 'Famine claims need entitlement analysis; system claims need the concentration map',
    },
    qualityCriteria: {
      minSources: 6, minQuality: 65, requirePeerReview: false, maxSourceAge: 30,
      specialRequirements: ['Must run entitlement analysis on famine claims', 'Must map agri-food concentration', 'Must include Southern food-system scholarship'],
    },
    standingQuestions: [
      'Which entitlement failed — production, labor, trade, or transfers?',
      'Who concentrates power at which node of this food chain?',
      'Is this a production problem or an access problem — and whose interest does each framing serve?',
    ],
    knownBiases: [
      'Productionism — more food assumed to mean less hunger',
      'Techno-fix bias — yield technology over distribution',
      'Northern market centrism — formal supply chains as the default model',
      'Malthusian reflex — scarcity claimed where distribution failed',
    ],
  },
};

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Get the knowledge base for a researcher domain.
 * Returns null if no KB is defined (uses default prompts).
 */
export function getResearcherKB(domain: DomainExpertise): ResearcherKB | null {
  return RESEARCHER_KBS[domain] || null;
}

/**
 * Build the KB injection block for a researcher's system prompt.
 * This replaces the shallow personality-only approach with deep domain knowledge.
 */
export function buildKBInjection(domain: DomainExpertise): string {
  const kb = RESEARCHER_KBS[domain];
  if (!kb) return '';

  const sections: string[] = [];

  // Key concepts
  if (kb.keyConcepts.length > 0) {
    sections.push(`\n## YOUR DOMAIN KNOWLEDGE BASE\n${kb.keyConcepts.map(c => 
      `- **${c.name}**: ${c.definition}`
    ).join('\n')}`);
  }

  // Analytical frameworks
  if (kb.frameworks.length > 0) {
    sections.push(`\n## YOUR ANALYTICAL FRAMEWORKS\n${kb.frameworks.map(f =>
      `- **${f.name}**: ${f.description}. Use when: ${f.whenToUse}`
    ).join('\n')}`);
  }

  // Methodology
  sections.push(`\n## YOUR METHODOLOGY STANDARDS
- Approach: ${kb.methodology.approach}
- Evidence hierarchy: ${kb.methodology.evidenceHierarchy.join(' > ')}
- Uncertainty: ${kb.methodology.uncertaintyApproach}
- Minimum evidence: ${kb.methodology.minimumEvidence}`);

  // Quality criteria
  sections.push(`\n## YOUR QUALITY REQUIREMENTS
- Min sources: ${kb.qualityCriteria.minSources} | Min quality: ${kb.qualityCriteria.minQuality}/100
- Peer review required: ${kb.qualityCriteria.requirePeerReview ? 'Yes' : 'No (preprints accepted)'}
- Max source age: ${kb.qualityCriteria.maxSourceAge} years
- Special: ${kb.qualityCriteria.specialRequirements.join('; ')}`);

  // Known biases
  if (kb.knownBiases.length > 0) {
    sections.push(`\n## BIASES TO WATCH FOR\n${kb.knownBiases.map(b => `- ${b}`).join('\n')}`);
  }

  // Foundational reference papers — must-know literature for this domain
  if (kb.referencePapers.length > 0) {
    sections.push(`\n## FOUNDATIONAL WORKS IN YOUR DOMAIN\nThese are seminal works that any serious analysis in this domain MUST engage with:\n${kb.referencePapers.map(p =>
      `- **${p.title}** (${p.authors}, ${p.year})${p.journal ? ` — ${p.journal}` : ''}${p.significance ? ` — ${p.significance}` : ''}${p.doi ? ` — DOI: ${p.doi}` : ''}`
    ).join('\n')}`);
  }

  // Standing questions
  if (kb.standingQuestions.length > 0) {
    sections.push(`\n## YOUR STANDING RESEARCH QUESTIONS\n${kb.standingQuestions.map(q => `- ${q}`).join('\n')}`);
  }

  return sections.join('\n');
}

/**
 * Get the data sources a researcher can access.
 * These will be used by the researcher engine to make domain-specific API calls.
 */
export function getResearcherDataSources(domain: DomainExpertise): DataSource[] {
  const kb = RESEARCHER_KBS[domain];
  return kb?.dataSources || [];
}

/**
 * Get all defined KBs for reporting/admin purposes.
 */
export function getAllKBs(): Array<{ domain: DomainExpertise; researcherName: string; conceptCount: number; frameworkCount: number; dataSourceCount: number }> {
  return Object.entries(RESEARCHER_KBS).map(([domain, kb]) => ({
    domain: domain as DomainExpertise,
    researcherName: kb!.researcherName,
    conceptCount: kb!.keyConcepts.length,
    frameworkCount: kb!.frameworks.length,
    dataSourceCount: kb!.dataSources.length,
  }));
}
