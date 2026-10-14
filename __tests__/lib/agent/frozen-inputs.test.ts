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

  it('seeded trust:sourcecheck channel serves the fixture without invoking the producer', async () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    const fi = reset();
    const fixture = { results: [{ verdict: 'verified' }], retractedCount: 0, verifiedCount: 20, notFoundCount: 0, claimAbsentCount: 0, integrityScore: 95 };
    fi.seedFrozenInputs({ 'trust:sourcecheck': fixture });
    let producerRan = false;
    const v = await fi.captureInput('trust:sourcecheck', () => { producerRan = true; return { results: [], integrityScore: 0 }; });
    expect(producerRan).toBe(false);
    expect(v).toEqual(fixture);
  });

  it('seeded hero:image + safe:verify#N channels serve without producers', async () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    const fi = reset();
    fi.seedFrozenInputs({ 'hero:image': { url: 'https://img/hero.png', costUsd: 0.02 }, 'safe:verify#0': { results: [], supported: 2 } });
    let heroRan = false, safeRan = false;
    const hero = await fi.captureInput('hero:image', () => { heroRan = true; return null; });
    const safe = await fi.captureInput('safe:verify#0', () => { safeRan = true; return { results: [], supported: 0 }; });
    expect(heroRan).toBe(false);
    expect(safeRan).toBe(false);
    expect((hero as any).url).toBe('https://img/hero.png');
    expect((safe as any).supported).toBe(2);
  });

  it('seeded playbook:<role> channel serves without invoking the read', async () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    const fi = reset();
    const bullets = [{ text: 'recorded lesson', score: 3 }];
    fi.seedFrozenInputs({ 'playbook:council:geopolitics': bullets });
    let producerRan = false;
    const v = await fi.captureInput('playbook:council:geopolitics', () => { producerRan = true; return []; });
    expect(producerRan).toBe(false);
    expect(v).toEqual(bullets);
  });

  it('seeded critic:excerpt#N channel serves without invoking the excerpt producer', async () => {
    process.env.NOMOSX_LLM_MODE = 'replay';
    const fi = reset();
    fi.seedFrozenInputs({ 'critic:excerpt#0': 'recorded excerpt A', 'critic:excerpt#1': 'recorded excerpt B' });
    let producerRan = false;
    const a = await fi.captureInput('critic:excerpt#0', () => { producerRan = true; return 'live A'; });
    const b = await fi.captureInput('critic:excerpt#1', () => { producerRan = true; return 'live B'; });
    expect(producerRan).toBe(false);
    expect(a).toBe('recorded excerpt A');
    expect(b).toBe('recorded excerpt B');
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
