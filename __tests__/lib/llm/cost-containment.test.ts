const completions = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: completions } } })),
}));
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('@/lib/env', () => ({ env: { OPENAI_API_KEY: 'test', GLM_API_KEY: 'test' } }));
jest.mock('@/lib/cache/redis-cache', () => ({
  getCachedLLMResponse: jest.fn(async () => null), cacheLLMResponse: jest.fn(async () => undefined),
}));
jest.mock('@/lib/agent/redis-simple', () => ({ simpleRedisManager: { isRedisConnected: () => false } }));
jest.mock('@/lib/agent/langfuse', () => ({ traceLLMCall: jest.fn() }));
jest.mock('@/lib/agent/radar-innovations', () => ({ filterByCapability: (providers: string[]) => providers }));

import { callLLM } from '@/lib/llm/unified-llm';
import { withExecutionSignal } from '@/lib/worker/execution-scope';

beforeEach(() => {
  completions.mockReset();
  completions.mockResolvedValue({
    choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1000, completion_tokens: 100 },
  });
});

const messages = [{ role: 'user' as const, content: 'Offline test' }];

test('exceeding a per-call cost cap must not buy a second provider response', async () => {
  await expect(callLLM({ provider: 'openai', task: 'query_enhancement', messages, maxCostUsd: 1e-9, enableCache: false })).rejects.toThrow(/cost cap/);
  expect(completions).toHaveBeenCalledTimes(1);
});

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('invalid cost cap %s refuses provider work', async (maxCostUsd) => {
  await expect(callLLM({ provider: 'openai', messages, maxCostUsd, enableCache: false })).rejects.toThrow();
  expect(completions).not.toHaveBeenCalled();
});

test('parent cancellation reaches the SDK and does not cascade to another provider', async () => {
  const controller = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  completions.mockImplementation((_request, { signal }: { signal: AbortSignal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    started();
  }));
  const work = withExecutionSignal(controller.signal, () => callLLM({ provider: 'openai', messages, enableCache: false }));
  const failed = expect(work).rejects.toThrow('lease lost');
  await ready;
  controller.abort(new Error('lease lost'));
  await failed;
  expect(completions).toHaveBeenCalledTimes(1);
  expect(completions.mock.calls[0][1].signal.aborted).toBe(true);
});

test('different requested providers never coalesce into a shared answer', async () => {
  await Promise.all([
    callLLM({ provider: 'openai', task: 'query_enhancement', messages }),
    callLLM({ provider: 'glm', task: 'query_enhancement', messages }),
  ]);
  expect(completions).toHaveBeenCalledTimes(2);
});
