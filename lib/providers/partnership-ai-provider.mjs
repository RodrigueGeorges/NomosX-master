/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: partnership-ai
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const PartnershipAIProvider = createOpenAlexProvider(PROVIDER_CONFIGS['partnership-ai']);
