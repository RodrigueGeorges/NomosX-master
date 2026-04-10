/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: openai-research
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const OpenAIResearchProvider = createOpenAlexProvider(PROVIDER_CONFIGS['openai-research']);
