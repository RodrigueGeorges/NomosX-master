/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: vanguard
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const VanguardProvider = createOpenAlexProvider(PROVIDER_CONFIGS['vanguard']);
