// Simple OECD SDMX provider test (runs under Node with TS support via `--import tsx`)
// Usage (PowerShell):
//   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
//   node --import tsx .\scripts\test-oecd-sdmx.mjs

import { searchOECDSDMX } from "../lib/providers/institutional/v2/oecd-sdmx.ts";

const query = "inflation";
const limit = 3;

(async () => {
  const results = await searchOECDSDMX(query, limit);

  console.log("\nOECD SDMX TEST");
  console.log({ query, limit, count: results.length });

  console.log(
    JSON.stringify(
      results.map((x) => ({
        id: x.id,
        title: x.title,
        url: x.url,
        score: x?.raw?.score,
        fallback: Boolean(x?.raw?.fallback),
      })),
      null,
      2
    )
  );
})().catch((err) => {
  console.error("OECD SDMX TEST FAILED:", err?.message || err);
  process.exitCode = 1;
});
