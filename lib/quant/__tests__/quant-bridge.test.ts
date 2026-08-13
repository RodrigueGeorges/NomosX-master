/**
 * QUANT BRIDGE — unit tests
 * Parametric costing engine + extended citation guard [MODEL-N] validation.
 * FIGARO client degradation + Zod validation.
 */

import { runParametricCost } from "../parametric-cost";
import { figaroShock, quantServiceUrl, deriveFigaroRequest, figaroResponseToModelResult } from "../figaro-client";
import { staleReferenceCosts, referenceCostAudit } from "../reference-costs";
import { citationGuard } from "../../agent/pipeline-v2";

describe("Parametric cost engine", () => {
  it("computes central value and propagates uncertainty", () => {
    const result = runParametricCost(
      {
        title: "Test estimate",
        lines: [
          { label: "Engineering", referenceCostId: "eu-engineer-day", quantity: 100 },
          { label: "Custom item", unitCost: 1000, unit: "unit", quantity: 10, uncertainty: 0.1 },
        ],
      },
      1
    );

    expect(result.kind).toBe("parametric-cost");
    expect(result.modelRef).toBe(1);
    // 100 × 850 + 10 × 1000 = 95 000
    const total = result.rows.find((r) => r.label.startsWith("TOTAL"));
    expect(total?.value).toBe(95_000);
    expect(total?.low).toBeLessThan(95_000);
    expect(total?.high).toBeGreaterThan(95_000);
    // lineage: reference source carried through
    expect(result.dataSources.some((s) => s.includes("Eurostat"))).toBe(true);
  });

  it("applies multiplicative risk factors", () => {
    const result = runParametricCost(
      {
        title: "With contingency",
        lines: [{ label: "Base", unitCost: 100, quantity: 10, uncertainty: 0 }],
        riskFactors: { contingency: 0.15, overhead: 0.1 },
      },
      2
    );
    const total = result.rows.find((r) => r.label.startsWith("TOTAL"));
    // 1000 × 1.15 × 1.10 = 1265
    expect(total?.value).toBe(1265);
  });

  it("computes NPV over a horizon", () => {
    const result = runParametricCost(
      {
        title: "Recurring",
        lines: [{ label: "Annual run cost", unitCost: 1000, quantity: 100, uncertainty: 0 }],
        horizonYears: 5,
        discountRatePct: 3,
      },
      1
    );
    const npv = result.rows.find((r) => r.label.startsWith("NPV"));
    expect(npv).toBeDefined();
    // annuity factor 5y @3% ≈ 4.5797 → NPV ≈ 457 971
    expect(npv!.value).toBeGreaterThan(450_000);
    expect(npv!.value).toBeLessThan(465_000);
  });

  it("skips lines without any unit cost and records a caveat", () => {
    const result = runParametricCost(
      { title: "Bad line", lines: [{ label: "Mystery", quantity: 5 }] },
      1
    );
    expect(result.rows.filter((r) => !r.label.startsWith("TOTAL"))).toHaveLength(0);
    expect(result.caveats.some((c) => c.includes("Mystery"))).toBe(true);
  });

  it("rejects negative quantity and records a caveat", () => {
    const result = runParametricCost(
      { title: "Negative", lines: [{ label: "Bad qty", unitCost: 100, quantity: -5 }] },
      1
    );
    expect(result.caveats.some((c) => c.includes("Bad qty") && c.includes("positive number"))).toBe(true);
    const total = result.rows.find((r) => r.label.startsWith("TOTAL"));
    expect(total?.value).toBe(0);
  });

  it("rejects zero quantity and records a caveat", () => {
    const result = runParametricCost(
      { title: "Zero", lines: [{ label: "Zero qty", unitCost: 100, quantity: 0 }] },
      1
    );
    expect(result.caveats.some((c) => c.includes("Zero qty") && c.includes("positive number"))).toBe(true);
  });

  it("rejects negative unit cost and records a caveat", () => {
    const result = runParametricCost(
      { title: "Negative cost", lines: [{ label: "Negative cost", unitCost: -50, quantity: 10 }] },
      1
    );
    expect(result.caveats.some((c) => c.includes("Negative cost") && c.includes("non-negative"))).toBe(true);
  });
});

describe("Reference costs staleness", () => {
  it("detects stale costs older than 2 years", () => {
    // Use a fixed date in 2027 so 2024 costs are 3 years old
    const stale = staleReferenceCosts(2, new Date("2027-01-01"));
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.every((c) => c.referenceYear <= 2024)).toBe(true);
  });

  it("returns empty when all costs are fresh", () => {
    const stale = staleReferenceCosts(2, new Date("2025-01-01"));
    // 2024 costs are 1 year old, 2025 costs are 0 years old — none stale
    expect(stale).toHaveLength(0);
  });

  it("audit covers all reference costs", () => {
    const audit = referenceCostAudit(new Date("2027-01-01"));
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((a) => typeof a.ageYears === "number" && typeof a.stale === "boolean")).toBe(true);
  });
});

describe("Citation guard — [MODEL-N] validation", () => {
  it("passes when model refs are within bounds", () => {
    const guard = citationGuard({ text: "Impact is 2.1x [MODEL-1] per [SRC-1]" }, 5, 1);
    expect(guard.ok).toBe(true);
    expect(guard.usedModelCount).toBe(1);
    expect(guard.invalidModels).toEqual([]);
  });

  it("fails when a model ref exceeds the number of models run", () => {
    const guard = citationGuard({ text: "See [SRC-1] and [MODEL-3]" }, 5, 1);
    expect(guard.ok).toBe(false);
    expect(guard.invalidModels).toEqual([3]);
  });

  it("fails when model refs exist but no model ran", () => {
    const guard = citationGuard({ text: "Claim [SRC-2] with [MODEL-1]" }, 5, 0);
    expect(guard.ok).toBe(false);
    expect(guard.invalidModels).toEqual([1]);
  });

  it("remains backward compatible (2-arg call)", () => {
    const guard = citationGuard({ text: "Claim [SRC-1]" }, 5);
    expect(guard.ok).toBe(true);
    expect(guard.usedModelCount).toBe(0);
  });

  it("detects malformed [MODEL-] tags without a number", () => {
    const guard = citationGuard({ text: "See [SRC-1] and [MODEL-]" }, 5, 1);
    expect(guard.ok).toBe(false);
    expect(guard.malformedModelCount).toBeGreaterThan(0);
  });

  it("detects malformed [MODEL-abc] tags with non-numeric suffix", () => {
    const guard = citationGuard({ text: "See [SRC-1] and [MODEL-xyz]" }, 5, 1);
    expect(guard.ok).toBe(false);
    expect(guard.malformedModelCount).toBeGreaterThan(0);
  });
});

describe("FIGARO client — degradation", () => {
  it("returns null when QUANT_SERVICE_URL is not set", async () => {
    const original = process.env.QUANT_SERVICE_URL;
    delete process.env.QUANT_SERVICE_URL;
    expect(quantServiceUrl()).toBeNull();
    const result = await figaroShock({ region: "FR", industry: "C26", demandShockMeur: 1000 });
    expect(result).toBeNull();
    process.env.QUANT_SERVICE_URL = original;
  });

  it("returns null when QUANT_SERVICE_URL is empty string", () => {
    const original = process.env.QUANT_SERVICE_URL;
    process.env.QUANT_SERVICE_URL = "";
    expect(quantServiceUrl()).toBeNull();
    process.env.QUANT_SERVICE_URL = original;
  });

  it("returns null when service is unreachable (network error)", async () => {
    const original = process.env.QUANT_SERVICE_URL;
    process.env.QUANT_SERVICE_URL = "http://localhost:1"; // port 1 = connection refused
    const result = await figaroShock({ region: "FR", industry: "C26", demandShockMeur: 1000 });
    expect(result).toBeNull();
    process.env.QUANT_SERVICE_URL = original;
  });
});

describe("FIGARO client — request derivation", () => {
  it("derives a FIGARO request from a query about French semiconductors", () => {
    const req = deriveFigaroRequest("Impact of semiconductor investment in France");
    expect(req).not.toBeNull();
    expect(req!.region).toBe("FR");
    expect(req!.industry).toBe("C26");
  });

  it("returns null when no sector keyword matches", () => {
    const req = deriveFigaroRequest("Impact of cooking recipes in France");
    expect(req).toBeNull();
  });

  it("returns null when no region keyword matches", () => {
    const req = deriveFigaroRequest("Impact of semiconductor investment in Brazil");
    expect(req).toBeNull();
  });

  it("maps EU-level queries to EU27 region", () => {
    const req = deriveFigaroRequest("EU semiconductor strategy");
    expect(req).not.toBeNull();
    expect(req!.region).toBe("EU27");
  });
});

describe("FIGARO client — response to model result", () => {
  it("converts a valid FIGARO response to a ModelResult", () => {
    const mockResponse = {
      region: "FR",
      industry: "C26",
      year: 2021,
      demandShockMeur: 1000,
      outputImpactMeur: 2103,
      valueAddedImpactMeur: 1800,
      outputMultiplier: 2.103,
      topSpilloverSectors: [
        { industry: "C20", outputMeur: 150 },
        { industry: "J62_63", outputMeur: 80 },
      ],
      dataSource: "Eurostat FIGARO 2021",
      methodology: "Leontief type-I",
    };
    const result = figaroResponseToModelResult(mockResponse as any, 1);
    expect(result.modelRef).toBe(1);
    expect(result.kind).toBe("figaro-io");
    expect(result.rows.some((r) => r.label.includes("Total output"))).toBe(true);
    expect(result.rows.some((r) => r.label.includes("Spillover: C20"))).toBe(true);
    expect(result.caveats.length).toBeGreaterThan(0);
  });
});

