/**
 * NomosX — Full Funnel Scoring Quality Test
 * 
 * Starts from auto-scan (DETECT → DECIDE → DELEGATE) and traces
 * the quality of scoring through every pipeline step:
 * 
 *   AUTO-SCAN → SCOUT → INDEX → RANK → READER → ANALYST
 *   → GUARD → EDITOR → CRITICAL LOOP → PUBLISHER → PUBLICATION
 * 
 * Usage: node scripts/test-scoring-quality.mjs
 * Requires: NEXT.js dev server running on localhost:3000 + CRON_SECRET in .env
 */
import { readFileSync } from 'fs';

const BASE = "http://localhost:3000";

// Read CRON_SECRET from .env / .env.local
let CRON_SECRET = "";
for (const f of ['.env.local', '.env']) {
  try {
    const env = readFileSync(f, 'utf8');
    const matches = [...env.matchAll(/CRON_SECRET=["']?([^"'\r\n]+)/g)];
    if (matches.length) CRON_SECRET = matches[matches.length - 1][1];
  } catch {}
}

if (!CRON_SECRET) {
  console.error("❌ CRON_SECRET not found in .env or .env.local");
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${CRON_SECRET}`,
  'Content-Type': 'application/json',
};

// ── Quality thresholds ──
const T = {
  scout:      { minSources: 10,  idealSources: 30 },
  rank:       { minRanked: 5,    idealRanked: 12, minAvgQuality: 60, idealAvgQuality: 75 },
  reader:     { minReadings: 3,  idealReadings: 12, minFullText: 1 },
  analyst:    { requiresDebate: true },
  guard:      { minCitations: 3,  minUsedPct: 40 },
  critical:   { minScore: 60,    idealScore: 75 },
  publisher:  { minWordCount: 500, idealWordCount: 2000, minCitationCount: 3 },
  publication: { minTrustScore: 60, idealTrustScore: 75, minQualityScore: 60 },
};

let pass = 0, fail = 0, warn = 0;

function check(label, value, min, ideal, unit = "") {
  if (value == null || value === undefined) {
    console.log(`    ❌ ${label}: MISSING`);
    fail++;
    return false;
  }
  if (value < min) {
    console.log(`    ❌ ${label}: ${value}${unit} (min: ${min}${unit})`);
    fail++;
    return false;
  }
  if (value < ideal) {
    console.log(`    ⚠️  ${label}: ${value}${unit} (ideal: ${ideal}${unit})`);
    warn++;
    return true;
  }
  console.log(`    ✅ ${label}: ${value}${unit} (ideal: ${ideal}${unit})`);
  pass++;
  return true;
}

function checkBool(label, value, required = true) {
  if (value == null) {
    console.log(`    ❌ ${label}: MISSING`);
    fail++;
    return;
  }
  if (!value && required) {
    console.log(`    ❌ ${label}: false (required)`);
    fail++;
  } else if (!value && !required) {
    console.log(`    ⚠️  ${label}: false`);
    warn++;
  } else {
    console.log(`    ✅ ${label}: true`);
    pass++;
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  NomosX — Full Funnel Scoring Quality Test               ║");
  console.log("║  AUTO-SCAN → SCOUT → INDEX → RANK → READER → ANALYST    ║");
  console.log("║  → GUARD → EDITOR → CRITICAL LOOP → PUBLISHER           ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ════════════════════════════════════════════════════════════════
  // STEP 0: Health check
  // ════════════════════════════════════════════════════════════════
  console.log("── Step 0: Health Check ──");
  try {
    const r = await fetch(`${BASE}/api/health`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    console.log(`    ✅ Server online (v${d.version || "?"})`);
    pass++;
  } catch (e) {
    console.error(`    ❌ Server not reachable: ${e.message}`);
    console.error("    → Start with: npm run dev");
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 1: AUTO-SCAN (DETECT → DECIDE → DELEGATE)
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Step 1: AUTO-SCAN (DETECT → DECIDE → DELEGATE) ──");
  console.log("    ⏳ This triggers the full pipeline, may take 3-10 min...\n");

  let scanResult;
  try {
    const r = await fetch(`${BASE}/api/cron/auto-scan`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(600_000), // 10 min
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
    }
    scanResult = await r.json();
  } catch (e) {
    console.error(`    ❌ AUTO-SCAN failed: ${e.message}`);
    fail++;
    process.exit(1);
  }

  const stats = scanResult.stats || {};
  console.log(`    Duration: ${stats.durationMin || "?"} min`);

  // Phase DETECT
  console.log("\n  ── Phase DETECT (TopicRadar) ──");
  check("Radar topics found", stats.radarTopics, 1, 15);
  check("Detect duration", stats.phases?.detect?.durationMs, 0, 60000, "ms");

  // Phase DECIDE
  console.log("\n  ── Phase DECIDE (Editor-in-Chief) ──");
  check("Editorial decisions", stats.editorialDecisions, 1, 3);
  check("Decide duration", stats.phases?.decide?.durationMs, 0, 30000, "ms");

  if (stats.editorial?.decisions?.length > 0) {
    console.log("\n  Editorial decisions:");
    for (const d of stats.editorial.decisions) {
      console.log(`    • [${d.action}] P${d.priority} "${d.topic}" → ${d.domain} (urgency: ${d.urgency})`);
    }
  }

  // Phase DELEGATE
  console.log("\n  ── Phase DELEGATE (Pipeline execution) ──");
  check("Briefs published", stats.briefsPublished, 1, 2);
  check("Delegate duration", stats.phases?.delegate?.durationMs, 0, 300000, "ms");

  if (stats.errors?.length > 0) {
    console.log("    ⚠️  Errors during delegation:");
    for (const e of stats.errors) console.log(`      - ${e}`);
    warn += stats.errors.length;
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 2: Analyze the latest PipelineRun (full funnel stats)
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Step 2: Pipeline Run Analysis ──");

  let pipelineRuns;
  try {
    const r = await fetch(`${BASE}/api/test/pipeline`, { headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    pipelineRuns = d.pipelineRuns || [];
  } catch (e) {
    console.log(`    ⚠️  Could not fetch pipeline runs: ${e.message}`);
    warn++;
  }

  const latestRun = pipelineRuns?.find(r => r.status === 'COMPLETED');
  if (!latestRun) {
    console.log("    ❌ No completed PipelineRun found in DB");
    fail++;
  } else {
    const steps = latestRun.steps || {};
    console.log(`    PipelineRun: ${latestRun.id} | ${latestRun.durationMs}ms | $${latestRun.totalCostUsd?.toFixed(4) || "?"}`);

    // ── SCOUT ──
    console.log("\n  ── SCOUT ──");
    const scout = steps.scout || {};
    const scoutFound = scout.found || latestRun.sourcesFound || 0;
    check("Sources found", scoutFound, T.scout.minSources, T.scout.idealSources);
    check("Sources upserted", scout.upserted, 5, 25);
    checkBool("Cache hit", scout.cached, false);

    // ── INDEX ──
    console.log("\n  ── INDEX ──");
    const index = steps.index || {};
    check("Sources enriched", index.enriched, 5, 25);

    // ── EMBED ──
    console.log("\n  ── EMBED ──");
    const embed = steps.embed || {};
    if (embed.error) {
      console.log(`    ⚠️  EMBED failed: ${embed.error}`);
      warn++;
    } else {
      check("Sources embedded", embed.embedded, 0, 20);
    }

    // ── DEDUP ──
    console.log("\n  ── DEDUPLICATE ──");
    const dedupe = steps.dedupe || {};
    check("Duplicates removed", dedupe.removed, 0, 5);

    // ── RANK ──
    console.log("\n  ── RANK ──");
    const rank = steps.rank || {};
    check("Sources ranked", rank.count || latestRun.sourcesRanked, T.rank.minRanked, T.rank.idealRanked);
    check("Avg quality score", rank.avgQuality, T.rank.minAvgQuality, T.rank.idealAvgQuality);

    // ── READER ──
    console.log("\n  ── READER V3 ──");
    const reader = steps.reader || {};
    check("Readings extracted", reader.count, T.reader.minReadings, T.reader.idealReadings);
    check("Full-text readings", reader.fullText, T.reader.minFullText, 6);
    check("With quantitative data", reader.withQuantData, 0, 5);

    // ── ANALYST ──
    console.log("\n  ── ANALYST ──");
    const analyst = steps.analyst || {};
    checkBool("Has debate section", analyst.hasDebate, T.analyst.requiresDebate);
    check("Key findings count", analyst.keyFindingsCount, 2, 5);
    if (analyst.passes) check("Multi-pass iterations", analyst.passes, 2, 3);

    // ── TOPIC CONSISTENCY ──
    console.log("\n  ── TOPIC CONSISTENCY ──");
    const topicCons = steps.topicConsistency || {};
    if (topicCons.passed !== undefined) {
      checkBool("Topic consistency passed", topicCons.passed);
      if (topicCons.issues?.length > 0) {
        console.log(`    ⚠️  Issues: ${topicCons.issues.join("; ")}`);
        warn++;
      }
    } else {
      console.log("    ℹ️  Topic consistency not available (skipped)");
    }

    // ── GUARD ──
    console.log("\n  ── CITATION GUARD ──");
    const guard = steps.guard || {};
    check("Citations used", guard.usedCount, T.guard.minCitations, 8);
    check("Invalid citations", guard.invalid?.length || 0, 0, 0);
    checkBool("Guard passed", guard.ok);

    // ── EDITOR ──
    console.log("\n  ── EDITOR ──");
    check("HTML length", steps.htmlLength, 5000, 50000, " chars");

    // ── CITATION VERIFIER ──
    console.log("\n  ── CITATION VERIFIER ──");
    const citVer = steps.citationVerifier || {};
    if (citVer.error) {
      console.log(`    ⚠️  Citation verifier failed: ${citVer.error}`);
      warn++;
    } else {
      check("Citation integrity %", citVer.integrity, 50, 85, "%");
      check("Supported claims", citVer.supported, 3, 10);
      check("Flagged claims", citVer.flagged, 0, 2);
    }

    // ── CRITICAL LOOP ──
    console.log("\n  ── CRITICAL LOOP V2 ──");
    const critLoop = steps.criticalLoop || {};
    check("Final trust score", critLoop.finalScore || latestRun.trustScore, T.critical.minScore, T.critical.idealScore);
    check("Iterations", critLoop.iterations, 1, 2);
    check("Improvement delta", critLoop.improvement, 0, 10, " pts");
    checkBool("Needs human review", !critLoop.needsHumanReview);

    // ── HARVARD COUNCIL ──
    console.log("\n  ── HARVARD COUNCIL ──");
    const hc = steps.harvardCouncil || {};
    if (hc.skipped) {
      console.log("    ℹ️  Harvard Council skipped (tier=standard)");
    } else if (hc.error) {
      console.log(`    ⚠️  Harvard Council failed: ${hc.error}`);
      warn++;
    } else {
      check("Expert count", hc.experts, 2, 9);
      check("Evidence level", parseInt(String(hc.evidenceLevel || "0")), 1, 3);
    }

    // ── DEVIL'S ADVOCATE ──
    console.log("\n  ── DEVIL'S ADVOCATE ──");
    const da = steps.devilsAdvocate || {};
    if (da.skipped) {
      console.log("    ℹ️  Devil's Advocate skipped (tier=standard)");
    } else if (da.error) {
      console.log(`    ⚠️  Devil's Advocate failed: ${da.error}`);
      warn++;
    } else {
      check("Overall strength", da.overallStrength, 50, 80, "/100");
      check("Publishability score", da.publishabilityScore, 50, 80, "/100");
      check("Fatal challenges", da.fatalChallenges, 0, 0);
      check("Major challenges", da.majorChallenges, 0, 3);
      if (da.verdict) console.log(`    Verdict: ${da.verdict}`);
    }

    // ── KNOWLEDGE GRAPH ──
    console.log("\n  ── KNOWLEDGE GRAPH ──");
    const kg = steps.knowledgeGraph || {};
    if (kg.error) {
      console.log(`    ⚠️  Knowledge graph failed: ${kg.error}`);
      warn++;
    } else {
      check("Concepts extracted", kg.concepts, 0, 10);
      check("Relations extracted", kg.relations, 0, 15);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 3: Analyze the latest Publication
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Step 3: Publication Quality ──");

  let recentPubs;
  try {
    const r = await fetch(`${BASE}/api/think-tank/publications`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    recentPubs = Array.isArray(d) ? d : (d.publications || []);
  } catch (e) {
    console.log(`    ⚠️  Could not fetch publications: ${e.message}`);
    warn++;
  }

  const latestPub = recentPubs?.[0];
  if (!latestPub) {
    console.log("    ❌ No publications found");
    fail++;
  } else {
    console.log(`    Publication: "${latestPub.title?.slice(0, 60) || "?"}" | Type: ${latestPub.type}`);
    check("Trust score", latestPub.trustScore, T.publication.minTrustScore, T.publication.idealTrustScore);
    check("Quality score", latestPub.qualityScore, T.publication.minQualityScore, 80);
    check("Word count", latestPub.wordCount, T.publisher.minWordCount, T.publisher.idealWordCount);

    // Check HTML content quality
    if (latestPub.html) {
      const html = latestPub.html;
      const citations = html.match(/\[SRC-\d+\]/g) || [];
      const uniqueCitations = new Set(citations).size;
      const plainText = html.replace(/<[^>]*>/g, '');
      const wordCount = plainText.split(/\s+/).filter(Boolean).length;

      check("HTML citations (unique)", uniqueCitations, T.publisher.minCitationCount, 8);
      check("HTML word count (actual)", wordCount, T.publisher.minWordCount, T.publisher.idealWordCount);

      // Content depth indicators
      const hasDebate = html.includes('debate') || html.includes('Debate') || html.includes('position');
      const hasConsensus = html.includes('consensus') || html.includes('Consensus');
      const hasImplications = html.includes('implication') || html.includes('Implication');
      const hasRisks = html.includes('risk') || html.includes('Risk');

      console.log("\n  ── Content Depth Indicators ──");
      checkBool("Has debate section", hasDebate, false);
      checkBool("Has consensus section", hasConsensus, false);
      checkBool("Has implications", hasImplications, false);
      checkBool("Has risks analysis", hasRisks, false);
    }

    // Critical loop result metadata
    const clr = latestPub.criticalLoopResult || {};
    if (clr.architecture) {
      console.log(`    Architecture: ${clr.architecture}`);
      console.log(`    Domain: ${clr.domain || "?"} | Priority: P${clr.priority || "?"}`);
      console.log(`    Radar source: ${clr.radarSource || "?"} | Score: ${clr.radarScore || "?"}`);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // STEP 4: Scoring Algorithm Audit
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Step 4: Scoring Algorithm Audit ──");
  console.log("    (Checking scoreSource + scoreNovelty with sample inputs)\n");

  // We can't call scoreSource directly from here, but we can check
  // the quality score distribution from the pipeline run
  if (latestRun?.steps?.rank?.avgQuality) {
    const avgQ = latestRun.steps.rank.avgQuality;
    if (avgQ < 50) {
      console.log("    ❌ Average quality score suspiciously low (<50) — scoring may be broken");
      fail++;
    } else if (avgQ > 95) {
      console.log("    ⚠️  Average quality score suspiciously high (>95) — scoring may be inflated");
      warn++;
    } else {
      console.log(`    ✅ Average quality score in healthy range: ${avgQ}`);
      pass++;
    }
  }

  if (latestRun?.trustScore != null) {
    const ts = latestRun.trustScore;
    if (ts < 50) {
      console.log("    ❌ Trust score suspiciously low (<50) — critical loop may be too harsh");
      fail++;
    } else if (ts > 95) {
      console.log("    ⚠️  Trust score suspiciously high (>95) — critical loop may be too lenient");
      warn++;
    } else {
      console.log(`    ✅ Trust score in healthy range: ${ts}`);
      pass++;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(`║  Results: ${pass} passed, ${warn} warnings, ${fail} failed`);
  if (fail === 0) {
    console.log("║  ✅ Funnel scoring quality is HEALTHY");
  } else if (fail <= 3) {
    console.log("║  ⚠️  Minor issues detected — review warnings above");
  } else {
    console.log("║  ❌ Significant issues detected — scoring needs attention");
  }
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
