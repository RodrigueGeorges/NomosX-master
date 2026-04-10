/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: rmi
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const RMIProvider = createOpenAlexProvider(PROVIDER_CONFIGS['rmi']);
