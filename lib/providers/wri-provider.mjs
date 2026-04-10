/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: wri
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const WRIProvider = createOpenAlexProvider(PROVIDER_CONFIGS['wri']);
