/**
 * Institutional Providers Index
 * Centralized exports for all institutional data sources
 */

// INTELLIGENCE
export { searchODNI } from './intelligence/odni';
export { searchCIAFOIA } from './intelligence/cia-foia';
export { searchNSA } from './intelligence/nsa';
export { searchUKJIC } from './intelligence/uk-jic';

// DEFENSE
export { searchNATO } from './defense/nato';
export { searchEEAS } from './defense/eeas';
export { searchSGDSN } from './defense/sgdsn';
export { searchEDA } from './defense/eda';

// ECONOMIC
export { searchIMF } from './economic/imf';
export { searchWorldBank } from './economic/worldbank';
export { searchOECD } from './economic/oecd';
export { searchBIS } from './economic/bis';

// CYBER & RISK
export { searchNIST } from './cyber/nist';
export { searchCISA } from './cyber/cisa';
export { searchENISA } from './cyber/enisa';

// MULTILATERAL
export { searchUN } from './multilateral/un';
export { searchUNDP } from './multilateral/undp';
export { searchUNCTAD } from './multilateral/unctad';

// ARCHIVES
export { searchNARA } from './archives/nara';
export { searchUKArchives } from './archives/uk-archives';
export { searchArchivesNationalesFR } from './archives/archives-nationales-fr';

// ENERGY & NUCLEAR
export { searchIAEA } from './energy/iaea';
export { searchIRENA } from './energy/irena';
export { searchCEA } from './french/cea';
export { searchENTSOE } from './energy/entsoe';
export { searchJRC } from './energy/jrc';
export { searchIEA } from './energy/iea';
export { searchACER } from './energy/acer';
export { searchENTSOG } from './energy/entsog';
export { searchEnergyCharts } from './energy/energy-charts';
export { searchSMARD } from './energy/smard';
export { searchRTEFrance } from './energy/rte-france';
export { searchEnergiDataService } from './energy/energi-data';
export { searchFingrid } from './energy/fingrid';

// ENVIRONMENTAL
export { searchEEA } from './environmental/eea';

// THINK TANKS
export { searchBruegel } from './think_tanks/bruegel';

// ACADEMIC — INDEPENDENT APIs
export { searchOpenReview } from './academic/openreview';
export { searchBioRxiv } from './academic/biorxiv';
export { searchPapersWithCode } from './academic/papers-with-code';
export { searchMITDSpace } from './academic/mit-dspace';
export { searchHarvardDASH } from './academic/harvard-dash';
export { searchMaxPlanckPuRe } from './academic/max-planck-pure';

// ECONOMICS — EXTENDED
export { searchECB } from './economics/ecb';
export { searchEurostat } from './economics/eurostat';
export { searchFRED } from './economics/fred';
export { searchEIB } from './economics/eib';
export { searchNBER as searchNBERInstitutional } from './economics/nber';

// HEALTH — EXTENDED
export { searchEMA } from './health/ema';
export { searchINSERM } from './health/inserm';
export { searchECDC } from './health/ecdc';
export { searchCochrane } from './health/cochrane';
export { searchClinicalTrials } from './health/clinical-trials';

// GOVERNMENT — OPEN DATA
export { searchISTAT } from './government/istat';
export { searchOpenPrimitive } from './government/open-primitive';
export { searchTreasuryFiscal } from './government/treasury-fiscal';

// ENVIRONMENT
export { searchINRAE } from './french/inrae';
export { searchADEME } from './french/ademe';

// FRENCH INSTITUTIONS
export { searchENS } from './french/ens';
export { searchINSEE } from './french/insee';
export { searchShiftProject } from './french/shift-project';
export { searchDataGouv } from './french/data-gouv';
export { searchFranceStrategie } from './french/france-strategie';
export { searchCNRS } from './french/cnrs';

// TECHNOLOGY — RESEARCH INSTITUTES
export { searchAllenAI } from './tech/allen-ai';
export { searchMaxPlanck } from './tech/max-planck';
export { searchETHZurich } from './tech/eth-zurich';
export { searchINRIA } from './tech/inria';

// LAW & GOVERNANCE
export { searchEURLex } from './law/eur-lex';

// EUROPEAN THINK TANKS
export { searchECFR } from './think-tanks/ecfr';
export { searchSWP } from './think-tanks/swp';
export { searchSIPRI } from './think-tanks/sipri';
export { searchIAI } from './think-tanks/iai';

// FRENCH POLICY & LAW
export { searchIDDRI } from './french/iddri';
export { searchTerraNova } from './french/terra-nova';
export { searchLegifrance } from './french/legifrance';
export { searchViePublique } from './french/vie-publique';

// HEALTH — EXTENDED V2
export { searchCDC } from './health/cdc';
export { searchNIH } from './health/nih';
export { searchWHODirect } from './health/who-direct';

// ECONOMICS — EXTENDED V2
export { searchOECDDirect } from './economic/oecd-direct';
