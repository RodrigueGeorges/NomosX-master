// Simple IMF SDMX provider test (runs under Node with TypeScript support via `--import tsx`)
// Usage (PowerShell):
//   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
//   node --import tsx .\scripts\test-imf-sdmx.mjs

import { searchIMFSDMX } from "../lib/providers/institutional/v2/imf-sdmx.ts";

const query = "inflation";
const limit = 3;

(async () => {
  const results = await searchIMFSDMX(query, limit);

  console.log("\nIMF SDMX TEST");
  console.log({ query, limit, count: results.length });

  console.log(
    JSON.stringify(
      results.map((x) => ({
        id: x.id,
        title: x.title,
        fallback: Boolean(x?.raw?.fallback),
        url: x.url,
      })),
      null,
      2
    )
  );
})().catch((err) => {
  console.error("IMF SDMX TEST FAILED:", err?.message || err);
  process.exitCode = 1;
});
