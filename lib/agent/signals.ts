/**
 * SIGNAL BUS + MISSION — the collective-intelligence substrate.
 *
 * Inspired by stigmergic coordination (SBP — Stigmergic Blackboard Protocol):
 * agents do NOT message each other directly. They post *needs* on the shared
 * blackboard as typed signals with intensity and decay; any agent that has a
 * registered resolver for that type senses the signal at the next sweep
 * checkpoint and resolves it. Adding a new capability = registering a new
 * resolver — the pipeline flow never changes.
 *
 *   critic    → post('claim_unverifiable', …)        ─┐
 *   DA        → post('substance_weak', challenge)     │   sweep: drain by
 *   styleGate → post('style_violation', …)            ├─→ effectiveIntensity,
 *   gate      → post('scenario_invalid', …)           │   route to resolvers
 *   analyst   → post('coverage_gap', query, …)       ─┘   mark resolved
 *
 * The MISSION is the single shared goal: explicit publication targets every
 * agent can read. At sweep time, signals that address unmet mission targets
 * get an intensity boost — resolution is goal-directed, not FIFO.
 *
 * Decay: effectiveIntensity = intensity × (1 − elapsed/ttl). Expired signals
 * close without resolution — stale needs must not cause retry storms.
 */

export type SignalType =
  | 'coverage_gap'        // missing sources/evidence for a claim or dimension
  | 'claim_unverifiable'  // a claim failed grounding and needs evidence
  | 'substance_weak'      // adversarial objection to argumentation
  | 'style_violation'     // prose register defect
  | 'scenario_invalid'    // central scenario block broken/mismatched
  | 'citation_gap'        // citation coverage below target
  | (string & {});        // open — new types work without touching this file

export interface AgentSignal {
  id: string;
  type: SignalType;
  content: string;
  /** 0–1 — how much this need matters to the mission. */
  intensity: number;
  postedBy: string;
  postedAt: number;
  /** Milliseconds until the signal decays to zero and expires. */
  ttlMs: number;
  status: 'open' | 'claimed' | 'resolved' | 'failed' | 'expired';
  claimedBy?: string;
  resolvedBy?: string;
  resolution?: string;
  /** Structured hints for resolvers — queries, provider hints, edits, refs. */
  payload?: Record<string, unknown>;
}

export interface SignalResolution {
  resolved: boolean;
  note?: string;
  /** Optional artifact the resolver produced (patched html, new sources…). */
  artifact?: unknown;
}

export type SignalResolver<T = unknown> = (
  signal: AgentSignal,
  context: T,
) => Promise<SignalResolution> | SignalResolution;

/** Batch resolver: receives ALL open signals of its type in one call —
 *  one LLM pass can resolve N signals (e.g. all style violations at once). */
export type BatchSignalResolver<T = unknown> = (
  signals: AgentSignal[],
  context: T,
) => Promise<Map<string, SignalResolution> | SignalResolution> | Map<string, SignalResolution> | SignalResolution;

interface ResolverEntry<T> {
  fn: SignalResolver<T> | BatchSignalResolver<T>;
  batch: boolean;
}

export interface MissionTargets {
  trust?: number;
  groundedness?: number;
  citationCoverage?: number;
  minSources?: number;
  requireCentralScenario?: boolean;
  quality?: number;
}

export interface Mission {
  goal: string;
  targets: MissionTargets;
}

/** Signal types ↔ mission targets they serve. */
const SIGNAL_SERVES: Record<string, keyof MissionTargets> = {
  coverage_gap: 'minSources',
  claim_unverifiable: 'groundedness',
  citation_gap: 'citationCoverage',
  substance_weak: 'quality',
  style_violation: 'quality',
  scenario_invalid: 'requireCentralScenario',
};

export class SignalBus<T = unknown> {
  private signals: AgentSignal[] = [];
  private resolvers = new Map<string, ResolverEntry<T>[]>();
  private seq = 0;

  constructor(private context: T) {}

  post(
    type: SignalType,
    content: string,
    opts: { postedBy: string; intensity?: number; ttlMs?: number; payload?: Record<string, unknown> },
  ): AgentSignal {
    const signal: AgentSignal = {
      id: `sig-${++this.seq}`,
      type,
      content: content.slice(0, 500),
      intensity: Math.min(1, Math.max(0, opts.intensity ?? 0.5)),
      postedBy: opts.postedBy,
      postedAt: Date.now(),
      ttlMs: opts.ttlMs ?? 30 * 60 * 1000,
      status: 'open',
      payload: opts.payload,
    };
    this.signals.push(signal);
    return signal;
  }

  registerResolver(type: SignalType, resolver: SignalResolver<T> | BatchSignalResolver<T>, opts: { batch?: boolean } = {}): void {
    const list = this.resolvers.get(type) ?? [];
    list.push({ fn: resolver, batch: opts.batch === true });
    this.resolvers.set(type, list);
  }

  /** Linear decay: intensity falls to 0 at ttl. */
  effectiveIntensity(s: AgentSignal, now = Date.now()): number {
    const elapsed = now - s.postedAt;
    return s.intensity * Math.max(0, 1 - elapsed / s.ttlMs);
  }

  openSignals(now = Date.now()): AgentSignal[] {
    for (const s of this.signals) {
      if (s.status === 'open' && this.effectiveIntensity(s, now) <= 0) s.status = 'expired';
    }
    return this.signals
      .filter(s => s.status === 'open')
      .sort((a, b) => this.effectiveIntensity(b, now) - this.effectiveIntensity(a, now));
  }

  /**
   * Which mission targets are still unmet — shared situational awareness.
   * Signals serving an unmet target get a priority boost at sweep time.
   */
  missionDelta(mission: Mission, metrics: Record<string, number | boolean | undefined>): string[] {
    const unmet: string[] = [];
    const t = mission.targets;
    const num = (v: number | boolean | undefined) => (typeof v === 'number' ? v : 0);
    if (t.trust !== undefined && num(metrics.trust) < t.trust) unmet.push('trust');
    if (t.groundedness !== undefined && num(metrics.groundedness) < t.groundedness) unmet.push('groundedness');
    if (t.citationCoverage !== undefined && num(metrics.citationCoverage) < t.citationCoverage) unmet.push('citationCoverage');
    if (t.minSources !== undefined && num(metrics.sourceCount) < t.minSources) unmet.push('minSources');
    if (t.quality !== undefined && num(metrics.qualityScore) < t.quality) unmet.push('quality');
    if (t.requireCentralScenario && metrics.centralScenarioOk === false) unmet.push('requireCentralScenario');
    return unmet;
  }

  /**
   * Drain open signals: claim each in effective-intensity order (boosted when
   * it serves an unmet mission target), run the first registered resolver,
   * record the outcome. Bounded by maxResolutions — a sweep is a checkpoint,
   * not an event loop.
   */
  async sweep(opts: {
    maxResolutions?: number;
    mission?: Mission;
    metrics?: Record<string, number | boolean | undefined>;
    onResolve?: (signal: AgentSignal, res: SignalResolution) => void;
  } = {}): Promise<{ resolved: number; failed: number; expired: number; remaining: number; results: { signal: AgentSignal; res: SignalResolution }[] }> {
    const maxResolutions = opts.maxResolutions ?? 6;
    const unmet = opts.mission && opts.metrics ? this.missionDelta(opts.mission, opts.metrics) : [];

    // Goal-directed ordering: signals serving unmet targets get +0.3 boost.
    const now = Date.now();
    const open = this.openSignals(now).sort((a, b) => {
      const boost = (s: AgentSignal) => (SIGNAL_SERVES[s.type] && unmet.includes(SIGNAL_SERVES[s.type] as string) ? 0.3 : 0);
      return this.effectiveIntensity(b, now) + boost(b) - (this.effectiveIntensity(a, now) + boost(a));
    });

    let resolved = 0, failed = 0;
    const results: { signal: AgentSignal; res: SignalResolution }[] = [];
    let attempts = 0;

    const mark = (signal: AgentSignal, res: SignalResolution, claimedBy: string) => {
      if (res.resolved) {
        signal.status = 'resolved';
        signal.resolvedBy = claimedBy;
        signal.resolution = res.note;
        resolved++;
      } else {
        signal.status = 'failed';
        signal.resolution = res.note;
        failed++;
      }
      results.push({ signal, res });
      opts.onResolve?.(signal, res);
    };

    // Group open signals by type so batch resolvers handle all at once.
    const byType = new Map<string, AgentSignal[]>();
    for (const s of open) {
      const list = byType.get(s.type) ?? [];
      list.push(s);
      byType.set(s.type, list);
    }

    for (const signal of open) {
      if (attempts >= maxResolutions || signal.status !== 'open') break;
      const handlers = this.resolvers.get(signal.type);
      if (!handlers?.length) continue;

      const batchEntry = handlers.find(h => h.batch);
      if (batchEntry) {
        const group = (byType.get(signal.type) ?? []).filter(s => s.status === 'open');
        if (group.length === 0) continue;
        attempts++;
        const claimedBy = (batchEntry.fn as Function).name || 'batch';
        for (const s of group) { s.status = 'claimed'; s.claimedBy = claimedBy; }
        try {
          const out = await (batchEntry.fn as BatchSignalResolver<T>)(group, this.context);
          const perSignal = out instanceof Map ? out : new Map(group.map(s => [s.id, out as SignalResolution]));
          for (const s of group) {
            mark(s, perSignal.get(s.id) ?? { resolved: false, note: 'no per-signal resolution returned' }, claimedBy);
          }
        } catch (err) {
          for (const s of group) {
            mark(s, { resolved: false, note: String(err).slice(0, 200) }, claimedBy);
          }
        }
        continue;
      }

      attempts++;
      const entry = handlers[0];
      signal.status = 'claimed';
      signal.claimedBy = (entry.fn as Function).name || 'anonymous';
      try {
        const res = await (entry.fn as SignalResolver<T>)(signal, this.context);
        mark(signal, res, signal.claimedBy);
      } catch (err) {
        mark(signal, { resolved: false, note: String(err).slice(0, 200) }, signal.claimedBy);
      }
    }

    const expired = this.signals.filter(s => s.status === 'expired').length;
    const remaining = this.signals.filter(s => s.status === 'open').length;
    return { resolved, failed, expired, remaining, results };
  }

  /** Close all open signals of a type — for legacy consumers that resolve
   *  needs through their own machinery (e.g. gap-fill consuming coverage_gap). */
  resolveSignalsByType(type: SignalType, resolvedBy: string, note?: string): number {
    let n = 0;
    for (const s of this.signals) {
      if (s.type === type && s.status === 'open') {
        s.status = 'resolved';
        s.resolvedBy = resolvedBy;
        s.resolution = note;
        n++;
      }
    }
    return n;
  }

  getSummary(): Record<string, unknown> {
    const by = (st: AgentSignal['status']) => this.signals.filter(s => s.status === st);
    return {
      total: this.signals.length,
      open: by('open').length,
      resolved: by('resolved').length,
      failed: by('failed').length,
      expired: by('expired').length,
      byType: this.signals.reduce<Record<string, number>>((acc, s) => { acc[s.type] = (acc[s.type] ?? 0) + 1; return acc; }, {}),
    };
  }

  get all(): readonly AgentSignal[] {
    return this.signals;
  }

  /** Restore a signal list (persistence rehydration). Caller ensures ids
   *  don't collide — rehydrated ids carry their original `sig-` prefix. */
  _restore(signals: AgentSignal[]): void {
    this.signals.push(...signals);
    const maxSeq = signals.reduce((m, s) => {
      const n = Number(/^sig-(\d+)$/.exec(s.id)?.[1]);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    if (maxSeq > this.seq) this.seq = maxSeq;
  }
}

// ============================================================================
// PERSISTENT BUS (P2-8) — signals survive across cycles.
//
// The in-memory bus dies with the run; dossier tracking needs needs that
// outlive it. Persistence mirrors the durable-execution pattern: mutations
// are recorded in `agentAuditLog` keyed by a `persistKey` (dossier/scope),
// and a new cycle rehydrates the bus by replaying the latest sync record.
//
// Records:
//   action='SIGNAL_SYNC', agent='signal_bus', resource=persistKey,
//   metadata={ signals: AgentSignal[] } — full snapshot after each mutation
// ============================================================================

const SIGNAL_BUS_AGENT = 'signal_bus';
const SIGNAL_SYNC_ACTION = 'SIGNAL_SYNC';

export class PersistentSignalBus<T = unknown> extends SignalBus<T> {
  private dirty = false;

  constructor(context: T, public readonly persistKey: string) {
    super(context);
  }

  override post(
    type: SignalType,
    content: string,
    opts: { postedBy: string; intensity?: number; ttlMs?: number; payload?: Record<string, unknown> },
  ): AgentSignal {
    const s = super.post(type, content, opts);
    this.dirty = true;
    return s;
  }

  override resolveSignalsByType(type: SignalType, resolvedBy: string, note?: string): number {
    const n = super.resolveSignalsByType(type, resolvedBy, note);
    if (n > 0) {
      this.dirty = true;
      void this.flush();
    }
    return n;
  }

  override async sweep(opts: Parameters<SignalBus<T>['sweep']>[0] = {}) {
    const res = await super.sweep(opts);
    await this.flush();
    return res;
  }

  /** Persist the current signal list. Fire-and-forget failures — a lost
   *  sync degrades to an in-memory bus, never a pipeline error. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const { prisma } = await import('../db');
      await prisma.agentAuditLog.create({
        data: {
          agent: SIGNAL_BUS_AGENT,
          action: SIGNAL_SYNC_ACTION,
          resource: this.persistKey,
          metadata: JSON.stringify({ signals: this.all, syncedAt: Date.now() }),
        },
      });
    } catch (err) {
      console.warn('[SignalBus] persist failed (non-blocking):', err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Rehydrate a bus for a dossier key from the latest sync record.
 * Returns null when nothing was ever persisted for this key.
 */
export async function rehydrateSignalBus<T>(
  context: T,
  persistKey: string,
): Promise<PersistentSignalBus<T> | null> {
  try {
    const { prisma } = await import('../db');
    const record = await prisma.agentAuditLog.findFirst({
      where: { agent: SIGNAL_BUS_AGENT, action: SIGNAL_SYNC_ACTION, resource: persistKey },
      orderBy: { timestamp: 'desc' },
    });
    if (!record?.metadata) return null;
    const data = JSON.parse(record.metadata) as { signals?: AgentSignal[] };
    const bus = new PersistentSignalBus<T>(context, persistKey);
    bus._restore((data.signals ?? []).filter(s => s.status !== 'resolved' && s.status !== 'failed'));
    return bus;
  } catch {
    return null;
  }
}
