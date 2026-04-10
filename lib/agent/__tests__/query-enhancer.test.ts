/**
 * Unit tests for Query Enhancer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { enhanceQuery, quickEnhance, generateSearchQueries } from "../query-enhancer";
import OpenAI from "openai";

// Mock OpenAI
vi.mock("openai");

describe("QueryEnhancer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enhanceQuery", () => {
    it("should enhance French query with LLM", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translated: "what are the impacts of AI on work in the next 30 years?",
                enhanced: "artificial intelligence employment impact future labor market automation",
                variations: [
                  "AI job displacement automation workforce",
                  "machine learning labor market transformation",
                ],
                keywords: ["artificial intelligence", "employment", "automation", "labor market"],
                topics: ["economics", "computer science", "sociology"],
              }),
            },
          },
        ],
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await enhanceQuery("quels sont les impacts de l'IA sur le travail dans les 30 prochaines années ?");

      expect(result.language).toBe("fr");
      expect(result.translated).toContain("AI");
      expect(result.enhanced).toContain("artificial intelligence");
      expect(result.keywords).toContain("employment");
      expect(result.topics).toContain("economics");
      expect(mockCreate).toHaveBeenCalled();
    });

    it("should handle English query", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translated: "carbon tax effectiveness climate change",
                enhanced: "carbon pricing policy climate mitigation emissions reduction",
                variations: ["carbon tax environmental policy", "emission trading carbon levy"],
                keywords: ["carbon tax", "carbon pricing", "climate policy"],
                topics: ["environmental economics", "climate science"],
              }),
            },
          },
        ],
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await enhanceQuery("carbon tax effectiveness climate change");

      expect(result.language).toBe("en");
      expect(result.enhanced).toContain("carbon pricing");
    });

    it("should fallback on LLM error", async () => {
      const mockCreate = vi.fn().mockRejectedValue(new Error("OpenAI API error"));
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await enhanceQuery("test query");

      expect(result.original).toBe("test query");
      expect(result.enhanced).toBe("test query");
      expect(result.variations).toEqual([]);
    });
  });

  describe("quickEnhance", () => {
    it("should remove question words and extract keywords", () => {
      const result = quickEnhance("What are the impacts of artificial intelligence on employment?");

      expect(result.enhanced).not.toContain("what");
      expect(result.enhanced).not.toContain("are");
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.keywords).toContain("impacts");
      expect(result.keywords).toContain("artificial");
    });

    it("should handle French queries", () => {
      const result = quickEnhance("Quels sont les impacts de l'intelligence artificielle ?");

      expect(result.enhanced).not.toContain("quels");
      expect(result.enhanced).not.toContain("sont");
      expect(result.keywords).toContain("impacts");
    });
  });

  describe("generateSearchQueries", () => {
    it("should generate multiple search queries from enhanced query", () => {
      const enhanced = {
        original: "test",
        language: "en",
        translated: "test",
        enhanced: "primary query",
        variations: ["variation 1", "variation 2", "variation 3"],
        keywords: [],
        topics: [],
      };

      const queries = generateSearchQueries(enhanced);

      expect(queries).toHaveLength(3); // Primary + 2 variations
      expect(queries[0]).toBe("primary query");
      expect(queries[1]).toBe("variation 1");
      expect(queries[2]).toBe("variation 2");
    });
  });
});
