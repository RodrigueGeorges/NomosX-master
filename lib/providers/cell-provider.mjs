/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: cell
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const CellProvider = createOpenAlexProvider(PROVIDER_CONFIGS['cell']);
