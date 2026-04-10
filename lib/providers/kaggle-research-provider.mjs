/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: kaggle-research
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const KaggleResearchProvider = createOpenAlexProvider(PROVIDER_CONFIGS['kaggle-research']);
