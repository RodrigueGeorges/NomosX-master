/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: who
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const WHOProvider = createOpenAlexProvider(PROVIDER_CONFIGS['who']);
