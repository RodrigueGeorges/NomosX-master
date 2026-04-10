/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: lancet
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const LancetProvider = createOpenAlexProvider(PROVIDER_CONFIGS['lancet']);
