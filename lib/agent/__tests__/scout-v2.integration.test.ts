/**
 * Integration tests for the Unified SCOUT (pipeline-v2)
 * 
 * Note: These tests make real API calls and require:
 * - DATABASE_URL configured
 * - OPENAI_API_KEY configured
 * - (Optional) COHERE_API_KEY for reranking
 * 
 * Run with: npm test -- scout-v2.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { scout } from "../pipeline-v2";
import { prisma } from "../../db";

describe("Unified SCOUT Integration Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should search with query enhancement and return sources", async () => {
    const result = await scout(
      "quels sont les impacts de l'IA sur le travail ?",
      ["openalex"],
      10
    );

    expect(result.found).toBeGreaterThan(0);
    expect(result.upserted).toBeGreaterThan(0);
    expect(result.sourceIds.length).toBe(result.upserted);
    expect(typeof result.cached).toBe("boolean");

    // Verify sources exist in DB
    const sources = await prisma.source.findMany({
      where: { id: { in: result.sourceIds } },
    });
    expect(sources.length).toBe(result.upserted);
  }, 60000);

  it("should handle multi-provider search", async () => {
    const result = await scout(
      "carbon tax effectiveness",
      ["openalex", "semanticscholar"],
      5
    );

    expect(result.found).toBeGreaterThan(0);
    expect(result.upserted).toBeGreaterThan(0);
    expect(result.sourceIds.length).toBeGreaterThan(0);
  }, 60000);

  it("should handle queries with no results gracefully", async () => {
    const result = await scout(
      "xyzabc123nonexistentqueryforsure",
      ["openalex"],
      5
    );

    expect(result.found).toBe(0);
    expect(result.upserted).toBe(0);
    expect(result.sourceIds).toHaveLength(0);
  }, 30000);

  it("should use cache on repeated queries", async () => {
    const query = "test cache integration " + Date.now();
    const first = await scout(query, ["openalex"], 5);
    const second = await scout(query, ["openalex"], 5);

    // Second call should be cached (if Redis available)
    if (second.cached) {
      expect(second.found).toBe(first.found);
      expect(second.upserted).toBe(first.upserted);
    }
  }, 60000);
});
