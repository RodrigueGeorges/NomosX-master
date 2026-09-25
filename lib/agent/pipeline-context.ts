/**
 * Pipeline Blackboard — Shared context across all agents (2026 pattern).
 *
 * Inspired by the Blackboard architecture pattern: all agents read/write
 * to a shared context object. This breaks silos between SCOUT → RANK →
 * READER → ANALYST → EDITOR by allowing:
 *
 * - ANALYST to request targeted re-search from SCOUT via `requestSourceGap()`
 * - EDITOR to see gaps identified by ANALYST via `getFindings()`
 * - READER to see which sources SCOUT found most relevant via `getFindings()`
 * - Any agent to log insights that downstream agents can consume
 *
 * This is NOT a replacement for the existing pipeline flow — it's an
 * augmentation layer that makes the pipeline more agentic and less siloed.
 */

import { SignalBus, type Mission, type MissionTargets, type SignalType, type AgentSignal } from './signals';

export interface PipelineFinding {
  agent: string;
  timestamp: number;
  type: 'insight' | 'gap' | 'warning' | 'recommendation';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SourceGapRequest {
  query: string;
  reason: string;
  requestedBy: string;
  timestamp: number;
  providers?: string[];
  minResults?: number;
}

export interface PipelineBlackboard {
  query: string;
  domain: string;
  isStrategic: boolean;

  // Findings written by agents
  findings: PipelineFinding[];

  // Source gap requests — ANALYST can request SCOUT to search for specific topics
  sourceGapRequests: SourceGapRequest[];

  // Shared state — agents can read what previous agents produced
  scoutSourceIds: string[];
  rankedSourceIds: string[];
  readerExtracts: any[];
  analystOutput: any;

  // Complexity classification — set by the router
  complexity: 'low' | 'medium' | 'high';
  skipSteps: Set<string>;

  // Metrics
  startTime: number;
  agentTimings: Record<string, number>;

  // Mission — the single shared goal every agent reads (Sprint 26)
  mission?: Mission;
}

export class PipelineContext {
  private bb: PipelineBlackboard;
  /** Stigmergic signal bus — agents post needs, resolvers sense and resolve
   *  them at sweep checkpoints. This IS the collective layer: any agent can
   *  emit a need without knowing who will answer it. */
  /** Mutable: pipeline-v2 swaps in a PersistentSignalBus when durable
   *  execution is enabled, so open needs survive a crash + resume. */
  signals: SignalBus<PipelineContext> = new SignalBus<PipelineContext>(this);

  constructor(query: string, isStrategic: boolean) {
    this.bb = {
      query,
      domain: '',
      isStrategic,
      findings: [],
      sourceGapRequests: [],
      scoutSourceIds: [],
      rankedSourceIds: [],
      readerExtracts: [],
      analystOutput: null,
      complexity: 'medium',
      skipSteps: new Set(),
      startTime: Date.now(),
      agentTimings: {},
    };
  }

  get blackboard(): PipelineBlackboard {
    return this.bb;
  }

  setDomain(domain: string) {
    this.bb.domain = domain;
  }

  setComplexity(complexity: 'low' | 'medium' | 'high') {
    this.bb.complexity = complexity;
  }

  shouldSkip(step: string): boolean {
    return this.bb.skipSteps.has(step);
  }

  skipStep(step: string) {
    this.bb.skipSteps.add(step);
    console.log(`[BLACKBOARD] Step "${step}" marked for skip`);
  }

  setScoutSources(ids: string[]) {
    this.bb.scoutSourceIds = ids;
  }

  setRankedSources(ids: string[]) {
    this.bb.rankedSourceIds = ids;
  }

  setReaderExtracts(extracts: any[]) {
    this.bb.readerExtracts = extracts;
  }

  setAnalystOutput(output: any) {
    this.bb.analystOutput = output;
  }

  getAnalystOutput(): any {
    return this.bb.analystOutput;
  }

  getReaderExtracts(): any[] {
    return this.bb.readerExtracts;
  }

  getRankedSourceIds(): string[] {
    return this.bb.rankedSourceIds;
  }

  recordAgentTiming(agent: string, durationMs: number) {
    this.bb.agentTimings[agent] = durationMs;
  }

  addFinding(agent: string, type: PipelineFinding['type'], content: string, metadata?: Record<string, unknown>) {
    this.bb.findings.push({ agent, timestamp: Date.now(), type, content, metadata });
  }

  getFindings(type?: PipelineFinding['type']): PipelineFinding[] {
    return type ? this.bb.findings.filter(f => f.type === type) : this.bb.findings;
  }

  getFindingsByAgent(agent: string): PipelineFinding[] {
    return this.bb.findings.filter(f => f.agent === agent);
  }

  requestSourceGap(query: string, reason: string, requestedBy: string, providers?: string[], minResults?: number) {
    this.bb.sourceGapRequests.push({
      query,
      reason,
      requestedBy,
      timestamp: Date.now(),
      providers,
      minResults,
    });
    // Also emit as a typed signal — any registered resolver can sense it at
    // the next sweep, not just the hardcoded gap-fill step.
    this.signals.post('coverage_gap', reason, {
      postedBy: requestedBy,
      intensity: 0.7,
      ttlMs: 45 * 60 * 1000,
      payload: { query, providers, minResults },
    });
    console.log(`[BLACKBOARD] Source gap requested by ${requestedBy}: "${query.slice(0, 80)}..." — ${reason}`);
  }

  // ── Mission — the single shared goal (Sprint 26) ──
  setMission(goal: string, targets: MissionTargets) {
    this.bb.mission = { goal, targets };
  }

  get mission(): Mission | undefined {
    return this.bb.mission;
  }

  /** Emit a typed need onto the signal bus. */
  postSignal(
    type: SignalType,
    content: string,
    opts: { postedBy: string; intensity?: number; ttlMs?: number; payload?: Record<string, unknown> },
  ): AgentSignal {
    return this.signals.post(type, content, opts);
  }

  getPendingGapRequests(): SourceGapRequest[] {
    return this.bb.sourceGapRequests;
  }

  hasGapRequests(): boolean {
    return this.bb.sourceGapRequests.length > 0;
  }

  clearGapRequests() {
    this.bb.sourceGapRequests = [];
  }

  getSummary(): Record<string, unknown> {
    return {
      query: this.bb.query,
      domain: this.bb.domain,
      isStrategic: this.bb.isStrategic,
      complexity: this.bb.complexity,
      findingsCount: this.bb.findings.length,
      gapRequests: this.bb.sourceGapRequests.length,
      scoutSources: this.bb.scoutSourceIds.length,
      rankedSources: this.bb.rankedSourceIds.length,
      readerExtracts: this.bb.readerExtracts.length,
      hasAnalystOutput: !!this.bb.analystOutput,
      skippedSteps: [...this.bb.skipSteps],
      agentTimings: this.bb.agentTimings,
      totalDurationMs: Date.now() - this.bb.startTime,
      mission: this.bb.mission,
      signals: this.signals.getSummary(),
    };
  }
}
