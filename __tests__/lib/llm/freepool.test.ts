/**
 * Freepool — free-tier last-resort LLM safety net
 *
 * Verifies:
 *  - dormant when no free-tier key is configured
 *  - activated by any single free key
 *  - cascades endpoints in priority order (groq first)
 *  - skips endpoints whose free-tier context can't hold the prompt
 *  - reports $0 cost and the resolved endpoint in the model field
 */

const COMPLETIONS = jest.fn();

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((cfg: { apiKey: string; baseURL?: string }) => ({
      __cfg: cfg,
      chat: { completions: { create: COMPLETIONS } },
    })),
  };
});

const FREE_KEYS = [
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "NVIDIA_API_KEY",
  "OPENROUTER_API_KEY",
  "MISTRAL_API_KEY",
];

// Paid providers must be neutralized — the fallback chain would otherwise try
// their REAL clients (keys come from .env) and hit the network.
const PAID_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "MOONSHOT_API_KEY",
  "DEEPSEEK_API_KEY",
  "GLM_API_KEY",
  "GOOGLE_API_KEY",
];

const savedEnv: Record<string, string | undefined> = {};

function loadModule(env: Record<string, string>) {
  jest.resetModules();
  for (const k of [...FREE_KEYS, ...PAID_KEYS]) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env);
  return require("@/lib/llm/unified-llm") as typeof import("@/lib/llm/unified-llm");
}

describe("freepool safety net", () => {
  beforeEach(() => {
    COMPLETIONS.mockReset();
  });

  afterAll(() => {
    for (const k of FREE_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v !== undefined) process.env[k] = v;
    }
  });

  it("stays dormant when no free key is configured", () => {
    const llm = loadModule({});
    expect(llm.getAvailableProviders()).not.toContain("freepool");
  });

  it("activates on any single free key", () => {
    const llm = loadModule({ GROQ_API_KEY: "gsk_test" });
    expect(llm.getAvailableProviders()).toContain("freepool");
  });

  it("cascades groq → cerebras and returns $0 cost", async () => {
    const llm = loadModule({ GROQ_API_KEY: "gsk_test", CEREBRAS_API_KEY: "cb_test" });
    COMPLETIONS.mockResolvedValue({
      choices: [{ message: { content: "hello from freepool" } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    });

    const res = await llm.callLLM({
      provider: "freepool",
      task: "query_enhancement",
      messages: [{ role: "user", content: "hi" }],
      enableCache: false,
    });

    expect(res.provider).toBe("freepool");
    expect(res.family).toBe("freepool");
    expect(res.costUsd).toBe(0);
    expect(res.content).toBe("hello from freepool");
    // Fast task → groq's fast model first
    expect(COMPLETIONS).toHaveBeenCalledTimes(1);
    expect(COMPLETIONS.mock.calls[0][0].model).toBe("llama-3.1-8b-instant");
  });

  it("falls through to the next endpoint on failure", async () => {
    const llm = loadModule({ GROQ_API_KEY: "gsk_test", CEREBRAS_API_KEY: "cb_test" });
    COMPLETIONS
      .mockRejectedValueOnce(new Error("groq 429"))
      .mockResolvedValueOnce({
        choices: [{ message: { content: "cerebras answer" } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      });

    const res = await llm.callLLM({
      provider: "freepool",
      task: "analyst_brief",
      messages: [{ role: "user", content: "analyse" }],
      enableCache: false,
    });

    expect(res.content).toBe("cerebras answer");
    expect(res.model).toContain("cerebras");
    expect(COMPLETIONS).toHaveBeenCalledTimes(2);
  });

  it("skips endpoints whose free-tier context is too small", async () => {
    const llm = loadModule({ CEREBRAS_API_KEY: "cb_test", NVIDIA_API_KEY: "nv_test" });
    COMPLETIONS.mockResolvedValue({
      choices: [{ message: { content: "big context answer" } }],
      usage: { prompt_tokens: 20_000, completion_tokens: 10 },
    });

    // ~40K chars ≈ 10K tokens > cerebras' 8K free-tier ceiling
    const bigPrompt = "x".repeat(40_000);
    const res = await llm.callLLM({
      provider: "freepool",
      task: "analyst_brief",
      messages: [{ role: "user", content: bigPrompt }],
      enableCache: false,
    });

    expect(res.model).toContain("nvidia");
    expect(COMPLETIONS).toHaveBeenCalledTimes(1);
  });

  it("throws when every endpoint fails", async () => {
    const llm = loadModule({ GROQ_API_KEY: "gsk_test" });
    COMPLETIONS.mockRejectedValue(new Error("dead"));

    await expect(
      llm.callLLM({
        provider: "freepool",
        task: "query_enhancement",
        messages: [{ role: "user", content: "hi" }],
        enableCache: false,
      }),
    ).rejects.toThrow();
  });
});
