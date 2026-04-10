/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: kpmg
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const KPMGThoughtLeadershipProvider = createOpenAlexProvider(PROVIDER_CONFIGS['kpmg']);
