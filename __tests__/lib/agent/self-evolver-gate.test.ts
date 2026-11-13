/**
 * self-evolver prompt gate — evolved prompts are opt-in
 * (NOMOSX_SELF_EVOLVED_PROMPTS=1); default serves the reviewed fallback.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    agentAuditLog: { findMany: jest.fn(async () => []) },
  },
}));

import { getLatestPrompt } from '@/lib/agent/self-evolver';

const FALLBACK = 'reviewed original prompt';

describe('getLatestPrompt — evolved prompt gate', () => {
  const env = process.env;
  beforeEach(() => { process.env = { ...env }; delete process.env.NOMOSX_SELF_EVOLVED_PROMPTS; });
  afterAll(() => { process.env = env; });

  it('returns the fallback when the flag is unset — never serves unproven prompts', async () => {
    await expect(getLatestPrompt('editorial_arbiter', FALLBACK)).resolves.toBe(FALLBACK);
  });

  it('returns the fallback when the flag is anything but "1"', async () => {
    process.env.NOMOSX_SELF_EVOLVED_PROMPTS = 'true';
    await expect(getLatestPrompt('local_judge', FALLBACK)).resolves.toBe(FALLBACK);
  });

  it('consults the DB only when explicitly enabled (empty DB → fallback)', async () => {
    process.env.NOMOSX_SELF_EVOLVED_PROMPTS = '1';
    await expect(getLatestPrompt('editorial_arbiter', FALLBACK)).resolves.toBe(FALLBACK);
  });
});
