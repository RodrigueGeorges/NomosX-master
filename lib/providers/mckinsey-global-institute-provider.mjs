/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: mckinsey
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const McKinseyGlobalInstituteProvider = createOpenAlexProvider(PROVIDER_CONFIGS['mckinsey']);
