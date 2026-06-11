#!/usr/bin/env npx tsx
/**
 * NomosX — Audit institutionnel complet (Pipeline + Publication)
 *
 * Benchmarks: France Stratégie · Harvard/Brookings · McKinsey GMI · RAND · NomosX Gate
 *
 * USAGE:
 *   npx tsx scripts/institutional-quality-audit.ts                    # audit complet DB
 *   npx tsx scripts/institutional-quality-audit.ts --published-only   # publications PUBLISHED
 *   npx tsx scripts/institutional-quality-audit.ts --limit=20         # limiter le scan
 *   npx tsx scripts/institutional-quality-audit.ts --json             # export JSON stdout
 *   npx tsx scripts/institutional-quality-audit.ts --html report.html # rapport HTML
 *   npx tsx scripts/institutional-quality-audit.ts --hold-failing     # HELD si score < 70 ou gate fail
 *   npx tsx scripts/institutional-quality-audit.ts --pipeline         # santé pipeline + jobs
 *   npx tsx scripts/institutional-quality-audit.ts --live-test        # test synthétique Critical Loop (LLM)
 *   npx tsx scripts/institutional-quality-audit.ts --strict           # exit 1 si < gold (80)
 *
 * PRÉREQUIS (autre machine):
 *   npm install && npx prisma generate && npx prisma db push
 *   DATABASE_URL dans .env.local
 *   --live-test nécessite OPENAI_API_KEY
 */

import "./load-env.mjs";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import {
  auditPublication,
  summarizeAuditResults,
  tierLabel,
  type InstitutionalTier,
  type PipelineHealthSnapshot,
  type PublicationAuditResult,
} from "../lib/audit/institutional-quality";

const prisma = new PrismaClient();

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const getArg = (prefix: string) => args.find((a) => a.startsWith(prefix))?.split("=")[1];

const publishedOnly = flags.has("--published-only");
const asJson = flags.has("--json");
const strictMode = flags.has("--strict");
const holdFailing = flags.has("--hold-failing");
const pipelineOnly = flags.has("--pipeline");
const includePipeline = flags.has("--pipeline") || !flags.has("--publications-only");
const liveTest = flags.has("--live-test");
const limit = Number.parseInt(getArg("--limit=") ?? "", 10);
const htmlOut = getArg("--html=");
const minTier = (getArg("--min-tier=") ?? "silver") as InstitutionalTier;

// ─── Terminal styling ────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  grey: "\x1b[90m",
};

const tierColor: Record<InstitutionalTier, string> = {
  platinum: C.magenta,
  gold: C.green,
  silver: C.cyan,
  bronze: C.yellow,
  fail: C.red,
};

function bar(score: number, w = 28): string {
  const filled = Math.round((score / 100) * w);
  const col = score >= 90 ? C.magenta : score >= 80 ? C.green : score >= 70 ? C.cyan : score >= 60 ? C.yellow : C.red;
  return `${col}${"█".repeat(filled)}${C.grey}${"░".repeat(w - filled)}${C.reset} ${score}`;
}

function header(title: string) {
  console.log(`\n${C.bold}${"═".repeat(78)}${C.reset}`);
  console.log(`${C.bold}  ${title}${C.reset}`);
  console.log(`${C.bold}${"═".repeat(78)}${C.reset}\n`);
}

function section(title: string) {
  console.log(`\n${C.cyan}${C.bold}── ${title} ${"─".repeat(Math.max(0, 70 - title.length))}${C.reset}`);
}

// ─── Infrastructure ────────────────────────────────────────────────────────────

async function checkInfrastructure(): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];
  const requiredEnv = ["DATABASE_URL"];
  const recommendedEnv = ["OPENAI_API_KEY", "CRON_SECRET"];

  for (const key of requiredEnv) {
    if (!process.env[key]) issues.push(`Missing required env: ${key}`);
  }
  for (const key of recommendedEnv) {
    if (!process.env[key]) issues.push(`Missing recommended env: ${key}`);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    issues.push(`Database unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }

  const agentFiles = [
    "lib/agent/pipeline-v2.ts",
    "lib/agent/inquiry-orchestrator.ts",
    "lib/agent/inquiry-pipeline.ts",
    "lib/agent/publication-gate.ts",
    "lib/agent/critical-loop-v2.ts",
    "lib/agent/devils-advocate.ts",
    "lib/agent/simulation-agent.ts",
    "lib/foresight/index.ts",
  ];
  const { existsSync } = await import("fs");
  const { join } = await import("path");
  for (const f of agentFiles) {
    if (!existsSync(join(process.cwd(), f))) issues.push(`Missing agent file: ${f}`);
  }

  return { ok: issues.filter((i) => i.startsWith("Missing required")).length === 0, issues };
}

// ─── Pipeline health ─────────────────────────────────────────────────────────

async function collectPipelineHealth(): Promise<PipelineHealthSnapshot> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stuckBefore = new Date(Date.now() - 45 * 60 * 1000);

  const [runs, pubs, briefs, foresightRuns] = await Promise.all([
    prisma.pipelineRun.groupBy({
      by: ["status"],
      _count: true,
      where: { createdAt: { gte: since7d } },
    }),
    prisma.thinkTankPublication.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.brief.findMany({
      where: { createdAt: { gte: since7d } },
      select: { id: true, lineage: true },
      take: 500,
    }),
    prisma.foresightRun.count().catch(() => -1),
  ]);

  const runMap = Object.fromEntries(runs.map((r) => [r.status, r._count]));
  const pubMap = Object.fromEntries(pubs.map((p) => [p.status, p._count]));

  const stuckRunning = await prisma.pipelineRun.count({
    where: { status: "RUNNING", startedAt: { lt: stuckBefore } },
  });

  const missingPublicId = await prisma.thinkTankPublication.count({
    where: { status: "PUBLISHED", publicId: null },
  });

  const pubsWithMeta = await prisma.thinkTankPublication.findMany({
    where: { status: "PUBLISHED" },
    select: { criticalLoopResult: true, html: true },
    take: 500,
  });

  let withSimulation = 0;
  let withForesightPanel = 0;
  for (const p of pubsWithMeta) {
    const meta = (p.criticalLoopResult ?? {}) as Record<string, unknown>;
    if (meta.simulation || meta.foresight) withSimulation++;
    if (p.html.includes("data-nomosx-foresight") || p.html.includes('id="simulated-outcomes"')) {
      withForesightPanel++;
    }
  }

  let jobsFailed = 0;
  let jobsPending = 0;
  try {
    jobsFailed = await prisma.job.count({
      where: { status: "FAILED", createdAt: { gte: since7d } },
    });
    jobsPending = await prisma.job.count({ where: { status: "PENDING" } });
  } catch {
    /* Job table optional */
  }

  return {
    pipelineRuns: {
      total: Object.values(runMap).reduce((a, b) => a + b, 0),
      running: runMap.RUNNING ?? 0,
      failed: runMap.FAILED ?? 0,
      completed: runMap.COMPLETED ?? 0,
      stuckRunning,
    },
    publications: {
      total: Object.values(pubMap).reduce((a, b) => a + b, 0),
      published: pubMap.PUBLISHED ?? 0,
      held: pubMap.HELD ?? 0,
      missingPublicId,
    },
    foresight: {
      withSimulation,
      withForesightPanel,
      withForesightRun: foresightRuns >= 0 ? foresightRuns : 0,
    },
    briefs: {
      withLineage: briefs.filter((b) => b.lineage).length,
      withSimulation: briefs.filter((b) => {
        const l = b.lineage as Record<string, unknown> | null;
        return Boolean(l?.simulation);
      }).length,
    },
    jobs: { failedLast7d: jobsFailed, pending: jobsPending },
  };
}

function printPipelineHealth(h: PipelineHealthSnapshot) {
  section("Santé Pipeline (7 derniers jours)");
  console.log(`  PipelineRuns   : ${h.pipelineRuns.total} total | ${C.green}${h.pipelineRuns.completed} OK${C.reset} | ${C.red}${h.pipelineRuns.failed} FAIL${C.reset} | ${h.pipelineRuns.running} running`);
  if (h.pipelineRuns.stuckRunning > 0) {
    console.log(`  ${C.red}⚠ ${h.pipelineRuns.stuckRunning} run(s) RUNNING > 45min — investiguer${C.reset}`);
  }
  console.log(`  Publications   : ${h.publications.total} | ${h.publications.published} PUBLISHED | ${h.publications.held} HELD`);
  if (h.publications.missingPublicId > 0) {
    console.log(`  ${C.yellow}⚠ ${h.publications.missingPublicId} PUBLISHED sans publicId${C.reset}`);
  }
  console.log(`  Foresight      : ${h.foresight.withSimulation} sim metadata | ${h.foresight.withForesightPanel} HTML panel | ${h.foresight.withForesightRun} ForesightRun rows`);
  console.log(`  Briefs (7j)    : ${h.briefs.withLineage} avec lineage | ${h.briefs.withSimulation} avec simulation`);
  if (h.jobs) {
    console.log(`  Jobs           : ${h.jobs.pending} pending | ${h.jobs.failedLast7d} failed (7j)`);
  }
}

// ─── Publication audit ─────────────────────────────────────────────────────────

async function auditAllPublications(): Promise<PublicationAuditResult[]> {
  const pubs = await prisma.thinkTankPublication.findMany({
    where: publishedOnly ? { status: "PUBLISHED" } : undefined,
    orderBy: { publishedAt: "desc" },
    take: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    select: {
      id: true,
      publicId: true,
      title: true,
      type: true,
      status: true,
      html: true,
      wordCount: true,
      trustScore: true,
      qualityScore: true,
      citationCoverage: true,
      sourceIds: true,
      publishedAt: true,
      criticalLoopResult: true,
    },
  });

  const allSourceIds = [...new Set(pubs.flatMap((p) => p.sourceIds))];
  const sources =
    allSourceIds.length > 0
      ? await prisma.source.findMany({
          where: { id: { in: allSourceIds } },
          select: { id: true, provider: true, qualityScore: true, doi: true },
        })
      : [];
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  return pubs.map((pub) =>
    auditPublication({
      ...pub,
      criticalLoopResult: pub.criticalLoopResult as Record<string, unknown> | null,
      sourceMeta: pub.sourceIds.map((id) => sourceById.get(id)).filter(Boolean) as Array<{
        id: string;
        provider: string;
        qualityScore: number | null;
        doi: string | null;
      }>,
    })
  );
}

function printPublicationReport(results: PublicationAuditResult[]) {
  const summary = summarizeAuditResults(results);

  section("Résumé institutionnel");
  console.log(`  Publications auditées : ${summary.total}`);
  console.log(`  Score composite moyen : ${bar(summary.avgComposite)}`);
  console.log(`  ${C.magenta}Platinum (≥90)${C.reset} : ${summary.byTier.platinum}`);
  console.log(`  ${C.green}Gold (≥80)${C.reset}     : ${summary.byTier.gold}`);
  console.log(`  ${C.cyan}Silver (≥70)${C.reset}   : ${summary.byTier.silver}`);
  console.log(`  ${C.yellow}Bronze (≥60)${C.reset}   : ${summary.byTier.bronze}`);
  console.log(`  ${C.red}Fail (<60)${C.reset}     : ${summary.byTier.fail}`);
  console.log(`  Échecs critiques      : ${summary.criticalFailures}`);

  section("Benchmarks institutionnels (publications conformes)");
  const labels: Record<string, string> = {
    france_strategie: "France Stratégie",
    harvard_brookings: "Harvard / Brookings",
    mckinsey: "McKinsey GMI",
    rand: "RAND Corporation",
    nomosx_gate: "NomosX Publication Gate",
  };
  for (const [id, label] of Object.entries(labels)) {
    const count = summary.benchmarkPassRates[id as keyof typeof summary.benchmarkPassRates];
    const pct = summary.total ? Math.round((count / summary.total) * 100) : 0;
    const icon = pct >= 80 ? `${C.green}✓${C.reset}` : pct >= 50 ? `${C.yellow}~${C.reset}` : `${C.red}✗${C.reset}`;
    console.log(`  ${icon} ${label.padEnd(22)} ${count}/${summary.total} (${pct}%)`);
  }

  const failing = results
    .filter((r) => r.tier === "fail" || r.tier === "bronze" || r.failures.length > 0)
    .sort((a, b) => a.compositeScore - b.compositeScore);

  if (failing.length > 0) {
    section(`Publications à corriger (${failing.length})`);
    for (const r of failing.slice(0, 25)) {
      const col = tierColor[r.tier];
      console.log(`\n  ${col}${C.bold}[${r.tier.toUpperCase()}]${C.reset} ${bar(r.compositeScore)}  ${r.title.slice(0, 55)}${r.title.length > 55 ? "…" : ""}`);
      console.log(`  ${C.dim}${r.publicId ?? r.publicationId} | ${r.type} | gate=${r.gateDecision}${C.reset}`);
      for (const f of r.failures.slice(0, 4)) {
        console.log(`    ${C.red}✗${C.reset} ${f}`);
      }
      for (const b of Object.entries(r.benchmarks).filter(([, v]) => !v.passed).slice(0, 2)) {
        console.log(`    ${C.yellow}○${C.reset} ${b[0]}: ${b[1].gaps.slice(0, 2).join("; ")}`);
      }
    }
    if (failing.length > 25) {
      console.log(`\n  ${C.dim}… et ${failing.length - 25} autres (utilisez --json pour la liste complète)${C.reset}`);
    }
  }

  const top = [...results].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 5);
  if (top.length) {
    section("Top 5 — référence qualité");
    for (const r of top) {
      console.log(`  ${tierColor[r.tier]}${r.compositeScore}${C.reset}  ${r.title.slice(0, 60)}  ${C.dim}(${tierLabel(r.tier)})${C.reset}`);
    }
  }
}

// ─── Live pipeline test (optional LLM) ─────────────────────────────────────────

async function runLivePipelineTest(): Promise<{ ok: boolean; trustScore: number; details: string[] }> {
  section("Test live — Critical Loop V2 (LLM)");
  const details: string[] = [];

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log(`  ${C.red}OPENAI_API_KEY requis pour --live-test${C.reset}`);
    return { ok: false, trustScore: 0, details: ["No LLM API key"] };
  }

  const { runCriticalLoopV2 } = await import("../lib/agent/critical-loop-v2");
  const syntheticHtml = `<h1>Test Audit Institutionnel</h1>
<h2>Executive Summary</h2>
<p>Carbon pricing mechanisms reduce emissions by 10–18% in OECD jurisdictions when price floors exceed €50/tCO₂ [SRC-1][SRC-2]. Implementation heterogeneity limits cross-country comparability [SRC-3].</p>
<h2>Evidence Synthesis</h2>
<p>Meta-analyses converge on short-run elasticity of −0.2 to −0.4 for industrial sectors [SRC-4][SRC-5]. Distributional impacts remain contested [SRC-6].</p>
<h2>Limitations & Uncertainties</h2>
<p>Evidence from emerging markets remains sparse. Political economy constraints may prevent optimal price paths [SRC-7].</p>
<h2>What Would Change Our Assessment</h2>
<p>Large-scale reversal in major emitter policies would materially shift conclusions [SRC-8].</p>`;

  const sources = Array.from({ length: 8 }, (_, i) => ({
    id: `src-${i + 1}`,
    title: `Source ${i + 1}`,
    provider: "openalex",
    qualityScore: 75 + i,
  }));

  try {
    const result = await runCriticalLoopV2({
      draftHtml: syntheticHtml,
      sources,
      maxIterations: 1,
      publishThreshold: 65,
    });
    const trust = result.compositeScore;
    details.push(`Composite ${trust}`, `Methodology ${result.methodology.overallScore}`, `Adversarial ${result.adversarial.overallScore}`);
    console.log(`  Composite  : ${bar(trust)}`);
    console.log(`  Methodology: ${bar(result.methodology.overallScore)}`);
    console.log(`  Adversarial: ${bar(result.adversarial.overallScore)}`);
    console.log(`  Cost       : $${result.totalCostUsd?.toFixed(4) ?? "?"}`);
    return { ok: trust >= 65, trustScore: trust, details };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ${C.red}Critical Loop failed: ${msg}${C.reset}`);
    return { ok: false, trustScore: 0, details: [msg] };
  }
}

// ─── HTML report ─────────────────────────────────────────────────────────────

function generateHtmlReport(
  results: PublicationAuditResult[],
  health: PipelineHealthSnapshot | null,
  infra: { ok: boolean; issues: string[] }
): string {
  const summary = summarizeAuditResults(results);
  const rows = results
    .map(
      (r) => `<tr>
        <td>${esc(r.tier)}</td>
        <td>${r.compositeScore}</td>
        <td>${esc(r.title)}</td>
        <td>${esc(r.type)}</td>
        <td>${r.gateDecision}</td>
        <td>${r.failures.length ? esc(r.failures.join("; ")) : "—"}</td>
      </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><title>NomosX Institutional Audit</title>
<style>
  body{font-family:system-ui,sans-serif;margin:2rem;background:#0a0a0f;color:#e2e8f0}
  h1{color:#5eead4} table{border-collapse:collapse;width:100%;margin-top:1rem}
  th,td{border:1px solid #334155;padding:.5rem;text-align:left;font-size:.9rem}
  th{background:#1e293b}.platinum{color:#e879f9}.gold{color:#4ade80}.fail{color:#f87171}
  .metric{display:inline-block;margin:.5rem 1rem;padding:1rem;background:#1e293b;border-radius:8px}
</style></head><body>
<h1>NomosX — Audit Institutionnel</h1>
<p>Généré ${new Date().toISOString()}</p>
<div class="metric"><strong>${summary.total}</strong><br/>Publications</div>
<div class="metric"><strong>${summary.avgComposite}</strong><br/>Score moyen</div>
<div class="metric"><strong>${summary.byTier.platinum + summary.byTier.gold}</strong><br/>Gold+</div>
<div class="metric"><strong>${summary.criticalFailures}</strong><br/>Échecs critiques</div>
${health ? `<h2>Pipeline</h2><pre>${esc(JSON.stringify(health, null, 2))}</pre>` : ""}
${infra.issues.length ? `<h2>Infrastructure</h2><ul>${infra.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
<h2>Publications</h2>
<table><thead><tr><th>Tier</th><th>Score</th><th>Titre</th><th>Type</th><th>Gate</th><th>Échecs</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Hold failing ────────────────────────────────────────────────────────────

async function holdFailingPublications(results: PublicationAuditResult[]) {
  const toHold = results.filter(
    (r) =>
      r.status === "PUBLISHED" &&
      (r.compositeScore < 70 || r.gateDecision === "hold" || r.tier === "fail")
  );
  if (!toHold.length) {
    console.log(`\n  ${C.green}Aucune publication à rétrograder en HELD.${C.reset}`);
    return 0;
  }
  await prisma.thinkTankPublication.updateMany({
    where: { id: { in: toHold.map((r) => r.publicationId) } },
    data: { status: "HELD", publishedAt: null },
  });
  console.log(`\n  ${C.yellow}→ ${toHold.length} publication(s) passées en HELD${C.reset}`);
  return toHold.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  header("NomosX — Audit Institutionnel Complet");
  console.log(`${C.dim}Benchmarks: France Stratégie · Harvard · McKinsey · RAND · NomosX Gate${C.reset}`);
  console.log(`${C.dim}${new Date().toISOString()}${C.reset}`);

  const infra = await checkInfrastructure();
  section("Infrastructure");
  if (infra.ok) {
    console.log(`  ${C.green}✓${C.reset} Database + agents core OK`);
  } else {
    console.log(`  ${C.red}✗${C.reset} Problèmes infrastructure:`);
    infra.issues.forEach((i) => console.log(`    - ${i}`));
  }

  let health: PipelineHealthSnapshot | null = null;
  if (includePipeline) {
    health = await collectPipelineHealth();
    printPipelineHealth(health);
    if (health.pipelineRuns.stuckRunning > 0) {
      console.log(`  ${C.dim}→ SELECT * FROM "PipelineRun" WHERE status='RUNNING' AND "startedAt" < NOW() - INTERVAL '45 min';${C.reset}`);
    }
  }

  if (pipelineOnly) {
    console.log(`\n${C.dim}Durée: ${((Date.now() - started) / 1000).toFixed(1)}s${C.reset}`);
    process.exit(infra.ok ? 0 : 1);
  }

  let liveResult: Awaited<ReturnType<typeof runLivePipelineTest>> | null = null;
  if (liveTest) {
    liveResult = await runLivePipelineTest();
  }

  const results = await auditAllPublications();

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          infrastructure: infra,
          pipelineHealth: health,
          liveTest: liveResult,
          summary: summarizeAuditResults(results),
          publications: results,
        },
        null,
        2
      )
    );
  } else {
    printPublicationReport(results);
  }

  if (htmlOut) {
    writeFileSync(htmlOut, generateHtmlReport(results, health, infra));
    console.log(`\n  ${C.green}Rapport HTML → ${htmlOut}${C.reset}`);
  }

  if (holdFailing) {
    await holdFailingPublications(results);
  }

  const summary = summarizeAuditResults(results);
  const tierOrder: InstitutionalTier[] = ["fail", "bronze", "silver", "gold", "platinum"];
  const minTierIdx = tierOrder.indexOf(minTier);

  header("Verdict final");
  const institutionalOk =
    infra.ok &&
    (health?.pipelineRuns.stuckRunning ?? 0) === 0 &&
    summary.byTier.fail === 0 &&
    (strictMode ? summary.byTier.platinum + summary.byTier.gold === summary.total : summary.avgComposite >= 70);

  if (institutionalOk) {
    console.log(`  ${C.green}${C.bold}✓ Système conforme aux standards institutionnels NomosX${C.reset}`);
  } else {
    console.log(`  ${C.red}${C.bold}✗ Écarts détectés — voir détails ci-dessus${C.reset}`);
    if (summary.byTier.fail > 0) console.log(`    • ${summary.byTier.fail} publication(s) en tier FAIL`);
    if ((health?.pipelineRuns.stuckRunning ?? 0) > 0) console.log(`    • Pipeline runs bloqués`);
    if (strictMode && summary.byTier.platinum + summary.byTier.gold < summary.total) {
      console.log(`    • Mode --strict: toutes les publications doivent être Gold+ (≥80)`);
    }
  }

  console.log(`\n${C.dim}Durée totale: ${((Date.now() - started) / 1000).toFixed(1)}s${C.reset}`);
  console.log(`${C.dim}Commandes utiles:${C.reset}`);
  console.log(`${C.dim}  npm run audit:institutional -- --json > audit.json${C.reset}`);
  console.log(`${C.dim}  npm run audit:institutional -- --hold-failing --published-only${C.reset}`);
  console.log(`${C.dim}  npm run foresight:backfill${C.reset}\n`);

  const belowMinTier = results.filter((r) => tierOrder.indexOf(r.tier) < minTierIdx).length;
  const exitCode =
    !infra.ok || belowMinTier > 0 || (strictMode && summary.byTier.platinum + summary.byTier.gold < summary.total)
      ? 1
      : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
