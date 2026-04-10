/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: nature-medicine
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const NatureMedicineProvider = createOpenAlexProvider(PROVIDER_CONFIGS['nature-medicine']);
