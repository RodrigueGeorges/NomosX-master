/**
 * Real provider backed by OpenAlex API (250M+ works)
 * Config key: lawzero (Legal Tech — uses Law concept filter)
 */
import { createOpenAlexProvider, PROVIDER_CONFIGS } from './openalex-provider-factory.js';

// LawZero doesn't exist in OpenAlex — use Law concept as proxy
const lawConfig = {
  name: 'LawZero', providerKey: 'lawzero', type: 'Legal Tech', region: 'France',
  apiUrl: 'https://lawzero.fr', specialties: ['legal-tech', 'ai-law', 'digital-rights'],
  conceptId: 'https://openalex.org/C138885662', // Law concept
};

export const LawZeroProvider = createOpenAlexProvider(lawConfig);
