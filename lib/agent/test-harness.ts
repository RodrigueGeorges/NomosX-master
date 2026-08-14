/**
 * NomosX TEST HARNESS — LOT 8.1/8.2
 *
 * Lightweight test harness for pipeline quality metrics.
 * Run with: npx tsx lib/agent/test-harness.ts
 *
 * LOT 8.1: Test harness with golden questions
 * LOT 8.2: New metrics (chain coherence, citation density, style gate pass rate)
 */

import { runPipeline } from './pipeline-v2';

// ============================================================================
// LOT 8.1: Golden questions — known-answer tests
// ============================================================================

interface GoldenQuestion {
  id: string;
  query: string;
  isStrategic: boolean;
  minSources: number;
  expectedDomain?: string;
  timeoutMs: number;
}

const GOLDEN_QUESTIONS: GoldenQuestion[] = [
  {
    id: 'gq-001',
    query: 'What is the impact of carbon pricing on industrial competitiveness?',
    isStrategic: false,
    minSources: 5,
    expectedDomain: 'economics',
    timeoutMs: 120000,
  },
  {
    id: 'gq-002',
    query: 'How does AI regulation affect innovation rates in the EU vs US?',
    isStrategic: false,
    minSources: 5,
    expectedDomain: 'technology',
    timeoutMs: 120000,
  },
  {
    id: 'gq-003',
    query: 'Impact of quantitative easing on wealth inequality',
    isStrategic: true,
    minSources: 10,
    expectedDomain: 'economics',
    timeoutMs: 300000,
  },
];

// ============================================================================
// LOT 8.2: Metrics computation
// ============================================================================

export interface PipelineMetrics {
  // Existing metrics
  sourceCount: number;
  providerDiversity: number;
  citationDensity: number;  // citations per 1000 words
  costUsd: number;
  durationMs: number;

  // LOT 8.2: New metrics
  chainCoherence: number;       // 0-1: fraction of chain links with mechanism + source
  styleGatePassRate: number;    // 0-1: fraction of style gates passed
  numericalGatePassRate: number; // 0-1: fraction of numbers with sources
  loadBearingCoverage: number;  // 0-1: fraction of load-bearing sources cited in text
  researchGapCount: number;     // Number of typed research gaps identified
  predictionCount: number;      // Predictions registered for audit
  deepPlannerNodes: number;     // DAG nodes from DeepPlanner
  mechanismCount: number;       // Causal mechanisms extracted
}

export function computeMetrics(stats: any, html: string, sources: any[]): PipelineMetrics {
  // Convert <sup class="cite"> tags to [SRC-N] markers BEFORE stripping HTML tags
  const normalized = html
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>[^<]*<\/a><\/sup>/g, '[SRC-$1]')
    .replace(/<a href="#ref-(\d+)"[^>]*>[^<]*<\/a>/g, '[SRC-$1]');
  const text = normalized.replace(/<[^>]+>/g, ' ');
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const citationCount = (text.match(/\[SRC-\d+\]/g) || []).length;

  // Chain coherence: fraction of mechanisms that have a source reference
  let mechanismCount = 0;
  let sourcedMechanisms = 0;
  if (stats?.reader) {
    // Estimate from readings
    mechanismCount = stats.reader.count || 0;
  }

  // Style gate pass rate
  const styleGatesPassed = stats?.styleGates?.passed ? 1 : 0;
  const numGatesPassed = stats?.numericalGate?.passed ? 1 : 0;

  // Load-bearing coverage: check if top 3 source IDs appear in HTML
  const loadBearingSources = sources.filter(s => s.loadBearing);
  const loadBearingCited = loadBearingSources.filter(s =>
    html.includes(`[SRC-${sources.indexOf(s) + 1}]`)
  ).length;

  return {
    sourceCount: sources.length,
    providerDiversity: new Set(sources.map(s => s.provider)).size,
    citationDensity: wordCount > 0 ? (citationCount / wordCount) * 1000 : 0,
    costUsd: stats?.totalCostUsd || 0,
    durationMs: stats?.durationMs || 0,

    // LOT 8.2
    chainCoherence: mechanismCount > 0 ? sourcedMechanisms / mechanismCount : 0,
    styleGatePassRate: styleGatesPassed,
    numericalGatePassRate: numGatesPassed,
    loadBearingCoverage: loadBearingSources.length > 0 ? loadBearingCited / loadBearingSources.length : 0,
    researchGapCount: stats?.researchGaps?.length || 0,
    predictionCount: stats?.predictions?.registered || 0,
    deepPlannerNodes: stats?.deepPlanner?.nodes || 0,
    mechanismCount,
  };
}

// ============================================================================
// LOT 8.1: Test runner
// ============================================================================

export async function runTestHarness(
  questions?: GoldenQuestion[]
): Promise<Array<{ question: GoldenQuestion; passed: boolean; metrics?: PipelineMetrics; error?: string }>> {
  const tests = questions || GOLDEN_QUESTIONS;
  const results: Array<{ question: GoldenQuestion; passed: boolean; metrics?: PipelineMetrics; error?: string }> = [];

  for (const q of tests) {
    console.log(`\n[HARNESS] Running ${q.id}: "${q.query.slice(0, 60)}..."`);
    try {
      const result: any = await Promise.race([
        runPipeline(q.query, q.isStrategic ? 'strategic' : 'brief'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${q.timeoutMs}ms`)), q.timeoutMs)
        ),
      ]);

      const metrics = computeMetrics(result.stats, result.html || '', []);
      const passed = metrics.sourceCount >= q.minSources &&
        (!q.expectedDomain || result.stats?.topicClassification?.primaryDomain === q.expectedDomain);

      results.push({ question: q, passed, metrics });
      console.log(`[HARNESS] ${q.id}: ${passed ? 'PASS' : 'FAIL'} — ${metrics.sourceCount} sources, ${metrics.citationDensity.toFixed(1)} citations/1k words`);
    } catch (err) {
      results.push({ question: q, passed: false, error: String(err) });
      console.error(`[HARNESS] ${q.id}: FAIL — ${err}`);
    }
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  console.log(`\n[HARNESS] Summary: ${passed}/${results.length} passed`);

  return results;
}

// Run if called directly
if (require.main === module) {
  runTestHarness().then(() => process.exit(0));
}
