/**
 * frozen-inputs store — the non-LLM companion of the cassette.
 * Record captures producer outputs; replay serves them without running the
 * producer; FIFO sync channels replay in call order.
 */
import { captureInput, captureInputSync, seedFrozenInputs, snapshotFrozenInputs } from '../../../lib/agent/frozen-inputs';

const reset = () => {
  // Re-import to get a fresh module-level store per scenario.
  jest.resetModules();
  return require('../../../lib/agent/frozen-inputs') as typeof import('../../../lib/agent/frozen-inputs');
};

describe('frozen-inputs store', () => {
  const OLD = process.env.NOMOSX_LLM_MODE;
  afterEach(() => { process.env.NOMOSX_LLM_MODE = OLD; });

  it('live mode never captures — producer runs every call', async () => {
    delete process.env.NOMOSX_LLM_MODE;
    const fi = reset();
    let calls = 0;
    await fi.captureInput('x', () => ++calls);
    await fi.captureInput('x', () => ++calls);
    expect(calls).toBe(2);
    expect(fi.snapshotFrozenInputs()).toEqual({});
  });

  it('record mode captures producer output into the snapshot', async () => {
    process.env.NOMOSX_LLM_MODE = 'record';
    const fi = reset();
    let calls = 0;
    const v = await fi.captureInput('memory:reader', async () => ({ topLessons: [1], promptBlock: 'L' }));
    expect(v.promptBlock).toBe('L');
    await fi.captureInput('memory:reader', () => { calls++; return { topLessons: [], promptBlock: 'X' }; });
    expect(calls).toBe(0); // second call served from store
    expect(fi.snapshotFrozenInputs()['memory:reader']).toEqual({ topLessons: [1], promptBlock: 'L' });
  });

  it('seeded store serves values without running producers (replay)', async () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    const fi = reset();
    fi.seedFrozenInputs({ 'delphi:markets': { predictions: [{ p: 0.4 }], avgProbability: 0.4 } });
    let producerRan = false;
    const v = await fi.captureInput('delphi:markets', () => { producerRan = true; return { predictions: [], avgProbability: null }; });
    expect(producerRan).toBe(false);
    expect(v.avgProbability).toBe(0.4);
  });

  it('replay miss falls through to the producer (fail-loud happens downstream)', async () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    const fi = reset();
    fi.seedFrozenInputs({});
    const v = await fi.captureInput('absent', () => 'live-value');
    expect(v).toBe('live-value');
  });

  it('sync FIFO channels replay in call order', () => {
    process.env.NOMOSX_LLM_MODE = 'record';
    let fi = reset();
    // record: producers compute live — occurrence order is the FIFO tape
    expect(fi.captureInputSync('time:headroom', () => true)).toBe(true);
    expect(fi.captureInputSync('time:headroom', () => false)).toBe(false);
    const snap = fi.snapshotFrozenInputs();
    expect(snap['time:headroom#0']).toBe(true);
    expect(snap['time:headroom#1']).toBe(false);

    // replay: fresh module seeded with the snapshot
    process.env.NOMOSX_LLM_MODE = 'replay';
    fi = reset();
    fi.seedFrozenInputs(snap);
    // producers deliberately return the OPPOSITE — the store must win
    expect(fi.captureInputSync('time:headroom', () => false)).toBe(true);
    expect(fi.captureInputSync('time:headroom', () => true)).toBe(false);
  });
});
