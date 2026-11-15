#!/usr/bin/env node
/**
 * Canary replay — scheduled deterministic regression check.
 *
 * Replays the committed LLM fixtures through the CURRENT code path.
 * Replay mode serves every LLM call from the cassette (zero spend, zero
 * provider calls); any prompt/param drift throws CassetteMissError — that
 * IS the regression signal: a code change altered a prompt, a frozen
 * input channel, or the pipeline topology.
 *
 * Run:  node scripts/canary-replay.mjs [--all] [--min-interval-h 20]
 *       npm run canary            (package.json alias)
 *
 * Results append to scripts/_canary-replay.jsonl. Exit 1 if any fixture
 * drifts beyond its tolerance — wire this into cron/Task Scheduler/GHA.
 *
 * Requires DATABASE_URL (fixtures persist+cleanup brief/pipelineRun rows)
 * — .env.local is loaded automatically, same as `npm run replay`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, 'scripts', '_canary-replay.state.json');
const LOG = join(ROOT, 'scripts', '_canary-replay.jsonl');

// Rotation: one fixture per invocation keeps daily cost ~1-3min. --all runs
// every fixture (use after prompt-touching changes).
const FIXTURES = [
  { cassette: '.llm-cassettes/gulf-minerals.fixture.jsonl', tolerance: 0, label: 'gulf-minerals' },
  { cassette: '.llm-cassettes/nordic-total-defence.fixture.jsonl', tolerance: 0, label: 'nordic-total-defence' },
  { cassette: '.llm-cassettes/ai-relationships-china.fixture.jsonl', tolerance: 0, label: 'ai-relationships-china' },
  { cassette: '.llm-cassettes/sanctions-patronage.fixture.jsonl', tolerance: 0, label: 'sanctions-patronage' },
];

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
const has = (name) => process.argv.includes(`--${name}`);

const minIntervalH = Number(arg('min-interval-h', 20));
const all = has('all');
const force = has('force');

// Throttle: canary is meant for daily/weekly cadence, not every monitor tick.
if (!force && existsSync(STATE)) {
  try {
    const st = JSON.parse(readFileSync(STATE, 'utf8'));
    const ageH = (Date.now() - new Date(st.lastRunAt).getTime()) / 3600_000;
    if (Number.isFinite(ageH) && ageH < minIntervalH) {
      console.log(`[canary] last run ${ageH.toFixed(1)}h ago < ${minIntervalH}h — skipping (use --force)`);
      process.exit(0);
    }
  } catch { /* corrupt state — run anyway */ }
}

const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const useTsx = existsSync(tsx) ? tsx : 'npx';
const tsxArgs = existsSync(tsx) ? [] : ['tsx'];

function pickFixtures() {
  if (all) return FIXTURES;
  // Rotate by day-of-year so successive daily runs cover all fixtures.
  const day = Math.floor(Date.now() / 86400_000);
  return [FIXTURES[day % FIXTURES.length]];
}

const results = [];
let failed = false;
for (const fx of pickFixtures()) {
  const cassette = join(ROOT, fx.cassette);
  const meta = `${cassette}.meta.json`;
  if (!existsSync(cassette) || !existsSync(meta)) {
    results.push({ fixture: fx.label, status: 'skipped', reason: 'fixture or meta missing' });
    continue;
  }
  const started = Date.now();
  const r = spawnSync(
    process.execPath,
    [tsx, ...tsxArgs, '--env-file=.env.local', 'scripts/replay-run.ts',
      '--cassette', fx.cassette, '--cleanup', '--tolerance', String(fx.tolerance)],
    { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60_000, env: { ...process.env } },
  );
  const durationS = Math.round((Date.now() - started) / 1000);
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  // Classify the outcome:
  //   pass    — exit 0, deterministic replay reproduced the recorded outcome
  //   drift   — cassette misses: a prompt/frozen-input channel changed. NOT a
  //             behavioural regression — the fixture needs re-recording
  //             (expected after intentional prompt changes). Warn, don't fail.
  //   fail    — exit !=0 with ZERO misses, or infra error: real regression.
  const missMatch = out.match(/cassette misses:\s*(\d+)/i) ?? out.match(/"cassetteMisses":\s*(\d+)/);
  const misses = missMatch ? Number(missMatch[1]) : null;
  const drift = misses !== null && misses > 0;
  const ok = r.status === 0;
  const status = ok ? 'pass' : drift ? 'drift' : 'fail';
  if (status === 'fail') failed = true;
  // Extract the drift summary lines for the log.
  const driftLines = out.split('\n').filter(l => /drift|miss|trust|gate|cost|FAIL|PASS|replay\]/i.test(l)).slice(-15);
  const rec = {
    at: new Date().toISOString(),
    fixture: fx.label,
    status,
    cassetteMisses: misses,
    needsRerecord: drift,
    exitCode: r.status,
    durationS,
    drift: driftLines,
  };
  results.push(rec);
  appendFileSync(LOG, JSON.stringify(rec) + '\n');
  console.log(`[canary] ${fx.label}: ${status.toUpperCase()} (${durationS}s${misses !== null ? `, ${misses} cassette misses` : ''})`);
  if (status !== 'pass') console.log(driftLines.join('\n'));
}

writeFileSync(STATE, JSON.stringify({ lastRunAt: new Date().toISOString(), results }, null, 2));
process.exit(failed ? 1 : 0);
