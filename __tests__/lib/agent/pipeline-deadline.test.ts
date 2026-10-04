import { runPipeline } from '@/lib/agent/pipeline-v2';
import { runPipelineInit } from '@/lib/agent/pipeline-steps/pipeline-init';
import { getExecutionSignal } from '@/lib/worker/execution-scope';
import { prisma } from '@/lib/db';

jest.mock('@/lib/agent/pipeline-steps/pipeline-init', () => ({ runPipelineInit: jest.fn() }));
jest.mock('@/lib/db', () => ({ prisma: { pipelineRun: { findFirst: jest.fn(async () => null) } } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('aborts the actual pipeline execution and scopes timeout cleanup to its own id', async () => {
  let signal: AbortSignal | undefined;
  jest.mocked(runPipelineInit).mockImplementation(() => {
    signal = getExecutionSignal();
    return new Promise(() => {});
  });
  const pending = runPipeline('A sufficiently detailed research question?', 'brief', { timeoutMs: 20, executionId: 'attempt-123' });
  const assertion = expect(pending).rejects.toThrow('timed out');
  await jest.advanceTimersByTimeAsync(21);
  await assertion;
  expect(signal?.aborted).toBe(true);
  expect(prisma.pipelineRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'attempt-123', status: 'RUNNING' } }));
  expect(jest.getTimerCount()).toBe(0);
});
