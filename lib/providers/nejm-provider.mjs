/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: nejm
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const NEJMProvider = createOpenAlexProvider(PROVIDER_CONFIGS['nejm']);
