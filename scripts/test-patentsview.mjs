// PatentsView provider smoke test
// Usage (PowerShell):
//   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
//   node --import tsx .\scripts\test-patentsview.mjs
//
// Optional:
//   $env:PATENTSVIEW_API_KEY = "..."

import { searchPatentsView } from "../lib/providers/patents/patentsview-api.ts";

const query = "artificial intelligence";
const limit = 3;

(async () => {
  const results = await searchPatentsView(query, limit);

  console.log("\nPATENTSVIEW TEST");
  console.log({ query, limit, count: results.length });

  console.log(
    JSON.stringify(
      results.map((x) => ({
        id: x.id,
        title: x.title,
        year: x.year,
        citationCount: x.citationCount,
        fallback: Boolean(x?.raw?.fallback),
        url: x.url,
      })),
      null,
      2
    )
  );
})().catch((err) => {
  console.error("PATENTSVIEW TEST FAILED:", err?.message || err);
  process.exitCode = 1;
});
