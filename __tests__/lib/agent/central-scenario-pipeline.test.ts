import { runInquiryPipeline } from '@/lib/agent/inquiry-pipeline';
import { runPipeline } from '@/lib/agent/pipeline-v2';
import { runPipelineForesight } from '@/lib/agent/pipeline-foresight';
import { prisma } from '@/lib/db';
import { type CentralScenarioDecision } from '@/lib/agent/editorial-types';
import { renderSimulationHtmlSection } from '@/lib/foresight';
import { extractPredictions } from '@/lib/agent/prediction-registration';

jest.mock('@/lib/agent/pipeline-v2', () => ({ runPipeline: jest.fn() }));
jest.mock('@/lib/agent/pipeline-foresight', () => ({ runPipelineForesight: jest.fn() }));
jest.mock('@/lib/db', () => ({ prisma: {
  brief: { findUnique: jest.fn(), update: jest.fn() }, source: { findMany: jest.fn() },
} }));
jest.mock('@/lib/foresight', () => ({
  getForesightConfig: () => ({ minSeedSourcesToThrottleScout: 8 }),
  buildForesightPersistPayload: () => ({}), isForesightEnabled: () => true,
  renderSimulationHtmlSection: jest.fn(), appendSimulationToHtml: jest.fn(),
}));

const central: CentralScenarioDecision = {
  name: 'Central', description: 'The selected outlook', rationale: 'Evidence [SRC-1]',
  horizon: '2030', implications: ['Prepare'], revisionTriggers: ['A reversal in adoption'],
  confidence: 'medium', selectedBy: 'editorial', simulationDisagrees: false,
};

function setup(required: boolean, cached = false) {
  const output = { totalCostUsd: 0.1, totalDurationMs: 10, swarmSize: 20, monteCarloConverged: true, seedRuns: 2 };
  const analysis = { title: 'A central outlook', centralScenario: central, ...(cached ? { _simulationReport: { output, summary: 'Simulation', contextBlock: 'Context' } } : {}) };
  const stats = { centralScenario: central, centralScenarioRequired: required, criticalLoop: { finalScore: 70 }, analysis };
  jest.mocked(runPipeline).mockResolvedValue({ briefId: 'brief', pipelineRunId: 'run', stats } as unknown as Awaited<ReturnType<typeof runPipeline>>);
  jest.mocked(prisma.brief.findUnique).mockResolvedValue({ id: 'brief', html: '<p>Article</p>', sources: ['s1', 's2'], lineage: stats, createdAt: new Date(), updatedAt: new Date(), trustScore: 0.7 } as never);
  jest.mocked(prisma.source.findMany).mockResolvedValue([
    { id: 's2', title: 'Second', authors: [] }, { id: 's1', title: 'First', authors: [] },
  ] as never);
  jest.mocked(runPipelineForesight).mockResolvedValue({ skipped: true, analysis });
  return { stats, output };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('preserves the central decision and source order through persistence without rerunning foresight', async () => {
  const { output } = setup(true, true);
  const result = await runInquiryPipeline({ question: 'What happens next in this field?', depth: 'standard' });
  expect(runPipelineForesight).not.toHaveBeenCalled();
  expect(renderSimulationHtmlSection).not.toHaveBeenCalled();
  expect(result.inquiry.centralScenario).toEqual(central);
  expect(result.inquiry.verdict).toMatchObject({ value: 'Central', label: 'Central scenario' });
  expect(result.inquiry.sources.map(s => s.id)).toEqual(['s1', 's2']);
  expect(result.lineage.simulation).toEqual(output);
  expect(prisma.brief.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lineage: expect.objectContaining({ centralScenario: central, simulation: output }) }) }));
  expect(jest.getTimerCount()).toBe(0);
});

it('passes reader extractions through the inquiry wrapper for regeneration reuse', async () => {
  const { stats } = setup(true);
  const readings = [{ sourceId: 's1', claims: ['Observed result'], results: ['Measured effect'] }];
  jest.mocked(runPipeline).mockResolvedValueOnce({ briefId: 'brief', pipelineRunId: 'run', stats, readings } as unknown as Awaited<ReturnType<typeof runPipeline>>);
  const result = await runInquiryPipeline({ question: 'What happens next in this field?' });
  expect((result as unknown as { readings: unknown[] }).readings).toBe(readings);
});

it('does not silently retry a simulation skipped by the central-scenario pipeline', async () => {
  setup(true);
  await runInquiryPipeline({ question: 'What happens next in this field?', depth: 'standard' });
  expect(runPipelineForesight).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it('keeps the free-mode deadline instead of overriding it with the paid depth default', async () => {
  setup(true);
  const previous = process.env.NOMOSX_FREE_RUN;
  process.env.NOMOSX_FREE_RUN = '1';
  try {
    await runInquiryPipeline({ question: 'What happens next in this field?', depth: 'standard' });
    expect(runPipeline).toHaveBeenCalledWith(expect.any(String), 'memo', expect.objectContaining({ timeoutMs: 10_800_000 }));
  } finally {
    if (previous === undefined) delete process.env.NOMOSX_FREE_RUN;
    else process.env.NOMOSX_FREE_RUN = previous;
  }
});

it('clears the deadline timer after a legacy simulation returns', async () => {
  setup(false);
  await runInquiryPipeline({ question: 'What happens next in this field?', depth: 'standard' });
  expect(runPipelineForesight).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('preserves citation ordering when a persisted source is missing', async () => {
  setup(true);
  jest.mocked(prisma.source.findMany).mockResolvedValueOnce([{ id: 's2', title: 'Second', authors: [] }] as never);
  const { inquiry } = await runInquiryPipeline({ question: 'What happens next in this field?' });
  // s1 missing → placeholder at index 0 so [SRC-2] still resolves to s2
  expect(inquiry.sources.map((s) => s.id)).toEqual(['s1', 's2']);
  expect(inquiry.sources[0].title).toBe('Source unavailable');
  expect(inquiry.sources[1].title).toBe('Second');
});

it('registers the central forecast with revision triggers, not an invented probability', () => {
  const predictions = extractPredictions({ centralScenario: central } as unknown as Parameters<typeof extractPredictions>[0]);
  expect(predictions).toEqual([expect.objectContaining({ claim: 'Central: The selected outlook', horizon: '2030', probability: null, whatWouldFalsify: 'A reversal in adoption', sourceRefs: [1] })]);
});

it('clears the deadline timer when simulation rejects', async () => {
  setup(false);
  jest.mocked(runPipelineForesight).mockRejectedValueOnce(new Error('Simulation failed'));
  await expect(runInquiryPipeline({ question: 'What happens next in this field?' })).rejects.toThrow('Simulation failed');
  expect(jest.getTimerCount()).toBe(0);
});
