#!/usr/bin/env node
/**
 * Macro providers smoke test + DB refresh
 *
 * PowerShell:
 *   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
 *   node --import tsx .\scripts\test-macro-providers.mjs
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

// Make local smoke tests work even if JWT_SECRET isn't set in .env yet
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-jwt-secret-please-change-32chars-min";
}

// If OPENAI_API_KEY isn't set locally, keep a placeholder so env validation passes.
// (Publication generation will be skipped or fail gracefully depending on your setup.)
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "dev-openai-key";
}

// NOTE: use dynamic imports so we can set env vars before lib/env.ts is evaluated.

function summarize(series) {
  if (!series) return null;
  const pts = series.points || [];
  const last = pts.length ? pts[pts.length - 1] : null;
  return {
    provider: series.provider,
    code: series.code,
    name: series.name,
    points: pts.length,
    last: last ? { date: last.date, value: last.value } : null,
  };
}

(async () => {
  console.log("\n[TEST] Macro providers smoke test");

  const { fetchEurostatSeries } = await import("../lib/providers/eurostat.ts");
  const { fetchECBSeries } = await import("../lib/providers/ecb.ts");
  const { fetchINSEESeries } = await import("../lib/providers/insee.ts");
  const { refreshMacroSeries } = await import("../lib/agent/macro-refresh.ts");

  const euro = await fetchEurostatSeries("prc_hicp_midx");
  console.log("Eurostat:", summarize(euro));

  const ecb = await fetchECBSeries("ICP.M.U2.N.000000.4.ANR");
  console.log("ECB:", summarize(ecb));

  const insee = await fetchINSEESeries("000857179");
  console.log("INSEE:", summarize(insee));

  console.log("\n[TEST] Refresh into DB (MacroSeries/MacroPoint)");
  const result = await refreshMacroSeries();
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
})().catch((e) => {
  console.error("Macro providers test failed:", e?.message || e);
  process.exit(1);
});
