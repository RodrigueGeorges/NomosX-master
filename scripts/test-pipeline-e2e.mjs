/**
 * NomosX E2E Pipeline Test
 * Reads CRON_SECRET from .env, tests public + cron endpoints
 */
import { readFileSync } from 'fs';

const BASE = "http://localhost:3000";

// Read CRON_SECRET from .env
let CRON_SECRET = "";
try {
  const env = readFileSync('.env', 'utf8');
  const matches = [...env.matchAll(/CRON_SECRET=["']?([^"'\r\n]+)/g)];
  if (matches.length) CRON_SECRET = matches[matches.length - 1][1];
} catch { /* fallback */ }
try {
  const env = readFileSync('.env.local', 'utf8');
  const matches = [...env.matchAll(/CRON_SECRET=["']?([^"'\r\n]+)/g)];
  if (matches.length) CRON_SECRET = matches[matches.length - 1][1];
} catch { /* fallback */ }

let pass = 0, fail = 0;

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

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  NomosX E2E Pipeline Test");
  console.log("══════════════════════════════════════════");
  console.log(`  CRON_SECRET: ${CRON_SECRET ? "✅ loaded" : "❌ missing"}`);

  // ── PUBLIC ENDPOINTS ──
  console.log("\n── Public Endpoints ──");

  await test("GET /api/health", async () => {
    const r = await fetch(`${BASE}/api/health`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    process.stdout.write(`[v${d.version || "?"}] `);
  });

  await test("GET /api/public/briefs", async () => {
    const r = await fetch(`${BASE}/api/public/briefs`);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
    const d = await r.json();
    process.stdout.write(`[${d.pagination?.totalCount ?? 0} briefs] `);
  });

  await test("GET /api/public/stats", async () => {
    const r = await fetch(`${BASE}/api/public/stats`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });

  // ── PUBLICATIONS CHECK ──
  console.log("\n── DB State ──");

  await test("GET /api/think-tank/publications (public)", async () => {
    const r = await fetch(`${BASE}/api/think-tank/publications`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const count = Array.isArray(d) ? d.length : (d.publications?.length ?? 0);
    process.stdout.write(`[${count} publications] `);
  });

  // ── CRON PIPELINE TEST ──
  if (!CRON_SECRET) {
    console.log("\n⚠️  Skipping cron tests (no CRON_SECRET)");
  } else {
    console.log("\n── Cron Pipeline (with CRON_SECRET) ──");

    await test("GET /api/cron/self-improve (info)", async () => {
      const r = await fetch(`${BASE}/api/cron/self-improve`, {
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    });

    await test("POST /api/cron/generate-briefs (info)", async () => {
      const r = await fetch(`${BASE}/api/cron/generate-briefs`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    });

    // Trigger auto-scan (the main pipeline)
    console.log("\n── PIPELINE: Auto-Scan (scout+signals+trends+news) ──");
    console.log("  ⏳ This calls the full pipeline, may take 30-120s...\n");

    await test("POST /api/cron/auto-scan", async () => {
      const r = await fetch(`${BASE}/api/cron/auto-scan`, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(180000),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      const d = await r.json();
      console.log(`\n    Sources found: ${d.stats?.sources ?? "?"}`);
      console.log(`    Signals: ${d.stats?.signals ?? "?"}`);
      console.log(`    News signals: ${d.stats?.newsSignals ?? "?"}`);
      console.log(`    Trends: ${d.stats?.trends ?? "?"}`);
      console.log(`    Verticals: ${d.stats?.verticalsProcessed ?? "?"}`);
    });
  }

  // ── SUMMARY ──
  console.log("\n══════════════════════════════════════════");
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  if (fail === 0) {
    console.log("  ✅ NomosX pipeline is OPERATIONAL");
  } else {
    console.log("  ⚠️  Some tests failed — check above");
  }
  console.log("══════════════════════════════════════════\n");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
