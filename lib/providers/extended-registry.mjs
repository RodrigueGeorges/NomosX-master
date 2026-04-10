// Registry étendu avec tous les providers
import { LawZeroProvider } from './lawzero-provider.mjs';
import { AstResProvider } from './ast-res-provider.js';
import { BerlinPolicyHubProvider } from './berlin-policy-hub-provider.js';
import { CopenhagenInstituteProvider } from './copenhagen-institute-provider.js';
import { IdeaFactoryProvider } from './idea-factory-provider.js';

// Nouveaux providers Business Elite
import { McKinseyGlobalInstituteProvider } from './mckinsey-global-institute-provider.mjs';
import { BCGHendersonInstituteProvider } from './bcg-henderson-institute-provider.js';
import { DeloitteInsightsProvider } from './deloitte-insights-provider.js';

// Policy US
import { BrookingsInstitutionProvider } from './brookings-institution-provider.js';
import { CarnegieEndowmentProvider } from './carnegie-endowment-provider.js';
import { CouncilForeignRelationsProvider } from './council-foreign-relations-provider.js';

// Think Tanks Asie
import { IISSProvider } from './iiss-provider.js';
import { RSISProvider } from './rsis-provider.mjs';
import { CISProvider } from './cis-provider.js';

// Climate Research
import { IPCCProvider } from './ipcc-provider.js';
import { ClimateAnalyticsProvider } from './climate-analytics-provider.js';
import { WRIProvider } from './wri-provider.mjs';

// Data Science
import { PapersWithCodeProvider } from './papers-with-code-provider.mjs';
import { KaggleResearchProvider } from './kaggle-research-provider.mjs';
import { ArXivCSProvider } from './arxiv-cs-provider.js';

// Santé Publique
import { WHOProvider } from './who-provider.mjs';
import { JohnsHopkinsProvider } from './johns-hopkins-provider.js';
import { HarvardChanProvider } from './harvard-chan-provider.js';

// Finance
import { BlackRockProvider } from './blackrock-provider.js';
import { BISProvider } from './bis-provider.js';
import { VanguardProvider } from './vanguard-provider.mjs';

// Géopolitique
import { ChathamHouseProvider } from './chatham-house-provider.js';
import { RANDProvider } from './rand-provider.mjs';
import { CSISProvider } from './csis-provider.js';

// Think Tank Europe
import { BruegelProvider } from './bruegel-provider.js';
import { CEPRProvider } from './cepr-provider.js';
import { DGAPProvider } from './dgap-provider.js';

export const providers = {
  // Innovants existants
  'lawzero': new LawZeroProvider(),
  'asteres': new AstResProvider(),
  'berlin-policy-hub': new BerlinPolicyHubProvider(),
  'copenhagen-institute': new CopenhagenInstituteProvider(),
  'idea-factory': new IdeaFactoryProvider(),
  
  // Business Elite
  'mckinsey': new McKinseyGlobalInstituteProvider(),
  'bcg': new BCGHendersonInstituteProvider(),
  'deloitte': new DeloitteInsightsProvider(),
  
  // Policy US
  'brookings': new BrookingsInstitutionProvider(),
  'carnegie': new CarnegieEndowmentProvider(),
  'cfr': new CouncilForeignRelationsProvider(),
  
  // Think Tanks Asie
  'iiss': new IISSProvider(),
  'rsis': new RSISProvider(),
  'cis': new CISProvider(),
  
  // Climate Research
  'ipcc': new IPCCProvider(),
  'climate-analytics': new ClimateAnalyticsProvider(),
  'wri': new WRIProvider(),
  
  // Data Science
  'papers-with-code': new PapersWithCodeProvider(),
  'kaggle': new KaggleResearchProvider(),
  'arxiv-cs': new ArXivCSProvider(),
  
  // Santé Publique
  'who': new WHOProvider(),
  'johns-hopkins': new JohnsHopkinsProvider(),
  'harvard-chan': new HarvardChanProvider(),
  
  // Finance
  'blackrock': new BlackRockProvider(),
  'bis': new BISProvider(),
  'vanguard': new VanguardProvider(),
  
  // Géopolitique
  'chatham-house': new ChathamHouseProvider(),
  'rand': new RANDProvider(),
  'csis': new CSISProvider(),
  
  // Think Tank Europe
  'bruegel': new BruegelProvider(),
  'cepr': new CEPRProvider(),
  'dgap': new DGAPProvider()
};

export default providers;
