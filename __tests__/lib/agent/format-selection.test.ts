/**
 * Tests for the editorial angle-based format selection logic.
 *
 * The core principle: format is determined by the ANGLE (signalType),
 * not by quality or signal strength. All formats share the same quality gate.
 */

import { selectPublicationType } from "@/lib/agent/publication-generator";
import { selectFormatFromSignal } from "@/lib/agent/think-tank-dispatcher";
import { getPublicationQualityRule, PUBLICATION_QUALITY_RULES } from "@/lib/publication-visibility";
import { PUBLICATION_FORMATS } from "@/lib/publication-formats";
import { getTemplate } from "@/lib/think-tank/templates";

describe("selectPublicationType — angle-based selection", () => {
  it("maps NEW_EVIDENCE to Signal Brief (ALERT angle)", () => {
    expect(selectPublicationType("NEW_EVIDENCE")).toBe("SUMMARY_BRIEF");
  });

  it("maps DATA_RELEASE to Signal Brief (ALERT angle)", () => {
    expect(selectPublicationType("DATA_RELEASE")).toBe("SUMMARY_BRIEF");
  });

  it("maps POLICY_CHANGE to Decision Memo (ACTION angle)", () => {
    expect(selectPublicationType("POLICY_CHANGE")).toBe("DECISION_MEMO");
  });

  it("maps CONTRADICTION to Article (ANALYSIS angle)", () => {
    expect(selectPublicationType("CONTRADICTION")).toBe("ARTICLE");
  });

  it("maps TREND_BREAK to Strategic Report (STRATEGY angle)", () => {
    expect(selectPublicationType("TREND_BREAK")).toBe("STRATEGIC_REPORT");
  });

  it("maps METHODOLOGY_SHIFT to Strategic Report (STRATEGY angle)", () => {
    expect(selectPublicationType("METHODOLOGY_SHIFT")).toBe("STRATEGIC_REPORT");
  });

  it("defaults to Article for unknown signal types", () => {
    expect(selectPublicationType("UNKNOWN_TYPE")).toBe("ARTICLE");
    expect(selectPublicationType("")).toBe("ARTICLE");
  });

  it("ignores sourceCount and priorityScore (angle-only)", () => {
    // Same signal type with different source counts → same format
    expect(selectPublicationType("NEW_EVIDENCE", 5, 90)).toBe("SUMMARY_BRIEF");
    expect(selectPublicationType("NEW_EVIDENCE", 30, 10)).toBe("SUMMARY_BRIEF");
    // High priority doesn't upgrade to Strategic Report
    expect(selectPublicationType("NEW_EVIDENCE", 5, 99)).toBe("SUMMARY_BRIEF");
  });
});

describe("selectFormatFromSignal — dispatcher alignment", () => {
  it("matches selectPublicationType for all signal types", () => {
    const signalTypes = ["NEW_EVIDENCE", "DATA_RELEASE", "POLICY_CHANGE", "CONTRADICTION", "TREND_BREAK", "METHODOLOGY_SHIFT"];
    for (const st of signalTypes) {
      expect(selectFormatFromSignal(st, 50)).toBe(selectPublicationType(st, 0, 50));
    }
  });

  it("defaults to Article for unknown types", () => {
    expect(selectFormatFromSignal("UNKNOWN", 50)).toBe("ARTICLE");
  });
});

describe("Publication quality gate — uniform thresholds", () => {
  const formats = ["SUMMARY_BRIEF", "DECISION_MEMO", "ARTICLE", "STRATEGIC_REPORT"];

  it("all formats share the same minTrustScore (65)", () => {
    for (const fmt of formats) {
      expect(PUBLICATION_QUALITY_RULES[fmt].minTrustScore).toBe(65);
    }
  });

  it("all formats share the same minQualityScore (70)", () => {
    for (const fmt of formats) {
      expect(PUBLICATION_QUALITY_RULES[fmt].minQualityScore).toBe(70);
    }
  });

  it("all formats share the same minCitationCoverage (0.50)", () => {
    for (const fmt of formats) {
      expect(PUBLICATION_QUALITY_RULES[fmt].minCitationCoverage).toBe(0.50);
    }
  });

  it("minWordCount is format-specific and benchmarked", () => {
    const expected: Record<string, number> = {
      SUMMARY_BRIEF: 500,
      DECISION_MEMO: 1200,
      ARTICLE: 3000,
      STRATEGIC_REPORT: 8000,
    };
    for (const fmt of formats) {
      expect(PUBLICATION_QUALITY_RULES[fmt].minWordCount).toBe(expected[fmt]);
    }
  });

  it("minSourceCount is format-specific", () => {
    const expected: Record<string, number> = {
      SUMMARY_BRIEF: 5,
      DECISION_MEMO: 8,
      ARTICLE: 15,
      STRATEGIC_REPORT: 20,
    };
    for (const fmt of formats) {
      expect(PUBLICATION_QUALITY_RULES[fmt].minSourceCount).toBe(expected[fmt]);
    }
  });

  it("getPublicationQualityRule falls back to Article for unknown types", () => {
    const rule = getPublicationQualityRule("NONEXISTENT");
    expect(rule.minWordCount).toBe(3000);
  });
});

describe("Publication formats — 4 canonical formats", () => {
  it("has exactly 4 formats", () => {
    expect(PUBLICATION_FORMATS).toHaveLength(4);
  });

  it("formats are in depth order (surface → strategic)", () => {
    const types = PUBLICATION_FORMATS.map(f => f.type);
    expect(types).toEqual(["SUMMARY_BRIEF", "DECISION_MEMO", "ARTICLE", "STRATEGIC_REPORT"]);
  });

  it("each format has label, pages, sourceDepth, description", () => {
    for (const fmt of PUBLICATION_FORMATS) {
      expect(fmt.label).toBeTruthy();
      expect(fmt.pages).toBeTruthy();
      expect(fmt.sourceDepth).toBeTruthy();
      expect(fmt.description).toBeTruthy();
    }
  });
});

describe("Templates — word counts benchmarked", () => {
  it("Signal Brief template: 500-1,200 words, 5+ sources", () => {
    const t = getTemplate("SUMMARY_BRIEF");
    expect(t).toBeDefined();
    expect(t!.totalMinWords).toBe(500);
    expect(t!.totalMaxWords).toBe(1200);
    expect(t!.minSources).toBe(5);
  });

  it("Decision Memo template: 1,200-2,500 words, 8+ sources", () => {
    const t = getTemplate("DECISION_MEMO");
    expect(t).toBeDefined();
    expect(t!.totalMinWords).toBe(1200);
    expect(t!.totalMaxWords).toBe(2500);
    expect(t!.minSources).toBe(8);
  });

  it("Article template: 3,000-6,000 words, 15+ sources", () => {
    const t = getTemplate("ARTICLE");
    expect(t).toBeDefined();
    expect(t!.totalMinWords).toBe(3000);
    expect(t!.totalMaxWords).toBe(6000);
    expect(t!.minSources).toBe(15);
  });

  it("Strategic Report template: 8,000-20,000 words, 20+ sources", () => {
    const t = getTemplate("STRATEGIC_REPORT");
    expect(t).toBeDefined();
    expect(t!.totalMinWords).toBe(8000);
    expect(t!.totalMaxWords).toBe(20000);
    expect(t!.minSources).toBe(20);
  });

  it("legacy types resolve to canonical templates", () => {
    expect(getTemplate("RESEARCH_BRIEF")?.type).toBe("DECISION_MEMO");
    expect(getTemplate("EXECUTIVE_BRIEF")?.type).toBe("DECISION_MEMO");
    expect(getTemplate("POLICY_NOTE")?.type).toBe("DECISION_MEMO");
    expect(getTemplate("UPDATE_NOTE")?.type).toBe("SUMMARY_BRIEF");
    expect(getTemplate("DATA_NOTE")?.type).toBe("SUMMARY_BRIEF");
    expect(getTemplate("DOSSIER")?.type).toBe("STRATEGIC_REPORT");
  });
});
