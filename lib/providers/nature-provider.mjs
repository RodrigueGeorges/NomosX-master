/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: nature
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const NatureProvider = createOpenAlexProvider(PROVIDER_CONFIGS['nature']);
