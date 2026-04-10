/**
 * Test script for Unified SCOUT (pipeline-v2)
 * 
 * Usage: npx tsx scripts/test-scout-v2.ts
 *        npx tsx scripts/test-scout-v2.ts --full  (includes full pipeline)
 */

import { scout, runPipeline } from "../lib/agent/pipeline-v2";
import { enhanceQuery } from "../lib/agent/query-enhancer";

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("  UNIFIED SCOUT — TEST SCRIPT");
  console.log("=".repeat(80) + "\n");

  // Test 1: Query Enhancement
  console.log("Test 1: Query Enhancement");
  console.log("-".repeat(80));

  const testQueries = [
    "quels sont les impacts de l'IA sur le travail ?",
    "carbon tax effectiveness climate change",
  ];

  for (const query of testQueries) {
    try {
      console.log(`\nQuery: "${query}"`);
      const enhanced = await enhanceQuery(query);
      console.log(`  Language: ${enhanced.language}`);
      console.log(`  Translated: "${enhanced.translated}"`);
      console.log(`  Enhanced: "${enhanced.enhanced}"`);
      console.log(`  Keywords: ${enhanced.keywords.join(", ")}`);
      console.log(`  Topics: ${enhanced.topics.join(", ")}`);
    } catch (error: any) {
      console.error(`  Error: ${error.message}`);
    }
  }

  // Test 2: Unified SCOUT (query enhancement + reranking built-in)
  console.log("\n\nTest 2: Unified SCOUT (10 sources)");
  console.log("-".repeat(80));

  try {
    const result = await scout(
      "artificial intelligence impact on employment",
      ["openalex"],
      10
    );

    console.log("\nSCOUT Results:");
    console.log(`  Found: ${result.found}`);
    console.log(`  Upserted: ${result.upserted}`);
    console.log(`  Source IDs: ${result.sourceIds.length}`);
    console.log(`  Cached: ${result.cached}`);

    if (result.upserted > 0) {
      console.log("\n  Top sources:");
      const { prisma } = await import("../lib/db");
      const topSources = await prisma.source.findMany({
        where: { id: { in: result.sourceIds.slice(0, 3) } },
        select: { id: true, title: true, year: true, citationCount: true },
      });
      topSources.forEach((s, i) => {
        console.log(`    ${i + 1}. ${s.title.slice(0, 80)}... (${s.year}, ${s.citationCount} citations)`);
      });
    }
  } catch (error: any) {
    console.error(`\nSCOUT Error: ${error.message}`);
    console.error(error.stack);
  }

  // Test 3: Full Pipeline (optional)
  if (process.argv.includes("--full")) {
    console.log("\n\nTest 3: Full Pipeline (brief format)");
    console.log("-".repeat(80));
    console.log("This will take ~60-90 seconds and use OpenAI credits\n");

    try {
      const { briefId, stats } = await runPipeline(
        "what is the impact of carbon taxes on CO2 emissions?",
        "brief",
        { providers: ["openalex"], perProvider: 10 }
      );

      console.log("\nPipeline Results:");
      console.log(`  Brief ID: ${briefId}`);
      console.log(`  Stats:`, JSON.stringify(stats, null, 2));
    } catch (error: any) {
      console.error(`\nPipeline Error: ${error.message}`);
      console.error(error.stack);
    }
  } else {
    console.log("\n\nTo test full pipeline, run:");
    console.log("   npx tsx scripts/test-scout-v2.ts --full");
  }

  console.log("\n" + "=".repeat(80));
  console.log("Tests completed");
  console.log("=".repeat(80) + "\n");

  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
