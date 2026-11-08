#!/usr/bin/env tsx
/**
 * Full Pipeline with Radar — generates a real publication
 *
 * Runs the complete Think Tank cycle:
 * 1. TOPIC RADAR (GDELT, RSS, academic, DB signals)
 * 2. EDITORIAL TRIAGE (select best topics)
 * 3. PRE-FLIGHT SOURCE CHECK
 * 4. SCOUT → RANK → READER → ANALYST → EDITOR
 * 5. CITATION VERIFICATION + ACTIVE REPAIR
 * 6. PUBLICATION
 *
 * Usage:
 *   npx tsx scripts/run-full-pipeline.ts                    # breaking mode (radar-driven)
 *   npx tsx scripts/run-full-pipeline.ts --mode=weekly      # weekly mode
 *   npx tsx scripts/run-full-pipeline.ts --dry-run          # radar + triage only, no pipeline
 *   npx tsx scripts/run-full-pipeline.ts --max=1            # limit to 1 publication
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

process.env.EDITORIAL_V2 = 'true';

const args = process.argv.slice(2);
const mode = (args.find(a => a.startsWith('--mode='))?.slice(7) ?? 'breaking') as 'breaking' | 'weekly';
const dryRun = args.includes('--dry-run');
const maxPublications = parseInt(args.find(a => a.startsWith('--max='))?.slice(6) ?? '1', 10);
const budgetUsd = parseFloat(args.find(a => a.startsWith('--budget='))?.slice(9) ?? (mode === 'breaking' ? '5.0' : '10.0'));

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 NOMOSX FULL PIPELINE — RADAR → TRIAGE → PUBLISH            ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${mode}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Max publications: ${maxPublications}`);
  console.log(`Editorial V2: ${process.env.EDITORIAL_V2}`);
  console.log('');

  const { runThinkTankCycle } = await import('../lib/agent/think-tank-dispatcher');

  console.log('══ Phase 1 — Topic Radar (signal detection) ══\n');

  const result = await runThinkTankCycle({
    mode,
    dryRun,
    maxPublications,
    budgetUsd,
    bypassCadence: true, // Force publication even if weekly slots are full
  });

  console.log('\n══ Results ══\n');
  console.log(`Mode: ${result.mode}`);
  console.log(`Success: ${result.success}`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`Collected: ${result.collected} topics`);
  console.log(`Published: ${result.published}`);
  console.log(`Held: ${result.held}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Total cost: $${result.totalCostUsd.toFixed(4)}`);
  console.log(`Decide cost: $${result.decideCostUsd.toFixed(4)}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of result.errors.slice(0, 10)) {
      console.log(`  - ${err}`);
    }
  }

  if (result.outcomes && result.outcomes.length > 0) {
    console.log(`\nOutcomes:`);
    for (const o of result.outcomes) {
      console.log(`  - [${o.result.status}] ${o.item.question.slice(0, 80)}`);
      console.log(`    Domain: ${o.item.domain}, Strategy: ${o.item.strategy}`);
      if (o.result.trustScore !== undefined) {
        console.log(`    Trust: ${o.result.trustScore}`);
      }
      if (o.result.briefId) {
        console.log(`    Brief ID: ${o.result.briefId}`);
      }
    }
  }

  if (result.topics && result.topics.length > 0) {
    console.log(`\nTopics detected by radar:`);
    for (const t of result.topics.slice(0, 10)) {
      console.log(`  - [${t.score?.toFixed(0) ?? 'N/A'}] ${t.label?.slice(0, 80) ?? t.title?.slice(0, 80)}`);
    }
  }

  if (result.phases) {
    console.log(`\nPhases:`);
    console.log(JSON.stringify(result.phases, null, 2));
  }

  console.log(`\n✅ Done — ${result.published} publication(s) generated`);
  process.exit(result.success ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
