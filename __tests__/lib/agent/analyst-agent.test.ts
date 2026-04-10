/**
 * Analyst Agent Tests
 */

import { analystAgent } from "@/lib/agent/analyst-agent";

describe("Analyst Agent", () => {
  const mockSources = [
    {
      id: "test-1",
      title: "Carbon Tax Effectiveness Study",
      abstract: "This study examines the impact of carbon taxes on emissions reduction...",
      year: 2023,
      provider: "openalex",
      qualityScore: 85,
      citationCount: 120,
      authors: [
        { author: { name: "John Doe" } },
        { author: { name: "Jane Smith" } },
      ],
    },
    {
      id: "test-2",
      title: "Economic Impact of Environmental Policies",
      abstract: "Analysis of economic effects of environmental regulations...",
      year: 2024,
      provider: "crossref",
      qualityScore: 90,
      citationCount: 85,
      authors: [
        { author: { name: "Alice Johnson" } },
      ],
    },
  ];

  const mockReadings = [
    {
      sourceId: "test-1",
      claims: ["Carbon taxes reduce emissions by 10-15%"],
      methods: ["Regression analysis on panel data"],
      results: ["Significant emission reduction in studied countries"],
      limitations: ["Limited to European countries"],
      confidence: "high" as const,
    },
    {
      sourceId: "test-2",
      claims: ["Environmental policies have mixed economic effects"],
      methods: ["Meta-analysis of 50 studies"],
      results: ["Short-term costs, long-term benefits"],
      limitations: ["Heterogeneity across studies"],
      confidence: "medium" as const,
    },
  ];

  it("should generate analysis with all required sections", async () => {
    const analysis = await analystAgent(
      "What is the impact of carbon taxes on emissions?",
      mockSources,
      mockReadings
    );

    expect(analysis).toHaveProperty("title");
    expect(analysis).toHaveProperty("summary");
    expect(analysis).toHaveProperty("consensus");
    expect(analysis).toHaveProperty("disagreements");
    expect(analysis).toHaveProperty("debate");
    expect(analysis.debate).toHaveProperty("pro");
    expect(analysis.debate).toHaveProperty("con");
    expect(analysis.debate).toHaveProperty("synthesis");
    expect(analysis).toHaveProperty("evidence");
    expect(analysis).toHaveProperty("implications");
    expect(analysis).toHaveProperty("risks");
    expect(analysis).toHaveProperty("open_questions");
    expect(analysis).toHaveProperty("what_changes_mind");
  }, 60000); // 60s timeout

  it("should include citations in analysis", async () => {
    const analysis = await analystAgent(
      "What is the impact of carbon taxes?",
      mockSources,
      mockReadings
    );

    const fullText = JSON.stringify(analysis);
    expect(fullText).toMatch(/\[SRC-\d+\]/); // Should have citations
  }, 60000);

  it("should handle errors gracefully", async () => {
    const analysis = await analystAgent(
      "test question",
      [], // Empty sources
      []
    );

    // Should return error structure but not throw
    expect(analysis).toBeDefined();
    expect(typeof analysis.title).toBe("string");
  }, 30000);
});
