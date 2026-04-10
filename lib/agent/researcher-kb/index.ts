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
    researcherName: 'Dr. Amara Okafor',
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
    researcherName: 'Dr. Elena Vasquez',
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
    researcherName: 'Dr. James Chen',
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
    researcherName: 'Dr. Sarah Lindström',
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
    researcherName: 'Dr. Marcus Webb',
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
    researcherName: 'Dr. Isabelle Moreau',
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
    researcherName: 'Dr. Kenji Tanaka',
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
      { title: 'A safe operating space for humanity', authors: 'Johan Rockström et al.', year: 2009, journal: 'Nature', significance: 'Original planetary boundaries framework — foundational for Earth system governance' },
      { title: 'Global Carbon Budget 2023', authors: 'Friedlingstein et al.', year: 2023, journal: 'Earth System Science Data', significance: 'Annual authoritative assessment of global CO2 emissions, sinks, and remaining budget' },
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
    researcherName: 'Dr. Sergei Petrov',
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
    researcherName: 'Dr. Michael Roberts',
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
    researcherName: 'Dr. Priya Sharma',
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
    researcherName: 'Dr. María González',
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
    researcherName: 'Dr. Thomas Weber',
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
    researcherName: 'Dr. Fatima Al-Rashid',
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
    researcherName: 'Dr. Kwame Osei',
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
    researcherName: 'Dr. Lisa Chang',
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
    researcherName: 'Dr. Rachel Kim',
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
    researcherName: 'Dr. Carlos Rodriguez',
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
    researcherName: 'Dr. Sophie Martin',
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
    researcherName: 'Dr. Michael Zhang',
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
    researcherName: 'Dr. David Liu',
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
    researcherName: 'Dr. Amina Diallo',
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
    researcherName: 'Dr. Anika Johansson',
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
