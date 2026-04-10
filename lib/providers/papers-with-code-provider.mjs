/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: papers-with-code
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const PapersWithCodeProvider = createOpenAlexProvider(PROVIDER_CONFIGS['papers-with-code']);
