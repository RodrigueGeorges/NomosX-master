/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: pwc
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const PwCResearchProvider = createOpenAlexProvider(PROVIDER_CONFIGS['pwc']);
