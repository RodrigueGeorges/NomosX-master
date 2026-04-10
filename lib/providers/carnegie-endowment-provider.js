/**
 * Carnegie Endowment for International Peace Provider
 * Type: Géopolitique | Region: Global
 * API: OpenAlex (ROR: https://ror.org/04jhe1c18)
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const CarnegieEndowmentProvider = createOpenAlexProvider(PROVIDER_CONFIGS['carnegie']);
