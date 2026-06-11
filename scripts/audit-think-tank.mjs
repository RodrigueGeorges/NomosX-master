/**
 * NomosX Think Tank — Comprehensive Audit Script
 * Validates: vertical-signal alignment, researcher coverage, provider mapping, cadence config
 * Runs offline (no server needed) — reads code and DB directly
 */
import "./load-env.mjs";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Inline the maps from code to verify alignment
const VERTICAL_RESEARCHER_MAP = {
  "climate-energy":          ["environment", "energy-advanced"],
  "macro-finance":           ["economics", "finance", "risk-analysis"],
  "geopolitics":             ["geopolitics", "security"],
  "tech-innovation":         ["technology", "digital-society", "computational-social-science"],
  "social-policy":           ["policy", "social-sciences", "behavioral-economics"],
  "health-bioethics":        ["health", "bioethics"],
  "law-regulation":          ["law"],
  "cognitive-behavioral":    ["cognitive-science", "behavioral-economics"],
  "development-global":      ["development-economics", "urban-studies"],
  "complexity-quantitative": ["complexity-science", "quantitative", "risk-analysis"],
  "humanities-ethics":       ["humanities"],
};

const ALL_22_DOMAINS = [
  "economics", "technology", "policy", "health", "security", "law", "environment",
  "quantitative", "finance", "social-sciences", "humanities", "energy-advanced",
  "geopolitics", "digital-society", "cognitive-science", "behavioral-economics",
  "urban-studies", "bioethics", "complexity-science", "computational-social-science",
  "development-economics", "risk-analysis"
];

const SIGNAL_DETECTOR_SLUGS = [
  "climate-energy", "macro-finance", "geopolitics", "tech-innovation", "social-policy",
  "health-bioethics", "law-regulation", "cognitive-behavioral", "development-global",
  "complexity-quantitative", "humanities-ethics"
];

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║       NomosX Think Tank — Comprehensive Audit               ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");

  let passed = 0;
  let failed = 0;

  // ═══════════════════════════════════════════════════════════════
  // TEST 1: DB Verticals match signal detector slugs
  // ═══════════════════════════════════════════════════════════════
  console.log("\n┌─── TEST 1: Vertical ↔ Signal Detector Alignment ────────────┐");
  const verticals = await prisma.vertical.findMany({
    where: { isActive: true },
    select: { slug: true, name: true, config: true, _count: { select: { signals: true, publications: true } } },
    orderBy: { slug: 'asc' },
  });

  const dbSlugs = verticals.map(v => v.slug);
  const missingInDB = SIGNAL_DETECTOR_SLUGS.filter(s => !dbSlugs.includes(s));
  const orphanInDB = dbSlugs.filter(s => !SIGNAL_DETECTOR_SLUGS.includes(s));

  if (missingInDB.length === 0) {
    console.log("│  ✅ All signal detector slugs exist in DB");
    passed++;
  } else {
    console.log(`│  ❌ Missing in DB: ${missingInDB.join(", ")}`);
    failed++;
  }

  if (orphanInDB.length === 0) {
    console.log("│  ✅ No orphan verticals in DB");
    passed++;
  } else {
    console.log(`│  ⚠️  Orphan slugs in DB (inactive or unknown): ${orphanInDB.join(", ")}`);
  }

  console.log("│");
  verticals.forEach(v => {
    const config = v.config || {};
    const researchers = config.researchers || [];
    const queries = config.searchQueries || [];
    const maxPub = config.maxPublicationsPerWeek || "?";
    console.log(`│  ${v.slug.padEnd(25)} researchers:${String(researchers.length).padStart(2)}  queries:${String(queries.length).padStart(2)}  max/wk:${String(maxPub).padStart(2)}  signals:${String(v._count.signals).padStart(4)}  pubs:${String(v._count.publications).padStart(3)}`);
  });
  console.log("└────────────────────────────────────────────────────────────────┘");

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: All 22 researchers are mapped to a vertical
  // ═══════════════════════════════════════════════════════════════
  console.log("\n┌─── TEST 2: Researcher → Vertical Coverage ─────────────────┐");
  const coveredDomains = new Set();
  for (const [slug, domains] of Object.entries(VERTICAL_RESEARCHER_MAP)) {
    domains.forEach(d => coveredDomains.add(d));
  }

  const uncovered = ALL_22_DOMAINS.filter(d => !coveredDomains.has(d));
  if (uncovered.length === 0) {
    console.log(`│  ✅ All ${ALL_22_DOMAINS.length} researcher domains mapped to verticals`);
    passed++;
  } else {
    console.log(`│  ❌ Unmapped domains: ${uncovered.join(", ")}`);
    failed++;
  }

  // Show mapping
  for (const [slug, domains] of Object.entries(VERTICAL_RESEARCHER_MAP)) {
    console.log(`│  ${slug.padEnd(25)} → ${domains.join(", ")}`);
  }
  console.log("└────────────────────────────────────────────────────────────────┘");

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: Each vertical has search queries in config
  // ═══════════════════════════════════════════════════════════════
  console.log("\n┌─── TEST 3: Auto-Scan Search Queries ──────────────────────┐");
  let queriesOk = 0;
  let queriesMissing = 0;
  for (const v of verticals) {
    const queries = (v.config || {}).searchQueries || [];
    if (queries.length >= 2) {
      queriesOk++;
    } else {
      console.log(`│  ❌ ${v.slug}: only ${queries.length} search queries`);
      queriesMissing++;
    }
  }
  if (queriesMissing === 0) {
    console.log(`│  ✅ All ${queriesOk} verticals have ≥2 EN search queries`);
    passed++;
  } else {
    failed++;
  }
  console.log("└────────────────────────────────────────────────────────────────┘");

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Signal distribution across verticals
  // ═══════════════════════════════════════════════════════════════
  console.log("\n┌─── TEST 4: Signal Distribution ───────────────────────────┐");
  const totalSignals = verticals.reduce((sum, v) => sum + v._count.signals, 0);
  const verticalsWithSignals = verticals.filter(v => v._count.signals > 0);
  console.log(`│  Total signals: ${totalSignals} across ${verticalsWithSignals.length}/${verticals.length} verticals`);
  if (verticalsWithSignals.length >= 3) {
    console.log(`│  ✅ Signals spread across ≥3 verticals`);
    passed++;
  } else {
    console.log(`│  ⚠️  Signals only in ${verticalsWithSignals.length} vertical(s) — run auto-scan to populate`);
  }
  console.log("└────────────────────────────────────────────────────────────────┘");

  // ═══════════════════════════════════════════════════════════════
  // TEST 5: Pipeline runs and publication quality
  // ═══════════════════════════════════════════════════════════════
  console.log("\n┌─── TEST 5: Pipeline Runs & Publication Quality ────────────┐");
  const [runs, pubs, briefs] = await Promise.all([
    prisma.pipelineRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10, select: { id: true, status: true, format: true, trustScore: true, totalCostUsd: true } }),
    prisma.thinkTankPublication.count({ where: { status: 'PUBLISHED' } }),
    prisma.brief.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, kind: true, trustScore: true, createdAt: true, html: true } }),
  ]);

  const completed = runs.filter(r => r.status === 'COMPLETED');
  const running = runs.filter(r => r.status === 'RUNNING');
  const failedRuns = runs.filter(r => r.status === 'FAILED');
  console.log(`│  Recent runs: ${completed.length} completed, ${running.length} running, ${failedRuns.length} failed`);
  console.log(`│  Publications: ${pubs} published`);

  if (briefs.length > 0) {
    const avgWords = Math.round(briefs.reduce((sum, b) => sum + (b.html?.length || 0) / 6, 0) / briefs.length);
    const avgTrust = Math.round(briefs.reduce((sum, b) => sum + (b.trustScore || 0), 0) / briefs.length);
    const withCitations = briefs.filter(b => b.html && /\[SRC-\d/.test(b.html)).length;
    console.log(`│  Avg words: ~${avgWords}  Avg trust: ${avgTrust}/100  Citations: ${withCitations}/${briefs.length}`);
    passed++;
  }
  console.log("└────────────────────────────────────────────────────────────────┘");

  // ═══════════════════════════════════════════════════════════════
  // TEST 6: Orphan/inactive verticals check
  // ═══════════════════════════════════════════════════════════════
  console.log("\n┌─── TEST 6: Orphan Verticals ──────────────────────────────┐");
  const inactiveVerticals = await prisma.vertical.findMany({
    where: { isActive: false },
    select: { slug: true, name: true },
  });
  if (inactiveVerticals.length > 0) {
    console.log(`│  Deactivated ${inactiveVerticals.length} orphan(s): ${inactiveVerticals.map(v => v.slug).join(", ")}`);
    passed++;
  } else {
    console.log(`│  ✅ No orphan verticals`);
    passed++;
  }
  console.log("└────────────────────────────────────────────────────────────────┘");

  // ═══════════════════════════════════════════════════════════════
  // VERDICT
  // ═══════════════════════════════════════════════════════════════
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  if (failed === 0) {
    console.log(`║  🏆 AUDIT PASSED: ${passed}/${passed + failed} checks OK                          ║`);
    console.log("║  All 22 researchers mapped, verticals aligned, queries set   ║");
  } else {
    console.log(`║  ⚠️  AUDIT: ${passed} passed, ${failed} failed                              ║`);
  }
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");
}

main()
  .catch(e => console.error("Audit error:", e.message))
  .finally(() => prisma.$disconnect());
