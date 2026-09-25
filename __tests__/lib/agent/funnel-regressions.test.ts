import { extractPipelineScores, countWordsHtml } from '@/lib/agent/inquiry-funnel-utils';
import { runAndPublishInquiry } from '@/lib/agent/inquiry-orchestrator';
import { runInquiryPipeline } from '@/lib/agent/inquiry-pipeline';
import { evaluatePublicationGate } from '@/lib/agent/publication-gate';
import { evaluatePublicationReadiness } from '@/lib/publication-visibility';
import { requestResearcherSignOff } from '@/lib/agent/researcher-ownership';
import { repairWithInnovations } from '@/lib/agent/citation-verifier';
import { verifyCitationsNLI } from '@/lib/agent/nli-verifier';
import { sanitizeUnsourcedNumbers } from '@/lib/agent/citation-repair';
import { prisma } from '@/lib/db';
import { httpGet } from '@/lib/http-client';

jest.mock('@/lib/env', () => ({ env: { NODE_ENV: 'development' } }));

jest.mock('@/lib/db', () => {
  const db = {
    vertical: { findUnique: jest.fn(async () => ({ id: 'vertical', slug: 'test' })) },
    thinkTankPublication: { create: jest.fn(async () => ({ id: 'publication', publicId: null })) },
    brief: { update: jest.fn() },
    thinkTankQualityCheck: { createMany: jest.fn(async () => ({})) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async (fn) => fn(db));
  return { prisma: db, withDbRetry: (fn: () => unknown) => fn() };
});
jest.mock('@/lib/agent/inquiry-pipeline', () => ({ runInquiryPipeline: jest.fn() }));
jest.mock('@/lib/agent/publication-gate', () => ({ evaluatePublicationGate: jest.fn() }));
jest.mock('@/lib/publication-visibility', () => ({ evaluatePublicationReadiness: jest.fn() }));
jest.mock('@/lib/agent/researcher-ownership', () => ({ requestResearcherSignOff: jest.fn() }));
jest.mock('@/lib/foresight', () => ({ buildForesightPersistPayload: () => ({}), persistForesightRun: jest.fn() }));
jest.mock('@/lib/llm/unified-llm', () => ({ callLLM: jest.fn(() => { throw new Error('No live LLM allowed'); }) }));
jest.mock('@/lib/agent/semantic-engine', () => ({ embedText: jest.fn(), cosineSimilarity: jest.fn() }));
jest.mock('@/lib/agent/nli-verifier', () => ({ verifyCitationsNLI: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({}));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('trust propagation', () => {
  it.each([0, 1, 40, 50, 55, 65, 90])('preserves terminal trust %s across repeated extraction', (score) => {
    const stats = { criticalLoop: { finalScore: score }, rank: { avgQuality: 90 }, citationFilter: { coverageAfter: 100 } };
    const first = extractPipelineScores(stats, {}, { trustScore: score, qualityScore: 90 });
    expect(first.trustScore).toBe(score);
    expect(extractPipelineScores(stats, {}, first).trustScore).toBe(score);
  });
  it('does not count CSS or scripts as article words', () => {
    expect(countWordsHtml('<style>lots of css words here</style><script>many script words</script><p>Only two</p>')).toBe(2);
  });
});

describe('publication vetoes', () => {
  it.each([
    ['hold', false, false, 62, 'held'],
    ['hold', true, false, 90, 'held'],
    ['publish', false, false, 90, 'held'],
    ['publish', true, true, 90, 'draft'],
    ['publish', true, false, 90, 'published'],
  ] as const)('%s ready=%s rejectedSignoff=%s trust=%s → %s', async (decision, ready, rejected, trust, expected) => {
    jest.mocked(runInquiryPipeline).mockResolvedValue({
      briefId: 'brief', html: '<p>Verified article</p>', format: 'brief',
      trustScore: trust, qualityScore: 90,
      stats: { criticalLoop: { finalScore: trust }, rank: { avgQuality: 90 }, citationFilter: { coverageAfter: 100 } },
      lineage: {}, inquiry: { id: 'brief', slug: 'test', title: 'Test', question: 'Test question', sources: [] },
    } as unknown as Awaited<ReturnType<typeof runInquiryPipeline>>);
    jest.mocked(evaluatePublicationGate).mockReturnValue({ decision, metrics: { citationCoverage: 1 } } as ReturnType<typeof evaluatePublicationGate>);
    jest.mocked(evaluatePublicationReadiness).mockReturnValue({ ok: ready } as ReturnType<typeof evaluatePublicationReadiness>);
    jest.mocked(requestResearcherSignOff).mockResolvedValue({ approved: false, decision: 'revise' } as Awaited<ReturnType<typeof requestResearcherSignOff>>);
    const result = await runAndPublishInquiry({ question: 'A sufficiently detailed question', source: 'manual', verticalId: 'vertical', skipDuplicateCheck: true, requireResearcherSignOff: rejected });
    expect(result.status).toBe(expected);
    expect(prisma.thinkTankPublication.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: expected.toUpperCase() }) }));
    if (expected !== 'published') expect(prisma.brief.update).not.toHaveBeenCalled();
  });
});

describe('repair budget', () => {
  it('stops on a plateau after an initial improvement', async () => {
    jest.mocked(verifyCitationsNLI)
      .mockResolvedValueOnce({ overallIntegrity: 61 } as Awaited<ReturnType<typeof verifyCitationsNLI>>)
      .mockResolvedValue({ overallIntegrity: 61 } as Awaited<ReturnType<typeof verifyCitationsNLI>>);
    const result = await repairWithInnovations('<p>No citations</p>', [], 42, { minIntegrity: 85, maxIterations: 3, removeHallucinations: false, replaceMisattributed: false });
    expect(result.iterations).toBe(2);
    expect(result.integrityAfter).toBe(61);
    expect(result.qualityThresholdMet).toBe(false);
  });
});

describe('HTTP diagnostic safety', () => {
  it('does not log query credentials on a retry', async () => {
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await httpGet('https://example.test/?api_key=test-secret', { retries: 1, retryDelay: 0 });
    expect(console.warn).toHaveBeenCalled();
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toContain('test-secret');
  });
  it('does not attach query credentials to timeout errors', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(httpGet('https://example.test/?api_key=test-secret', { retries: 0 }))
      .rejects.toMatchObject({ message: 'Request timeout after 30000ms', response: undefined });
  });
});

describe('numerical sanitation', () => {
  it('preserves scenario estimates and CSS', () => {
    const html = '<style>.x{color:#111111;opacity:0.62}</style><span class="scenario-prob" data-no-cite>0%</span>';
    expect(sanitizeUnsourcedNumbers(html).html).toBe(html);
  });
  it('still removes unsourced empirical numbers', () => {
    expect(sanitizeUnsourcedNumbers('<p>Measured growth was 42%.</p>').sanitized).toBe(1);
  });
});
