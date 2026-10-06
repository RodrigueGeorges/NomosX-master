import { checkBudgetGate, getBudgetStatus, recordSpend } from '@/lib/agent/budget-manager';
import { prisma } from '@/lib/db';

jest.mock('@/lib/db', () => ({ prisma: { systemMetric: { findMany: jest.fn(), create: jest.fn() } } }));

test('a failed spend write is observable to the dispatcher', async () => {
  jest.mocked(prisma.systemMetric.create).mockRejectedValue(new Error('ledger write unavailable'));
  await expect(recordSpend(0.4, 'pipeline', 'run-1')).rejects.toThrow('ledger write unavailable');
});

test.each([NaN, Infinity, -1])('rejects invalid spend %s before writing', async cost => {
  await expect(recordSpend(cost, 'pipeline', 'run-1')).rejects.toThrow('Invalid spend');
  expect(prisma.systemMetric.create).not.toHaveBeenCalled();
});

beforeEach(() => jest.resetAllMocks());

test('budget read failure cannot be reported as zero spend', async () => {
  jest.mocked(prisma.systemMetric.findMany).mockRejectedValue(new Error('database unavailable'));
  await expect(getBudgetStatus()).rejects.toThrow('database unavailable');
  await expect(checkBudgetGate()).resolves.toBe('stop');
});

test('known empty ledger permits work', async () => {
  jest.mocked(prisma.systemMetric.findMany).mockResolvedValue([]);
  await expect(checkBudgetGate()).resolves.toBe('proceed');
});

test('known daily spend at the cap stops work', async () => {
  jest.mocked(prisma.systemMetric.findMany).mockResolvedValue([
    { metricValue: 100000, dimensions: { provider: 'test', runId: 'run' } },
  ] as never);
  await expect(checkBudgetGate()).resolves.toBe('stop');
});
