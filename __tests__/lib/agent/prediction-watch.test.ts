/**
 * Prediction-watch tests — deterministic trigger matching, dedup,
 * dossier-watch persistence via the signal bus.
 * Prisma is mocked in-memory; no DB, no LLM.
 */

import { matchPredictionTriggers, runPredictionWatch } from '@/lib/agent/prediction-watch';
import type { RadarTopic } from '@/lib/agent/topic-radar';

const signalRows: Array<any> = [];
const auditRows: Array<any> = [];

jest.mock('@/lib/db', () => ({
  prisma: {
    prediction: {
      findMany: jest.fn(async () => predictionsFixture),
    },
    signal: {
      findMany: jest.fn(async () => signalRows),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `sig-db-${signalRows.length}`, ...data };
        signalRows.push(row);
        return row;
      }),
    },
    vertical: {
      findFirst: jest.fn(async () => ({ id: 'vert-1' })),
      findMany: jest.fn(async () => [{ id: 'vert-1', slug: 'geopolitics' }]),
    },
    agentAuditLog: {
      create: jest.fn(async ({ data }: any) => { auditRows.push(data); return data; }),
      findFirst: jest.fn(async ({ where }: any) =>
        auditRows.filter(r => r.resource === where.resource).pop() ?? null,
      ),
    },
  },
}));

const topic = (over: Partial<RadarTopic>): RadarTopic => ({
  id: 't1', title: '', summary: '', source: 'rss', sourceType: 'news',
  publishedAt: new Date(), score: 50, ...over,
});

let predictionsFixture: any[] = [];

beforeEach(() => {
  predictionsFixture = [];
  signalRows.length = 0;
  auditRows.length = 0;
  jest.clearAllMocks();
});

describe('matchPredictionTriggers — deterministic', () => {
  const pred = (over: Partial<any> = {}) => ({
    id: 'p1', briefId: 'b1', claim: 'Greenland rare-earth extraction reaches commercial scale',
    horizon: '2027', resolutionCriteria: 'By 2027: Greenland rare-earth mine ships first commercial cargo',
    whatWouldFalsify: 'Greenland mining permit revoked or Tanbreez project suspended',
    ...over,
  });

  it('fires when a topic matches the falsification trigger', () => {
    const matches = matchPredictionTriggers([topic({
      title: 'Greenland government suspends Tanbreez mining permit',
      summary: 'The Greenland mining permit for the Tanbreez project was suspended.',
    })], [pred()]);
    expect(matches).toHaveLength(1);
    expect(matches[0].predictionId).toBe('p1');
  });

  it('does not fire on lexically unrelated topics', () => {
    const matches = matchPredictionTriggers([topic({
      title: 'EU fisheries council meets in Brussels',
      summary: 'Agriculture ministers discuss quotas.',
    })], [pred()]);
    expect(matches).toHaveLength(0);
  });

  it('does not fire when the trigger surface is too vague (<3 distinctive tokens)', () => {
    const matches = matchPredictionTriggers([topic({
      title: 'Things changed significantly this year',
      summary: 'A lot happened.',
    })], [pred({ whatWouldFalsify: 'it', resolutionCriteria: 'yes' })]);
    expect(matches).toHaveLength(0);
  });
});

describe('runPredictionWatch — wiring', () => {
  it('creates a PREDICTION_TRIGGER signal + dispatch item per fired trigger', async () => {
    predictionsFixture = [{
      id: 'p1', briefId: 'b1', claim: 'Greenland rare-earth extraction reaches commercial scale',
      horizon: '2027', resolutionCriteria: 'By 2027: Greenland rare-earth mine ships first commercial cargo',
      whatWouldFalsify: 'Greenland mining permit revoked or Tanbreez project suspended',
    }];
    const res = await runPredictionWatch([topic({
      title: 'Greenland suspends Tanbreez mining permit',
      summary: 'The Greenland mining permit for Tanbreez was suspended by parliament.',
    })]);
    expect(res.fired).toBe(1);
    expect(res.items[0].signalId).toMatch(/^sig-db-/);
    expect(signalRows[0].signalType).toBe('PREDICTION_TRIGGER');
    expect(signalRows[0].priorityScore).toBeGreaterThanOrEqual(70);
    expect(signalRows[0].summary).toContain('[PRED:p1]');
  });

  it('dedups — a prediction fires only once', async () => {
    signalRows.push({ summary: '[PRED:p1] already fired' });
    predictionsFixture = [{
      id: 'p1', briefId: 'b1', claim: 'Greenland rare-earth extraction reaches commercial scale',
      horizon: '2027', resolutionCriteria: 'By 2027: Greenland rare-earth mine ships first commercial cargo',
      whatWouldFalsify: 'Greenland mining permit revoked or Tanbreez project suspended',
    }];
    const res = await runPredictionWatch([topic({
      title: 'Greenland suspends Tanbreez mining permit',
      summary: 'The Greenland mining permit for Tanbreez was suspended.',
    })]);
    expect(res.fired).toBe(0);
    expect(res.items).toHaveLength(0);
  });

  it('returns empty when no open predictions exist', async () => {
    const res = await runPredictionWatch([topic({ title: 'anything' })]);
    expect(res.fired).toBe(0);
    expect(res.scanned).toBe(0);
  });
});
