/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: rand
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const RANDProvider = createOpenAlexProvider(PROVIDER_CONFIGS['rand']);
