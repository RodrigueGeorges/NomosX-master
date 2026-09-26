/**
 * Provider name lists + the Providers union type.
 * Extracted from pipeline-v2.ts (Sprint 28c) — the source of truth for
 * provider names. pipeline-v2 re-exports everything for compatibility.
 */

export type Providers = Array<
  // Académiques core
  | "openalex" | "thesesfr" | "crossref" | "semanticscholar"
  | "arxiv" | "hal" | "pubmed" | "base"
  // Académiques — Extended Coverage
  | "core" | "europepmc" | "doaj" | "ssrn" | "repec" | "nber"
  | "who-gho" | "semantic-scholar-graph"
  // Open-access free APIs (no key)
  | "plos" | "federal-register" | "sec-edgar" | "worldbank-docs" | "cordis"
  // Institutionnels - Intelligence
  | "odni" | "cia-foia" | "nsa" | "uk-jic"
  // Institutionnels - Défense
  | "nato" | "eeas" | "sgdsn" | "eda"
  // Institutionnels - Économie
  | "imf" | "worldbank" | "oecd" | "bis"
  // Institutionnels - Économie Extended
  | "ecb" | "eurostat" | "fred" | "eib"
  // Institutionnels - Cyber
  | "nist" | "cisa" | "enisa"
  // Institutionnels - Multilatéral
  | "un" | "undp" | "unctad"
  // Institutionnels - Énergie & Nucléaire
  | "iaea" | "irena" | "cea" | "entsoe" | "jrc" | "iea" | "acer" | "entsog"
  | "energy-charts" | "smard" | "rte-france" | "energi-data" | "fingrid"
  // Institutionnels - Think Tanks
  | "bruegel"
  // Institutionnels - Environmental
  | "eea"
  // Institutionnels - Academic Independent APIs
  | "openreview" | "biorxiv" | "papers-with-code" | "mit-dspace" | "harvard-dash"
  // Institutionnels - Academic V2 (replaces OpenAlex wrappers)
  | "max-planck-pure"
  // Institutionnels - Government Open Data
  | "istat" | "open-primitive" | "treasury-fiscal"
  // Institutionnels - Health Extended V2
  | "clinical-trials"
  // Institutionnels - Santé Extended
  | "ema" | "inserm" | "ecdc" | "cochrane"
  // Institutionnels - Environnement
  | "inrae" | "ademe"
  // Institutionnels - Français
  | "ens" | "insee" | "shift-project" | "data-gouv" | "france-strategie" | "cnrs"
  // Institutionnels - Tech Research
  | "allen-ai" | "max-planck" | "eth-zurich" | "inria"
  // Institutionnels - Droit & Gouvernance
  | "eur-lex"
  // Think Tanks européens
  | "ecfr" | "swp" | "sipri" | "iai"
  // Politique française & Droit
  | "iddri" | "terra-nova" | "legifrance" | "vie-publique"
  // Santé Extended V2
  | "cdc" | "nih" | "who-direct"
  // Économie Extended V2
  | "oecd-direct"
  // Sciences Humaines & Sociales
  | "isidore" | "persee" | "philpapers"
  // Éducation
  | "eric"
  // Agriculture & Alimentation
  | "fao"
  // Criminologie & Justice
  | "unodc"
  // Live statistics APIs (real numbers, no key required)
  | "worldbank-data" | "ucdp" | "ilostat" | "owid"
  // Key-gated national/international stats (free registration)
  | "comtrade" | "us-bls" | "us-census" | "acled" | "unhcr" | "estat-jp" | "kosis"
  | "ons-uk" | "ibge" | "datacommons"
  // Free metasearch floor (SearXNG — no key, self-hostable)
  | "searxng"
  // Science ouverte européenne
  | "openaire"
  // Open science repository (CERN/Zenodo)
  | "zenodo"
  // Domain-specific academic providers
  | "psychology" | "sociology" | "history" | "geography"
  | "chemistry" | "biology" | "political-science" | "business"
  | "dblp" | "zbmath"
  // Institutionnels - Archives
  | "nara" | "uk-archives" | "archives-fr"
  // Complémentaire - Web Search
  | "linkup"
  // AI-Optimised Search & Enriched News
  | "tavily" | "exa" | "apitube"
  // Large-scale Academic Databases
  | "dimensions" | "lens" | "springer" | "osti" | "datacite" | "google-books"
  // Foundational Sources — Books, reports, reference texts
  | "ipcc" | "internet-archive" | "hathitrust" | "open-library" | "jstor" | "unesco"
  // Foresight & Prospective Sources
  | "club-of-rome" | "millennium-project"
  // Real-time News Providers
  | "gdelt-news" | "newsapi" | "mediastack" | "thenewsapi" | "gnews" | "eventregistry"
  // Independent Media — investigative journalism, heterodox voices, Global South
  | "independent-media" | "gdelt-independent"
  // Think tanks & Policy Labs
  | "lawzero" | "govai" | "iaps" | "caip" | "aipi"
  | "cset" | "ainow" | "datasociety" | "abundance" | "caidp"
  | "scsp" | "ifp" | "cdt" | "brookings" | "fai"
  | "cnas" | "rand" | "newamerica" | "aspen-digital" | "rstreet"
  // Grey Literature — Policy documents, government reports, think tank papers
  | "overton"
  // Foreign Academic Sources — Non-Western databases
  | "cyberleninka" | "wanfang" | "jstage" | "scielo" | "elibrary-ru"
  // Citation graph
  | "opencitations"
  // News (free tier)
  | "newsdata"
  // AI/ML papers with code
  | "hf-papers"
  // EU open data
  | "data-europa"
  // Mega feed registries (domain-routed sub-sources)
  | "mega-central-banks" | "mega-stats" | "mega-un" | "mega-eu" | "mega-press"
  | "mega-thinktanks" | "mega-development" | "mega-academia" | "mega-civil-society"
  // Internet standards
  | "ietf"
>;

export const SHS_PROVIDERS = [
  'isidore', 'persee', 'philpapers', 'eric'
];

export const AGRICULTURE_PROVIDERS = [
  'fao'
];

export const CRIMINOLOGY_PROVIDERS = [
  'unodc'
];

export const EU_SCIENCE_PROVIDERS = [
  'openaire'
];

// ALL PROVIDERS - 100% COVERAGE
export const ALL_PROVIDERS = [
  // Academic core
  'openalex', 'crossref', 'semanticscholar', 'pubmed', 'arxiv',
  'doaj', 'europepmc', 'hal', 'base', 'core', 'ssrn', 'repec', 'nber',
  'who-gho', 'semantic-scholar-graph', 'thesesfr',
  'plos', 'federal-register', 'sec-edgar', 'worldbank-docs', 'cordis',
  // V3.1: Consolidated institutions (replaces 30+ individual OpenAlex ROR calls with 1 batched call)
  'consolidated-institutions',
  // V3.1: GLOBAL OMNISCIENCE LAYER — RSS-based providers covering 80+ organizations worldwide
  'global-intelligence', 'global-orgs', 'global-think-tanks', 'global-science',
  // V3.2: MEGA FEED REGISTRY — 560+ sub-sources (domain-routed, max ~24 feeds/query)
  'mega-central-banks', 'mega-stats', 'mega-un', 'mega-eu', 'mega-press',
  'mega-thinktanks', 'mega-development', 'mega-academia', 'mega-civil-society',
  // Real-time News
  'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry',
  // Independent Media — investigative journalism, heterodox voices, Global South
  'independent-media', 'gdelt-independent',
  // Web search
  'linkup',
  // Sciences Humaines & Sociales
  'isidore', 'persee', 'philpapers',
  // Education, Agriculture, Criminology, Open Science
  'eric', 'fao', 'unodc', 'openaire', 'zenodo',
  // Live statistics APIs
  'worldbank-data', 'ucdp', 'ilostat', 'owid',
  'comtrade', 'us-bls', 'us-census', 'acled', 'unhcr', 'estat-jp', 'kosis',
  'ons-uk', 'ibge', 'datacommons', 'searxng',
  // Domain-specific academic providers
  'psychology', 'sociology', 'history', 'geography',
  'chemistry', 'biology', 'political-science', 'business',
  'dblp', 'zbmath',
  // Think Tanks & Policy (via extended registry)
  'brookings', 'rand', 'cnas', 'newamerica', 'lawzero',
  'ecfr', 'swp', 'sipri', 'iai', 'iddri', 'terra-nova',
  // Government & International
  'worldbank', 'imf', 'oecd', 'un', 'undp', 'eurostat', 'ecb', 'bis',
  'insee', 'fred', 'eib', 'unctad',
  // Institutional — Security & Defense
  'odni', 'cia-foia', 'nsa', 'uk-jic', 'nato', 'eeas', 'sgdsn', 'eda',
  'nist', 'cisa', 'enisa',
  // Energy & Nuclear
  'iaea', 'irena', 'cea',
  // Health
  'ema', 'inserm', 'ecdc', 'cochrane', 'cdc', 'nih', 'who-direct',
  // Environment
  'inrae', 'ademe',
  // French institutions
  'ens', 'shift-project', 'data-gouv', 'france-strategie', 'cnrs',
  'legifrance', 'vie-publique',
  // Tech Research
  'allen-ai', 'max-planck', 'eth-zurich', 'inria',
  // Law & Governance
  'eur-lex',
  // Archives
  'nara', 'uk-archives', 'archives-fr',
  // Foundational Sources — Books, reports, reference texts
  'ipcc', 'internet-archive', 'hathitrust', 'open-library', 'jstor', 'unesco',
  // Foresight & Prospective Sources
  'club-of-rome', 'millennium-project',
  // Grey Literature — 20M+ policy documents worldwide
  'overton',
  // Foreign Academic Sources — Non-Western databases
  'cyberleninka', 'wanfang', 'jstage', 'scielo', 'elibrary-ru',
  // Citation graph (free, no key)
  'opencitations',
  // News (free tier)
  'newsdata',
  // AI/ML papers with code & model links (free, no key)
  'hf-papers',
  // EU open data portal (free, no key)
  'data-europa',
  // IETF standards & internet-drafts (free, no key)
  'ietf',
];

export const NEWS_PROVIDERS = [
  'gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry',
  'independent-media', 'gdelt-independent', 'newsdata'
];

export const ACADEMIC_PROVIDERS = [
  'openalex', 'crossref', 'semanticscholar', 'pubmed', 'arxiv',
  'doaj', 'europepmc',
  // Foundational & foresight sources
  'ipcc', 'internet-archive', 'hathitrust', 'open-library', 'jstor', 'unesco',
  'club-of-rome', 'millennium-project',
  // Citation graph
  'opencitations',
];

export const GOVERNMENT_PROVIDERS = [
  'worldbank', 'imf', 'oecd', 'un', 'undp', 'eurostat', 'ecb', 'bis',
  'insee', 'thesesfr'
];

// Default academic providers â€” covers STEM, social sciences, humanities, law, economics
export const DEFAULT_ACADEMIC_PROVIDERS: Providers = [
  // Académique core
  "openalex", "crossref", "semanticscholar", "arxiv", "hal", "pubmed", "base",
  "core", "europepmc", "doaj", "ssrn", "repec", "plos",
  // Thèses & science ouverte
  "thesesfr", "openaire", "zenodo",
  // Working papers & rapports institutionnels
  "nber", "worldbank-docs", "cordis", "federal-register",
  // Institutions internationales — données primaires
  "imf", "worldbank", "oecd", "eurostat", "un", "insee", "fred", "who-gho",
  // Think tanks — rapports policy
  "brookings", "rand", "cnas", "ecfr", "swp", "sipri", "france-strategie",
  // Sciences humaines & sociales
  "isidore", "persee", "philpapers",
  // Foundational sources — books, reports, reference texts
  "ipcc", "internet-archive", "hathitrust", "open-library", "jstor", "unesco", "google-books",
  // Foresight & prospective
  "club-of-rome", "millennium-project",
  // Grey Literature — policy documents, government reports
  "overton",
  // Foreign Academic Sources — geographic coverage (free APIs first)
  "cyberleninka", "jstage", "scielo",
  // Pouls de l'actualité (gratuit)
  "gdelt-news",
];
