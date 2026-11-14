/**
 * MINICHECK CLIENT — shadow claim↔document verification via quant-service.
 *
 * MiniCheck (Apache 2.0) is a small model trained for support verdicts on
 * grounding documents. Shadow mode only: verdicts are recorded for
 * calibration against the LLM fact-checker — nothing gates on them yet.
 *
 * Requires QUANT_SERVICE_URL + NOMOSX_MINICHECK=1. Any failure → null.
 */

import axios from "axios";
import { quantServiceUrl } from "./figaro-client";

const TIMEOUT_MS = 120_000;
const MAX_PAIRS = 30;

export interface MiniCheckVerdict {
  label: "supported" | "not_supported" | "unclear";
  score: number;
  raw?: string;
}

export interface MiniCheckResult {
  results: MiniCheckVerdict[];
  checked: number;
  durationMs: number;
}

export function minicheckEnabled(): boolean {
  return process.env.NOMOSX_MINICHECK === "1" && !!quantServiceUrl();
}

export async function minicheckCheck(
  pairs: Array<{ claim: string; document: string }>,
): Promise<MiniCheckResult | null> {
  const base = quantServiceUrl();
  if (!base || process.env.NOMOSX_MINICHECK !== "1" || pairs.length === 0) return null;
  try {
    const resp = await axios.post(
      `${base}/v1/minicheck/check`,
      { pairs: pairs.slice(0, MAX_PAIRS) },
      { timeout: TIMEOUT_MS },
    );
    const d = resp.data;
    if (!Array.isArray(d?.results)) return null;
    return {
      results: d.results as MiniCheckVerdict[],
      checked: Number(d.checked ?? d.results.length),
      durationMs: Number(d.durationMs ?? 0),
    };
  } catch {
    return null;
  }
}
