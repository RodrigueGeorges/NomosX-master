import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const issues = [];
const warnings = [];
const passes = [];

// ── 1. Check page/route broken imports ──
console.log("\n== 1. Import Resolution ==");
let checked = 0, broken = 0;
function walk(dir) {
  try {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory() && f !== "node_modules" && !f.startsWith(".")) walk(full);
      else if (f === "page.tsx" || f === "route.ts") {
        checked++;
        const c = fs.readFileSync(full, "utf8");
        for (const m of c.matchAll(/from\s+['"](@\/[^'"]+)['"]/g)) {
          const mod = m[1].replace("@/", "");
          const ok = [".ts",".tsx","/index.ts","/index.tsx",".js",".mjs"].some(e => fs.existsSync(path.join(ROOT, mod + e)));
          if (!ok) { broken++; issues.push("[IMPORT] " + path.relative(ROOT, full) + " -> @/" + mod); }
        }
      }
    }
  } catch (e) {}
}
walk(path.join(ROOT, "app"));
console.log("  Checked:", checked, "| Broken:", broken);

// ── 2. Netlify Functions ──
console.log("\n== 2. Netlify Functions ==");
const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
const scheduled = [...toml.matchAll(/\[functions\."([^"]+)"\]/g)].map(m => m[1]);
console.log("  Scheduled in toml:", scheduled.join(", "));

const fnDir = path.join(ROOT, "netlify", "functions");
for (const file of fs.readdirSync(fnDir)) {
  const c = fs.readFileSync(path.join(fnDir, file), "utf8");
  if (file.endsWith(".ts") && !c.includes("export { handler }") && !c.includes("export async function handler") && !c.includes("schedule(") && !c.includes("DEPRECATED")) {
    issues.push("[NETLIFY] " + file + " — handler NOT exported");
  }
}

for (const name of scheduled) {
  const route = path.join(ROOT, "app", "api", "cron", name.replace("cron-", ""), "route.ts");
  if (!fs.existsSync(route)) issues.push("[CRON] " + name + " — API route missing");
  else passes.push("Cron route: " + name);
}

// ── 3. Pipeline exports ──
console.log("\n== 3. Pipeline Flow ==");
const pipeline = fs.readFileSync(path.join(ROOT, "lib", "agent", "pipeline-v2.ts"), "utf8");
for (const exp of ["scout","index","rank","read","analyst","citationGuard","renderBriefHTML","runPipeline"]) {
  if (!pipeline.includes("export") || (!pipeline.includes(`function ${exp}`) && !pipeline.includes(`const ${exp}`))) {
    issues.push("[PIPELINE] Missing export: " + exp);
  }
}

const agents = ["signal-detector.ts","editorial-planner.ts","publication-generator.ts","trend-analyzer.ts","contradiction-detector.ts","smart-provider-selector.ts","context-primer.ts","reader-agent-v3.ts","analyst-multipass.ts","debate-agent.ts"];
let agentOk = 0;
for (const a of agents) {
  if (fs.existsSync(path.join(ROOT, "lib", "agent", a))) agentOk++;
  else issues.push("[AGENT] Missing: " + a);
}
console.log("  Agents:", agentOk + "/" + agents.length);

// ── 4. Frontend pages ──
console.log("\n== 4. Frontend Pages ==");
const pages = ["app/page.tsx","app/about/page.tsx","app/pricing/page.tsx","app/methodology/page.tsx","app/researchers/page.tsx","app/articles/page.tsx","app/publications/page.tsx","app/privacy/page.tsx","app/terms/page.tsx","app/layout.tsx","app/error.tsx","app/loading.tsx"];
let pageOk = 0;
for (const p of pages) {
  if (fs.existsSync(path.join(ROOT, p))) pageOk++;
  else issues.push("[PAGE] Missing: " + p);
}
console.log("  Pages:", pageOk + "/" + pages.length);

// ── 5. Key providers ──
console.log("\n== 5. Providers ==");
const provs = ["lib/providers/wikidata.ts","lib/providers/registry-bridge.ts","lib/providers/linkup-sdk.ts","lib/providers/openalex.ts"];
let provOk = 0;
for (const p of provs) {
  if (fs.existsSync(path.join(ROOT, p))) provOk++;
  else issues.push("[PROVIDER] Missing: " + p);
}
console.log("  Providers:", provOk + "/" + provs.length);

// ── 6. Env config ──
console.log("\n== 6. Environment ==");
const envTs = fs.readFileSync(path.join(ROOT, "lib", "env.ts"), "utf8");
for (const v of ["DATABASE_URL","OPENAI_API_KEY","JWT_SECRET","CRON_SECRET","NEWSAPI_KEY"]) {
  if (!envTs.includes(v)) issues.push("[ENV] Missing: " + v);
}

// ── 7. Vertical config ──
console.log("\n== 7. Verticals ==");
const verticals = fs.readFileSync(path.join(ROOT, "lib", "think-tank", "verticals.ts"), "utf8");
for (const v of ["geopolitics","eu-policy","climate-industry","ai-labor","finance-regulation"]) {
  if (verticals.includes(v)) passes.push("Vertical: " + v);
  else issues.push("[VERTICAL] Missing: " + v);
}

// ── SUMMARY ──
console.log("\n" + "=".repeat(50));
console.log("AUDIT SUMMARY");
console.log("=".repeat(50));
console.log("\n❌ ISSUES (" + issues.length + "):");
issues.forEach(i => console.log("  " + i));
if (warnings.length) { console.log("\n⚠️  WARNINGS (" + warnings.length + "):"); warnings.forEach(w => console.log("  " + w)); }
console.log("\n✅ PASSES (" + passes.length + "):");
passes.forEach(p => console.log("  " + p));
console.log("\nScore: " + (issues.length === 0 ? "PERFECT" : issues.length <= 3 ? "GOOD" : issues.length <= 10 ? "NEEDS FIXES" : "CRITICAL"));
