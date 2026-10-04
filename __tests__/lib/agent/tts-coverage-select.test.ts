import { runAnalystExecution, type AnalystRunDeps } from '@/lib/agent/pipeline-steps/analyst-run';
import { critiqueOutline } from '@/lib/agent/outline-critic';

jest.mock('@/lib/db', () => ({ prisma: {} }));
jest.mock('@/lib/agent/outline-critic', () => ({ critiqueOutline: jest.fn() }));
jest.mock('@/lib/agent/moa/mixture-of-agents', () => ({ runMixtureOfAgents: jest.fn() }));
jest.mock('@/lib/agent/phd-researcher', () => ({ detectRelevantExperts: jest.fn(() => []), runExpertAnalysis: jest.fn() }));
jest.mock('@/lib/free-run', () => ({ isFreeRun: jest.fn(() => false) }));

const baseDeps = (analystMultipass: jest.Mock): AnalystRunDeps => ({
  query: 'Research question',
  topSources: [{ id: 'a', qualityScore: 70, provider: 'test' }],
  slimReadings: [],
  fullContextBlock: undefined,
  detectedDomain: 'test',
  isStrategic: true,
  useMixtureOfAgents: false,
  runningCostUsd: 0,
  maxBudgetUsd: 5,
  stats: {},
  label: '[T]',
  pipelineRunId: 'run',
  pipelineStart: Date.now(),
  emitProgress: jest.fn(),
  addCost: jest.fn(),
  durable: async (_n: string, fn: () => Promise<any>) => fn(),
  analystMultipass,
  bumpAnalysisArtifact: jest.fn(),
  ctx: { setAnalystOutput: jest.fn(), recordAgentTiming: jest.fn() },
} as unknown as AnalystRunDeps);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('TTS candidate selection — coverage wins over citation count', () => {
  it('selects candidate 2 when its outline coverage is higher, even with fewer citations', async () => {
    // Candidate 1: more citations but narrower coverage — the old proxy picked
    // it; coverage scoring picks the genuinely better artifact.
    const c1 = { html: '[SRC-1]'.repeat(10), _meta: {} };
    const c2 = { html: '[SRC-1]'.repeat(4), _meta: {} };
    const multipass = jest.fn().mockResolvedValueOnce(c1).mockResolvedValueOnce(c2);
    jest.mocked(critiqueOutline)
      .mockResolvedValueOnce({ coverageScore: 62, missingDimensions: ['x'], weakSections: [], targetedQueries: [], rationale: '', costUsd: 0.001 } as never)
      .mockResolvedValueOnce({ coverageScore: 84, missingDimensions: [], weakSections: [], targetedQueries: [], rationale: '', costUsd: 0.001 } as never);

    const deps = baseDeps(multipass);
    const out = await runAnalystExecution(deps);
    expect(out.analysis).toBe(c2);
    expect(deps.bumpAnalysisArtifact).toHaveBeenCalled();
    expect(deps.stats.testTimeScaling).toMatchObject({ activated: true, coverageScores: { c1: 62, c2: 84 } });
  });

  it('keeps candidate 1 when its coverage is higher', async () => {
    const c1 = { html: '[SRC-1]'.repeat(6), _meta: {} };
    const c2 = { html: '[SRC-1]'.repeat(12), _meta: {} };
    const multipass = jest.fn().mockResolvedValueOnce(c1).mockResolvedValueOnce(c2);
    jest.mocked(critiqueOutline)
      .mockResolvedValueOnce({ coverageScore: 88, missingDimensions: [], weakSections: [], targetedQueries: [], rationale: '', costUsd: 0.001 } as never)
      .mockResolvedValueOnce({ coverageScore: 55, missingDimensions: ['x'], weakSections: [], targetedQueries: [], rationale: '', costUsd: 0.001 } as never);

    const deps = baseDeps(multipass);
    const out = await runAnalystExecution(deps);
    expect(out.analysis).toBe(c1);
  });

  it('falls back to citation count when outline scoring fails', async () => {
    const c1 = { html: '[SRC-1]'.repeat(3), _meta: {} };
    const c2 = { html: '[SRC-1]'.repeat(9), _meta: {} };
    const multipass = jest.fn().mockResolvedValueOnce(c1).mockResolvedValueOnce(c2);
    jest.mocked(critiqueOutline).mockRejectedValue(new Error('LLM down') as never);

    const deps = baseDeps(multipass);
    const out = await runAnalystExecution(deps);
    expect(out.analysis).toBe(c2); // more citations wins the fallback
  });
});
