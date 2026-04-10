/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: rsis
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const RSISProvider = createOpenAlexProvider(PROVIDER_CONFIGS['rsis']);
