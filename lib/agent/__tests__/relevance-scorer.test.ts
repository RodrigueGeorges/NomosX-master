/**
 * Unit tests for Relevance Scorer
 */

import { describe, it, expect } from "vitest";
import { scoreRelevance, filterByRelevance } from "../relevance-scorer";
import type { EnhancedQuery } from "../query-enhancer";

describe("RelevanceScorer", () => {
  const mockEnhancedQuery: EnhancedQuery = {
    original: "what are the impacts of AI on employment?",
    language: "en",
    translated: "what are the impacts of AI on employment?",
    enhanced: "artificial intelligence employment impact labor market automation",
    variations: [],
    keywords: ["artificial intelligence", "employment", "impact", "labor market", "automation"],
    topics: ["economics", "computer science", "labor economics"],
  };

  describe("scoreRelevance", () => {
    it("should give high score to highly relevant source", () => {
      const source = {
        title: "The Impact of Artificial Intelligence on Labor Market and Employment Trends",
        abstract: "This paper analyzes how artificial intelligence and automation are transforming employment patterns in the labor market.",
        topics: ["economics", "labor economics", "technology"],
        year: 2023,
        citationCount: 50,
      };

      const score = scoreRelevance(source, mockEnhancedQuery);

      expect(score.overall).toBeGreaterThan(0.7); // High relevance
      expect(score.topicOverlap).toBeGreaterThan(0.5);
      expect(score.fieldMatch).toBeGreaterThan(0.5);
    });

    it("should give low score to irrelevant source", () => {
      const source = {
        title: "Quantum Computing Applications in Drug Discovery",
        abstract: "This paper explores quantum algorithms for molecular simulation and pharmaceutical research.",
        topics: ["physics", "chemistry", "pharmacology"],
        year: 2023,
        citationCount: 30,
      };

      const score = scoreRelevance(source, mockEnhancedQuery);

      expect(score.overall).toBeLessThan(0.4); // Low relevance
      expect(score.topicOverlap).toBeLessThan(0.3);
      expect(score.fieldMatch).toBe(0);
    });

    it("should consider temporal relevance for future-oriented queries", () => {
      const futureQuery: EnhancedQuery = {
        ...mockEnhancedQuery,
        original: "what are the future impacts of AI on work?",
      };

      const recentSource = {
        title: "AI and Employment",
        abstract: "Recent analysis of AI impact on jobs",
        topics: ["economics"],
        year: 2024,
        citationCount: 10,
      };

      const oldSource = {
        ...recentSource,
        year: 2010,
      };

      const scoreRecent = scoreRelevance(recentSource, futureQuery);
      const scoreOld = scoreRelevance(oldSource, futureQuery);

      expect(scoreRecent.temporalRelevance).toBeGreaterThan(scoreOld.temporalRelevance);
    });

    it("should handle sources without abstract", () => {
      const source = {
        title: "Artificial Intelligence Employment Impact",
        abstract: null,
        topics: ["economics"],
        year: 2023,
        citationCount: 20,
      };

      const score = scoreRelevance(source, mockEnhancedQuery);

      expect(score.overall).toBeGreaterThan(0);
      expect(score.overall).toBeLessThan(1);
    });

    it("should handle sources without topics", () => {
      const source = {
        title: "AI and Labor Market Dynamics",
        abstract: "Analysis of employment trends",
        topics: [],
        year: 2023,
        citationCount: 15,
      };

      const score = scoreRelevance(source, mockEnhancedQuery);

      expect(score.overall).toBeGreaterThan(0);
      expect(score.fieldMatch).toBe(0);
    });
  });

  describe("filterByRelevance", () => {
    it("should filter and sort sources by relevance", () => {
      const sources = [
        {
          id: "1",
          title: "AI Employment Impact Analysis",
          abstract: "Study on artificial intelligence and labor market automation",
          topics: ["economics", "labor economics"],
          year: 2023,
          citationCount: 50,
        },
        {
          id: "2",
          title: "Quantum Physics Research",
          abstract: "Quantum mechanics and particle physics",
          topics: ["physics"],
          year: 2023,
          citationCount: 40,
        },
        {
          id: "3",
          title: "Machine Learning and Employment Trends",
          abstract: "How AI technologies affect job markets",
          topics: ["computer science", "economics"],
          year: 2024,
          citationCount: 30,
        },
      ];

      const filtered = filterByRelevance(sources, mockEnhancedQuery, 0.4);

      // Should filter out irrelevant source (id: 2)
      expect(filtered.length).toBeLessThan(sources.length);
      expect(filtered.every(item => item.score.overall >= 0.4)).toBe(true);

      // Should be sorted by relevance (descending)
      for (let i = 1; i < filtered.length; i++) {
        expect(filtered[i - 1].score.overall).toBeGreaterThanOrEqual(filtered[i].score.overall);
      }

      // Irrelevant source should be filtered out
      expect(filtered.find(item => item.source.id === "2")).toBeUndefined();
    });

    it("should return empty array if no sources meet threshold", () => {
      const sources = [
        {
          id: "1",
          title: "Completely Unrelated Topic",
          abstract: "Nothing to do with AI or employment",
          topics: ["biology"],
          year: 2000,
          citationCount: 5,
        },
      ];

      const filtered = filterByRelevance(sources, mockEnhancedQuery, 0.5);

      expect(filtered).toHaveLength(0);
    });

    it("should handle different relevance thresholds", () => {
      const sources = [
        {
          id: "1",
          title: "AI Employment",
          abstract: "AI and jobs",
          topics: ["economics"],
          year: 2023,
          citationCount: 30,
        },
      ];

      const filtered70 = filterByRelevance(sources, mockEnhancedQuery, 0.7);
      const filtered30 = filterByRelevance(sources, mockEnhancedQuery, 0.3);

      expect(filtered30.length).toBeGreaterThanOrEqual(filtered70.length);
    });
  });
});
