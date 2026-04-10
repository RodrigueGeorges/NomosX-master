// Registry Final Complet - Tous les providers NomosX
// Providers existants (53) + Nouveaux providers (29) = 82 providers totaux

import { PwCResearchProvider } from './pwc-research-provider.mjs';
import { EYResearchProvider } from './ey-research-provider.js';
import { KPMGThoughtLeadershipProvider } from './kpmg-thought-leadership-provider.mjs';
import { BainInsightsProvider } from './bain-insights-provider.js';
import { AccentureResearchProvider } from './accenture-research-provider.js';
import { LancetProvider } from './lancet-provider.mjs';
import { NEJMProvider } from './nejm-provider.mjs';
import { NatureMedicineProvider } from './nature-medicine-provider.mjs';
import { JAMAProvider } from './jama-provider.mjs';
import { DeepMindResearchProvider } from './deepmind-research-provider.js';
import { OpenAIResearchProvider } from './openai-research-provider.mjs';
import { AIIndexProvider } from './ai-index-provider.js';
import { PartnershipAIProvider } from './partnership-ai-provider.mjs';
import { IEAProvider } from './iea-provider.js';
import { IRENAProvider } from './irena-provider.js';
import { RMIProvider } from './rmi-provider.mjs';
import { EnergyFuturesProvider } from './energy-futures-provider.js';
import { NatureProvider } from './nature-provider.mjs';
import { ScienceProvider } from './science-provider.mjs';
import { CellProvider } from './cell-provider.mjs';
import { PNASProvider } from './pnas-provider.mjs';
import { WorldBankResearchProvider } from './worldbank-research-provider.mjs';
import { UNDPResearchProvider } from './undp-research-provider.mjs';
import { CGDProvider } from './cgd-provider.js';
import { ACETProvider } from './acet-provider.js';
import { SAIIAProvider } from './saiia-provider.mjs';
import { AmazonScienceProvider } from './amazon-science-provider.js';
import { MicrosoftResearchProvider } from './microsoft-research-provider.mjs';
import { GoogleAIResearchProvider } from './google-ai-research-provider.js';

export const finalProviders = {
  // Nouveaux providers - Vague 1: Business Elite Complément
    'pwc-research-institute': new PwCResearchProvider(),
    'ey-research': new EYResearchProvider(),
    'kpmg-thought-leadership': new KPMGThoughtLeadershipProvider(),
    'bain---company-insights': new BainInsightsProvider(),
    'accenture-research': new AccentureResearchProvider(),
  
  // Nouveaux providers - Vague 2: Recherche Médicale Avancée
    'the-lancet': new LancetProvider(),
    'new-england-journal-of-medicine': new NEJMProvider(),
    'nature-medicine': new NatureMedicineProvider(),
    'jama---journal-of-american-medical-association': new JAMAProvider(),
  
  // Nouveaux providers - Vague 3: Intelligence Artificielle Spécialisée
    'deepmind-research': new DeepMindResearchProvider(),
    'openai-research': new OpenAIResearchProvider(),
    'ai-index---stanford-hai': new AIIndexProvider(),
    'partnership-on-ai': new PartnershipAIProvider(),
  
  // Nouveaux providers - Vague 4: Énergie Transition
    'iea---international-energy-agency': new IEAProvider(),
    'irena---international-renewable-energy-agency': new IRENAProvider(),
    'rmi---rocky-mountain-institute': new RMIProvider(),
    'energy-futures-initiative': new EnergyFuturesProvider(),
  
  // Nouveaux providers - Vague 5: Science Fondamentale
    'nature': new NatureProvider(),
    'science': new ScienceProvider(),
    'cell': new CellProvider(),
    'pnas---proceedings-of-national-academy-of-sciences': new PNASProvider(),
  
  // Nouveaux providers - Vague 6: Développement International
    'world-bank-research---development': new WorldBankResearchProvider(),
    'undp-research': new UNDPResearchProvider(),
    'center-for-global-development': new CGDProvider(),
  
  // Nouveaux providers - Vague 7: Think Tanks Afrique
    'acet---african-center-for-economic-transformation': new ACETProvider(),
    'saiia---south-african-institute-of-international-affairs': new SAIIAProvider(),
  
  // Nouveaux providers - Vague 8: E-commerce Digital
    'amazon-science': new AmazonScienceProvider(),
    'microsoft-research': new MicrosoftResearchProvider(),
    'google-ai-research': new GoogleAIResearchProvider()
};

export default finalProviders;
