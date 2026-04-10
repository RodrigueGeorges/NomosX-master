/**
 * NomosX Full System Diagnostic
 * Checks: signals, researchers, pipeline steps, publication quality, verticals
 */
import { readFileSync } from 'fs';

const BASE = "http://localhost:3000";
let S = "";
for (const f of ['.env', '.env.local']) {
  try {
    const e = readFileSync(f, 'utf8');
    const m = [...e.matchAll(/CRON_SECRET=["']?([^"'\r\n]+)/g)];
    if (m.length) S = m[m.length - 1][1];
  } catch {}
}

async function main() {
  const r = await fetch(BASE + "/api/test/pipeline", {
    headers: { Authorization: "Bearer " + S },
  });
  if (!r.ok) { console.log("HTTP", r.status); return; }
  const d = await r.json();

  // ═══════════════════════════════════════════
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║       NomosX — Full System Diagnostic                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  // 1. SIGNAL DETECTION (info récentes)
  console.log("\n┌─── 1. DÉTECTION D'INFORMATION RÉCENTES ───────────────────┐");
  console.log(`│  Signals détectés: ${d.signals?.total || 0}`);
  if (d.signals?.items?.length) {
    const byType = {};
    const byVertical = {};
    d.signals.items.forEach(s => {
      byType[s.signalType] = (byType[s.signalType] || 0) + 1;
      const vn = s.vertical?.name || "?";
      byVertical[vn] = (byVertical[vn] || 0) + 1;
    });
    console.log(`│  Par type: ${Object.entries(byType).map(([k,v]) => `${k}:${v}`).join(", ")}`);
    console.log(`│  Par vertical: ${Object.entries(byVertical).map(([k,v]) => `${k}:${v}`).join(", ")}`);
    console.log(`│  Dernier signal: ${d.signals.items[0]?.title?.slice(0, 55)}...`);
    console.log(`│  Date: ${d.signals.items[0]?.detectedAt || "?"}`);
  } else {
    console.log(`│  ⚠️  Aucun signal en DB (auto-scan pas encore exécuté)`);
  }
  console.log(`│  Sources totales en DB: ${d.totalSources || 0}`);
  console.log("└────────────────────────────────────────────────────────────┘");

  // 2. VERTICALS & COVERAGE
  console.log("\n┌─── 2. VERTICALES ACTIVES ─────────────────────────────────┐");
  if (d.verticals?.length) {
    d.verticals.forEach(v => {
      console.log(`│  ${v.name?.padEnd(30)} signals:${String(v._count?.signals || 0).padStart(3)}  pubs:${String(v._count?.publications || 0).padStart(3)}`);
    });
  } else {
    console.log(`│  ⚠️  Aucune verticale active`);
  }
  console.log("└────────────────────────────────────────────────────────────┘");

  // 3. PIPELINE STEPS (funnel d'agents)
  console.log("\n┌─── 3. FUNNEL D'AGENTS (pipeline steps) ───────────────────┐");
  const steps = d.pipelineStepsUsed || [];
  const stepsData = d.lastCompletedRunSteps || {};
  if (steps.length > 0) {
    console.log(`│  Steps actifs dans le dernier run: ${steps.length}`);
    steps.forEach(step => {
      const data = stepsData[step];
      let info = "";
      if (step === "scout") info = `found:${data?.found || "?"}`;
      else if (step === "rank") info = `top:${data?.count || "?"} avgQ:${data?.avgQuality || "?"}`;
      else if (step === "reader") info = `read:${data?.totalRead || "?"} fullText:${data?.fullTextCount || "?"}`;
      else if (step === "analyst") info = `passes:${data?.passes || "?"}`;
      else if (step === "harvardCouncil") info = `experts:${data?.expertCount || "?"} cost:$${data?.costUsd?.toFixed(3) || "?"}`;
      else if (step === "guard") info = `ok:${data?.ok} used:${data?.usedCount || "?"}`;
      else if (step === "criticalLoop") info = `score:${data?.finalScore || "?"}/100 iterations:${data?.iterations || "?"}`;
      else if (step === "debate") info = `confidence:${data?.confidenceInDominant || "?"}%`;
      else if (step === "metaAnalysis") info = `k:${data?.k || "?"} effect:${data?.pooledEffect || "?"}`;
      else if (step === "devilsAdvocate") info = `verdict:${data?.verdict || "?"}`;
      else if (step === "knowledgeGraph") info = `concepts:${data?.concepts || "?"} relations:${data?.relations || "?"}`;
      else if (step === "editor") info = typeof data === 'object' ? 'rendered' : '';
      else if (step === "brief") info = `id:${data?.id?.slice(0,8) || "?"}`;
      else if (step === "contextPrimer") info = `concepts:${data?.knownConcepts || "?"}`;
      else if (step === "embed") info = `embedded:${data?.embedded || "?"}`;
      else if (step === "citationVerifier") info = `integrity:${data?.integrity || "?"}%`;
      else if (step === "orchestrator") info = `decisions:${data?.decisions?.length || "?"}`;
      else info = JSON.stringify(data)?.slice(0, 40) || "";

      const icon = data?.error ? "❌" : "✅";
      console.log(`│  ${icon} ${step.padEnd(20)} ${info}`);
    });
  } else {
    console.log(`│  ⚠️  Aucun run complété trouvé`);
  }
  console.log("└────────────────────────────────────────────────────────────┘");

  // 4. RESEARCHER ACTIVITY (PhD agents)
  console.log("\n┌─── 4. ACTIVITÉ DES CHERCHEURS (PhD Agents) ───────────────┐");
  if (d.agentActivity?.length) {
    const byAgent = {};
    d.agentActivity.forEach(a => {
      if (!byAgent[a.agentName]) byAgent[a.agentName] = { count: 0, cost: 0 };
      byAgent[a.agentName].count++;
      byAgent[a.agentName].cost += a.costUsd || 0;
    });
    Object.entries(byAgent).forEach(([name, data]) => {
      console.log(`│  ${name?.padEnd(25)} actions:${String(data.count).padStart(3)}  cost:$${data.cost.toFixed(3)}`);
    });
  } else {
    console.log(`│  ℹ️  Pas de logs d'agents (AgentAuditLog vide ou table absente)`);
    console.log(`│  → Les PhD researchers fonctionnent via harvardCouncil dans le pipeline`);
  }
  console.log("└────────────────────────────────────────────────────────────┘");

  // 5. PUBLICATION QUALITY
  console.log("\n┌─── 5. QUALITÉ DES PUBLICATIONS ───────────────────────────┐");
  console.log(`│  Publications publiées: ${d.publishedPublications}`);
  if (d.recentBriefs?.length) {
    const briefTypes = { brief: [], strategic: [] };
    d.recentBriefs.forEach(b => {
      if (briefTypes[b.kind]) briefTypes[b.kind].push(b);
    });

    for (const [kind, items] of Object.entries(briefTypes)) {
      if (items.length === 0) continue;
      const avgWords = Math.round(items.reduce((a, b) => a + b.wordCount, 0) / items.length);
      const avgHtml = Math.round(items.reduce((a, b) => a + b.htmlLength, 0) / items.length);
      const withCitations = items.filter(b => b.hasCitations).length;
      console.log(`│  ${kind.toUpperCase().padEnd(12)} count:${items.length} avgWords:${avgWords} avgHTML:${avgHtml} citations:${withCitations}/${items.length}`);
    }
  }

  // Trust scores from runs
  const completed = d.pipelineRuns?.filter(r => r.status === "COMPLETED") || [];
  if (completed.length) {
    const scores = completed.map(r => r.trustScore).filter(Boolean);
    const avgTrust = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const costs = completed.map(r => r.totalCostUsd).filter(Boolean);
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
    console.log(`│  Trust moyen: ${avgTrust}/100 (range: ${Math.min(...scores)}-${Math.max(...scores)})`);
    console.log(`│  Coût moyen:  $${avgCost.toFixed(3)}/run`);
  }
  console.log("└────────────────────────────────────────────────────────────┘");

  // 6. VERDICT
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  const issues = [];
  if (!d.signals?.total) issues.push("Signals: aucun détecté (auto-scan pas exécuté)");
  if (d.totalSources < 100) issues.push("Sources: peu de sources en DB (" + d.totalSources + ")");
  if (completed.length === 0) issues.push("Pipeline: aucun run complété");
  if (!d.recentBriefs?.some(b => b.hasCitations)) issues.push("Publications: aucune citation trouvée");

  if (issues.length === 0) {
    console.log("║  🏆 VERDICT: SYSTÈME PLEINEMENT OPÉRATIONNEL              ║");
  } else if (issues.length <= 2) {
    console.log("║  ⚠️  VERDICT: OPÉRATIONNEL avec points d'attention         ║");
    issues.forEach(i => console.log(`║  → ${i.padEnd(55)}║`));
  } else {
    console.log("║  🚨 VERDICT: PROBLÈMES DÉTECTÉS                           ║");
    issues.forEach(i => console.log(`║  → ${i.padEnd(55)}║`));
  }
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
}

main().catch(e => console.error("Error:", e.message));
