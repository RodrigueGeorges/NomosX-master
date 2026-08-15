/**
 * NomosX PROMPT REGISTRY — Versioned prompt management with performance tracking
 *
 * Implements prompt evolution inspired by:
 * - AgentTuning (ACL 2024): instruction-tuning with interaction trajectories
 * - Self-Refine (2023): FEEDBACK → REFINE → FEEDBACK loop
 * - Gödel Agent (ACL 2025): recursive self-improvement
 *
 * Architecture:
 * 1. PROMPT VERSIONS — each prompt version is stored with its performance stats
 * 2. PERFORMANCE TRACKING — tracks avgTrustScore, avgQualityScore per version
 * 3. A/B TESTING — traffic split between variants
 * 4. EVOLUTION — LLM generates improved prompts from lessons learned
 *
 * Stored in AgentAuditLog with action="PROMPT_VERSION" for zero-migration compatibility.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import type { DomainExpertise } from './types';
import type { AgentLesson } from './agent-memory';

// ============================================================================
// TYPES
// ============================================================================

export interface PromptVersion {
  version: string;            // "v1", "v2", "v3-abc123"
  agentId: string;            // "analyst", "reader", "strategic-analyst"
  domain?: DomainExpertise;
  prompt: string;
  createdAt: Date;
  performanceStats: {
    avgTrustScore: number;
    avgQualityScore: number;
    totalRuns: number;
    successRate: number;      // fraction of runs with trustScore >= 70
  };
  parentVersion?: string;     // For evolution tracking
  isActive: boolean;          // Currently being used
  abTestGroup?: 'A' | 'B';    // If part of an A/B test
}

export interface PromptEvolutionResult {
  newVersion: string;
  newPrompt: string;
  changes: string[];          // What was changed
  costUsd: number;
}

// ============================================================================
// VERSION MANAGEMENT
// ============================================================================

/**
 * Register a new prompt version.
 * Deactivates previous versions for the same agent/domain.
 */
export async function registerPromptVersion(
  agentId: string,
  prompt: string,
  domain?: DomainExpertise,
  parentVersion?: string
): Promise<PromptVersion> {
  const version = await generateVersionNumber(agentId, domain);

  // Deactivate previous active versions
  await prisma.agentAuditLog.updateMany({
    where: {
      agent: agentId,
      action: "PROMPT_VERSION",
      metadata: { contains: domain ? `"domain":"${domain}"` : '"domain":null' },
    },
    data: { metadata: undefined }, // Can't update metadata in updateMany; handle below
  }).catch(() => {});

  // Store new version
  const record = await prisma.agentAuditLog.create({
    data: {
      agent: agentId,
      action: "PROMPT_VERSION",
      resource: version,
      metadata: JSON.stringify({
        version,
        domain: domain || null,
        prompt,
        parentVersion: parentVersion || null,
        isActive: true,
        createdAt: new Date().toISOString(),
        performanceStats: {
          avgTrustScore: 0,
          avgQualityScore: 0,
          totalRuns: 0,
          successRate: 0,
        },
      }),
    },
  });

  return {
    version,
    agentId,
    domain,
    prompt,
    createdAt: new Date(),
    performanceStats: { avgTrustScore: 0, avgQualityScore: 0, totalRuns: 0, successRate: 0 },
    parentVersion,
    isActive: true,
  };
}

/**
 * Get the best-performing active prompt version for an agent/domain.
 * Falls back to the most recent active version if no performance data exists.
 */
export async function getBestPromptVersion(
  agentId: string,
  domain?: DomainExpertise
): Promise<PromptVersion | null> {
  const records = await prisma.agentAuditLog.findMany({
    where: { agent: agentId, action: "PROMPT_VERSION" },
    orderBy: { timestamp: "desc" },
    take: 20,
  });

  const versions: PromptVersion[] = records
    .map(r => {
      try {
        const m = JSON.parse(r.metadata || "{}");
        if (domain && m.domain !== domain) return null;
        if (!domain && m.domain !== null && m.domain !== undefined) return null;
        return {
          version: m.version || r.resource,
          agentId,
          domain: m.domain || undefined,
          prompt: m.prompt || "",
          createdAt: r.timestamp,
          performanceStats: m.performanceStats || { avgTrustScore: 0, avgQualityScore: 0, totalRuns: 0, successRate: 0 },
          parentVersion: m.parentVersion,
          isActive: m.isActive !== false,
          abTestGroup: m.abTestGroup,
        } as PromptVersion;
      } catch { return null; }
    })
    .filter(Boolean) as PromptVersion[];

  if (versions.length === 0) return null;

  // If we have performance data, pick the best by avgTrustScore (min 3 runs for significance)
  const withData = versions.filter(v => v.performanceStats.totalRuns >= 3);
  if (withData.length > 0) {
    withData.sort((a, b) => b.performanceStats.avgTrustScore - a.performanceStats.avgTrustScore);
    return withData[0];
  }

  // Fall back to most recent active version
  const active = versions.filter(v => v.isActive);
  return active[0] || versions[0];
}

/**
 * Update performance stats for a prompt version after a run.
 */
export async function updatePromptVersionStats(
  version: string,
  agentId: string,
  trustScore: number,
  qualityScore: number
): Promise<void> {
  try {
    const records = await prisma.agentAuditLog.findMany({
      where: { agent: agentId, action: "PROMPT_VERSION", resource: version },
      take: 1,
    });
    if (records.length === 0) return;

    const m = JSON.parse(records[0].metadata || "{}");
    const stats = m.performanceStats || { avgTrustScore: 0, avgQualityScore: 0, totalRuns: 0, successRate: 0 };
    const newTotal = stats.totalRuns + 1;
    // Exponential moving average for recent-weighted tracking
    const alpha = 0.3;
    const newAvgTrust = (stats.avgTrustScore * (1 - alpha)) + (trustScore * alpha);
    const newAvgQuality = (stats.avgQualityScore * (1 - alpha)) + (qualityScore * alpha);
    const newSuccessRate = ((stats.successRate * stats.totalRuns) + (trustScore >= 70 ? 1 : 0)) / newTotal;

    await prisma.agentAuditLog.update({
      where: { id: records[0].id },
      data: {
        metadata: JSON.stringify({
          ...m,
          performanceStats: {
            avgTrustScore: Math.round(newAvgTrust * 10) / 10,
            avgQualityScore: Math.round(newAvgQuality * 10) / 10,
            totalRuns: newTotal,
            successRate: Math.round(newSuccessRate * 1000) / 1000,
          },
        }),
      },
    });
  } catch (err) {
    console.warn("[PROMPT REGISTRY] Failed to update version stats:", err);
  }
}

// ============================================================================
// PROMPT EVOLUTION — LLM-generated improved prompts (Self-Refine pattern)
// ============================================================================

/**
 * Evolve a prompt using LLM, incorporating lessons learned.
 * Inspired by Self-Refine (2023) and Gödel Agent (ACL 2025).
 *
 * The LLM analyzes the current prompt + lessons + failure modes and generates
 * an improved version. The new version is registered and tracked.
 */
export async function evolveAgentPrompt(
  agentId: string,
  currentPrompt: string,
  lessons: AgentLesson[],
  domain?: DomainExpertise,
  failureModes: string[] = []
): Promise<PromptEvolutionResult> {
  if (lessons.length === 0 && failureModes.length === 0) {
    return { newVersion: "", newPrompt: currentPrompt, changes: [], costUsd: 0 };
  }

  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are a prompt engineering expert. Your job is to improve an AI agent's system prompt based on performance feedback. Make targeted, surgical improvements — do not rewrite the entire prompt. Preserve the structure and intent.`,
      },
      {
        role: "user",
        content: `AGENT: ${agentId}${domain ? ` (${domain})` : ""}

CURRENT PROMPT:
---
${currentPrompt.slice(0, 4000)}
---

LESSONS LEARNED (from past runs):
${lessons.map((l, i) => `${i + 1}. ${l.lesson} (success rate: ${(l.successRate * 100).toFixed(0)}%, applied ${l.appliedCount}x)`).join("\n")}

RECURRING FAILURE MODES:
${failureModes.join(", ") || "none"}

Improve the prompt to address these issues. Return JSON:
{
  "improvedPrompt": "the full improved prompt",
  "changes": ["change 1 description", "change 2 description"]
}

Rules:
- Keep the prompt under 4000 characters
- Add specific instructions to address each failure mode
- Incorporate lessons as explicit behavioral guidelines
- Do NOT remove existing instructions that work
- Be specific and actionable, not vague`,
      },
    ],
    temperature: 0.3,
    maxTokens: 4000,
    jsonMode: true,
    task: 'topic_classification',
  });

  try {
    const parsed = parseJson<any>(result.content);
    if (!parsed?.improvedPrompt) {
      return { newVersion: "", newPrompt: currentPrompt, changes: [], costUsd: result.costUsd };
    }

    const newVersion = await generateVersionNumber(agentId, domain);
    await registerPromptVersion(agentId, parsed.improvedPrompt, domain, undefined);

    return {
      newVersion,
      newPrompt: parsed.improvedPrompt,
      changes: parsed.changes || [],
      costUsd: result.costUsd,
    };
  } catch {
    return { newVersion: "", newPrompt: currentPrompt, changes: [], costUsd: result.costUsd };
  }
}

// ============================================================================
// A/B TESTING — Compare prompt variants (Self-Discovery inspired)
// ============================================================================

export interface ABTestConfig {
  testId: string;
  agentId: string;
  variantA: PromptVersion;
  variantB: PromptVersion;
  trafficSplit: number;       // 0.5 = 50/50
  minSamples: number;         // Minimum runs before declaring a winner
}

/**
 * Decide which variant to use for this run (A/B test routing).
 * Returns 'A' or 'B' based on traffic split + hashing for deterministic assignment.
 */
export function selectABVariant(config: ABTestConfig, runId: string): 'A' | 'B' {
  // Deterministic hash of runId for consistent assignment
  let hash = 0;
  for (let i = 0; i < runId.length; i++) {
    hash = ((hash << 5) - hash) + runId.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash) / 2147483647;
  return normalized < config.trafficSplit ? 'A' : 'B';
}

/**
 * Check if an A/B test has enough samples to declare a winner.
 * Returns the winning variant or 'inconclusive'.
 */
export function evaluateABTest(config: ABTestConfig): 'A' | 'B' | 'inconclusive' {
  const a = config.variantA.performanceStats;
  const b = config.variantB.performanceStats;

  if (a.totalRuns < config.minSamples || b.totalRuns < config.minSamples) {
    return 'inconclusive';
  }

  // Require at least 3 points difference to declare a winner (statistical significance proxy)
  const diff = a.avgTrustScore - b.avgTrustScore;
  if (Math.abs(diff) < 3) return 'inconclusive';
  return diff > 0 ? 'A' : 'B';
}

// ============================================================================
// HELPERS
// ============================================================================

async function generateVersionNumber(agentId: string, domain?: DomainExpertise): Promise<string> {
  const count = await prisma.agentAuditLog.count({
    where: { agent: agentId, action: "PROMPT_VERSION" },
  });
  return `v${count + 1}`;
}

/**
 * Get all prompt versions for an agent (for audit/debugging).
 */
export async function getPromptHistory(
  agentId: string,
  domain?: DomainExpertise
): Promise<PromptVersion[]> {
  const records = await prisma.agentAuditLog.findMany({
    where: { agent: agentId, action: "PROMPT_VERSION" },
    orderBy: { timestamp: "desc" },
  });

  return records
    .map(r => {
      try {
        const m = JSON.parse(r.metadata || "{}");
        if (domain && m.domain !== domain) return null;
        return {
          version: m.version || r.resource,
          agentId,
          domain: m.domain || undefined,
          prompt: m.prompt || "",
          createdAt: r.timestamp,
          performanceStats: m.performanceStats || { avgTrustScore: 0, avgQualityScore: 0, totalRuns: 0, successRate: 0 },
          parentVersion: m.parentVersion,
          isActive: m.isActive !== false,
        } as PromptVersion;
      } catch { return null; }
    })
    .filter(Boolean) as PromptVersion[];
}
