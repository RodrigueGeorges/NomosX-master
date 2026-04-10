/**
 * Redis Cache Service Tests
 */

import {
  cacheEmbedding,
  getCachedEmbedding,
  cacheLLMResponse,
  getCachedLLMResponse,
} from "@/lib/cache/redis-cache";

describe("Redis Cache Service", () => {
  describe("Embedding Cache", () => {
    it("should cache and retrieve embeddings", async () => {
      const text = "test embedding text";
      const model = "text-embedding-3-small";
      const embedding = [0.1, 0.2, 0.3];

      // Cache embedding
      await cacheEmbedding(text, model, embedding);

      // Retrieve embedding
      const cached = await getCachedEmbedding(text, model);

      expect(cached).toEqual(embedding);
    });

    it("should return null for non-existent cache", async () => {
      const cached = await getCachedEmbedding("non-existent-text", "model");
      expect(cached).toBeNull();
    });
  });

  describe("LLM Response Cache", () => {
    it("should cache and retrieve LLM responses", async () => {
      const prompt = "What is 2+2?";
      const model = "gpt-4o";
      const response = {
        content: "4",
        provider: "openai",
        model,
        tokensInput: 10,
        tokensOutput: 5,
        costUsd: 0.001,
        cached: false,
      };

      // Cache response
      await cacheLLMResponse(prompt, model, response, 60); // 60s TTL for test

      // Retrieve response
      const cached = await getCachedLLMResponse(prompt, model);

      expect(cached).toMatchObject({
        content: "4",
        provider: "openai",
      });
    });

    it("should handle cache miss gracefully", async () => {
      const cached = await getCachedLLMResponse("unknown prompt", "model");
      expect(cached).toBeNull();
    });
  });
});
