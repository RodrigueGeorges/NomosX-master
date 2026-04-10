/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: microsoft-research
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const MicrosoftResearchProvider = createOpenAlexProvider(PROVIDER_CONFIGS['microsoft-research']);
