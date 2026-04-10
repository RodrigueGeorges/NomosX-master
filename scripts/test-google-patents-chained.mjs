// Patents chained provider smoke test via monitoring-agent mapping
// Usage (PowerShell):
//   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
//   node --import tsx .\scripts\test-google-patents-chained.mjs
//
// Optional real results:
//   $env:PATENTSVIEW_API_KEY = "..."

import { runMonitoringCycle } from "../lib/agent/monitoring-agent.ts";

(async () => {
  const results = await runMonitoringCycle({
    providers: ["google-patents"],
    queries: ["artificial intelligence"],
    interval: 999,
    limit: 3,
    minQualityScore: 0,
    notifyOnNew: false,
  });

  console.log("\nGOOGLE-PATENTS (CHAINED) TEST RESULT");
  console.log(JSON.stringify(results, null, 2));
})().catch((err) => {
  console.error("GOOGLE-PATENTS CHAINED TEST FAILED:", err?.message || err);
  process.exitCode = 1;
});
