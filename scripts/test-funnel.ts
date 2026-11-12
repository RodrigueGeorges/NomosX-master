/**
 * Funnel Test — runs the FULL NomosX swarm end-to-end:
 *   ThinkTankDispatcher → InquiryOrchestrator → InquiryPipeline → runPipeline
 *
 * This tests everything that was recently built:
 *   - Topic Radar (news detection)
 *   - Editor-in-Chief (triage)
 *   - Topic Classifier (domain/urgency/tier)
 *   - Editorial Planner (agenda)
 *   - Smart Provider Selector
 *   - Inquiry Orchestrator (dedup, vertical, gate, sign-off, persist)
 *   - Inquiry Pipeline (depth→format, foresight)
 *   - runPipeline (all agents: SCOUT→INDEX→RANK→READER→ANALYST→HARVARD→EDITOR→CRITICAL LOOP→DEBATE→DEVIL'S ADVOCATE→PUBLISHER→KG)
 *   - Publication Gate (trust/quality/citations threshold)
 *   - Publication Readiness (word count, source count)
 *   - Researcher Sign-Off
 *   - ThinkTankPublication persistence
 *
 * Usage:
 *   node --import tsx scripts/test-funnel.ts                              # breaking mode (radar + triage)
 *   node --import tsx scripts/test-funnel.ts weekly                        # weekly mode (editorial plan)
 *   node --import tsx scripts/test-funnel.ts "your query" direct           # direct inquiry (skip radar)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const mode = process.argv[2] || 'breaking';
const customQuery = process.argv[3] === 'direct' ? process.argv[2] : undefined;

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  NomosX — FULL FUNNEL TEST (Swarm)                         ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log(`  Mode: ${mode}`);
console.log(`  Started: ${new Date().toISOString()}\n`);

async function main() {
  const start = Date.now();

  // ─── PHASE 1: Think Tank Dispatcher (autonomous swarm) ───
  if (mode === 'breaking' || mode === 'weekly') {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PHASE 1: THINK TANK DISPATCHER');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { runThinkTankCycle } = await import('../lib/agent/think-tank-dispatcher');

    console.log(`  [Dispatcher] Launching ${mode} cycle...`);
    const cycleResult = await runThinkTankCycle({
      mode: mode as 'breaking' | 'weekly',
      maxPublications: 1,
      budgetUsd: 25,
      dryRun: false,
      bypassCadence: true,
    });

    console.log('\n  ── DISPATCHER RESULT ──');
    console.log(`  Success: ${cycleResult.success}`);
    console.log(`  Duration: ${(cycleResult.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Collected: ${cycleResult.collected} topics`);
    console.log(`  Published: ${cycleResult.published}`);
    console.log(`  Held: ${cycleResult.held}`);
    console.log(`  Skipped: ${cycleResult.skipped}`);
    console.log(`  Failed: ${cycleResult.failed}`);
    console.log(`  Total cost: $${cycleResult.totalCostUsd.toFixed(4)}`);
    console.log(`  Topics: ${cycleResult.topics.join(', ') || 'none'}`);

    if (cycleResult.errors.length > 0) {
      console.log(`  Errors:`);
      for (const err of cycleResult.errors) {
        console.log(`    - ${err}`);
      }
    }

    if (cycleResult.phases) {
      console.log(`  Phases: ${JSON.stringify(cycleResult.phases, null, 2).slice(0, 500)}`);
    }

    // Show outcomes
    for (const outcome of cycleResult.outcomes) {
      console.log(`\n  ── OUTCOME: "${outcome.item.question.slice(0, 60)}..." ──`);
      console.log(`  Status: ${outcome.result.status}`);
      console.log(`  Trust: ${outcome.result.trustScore}`);
      console.log(`  Quality: ${outcome.result.qualityScore}`);
      console.log(`  Words: ${outcome.result.wordCount}`);
      console.log(`  Cost: $${outcome.result.costUsd.toFixed(4)}`);
      console.log(`  Duration: ${(outcome.result.durationMs / 1000).toFixed(1)}s`);
      if (outcome.result.publicationId) {
        console.log(`  Publication ID: ${outcome.result.publicationId}`);
      }
      if (outcome.result.publicId) {
        console.log(`  Public ID: ${outcome.result.publicId}`);
      }
      if (outcome.result.gate) {
        console.log(`  Gate decision: ${outcome.result.gate.decision}`);
        console.log(`  Gate metrics: ${JSON.stringify(outcome.result.gate.metrics)}`);
      }
      if (outcome.result.readinessOk !== undefined) {
        console.log(`  Readiness OK: ${outcome.result.readinessOk}`);
      }
      if (outcome.result.error) {
        console.log(`  Error: ${outcome.result.error}`);
      }
    }

    const totalMin = ((Date.now() - start) / 60000).toFixed(1);
    console.log(`\n  Total funnel duration: ${totalMin} min`);
    console.log(`  Finished: ${new Date().toISOString()}`);

    if (cycleResult.success && cycleResult.published > 0) {
      console.log('\n  ✅ Funnel completed successfully\n');
    } else if (cycleResult.collected > 0 && cycleResult.published === 0) {
      console.log('\n  ⚠️  Funnel ran but nothing published (held/failed)\n');
    } else {
      console.log('\n  ⚠️  Funnel ran but no topics collected\n');
    }

    // Save latest publication HTML if available
    if (cycleResult.outcomes.length > 0 && cycleResult.outcomes[0].result.pipeline?.html) {
      const fs = await import('fs');
      const html = cycleResult.outcomes[0].result.pipeline.html;
      fs.writeFileSync('scripts/output-funnel.html', html, 'utf-8');
      console.log(`  HTML saved to: scripts/output-funnel.html (${html.length} chars)`);
    }

    process.exit(cycleResult.success ? 0 : 1);
  }

  // ─── PHASE 2: Direct Inquiry (skip radar, test orchestrator + pipeline) ───
  if (customQuery) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PHASE 2: DIRECT INQUIRY ORCHESTRATOR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { runAndPublishInquiry } = await import('../lib/agent/inquiry-orchestrator');

    console.log(`  [Orchestrator] Running direct inquiry: "${customQuery}"`);

    // Skip dedup to force run even if topic exists
    const result = await runAndPublishInquiry({
      question: customQuery,
      depth: 'strategic',
      source: 'manual',
      skipDuplicateCheck: true,
      minTrustScore: 60,
    });

    console.log('\n  ── INQUIRY RESULT ──');
    console.log(`  Status: ${result.status}`);
    console.log(`  Trust: ${result.trustScore}`);
    console.log(`  Quality: ${result.qualityScore}`);
    console.log(`  Words: ${result.wordCount}`);
    console.log(`  Cost: $${result.costUsd.toFixed(4)}`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

    if (result.briefId) console.log(`  Brief ID: ${result.briefId}`);
    if (result.publicationId) console.log(`  Publication ID: ${result.publicationId}`);
    if (result.publicId) console.log(`  Public ID: ${result.publicId}`);
    if (result.gate) {
      console.log(`  Gate: ${result.gate.decision} (metrics: ${JSON.stringify(result.gate.metrics)})`);
    }
    if (result.readinessOk !== undefined) console.log(`  Readiness: ${result.readinessOk}`);
    if (result.error) console.log(`  Error: ${result.error}`);

    // ── OT diagnostics: swarm election + binary gate checks from the run's steps ──
    try {
      const { prisma } = await import('../lib/db');
      const run = await prisma.pipelineRun.findFirst({
        where: { question: customQuery },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, steps: true },
      });
      const steps = (run?.steps ?? {}) as Record<string, any>;
      const election = steps.swarmElection as any;
      const forecasts = steps.swarmForecasts as any;
      const chain = steps.chainScenarios as any;
      const gate = steps.publicationGate as any;
      if (run) {
        console.log(`\n  ── RUN DIAGNOSTICS (${run.id.slice(0, 8)} / ${run.status}) ──`);
        console.log(`  Chain scenarios: ${chain ? (chain.reason ?? `${chain.scenarioIds?.length ?? 0} scenarios, ${chain.uncertainties?.length ?? 0} uncertainties`) : 'n/a'}`);
        console.log(`  Swarm votes: ${forecasts ? `${forecasts.validVotes ?? '?'}/${forecasts.rawVotes ?? '?'} valid, families: ${(forecasts.familiesUsed ?? []).join(',') || 'none'}, $${(forecasts.costUsd ?? 0).toFixed(4)}${forecasts.error ? ` ERROR: ${forecasts.error}` : ''}` : 'not run'}`);
        if (election?.scenarioId) {
          console.log(`  Election: ${election.scenarioId} p=${election.probability?.toFixed(3)} contested=${election.contested} runnerUp=${election.runnerUpId ?? 'none'} CI=[${election.confidenceInterval?.join(',')}]`);
        } else if (election) {
          console.log(`  Election: skipped (${election.skipped ?? election.error ?? 'no result'})`);
        }
        const checks = gate?.binaryChecks ?? gate?.checks;
        if (Array.isArray(checks)) {
          console.log(`  Binary checks: ${checks.map((c: any) => `${c.id ?? c.name}:${c.passed ? 'PASS' : 'FAIL'}`).join(' ')}`);
        }
        await prisma.$disconnect();
      }
    } catch (diagErr) {
      console.log(`  (run diagnostics unavailable: ${String(diagErr).slice(0, 120)})`);
    }

    if (result.pipeline?.html) {
      const fs = await import('fs');
      fs.writeFileSync('scripts/output-funnel.html', result.pipeline.html, 'utf-8');
      console.log(`  HTML saved: scripts/output-funnel.html (${result.pipeline.html.length} chars)`);
    }

    const totalMin = ((Date.now() - start) / 60000).toFixed(1);
    console.log(`\n  Total duration: ${totalMin} min`);

    if (result.status === 'published') {
      console.log('\n  ✅ Inquiry published successfully\n');
      process.exit(0);
    } else if (result.status === 'held' || result.status === 'draft') {
      console.log(`\n  ⚠️  Inquiry ${result.status} (not published)\n`);
      process.exit(0);
    } else {
      console.log('\n  ❌ Inquiry failed\n');
      process.exit(1);
    }
  }

  console.log('\n  Usage: node --import tsx scripts/test-funnel.ts [breaking|weekly|"query" direct]\n');
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

// Prevent HTTP/2 socket errors (remote API closing connection) from crashing the process
process.on('uncaughtException', (err) => {
  if (err && (err.code === 'UND_ERR_SOCKET' || err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
    console.warn(`[Funnel] Network error (non-fatal): ${err.code} — ${err.message?.slice(0, 100)}`);
    return;
  }
  console.error('Uncaught exception:', err);
  process.exit(1);
});
