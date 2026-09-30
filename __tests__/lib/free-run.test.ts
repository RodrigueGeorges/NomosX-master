/**
 * NOMOSX_FREE_RUN — zero-cost rehearsal mode.
 *
 * Proves that when the flag is set:
 *  - paid scout providers are filtered out
 *  - every callLLM call routes to the freepool cascade, even when a paid
 *    provider is requested explicitly
 *  - no free-tier key → hard failure BEFORE any paid call is attempted
 *  - embeddings are skipped (no OpenAI/Cohere spend)
 */

const COMPLETIONS = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((cfg: { apiKey: string; baseURL?: string }) => ({
    __cfg: cfg,
    chat: { completions: { create: COMPLETIONS } },
  })),
}));

jest.mock('@/lib/db', () => ({ prisma: {} }));
jest.mock('@/lib/cache/redis-cache', () => ({
  getCachedLLMResponse: jest.fn(async () => null),
  cacheLLMResponse: jest.fn(async () => undefined),
}));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

const ALL_KEYS = [
  'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'NVIDIA_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MOONSHOT_API_KEY', 'DEEPSEEK_API_KEY', 'GLM_API_KEY', 'GOOGLE_API_KEY',
  'NOMOSX_FREE_RUN',
];
const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => { for (const k of ALL_KEYS) savedEnv[k] = process.env[k]; });
afterAll(() => { for (const k of ALL_KEYS) {
  if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
} });

beforeEach(() => {
  COMPLETIONS.mockReset();
  for (const k of ALL_KEYS) delete process.env[k];
});

function loadLLM() {
  jest.resetModules();
  return require('@/lib/llm/unified-llm') as typeof import('@/lib/llm/unified-llm');
}

describe('free-run flag', () => {
  test('isFreeRun toggles on env', () => {
    const { isFreeRun } = require('@/lib/free-run') as typeof import('@/lib/free-run');
    expect(isFreeRun()).toBe(false);
    process.env.NOMOSX_FREE_RUN = '1';
    expect(isFreeRun()).toBe(true);
    process.env.NOMOSX_FREE_RUN = 'true';
    expect(isFreeRun()).toBe(true);
    process.env.NOMOSX_FREE_RUN = '0';
    expect(isFreeRun()).toBe(false);
  });

  test('filterFreeRunProviders drops metered providers, keeps free endpoints', () => {
    const { filterFreeRunProviders } = require('@/lib/free-run') as typeof import('@/lib/free-run');
    const input = ['openalex', 'tavily', 'crossref', 'exa', 'linkup', 'gdelt-news', 'overton', 'arxiv', 'dimensions'];
    const out = filterFreeRunProviders(input);
    expect(out).toEqual(['openalex', 'crossref', 'gdelt-news', 'arxiv']);
  });
});

describe('free-run LLM routing', () => {
  test('an explicitly-paid request is served by a free endpoint at $0', async () => {
    process.env.NOMOSX_FREE_RUN = '1';
    process.env.OPENAI_API_KEY = 'sk-paid-real-key-abcdefghij';
    process.env.GROQ_API_KEY = 'gsk-free-test-key';
    COMPLETIONS.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const { callLLM } = loadLLM();
    const res = await callLLM({
      provider: 'openai' as any,
      messages: [{ role: 'user', content: 'hi' }],
      task: 'query_enhancement' as any,
    });

    expect(res.provider).toBe('freepool');
    expect(res.costUsd).toBe(0);
    expect(COMPLETIONS).toHaveBeenCalledTimes(1);
    const [req] = COMPLETIONS.mock.calls[0];
    expect(req.model).toContain('gpt-oss'); // groq free model, not gpt-*
  });

  test('no free key configured → throws before touching a paid provider', async () => {
    process.env.NOMOSX_FREE_RUN = '1';
    process.env.OPENAI_API_KEY = 'sk-paid-real-key-abcdefghij';
    const { callLLM } = loadLLM();

    await expect(callLLM({
      provider: 'openai' as any,
      messages: [{ role: 'user', content: 'hi' }],
      task: 'query_enhancement' as any,
    })).rejects.toThrow(/FREE_RUN/);
    expect(COMPLETIONS).not.toHaveBeenCalled();
  });
});

describe('free-run embeddings', () => {
  test('embedBatchDetailed returns zero vectors without calling any API', async () => {
    process.env.NOMOSX_FREE_RUN = '1';
    process.env.OPENAI_API_KEY = 'sk-paid-real-key-abcdefghij';
    process.env.COHERE_API_KEY = 'cohere-paid-key-abcdefghij';
    const fetchSpy = jest.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchSpy;
    try {
      jest.resetModules();
      const se = require('@/lib/agent/semantic-engine') as typeof import('@/lib/agent/semantic-engine');
      const res = await se.embedBatchDetailed(['hello', 'world']);
      expect(res.model).toBe('none');
      expect(res.embeddings).toHaveLength(2);
      expect(res.embeddings[0].every(v => v === 0)).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(COMPLETIONS).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
