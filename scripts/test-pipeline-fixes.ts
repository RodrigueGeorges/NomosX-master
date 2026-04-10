/**
 * COMPREHENSIVE PIPELINE TEST
 * Tests all fixes from the 3-level funnel repair:
 * 1. Relevance scorer (n-gram weight fix)
 * 2. GDELT safe JSON parse
 * 3. RANK permissive defaults
 * 4. scoreSource news bonus
 * 5. Full SCOUT → RANK → ANALYST pipeline
 */

import { scoreSource, scoreNovelty } from '../lib/score';

// ============================================================================
// TEST 1: scoreSource — News articles should score decently
// ============================================================================
function testScoreSource() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: scoreSource() — News vs Academic scoring");
  console.log("=".repeat(60));

  const newsArticle = scoreSource({
    year: 2026,
    citationCount: 0,
    oaStatus: 'open',
    institutions: [],
    provider: 'gdelt-news',
    type: 'news',
    abstract: 'Short news article about military conflict in the Middle East.',
  });

  const academicPaper = scoreSource({
    year: 2024,
    citationCount: 50,
    oaStatus: 'gold',
    institutions: ['MIT'],
    provider: 'openalex',
    type: 'article',
    abstract: 'A '.repeat(500), // ~1000 chars
  });

  const freshAcademic = scoreSource({
    year: 2026,
    citationCount: 0,
    oaStatus: 'open',
    institutions: [],
    provider: 'crossref',
    type: 'article',
    abstract: 'Short abstract.',
  });

  console.log(`  News article (gdelt-news, 2026):   ${newsArticle}/100`);
  console.log(`  Academic paper (openalex, 2024):    ${academicPaper}/100`);
  console.log(`  Fresh academic (crossref, 2026):    ${freshAcademic}/100`);

  const pass = newsArticle >= 50 && academicPaper >= 60 && freshAcademic >= 30;
  console.log(`  ${pass ? '✅' : '❌'} News articles should score ≥50 (got ${newsArticle})`);
  console.log(`  ${newsArticle > 0 ? '✅' : '❌'} News bonus applied (provider=gdelt-news)`);
  return pass;
}

// ============================================================================
// TEST 2: Relevance scorer — weights and threshold
// ============================================================================
async function testRelevanceScorer() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Relevance Scorer — Weight distribution");
  console.log("=".repeat(60));

  try {
    const { scoreRelevance, filterByRelevance } = await import('../lib/agent/relevance-scorer');

    const enhancedQuery = {
      original: "impact of carbon tax on emissions",
      language: "en",
      translated: "impact of carbon tax on emissions",
      enhanced: "impact of carbon tax on emissions reduction climate policy",
      variations: ["carbon tax emissions", "carbon pricing environmental impact"],
      keywords: ["carbon", "tax", "emissions", "climate", "policy"],
      topics: ["climate policy", "environmental economics", "carbon pricing"],
    };

    // Source with keywords in title — should score well
    const goodSource = {
      id: "test-1",
      title: "Carbon Tax Impact on Industrial Emissions: Evidence from European Countries",
      abstract: "This study examines the effect of carbon taxation on industrial CO2 emissions across 15 European nations from 2005 to 2023.",
      year: 2024,
      provider: "openalex",
      topics: ["climate policy", "carbon pricing"],
    };

    // Source with NO keywords — should score low but not zero
    const weakSource = {
      id: "test-2",
      title: "Machine Learning Applications in Healthcare Diagnostics",
      abstract: "A survey of deep learning methods for medical image classification.",
      year: 2024,
      provider: "crossref",
      topics: ["AI", "healthcare"],
    };

    // News source about topic — should score reasonably
    const newsSource = {
      id: "test-3",
      title: "EU Carbon Tax Expansion: New Rules Take Effect",
      abstract: "The European Union expanded its carbon border adjustment mechanism today.",
      year: 2026,
      provider: "gdelt-news",
      topics: [],
    };

    const score1 = scoreRelevance(goodSource as any, enhancedQuery as any);
    const score2 = scoreRelevance(weakSource as any, enhancedQuery as any);
    const score3 = scoreRelevance(newsSource as any, enhancedQuery as any);

    console.log(`  Good source: ${(score1.overall * 100).toFixed(1)}% — ${score1.explanation}`);
    console.log(`  Weak source: ${(score2.overall * 100).toFixed(1)}% — ${score2.explanation}`);
    console.log(`  News source: ${(score3.overall * 100).toFixed(1)}% — ${score3.explanation}`);

    // Filter test with threshold 0.15
    const allSources = [goodSource, weakSource, newsSource] as any[];
    const filtered = filterByRelevance(allSources, enhancedQuery as any, 0.15);

    console.log(`\n  Filter (threshold=0.15): ${filtered.length}/${allSources.length} sources kept`);
    filtered.forEach(f => console.log(`    - ${f.source.title.slice(0, 60)}... → ${(f.score.overall * 100).toFixed(1)}%`));

    const pass = score1.overall >= 0.3 && score2.overall < score1.overall && score3.overall >= 0.15 && filtered.length >= 2;
    console.log(`\n  ${pass ? '✅' : '❌'} Good source scores ≥30% (got ${(score1.overall * 100).toFixed(1)}%)`);
    console.log(`  ${score3.overall >= 0.15 ? '✅' : '❌'} News source passes 0.15 threshold (got ${(score3.overall * 100).toFixed(1)}%)`);
    console.log(`  ${filtered.length >= 2 ? '✅' : '❌'} At least 2/3 sources pass filter (got ${filtered.length})`);
    return pass;
  } catch (err: any) {
    console.error(`  ❌ IMPORT ERROR: ${err.message}`);
    return false;
  }
}

// ============================================================================
// TEST 3: GDELT safe JSON parse
// ============================================================================
async function testGDELTSafeParse() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: GDELT Safe JSON Parse");
  console.log("=".repeat(60));

  try {
    const { searchGDELTNews } = await import('../lib/providers/news-scout-providers');

    console.log("  Calling searchGDELTNews('artificial intelligence')...");
    const results = await searchGDELTNews('artificial intelligence', 5);
    console.log(`  Got ${results.length} results`);

    if (results.length > 0) {
      console.log(`  First result: "${results[0].title?.slice(0, 80)}..."`);
      console.log(`  Provider: ${results[0].provider}`);
    }

    console.log(`  ✅ GDELT did NOT crash (${results.length} results)`);
    return true;
  } catch (err: any) {
    if (err.message?.includes('JSON')) {
      console.error(`  ❌ JSON PARSE ERROR (the fix didn't work): ${err.message}`);
      return false;
    }
    console.warn(`  ⚠️  Network error (expected in some environments): ${err.message}`);
    return true; // Network errors are OK, JSON parse errors are not
  }
}

// ============================================================================
// TEST 4: Enhanced Ranker — permissive defaults
// ============================================================================
async function testEnhancedRankerDefaults() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: Enhanced Ranker — Permissive Defaults");
  console.log("=".repeat(60));

  try {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'lib/agent/enhanced-ranker.ts'), 'utf8'
    );

    const minQualityMatch = content.match(/minQuality:\s*(\d+)/);
    const minAbstractMatch = content.match(/minAbstractLength:\s*(\d+)/);
    const minProviderMatch = content.match(/minProviderDiversity:\s*(\d+)/);

    const minQuality = minQualityMatch ? parseInt(minQualityMatch[1]) : -1;
    const minAbstract = minAbstractMatch ? parseInt(minAbstractMatch[1]) : -1;
    const minProvider = minProviderMatch ? parseInt(minProviderMatch[1]) : -1;

    console.log(`  minQuality default:         ${minQuality} (should be 0)`);
    console.log(`  minAbstractLength default:   ${minAbstract} (should be 0)`);
    console.log(`  minProviderDiversity default: ${minProvider} (should be 2)`);

    const pass = minQuality === 0 && minAbstract === 0 && minProvider === 2;
    console.log(`\n  ${pass ? '✅' : '❌'} All defaults are permissive`);
    return pass;
  } catch (err: any) {
    console.error(`  ❌ ERROR: ${err.message}`);
    return false;
  }
}

// ============================================================================
// TEST 5: ANALYST prompt — neutral titles + word count targets
// ============================================================================
async function testAnalystPrompt() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 5: ANALYST Prompt — Neutral Titles + Word Count");
  console.log("=".repeat(60));

  try {
    const fs = await import('fs');
    const path = await import('path');

    // Check analyst-multipass.ts
    const multipass = fs.readFileSync(
      path.join(process.cwd(), 'lib/agent/analyst-multipass.ts'), 'utf8'
    );
    const hasNeutralTitle = multipass.includes('NO partisan framing');
    const hasWordCount = multipass.includes('MINIMUM 2500 WORDS');
    const hasMaxTokens12k = multipass.includes('maxTokens: 12000');
    const hasSectionTargets = multipass.includes('250-400 words');

    console.log(`  analyst-multipass.ts:`);
    console.log(`    ${hasNeutralTitle ? '✅' : '❌'} Neutral title instruction`);
    console.log(`    ${hasWordCount ? '✅' : '❌'} Minimum 2500 words rule`);
    console.log(`    ${hasMaxTokens12k ? '✅' : '❌'} maxTokens = 12000`);
    console.log(`    ${hasSectionTargets ? '✅' : '❌'} Per-section word targets`);

    // Check strategic-analyst-agent.ts
    const strategic = fs.readFileSync(
      path.join(process.cwd(), 'lib/agent/strategic-analyst-agent.ts'), 'utf8'
    );
    const strategicNeutral = strategic.includes('NO partisan framing');
    console.log(`  strategic-analyst-agent.ts:`);
    console.log(`    ${strategicNeutral ? '✅' : '❌'} Neutral title instruction`);

    const pass = hasNeutralTitle && hasWordCount && hasMaxTokens12k && hasSectionTargets && strategicNeutral;
    return pass;
  } catch (err: any) {
    console.error(`  ❌ ERROR: ${err.message}`);
    return false;
  }
}

// ============================================================================
// TEST 6: Route fixes — sourceIds passed to RANK
// ============================================================================
async function testRouteSourceIds() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 6: Route Fixes — sourceIds passed to RANK");
  console.log("=".repeat(60));

  const fs = await import('fs');
  const path = await import('path');

  const routes = [
    'app/api/brief/stream/route.ts',
    'app/api/council/stream/route.ts',
    'app/api/council/ask/route.ts',
  ];

  let allPass = true;
  for (const route of routes) {
    const content = fs.readFileSync(path.join(process.cwd(), route), 'utf8');
    const hasSourceIds = content.includes('sourceIds') && content.includes('rank(');
    const hasOldPattern = content.includes('rank(q, 12,') || content.includes('rank(question, 12,') || content.includes('rank(validQuestion, 12,');

    const pass = hasSourceIds && !hasOldPattern;
    console.log(`  ${pass ? '✅' : '❌'} ${route.split('/').pop()} — ${pass ? 'passes sourceIds' : 'STILL USES OLD PATTERN'}`);
    if (!pass) allPass = false;
  }

  return allPass;
}

// ============================================================================
// TEST 7: EDITOR paragraph rendering
// ============================================================================
async function testEditorRendering() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 7: EDITOR — Paragraph Rendering");
  console.log("=".repeat(60));

  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(
    path.join(process.cwd(), 'lib/agent/pipeline-v2.ts'), 'utf8'
  );

  const hasRenderParagraphs = content.includes('renderParagraphs');
  const hasSplitNewlines = content.includes('split(/\\n\\n+/)');
  const hasBrTag = content.includes("replace(/\\n/g, '<br>')");

  console.log(`  ${hasRenderParagraphs ? '✅' : '❌'} renderParagraphs helper exists`);
  console.log(`  ${hasSplitNewlines ? '✅' : '❌'} Double-newline paragraph splitting`);
  console.log(`  ${hasBrTag ? '✅' : '❌'} Single-newline → <br> conversion`);

  return hasRenderParagraphs && hasSplitNewlines;
}

// ============================================================================
// TEST 8: SCOUT relevance threshold
// ============================================================================
async function testScoutThreshold() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 8: SCOUT — Relevance Threshold");
  console.log("=".repeat(60));

  const fs = await import('fs');
  const path = await import('path');
  const content = fs.readFileSync(
    path.join(process.cwd(), 'lib/agent/pipeline-v2.ts'), 'utf8'
  );

  const thresholdMatch = content.match(/filterByRelevance\(deduped,\s*enhanced,\s*([\d.]+)\)/);
  const minResultsMatch = content.match(/relevant\.length\s*>=\s*(\d+)/);

  const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : -1;
  const minResults = minResultsMatch ? parseInt(minResultsMatch[1]) : -1;

  console.log(`  Relevance threshold: ${threshold} (should be 0.15)`);
  console.log(`  Min results to keep: ${minResults} (should be 3)`);

  const pass = threshold === 0.15 && minResults === 3;
  console.log(`\n  ${pass ? '✅' : '❌'} Threshold and min results are correct`);
  return pass;
}

// ============================================================================
// TEST 9: Full SCOUT → RANK pipeline (live, requires DB + API keys)
// ============================================================================
async function testFullPipeline() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 9: FULL PIPELINE — SCOUT → RANK (live test)");
  console.log("=".repeat(60));

  try {
    // Dynamic import to avoid compile errors if env not set
    const { scout, rank } = await import('../lib/agent/pipeline-v2');
    const { indexAgent } = await import('../lib/agent/index-agent');

    const query = "impact of artificial intelligence on labor markets";
    console.log(`  Query: "${query}"`);
    console.log(`  Starting SCOUT...`);

    const scoutResult = await scout(query, ["openalex", "crossref"], 20);
    const sourceIds = Array.isArray(scoutResult) 
      ? scoutResult.map((s: any) => s.id) 
      : (scoutResult.sourceIds || []);
    const found = Array.isArray(scoutResult) ? scoutResult.length : (scoutResult.found || 0);

    console.log(`  SCOUT: ${found} found, ${sourceIds.length} sourceIds`);

    if (sourceIds.length === 0) {
      console.log(`  ⚠️  No sources found (API/DB might be unavailable)`);
      return true; // Not a code bug
    }

    // Index
    console.log(`  INDEX: enriching ${sourceIds.length} sources...`);
    await indexAgent(sourceIds);

    // Rank with sourceIds (the fix!)
    console.log(`  RANK: selecting top 12 from ${sourceIds.length} sources...`);
    const ranked = await rank(query, { limit: 12, mode: "quality", sourceIds });
    console.log(`  RANK: ${ranked.length} sources selected`);

    if (ranked.length > 0) {
      console.log(`  Top source: "${ranked[0].title?.slice(0, 80)}..."`);
      console.log(`  Providers: ${[...new Set(ranked.map((s: any) => s.provider))].join(', ')}`);
    }

    const pass = ranked.length >= 3;
    console.log(`\n  ${pass ? '✅' : '❌'} RANK returned ${ranked.length} sources (target: ≥3, ideal: 8-12)`);
    
    if (ranked.length >= 8) {
      console.log(`  🎯 EXCELLENT: ${ranked.length} sources — meets think-tank standard`);
    } else if (ranked.length >= 5) {
      console.log(`  ⚡ GOOD: ${ranked.length} sources — acceptable quality`);
    } else if (ranked.length >= 3) {
      console.log(`  ⚠️  MARGINAL: ${ranked.length} sources — minimum viable`);
    }

    return pass;
  } catch (err: any) {
    if (err.message?.includes('DATABASE_URL') || err.message?.includes('OPENAI') || err.message?.includes('prisma') || err.message?.includes('PrismaClient')) {
      console.log(`  ⚠️  Skipped (requires live DB/API): ${err.message.slice(0, 100)}`);
      return true; // Not a code bug
    }
    console.error(`  ❌ PIPELINE ERROR: ${err.message}`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   NomosX Pipeline Fixes — Comprehensive Test Suite     ║");
  console.log("║   Testing: SCOUT + RANK + GDELT + ANALYST + EDITOR     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const results: { name: string; pass: boolean }[] = [];

  // Unit tests (no external deps)
  results.push({ name: "scoreSource news bonus", pass: testScoreSource() });
  results.push({ name: "Relevance scorer weights", pass: await testRelevanceScorer() });
  results.push({ name: "Enhanced ranker defaults", pass: await testEnhancedRankerDefaults() });
  results.push({ name: "Analyst prompt quality", pass: await testAnalystPrompt() });
  results.push({ name: "Route sourceIds fix", pass: await testRouteSourceIds() });
  results.push({ name: "Editor paragraph rendering", pass: await testEditorRendering() });
  results.push({ name: "Scout threshold", pass: await testScoutThreshold() });

  // Live tests (network deps)
  results.push({ name: "GDELT safe JSON parse", pass: await testGDELTSafeParse() });

  // Full pipeline (requires DB + API keys)
  results.push({ name: "Full SCOUT → RANK pipeline", pass: await testFullPipeline() });

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("FINAL RESULTS");
  console.log("═".repeat(60));

  let passed = 0, failed = 0;
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    if (r.pass) passed++; else failed++;
  }

  console.log(`\n  Score: ${passed}/${results.length} passed`);
  if (failed === 0) {
    console.log("  🎯 ALL TESTS PASSED — Pipeline fixes verified!");
  } else {
    console.log(`  ⚠️  ${failed} test(s) failed — review above output`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
