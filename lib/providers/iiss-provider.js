/**
 * IISS - International Institute for Strategic Studies Provider
 * Type: Security Think Tank
 * Region: UK
 * API: OpenAlex (ROR: https://ror.org/01rv76s48)
 */

import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';

export const IISSProvider = createOpenAlexProvider(PROVIDER_CONFIGS['iiss']);
