/**
 * CSIS - Center for Strategic & International Studies Provider
 * Type: Géopolitique | Region: US
 * API: OpenAlex (ROR: https://ror.org/01vx35703)
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const CSISProvider = createOpenAlexProvider(PROVIDER_CONFIGS['csis']);
