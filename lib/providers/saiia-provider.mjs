/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: saiia
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const SAIIAProvider = createOpenAlexProvider(PROVIDER_CONFIGS['saiia']);
