/**
 * Council on Foreign Relations Provider
 * Type: Géopolitique | Region: US
 * API: OpenAlex (ROR: https://ror.org/013meh722)
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const CouncilForeignRelationsProvider = createOpenAlexProvider(PROVIDER_CONFIGS['cfr']);
