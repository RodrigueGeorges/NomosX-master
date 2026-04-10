/**
 * Chatham House Provider
 * Type: Géopolitique | Region: UK
 * API: OpenAlex (ROR: https://ror.org/02jx3x895)
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';
export const ChathamHouseProvider = createOpenAlexProvider(PROVIDER_CONFIGS['chatham-house']);
