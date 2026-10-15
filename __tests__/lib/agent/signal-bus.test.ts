import { SignalBus, type AgentSignal } from '@/lib/agent/signals';

describe('SignalBus — stigmergic coordination', () => {
  it('resolves open signals in effective-intensity order', async () => {
    const bus = new SignalBus<Record<string, unknown>>({});
    const order: string[] = [];
    bus.post('low', 'low priority need', { postedBy: 'A', intensity: 0.2 });
    bus.post('high', 'high priority need', { postedBy: 'A', intensity: 0.9 });
    bus.registerResolver('low', (s) => { order.push(s.type); return { resolved: true }; });
    bus.registerResolver('high', (s) => { order.push(s.type); return { resolved: true }; });
    const res = await bus.sweep();
    expect(order).toEqual(['high', 'low']);
    expect(res.resolved).toBe(2);
    expect(res.remaining).toBe(0);
  });

  it('expires signals past their ttl (decay)', async () => {
    const bus = new SignalBus<Record<string, unknown>>({});
    const s = bus.post('stale', 'old need', { postedBy: 'A', intensity: 1, ttlMs: 1 });
    await new Promise(r => setTimeout(r, 5));
    const res = await bus.sweep();
    expect(s.status).toBe('expired');
    expect(res.resolved).toBe(0);
  });

  it('cassette modes use a virtual clock — ordering is wall-clock independent', async () => {
    const saved = process.env.NOMOSX_LLM_MODE;
    process.env.NOMOSX_LLM_MODE = 'replay';
    try {
      const bus = new SignalBus<Record<string, unknown>>({});
      const a = bus.post('x', 'first', { postedBy: 'A', intensity: 0.5 });
      const b = bus.post('x', 'second', { postedBy: 'A', intensity: 0.5 });
      // Virtual ticks, not epoch ms — a replayed run in ms must not decay
      // signals differently than a 45-minute record did.
      expect(a.postedAt).toBeLessThan(1_000_000);
      expect(b.postedAt).toBe(a.postedAt + 1);
      // Equal intensity: later posts decay less → recency wins, exactly as
      // the live wall-clock decay orders them — but now derived from virtual
      // ticks, identical between a 45-minute record and a 3-minute replay.
      const seen: string[] = [];
      bus.registerResolver('x', (sigs: AgentSignal[]) => {
        for (const s of sigs) seen.push(s.content);
        return { resolved: true };
      }, { batch: true });
      await bus.sweep();
      expect(seen).toEqual(['second', 'first']);
    } finally {
      if (saved === undefined) delete process.env.NOMOSX_LLM_MODE;
      else process.env.NOMOSX_LLM_MODE = saved;
    }
  });

  it('batch resolver receives all open signals of its type in one call', async () => {
    const bus = new SignalBus<Record<string, unknown>>({});
    bus.post('style_violation', 'v1', { postedBy: 'GATES', intensity: 0.5 });
    bus.post('style_violation', 'v2', { postedBy: 'GATES', intensity: 0.3 });
    let batchSize = 0;
    bus.registerResolver('style_violation', (sigs) => {
      batchSize = Array.isArray(sigs) ? sigs.length : 0;
      return { resolved: true, note: 'batch done' };
    }, { batch: true });
    const res = await bus.sweep();
    expect(batchSize).toBe(2);
    expect(res.resolved).toBe(2);
  });

  it('boosts signals serving unmet mission targets', async () => {
    const bus = new SignalBus<Record<string, unknown>>({});
    // scenario_invalid (intensity 0.6) serves requireCentralScenario — unmet → +0.3 boost = 0.9
    bus.post('scenario_invalid', 'broken block', { postedBy: 'GATE', intensity: 0.6 });
    // style_violation (intensity 0.85) serves quality — met → no boost
    bus.post('style_violation', 'AI tell', { postedBy: 'GATE', intensity: 0.85 });
    const order: string[] = [];
    bus.registerResolver('scenario_invalid', (s) => { order.push(s.type); return { resolved: true }; });
    bus.registerResolver('style_violation', (s) => { order.push(s.type); return { resolved: true }; });
    await bus.sweep({
      mission: { goal: 'g', targets: { requireCentralScenario: true, quality: 60 } },
      metrics: { centralScenarioOk: false, qualityScore: 80 },
    });
    expect(order[0]).toBe('scenario_invalid');
  });

  it('leaves signals without a resolver open — never crashes', async () => {
    const bus = new SignalBus<Record<string, unknown>>({});
    bus.post('unknown_type', 'no resolver registered', { postedBy: 'X', intensity: 1 });
    const res = await bus.sweep();
    expect(res.resolved).toBe(0);
    expect(res.remaining).toBe(1);
  });

  it('marks resolver failures without killing the sweep', async () => {
    const bus = new SignalBus<Record<string, unknown>>({});
    bus.post('a', 'will throw', { postedBy: 'X', intensity: 1 });
    bus.post('b', 'will succeed', { postedBy: 'X', intensity: 0.9 });
    bus.registerResolver('a', () => { throw new Error('resolver exploded'); });
    bus.registerResolver('b', () => ({ resolved: true, note: 'ok' }));
    const res = await bus.sweep();
    expect(res.failed).toBe(1);
    expect(res.resolved).toBe(1);
  });
});

// ─── PersistentSignalBus (P2/8) — signals survive across cycles ──────────────

describe('PersistentSignalBus — cross-cycle memory', () => {
  const auditRows: Array<any> = [];

  beforeEach(() => {
    auditRows.length = 0;
    jest.resetModules();
    jest.doMock('@/lib/db', () => ({
      prisma: {
        agentAuditLog: {
          create: jest.fn(async ({ data }: any) => { auditRows.push(data); return data; }),
          findFirst: jest.fn(async ({ where }: any) =>
            auditRows.filter(r => r.resource === where.resource).pop() ?? null,
          ),
        },
      },
    }));
  });

  it('persists signals on flush and rehydrates them in a new bus', async () => {
    const { PersistentSignalBus, rehydrateSignalBus } = await import('@/lib/agent/signals');
    const bus = new PersistentSignalBus<Record<string, unknown>>({}, 'test-key');
    bus.post('dossier_watch', 'watching Arctic dossier', { postedBy: 'watch', intensity: 0.8 });
    await bus.flush();
    expect(auditRows.some(r => r.action === 'SIGNAL_SYNC' && r.resource === 'test-key')).toBe(true);

    const restored = await rehydrateSignalBus({}, 'test-key');
    expect(restored).not.toBeNull();
    const open = restored!.openSignals();
    expect(open).toHaveLength(1);
    expect(open[0].type).toBe('dossier_watch');
  });

  it('resolved signals are not rehydrated', async () => {
    const { PersistentSignalBus, rehydrateSignalBus } = await import('@/lib/agent/signals');
    const bus = new PersistentSignalBus<Record<string, unknown>>({}, 'k2');
    bus.post('a', 'will be resolved', { postedBy: 'X' });
    bus.registerResolver('a', () => ({ resolved: true }));
    await bus.sweep();
    const restored = await rehydrateSignalBus({}, 'k2');
    expect(restored === null || restored.openSignals().length === 0).toBe(true);
  });

  it('returns null for an unknown key', async () => {
    const { rehydrateSignalBus } = await import('@/lib/agent/signals');
    expect(await rehydrateSignalBus({}, 'never-persisted')).toBeNull();
  });
});
