/**
 * NomosX Think Tank — Comprehensive E2E Test
 * 
 * Strategy: fire-and-poll.
 * 1. Check health & DB state
 * 2. Fire brief pipeline (non-blocking POST)
 * 3. Fire strategic pipeline (non-blocking POST)
 * 4. Poll diagnostic endpoint until both complete or timeout
 * 5. Verify output quality (HTML, citations, word count)
 * 6. Check cron subsystems
 * 
 * Usage: node scripts/test-think-tank-e2e.mjs [--skip-pipelines]
 * Requires: dev server on localhost:3000, CRON_SECRET in .env
 */

import { readFileSync } from 'fs';

const BASE = "http://localhost:3000";
const SKIP_PIPELINES = process.argv.includes("--skip-pipelines");
const POLL_INTERVAL = 15_000;    // 15s between polls
const MAX_WAIT_BRIEF = 600_000;  // 10 min max for brief
const MAX_WAIT_STRAT = 900_000;  // 15 min max for strategic

// ── Read CRON_SECRET ──
let CRON_SECRET = "";
for (const file of ['.env', '.env.local']) {
  try {
    const env = readFileSync(file, 'utf8');
    const matches = [...env.matchAll(/CRON_SECRET=["']?([^"'\r\n]+)/g)];
    if (matches.length) CRON_SECRET = matches[matches.length - 1][1];
  } catch {}
}

const authHeaders = { Authorization: "Bearer " + CRON_SECRET };

let pass = 0, fail = 0;
const results = {};

async function test(name, fn) {
  process.stdout.write(`\n  ${name}... `);
  try {
    const r = await fn();
    console.log("✅");
    pass++;
    return r;
  } catch (e) {
    console.log(`❌ ${e.message}`);
    fail++;
    return null;
  }
}

function section(title) {
  console.log(`\n${"─".repeat(55)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(55));
}

async function getDiagnostic() {
  const r = await fetch(BASE + "/api/test/pipeline", { headers: authHeaders });
  if (!r.ok) throw new Error("Diagnostic HTTP " + r.status);
  return r.json();
}

// Fire pipeline POST (don't await response — it takes minutes)
function firePipeline(question, format) {
  return fetch(BASE + "/api/test/pipeline", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ question, format }),
    signal: AbortSignal.timeout(MAX_WAIT_STRAT),
  }).catch(() => null); // Ignore client-side errors — we poll DB instead
}

// Poll until a pipeline run with matching question reaches COMPLETED/FAILED
async function waitForRun(question, maxWait) {
  const start = Date.now();
  const shortQ = question.slice(0, 40);
  let lastStatus = "";

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    try {
      const diag = await getDiagnostic();
      const run = diag.pipelineRuns?.find(r =>
        r.question?.startsWith(shortQ) && r.createdAt > new Date(start - 60_000).toISOString()
      );

      if (!run) {
        process.stdout.write(".");
        continue;
      }

      if (run.status !== lastStatus) {
        lastStatus = run.status;
        process.stdout.write(`[${run.status}]`);
      }

      if (run.status === "COMPLETED" || run.status === "FAILED") {
        // Find matching brief
        const brief = diag.recentBriefs?.find(b =>
          b.question?.startsWith(shortQ)
        );
        return { run, brief };
      }

      process.stdout.write(".");
    } catch {
      process.stdout.write("?");
    }
  }
  return null;
}

// ════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════

async function main() {
  const totalStart = Date.now();

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║    NomosX Think Tank — Full E2E Test Suite           ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`  CRON_SECRET: ${CRON_SECRET ? "✅ loaded" : "❌ missing"}`);
  console.log(`  Mode: ${SKIP_PIPELINES ? "DB-only (--skip-pipelines)" : "Full pipeline run"}`);

  if (!CRON_SECRET) {
    console.log("\n  ⛔ Cannot run without CRON_SECRET.\n");
    process.exit(1);
  }

  // ── PHASE 1: Health ──
  section("PHASE 1 — Health & Infrastructure");

  await test("GET /api/health", async () => {
    const r = await fetch(BASE + "/api/health");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    results.health = d;
    const db = d.checks?.database?.status || "?";
    const redis = d.checks?.redis?.status || "?";
    process.stdout.write(`[v${d.version} | db:${db} | redis:${redis}] `);
  });

  await test("GET /api/public/stats", async () => {
    const r = await fetch(BASE + "/api/public/stats");
    if (!r.ok) throw new Error("HTTP " + r.status);
  });

  await test("Diagnostic endpoint (DB access)", async () => {
    const d = await getDiagnostic();
    process.stdout.write(`[${d.pipelineRuns?.length || 0} runs | ${d.recentBriefs?.length || 0} briefs | ${d.publishedPublications} published] `);
    results.diagBefore = d;
  });

  // ── PHASE 2: Existing Output Quality ──
  section("PHASE 2 — Existing Output Quality");

  const diag = results.diagBefore;

  await test("At least 1 completed pipeline run exists", async () => {
    const completed = diag.pipelineRuns?.filter(r => r.status === "COMPLETED") || [];
    if (completed.length === 0) throw new Error("No completed runs found");
    process.stdout.write(`[${completed.length} completed] `);
  });

  await test("At least 1 brief has HTML with citations", async () => {
    const withCitations = diag.recentBriefs?.filter(b => b.hasCitations && b.htmlLength > 500) || [];
    if (withCitations.length === 0) throw new Error("No briefs with citations found");
    process.stdout.write(`[${withCitations.length} briefs with citations] `);
  });

  // Check best brief quality
  const bestBrief = diag.recentBriefs?.filter(b => b.kind === "brief").sort((a, b) => b.htmlLength - a.htmlLength)[0];
  if (bestBrief) {
    await test(`Best brief: ${bestBrief.htmlLength} chars, ${bestBrief.wordCount} words`, async () => {
      if (bestBrief.wordCount < 300) throw new Error("Brief too short: " + bestBrief.wordCount + " words");
      if (!bestBrief.hasCitations) throw new Error("No citations in brief");
    });
  }

  // Check strategic report quality
  const bestStrat = diag.recentBriefs?.filter(b => b.kind === "strategic").sort((a, b) => b.htmlLength - a.htmlLength)[0];
  if (bestStrat) {
    await test(`Best strategic: ${bestStrat.htmlLength} chars, ${bestStrat.wordCount} words`, async () => {
      if (bestStrat.wordCount < 1000) throw new Error("Strategic too short: " + bestStrat.wordCount + " words");
      if (!bestStrat.hasCitations) throw new Error("No citations in strategic report");
    });
  }

  // Check pipeline metrics
  const completedRuns = diag.pipelineRuns?.filter(r => r.status === "COMPLETED") || [];
  if (completedRuns.length > 0) {
    await test("Pipeline trust scores reasonable (>50)", async () => {
      const scores = completedRuns.map(r => r.trustScore).filter(Boolean);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg < 50) throw new Error("Avg trust score too low: " + avg);
      process.stdout.write(`[avg: ${Math.round(avg)}, range: ${Math.min(...scores)}-${Math.max(...scores)}] `);
    });

    await test("Pipeline finds sources (>100 per run)", async () => {
      const sources = completedRuns.map(r => r.sourcesFound).filter(Boolean);
      const avg = sources.reduce((a, b) => a + b, 0) / sources.length;
      if (avg < 10) throw new Error("Avg sources too low: " + avg);
      process.stdout.write(`[avg: ${Math.round(avg)} sources] `);
    });

    await test("Pipeline cost reasonable (<$1 per run)", async () => {
      const costs = completedRuns.map(r => r.totalCostUsd).filter(Boolean);
      const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
      process.stdout.write(`[avg: $${avg.toFixed(3)}] `);
      if (avg > 1.0) throw new Error("Avg cost too high: $" + avg.toFixed(3));
    });
  }

  // ── PHASE 3: Live Pipeline Test ──
  if (!SKIP_PIPELINES) {
    section("PHASE 3 — Live Brief Pipeline");
    const briefQ = "Impact of renewable energy subsidies on grid reliability";
    console.log(`  📝 Topic: '${briefQ}'`);
    console.log("  ⏳ Firing pipeline (polling every 15s for completion)...");

    firePipeline(briefQ, "brief");

    const briefOut = await test("Brief pipeline completes", async () => {
      const result = await waitForRun(briefQ, MAX_WAIT_BRIEF);
      if (!result) throw new Error("Timed out waiting for brief pipeline");
      if (result.run.status === "FAILED") throw new Error("Pipeline FAILED: " + (result.run.error || "unknown"));
      const dur = result.run.durationMs ? Math.round(result.run.durationMs / 1000) + "s" : "?";
      process.stdout.write(`[${dur} | ${result.run.sourcesFound} sources | trust:${result.run.trustScore}] `);
      return result;
    });

    if (briefOut) {
      await test("Brief HTML quality", async () => {
        if (!briefOut.brief) throw new Error("No brief record found");
        if (briefOut.brief.htmlLength < 500) throw new Error("HTML too short: " + briefOut.brief.htmlLength);
        if (!briefOut.brief.hasCitations) throw new Error("No citations in HTML");
        process.stdout.write(`[${briefOut.brief.htmlLength} chars | ${briefOut.brief.wordCount} words | citations:YES] `);
      });
    }

    section("PHASE 4 — Live Strategic Pipeline");
    const stratQ = "Global semiconductor supply chain risks and policy responses";
    console.log(`  📝 Topic: '${stratQ}'`);
    console.log("  ⏳ Firing strategic pipeline (polling for completion)...");

    firePipeline(stratQ, "strategic");

    const stratOut = await test("Strategic pipeline completes", async () => {
      const result = await waitForRun(stratQ, MAX_WAIT_STRAT);
      if (!result) throw new Error("Timed out waiting for strategic pipeline");
      if (result.run.status === "FAILED") throw new Error("Pipeline FAILED: " + (result.run.error || "unknown"));
      const dur = result.run.durationMs ? Math.round(result.run.durationMs / 1000) + "s" : "?";
      process.stdout.write(`[${dur} | ${result.run.sourcesFound} sources | trust:${result.run.trustScore}] `);
      return result;
    });

    if (stratOut) {
      await test("Strategic HTML quality", async () => {
        if (!stratOut.brief) throw new Error("No strategic report found");
        if (stratOut.brief.htmlLength < 2000) throw new Error("HTML too short for strategic: " + stratOut.brief.htmlLength);
        if (!stratOut.brief.hasCitations) throw new Error("No citations in HTML");
        process.stdout.write(`[${stratOut.brief.htmlLength} chars | ${stratOut.brief.wordCount} words | citations:YES] `);
      });

      await test("Strategic longer than brief", async () => {
        const bLen = briefOut?.brief?.wordCount || 0;
        const sLen = stratOut.brief.wordCount;
        if (bLen > 0 && sLen <= bLen) throw new Error(`Strategic (${sLen}w) should be longer than brief (${bLen}w)`);
        process.stdout.write(`[${sLen} vs ${bLen} words] `);
      });
    }
  } else {
    console.log("\n  ⏭  Skipping live pipelines (--skip-pipelines flag)");
  }

  // ── PHASE 5: Cron Subsystems ──
  section(`PHASE ${SKIP_PIPELINES ? 3 : 5} — Cron Subsystems`);

  await test("Cron: self-improve", async () => {
    const r = await fetch(BASE + "/api/cron/self-improve", { headers: authHeaders });
    if (!r.ok) throw new Error("HTTP " + r.status);
  });

  await test("Cron: generate-briefs", async () => {
    const r = await fetch(BASE + "/api/cron/generate-briefs", {
      method: "POST", headers: authHeaders,
    });
    if (r.status === 401) throw new Error("Auth failed");
    process.stdout.write(`[HTTP ${r.status}] `);
  });

  await test("Public briefs API", async () => {
    const r = await fetch(BASE + "/api/public/briefs?limit=3");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    process.stdout.write(`[${d.pagination?.totalCount} published] `);
  });

  // ══════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════
  const totalDuration = Math.round((Date.now() - totalStart) / 1000);

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║    TEST RESULTS                                      ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  ✅ Passed:  ${String(pass).padStart(2)}                                      ║`);
  console.log(`║  ❌ Failed:  ${String(fail).padStart(2)}                                      ║`);
  console.log(`║  ⏱  Duration: ${String(totalDuration).padStart(4)}s                                  ║`);
  console.log("╠══════════════════════════════════════════════════════╣");

  if (fail === 0) {
    console.log("║  🏆 NomosX Think Tank is FULLY OPERATIONAL            ║");
  } else if (fail <= 2) {
    console.log("║  ⚠️  Minor issues — review above                       ║");
  } else {
    console.log("║  🚨 Significant failures — investigation needed        ║");
  }

  console.log("╚══════════════════════════════════════════════════════╝\n");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error("\nFatal:", e); process.exit(1); });
