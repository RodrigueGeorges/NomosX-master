/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: jama
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const JAMAProvider = createOpenAlexProvider(PROVIDER_CONFIGS['jama']);
