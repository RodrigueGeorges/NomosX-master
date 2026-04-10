/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: pnas
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const PNASProvider = createOpenAlexProvider(PROVIDER_CONFIGS['pnas']);
