/**
 * NomosX MASTER ORCHESTRATOR
 * 
 * The central intelligence brain of the think tank.
 * Replaces the brute-force cron scanning with event-driven, intelligent dispatch.
 * 
 * Architecture inspired by:
 * - OpenAI Swarm: Handoff pattern, agents as tools
 * - Anthropic Agent: Plan → Act → Observe → Reflect
 * - DeepMind Gemini: Hierarchical planning, adaptive depth
 * - CrewAI/LangGraph: Agent graph, shared state, dynamic routing
 * 
 * Core responsibilities:
 * 1. SENSE — Ingest signals from all sources (news, academic, data, live feeds)
 * 2. THINK — Classify, prioritize, and decide what deserves attention
 * 3. DISPATCH — Route to the right researcher(s) with full context
 * 4. MONITOR — Track quality, cost, and adapt thresholds
 * 
 * Production dispatch is handled by think-tank-dispatcher.ts.
 * This module provides event classification/clustering utilities for future use.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { classifyTopic, TopicClassification } from './topic-classifier';
import { RESEARCHER_REGISTRY, VERTICAL_RESEARCHER_MAP } from './researcher-ownership';
import { DomainExpertise } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface IncomingEvent {
  id: string;
  type: 'academic_paper' | 'news_article' | 'data_release' | 'policy_change' | 'market_alert' | 'signal';
  title: string;
  summary: string;
  source: string;
  url?: string;
  publishedAt: Date;
  rawData?: any;
}

export interface DispatchDecision {
  /** What action to take */
  action: 'publish_brief' | 'publish_strategic' | 'monitor' | 'defer' | 'ignore';
  /** Why this decision was made */
  reasoning: string;
  /** Topic classification result */
  classification: TopicClassification;
  /** Priority score (0-100) */
  priority: number;
  /** Events that triggered this decision */
  triggerEvents: IncomingEvent[];
  /** Estimated cost of execution */
  estimatedCostUsd: number;
  /** Deadline for publication (null = no deadline) */
  deadline: Date | null;
}

export interface OrchestratorState {
  /** Events waiting to be processed */
  pendingEvents: IncomingEvent[];
  /** Decisions made this run */
  decisions: DispatchDecision[];
  /** Budget remaining for this run */
  budgetRemainingUsd: number;
  /** Publication slots remaining this week */
  slotsRemaining: number;
  /** Domains already covered this week */
  recentDomainCoverage: Map<string, number>;
  /** Total cost of this orchestration run */
  totalCostUsd: number;
  /** Errors encountered */
  errors: string[];
}

export interface OrchestratorOutput {
  /** Decisions to execute (ordered by priority) */
  decisions: DispatchDecision[];
  /** Events that were deferred for later */
  deferred: IncomingEvent[];
  /** Events that were ignored (too low priority) */
  ignored: number;
  /** Total cost of orchestration itself */
  orchestrationCostUsd: number;
  /** Duration */
  durationMs: number;
  /** Summary for logging */
  summary: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Maximum decisions per orchestration run */
  MAX_DECISIONS_PER_RUN: 5,
  /** Minimum priority to trigger a publication */
  MIN_PRIORITY_FOR_BRIEF: 60,
  /** Minimum priority for strategic report */
  MIN_PRIORITY_FOR_STRATEGIC: 80,
  /** Critical priority — bypasses budget checks */
  CRITICAL_PRIORITY: 90,
  /** Maximum budget per run (USD) */
  MAX_BUDGET_PER_RUN: 30.0,
  /** Default weekly publication slots */
  DEFAULT_WEEKLY_SLOTS: 5,
  /** Minimum events to cluster before triggering a strategic report */
  CLUSTER_THRESHOLD: 3,
  /** Hours to look back for dedup */
  DEDUP_LOOKBACK_HOURS: 48,
  /** Max events to process per run (prevent runaway) */
  MAX_EVENTS_PER_RUN: 50,
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run the Master Orchestrator.
 * 
 * This is called by the cron instead of the old brute-force scan.
 * It ingests events, classifies them, clusters related events,
 * and dispatches publication decisions to the right researchers.
 * 
 * @param events - Incoming events to process (from various sources)
 * @param options - Budget and slot constraints
 */
export async function orchestrate(
  events: IncomingEvent[],
  options: {
    budgetUsd?: number;
    weeklySlots?: number;
    dryRun?: boolean;
  } = {}
): Promise<OrchestratorOutput> {
  const start = Date.now();
  const { budgetUsd = CONFIG.MAX_BUDGET_PER_RUN, weeklySlots, dryRun = false } = options;

  console.log(`[MASTER ORCHESTRATOR] Processing ${events.length} events (budget: $${budgetUsd}, dryRun: ${dryRun})`);

  // Initialize state
  const state: OrchestratorState = {
    pendingEvents: events.slice(0, CONFIG.MAX_EVENTS_PER_RUN),
    decisions: [],
    budgetRemainingUsd: budgetUsd,
    slotsRemaining: weeklySlots ?? await getRemainingSlotsThisWeek(),
    recentDomainCoverage: await getRecentDomainCoverage(),
    totalCostUsd: 0,
    errors: [],
  };

  if (state.slotsRemaining <= 0) {
    console.log('[MASTER ORCHESTRATOR] No publication slots remaining this week');
    return {
      decisions: [],
      deferred: events,
      ignored: 0,
      orchestrationCostUsd: 0,
      durationMs: Date.now() - start,
      summary: 'No slots remaining this week',
    };
  }

  // ── STEP 1: CLASSIFY all events ──
  const classified = await classifyEvents(state);

  // ── STEP 2: CLUSTER related events ──
  const clusters = clusterEvents(classified);

  // ── STEP 3: PRIORITIZE clusters ──
  const prioritized = prioritizeClusters(clusters, state);

  // ── STEP 4: DECIDE what to publish ──
  const decisions = await decideActions(prioritized, state);

  // ── STEP 5: STRATEGIC TRIAGE — Use LLM for ambiguous cases ──
  const finalDecisions = await strategicTriage(decisions, state);

  // Separate deferred events
  const executedEventIds = new Set(
    finalDecisions.flatMap(d => d.triggerEvents.map(e => e.id))
  );
  const deferred = events.filter(e => !executedEventIds.has(e.id) && !isIgnorable(e));
  const ignored = events.length - executedEventIds.size - deferred.length;

  // ── STEP 6: PERSIST decisions (unless dry run) ──
  if (!dryRun) {
    await persistDecisions(finalDecisions);
  }

  const durationMs = Date.now() - start;
  const summary = `${finalDecisions.length} decisions (${finalDecisions.filter(d => d.action === 'publish_brief').length} briefs, ${finalDecisions.filter(d => d.action === 'publish_strategic').length} strategic), ${deferred.length} deferred, ${ignored} ignored, $${state.totalCostUsd.toFixed(4)} orchestration cost, ${durationMs}ms`;

  console.log(`[MASTER ORCHESTRATOR] ✅ ${summary}`);

  return {
    decisions: finalDecisions,
    deferred,
    ignored,
    orchestrationCostUsd: state.totalCostUsd,
    durationMs,
    summary,
  };
}

// ============================================================================
// STEP 1: CLASSIFY — Route each event through unified classifier
// ============================================================================

interface ClassifiedEvent {
  event: IncomingEvent;
  classification: TopicClassification;
}

async function classifyEvents(state: OrchestratorState): Promise<ClassifiedEvent[]> {
  const results: ClassifiedEvent[] = [];

  // Process in batches to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < state.pendingEvents.length; i += batchSize) {
    const batch = state.pendingEvents.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (event) => {
        const classification = await classifyTopic(
          event.title,
          event.summary?.slice(0, 300)
        );
        state.totalCostUsd += classification.costUsd;
        return { event, classification };
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        state.errors.push(`Classification failed: ${result.reason}`);
      }
    }
  }

  console.log(`[MASTER ORCHESTRATOR] Classified ${results.length}/${state.pendingEvents.length} events`);
  return results;
}

// ============================================================================
// STEP 2: CLUSTER — Group related events into topics
// ============================================================================

interface EventCluster {
  /** Representative topic title */
  topic: string;
  /** All events in this cluster */
  events: ClassifiedEvent[];
  /** Primary classification (from highest-priority event) */
  classification: TopicClassification;
  /** Aggregate priority */
  priority: number;
  /** Number of sources corroborating this topic */
  corroboration: number;
}

function clusterEvents(events: ClassifiedEvent[]): EventCluster[] {
  if (events.length === 0) return [];

  // Group by primary vertical + domain
  const groups = new Map<string, ClassifiedEvent[]>();
  
  for (const ce of events) {
    const key = `${ce.classification.verticalSlug}:${ce.classification.primaryDomain}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ce);
  }

  // For each group, further cluster by keyword overlap
  const clusters: EventCluster[] = [];

  for (const [_, groupEvents] of groups) {
    // Simple title-based sub-clustering
    const subClusters: ClassifiedEvent[][] = [];
    
    for (const ce of groupEvents) {
      let merged = false;
      const ceWords = new Set(ce.event.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      
      for (const existing of subClusters) {
        const existingWords = new Set(
          existing[0].event.title.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        );
        const overlap = [...ceWords].filter(w => existingWords.has(w)).length;
        const maxLen = Math.max(ceWords.size, existingWords.size);
        
        if (maxLen > 0 && overlap / maxLen > 0.3) {
          existing.push(ce);
          merged = true;
          break;
        }
      }
      
      if (!merged) {
        subClusters.push([ce]);
      }
    }

    for (const subCluster of subClusters) {
      // Sort events by urgency within cluster
      subCluster.sort((a, b) => {
        const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return (urgencyOrder[b.classification.urgency] || 0) - (urgencyOrder[a.classification.urgency] || 0);
      });

      const primary = subCluster[0];
      
      // Calculate cluster priority
      const basePriority = { critical: 95, high: 75, medium: 55, low: 30 }[primary.classification.urgency] || 50;
      const corroborationBonus = Math.min(20, (subCluster.length - 1) * 8); // Multiple sources = more important
      const crossDomainBonus = primary.classification.isCrossDomain ? 10 : 0;
      
      clusters.push({
        topic: primary.event.title,
        events: subCluster,
        classification: primary.classification,
        priority: Math.min(100, basePriority + corroborationBonus + crossDomainBonus),
        corroboration: subCluster.length,
      });
    }
  }

  // Sort clusters by priority
  clusters.sort((a, b) => b.priority - a.priority);

  console.log(`[MASTER ORCHESTRATOR] Clustered ${events.length} events into ${clusters.length} topics`);
  return clusters;
}

// ============================================================================
// STEP 3: PRIORITIZE — Apply domain diversity and coverage gap logic
// ============================================================================

function prioritizeClusters(clusters: EventCluster[], state: OrchestratorState): EventCluster[] {
  return clusters.map(cluster => {
    let adjustedPriority = cluster.priority;

    // Boost topics in under-covered domains
    const domainCoverage = state.recentDomainCoverage.get(cluster.classification.primaryDomain) || 0;
    if (domainCoverage === 0) {
      adjustedPriority += 10; // Coverage gap bonus
    } else if (domainCoverage >= 3) {
      adjustedPriority -= 15; // Already well-covered, deprioritize
    }

    // Boost cross-domain topics (think tank differentiator)
    if (cluster.classification.isCrossDomain) {
      adjustedPriority += 5;
    }

    // Boost topics with multiple corroborating sources
    if (cluster.corroboration >= CONFIG.CLUSTER_THRESHOLD) {
      adjustedPriority += 10;
    }

    return { ...cluster, priority: Math.min(100, Math.max(0, adjustedPriority)) };
  }).sort((a, b) => b.priority - a.priority);
}

// ============================================================================
// STEP 4: DECIDE — Convert priorities into actionable decisions
// ============================================================================

async function decideActions(
  clusters: EventCluster[], 
  state: OrchestratorState
): Promise<DispatchDecision[]> {
  const decisions: DispatchDecision[] = [];

  for (const cluster of clusters) {
    if (decisions.length >= CONFIG.MAX_DECISIONS_PER_RUN) break;
    if (state.slotsRemaining <= 0 && cluster.priority < CONFIG.CRITICAL_PRIORITY) break;

    // Check for duplicates against recent publications
    const isDuplicate = await isRecentlyPublished(cluster.topic);
    if (isDuplicate) {
      continue;
    }

    // Determine action based on priority
    let action: DispatchDecision['action'];
    let estimatedCost: number;
    let deadline: Date | null = null;

    if (cluster.priority >= CONFIG.MIN_PRIORITY_FOR_STRATEGIC && 
        cluster.corroboration >= CONFIG.CLUSTER_THRESHOLD) {
      action = 'publish_strategic';
      estimatedCost = 10.0;
    } else if (cluster.priority >= CONFIG.MIN_PRIORITY_FOR_BRIEF) {
      action = 'publish_brief';
      estimatedCost = 2.0;
    } else if (cluster.priority >= 40) {
      action = 'monitor';
      estimatedCost = 0;
    } else {
      action = 'ignore';
      estimatedCost = 0;
    }

    // Budget check (critical events bypass)
    if (estimatedCost > 0 && estimatedCost > state.budgetRemainingUsd && cluster.priority < CONFIG.CRITICAL_PRIORITY) {
      action = 'defer';
      estimatedCost = 0;
    }

    // Set deadline based on urgency
    if (cluster.classification.urgency === 'critical') {
      deadline = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours
    } else if (cluster.classification.urgency === 'high') {
      deadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }

    const decision: DispatchDecision = {
      action,
      reasoning: `${cluster.classification.reasoning} | Priority: ${cluster.priority}, Corroboration: ${cluster.corroboration}, Urgency: ${cluster.classification.urgency}`,
      classification: cluster.classification,
      priority: cluster.priority,
      triggerEvents: cluster.events.map(e => e.event),
      estimatedCostUsd: estimatedCost,
      deadline,
    };

    decisions.push(decision);

    // Update state
    if (action === 'publish_brief' || action === 'publish_strategic') {
      state.budgetRemainingUsd -= estimatedCost;
      state.slotsRemaining--;
    }
  }

  return decisions;
}

// ============================================================================
// STEP 5: STRATEGIC TRIAGE — LLM for ambiguous top-priority decisions
// ============================================================================

async function strategicTriage(
  decisions: DispatchDecision[],
  state: OrchestratorState
): Promise<DispatchDecision[]> {
  // Only triage if we have more publication decisions than slots
  const pubDecisions = decisions.filter(d => 
    d.action === 'publish_brief' || d.action === 'publish_strategic'
  );

  if (pubDecisions.length <= 3) {
    return decisions; // No need for LLM triage
  }

  // Use LLM to rank the top candidates
  try {
    const candidates = pubDecisions.slice(0, 8).map((d, i) => ({
      index: i,
      topic: d.triggerEvents[0]?.title || 'Unknown',
      domain: d.classification.primaryDomain,
      urgency: d.classification.urgency,
      priority: d.priority,
      corroboration: d.triggerEvents.length,
      isCrossDomain: d.classification.isCrossDomain,
    }));

    const recentDomains = Array.from(state.recentDomainCoverage.entries())
      .map(([d, count]) => `${d}: ${count} publications`)
      .join(', ');

    const result = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are the editorial director of NomosX think tank. Given candidate topics for publication, select the TOP 3 that maximize:
1. Strategic value (what matters most to decision-makers right now)
2. Domain diversity (don't over-publish in one domain)
3. Timeliness (breaking events > evergreen topics)
4. Novelty (avoid topics already well-covered)

Return JSON: { "selected": [index1, index2, index3], "reasoning": "one sentence" }`
        },
        {
          role: 'user',
          content: `CANDIDATES:\n${JSON.stringify(candidates, null, 2)}\n\nRECENT COVERAGE: ${recentDomains || 'None'}\n\nSelect top 3.`
        }
      ],
      temperature: 0.2,
      maxTokens: 200,
      jsonMode: true,
      model: 'gpt-4o-mini',
    });

    state.totalCostUsd += result.costUsd;

    const parsed = JSON.parse(result.content);
    const selectedIndices = new Set(parsed.selected || [0, 1, 2]);

    // Mark non-selected publication decisions as deferred
    return decisions.map((d, i) => {
      if ((d.action === 'publish_brief' || d.action === 'publish_strategic') && 
          !selectedIndices.has(pubDecisions.indexOf(d))) {
        return { ...d, action: 'defer' as const, reasoning: `Deferred by strategic triage: ${parsed.reasoning || ''}` };
      }
      return d;
    });
  } catch (err) {
    console.warn('[MASTER ORCHESTRATOR] Strategic triage failed, using priority-based selection:', err);
    return decisions;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function getRemainingSlotsThisWeek(): Promise<number> {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentPubs = await prisma.thinkTankPublication.count({
      where: { 
        publishedAt: { gte: oneWeekAgo },
        status: 'PUBLISHED',
      },
    });
    return Math.max(0, CONFIG.DEFAULT_WEEKLY_SLOTS - recentPubs);
  } catch {
    return CONFIG.DEFAULT_WEEKLY_SLOTS;
  }
}

async function getRecentDomainCoverage(): Promise<Map<string, number>> {
  const coverage = new Map<string, number>();
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentPubs = await prisma.thinkTankPublication.findMany({
      where: { publishedAt: { gte: oneWeekAgo }, status: 'PUBLISHED' },
      select: { verticalId: true, title: true },
    });

    // Map vertical IDs to domain names
    const verticals = await prisma.vertical.findMany({
      where: { isActive: true },
      select: { id: true, slug: true },
    });
    const verticalIdToSlug = new Map(verticals.map(v => [v.id, v.slug]));

    for (const pub of recentPubs) {
      const slug = verticalIdToSlug.get(pub.verticalId);
      if (slug) {
        const domains = VERTICAL_RESEARCHER_MAP[slug] || [];
        for (const domain of domains) {
          coverage.set(domain, (coverage.get(domain) || 0) + 1);
        }
      }
    }
  } catch {
    // Non-fatal
  }
  return coverage;
}

async function isRecentlyPublished(topic: string): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - CONFIG.DEDUP_LOOKBACK_HOURS * 60 * 60 * 1000);
    // Check both publications and signals
    const [existingPub, existingSignal] = await Promise.all([
      prisma.thinkTankPublication.findFirst({
        where: {
          title: { contains: topic.slice(0, 80) },
          publishedAt: { gte: cutoff },
        },
      }),
      prisma.signal.findFirst({
        where: {
          title: { contains: topic.slice(0, 80) },
          status: 'PUBLISHED',
          detectedAt: { gte: cutoff },
        },
      }),
    ]);
    return !!(existingPub || existingSignal);
  } catch {
    return false;
  }
}

function isIgnorable(event: IncomingEvent): boolean {
  // Very short titles or summaries are noise
  if (event.title.length < 15) return true;
  if (!event.summary || event.summary.length < 30) return true;
  return false;
}

async function persistDecisions(decisions: DispatchDecision[]): Promise<void> {
  for (const decision of decisions) {
    if (decision.action === 'ignore' || decision.action === 'defer') continue;

    try {
      // Find or create the vertical
      const vertical = await prisma.vertical.findFirst({
        where: { slug: decision.classification.verticalSlug },
      });

      if (!vertical) continue;

      // Store as a signal with orchestrator metadata
      await prisma.signal.create({
        data: {
          verticalId: vertical.id,
          signalType: decision.action === 'publish_strategic' ? 'TREND_BREAK' : 'NEW_EVIDENCE',
          title: decision.triggerEvents[0]?.title || 'Orchestrated topic',
          summary: JSON.stringify({
            orchestratorDecision: decision.action,
            reasoning: decision.reasoning,
            classification: {
              primaryDomain: decision.classification.primaryDomain,
              isCrossDomain: decision.classification.isCrossDomain,
              researchers: decision.classification.researchers.map(r => ({
                name: r.profile.name,
                role: r.role,
                domain: r.profile.id,
              })),
              providers: decision.classification.providers,
            },
            triggerCount: decision.triggerEvents.length,
            deadline: decision.deadline?.toISOString(),
          }),
          noveltyScore: Math.min(95, decision.priority),
          impactScore: Math.min(95, decision.priority),
          confidenceScore: Math.round(decision.classification.confidence * 100),
          urgencyScore: { critical: 95, high: 80, medium: 60, low: 40 }[decision.classification.urgency] || 60,
          priorityScore: decision.priority,
          sourceIds: decision.triggerEvents.map(e => e.id),
          status: 'NEW',
          expiresAt: decision.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    } catch (err: any) {
      console.warn(`[MASTER ORCHESTRATOR] Failed to persist decision: ${err.message}`);
    }
  }
}

// ============================================================================
// EVENT BUILDERS — Helpers to create IncomingEvents from various sources
// ============================================================================

/**
 * Convert a DB signal into an IncomingEvent for the orchestrator
 */
export function signalToEvent(signal: {
  id: string;
  title: string;
  summary: string | null;
  signalType: string;
  detectedAt: Date;
}): IncomingEvent {
  return {
    id: `signal:${signal.id}`,
    type: signal.signalType === 'POLICY_CHANGE' ? 'policy_change' 
        : signal.signalType === 'DATA_RELEASE' ? 'data_release'
        : 'signal',
    title: signal.title,
    summary: signal.summary || '',
    source: 'signal-detector',
    publishedAt: signal.detectedAt,
  };
}

/**
 * Convert a news intelligence result into IncomingEvents
 */
export function newsToEvents(newsSignals: Array<{
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  provider: string;
  publishedAt: Date;
}>): IncomingEvent[] {
  return newsSignals.map(ns => ({
    id: `news:${ns.id}`,
    type: 'news_article' as const,
    title: ns.title,
    summary: ns.summary,
    source: `${ns.source} (${ns.provider})`,
    url: ns.url,
    publishedAt: ns.publishedAt,
  }));
}

/**
 * Convert a live monitored paper into an IncomingEvent
 */
export function paperToEvent(paper: {
  externalId: string;
  title: string;
  abstract: string;
  source: string;
  url: string;
  publishedDate: Date;
}): IncomingEvent {
  return {
    id: `paper:${paper.externalId}`,
    type: 'academic_paper',
    title: paper.title,
    summary: paper.abstract.slice(0, 500),
    source: paper.source,
    url: paper.url,
    publishedAt: paper.publishedDate,
  };
}

/**
 * Convert a market alert into an IncomingEvent
 */
export function alertToEvent(alert: {
  indicator: string;
  type: string;
  message: string;
  severity: string;
  value: number;
}): IncomingEvent {
  return {
    id: `alert:${alert.indicator}:${Date.now()}`,
    type: 'market_alert',
    title: `Market Alert: ${alert.message.slice(0, 150)}`,
    summary: `${alert.indicator} ${alert.type}: ${alert.message}. Value: ${alert.value}. Severity: ${alert.severity}`,
    source: 'realtime-data-hub',
    publishedAt: new Date(),
  };
}
