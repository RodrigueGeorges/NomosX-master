/**
 * DOCLING CLIENT — structured PDF extraction via quant-service.
 *
 * Docling (IBM, MIT) preserves tables, reading order and layout that the
 * reader's local pdf-parse flattens. The reader calls this BEFORE its
 * pdf-parse path; any failure returns null and the caller falls back —
 * the pipeline never blocks on the heavy path.
 *
 * Requires BOTH:
 *   QUANT_SERVICE_URL  — the deployed quant-service
 *   NOMOSX_DOCLING=1   — explicit opt-in (service may lack docling deps)
 */

import axios from "axios";
import { quantServiceUrl } from "./figaro-client";

const TIMEOUT_MS = 95_000; // service-side parse can take 30-60s on large docs

export interface DoclingParseResult {
  text: string;
  pages: number | null;
  chars: number;
  durationMs: number;
  format: string;
}

export function doclingEnabled(): boolean {
  return process.env.NOMOSX_DOCLING === "1" && !!quantServiceUrl();
}

export async function doclingParsePdf(url: string): Promise<DoclingParseResult | null> {
  const base = quantServiceUrl();
  if (!base || process.env.NOMOSX_DOCLING !== "1") return null;
  try {
    const resp = await axios.post(
      `${base}/v1/docling/parse`,
      { url, timeoutS: 90 },
      { timeout: TIMEOUT_MS },
    );
    const d = resp.data;
    if (typeof d?.text !== "string" || d.text.trim().length < 100) return null;
    return {
      text: d.text,
      pages: typeof d.pages === "number" ? d.pages : null,
      chars: typeof d.chars === "number" ? d.chars : d.text.length,
      durationMs: typeof d.durationMs === "number" ? d.durationMs : 0,
      format: typeof d.format === "string" ? d.format : "markdown",
    };
  } catch {
    return null; // 503/502/timeout — caller falls back to pdf-parse
  }
}
