/**
 * Unified LLM Service Tests
 */

import { callLLM, getAvailableProviders } from "@/lib/llm/unified-llm";

describe("Unified LLM Service", () => {
  describe("callLLM", () => {
    it("should call OpenAI successfully", async () => {
      const response = await callLLM({
        messages: [
          { role: "user", content: "Say hello in one word" },
        ],
        temperature: 0,
        maxTokens: 10,
        enableCache: false, // Disable cache for test
      });

      expect(response).toMatchObject({
        provider: "openai",
        content: expect.any(String),
        tokensInput: expect.any(Number),
        tokensOutput: expect.any(Number),
        costUsd: expect.any(Number),
      });

      expect(response.content.length).toBeGreaterThan(0);
    }, 30000); // 30s timeout for API call

    it("should return cached response on second call", async () => {
      const request = {
        messages: [
          { role: "user", content: "What is 2+2?" },
        ],
        temperature: 0,
        maxTokens: 10,
        enableCache: true,
      };

      // First call (uncached)
      const response1 = await callLLM(request);
      expect(response1.cached).toBe(false);

      // Second call (should be cached)
      const response2 = await callLLM(request);
      expect(response2.cached).toBe(true);
      expect(response2.content).toBe(response1.content);
    }, 60000);

    it("should handle JSON mode", async () => {
      const response = await callLLM({
        messages: [
          { role: "user", content: 'Return JSON with key "answer" set to "42"' },
        ],
        jsonMode: true,
        temperature: 0,
        enableCache: false,
      });

      const parsed = JSON.parse(response.content);
      expect(parsed).toHaveProperty("answer");
    }, 30000);
  });

  describe("Provider Availability", () => {
    it("should list available providers", () => {
      const providers = getAvailableProviders();
      expect(providers).toContain("openai");
      expect(Array.isArray(providers)).toBe(true);
    });
  });
});
