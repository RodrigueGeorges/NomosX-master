/**
 * NomosX AGENT MEMORY — Persistent Learning & Self-Calibration
 *
 * This is what separates NomosX from a stateless LLM wrapper.
 * Every agent accumulates a performance history that feeds back into
 * its own prompts and decision thresholds — creating a genuine
 * improvement loop without fine-tuning.
 *
 * Architecture:
 * 1. PERFORMANCE LEDGER — per-domain, per-agent success/failure rates
 * 2. LESSON STORE — explicit lessons extracted from past analyses
 * 3. CALIBRATION ENGINE — adjusts thresholds based on historical performance
 * 4. PROMPT INJECTOR — builds a "what I've learned" block for each agent
 *
 * This makes each PhD researcher a genuine intellectual entity:
 * Dr. Oikonomia remembers that her econometric critiques on climate papers
 * were rated low quality → she now applies stricter identification checks.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { embedText, cosineSimilarity } from './semantic-engine';
import type { DomainExpertise } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentPerformanceRecord {
  agentId: string;           // "phd:economics", "orchestrator", "analyst", etc.
  domain?: DomainExpertise;
  runId: string;
  question: string;

  // Output quality (from human feedback or auto-eval)
  trustScore: number;        // 0-100: final trust score of the publication
  qualityScore: number;      // 0-100: overall quality
  userRating?: number;       // 1-5: explicit human rating
  wasUsedForDecision?: boolean;

  // Agent-specific metrics
  confidenceGiven: number;   // 0-100: what the agent claimed
  confidenceActual: number;  // 0-100: what the evidence supported (post-hoc)
  citationCoverage: number;  // 0-1
  findingsCount: number;

  // Failure modes detected
  failureModes: FailureMode[];

  // Lessons extracted (LLM-generated)
  lessonsLearned: string[];

  createdAt: Date;
}

export type FailureMode =
  | "overconfident"          // Claimed high confidence, evidence was weak
  | "underconfident"         // Claimed low confidence, evidence was strong
  | "citation_gaps"          // Claims without citations
  | "missed_contradiction"   // Failed to detect a known contradiction
  | "shallow_methodology"    // Didn't critique methodology adequately
  | "ignored_confounders"    // Missed key confounding variables
  | "stale_framing"          // Used outdated conceptual framework
  | "provider_bias"          // Over-relied on single provider
  | "scope_creep"            // Went beyond the research question
  | "false_consensus";       // Presented contested findings as consensus

export interface AgentLesson {
  agentId: string;
  domain?: DomainExpertise;
  lesson: string;
  /** WHEN this lesson applies — the condition that triggers it (procedural memory) */
  trigger?: string;
  /** WHAT to do — the actionable procedure, not just the insight */
  procedure?: string;
  learnedFrom: string;       // runId
  weight: number;            // 0-1: how important this lesson is
  appliedCount: number;      // How many times this lesson has been injected
  successRate: number;       // 0-1: did applying this lesson improve outcomes?
  createdAt: Date;
  lastApplied: Date | null;
}

export interface AgentCalibration {
  agentId: string;
  domain?: DomainExpertise;

  // Calibration adjustments (deltas from defaults)
  confidenceAdjustment: number;    // -20 to +20: shift confidence claims
  minQualityThreshold: number;     // Adjusted minimum quality gate
  preferredProviders: string[];    // Providers that historically perform well
  avoidProviders: string[];        // Providers with poor track record
  strengthenChecks: FailureMode[]; // Which failure modes to watch for

  // Performance stats
  totalRuns: number;
  avgTrustScore: number;
  avgUserRating: number;
  improvementTrend: "improving" | "stable" | "degrading";

  updatedAt: Date;
}

export interface MemoryInjection {
  agentId: string;
  domain?: DomainExpertise;
  promptBlock: string;       // Ready to inject into system prompt
  calibration: AgentCalibration;
  topLessons: AgentLesson[];
  costUsd: number;
}

// ============================================================================
// PERFORMANCE RECORDING
// ============================================================================

/**
 * Record agent performance after a pipeline run completes.
 * Called by the pipeline after receiving feedback or auto-evaluation.
 */
export async function recordAgentPerformance(
  record: Omit<AgentPerformanceRecord, "createdAt">
): Promise<void> {
  try {
    // Store in AgentAuditLog (reusing existing table with structured metadata)
    await prisma.agentAuditLog.create({
      data: {
        agent: record.agentId,
        action: "PERFORMANCE_RECORD",
        resource: record.runId,
        metadata: JSON.stringify({
          domain: record.domain,
          question: record.question.slice(0, 200),
          trustScore: record.trustScore,
          qualityScore: record.qualityScore,
          userRating: record.userRating,
          wasUsedForDecision: record.wasUsedForDecision,
          confidenceGiven: record.confidenceGiven,
          confidenceActual: record.confidenceActual,
          citationCoverage: record.citationCoverage,
          findingsCount: record.findingsCount,
          failureModes: record.failureModes,
          lessonsLearned: record.lessonsLearned,
        }),
      },
    });

    console.log(`[AGENT MEMORY] Recorded performance for ${record.agentId} (trust=${record.trustScore}, quality=${record.qualityScore})`);
  } catch (err) {
    console.warn("[AGENT MEMORY] Failed to record performance:", err);
  }
}

// ============================================================================
// LESSON EXTRACTION
// ============================================================================

/**
 * After a run with feedback, extract lessons using LLM.
 * These lessons become part of the agent's permanent memory.
 */
export async function extractLessons(
  agentId: string,
  question: string,
  agentOutput: string,
  feedbackOrEval: {
    trustScore: number;
    qualityScore: number;
    userRating?: number;
    failureModes: FailureMode[];
    humanComment?: string;
  },
  domain?: DomainExpertise
): Promise<{ lessons: string[]; structured: Array<{ lesson: string; trigger?: string; procedure?: string }>; costUsd: number }> {
  if (feedbackOrEval.trustScore >= 80 && feedbackOrEval.failureModes.length === 0) {
    // High quality — extract positive lessons (what worked)
    return { lessons: [`High-quality analysis achieved on "${question.slice(0, 80)}..." — approach was effective`], structured: [], costUsd: 0 };
  }

  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are a meta-analyst reviewing an AI research agent's performance. Extract 2-4 specific, actionable lessons that this agent should remember for future analyses. Be concrete and domain-specific.`,
      },
      {
        role: "user",
        content: `AGENT: ${agentId}${domain ? ` (${domain} domain)` : ""}
QUESTION ANALYZED: "${question.slice(0, 300)}"
TRUST SCORE: ${feedbackOrEval.trustScore}/100
QUALITY SCORE: ${feedbackOrEval.qualityScore}/100
${feedbackOrEval.userRating ? `USER RATING: ${feedbackOrEval.userRating}/5` : ""}
FAILURE MODES DETECTED: ${feedbackOrEval.failureModes.join(", ") || "none"}
${feedbackOrEval.humanComment ? `HUMAN COMMENT: "${feedbackOrEval.humanComment}"` : ""}

AGENT OUTPUT EXCERPT:
${agentOutput.slice(0, 1000)}

Extract 2-4 specific lessons this agent should apply in future analyses. Focus on what went wrong and how to fix it.
Each lesson must be a PROCEDURE: a trigger condition + an actionable rule — not just an observation.
Return JSON: { "lessons": [{ "lesson": "the insight", "trigger": "when this applies (e.g. 'when sources are mostly preprints')", "procedure": "what to do differently" }] }
If you cannot structure a lesson, still include it with only "lesson" filled.`,
      },
    ],
    temperature: 0.2,
    maxTokens: 600,
    jsonMode: true,
    task: 'topic_classification',
  });

  try {
    const parsed = parseJson<any>(result.content);
    const raw: any[] = parsed?.lessons || [];
    // Normalize: accept both plain strings and structured {lesson,trigger,procedure}
    const structured = raw.map((l: any) => typeof l === 'string' ? l : (l?.lesson || '')).filter(Boolean);
    const detailed = raw
      .filter((l: any) => typeof l === 'object' && l?.lesson)
      .map((l: any) => ({ lesson: String(l.lesson), trigger: l.trigger ? String(l.trigger) : undefined, procedure: l.procedure ? String(l.procedure) : undefined }));
    return { lessons: structured, structured: detailed, costUsd: result.costUsd };
  } catch {
    return { lessons: [], structured: [], costUsd: result.costUsd };
  }
}

// ============================================================================
// CALIBRATION ENGINE
// ============================================================================

/**
 * S15-15: Get per-provider performance from AgentAuditLog.
 * Returns lists of preferred (>70% success) and avoid (<30% success) providers.
 */
export async function getProviderPerformance(): Promise<{ preferred: string[]; avoid: string[] }> {
  try {
    const records = await prisma.agentAuditLog.findMany({
      where: { action: 'PROVIDER_RESULT' },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    const stats: Record<string, { success: number; total: number }> = {};
    for (const r of records) {
      const m = JSON.parse(r.metadata || '{}');
      if (!m.provider) continue;
      if (!stats[m.provider]) stats[m.provider] = { success: 0, total: 0 };
      stats[m.provider].total++;
      if (m.success) stats[m.provider].success++;
    }
    const preferred: string[] = [];
    const avoid: string[] = [];
    for (const [provider, s] of Object.entries(stats)) {
      const rate = s.success / s.total;
      if (rate > 0.7 && s.total >= 3) preferred.push(provider);
      if (rate < 0.3 && s.total >= 3) avoid.push(provider);
    }
    return { preferred, avoid };
  } catch {
    return { preferred: [], avoid: [] };
  }
}

/**
 * Compute calibration for an agent based on its performance history.
 * Returns adjusted thresholds and provider preferences.
 */
export async function computeCalibration(
  agentId: string,
  domain?: DomainExpertise,
  lookbackDays: number = 90
): Promise<AgentCalibration> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch performance records from AgentAuditLog
  const records = await prisma.agentAuditLog.findMany({
    where: {
      agent: agentId,
      action: "PERFORMANCE_RECORD",
      timestamp: { gte: cutoff },
    },
    orderBy: { timestamp: "desc" },
    take: 50,
  });

  if (records.length === 0) {
    return defaultCalibration(agentId, domain);
  }

  const parsed = records
    .map(r => {
      try { return JSON.parse(r.metadata || "{}"); } catch { return null; }
    })
    .filter(Boolean)
    .filter(r => !domain || r.domain === domain);

  if (parsed.length === 0) {
    return defaultCalibration(agentId, domain);
  }

  // Compute stats
  const avgTrust = parsed.reduce((s, r) => s + (r.trustScore || 0), 0) / parsed.length;
  const avgQuality = parsed.reduce((s, r) => s + (r.qualityScore || 0), 0) / parsed.length;
  const avgUserRating = parsed.filter(r => r.userRating).reduce((s, r) => s + r.userRating, 0) / (parsed.filter(r => r.userRating).length || 1);

  // Detect failure mode frequency
  const failureCounts: Record<string, number> = {};
  for (const r of parsed) {
    for (const fm of (r.failureModes || [])) {
      failureCounts[fm] = (failureCounts[fm] || 0) + 1;
    }
  }
  const topFailures = Object.entries(failureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([fm]) => fm as FailureMode);

  // Confidence calibration: if agent is systematically overconfident, adjust down
  const avgConfidenceDelta = parsed.reduce((s, r) => s + ((r.confidenceGiven || 50) - (r.confidenceActual || 50)), 0) / parsed.length;
  const confidenceAdjustment = Math.max(-20, Math.min(20, -avgConfidenceDelta * 0.5));

  // Trend: compare last 10 vs previous 10
  const recent = parsed.slice(0, 10);
  const older = parsed.slice(10, 20);
  const recentAvg = recent.reduce((s, r) => s + (r.trustScore || 0), 0) / (recent.length || 1);
  const olderAvg = older.reduce((s, r) => s + (r.trustScore || 0), 0) / (older.length || 1);
  const trend: AgentCalibration["improvementTrend"] =
    older.length === 0 ? "stable" :
    recentAvg > olderAvg + 3 ? "improving" :
    recentAvg < olderAvg - 3 ? "degrading" : "stable";

  // S15-15: Per-provider performance tracking
  const perf = await getProviderPerformance();

  return {
    agentId,
    domain,
    confidenceAdjustment,
    minQualityThreshold: Math.max(50, avgQuality - 10),
    preferredProviders: perf.preferred,
    avoidProviders: perf.avoid,
    strengthenChecks: topFailures,
    totalRuns: parsed.length,
    avgTrustScore: avgTrust,
    avgUserRating,
    improvementTrend: trend,
    updatedAt: new Date(),
  };
}

function defaultCalibration(agentId: string, domain?: DomainExpertise): AgentCalibration {
  return {
    agentId,
    domain,
    confidenceAdjustment: 0,
    minQualityThreshold: 65,
    preferredProviders: [],
    avoidProviders: [],
    strengthenChecks: [],
    totalRuns: 0,
    avgTrustScore: 0,
    avgUserRating: 0,
    improvementTrend: "stable",
    updatedAt: new Date(),
  };
}

// ============================================================================
// MEMORY INJECTION — Build prompt block for agent
// ============================================================================

/**
 * Build the "institutional memory" block to inject into an agent's system prompt.
 * This is the core mechanism: agents literally remember their past mistakes.
 */
export async function buildMemoryInjection(
  agentId: string,
  domain?: DomainExpertise,
  options: {
    maxLessons?: number;
    lookbackDays?: number;
    /** Current research topic — lessons are filtered by thematic relevance to avoid cross-topic contamination */
    topicQuery?: string;
    /** Minimum cosine similarity (0-1) between lesson and topic. Default: 0.25 */
    minRelevance?: number;
  } = {}
): Promise<MemoryInjection> {
  const { maxLessons = 5, lookbackDays = 90, topicQuery, minRelevance = 0.25 } = options;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch calibration + lessons in parallel
  const [calibration, lessonRecords] = await Promise.all([
    computeCalibration(agentId, domain, lookbackDays),
    prisma.agentAuditLog.findMany({
      where: {
        agent: agentId,
        action: "LESSON_LEARNED",
        timestamp: { gte: cutoff },
      },
      orderBy: { timestamp: "desc" },
      take: maxLessons * 3,
    }),
  ]);

  // Parse lessons
  const lessons: AgentLesson[] = lessonRecords
    .map(r => {
      try {
        const m = JSON.parse(r.metadata || "{}");
        // Human corrections get a weight boost — they are explicit signals
        // from the user that something was wrong. Auto-extracted lessons are
        // weaker signals (the system guessed what went wrong).
        const isHumanCorrection = m.source === 'HUMAN_CORRECTION';
        const baseWeight = m.weight || 0.5;
        const weight = isHumanCorrection ? Math.min(1.0, baseWeight * 1.5) : baseWeight;
        return {
          agentId,
          domain: m.domain,
          lesson: m.lesson,
          trigger: m.trigger,
          procedure: m.procedure,
          learnedFrom: m.runId || (isHumanCorrection ? 'human-correction' : ""),
          weight,
          appliedCount: m.appliedCount || 0,
          successRate: m.successRate || 0.5,
          createdAt: r.timestamp,
          lastApplied: null,
        } as AgentLesson;
      } catch { return null; }
    })
    .filter(Boolean) as AgentLesson[];

  // ── DOMAIN PRIORITY — lessons learned in the SAME domain carry expert
  // experience; boost their weight so they outrank generic lessons while the
  // thematic filter still guards against cross-topic contamination.
  if (domain) {
    for (const l of lessons) {
      if (l.domain === domain) l.weight = Math.min(1.0, l.weight * 1.5);
    }
  }

  // ── THEMATIC RELEVANCE FILTER (anti-contamination) ──
  // When a topicQuery is provided, filter lessons by embedding similarity.
  // This prevents lessons from a previous run (e.g., "AI/religion") from
  // contaminating a different topic run (e.g., "missiles/deterrence").
  // Calibration data (failure modes, confidence adjustments) is ALWAYS injected
  // regardless of topic — it's about the agent's general performance, not topic-specific lessons.
  let relevantLessons = lessons;
  if (topicQuery && lessons.length > 0) {
    try {
      const topicEmbedding = await embedText(topicQuery.slice(0, 500));
      const scored: Array<{ lesson: AgentLesson; sim: number; embedding?: number[] }> = [];

      for (const lesson of lessons) {
        const lessonEmbedding = await embedText(lesson.lesson.slice(0, 500)).catch(() => null);
        if (!lessonEmbedding) {
          // If embedding fails, keep the lesson but with low priority
          scored.push({ lesson, sim: 0.1 });
          continue;
        }
        const sim = cosineSimilarity(topicEmbedding, lessonEmbedding);
        scored.push({ lesson, sim, embedding: lessonEmbedding });
      }

      // Filter by relevance threshold and log rejected lessons
      const before = scored.length;
      const filtered = scored.filter(s => {
        if (s.sim < minRelevance) {
          console.log(`[AGENT MEMORY] Rejected lesson (relevance ${s.sim.toFixed(2)} < ${minRelevance}): "${s.lesson.lesson.slice(0, 80)}..."`);
          return false;
        }
        return true;
      });

      // RAR-style MMR (Retrieval-Augmented Reflexion): diversify similar past lessons
      // so the agent learns from contrastive experiences, not just the most similar ones.
      const lambda = 0.5;
      const selected: Array<{ lesson: AgentLesson; sim: number; embedding?: number[] }> = [];
      const remaining = [...filtered];
      while (selected.length < maxLessons && remaining.length > 0) {
        let bestIndex = 0;
        let bestScore = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const candidate = remaining[i];
          const relevance = candidate.sim * candidate.lesson.weight * candidate.lesson.successRate;
          const maxRedundancy = selected.length === 0 || !candidate.embedding
            ? 0
            : Math.max(...selected
                .filter(s => s.embedding)
                .map(s => cosineSimilarity(s.embedding!, candidate.embedding!)));
          const mmrScore = lambda * relevance - (1 - lambda) * maxRedundancy;
          if (mmrScore > bestScore) {
            bestScore = mmrScore;
            bestIndex = i;
          }
        }
        selected.push(remaining[bestIndex]);
        remaining.splice(bestIndex, 1);
      }
      relevantLessons = selected.map(s => s.lesson);

      const rejected = before - relevantLessons.length;
      if (rejected > 0) {
        console.log(`[AGENT MEMORY] Thematic filter: ${relevantLessons.length}/${before} lessons kept (topic: "${topicQuery.slice(0, 60)}...")`);
      }
    } catch (err) {
      console.warn(`[AGENT MEMORY] Thematic filter failed (using all lessons):`, err);
      // Fall back to unfiltered lessons if embedding fails
      relevantLessons = lessons.sort((a, b) => (b.weight * b.successRate) - (a.weight * a.successRate));
    }
  } else {
    // No topic query — sort by weight × successRate (original behavior)
    relevantLessons = lessons.sort((a, b) => (b.weight * b.successRate) - (a.weight * a.successRate));
  }

  const topLessons = relevantLessons.slice(0, maxLessons);

  // Build prompt block
  const promptBlock = buildPromptBlock(agentId, domain, calibration, topLessons);

  return {
    agentId,
    domain,
    promptBlock,
    calibration,
    topLessons,
    costUsd: 0,
  };
}

function buildPromptBlock(
  agentId: string,
  domain: DomainExpertise | undefined,
  calibration: AgentCalibration,
  lessons: AgentLesson[]
): string {
  if (calibration.totalRuns === 0 && lessons.length === 0) {
    return ""; // No memory yet — don't inject anything
  }

  const lines: string[] = [];
  lines.push("=== YOUR PERFORMANCE MEMORY ===");

  if (calibration.totalRuns > 0) {
    lines.push(`\nYour track record (last ${calibration.totalRuns} analyses):`);
    lines.push(`- Average trust score: ${calibration.avgTrustScore.toFixed(0)}/100`);
    if (calibration.avgUserRating > 0) {
      lines.push(`- Average user rating: ${calibration.avgUserRating.toFixed(1)}/5`);
    }
    lines.push(`- Performance trend: ${calibration.improvementTrend.toUpperCase()}`);

    if (calibration.confidenceAdjustment < -5) {
      lines.push(`\n⚠️  CALIBRATION: You have been systematically OVERCONFIDENT. Reduce your confidence claims by ~${Math.abs(calibration.confidenceAdjustment).toFixed(0)} points.`);
    } else if (calibration.confidenceAdjustment > 5) {
      lines.push(`\n⚠️  CALIBRATION: You have been systematically UNDERCONFIDENT. You can increase your confidence claims by ~${calibration.confidenceAdjustment.toFixed(0)} points when evidence is strong.`);
    }

    if (calibration.strengthenChecks.length > 0) {
      lines.push(`\n🔴 YOUR RECURRING FAILURE MODES (address these explicitly):`);
      for (const fm of calibration.strengthenChecks) {
        lines.push(`- ${FAILURE_MODE_GUIDANCE[fm] || fm}`);
      }
    }
  }

  if (lessons.length > 0) {
    lines.push(`\n📚 LESSONS FROM YOUR PAST ANALYSES:`);
    for (const lesson of lessons) {
      if (lesson.trigger && lesson.procedure) {
        lines.push(`- WHEN ${lesson.trigger} → ${lesson.procedure} (${lesson.lesson})`);
      } else {
        lines.push(`- ${lesson.lesson}`);
      }
    }
  }

  lines.push("\n=== END PERFORMANCE MEMORY ===");
  lines.push("Apply these lessons. Your goal is continuous improvement toward think-tank quality.");

  return lines.join("\n");
}

const FAILURE_MODE_GUIDANCE: Record<FailureMode, string> = {
  overconfident: "You tend to overstate confidence. Always provide uncertainty ranges. Say 'evidence suggests' not 'evidence proves'.",
  underconfident: "You tend to understate confidence. When multiple strong sources agree, state that clearly.",
  citation_gaps: "You leave claims uncited. Every factual assertion needs a [SRC-N] reference.",
  missed_contradiction: "You miss contradictions between sources. Explicitly compare conflicting findings.",
  shallow_methodology: "Your methodology critiques are superficial. Go deeper: check identification strategy, sample size, replication.",
  ignored_confounders: "You ignore confounding variables. Always ask: what else could explain this result?",
  stale_framing: "You use outdated frameworks. Check if newer theoretical models apply.",
  provider_bias: "You over-rely on a single source type. Ensure cross-provider corroboration.",
  scope_creep: "You go beyond the research question. Stay focused on what the evidence actually addresses.",
  false_consensus: "You present contested findings as consensus. Flag disagreements explicitly.",
};

// ============================================================================
// STORE LESSON
// ============================================================================

/**
 * Persist a lesson to the agent's memory.
 * Implements A-Mem pattern: if a similar lesson already exists (cosine similarity > 0.75),
 * update it instead of creating a duplicate. This enables memory evolution — lessons
 * get refined over time rather than accumulating redundantly.
 */
export async function storeLesson(
  agentId: string,
  lesson: string,
  runId: string,
  domain?: DomainExpertise,
  weight: number = 0.7,
  structured?: { trigger?: string; procedure?: string }
): Promise<void> {
  try {
    // ── Memory Evolution: check for similar existing lessons ──
    const existingLessons = await prisma.agentAuditLog.findMany({
      where: {
        agent: agentId,
        action: "LESSON_LEARNED",
      },
      orderBy: { timestamp: "desc" },
      take: 30,
    });

    if (existingLessons.length > 0) {
      const newEmbedding = await embedText(lesson).catch(() => null);
      if (newEmbedding) {
        let bestMatch: { id: string; similarity: number; metadata: any } | null = null;

        for (const record of existingLessons) {
          try {
            const m = JSON.parse(record.metadata || "{}");
            if (!m.lesson) continue;
            const existingEmbedding = await embedText(m.lesson).catch(() => null);
            if (!existingEmbedding) continue;
            const sim = cosineSimilarity(newEmbedding, existingEmbedding);
            if (sim > 0.75 && (!bestMatch || sim > bestMatch.similarity)) {
              bestMatch = { id: record.id, similarity: sim, metadata: m };
            }
          } catch { continue; }
        }

        if (bestMatch) {
          // Evolve existing lesson: increase weight, update successRate
          const updatedWeight = Math.min(1.0, (bestMatch.metadata.weight || 0.5) + 0.1);
          const updatedSuccessRate = Math.min(1.0, (bestMatch.metadata.successRate || 0.5) + 0.05);
          await prisma.agentAuditLog.update({
            where: { id: bestMatch.id },
            data: {
              metadata: JSON.stringify({
                ...bestMatch.metadata,
                lesson: bestMatch.metadata.lesson,
                weight: updatedWeight,
                successRate: updatedSuccessRate,
                lastRefinedAt: new Date().toISOString(),
                refinementCount: (bestMatch.metadata.refinementCount || 0) + 1,
              }),
            },
          });
          console.log(`[AGENT MEMORY] Lesson evolved (similarity=${bestMatch.similarity.toFixed(2)}): "${lesson.slice(0, 60)}..."`);
          return;
        }
      }
    }

    // No similar lesson found — create new one
    await prisma.agentAuditLog.create({
      data: {
        agent: agentId,
        action: "LESSON_LEARNED",
        resource: runId,
        metadata: JSON.stringify({
          lesson,
          trigger: structured?.trigger,
          procedure: structured?.procedure,
          domain,
          runId,
          weight,
          appliedCount: 0,
          successRate: 0.5,
        }),
      },
    });

    // Auto-prune low-utility lessons (fire-and-forget, ReMe pattern 2026)
    pruneStaleLessons(agentId).catch(() => {});
  } catch (err) {
    console.warn("[AGENT MEMORY] Failed to store lesson:", err);
  }
}

// ============================================================================
// LESSON SUCCESS TRACKING — Close the learning loop
// ============================================================================

/**
 * Update a lesson's success rate after a run where it was applied.
 * This closes the learning loop: lessons that work get reinforced, those that
 * don't get pruned. Implements the Reflexion pattern (NeurIPS 2023).
 *
 * @param lessonText - The lesson text (used to find the record via embedding match)
 * @param agentId - The agent that applied the lesson
 * @param success - Whether the run was successful (trustScore >= 70)
 */
export async function updateLessonSuccessRate(
  lessonText: string,
  agentId: string,
  success: boolean
): Promise<void> {
  try {
    const lessons = await prisma.agentAuditLog.findMany({
      where: { agent: agentId, action: "LESSON_LEARNED" },
      orderBy: { timestamp: "desc" },
      take: 30,
    });

    if (lessons.length === 0) return;

    // Find the best matching lesson by text similarity
    const newEmbedding = await embedText(lessonText).catch(() => null);
    if (!newEmbedding) return;

    let bestMatch: { id: string; metadata: any; similarity: number } | null = null;
    for (const record of lessons) {
      try {
        const m = JSON.parse(record.metadata || "{}");
        if (!m.lesson) continue;
        const existingEmbedding = await embedText(m.lesson).catch(() => null);
        if (!existingEmbedding) continue;
        const sim = cosineSimilarity(newEmbedding, existingEmbedding);
        if (sim > 0.7 && (!bestMatch || sim > bestMatch.similarity)) {
          bestMatch = { id: record.id, metadata: m, similarity: sim };
        }
      } catch { continue; }
    }

    if (!bestMatch) return;

    // Update appliedCount and successRate (exponential moving average)
    const currentCount = bestMatch.metadata.appliedCount || 0;
    const currentSuccessRate = bestMatch.metadata.successRate || 0.5;
    const newCount = currentCount + 1;
    // EMA: weight recent outcomes more heavily
    const alpha = 0.3;
    const newSuccessRate = (currentSuccessRate * (1 - alpha)) + (success ? 1 : 0) * alpha;

    await prisma.agentAuditLog.update({
      where: { id: bestMatch.id },
      data: {
        metadata: JSON.stringify({
          ...bestMatch.metadata,
          appliedCount: newCount,
          successRate: Math.round(newSuccessRate * 1000) / 1000,
          lastApplied: new Date().toISOString(),
        }),
      },
    });
  } catch (err) {
    console.warn("[AGENT MEMORY] Failed to update lesson success rate:", err);
  }
}

/**
 * Record a complete learning cycle after a pipeline run:
 * 1. Record agent performance
 * 2. Auto-detect failure modes
 * 3. Extract lessons via LLM
 * 4. Store lessons
 *
 * This is the WRITE side of the learning loop — call it after every run.
 */
export async function recordLearningCycle(params: {
  agentId: string;
  runId: string;
  question: string;
  domain?: DomainExpertise;
  trustScore: number;
  qualityScore: number;
  confidenceGiven: number;
  confidenceActual: number;
  citationCoverage: number;
  findingsCount: number;
  contradictionsFound: number;
  sourceDiversity: number;
  agentOutputExcerpt: string;
  appliedLessonTexts: string[];
}): Promise<{ lessonsStored: number; costUsd: number }> {
  const {
    agentId, runId, question, domain,
    trustScore, qualityScore, confidenceGiven, confidenceActual,
    citationCoverage, findingsCount, contradictionsFound, sourceDiversity,
    agentOutputExcerpt, appliedLessonTexts,
  } = params;

  let costUsd = 0;

  // 1. Auto-detect failure modes
  const failureModes = autoDetectFailureModes({
    confidenceGiven, trustScore, citationCoverage,
    contradictionsFound, sourceDiversity, findingsCount,
  });

  // 2. Record performance
  await recordAgentPerformance({
    agentId, domain, runId, question,
    trustScore, qualityScore,
    confidenceGiven, confidenceActual,
    citationCoverage, findingsCount,
    failureModes,
    lessonsLearned: [],
  });

  // 3. Update success rates of lessons that were applied this run
  const success = trustScore >= 70;
  for (const lessonText of appliedLessonTexts) {
    await updateLessonSuccessRate(lessonText, agentId, success).catch(() => {});
  }

  // 4. Extract new lessons (only if there were issues)
  if (failureModes.length > 0 || trustScore < 80) {
    try {
      const { lessons, structured, costUsd: extractCost } = await extractLessons(
        agentId, question, agentOutputExcerpt,
        { trustScore, qualityScore, failureModes },
        domain
      );
      costUsd += extractCost;

      // 5. Store lessons
      for (const lesson of lessons) {
        const meta = structured?.find(s => s.lesson === lesson);
        await storeLesson(agentId, lesson, runId, domain, 0.7,
          meta ? { trigger: meta.trigger, procedure: meta.procedure } : undefined);
      }

      return { lessonsStored: lessons.length, costUsd };
    } catch (err) {
      console.warn(`[AGENT MEMORY] Lesson extraction failed for ${agentId}:`, err);
    }
  }

  return { lessonsStored: 0, costUsd };
}

// ============================================================================
// MEMORY PRUNING — Utility-based cleanup (ReMe pattern, ACL 2026)
// ============================================================================

/**
 * Prune low-utility lessons to prevent memory degradation.
 * Lessons are scored by: weight × successRate × recencyDecay.
 * Those below the pruning threshold are deleted.
 *
 * Called automatically when an agent's lesson count exceeds maxCapacity.
 */
export async function pruneStaleLessons(
  agentId: string,
  options: { maxCapacity?: number; keepTopN?: number; minAgeDays?: number } = {}
): Promise<{ pruned: number; remaining: number }> {
  const { maxCapacity = 50, keepTopN = 30, minAgeDays = 7 } = options;

  const allLessons = await prisma.agentAuditLog.findMany({
    where: {
      agent: agentId,
      action: "LESSON_LEARNED",
    },
    orderBy: { timestamp: "desc" },
  });

  if (allLessons.length <= maxCapacity) {
    return { pruned: 0, remaining: allLessons.length };
  }

  const now = Date.now();
  const scored = allLessons.map(record => {
    try {
      const m = JSON.parse(record.metadata || "{}");
      const weight = m.weight || 0.5;
      const successRate = m.successRate || 0.5;
      const ageDays = (now - record.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      const recencyDecay = Math.max(0.1, 1 - ageDays / 180); // Decay over 6 months
      const utilityScore = weight * successRate * recencyDecay;
      return { record, utilityScore, ageDays };
    } catch {
      return { record, utilityScore: 0, ageDays: 999 };
    }
  });

  // Sort by utility score descending
  scored.sort((a, b) => b.utilityScore - a.utilityScore);

  // Keep top N, prune the rest (but never prune lessons younger than minAgeDays)
  const toKeep = scored.slice(0, keepTopN);
  const toPrune = scored.slice(keepTopN).filter(s => s.ageDays >= minAgeDays);

  if (toPrune.length === 0) {
    return { pruned: 0, remaining: allLessons.length };
  }

  // Delete low-utility lessons
  await prisma.agentAuditLog.deleteMany({
    where: {
      id: { in: toPrune.map(s => s.record.id) },
    },
  });

  console.log(`[AGENT MEMORY] Pruned ${toPrune.length} low-utility lessons for ${agentId} (kept ${toKeep.length}, avg utility ${(toKeep.reduce((sum, s) => sum + s.utilityScore, 0) / toKeep.length).toFixed(3)})`);

  return { pruned: toPrune.length, remaining: toKeep.length };
}

// ============================================================================
// AUTO-EVAL — Compute failure modes without human feedback
// ============================================================================

/**
 * Automatically detect failure modes from agent output + pipeline metrics.
 * Used when no human feedback is available.
 */
export function autoDetectFailureModes(metrics: {
  confidenceGiven: number;
  trustScore: number;
  citationCoverage: number;
  contradictionsFound: number;
  sourceDiversity: number;
  findingsCount: number;
}): FailureMode[] {
  const modes: FailureMode[] = [];

  // Overconfidence: claimed high confidence but trust score is low
  if (metrics.confidenceGiven > 75 && metrics.trustScore < 60) {
    modes.push("overconfident");
  }

  // Underconfidence: claimed low confidence but trust score is high
  if (metrics.confidenceGiven < 50 && metrics.trustScore > 75) {
    modes.push("underconfident");
  }

  // Citation gaps
  if (metrics.citationCoverage < 0.6) {
    modes.push("citation_gaps");
  }

  // Provider bias: low source diversity
  if (metrics.sourceDiversity < 2) {
    modes.push("provider_bias");
  }

  // Shallow analysis: very few findings
  if (metrics.findingsCount < 2) {
    modes.push("shallow_methodology");
  }

  return modes;
}
