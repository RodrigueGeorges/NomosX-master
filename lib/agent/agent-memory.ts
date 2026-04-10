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
 * Dr. Vasquez remembers that her econometric critiques on climate papers
 * were rated low quality → she now applies stricter identification checks.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
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
): Promise<{ lessons: string[]; costUsd: number }> {
  if (feedbackOrEval.trustScore >= 80 && feedbackOrEval.failureModes.length === 0) {
    // High quality — extract positive lessons (what worked)
    return { lessons: [`High-quality analysis achieved on "${question.slice(0, 80)}..." — approach was effective`], costUsd: 0 };
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
Return JSON: { "lessons": ["lesson 1", "lesson 2", ...] }`,
      },
    ],
    temperature: 0.2,
    maxTokens: 400,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(result.content);
    return { lessons: parsed.lessons || [], costUsd: result.costUsd };
  } catch {
    return { lessons: [], costUsd: result.costUsd };
  }
}

// ============================================================================
// CALIBRATION ENGINE
// ============================================================================

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

  return {
    agentId,
    domain,
    confidenceAdjustment,
    minQualityThreshold: Math.max(50, avgQuality - 10),
    preferredProviders: [],   // TODO: track per-provider performance
    avoidProviders: [],
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
  options: { maxLessons?: number; lookbackDays?: number } = {}
): Promise<MemoryInjection> {
  const { maxLessons = 5, lookbackDays = 90 } = options;
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
        return {
          agentId,
          domain: m.domain,
          lesson: m.lesson,
          learnedFrom: m.runId || "",
          weight: m.weight || 0.5,
          appliedCount: m.appliedCount || 0,
          successRate: m.successRate || 0.5,
          createdAt: r.timestamp,
          lastApplied: null,
        } as AgentLesson;
      } catch { return null; }
    })
    .filter(Boolean) as AgentLesson[];

  // Sort by weight × successRate, take top N
  const topLessons = lessons
    .sort((a, b) => (b.weight * b.successRate) - (a.weight * a.successRate))
    .slice(0, maxLessons);

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
      lines.push(`- ${lesson.lesson}`);
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
 */
export async function storeLesson(
  agentId: string,
  lesson: string,
  runId: string,
  domain?: DomainExpertise,
  weight: number = 0.7
): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: agentId,
        action: "LESSON_LEARNED",
        resource: runId,
        metadata: JSON.stringify({
          lesson,
          domain,
          runId,
          weight,
          appliedCount: 0,
          successRate: 0.5,
        }),
      },
    });
  } catch (err) {
    console.warn("[AGENT MEMORY] Failed to store lesson:", err);
  }
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
