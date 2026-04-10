/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: worldbank-research
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const WorldBankResearchProvider = createOpenAlexProvider(PROVIDER_CONFIGS['worldbank-research']);
