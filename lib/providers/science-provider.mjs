/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: science-mag
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const ScienceProvider = createOpenAlexProvider(PROVIDER_CONFIGS['science-mag']);
