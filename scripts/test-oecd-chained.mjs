// OECD chained provider smoke test (SDMX first, iLibrary fallback)
// Usage (PowerShell):
//   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
//   node --import tsx .\scripts\test-oecd-chained.mjs

import { searchOECDChained } from "../lib/agent/monitoring-agent.ts";

const query = "inflation";
const limit = 3;

(async () => {
  const results = await searchOECDChained(query, limit);

  console.log("\nOECD CHAINED TEST");
  console.log({ query, limit, count: results.length });

  console.log(
    JSON.stringify(
      results.map((x) => ({
        id: x.id,
        title: x.title,
        fallback: Boolean(x?.raw?.fallback),
        source: x?.raw?.source,
        url: x.url,
      })),
      null,
      2
    )
  );
})().catch((err) => {
  console.error("OECD CHAINED TEST FAILED:", err?.message || err);
  process.exitCode = 1;
});
