/**
 * Test Script for Strategic Report Pipeline
 * Run with: npx tsx scripts/test-strategic-pipeline.ts
 */

import { runPipeline, runStrategicPipeline, rank, RankOptions } from "../lib/agent/pipeline-v2";

async function testRankFiltering() {
  console.log("\n" + "=".repeat(60));
  console.log("  TEST 1: Enhanced RANK Filtering");
  console.log("=".repeat(60) + "\n");

  const testQuery = "artificial intelligence regulation policy";

  // Test 1a: Recent-only filtering
  console.log("1a. Testing recentOnly filter...");
  const recentSources = await rank(testQuery, {
    limit: 10,
    mode: "quality",
    recentOnly: true,
    requireAbstract: true
  });
  console.log(`   Found ${recentSources.length} recent sources`);
  if (recentSources.length > 0) {
    const years = recentSources.map(s => s.year).filter(Boolean);
    console.log(`   Year range: ${Math.min(...years)}-${Math.max(...years)}`);
  }

  // Test 1b: Quality threshold
  console.log("\n1b. Testing minQuality filter...");
  const highQualitySources = await rank(testQuery, {
    limit: 10,
    minQuality: 80,
    requireAbstract: true,
    minAbstractLength: 500
  });
  console.log(`   Found ${highQualitySources.length} high-quality sources`);
  if (highQualitySources.length > 0) {
    const avgQuality = Math.round(
      highQualitySources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / highQualitySources.length
    );
    console.log(`   Average quality: ${avgQuality}/100`);
  }

  // Test 1c: Provider filtering
  console.log("\n1c. Testing provider exclusion...");
  const noArchiveSources = await rank(testQuery, {
    limit: 10,
    excludeProviders: ["cia-foia", "nara", "uk-archives", "archives-fr"]
  });
  console.log(`   Found ${noArchiveSources.length} sources (excluding archives)`);
  const providers = [...new Set(noArchiveSources.map(s => s.provider))];
  console.log(`   Providers: ${providers.join(", ")}`);

  console.log("\n✅ RANK filtering tests complete\n");
}

async function testStrategicPipeline() {
  console.log("\n" + "=".repeat(60));
  console.log("  TEST 2: Strategic Report Pipeline");
  console.log("=".repeat(60) + "\n");

  const testQuery = "Impact of large language models on scientific research methodology";

  console.log(`Query: "${testQuery}"`);
  console.log("Starting strategic pipeline...\n");

  try {
    const result = await runStrategicPipeline(testQuery, {
      providers: ["openalex", "semanticscholar", "arxiv"],
      perProvider: 15,
      rankOptions: {
        recentOnly: true,
        minQuality: 70
      },
      focusAreas: ["methodology", "reproducibility", "peer review"],
      targetAudience: "Research institutions and funding agencies",
      urgencyContext: "Rapid AI adoption in research requires immediate policy guidance"
    });

    console.log("\n📊 Pipeline Results:");
    console.log(`   Brief ID: ${result.briefId}`);
    console.log(`   Format: ${result.format}`);
    console.log(`   Scout found: ${result.stats.scout?.found || 0}`);
    console.log(`   Sources ranked: ${result.stats.rank?.count || 0}`);
    console.log(`   Key findings: ${result.stats.analyst?.keyFindingsCount || 0}`);
    console.log(`   Scenarios: ${result.stats.analyst?.scenariosCount || 0}`);
    console.log(`   Estimated pages: ${result.stats.brief?.estimatedPages || 0}`);
    console.log(`   HTML length: ${result.stats.htmlLength || 0} chars`);

    console.log("\n✅ Strategic pipeline test complete\n");
    return result;
  } catch (error: any) {
    console.error("\n❌ Strategic pipeline failed:", error.message);
    throw error;
  }
}

async function testUniversalPipeline() {
  console.log("\n" + "=".repeat(60));
  console.log("  TEST 3: Universal Pipeline (format selection)");
  console.log("=".repeat(60) + "\n");

  const testQuery = "climate change economic impact";

  // Test brief format
  console.log("3a. Testing 'brief' format...");
  try {
    const briefResult = await runPipeline(testQuery, "brief", {
      providers: ["openalex"]
    });
    console.log(`   ✅ Brief created: ${briefResult.briefId}`);
  } catch (error: any) {
    console.log(`   ⚠️ Brief skipped: ${error.message}`);
  }

  // Test strategic format
  console.log("\n3b. Testing 'strategic' format...");
  try {
    const strategicResult = await runPipeline(testQuery, "strategic", {
      providers: ["openalex", "semanticscholar"],
      perProvider: 10
    });
    console.log(`   ✅ Strategic report created: ${strategicResult.briefId}`);
    console.log(`   Estimated pages: ${strategicResult.stats?.brief?.estimatedPages || "N/A"}`);
  } catch (error: any) {
    console.log(`   ⚠️ Strategic skipped: ${error.message}`);
  }

  console.log("\n✅ Universal pipeline tests complete\n");
}

async function main() {
  console.log("\n" + "█".repeat(60));
  console.log("  NomosX Strategic Report Pipeline - Test Suite");
  console.log("█".repeat(60) + "\n");

  const startTime = Date.now();

  try {
    // Run tests
    await testRankFiltering();
    await testStrategicPipeline();
    await testUniversalPipeline();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n" + "█".repeat(60));
    console.log(`  ✅ ALL TESTS COMPLETE (${duration}s)`);
    console.log("█".repeat(60) + "\n");
  } catch (error: any) {
    console.error("\n❌ Test suite failed:", error.message);
    process.exit(1);
  }
}

// Run if called directly
main().catch(console.error);
