#!/usr/bin/env node
/**
 * End-to-end flow smoke test:
 * 1) Macro refresh
 * 2) Monitoring (one cycle)
 * 3) Signal detection (on new sources)
 * 4) Publication generation (on first signal)
 * 5) Weekly newsletter generation (no send guarantees)
 *
 * PowerShell:
 *   cd "C:\Users\madeleine.stephann\OneDrive\Bureau\NomosX"
 *   node --import tsx .\scripts\test-flow-e2e.mjs
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "dev-jwt-secret-please-change-32chars-min";
}
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "dev-openai-key";
}

import { prisma } from "../lib/db.ts";

// NOTE: dynamic imports below so we can set env vars before lib/env.ts is evaluated.

async function ensureVerticals() {
  const { VERTICALS } = await import("../lib/think-tank/verticals.ts");
  const existing = await prisma.vertical.findMany({ select: { slug: true } });
  const existingSlugs = new Set(existing.map((v) => v.slug));

  let created = 0;
  for (const v of VERTICALS) {
    if (existingSlugs.has(v.slug)) continue;
    await prisma.vertical.create({
      data: {
        slug: v.slug,
        name: v.name,
        nameEn: v.nameEn,
        description: v.description,
        icon: v.icon,
        color: v.color,
        config: v.config,
        isActive: true,
      },
    });
    created += 1;
  }

  console.log(`[E2E] verticals ensured. created=${created}`);
}

(async () => {
  console.log("\n=== E2E FLOW TEST ===\n");

  await ensureVerticals();

  const { refreshMacroSeries } = await import("../lib/agent/macro-refresh.ts");
  const { runMonitoringCycle } = await import("../lib/agent/monitoring-agent.ts");
  const { signalDetector } = await import("../lib/agent/signal-detector.ts");
  const { generatePublication } = await import("../lib/agent/publication-generator.ts");
  const { runWeeklyNewsletter } = await import("../lib/jobs/weekly-newsletter.ts");

  console.log("\n[1/5] Macro refresh...");
  const macro = await refreshMacroSeries();
  console.log(`[E2E] macro totalSeries=${macro.totalSeries} totalPoints=${macro.totalPoints}`);

  console.log("\n[2/5] Monitoring cycle (institutional providers)...");
  const cfg = {
    providers: ["cisa", "nist", "worldbank", "un", "imf", "oecd"],
    queries: ["economic stability", "inflation", "interest rates"],
    interval: 360,
    limit: 8,
    minQualityScore: 70,
    notifyOnNew: false,
  };

  const monitoringResults = await runMonitoringCycle(cfg);
  const newSources = monitoringResults.reduce((sum, r) => sum + (r.newSources || 0), 0);
  console.log(`[E2E] monitoring done. providers=${monitoringResults.length} newSources=${newSources}`);

  // Pick recent sources to feed signal detector
  console.log("\n[3/5] Signal detection...");
  const recentSources = await prisma.source.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { id: true },
  });
  const sourceIds = recentSources.map((s) => s.id);

  const signals = await signalDetector({ sourceIds });
  console.log(`[E2E] signalDetector detected=${signals.detected}`);

  const latestSignal = await prisma.signal.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!latestSignal) {
    console.log("[E2E] No signal in DB; skipping publication + newsletter steps.");
    process.exit(0);
  }

  console.log("\n[4/5] Publication generation (1 signal)...");
  const pub = await generatePublication({
    signalId: latestSignal.id,
    publicationType: "EXECUTIVE_BRIEF",
  });

  console.log(`[E2E] generatePublication success=${pub.success} id=${pub.publicationId} trust=${pub.trustScore}`);
  if (!pub.success) {
    console.log(`[E2E] publication error: ${pub.error}`);
  }

  console.log("\n[5/5] Weekly newsletter job (generate edition + attempt send depending on config)...");
  const newsletter = await runWeeklyNewsletter();
  console.log("[E2E] runWeeklyNewsletter:", newsletter);

  console.log("\n=== E2E FLOW TEST DONE ===\n");
  process.exit(0);
})().catch((e) => {
  console.error("E2E flow test failed:", e?.message || e);
  process.exit(1);
});
