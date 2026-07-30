/**
 * NomosX Eval Runner — orchestre l'évaluation sur le corpus figé.
 *
 * Usage:
 *   npm run eval              # 5 topics, repeats=3 (gate de fin de WO)
 *   npm run eval -- --fast    # topics 1,2,5 only, repeats=1 (itération intra-WO)
 *   npm run eval -- --topic topic-1-carbon-pricing   # single topic, repeats=3
 *   npm run eval -- --repeats 5   # custom repeat count
 *   npm run eval -- --no-run  # compare last two snapshots only
 *
 * Output:
 *   eval/snapshots/snapshot-<timestamp>.json
 *   Console: per-topic stats, delta table vs previous snapshot with 2σ verdict
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { CORPUS, type CorpusTopic } from "./corpus";
import {
  scoreTopic,
  aggregateTopicRuns,
  aggregateResults,
  compareSnapshots,
  type TopicEvalResult,
  type EvalSnapshot,
  type TopicAggregate,
} from "./score";

const SNAPSHOTS_DIR = path.join(__dirname, "snapshots");

const FAST_TOPIC_IDS = new Set([
  "topic-1-carbon-pricing",
  "topic-2-lithium-reserves",
  "topic-5-regression",
]);

// ─── Git metadata ──────────────────────────────────────────────────

function findGit(): string {
  // Check if git is in PATH
  try {
    execSync("git --version", { encoding: "utf-8", stdio: "pipe" });
    return "git";
  } catch {
    // Search known locations
    const candidates = [
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Git\\cmd\\git.exe`,
    ];
    // Also search GitHub Desktop installations
    const ghBase = `${process.env.USERPROFILE}\\AppData\\Local\\GitHubDesktop`;
    if (fs.existsSync(ghBase)) {
      for (const dir of fs.readdirSync(ghBase)) {
        if (dir.startsWith("app-")) {
          candidates.push(`${ghBase}\\${dir}\\resources\\app\\git\\cmd\\git.exe`);
        }
      }
    }
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return "";
}

const GIT_BIN = findGit();

function getGitSha(): string {
  if (!GIT_BIN) return "unknown";
  try {
    return execSync(`"${GIT_BIN}" rev-parse HEAD`, { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function getGitBranch(): string {
  if (!GIT_BIN) return "unknown";
  try {
    return execSync(`"${GIT_BIN}" rev-parse --abbrev-ref HEAD`, { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function getPipelineConfig(): Record<string, unknown> {
  return {
    minTrustScore: 60,
    depth: "varies per topic",
    skipDuplicateCheck: true,
    groundingVetoThreshold: 0.50,
    citationCoverageHardFailure: true,
    factCheckerDeterministicPreCheck: true,
    note: "Config captured at eval time. WO-8 will raise thresholds.",
  };
}

// ─── Run a single topic once ───────────────────────────────────────

async function runTopicOnce(
  topic: CorpusTopic,
  repeatIndex: number,
): Promise<TopicEvalResult> {
  console.log(`\n  [repeat ${repeatIndex + 1}] Running "${topic.question.slice(0, 60)}..."`);

  const start = Date.now();
  try {
    const { runAndPublishInquiry } = await import("../lib/agent/inquiry-orchestrator");

    const result = await runAndPublishInquiry({
      question: topic.question,
      depth: topic.depth,
      source: "manual",
      skipDuplicateCheck: true,
      minTrustScore: 60,
    });

    const durationMs = Date.now() - start;

    if (result.error && !result.pipeline) {
      return {
        topicId: topic.id,
        status: "error",
        metrics: {
          groundingRate: null,
          primarySourceRatio: 0,
          tier4Ratio: 0,
          unclassifiedRatio: 0,
          channelCoverage: 0,
          gapResolutionRate: 0,
          hypothesisResolved: 0,
          inconclusiveRate: 0,
          partialRate: 0,
          refusalCorrectness: false,
          internalConsistency: 0,
          costUsd: result.costUsd,
          durationMs,
        },
        rawHtml: "",
        sourceCount: 0,
        wordCount: 0,
        error: result.error,
      };
    }

    const html = result.pipeline?.html ?? "";
    const sources = (result.pipeline?.inquiry?.sources ?? []).map((s) => ({
      url: (s as unknown as Record<string, unknown>).url as string | undefined,
      doi: (s as unknown as Record<string, unknown>).doi as string | undefined,
      provider: (s as unknown as Record<string, unknown>).provider as string | undefined,
    }));
    const stats = (result.pipeline?.stats ?? {}) as Record<string, unknown>;

    return scoreTopic(topic, {
      status: result.status,
      html,
      sources,
      costUsd: result.costUsd,
      durationMs,
      stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  [EVAL] Topic ${topic.id} failed: ${message}`);
    return {
      topicId: topic.id,
      status: "error",
      metrics: {
        groundingRate: null,
        primarySourceRatio: 0,
        tier4Ratio: 0,
        unclassifiedRatio: 0,
        channelCoverage: 0,
        gapResolutionRate: 0,
        hypothesisResolved: 0,
        inconclusiveRate: 0,
        partialRate: 0,
        refusalCorrectness: false,
        internalConsistency: 0,
        costUsd: 0,
        durationMs: Date.now() - start,
      },
      rawHtml: "",
      sourceCount: 0,
      wordCount: 0,
      error: message,
    };
  }
}

// ─── Snapshot I/O ──────────────────────────────────────────────────

function loadLastSnapshot(): EvalSnapshot | null {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return null;
  const files = fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.startsWith("snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  const content = fs.readFileSync(path.join(SNAPSHOTS_DIR, files[0]), "utf-8");
  return JSON.parse(content) as EvalSnapshot;
}

function saveSnapshot(snapshot: EvalSnapshot): string {
  if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const filename = `snapshot-${snapshot.timestamp.replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2), "utf-8");
  return filepath;
}

// ─── Output formatting ─────────────────────────────────────────────

function printDeltaTable(deltas: ReturnType<typeof compareSnapshots>): void {
  console.log("\n┌──────────────────────────────────────────────────────────────────────────┐");
  console.log("│  DELTA vs PREVIOUS SNAPSHOT                                                │");
  console.log("├──────────────────────────────────┬──────────┬──────────┬────────┬─────────┤");
  console.log("│  Metric                          │ Previous │ Current  │ Delta  │ Verdict │");
  console.log("├──────────────────────────────────┼──────────┼──────────┼────────┼─────────┤");
  for (const d of deltas) {
    const metric = d.metric.padEnd(30);
    const prev = d.previous.toFixed(4).padStart(8);
    const curr = d.current.toFixed(4).padStart(8);
    const delta = `${d.delta > 0 ? "+" : ""}${d.delta.toFixed(4)}`.padStart(7);
    const verdict = d.verdict === "SIGNIFICATIF" ? "SIG" : "bruit";
    const sigma = d.twoSigma > 0 ? ` (2σ=${d.twoSigma.toFixed(3)})` : "";
    console.log(`│  ${metric} │ ${prev} │ ${curr} │ ${delta} │ ${verdict.padEnd(5)}${sigma.padEnd(13)} │`);
  }
  console.log("└──────────────────────────────────┴──────────┴──────────┴────────┴─────────┘");
  console.log("  Règle: un delta < 2σ n'est pas un résultat. Aucun WO ne se valide sur du bruit.\n");
}

function printTopicTable(aggregates: TopicAggregate[]): void {
  console.log("\n┌────────────────────────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐");
  console.log("│  Topic                         │ Statuses   │ Ground%  │ PrimSrc% │ Tier4%   │ HypoRes% │ Refusal  │");
  console.log("├────────────────────────────────┼────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤");
  for (const t of aggregates) {
    const id = t.topicId.slice(0, 28).padEnd(28);
    const statuses = t.statuses.join(",").slice(0, 10).padEnd(10);
    const grMean = t.metricStats.groundingRate?.mean;
    const gr = grMean === undefined || grMean === null || !Number.isFinite(grMean)
      ? "  N/A "
      : (grMean * 100).toFixed(1).padStart(7);
    const psr = ((t.metricStats.primarySourceRatio?.mean ?? 0) * 100).toFixed(1).padStart(7);
    const t4 = ((t.metricStats.tier4Ratio?.mean ?? 0) * 100).toFixed(1).padStart(7);
    const hr = ((t.metricStats.hypothesisResolved?.mean ?? 0) * 100).toFixed(1).padStart(7);
    const ref = `${(t.refusalCorrectnessRate * 100).toFixed(0)}%`.padStart(7);
    console.log(`│  ${id} │ ${statuses} │ ${gr}%   │ ${psr}%   │ ${t4}%   │ ${hr}%   │ ${ref}    │`);
  }
  console.log("└────────────────────────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘");
}

function printPerMetricStats(aggregates: TopicAggregate[]): void {
  console.log("\n  ── PER-METRIC STATS (mean ± stddev, min–max) ──\n");
  const metrics = [
    "groundingRate",
    "primarySourceRatio",
    "tier4Ratio",
    "unclassifiedRatio",
    "hypothesisResolved",
    "inconclusiveRate",
    "partialRate",
    "internalConsistency",
    "costUsd",
    "durationMs",
  ];
  for (const metric of metrics) {
    console.log(`  ${metric}:`);
    for (const t of aggregates) {
      const s = t.metricStats[metric];
      if (!s || s.n === 0) continue;
      console.log(`    ${t.topicId}: ${s.mean.toFixed(4)} ± ${s.stddev.toFixed(4)} [${s.min.toFixed(4)}–${s.max.toFixed(4)}] (n=${s.n})`);
    }
    console.log();
  }
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const topicFilter = args.includes("--topic")
    ? args[args.indexOf("--topic") + 1]
    : undefined;
  const noRun = args.includes("--no-run");
  const fast = args.includes("--fast");
  const customRepeats = args.includes("--repeats")
    ? parseInt(args[args.indexOf("--repeats") + 1], 10)
    : undefined;
  const concurrency = args.includes("--concurrency")
    ? parseInt(args[args.indexOf("--concurrency") + 1], 10)
    : 1;

  const repeats = customRepeats ?? (fast ? 1 : 3);

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  NomosX — EVAL HARNESS                                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Git: ${getGitBranch()} @ ${getGitSha().slice(0, 8)}`);
  console.log(`  Mode: ${fast ? "fast" : "full"} | Repeats: ${repeats} | Concurrency: ${concurrency}`);

  if (noRun) {
    console.log("  Mode: --no-run (compare last two snapshots only)\n");
    const snapshots = fs
      .readdirSync(SNAPSHOTS_DIR)
      .filter((f) => f.startsWith("snapshot-") && f.endsWith(".json"))
      .sort();
    if (snapshots.length < 2) {
      console.log("  Need at least 2 snapshots to compare. Found:", snapshots.length);
      process.exit(1);
    }
    const prev = JSON.parse(
      fs.readFileSync(path.join(SNAPSHOTS_DIR, snapshots[snapshots.length - 2]), "utf-8"),
    );
    const curr = JSON.parse(
      fs.readFileSync(path.join(SNAPSHOTS_DIR, snapshots[snapshots.length - 1]), "utf-8"),
    );
    printDeltaTable(compareSnapshots(prev, curr));
    process.exit(0);
  }

  let topics = topicFilter
    ? CORPUS.filter((t) => t.id === topicFilter)
    : fast
      ? CORPUS.filter((t) => FAST_TOPIC_IDS.has(t.id))
      : CORPUS;

  if (topics.length === 0) {
    console.log(`  No topic matching "${topicFilter}"`);
    process.exit(1);
  }

  console.log(`  Topics: ${topics.length}\n`);

  const topicAggregates: TopicAggregate[] = [];

  // Run topics with concurrency support
  async function runTopic(topic: CorpusTopic): Promise<TopicAggregate> {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  EVAL: ${topic.id}`);
    console.log(`  Q: "${topic.question.slice(0, 80)}..."`);
    console.log(`  Mode: ${topic.expectedMode} | shouldRefuse: ${topic.shouldRefuse} | repeats: ${repeats}`);
    console.log(`${"═".repeat(70)}`);

    const runs: TopicEvalResult[] = [];
    for (let r = 0; r < repeats; r++) {
      const result = await runTopicOnce(topic, r);
      runs.push(result);
      const gr = result.metrics.groundingRate;
      console.log(`  → [${topic.id}] repeat ${r + 1}: status=${result.status}, grounding=${gr === null ? "N/A" : (gr * 100).toFixed(1) + "%"}, refusal=${result.metrics.refusalCorrectness ? "✓" : "✗"}, cost=$${result.metrics.costUsd.toFixed(4)}, ${(result.metrics.durationMs / 1000).toFixed(1)}s`);
    }

    return aggregateTopicRuns(topic.id, runs);
  }

  if (concurrency <= 1) {
    for (const topic of topics) {
      topicAggregates.push(await runTopic(topic));
    }
  } else {
    // Batch topics with concurrency limit
    for (let i = 0; i < topics.length; i += concurrency) {
      const batch = topics.slice(i, i + concurrency);
      console.log(`\n  ── Batch ${Math.floor(i / concurrency) + 1}: ${batch.map((t) => t.id).join(", ")} ──`);
      const results = await Promise.all(batch.map((t) => runTopic(t)));
      topicAggregates.push(...results);
    }
  }

  const aggregate = aggregateResults(topicAggregates);
  const snapshot: EvalSnapshot = {
    timestamp: new Date().toISOString(),
    gitSha: getGitSha(),
    gitBranch: getGitBranch(),
    pipelineConfig: getPipelineConfig(),
    fast,
    repeats,
    topicAggregates,
    aggregate,
  };

  const filepath = saveSnapshot(snapshot);
  console.log(`\n  Snapshot saved: ${filepath}`);

  printTopicTable(topicAggregates);
  printPerMetricStats(topicAggregates);

  console.log("\n  ── AGGREGATE ──");
  console.log(`  avgGroundingRate:         ${(aggregate.avgGroundingRate * 100).toFixed(1)}%`);
  console.log(`  avgPrimarySourceRatio:    ${(aggregate.avgPrimarySourceRatio * 100).toFixed(1)}%`);
  console.log(`  avgTier4Ratio:            ${(aggregate.avgTier4Ratio * 100).toFixed(1)}%`);
  console.log(`  avgUnclassifiedRatio:     ${(aggregate.avgUnclassifiedRatio * 100).toFixed(1)}%`);
  console.log(`  avgHypothesisResolved:    ${(aggregate.avgHypothesisResolved * 100).toFixed(1)}%`);
  console.log(`  avgInconclusiveRate:      ${(aggregate.avgInconclusiveRate * 100).toFixed(1)}%`);
  console.log(`  avgPartialRate:           ${(aggregate.avgPartialRate * 100).toFixed(1)}%`);
  console.log(`  refusalAccuracy:          ${(aggregate.refusalAccuracy * 100).toFixed(1)}%`);
  console.log(`  totalCostUsd:             $${aggregate.totalCostUsd.toFixed(4)}`);
  console.log(`  totalDurationMs:          ${(aggregate.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  consistencyViolations:    ${aggregate.internalConsistencyViolations}`);

  const lastSnapshot = loadLastSnapshot();
  if (lastSnapshot && lastSnapshot.timestamp !== snapshot.timestamp) {
    printDeltaTable(compareSnapshots(lastSnapshot, snapshot));
  } else {
    console.log("\n  (No previous snapshot to compare — this is the baseline.)");
  }

  const pass =
    aggregate.internalConsistencyViolations === 0 &&
    aggregate.refusalAccuracy >= 0.5;
  console.log(`\n  ${pass ? "✅ EVAL PASSED" : "⚠️  EVAL NEEDS ATTENTION"}\n`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal eval error:", err);
  process.exit(1);
});
