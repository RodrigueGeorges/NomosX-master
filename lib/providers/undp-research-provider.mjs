/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: undp-research
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const UNDPResearchProvider = createOpenAlexProvider(PROVIDER_CONFIGS['undp-research']);
