import { extractPipelineScores, countWordsHtml, isModerateTierEligible } from '@/lib/agent/inquiry-funnel-utils';
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
  it.each([{ skipped: true }, { error: 'unavailable' }, { evaluationComplete: false }])('excludes invalid DA scores from all blends: %j', flags => {
    const stats = { rank: { avgQuality: 60 }, citationFilter: { coverageAfter: 50 } };
    const baseline = extractPipelineScores(stats, {}, { trustScore: 62, qualityScore: 60 });
    const invalid = { publishabilityScore: 100, verdict: 'publish', ...flags };
    expect(extractPipelineScores({ ...stats, devilsAdvocate: invalid }, {}, { trustScore: 62, qualityScore: 60 })).toEqual(baseline);
    expect(extractPipelineScores(stats, { devilsAdvocate: invalid }, { trustScore: 62, qualityScore: 60 })).toEqual(baseline);
  });
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

describe('cited-source quality proxy', () => {
  it('prefers citedSourceQuality.avgQuality over the diluted ranked-pool average', () => {
    // Pool avg 54 (long tail) but the 12 sources actually cited average 86 —
    // the artifact's real evidence base. Quality blend must use the cited avg.
    const stats = {
      rank: { avgQuality: 54 },
      citedSourceQuality: { cited: 12, avgQuality: 86 },
      citationFilter: { coverageAfter: 96 },
      critic: { overallScore: 71 },
      structuralEditor: { overallStructure: 76 },
    };
    const scores = extractPipelineScores(stats, { devilsAdvocate: { publishabilityScore: 100, verdict: 'publish', evaluationComplete: true } }, null);
    // cited avg 86 (≥78 → no coverage boost); blend = 86*.5 + 71*.1 + 76*.25 + 100*.15 = 84.1 → 84
    expect(scores.qualityScore).toBe(84);
  });
  it('falls back to rank.avgQuality when too few sources are cited', () => {
    const stats = {
      rank: { avgQuality: 54 },
      citedSourceQuality: { cited: 2, avgQuality: 95 },
      citationFilter: { coverageAfter: 96 },
    };
    const scores = extractPipelineScores(stats, {}, null);
    // falls back: 54 + boost 10 = 64 as sole component
    expect(scores.qualityScore).toBe(64);
  });
  it('falls back to rank.avgQuality when citedSourceQuality is absent', () => {
    const stats = { rank: { avgQuality: 60 }, citationFilter: { coverageAfter: 50 } };
    const scores = extractPipelineScores(stats, {}, null);
    expect(scores.qualityScore).toBe(60);
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

describe('moderate-confidence calibrated tier', () => {
  const holdOnTrustOnly = {
    decision: 'hold',
    checks: [
      { checkType: 'source_depth', passed: true, score: 30 },
      { checkType: 'trust_score', passed: false, score: 62 },
      { checkType: 'citation_coverage', passed: true, score: 80 },
      { checkType: 'evaluation_freshness', passed: true },
    ],
  };
  it('is eligible when trust_score is the sole gate failure in the moderate band', () => {
    expect(isModerateTierEligible({
      gate: holdOnTrustOnly, readiness: { ok: false, failures: ['trustScore 62/100 < 65'] },
      trustScore: 62, qualityScore: 55, adaptiveMinTrust: 65,
    })).toBe(true);
  });
  it('is NOT eligible when an integrity check also failed (citation coverage)', () => {
    expect(isModerateTierEligible({
      gate: { decision: 'hold', checks: [
        ...holdOnTrustOnly.checks.slice(0, 2),
        { checkType: 'citation_coverage', passed: false, score: 20 },
      ] },
      readiness: { ok: false, failures: ['trustScore 62/100 < 65', 'citationCoverage 20% < 50%'] },
      trustScore: 62, qualityScore: 55, adaptiveMinTrust: 65,
    })).toBe(false);
  });
  it('is NOT eligible below the viable floor or above the bar', () => {
    expect(isModerateTierEligible({
      gate: holdOnTrustOnly, readiness: { ok: false, failures: ['trustScore 40/100 < 65'] },
      trustScore: 40, qualityScore: 55, adaptiveMinTrust: 65,
    })).toBe(false);
    expect(isModerateTierEligible({
      gate: holdOnTrustOnly, readiness: { ok: true, failures: [] },
      trustScore: 80, qualityScore: 90, adaptiveMinTrust: 65,
    })).toBe(false);
  });

  it('orchestrator publishes a moderate-band piece with a rendered calibration badge when the tier is opted in', async () => {
    process.env.NOMOSX_ALLOW_MODERATE_PUBLISH = '1';
    jest.mocked(runInquiryPipeline).mockResolvedValue({
      briefId: 'brief', html: '<html><body><article><p>Verified article</p></article></body></html>', format: 'brief',
      trustScore: 62, qualityScore: 55,
      stats: { criticalLoop: { finalScore: 62 }, rank: { avgQuality: 90 }, citationFilter: { coverageAfter: 100 } },
      lineage: {}, inquiry: { id: 'brief', slug: 'test', title: 'Test', question: 'Test question', sources: [] },
    } as unknown as Awaited<ReturnType<typeof runInquiryPipeline>>);
    jest.mocked(evaluatePublicationGate).mockReturnValue({
      decision: 'hold',
      checks: holdOnTrustOnly.checks,
      metrics: { citationCoverage: 0.8 },
      reasons: [], warnings: [],
    } as unknown as ReturnType<typeof evaluatePublicationGate>);
    jest.mocked(evaluatePublicationReadiness).mockReturnValue({
      ok: false, failures: ['trustScore 62/100 < 65'], warnings: [],
    } as unknown as ReturnType<typeof evaluatePublicationReadiness>);
    const result = await runAndPublishInquiry({ question: 'A sufficiently detailed question', source: 'manual', verticalId: 'vertical', skipDuplicateCheck: true });
    expect(result.status).toBe('published');
    expect(prisma.thinkTankPublication.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PUBLISHED', html: expect.stringContaining('Preliminary assessment') }),
    }));
    delete process.env.NOMOSX_ALLOW_MODERATE_PUBLISH;
  });

  it('orchestrator HOLDS a moderate-band piece by default (preliminary tier is opt-in)', async () => {
    delete process.env.NOMOSX_ALLOW_MODERATE_PUBLISH;
    jest.mocked(runInquiryPipeline).mockResolvedValue({
      briefId: 'brief', html: '<html><body><article><p>Verified article</p></article></body></html>', format: 'brief',
      trustScore: 62, qualityScore: 55,
      stats: { criticalLoop: { finalScore: 62 }, rank: { avgQuality: 90 }, citationFilter: { coverageAfter: 100 } },
      lineage: {}, inquiry: { id: 'brief', slug: 'test', title: 'Test', question: 'Test question', sources: [] },
    } as unknown as Awaited<ReturnType<typeof runInquiryPipeline>>);
    jest.mocked(evaluatePublicationGate).mockReturnValue({
      decision: 'hold',
      checks: holdOnTrustOnly.checks,
      metrics: { citationCoverage: 0.8 },
      reasons: [], warnings: [],
    } as unknown as ReturnType<typeof evaluatePublicationGate>);
    jest.mocked(evaluatePublicationReadiness).mockReturnValue({
      ok: false, failures: ['trustScore 62/100 < 65'], warnings: [],
    } as unknown as ReturnType<typeof evaluatePublicationReadiness>);
    const result = await runAndPublishInquiry({ question: 'A sufficiently detailed question', source: 'manual', verticalId: 'vertical', skipDuplicateCheck: true });
    expect(result.status).toBe('held');
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
    await expect(httpGet('https://example.test/?api_key=test-secret', { retries: 0, cache: false }))
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
  it('never touches the central-scenario block — verbatim gate fidelity (S38 paid-run regression)', () => {
    const scenario = '<section class="nx-block central-scenario"><div class="central-rationale"><p>That is why our confidence is 68%, not 85%.</p></div></section>';
    const html = `<p>Unrelated claim grew 42% last year.</p>${scenario}`;
    const out = sanitizeUnsourcedNumbers(html);
    // Body numbers still sanitized…
    expect(out.sanitized).toBe(1);
    expect(out.html).toContain('not established');
    // …but the decision block is byte-identical — the gate compares it verbatim.
    expect(out.html).toContain(scenario);
    expect(out.html).not.toContain('not not established');
  });
  it('localizes the replacement marker — no French text in English artifacts', () => {
    const en = sanitizeUnsourcedNumbers('<p>Measured growth was 42% across the sector.</p>').html;
    expect(en).toContain('not established');
    expect(en).not.toContain('non établie');
    // French artifact keeps the French marker. Pad with enough French content
    // words to cross the 6% detection threshold.
    const fr = sanitizeUnsourcedNumbers(
      '<p>La croissance mesurée dans le secteur était de 42% selon les données, et la tendance que nous observons dans ces résultats confirme que cette progression est réelle pour les acteurs sur le terrain.</p>',
    ).html;
    expect(fr).toContain('non établie');
    expect(fr).not.toContain('not established');
  });
});
