/**
 * eval:gepa — GEPA-style reflective prompt evolution harness (ICLR 2026).
 *
 * Offline scaffold: replays STORED run traces (agentAuditLog + pipeline
 * lineage), groups failures per agent role, and — with --llm — proposes
 * targeted prompt mutations via the self-evolver, scored per failure-class
 * so the Pareto frontier tracks which candidate fixes which class.
 *
 * No paid run required: the reflective substrate is what the pipeline already
 * persisted (gate diagnoses, DA challenges, lessons, failure patterns).
 *
 *   npx tsx scripts/eval-gepa.ts [--days=30] [--llm] [--agent=ANALYST]
 *
 * Output: evals/results/gepa-latest.json
 */

import { prisma } from '../lib/db';
import { collectEvolutionSignal, proposePromptMutation, scorePromptVariant } from '../lib/agent/self-evolver';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface AgentReport {
  agent: string;
  signalCount: number;
  topFailurePatterns: { pattern: string; count: number }[];
  gateDiagnoses: Record<string, number>;   // diagnosis code → occurrences
  lessonsSample: string[];
  mutations: { rationale: string; score: number; fixes: string[] }[];
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const DAYS = Number(args.days ?? 30);
const WITH_LLM = Boolean(args.llm);
const ONLY_AGENT = typeof args.agent === 'string' ? args.agent : undefined;

async function main() {
  const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
  console.log(`[GEPA] Replaying stored traces over the last ${DAYS} days (since ${since.toISOString().slice(0, 10)})`);

  // ── 1. Collect per-agent evolution signals ────────────────────────────────
  const rows = await prisma.agentAuditLog.findMany({
    where: {
      timestamp: { gte: since },
      action: { in: ['LESSON_LEARNED', 'SELF_CORRECTION', 'HUMAN_CORRECTION', 'WITNESS_INTERVENTION', 'GATE_DECISION', 'PIPELINE_RUN'] },
    },
    orderBy: { timestamp: 'desc' },
    take: 2000,
    select: { agent: true, action: true, metadata: true, timestamp: true },
  });
  console.log(`[GEPA] ${rows.length} trace rows`);

  const agents = new Map<string, { lessons: string[]; failures: Record<string, number>; diagnoses: Record<string, number> }>();
  for (const row of rows) {
    const agent = row.agent || 'UNKNOWN';
    if (!agents.has(agent)) agents.set(agent, { lessons: [], failures: {}, diagnoses: {} });
    const bucket = agents.get(agent)!;
    try {
      const meta = JSON.parse(row.metadata || '{}');
      if (row.action === 'LESSON_LEARNED' && meta.lesson) bucket.lessons.push(String(meta.lesson));
      if (row.action === 'SELF_CORRECTION' && meta.failureMode) bucket.failures[meta.failureMode] = (bucket.failures[meta.failureMode] || 0) + 1;
      // SEVA diagnoses persisted in gate results ride along in pipeline stats
      for (const d of meta.diagnoses ?? meta.gate?.diagnoses ?? []) {
        if (d?.code) bucket.diagnoses[d.code] = (bucket.diagnoses[d.code] || 0) + 1;
      }
    } catch { /* malformed metadata — skip */ }
  }

  // ── 2. Reflect + mutate per agent ─────────────────────────────────────────
  const reports: AgentReport[] = [];
  for (const [agent, bucket] of agents) {
    if (ONLY_AGENT && agent !== ONLY_AGENT) continue;
    const signalCount = bucket.lessons.length + Object.values(bucket.failures).reduce((a, b) => a + b, 0);
    if (signalCount < 3) continue; // GEPA needs a trace worth reflecting on

    const report: AgentReport = {
      agent,
      signalCount,
      topFailurePatterns: Object.entries(bucket.failures).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pattern, count]) => ({ pattern, count })),
      gateDiagnoses: bucket.diagnoses,
      lessonsSample: bucket.lessons.slice(0, 5),
      mutations: [],
    };

    if (WITH_LLM) {
      try {
        const signal = await collectEvolutionSignal(agent, 50);
        // The current prompt is role-specific — council roles resolve to
        // EXPERT_PERSONAS; unknown agents skip mutation (signal-only report).
        const role = agent.startsWith('playbook:') ? agent.slice(9) : agent;
        const basePrompt = await resolveBasePrompt(role);
        if (basePrompt) {
          const mutation = await proposePromptMutation(agent, basePrompt, signal);
          if (mutation) {
            const score = await scorePromptVariant(agent, mutation.prompt, signal.lessons.slice(0, 3));
            report.mutations.push({ rationale: mutation.rationale, score, fixes: Object.keys(bucket.diagnoses) });
          }
        }
      } catch (err) {
        console.warn(`[GEPA] mutation failed for ${agent}:`, (err as Error).message);
      }
    }
    reports.push(report);
  }

  // ── 3. Report ─────────────────────────────────────────────────────────────
  reports.sort((a, b) => b.signalCount - a.signalCount);
  const out = {
    generatedAt: new Date().toISOString(),
    windowDays: DAYS,
    llmMutations: WITH_LLM,
    agents: reports,
  };
  const dir = join(process.cwd(), 'evals', 'results');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'gepa-latest.json');
  writeFileSync(path, JSON.stringify(out, null, 2));

  console.log(`\n[GEPA] ${reports.length} agents with enough signal:`);
  for (const r of reports) {
    console.log(`  ${r.agent}: ${r.signalCount} signals, top failures: ${r.topFailurePatterns.map((f) => `${f.pattern}×${f.count}`).join(', ') || 'none'}, diagnoses: ${Object.entries(r.gateDiagnoses).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`);
    for (const m of r.mutations) console.log(`    → mutation (score ${m.score}): ${m.rationale}`);
  }
  console.log(`\n[GEPA] Report → ${path}`);

  await prisma.$disconnect();
}

/** Best-effort base-prompt resolution for known agent roles. */
async function resolveBasePrompt(agentId: string): Promise<string | null> {
  try {
    if (agentId.startsWith('council:') || agentId.startsWith('phd:')) {
      const domain = agentId.split(':')[1];
      const { EXPERT_PERSONAS } = await import('../lib/agent/phd-researcher');
      return (EXPERT_PERSONAS as Record<string, { systemPrompt?: string }>)[domain]?.systemPrompt ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error('[GEPA] failed:', err);
  process.exit(1);
});
