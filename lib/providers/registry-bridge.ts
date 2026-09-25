/**
 * REGISTRY BRIDGE - Version Corrigée et Optimisée
 * 
 * Bridge unifié pour tous les providers avec fallback OpenAlex
 * Imports corrects, chemins valides, intégration complète
 */

import { searchOpenAlex } from './openalex';
import { searchCrossref } from './crossref';
import { searchOrcid } from './orcid';
import { searchSemanticscholar } from './semantic-scholar';
import { searchCore } from './core';
import { searchBase } from './base';
import { searchOpenAIRE as searchOpenaire } from './openaire';
import { searchArxiv } from './arxiv';
import { searchPubMed } from './pubmed';
import { searchNature } from './nature';
import { searchScience } from './science';
import { searchCell } from './cell';
import { searchLancet } from './lancet';
import { searchPnas } from './pnas';
import { searchSpringer } from './springer';
import { searchElsevier } from './elsevier';
import { searchWiley } from './wiley';
import { searchTaylorfrancis } from './taylor-francis';
import { searchSage } from './sage';
import { searchOxford } from './oxford';
import { searchCambridge } from './cambridge';

// Business providers
import { searchMckinsey } from './business/mckinsey';
import { searchBcg } from './business/bcg';
import { searchBain } from './business/bain';
import { searchDeloitte } from './business/deloitte';
import { searchPwc } from './business/pwc';
import { searchEy } from './business/ey';
import { searchKpmg } from './business/kpmg';
import { searchAccenture } from './business/accenture';
import { searchBlackrock } from './business/blackrock';
import { searchGoldmansachs } from './business/goldman-sachs';
import { searchJpmorgan } from './business/jpmorgan';
import { searchMorganstanley } from './business/morgan-stanley';
import { searchCreditsuisse } from './business/credit-suisse';
import { searchUbs } from './business/ubs';
import { searchDeutschebank } from './business/deutsche-bank';

// Think tanks providers
import { searchBrookings } from './think_tanks/brookings';
import { searchCarnegie } from './think_tanks/carnegie';
import { searchChathamhouse } from './think_tanks/chatham-house';
import { searchRand } from './think_tanks/rand';
import { searchCfr } from './think_tanks/cfr';
import { searchWilsoncenter } from './think_tanks/wilson-center';
import { searchHeritagefoundation } from './think_tanks/heritage-foundation';
import { searchStimsoncenter } from './think_tanks/stimson-center';
import { searchAdl } from './think_tanks/adl';
import { searchCato } from './think_tanks/cato-institute';
import { searchNewamerica } from './think_tanks/new-america';
import { searchIiss } from './think_tanks/iiss';
import { searchAspen } from './think_tanks/aspen-institute';

// Discipline providers — PhD-level domain sources (were implemented but orphaned)
import { searchSociology } from './sociology';
import { searchPsychology } from './psychology';
import { searchHistory } from './history';
import { searchGeography } from './geography';
import { searchChemistry } from './chemistry';
import { searchBiology } from './biology';
import { searchPoliticalScience } from './political-science';
import { searchPhilPapers } from './philpapers';
import { searchPersee } from './persee';
import { searchISIDORE } from './isidore';
import { searchZbMath } from './zbmath';
import { searchERIC } from './eric';
import { searchUNODC } from './unodc';
import { searchFAO } from './fao';
import { searchDBLP } from './dblp';

// Government providers
import { searchNasa } from './government/nasa';
import { searchNoaa } from './government/noaa';
import { searchEpa } from './government/epa';
import { searchFda } from './government/fda';
import { searchCdc } from './government/cdc';
import { searchNih } from './government/nih';
import { searchNsf } from './government/nsf';
import { searchWorldbank } from './government/worldbank';
import { searchImf } from './government/imf';
import { searchOecd } from './government/oecd';
import { searchUndp } from './government/undp';
import { searchWho } from './government/who';

// Environmental providers
import { searchIpcc } from './environmental/ipcc';
import { searchUnep } from './environmental/unep';
import { searchIucn } from './environmental/iucn';
import { searchWwf } from './environmental/wwf';
import { searchGreenpeace } from './environmental/greenpeace';
import { searchWri } from './environmental/wri';
import { searchClimateanalytics } from './environmental/climate-analytics';
import { searchIea } from './environmental/iea';

// Technology providers
import { searchDeepmind } from './technology/deepmind';
import { searchOpenairesearch } from './technology/openai-research';
import { searchGoogleai } from './technology/google-ai';
import { searchMicrosoftresearch } from './technology/microsoft-research';
import { searchFacebookresearch } from './technology/facebook-research';
import { searchAppleresearch } from './technology/apple-research';
import { searchIbmresearch } from './technology/ibm-research';
import { searchNvidiaresearch } from './technology/nvidia-research';
import { searchAnthropic } from './technology/anthropic';
import { searchGithub } from './technology/github';

// Patents providers
import { searchUspto } from './patents/uspto';
import { searchGooglepatents } from './patents/google-patents';
import { searchEpo } from './patents/epo';
import { searchWipo } from './patents/wipo';

// Data research providers
import { searchFigshare } from './data_research/figshare';
import { searchZenodo } from './zenodo';
import { searchKaggle } from './data_research/kaggle';
import { searchHuggingface } from './data_research/huggingface';
import { searchDataverse } from './data_research/dataverse';
import { searchResearchgate } from './data_research/researchgate';
import { searchAcademiaedu } from './data_research/academia-edu';
import { searchMendeley } from './data_research/mendeley';

// Interface pour les résultats
export interface RegistrySearchResult {
  id: string;
  title: string;
  authors?: string[];
  year?: number;
  doi?: string;
  abstract?: string;
  url?: string;
  source: string;
  provider: string;
  qualityScore: number;
  type: 'academic' | 'institutional' | 'business' | 'government' | 'think_tank' | 'environmental' | 'technology' | 'patent' | 'data' | 'data_research' | 'unknown';
  citationCount?: number;
  publishedIn?: string;
  concepts?: string[];
  openAccess?: boolean;
  peerReviewed?: boolean;
}

// Interface pour les options de recherche
export interface RegistrySearchOptions {
  limit?: number;
  year?: number;
  minQuality?: number;
  includeAbstracts?: boolean;
  sortBy?: 'relevance' | 'year' | 'citations' | 'quality';
  sortOrder?: 'asc' | 'desc';
}

// ── ID RESOLUTION LAYER ────────────────────────────────────────────────────
// DOMAIN_PROVIDERS carries display-slug ids (`iea---international-energy-agency`)
// while this registry uses canonical ids (`iea`). Unknown ids previously fell
// through to a generic OpenAlex search — duplicating OpenAlex and silently
// losing the specialised provider. Aliases resolve slugs to real cases.

const PROVIDER_ALIASES: Record<string, string> = {
  'iea---international-energy-agency': 'iea',
  'irena---international-renewable-energy-agency': 'irena',
  'pnas---proceedings-of-national-academy-of-sciences': 'pnas',
  'the-lancet': 'lancet',
  'pwc-research-institute': 'pwc',
  'ey-research': 'ey',
  'kpmg-thought-leadership': 'kpmg',
  'bain---company-insights': 'bain',
  'accenture-research': 'accenture',
  'deepmind-research': 'deepmind',
  'google-ai-research': 'google-ai',
  'microsoft-research': 'microsoft-research',
  'openai-research': 'openai-research',
  'world-bank-research---development': 'worldbank',
  'undp-research': 'undp',
  'amazon-science': 'amazon',
  'energy-futures-initiative': 'iea',
  'rmi---rocky-mountain-institute': 'iea',
};

// Institution providers resurrected via OpenAlex ROR filter — these had dead
// factory stubs (openalex-provider-factory.js, deleted) so their ids silently
// hit the generic OpenAlex fallback. RORs resolved live via api.openalex.org.
const ROR_PROVIDERS: Record<string, string> = {
  'csis': '04my2jj52',                                          // CSIS — 1.9k works
  'dgap': '049xxah85',                                          // German Council on Foreign Relations
  'cepr': '04jzmdh37',                                          // CEPR — 28.8k works
  'johns-hopkins': '00za53h95',                                 // Johns Hopkins
  'cgd': '0068yvd12',                                           // Center for Global Development
  'center-for-global-development': '0068yvd12',
  'acet': '01hr83286',                                          // African Center for Economic Transformation
  'acet---african-center-for-economic-transformation': '01hr83286',
  'saiia': '02bxpm650',                                         // South African Institute of Intl Affairs
  'saiia---south-african-institute-of-international-affairs': '02bxpm650',
  'amazon': '04mv4n011',
  'copenhagen-institute': '034cagk98',                          // Copenhagen Inst. for Futures Studies
  'vanguard': '032kzxf45',                                      // Vanguard Group
};

// Journal providers via OpenAlex source-id filter (same pattern as nature.js).
const SOURCE_PROVIDERS: Record<string, string> = {
  'nature-medicine': 'S203256638',
  'jama': 'S172573765',
  'jama---journal-of-american-medical-association': 'S172573765',
  'new-england-journal-of-medicine': 'S62468778',
  'nejm': 'S62468778',
};

// Fonction principale de recherche
export async function searchRegistry(
  provider: string,
  query: string,
  options: RegistrySearchOptions = {}
): Promise<RegistrySearchResult[]> {
  const {
    limit = 100,
    year,
    minQuality = 0,
    includeAbstracts = true,
    sortBy = 'relevance',
    sortOrder = 'desc'
  } = options;

  let results: RegistrySearchResult[] = [];
  const requestedProvider = provider.toLowerCase();
  const resolvedProvider = PROVIDER_ALIASES[requestedProvider] ?? requestedProvider;

  try {
    switch (resolvedProvider) {
      // ACADEMIC APIS - Real implementations
      case 'openalex':
        results = await searchOpenAlex(query, limit);
        break;
      case 'crossref':
        results = await searchCrossref(query, limit);
        break;
      case 'orcid':
        results = ((await searchOrcid(query)) as any) ?? [];
        break;
      case 'semantic-scholar':
        results = await searchSemanticscholar(query, limit);
        break;
      case 'semanticscholar':
        results = await searchSemanticscholar(query, limit);
        break;
      case 'core':
        results = await searchCore(query, limit);
        break;
      case 'base':
        results = await searchBase(query, limit);
        break;
      case 'openaire':
        results = await searchOpenaire(query, limit);
        break;
      case 'arxiv':
        results = await searchArxiv(query, limit);
        break;
      case 'pubmed':
        results = await searchPubMed(query, limit);
        break;
      case 'nature':
        results = await searchNature(query, limit);
        break;
      case 'science':
        results = await searchScience(query, limit);
        break;
      case 'cell':
        results = await searchCell(query, limit);
        break;
      case 'lancet':
        results = await searchLancet(query, limit);
        break;
      case 'pnas':
        results = await searchPnas(query, limit);
        break;
      case 'springer':
        results = await searchSpringer(query, limit);
        break;
      case 'elsevier':
        results = await searchElsevier(query, limit);
        break;
      case 'wiley':
        results = await searchWiley(query, limit);
        break;
      case 'taylor-francis':
        results = await searchTaylorfrancis(query, limit);
        break;
      case 'sage':
        results = await searchSage(query, limit);
        break;
      case 'oxford':
        results = await searchOxford(query, limit);
        break;
      case 'cambridge':
        results = await searchCambridge(query, limit);
        break;

      // BUSINESS PROVIDERS - OpenAlex with ROR IDs
      case 'mckinsey':
        results = await searchMckinsey(query, limit);
        break;
      case 'bcg':
        results = await searchBcg(query, limit);
        break;
      case 'bain':
        results = await searchBain(query, limit);
        break;
      case 'deloitte':
        results = await searchDeloitte(query, limit);
        break;
      case 'pwc':
        results = await searchPwc(query, limit);
        break;
      case 'ey':
        results = await searchEy(query, limit);
        break;
      case 'kpmg':
        results = await searchKpmg(query, limit);
        break;
      case 'accenture':
        results = await searchAccenture(query, limit);
        break;
      case 'blackrock':
        results = await searchBlackrock(query, limit);
        break;
      case 'goldman-sachs':
        results = await searchGoldmansachs(query, limit);
        break;
      case 'jpmorgan':
        results = await searchJpmorgan(query, limit);
        break;
      case 'morgan-stanley':
        results = await searchMorganstanley(query, limit);
        break;
      case 'credit-suisse':
        results = await searchCreditsuisse(query, limit);
        break;
      case 'ubs':
        results = await searchUbs(query, limit);
        break;
      case 'deutsche-bank':
        results = await searchDeutschebank(query, limit);
        break;

      // THINK TANKS PROVIDERS - OpenAlex with ROR IDs
      case 'brookings':
        results = await searchBrookings(query, limit);
        break;
      case 'carnegie':
        results = await searchCarnegie(query, limit);
        break;
      case 'chatham-house':
        results = await searchChathamhouse(query, limit);
        break;
      case 'rand':
        results = await searchRand(query, limit);
        break;
      case 'cfr':
        results = await searchCfr(query, limit);
        break;
      case 'wilson-center':
        results = await searchWilsoncenter(query, limit);
        break;
      case 'heritage-foundation':
        results = await searchHeritagefoundation(query, limit);
        break;
      case 'stimson-center':
        results = await searchStimsoncenter(query, limit);
        break;
      case 'adl':
        results = await searchAdl(query, limit);
        break;
      case 'cato-institute':
        results = await searchCato(query, limit);
        break;
      case 'iiss':
        results = await searchIiss(query, limit);
        break;
      case 'aspen-institute':
      case 'aspen-digital':
        results = await searchAspen(query, limit);
        break;
      case 'new-america':
      case 'newamerica':
        results = await searchNewamerica(query, limit);
        break;

      // AI POLICY & SECURITY THINK TANKS — OpenAlex enriched searches
      case 'cset':
        results = await searchOpenAlex(`${query} AI security emerging technology policy`, limit);
        break;
      case 'cnas':
        results = await searchOpenAlex(`${query} national security defense strategy`, limit);
        break;
      case 'scsp':
        results = await searchOpenAlex(`${query} AI competitiveness special competitive studies`, limit);
        break;
      case 'govai':
        results = await searchOpenAlex(`${query} AI governance policy global`, limit);
        break;
      case 'iaps':
        results = await searchOpenAlex(`${query} AI policy safety international`, limit);
        break;
      case 'caip':
        results = await searchOpenAlex(`${query} AI policy center governance`, limit);
        break;
      case 'aipi':
        results = await searchOpenAlex(`${query} artificial intelligence policy institute`, limit);
        break;
      case 'ainow':
        results = await searchOpenAlex(`${query} AI social impact algorithmic accountability`, limit);
        break;
      case 'datasociety':
        results = await searchOpenAlex(`${query} data society technology social impact`, limit);
        break;
      case 'cdt':
        results = await searchOpenAlex(`${query} digital rights civil liberties technology policy`, limit);
        break;
      case 'rstreet':
        results = await searchOpenAlex(`${query} free market policy regulation reform`, limit);
        break;
      case 'fai':
        results = await searchOpenAlex(`${query} AI safety alignment beneficial`, limit);
        break;
      case 'lawzero':
        results = await searchOpenAlex(`${query} AI law regulation legal framework`, limit);
        break;
      case 'abundance':
        results = await searchOpenAlex(`${query} technology abundance innovation growth`, limit);
        break;
      case 'caidp':
        results = await searchOpenAlex(`${query} AI democracy public participation governance`, limit);
        break;
      case 'ifp':
        results = await searchOpenAlex(`${query} technology future foresight policy France`, limit);
        break;

      // GOVERNMENT PROVIDERS - OpenAlex with ROR IDs
      case 'nasa':
        results = await searchNasa(query, limit);
        break;
      case 'noaa':
        results = await searchNoaa(query, limit);
        break;
      case 'epa':
        results = await searchEpa(query, limit);
        break;
      case 'fda':
        results = await searchFda(query, limit);
        break;
      case 'cdc':
        results = await searchCdc(query, limit);
        break;
      case 'nih':
        results = await searchNih(query, limit);
        break;
      case 'nsf':
        results = await searchNsf(query, limit);
        break;
      case 'worldbank':
        results = await searchWorldbank(query, limit);
        break;
      case 'imf':
        results = await searchImf(query, limit);
        break;
      case 'oecd':
        results = await searchOecd(query, limit);
        break;
      case 'undp':
        results = await searchUndp(query, limit);
        break;
      case 'who':
        results = await searchWho(query, limit);
        break;

      // ENVIRONMENTAL PROVIDERS - OpenAlex with ROR IDs
      case 'ipcc':
        results = await searchIpcc(query, limit);
        break;
      case 'unep':
        results = await searchUnep(query, limit);
        break;
      case 'iucn':
        results = await searchIucn(query, limit);
        break;
      case 'wwf':
        results = await searchWwf(query, limit);
        break;
      case 'greenpeace':
        results = await searchGreenpeace(query, limit);
        break;
      case 'wri':
        results = await searchWri(query, limit);
        break;
      case 'climate-analytics':
        results = await searchClimateanalytics(query, limit);
        break;
      case 'iea':
        results = await searchIea(query, limit);
        break;

      // TECHNOLOGY PROVIDERS - OpenAlex with ROR IDs
      case 'deepmind':
        results = await searchDeepmind(query, limit);
        break;
      case 'openai-research':
        results = await searchOpenairesearch(query, limit);
        break;
      case 'google-ai':
        results = await searchGoogleai(query, limit);
        break;
      case 'microsoft-research':
        results = await searchMicrosoftresearch(query, limit);
        break;
      case 'facebook-research':
        results = await searchFacebookresearch(query, limit);
        break;
      case 'apple-research':
        results = await searchAppleresearch(query, limit);
        break;
      case 'ibm-research':
        results = await searchIbmresearch(query, limit);
        break;
      case 'nvidia-research':
        results = await searchNvidiaresearch(query, limit);
        break;
      case 'anthropic':
        results = await searchAnthropic(query, limit);
        break;
      case 'github':
        results = await searchGithub(query, limit);
        break;

      // PATENTS PROVIDERS - OpenAlex with filters
      case 'uspto':
        results = (await searchUspto(query, limit)) as any;
        break;
      case 'google-patents':
        results = (await searchGooglepatents(query, limit)) as any;
        break;
      case 'epo':
        results = await searchEpo(query, limit);
        break;
      case 'wipo':
        results = await searchWipo(query, limit);
        break;

      // DATA RESEARCH PROVIDERS - OpenAlex with filters
      case 'figshare':
        results = await searchFigshare(query, limit);
        break;
      case 'zenodo':
        results = await searchZenodo(query, limit);
        break;
      case 'kaggle':
        results = await searchKaggle(query, limit);
        break;
      case 'huggingface':
        results = await searchHuggingface(query, limit);
        break;
      case 'dataverse':
        results = await searchDataverse(query, limit);
        break;
      case 'researchgate':
        results = await searchResearchgate(query, limit);
        break;
      case 'academia-edu':
        results = await searchAcademiaedu(query, limit);
        break;
      case 'mendeley':
        results = await searchMendeley(query, limit);
        break;

      // ENERGY & NUCLEAR
      case 'iaea':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/00h1hpe16' });
        break;
      case 'irena':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/030q6uf81' });
        break;
      case 'cea':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/02s377d40' });
        break;

      // ECONOMICS EXTENDED
      case 'ecb':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/04bwf3862' });
        break;
      case 'eurostat':
        results = await searchOpenAlex(`${query} European statistics EU`, limit, { filter: 'authorships.institutions.ror:https://ror.org/02az9a613' });
        break;
      case 'fred':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/03yd7cn72' });
        break;
      case 'eib':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/02k7v4d05' });
        break;
      case 'nber':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/05d5mza29' });
        break;

      // HEALTH EXTENDED
      case 'ema':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/031bh4s32' });
        break;
      case 'inserm':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/02vjkv261' });
        break;
      case 'ecdc':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/04mfmq790' });
        break;
      case 'cochrane':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/0090npp15' });
        break;

      // ENVIRONMENT
      case 'inrae':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/003vg9w96' });
        break;
      case 'ademe':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/04f7e0t38' });
        break;
      case 'shift-project':
        results = await searchOpenAlex(`${query} energy transition decarbonization climate`, limit, { filter: 'concepts.id:C127313418' });
        break;

      // FRENCH INSTITUTIONS
      case 'cnrs':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/02feahw73' });
        break;
      case 'inria':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/02kvxyf05' });
        break;
      case 'ens':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/05a0dhs15' });
        break;
      case 'insee':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/02cjnvs63' });
        break;
      case 'france-strategie':
        results = await searchOpenAlex(`${query} politique publique France prospective`, limit, { filter: 'authorships.institutions.ror:https://ror.org/03xez6b38' });
        break;
      case 'data-gouv':
        results = await searchOpenAlex(`${query} open data France gouvernement`, limit);
        break;

      // TECH RESEARCH INSTITUTES
      case 'allen-ai':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/01mna5h14' });
        break;
      case 'max-planck':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/01hhn8328' });
        break;
      case 'eth-zurich':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/05a28rw58' });
        break;

      // LAW & GOVERNANCE
      case 'eur-lex':
        results = await searchOpenAlex(`${query} European Union law regulation directive`, limit);
        break;

      // EUROPEAN THINK TANKS
      case 'ecfr':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/03q12x978' });
        break;
      case 'swp':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/03b6thg82' });
        break;
      case 'sipri':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/02bjzsh13' });
        break;
      case 'iai':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/03fcxyy92' });
        break;

      // FRENCH POLICY & LAW
      case 'iddri':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/02wqz4q95' });
        break;
      case 'terra-nova':
        results = await searchOpenAlex(`${query} Terra Nova think tank France policy`, limit);
        break;
      case 'legifrance':
        results = await searchOpenAlex(`${query} French law legislation regulation`, limit);
        break;
      case 'vie-publique':
        results = await searchOpenAlex(`${query} French public policy governance`, limit);
        break;

      // HEALTH EXTENDED V2
      case 'cdc':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/03bp5hc32' });
        break;
      case 'nih':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/01cwqze88' });
        break;
      case 'who-direct':
        results = await searchOpenAlex(query, limit, { filter: 'authorships.institutions.ror:https://ror.org/01k4yrm29' });
        break;

      // ECONOMICS EXTENDED V2
      case 'oecd-direct':
        results = await searchOpenAlex(`${query} OECD policy report`, limit, { filter: 'authorships.institutions.ror:https://ror.org/05n14r570' });
        break;

      // ── DISCIPLINE PROVIDERS — PhD-level domain sources ──
      // Native APIs with their own fallbacks; previously orphaned (reachable via
      // DOMAIN_EXTENDED_PROVIDERS but hitting the OpenAlex default case).
      case 'sociology':
        results = await searchSociology(query, limit);
        break;
      case 'psychology':
        results = await searchPsychology(query, limit);
        break;
      case 'history':
        results = await searchHistory(query, limit);
        break;
      case 'geography':
        results = await searchGeography(query, limit);
        break;
      case 'chemistry':
        results = await searchChemistry(query, limit);
        break;
      case 'biology':
        results = await searchBiology(query, limit);
        break;
      case 'political-science':
        results = await searchPoliticalScience(query, limit);
        break;
      case 'philpapers':
        results = await searchPhilPapers(query, limit);
        break;
      case 'persee':
        results = await searchPersee(query, limit);
        break;
      case 'isidore':
        results = await searchISIDORE(query, limit);
        break;
      case 'zbmath':
        results = await searchZbMath(query, limit);
        break;
      case 'eric':
        results = await searchERIC(query, limit);
        break;
      case 'unodc':
        results = await searchUNODC(query, limit);
        break;
      case 'fao':
        results = await searchFAO(query, limit);
        break;
      case 'dblp':
        results = await searchDBLP(query, limit);
        break;

      // Fallback chain for unrouted ids: ROR institution filter → journal
      // source filter → generic OpenAlex (last resort, tagged honestly).
      default: {
        const ror = ROR_PROVIDERS[resolvedProvider];
        if (ror) {
          results = (await searchOpenAlex(query, limit, {
            filter: `authorships.institutions.ror:${ror}`,
          })).map((r: any) => ({ ...r, provider: resolvedProvider }));
          break;
        }
        const sourceId = SOURCE_PROVIDERS[resolvedProvider];
        if (sourceId) {
          results = (await searchOpenAlex(query, limit, {
            filter: `primary_location.source.id:https://openalex.org/${sourceId}`,
          })).map((r: any) => ({ ...r, provider: resolvedProvider }));
          break;
        }
        console.warn(`Unknown provider: ${provider}, falling back to OpenAlex`);
        results = await searchOpenAlex(query, limit);
        break;
      }
    }
  } catch (error) {
    console.error(`Error searching ${provider}:`, error);
    // Fallback to OpenAlex on error
    results = await searchOpenAlex(query, limit);
  }

  // Apply filters and sorting
  let filteredResults = results;

  // Year filter
  if (year) {
    filteredResults = filteredResults.filter(result => 
      result.year === year || (result.year && result.year >= year)
    );
  }

  // Quality filter
  if (minQuality > 0) {
    filteredResults = filteredResults.filter(result => 
      result.qualityScore >= minQuality
    );
  }

  // Abstract filter
  if (!includeAbstracts) {
    filteredResults = filteredResults.map(result => ({
      ...result,
      abstract: undefined
    }));
  }

  // Sorting
  filteredResults.sort((a, b) => {
    let aValue: number, bValue: number;

    switch (sortBy) {
      case 'year':
        aValue = a.year || 0;
        bValue = b.year || 0;
        break;
      case 'citations':
        aValue = a.citationCount || 0;
        bValue = b.citationCount || 0;
        break;
      case 'quality':
        aValue = a.qualityScore || 0;
        bValue = b.qualityScore || 0;
        break;
      case 'relevance':
      default:
        // For relevance, we'll use a combination of quality and recency
        const currentYear = new Date().getFullYear();
        const recencyWeight = 0.3;
        const qualityWeight = 0.7;
        
        aValue = (a.qualityScore || 0) * qualityWeight + 
                 ((currentYear - (a.year || currentYear)) / currentYear) * recencyWeight;
        bValue = (b.qualityScore || 0) * qualityWeight + 
                 ((currentYear - (b.year || currentYear)) / currentYear) * recencyWeight;
        break;
    }

    return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
  });

  // Limit results
  return filteredResults.slice(0, limit);
}

// Fonctions utilitaires
export function getAvailableProviders(): string[] {
  return [
    // Academic
    'openalex', 'crossref', 'orcid', 'semantic-scholar', 'core', 'base', 'openaire',
    'arxiv', 'pubmed', 'nature', 'science', 'cell', 'lancet', 'pnas', 'springer',
    'elsevier', 'wiley', 'taylor-francis', 'sage', 'oxford', 'cambridge',
    
    // Business & Consulting
    'mckinsey', 'bcg', 'bain', 'deloitte', 'pwc', 'ey', 'kpmg', 'accenture',
    'blackrock', 'goldman-sachs', 'jpmorgan', 'morgan-stanley', 'credit-suisse',
    'ubs', 'deutsche-bank',
    
    // Think Tanks
    'brookings', 'carnegie', 'chatham-house', 'rand', 'cfr', 'wilson-center',
    'heritage-foundation', 'stimson-center', 'adl', 'cato-institute', 'new-america',
    'iiss', 'aspen-institute',
    
    // Government & International Organizations
    'worldbank', 'imf', 'who', 'unep', 'oecd', 'undp', 'nasa', 'nih', 'nsf',
    'cdc', 'epa', 'fda', 'noaa',
    
    // Environmental
    'ipcc', 'iea', 'wri', 'wwf', 'greenpeace', 'iucn', 'climate-analytics',
    
    // Technology & Research
    'anthropic', 'openai-research', 'google-ai', 'microsoft-research', 'deepmind',
    'facebook-research', 'nvidia-research', 'ibm-research', 'apple-research',
    'github', 'huggingface', 'kaggle',
    
    // Data & Research Platforms
    'figshare', 'zenodo', 'mendeley', 'researchgate', 'academia-edu', 'dataverse',
    
    // Patents
    'google-patents', 'uspto', 'epo', 'wipo',

    // Discipline providers — PhD-level domain sources
    'sociology', 'psychology', 'history', 'geography', 'chemistry', 'biology',
    'political-science', 'philpapers', 'persee', 'isidore', 'zbmath', 'eric',
    'unodc', 'fao', 'dblp'
  ];
}

// Extended provider search — batches OpenAlex-backed providers to cut API
// pressure (anti-saturation). A domain can map 15+ OpenAlex-funneled ids; firing
// each separately is what tripped the 429 storms. Here they collapse into:
//   1 call per genuinely-distinct provider (real registry cases)
//   1 batched call for ALL institution-ROR providers (OR filter)
//   1 batched call for ALL journal source-id providers (OR filter)
//   1 shared generic call for ALL unknown ids (was: N identical OpenAlex calls)
export async function searchExtendedProviders(query: string, options: any = {}) {
  const rawProviders: string[] = options.providers || [];
  if (rawProviders.length === 0) return [];

  const limit = options.limit || 10;
  const allResults: RegistrySearchResult[] = [];

  // Resolve slug aliases then dedupe — `iea---…` and `iea` must not fire twice.
  const resolved = [...new Set(
    rawProviders.map(p => PROVIDER_ALIASES[p.toLowerCase()] ?? p.toLowerCase())
  )];

  const rorProviders = resolved.filter(p => ROR_PROVIDERS[p]);
  const srcProviders = resolved.filter(p => SOURCE_PROVIDERS[p]);
  const rest = resolved.filter(p => !ROR_PROVIDERS[p] && !SOURCE_PROVIDERS[p]);
  const known = new Set(getAvailableProviders());
  const knownRest = rest.filter(p => known.has(p));
  const unknownCount = rest.length - knownRest.length;

  const tasks: Array<Promise<RegistrySearchResult[]>> =
    knownRest.map(p => searchRegistry(p, query, { limit, ...options }).catch(() => []));

  // Batched institution-ROR call — OpenAlex OR filter, results retagged to the
  // institution whose ROR actually appears in the work's authorships.
  if (rorProviders.length > 0) {
    const rorToProvider = new Map(rorProviders.map(p => [ROR_PROVIDERS[p], p]));
    tasks.push(
      searchOpenAlex(query, Math.max(limit, limit * rorProviders.length), {
        filter: `authorships.institutions.ror:${rorProviders.map(p => `https://ror.org/${ROR_PROVIDERS[p]}`).join('|')}`,
      }).then(rs => rs.map((r: any) => {
        const hit = (r.institutions ?? [])
          .map((i: any) => i.rorId)
          .find((id: string | undefined) => id && rorToProvider.has(id));
        return { ...r, provider: hit ? rorToProvider.get(hit)! : 'openalex' };
      })).catch(() => []),
    );
  }

  // Batched journal-source call — same OR pattern on source ids.
  if (srcProviders.length > 0) {
    const srcToProvider = new Map(srcProviders.map(p => [SOURCE_PROVIDERS[p], p]));
    tasks.push(
      searchOpenAlex(query, Math.max(limit, limit * srcProviders.length), {
        filter: `primary_location.source.id:${srcProviders.map(p => `https://openalex.org/${SOURCE_PROVIDERS[p]}`).join('|')}`,
      }).then(rs => rs.map((r: any) => {
        const sid = r.raw?.primary_location?.source?.id?.split('/').pop();
        return { ...r, provider: sid && srcToProvider.has(sid) ? srcToProvider.get(sid)! : 'openalex' };
      })).catch(() => []),
    );
  }

  // Unknown ids share ONE generic OpenAlex call (previously N identical calls).
  if (unknownCount > 0) {
    tasks.push(searchOpenAlex(query, limit).catch(() => [] as RegistrySearchResult[]));
  }

  const results = await Promise.allSettled(tasks);

  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      allResults.push(...r.value);
    }
  }

  return allResults;
}

// Domain-aware provider selection for extended registry
const DOMAIN_EXTENDED_PROVIDERS: Record<string, string[]> = {
  health: ['who', 'nih', 'cdc', 'fda', 'lancet', 'nature', 'pubmed'],
  ai: ['deepmind', 'openai-research', 'google-ai', 'microsoft-research', 'anthropic', 'nvidia-research', 'huggingface'],
  climate: ['ipcc', 'unep', 'iea', 'wri', 'climate-analytics', 'nasa', 'noaa', 'epa'],
  economics: ['mckinsey', 'goldman-sachs', 'jpmorgan', 'blackrock', 'brookings', 'carnegie', 'repec', 'nber'],
  geopolitics: ['chatham-house', 'cfr', 'rand', 'iiss', 'carnegie', 'brookings', 'wilson-center', 'stimson-center'],
  security: ['rand', 'iiss', 'cato-institute', 'heritage-foundation', 'new-america', 'stimson-center'],
  science: ['nature', 'science', 'cell', 'pnas', 'springer', 'elsevier', 'nasa', 'nih'],
  business: ['mckinsey', 'bcg', 'bain', 'deloitte', 'pwc', 'ey', 'kpmg', 'accenture'],
  law: ['brookings', 'rand', 'heritage-foundation', 'oxford', 'cambridge'],
  finance: ['blackrock', 'goldman-sachs', 'jpmorgan', 'morgan-stanley', 'ubs', 'deutsche-bank', 'credit-suisse'],
  technology: ['deepmind', 'openai-research', 'google-ai', 'microsoft-research', 'anthropic', 'nvidia-research', 'github', 'huggingface'],
  environment: ['ipcc', 'unep', 'iucn', 'wri', 'climate-analytics', 'iea', 'greenpeace', 'wwf', 'nasa', 'noaa', 'epa'],
  policy: ['brookings', 'carnegie', 'rand', 'heritage-foundation', 'new-america', 'aspen-institute', 'wilson-center'],
  data: ['figshare', 'zenodo', 'kaggle', 'huggingface', 'dataverse'],
  // New domain-specific academic providers
  psychology: ['psychology', 'pubmed', 'semanticscholar'],
  sociology: ['sociology', 'isidore', 'persee'],
  history: ['history', 'isidore', 'persee'],
  geography: ['geography', 'nasa', 'noaa'],
  chemistry: ['chemistry', 'pubmed', 'openalex'],
  biology: ['biology', 'pubmed', 'openalex'],
  'political-science': ['political-science', 'brookings', 'carnegie', 'rand'],
  education: ['eric', 'isidore'],
  philosophy: ['philpapers', 'isidore'],
  agriculture: ['fao', 'openalex'],
  criminology: ['unodc', 'openalex'],
  'open-science': ['openaire', 'zenodo', 'base', 'core'],
  'computer-science': ['dblp', 'arxiv', 'github', 'huggingface'],
  mathematics: ['zbmath', 'arxiv', 'openalex'],
};

export function getExtendedProvidersForDomain(domain: string): string[] {
  return DOMAIN_EXTENDED_PROVIDERS[domain] || getAvailableProviders().slice(0, 8);
}

export function getProviderType(provider: string): RegistrySearchResult['type'] {
  const academicProviders = ['openalex', 'crossref', 'orcid', 'semantic-scholar', 'core', 'base', 'openaire', 'arxiv', 'pubmed', 'nature', 'science', 'cell', 'lancet', 'pnas', 'springer', 'elsevier', 'wiley', 'taylor-francis', 'sage', 'oxford', 'cambridge', 'isidore', 'persee', 'philpapers', 'eric', 'fao', 'unodc', 'zenodo', 'psychology', 'sociology', 'history', 'geography', 'chemistry', 'biology', 'political-science', 'business', 'dblp', 'zbmath'];
  const businessProviders = ['mckinsey', 'bcg', 'bain', 'deloitte', 'pwc', 'ey', 'kpmg', 'accenture', 'blackrock', 'goldman-sachs', 'jpmorgan', 'morgan-stanley', 'credit-suisse', 'ubs', 'deutsche-bank'];
  const thinkTankProviders = ['brookings', 'carnegie', 'chatham-house', 'rand', 'cfr', 'wilson-center', 'heritage-foundation', 'stimson-center', 'adl', 'cato-institute', 'new-america', 'iiss', 'aspen-institute'];
  const governmentProviders = ['worldbank', 'imf', 'who', 'unep', 'oecd', 'undp', 'nasa', 'nih', 'nsf', 'cdc', 'epa', 'fda', 'noaa'];
  const environmentalProviders = ['ipcc', 'iea', 'wri', 'wwf', 'greenpeace', 'iucn', 'climate-analytics'];
  const technologyProviders = ['anthropic', 'openai-research', 'google-ai', 'microsoft-research', 'deepmind', 'facebook-research', 'nvidia-research', 'ibm-research', 'apple-research', 'github'];
  const dataResearchProviders = ['figshare', 'zenodo', 'kaggle', 'huggingface', 'dataverse', 'researchgate', 'academia-edu', 'mendeley'];
  const patentProviders = ['google-patents', 'uspto', 'epo', 'wipo'];

  if (academicProviders.includes(provider)) return 'academic';
  if (businessProviders.includes(provider)) return 'business';
  if (thinkTankProviders.includes(provider)) return 'think_tank';
  if (governmentProviders.includes(provider)) return 'government';
  if (environmentalProviders.includes(provider)) return 'environmental';
  if (technologyProviders.includes(provider)) return 'technology';
  if (dataResearchProviders.includes(provider)) return 'data_research';
  if (patentProviders.includes(provider)) return 'patent';

  return 'unknown' as const;
}

export default {
  searchRegistry,
  getAvailableProviders,
  getProviderType
};
