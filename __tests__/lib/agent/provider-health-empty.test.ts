/**
 * Provider health tracker — empty-result shedding.
 * Providers that swallow HTTP errors resolve [] and never trip the failure
 * blacklist; the empty-streak shed stops them being re-probed forever.
 */

jest.mock('../../../lib/db', () => ({ prisma: {} }));
jest.mock('../../../lib/redis', () => ({
  cacheHelpers: { get: jest.fn(async () => null), set: jest.fn(async () => {}) },
}));

import {
  recordProviderCall,
  isProviderHealthy,
  isProviderEmptyDegraded,
  getHealthyProviders,
  resetProvider,
} from '../../../lib/agent/provider-health-tracker';

const LIMIT = Number(process.env.PROVIDER_EMPTY_STREAK_LIMIT ?? 8);

function emptyCall(provider: string) {
  recordProviderCall({ provider, success: true, responseMs: 5, resultCount: 0 });
}
function hitCall(provider: string) {
  recordProviderCall({ provider, success: true, responseMs: 5, resultCount: 3 });
}

describe('provider-health-tracker empty-result shedding', () => {
  it('sheds a provider after the consecutive-empty limit', () => {
    const p = `shed-${Date.now()}`;
    for (let i = 0; i < LIMIT; i++) emptyCall(p);
    expect(isProviderEmptyDegraded(p)).toBe(true);
    expect(getHealthyProviders([p])).toEqual([]);
    expect(isProviderHealthy(p)).toBe(true); // still "healthy" — shed is separate
  });

  it('resets the streak on any non-empty result', () => {
    const p = `reset-${Date.now()}`;
    for (let i = 0; i < LIMIT - 1; i++) emptyCall(p);
    hitCall(p);
    for (let i = 0; i < LIMIT - 1; i++) emptyCall(p);
    expect(isProviderEmptyDegraded(p)).toBe(false);
  });

  it('does not shed on failures (blacklist path owns those)', () => {
    const p = `fail-${Date.now()}`;
    for (let i = 0; i < LIMIT + 2; i++) {
      recordProviderCall({ provider: p, success: false, responseMs: 5, error: 'boom' });
    }
    expect(isProviderEmptyDegraded(p)).toBe(false);
    expect(isProviderHealthy(p)).toBe(false); // blacklisted instead
  });

  it('ignores success calls without resultCount', () => {
    const p = `unknown-${Date.now()}`;
    for (let i = 0; i < LIMIT + 2; i++) {
      recordProviderCall({ provider: p, success: true, responseMs: 5 });
    }
    expect(isProviderEmptyDegraded(p)).toBe(false);
  });

  it('resetProvider clears the streak', () => {
    const p = `manual-${Date.now()}`;
    for (let i = 0; i < LIMIT; i++) emptyCall(p);
    expect(isProviderEmptyDegraded(p)).toBe(true);
    resetProvider(p);
    expect(isProviderEmptyDegraded(p)).toBe(false);
  });
});
