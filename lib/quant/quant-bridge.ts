/**
 * QUANT BRIDGE — Orchestrator
 *
 * Runs the deterministic quantitative models relevant to a query and
 * produces a MODEL EVIDENCE block for the STRATEGIC ANALYST prompt.
 *
 * Numbers produced here are cited as [MODEL-N] in reports and validated
 * by the extended citation guard (see pipeline-v2.ts:citationGuard).
 *
 * Position in funnel: parallel with READER/QUANT, before ANALYST.
 * Fail-safe: every model isolated; the pipeline never blocks on the bridge.
 */

import { runParametricCost } from "./parametric-cost";
import { deriveFigaroRequest, figaroResponseToModelResult, figaroShock, quantServiceUrl } from "./figaro-client";
import type { ModelResult, ParametricCostInput, QuantBridgeOutput } from "./types";

export type QuantDepth = "none" | "parametric" | "io" | "full";

export interface QuantBridgeOptions {
  /** Requested quantitative depth (StudioX order option). Default: "io" for strategic runs. */
  depth?: QuantDepth;
  /** Optional caller-specified costing exercise (StudioX structured input) */
  parametricInput?: ParametricCostInput;
}

function formatRow(r: { label: string; value: number; unit: string; low?: number; high?: number }): string {
  const range = r.low !== undefined && r.high !== undefined ? ` [range: ${r.low}–${r.high}]` : "";
  return `${r.label}: ${r.value} ${r.unit}${range}`;
}

export function buildEvidenceBlock(models: ModelResult[]): string {
  if (models.length === 0) return "";
  const blocks = models.map((m) => {
    return [
      `[MODEL-${m.modelRef}] ${m.name}`,
      `Method: ${m.methodology}`,
      `Data: ${m.dataSources.join("; ") || "caller assumptions"}`,
      `Results:`,
      ...m.rows.map((r) => `  • ${formatRow(r)}`),
      `Caveats: ${m.caveats.join(" ")}`,
    ].join("\n");
  });
  return [
    "═══ MODEL EVIDENCE (deterministic quantitative models — cite as [MODEL-N]) ═══",
    ...blocks,
    "",
    "RULES: These figures are computed deterministically from sourced parameters — you may use them directly.",
    "ALWAYS cite the model tag [MODEL-N] when using a figure. ALWAYS reproduce the range, not just the central value.",
    "ALWAYS carry the caveats into the report (methodology/limitations sections). Do NOT extrapolate beyond stated scope.",
    "These model outputs complement — never replace — the [SRC-*] literature evidence.",
  ].join("\n");
}

export async function runQuantBridge(query: string, opts: QuantBridgeOptions = {}): Promise<QuantBridgeOutput> {
  const start = Date.now();
  const depth: QuantDepth = opts.depth ?? "io";
  const models: ModelResult[] = [];

  if (depth === "none") {
    return { models: [], evidenceBlock: "", usedModels: [], durationMs: Date.now() - start };
  }

  let nextRef = 1;

  // 1. Parametric costing — only when the caller supplied a structured exercise
  if ((depth === "parametric" || depth === "full") && opts.parametricInput) {
    try {
      models.push(runParametricCost(opts.parametricInput, nextRef));
      nextRef++;
    } catch (err) {
      console.warn("[QuantBridge] parametric-cost failed (non-blocking):", err);
    }
  }

  // 2. FIGARO IO analysis — when the query maps to a sector×region and the service is up
  if (depth === "io" || depth === "full") {
    const req = deriveFigaroRequest(query);
    if (req && quantServiceUrl()) {
      const t0 = Date.now();
      const res = await figaroShock(req);
      if (res) {
        const model = figaroResponseToModelResult(res, nextRef);
        model.durationMs = Date.now() - t0;
        models.push(model);
        nextRef++;
        console.log(`[QuantBridge] FIGARO IO: ${res.industry}/${res.region} multiplier=${res.outputMultiplier} (${model.durationMs}ms)`);
      }
    } else if (req) {
      console.log("[QuantBridge] FIGARO request derived but QUANT_SERVICE_URL not configured — skipping IO analysis");
    }
  }

  const usedModels = [...new Set(models.map((m) => m.kind))];
  const durationMs = Date.now() - start;
  if (models.length > 0) {
    console.log(`[QuantBridge] Complete: ${models.length} model(s) [${usedModels.join(", ")}] (${durationMs}ms)`);
  }
  return { models, evidenceBlock: buildEvidenceBlock(models), usedModels, durationMs };
}
