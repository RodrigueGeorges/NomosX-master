/**
 * NomosX LESSON VERIFIER — Independent verification of agent lessons
 *
 * Inspired by LUCID (2026): "Memory Reward Inflation in Self-Improving LLM Agents"
 *
 * PROBLEM (the Echo Gap):
 *   When an agent generates its own lessons and scores them, incorrect lessons
 *   receive inflated rewards. The agent then preferentially reuses its most
 *   confident mistakes. The error compounds through memory rather than averaging out.
 *
 * SOLUTION (Error-Independence Assumption):
 *   A verifier that is INDEPENDENT from the agent's own bias must validate lessons.
 *   The verifier uses a different LLM call with a different prompt role (critic, not
 *   generator) and checks each lesson against:
 *   1. LOGICAL VALIDITY — is the lesson logically sound?
 *   2. EVIDENCE GROUNDING — is the lesson grounded in the actual failure?
 *   3. GENERALIZABILITY — does the lesson apply broadly or is it overfit to one case?
 *   4. ACTIONABILITY — can the agent actually apply this lesson?
 *
 * Lessons that fail verification get their weight reduced (de-inflation).
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { prisma } from '../db';
import { embedText, cosineSimilarity } from './semantic-engine';
import type { AgentLesson } from './agent-memory';

// ============================================================================
// TYPES
// ============================================================================

export interface LessonVerification {
  lessonText: string;
  agentId: string;
  verdict: 'valid' | 'questionable' | 'invalid';
  scores: {
    logicalValidity: number;    // 0-1
    evidenceGrounding: number;  // 0-1
    generalizability: number;   // 0-1
    actionability: number;      // 0-1
  };
  overallScore: number;         // 0-1: weighted average
  critique: string;             // What's wrong with the lesson (if anything)
  recommendedWeight: number;    // 0-1: adjusted weight after de-inflation
  costUsd: number;
}

export interface BatchVerificationResult {
  verified: LessonVerification[];
  deInflatedCount: number;      // How many lessons had their weight reduced
  prunedCount: number;          // How many lessons were marked invalid
  avgScore: number;
  costUsd: number;
}

// ============================================================================
// INDEPENDENT VERIFIER — Different LLM role than the agent
// ============================================================================

/**
 * Verify a single lesson using an independent critic LLM.
 *
 * The critic prompt is deliberately different from the agent's prompt to break
 * the correlation between generation bias and verification bias (LUCID's EIA).
 */
export async function verifyLesson(
  lessonText: string,
  agentId: string,
  context?: { failureModes?: string[]; question?: string; agentOutputExcerpt?: string }
): Promise<LessonVerification> {
  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are an INDEPENDENT lesson verifier. Your job is to critically evaluate whether a lesson learned by an AI agent is actually valid, grounded, generalizable, and actionable. You are NOT the agent that generated the lesson — you are a skeptical external reviewer. Be critical. Many lessons are overgeneralized or wrong.`,
      },
      {
        role: "user",
        content: `LESSON TO VERIFY: "${lessonText}"

AGENT THAT LEARNED IT: ${agentId}
${context?.failureModes ? `FAILURE MODES DETECTED: ${context.failureModes.join(', ')}` : ''}
${context?.question ? `QUESTION THAT WAS ANALYZED: "${context.question.slice(0, 200)}"` : ''}
${context?.agentOutputExcerpt ? `AGENT OUTPUT (excerpt): ${context.agentOutputExcerpt.slice(0, 500)}` : ''}

Evaluate this lesson on 4 dimensions (0-1 each):
1. LOGICAL VALIDITY: Is the lesson logically sound? Does the conclusion follow from the evidence?
2. EVIDENCE GROUNDING: Is the lesson actually grounded in the observed failure, or is it speculative?
3. GENERALIZABILITY: Does this lesson apply broadly, or is it overfit to one specific case?
4. ACTIONABILITY: Can an agent concretely apply this lesson in future runs?

Return JSON:
{
  "verdict": "valid" | "questionable" | "invalid",
  "scores": { "logicalValidity": 0-1, "evidenceGrounding": 0-1, "generalizability": 0-1, "actionability": 0-1 },
  "critique": "what's wrong with this lesson, if anything",
  "recommendedWeight": 0-1
}

Rules:
- "valid": all scores >= 0.6, lesson is sound and applicable
- "questionable": some scores < 0.6, lesson may be overgeneralized or weakly grounded
- "invalid": most scores < 0.4, lesson is wrong or not actionable
- recommendedWeight: how much weight this lesson should have (0 = ignore, 1 = full trust)
- Be skeptical: if in doubt, score lower rather than higher`,
      },
    ],
    temperature: 0.2,
    maxTokens: 500,
    jsonMode: true,
    task: 'topic_classification',
  });

  try {
    const parsed = parseJson<any>(result.content);
    const scores = {
      logicalValidity: clamp01(Number(parsed?.scores?.logicalValidity ?? 0.5)),
      evidenceGrounding: clamp01(Number(parsed?.scores?.evidenceGrounding ?? 0.5)),
      generalizability: clamp01(Number(parsed?.scores?.generalizability ?? 0.5)),
      actionability: clamp01(Number(parsed?.scores?.actionability ?? 0.5)),
    };
    const overallScore = (scores.logicalValidity * 0.3 + scores.evidenceGrounding * 0.3 + scores.generalizability * 0.2 + scores.actionability * 0.2);
    const verdict = parsed?.verdict || (overallScore >= 0.7 ? 'valid' : overallScore >= 0.4 ? 'questionable' : 'invalid');
    const recommendedWeight = clamp01(Number(parsed?.recommendedWeight ?? overallScore));

    return {
      lessonText,
      agentId,
      verdict,
      scores,
      overallScore,
      critique: parsed?.critique || '',
      recommendedWeight,
      costUsd: result.costUsd,
    };
  } catch {
    return {
      lessonText,
      agentId,
      verdict: 'questionable',
      scores: { logicalValidity: 0.5, evidenceGrounding: 0.5, generalizability: 0.5, actionability: 0.5 },
      overallScore: 0.5,
      critique: 'Verification failed — defaulting to questionable',
      recommendedWeight: 0.5,
      costUsd: result.costUsd,
    };
  }
}

// ============================================================================
// BATCH VERIFICATION — De-inflate a set of lessons
// ============================================================================

/**
 * Verify and de-inflate a batch of lessons.
 * Lessons that fail verification get their weight reduced in the database.
 *
 * This is the LUCID de-inflation algorithm: instead of trusting the agent's
 * self-assessment, an independent verifier adjusts the weights.
 */
export async function verifyAndDeInflateLessons(
  agentId: string,
  context?: { failureModes?: string[]; question?: string; agentOutputExcerpt?: string }
): Promise<BatchVerificationResult> {
  // Fetch all lessons for this agent
  const records = await prisma.agentAuditLog.findMany({
    where: { agent: agentId, action: "LESSON_LEARNED" },
    orderBy: { timestamp: "desc" },
    take: 20,
  });

  if (records.length === 0) {
    return { verified: [], deInflatedCount: 0, prunedCount: 0, avgScore: 0, costUsd: 0 };
  }

  const verifications: LessonVerification[] = [];
  let totalCost = 0;

  for (const record of records) {
    try {
      const m = JSON.parse(record.metadata || "{}");
      if (!m.lesson) continue;

      const verification = await verifyLesson(m.lesson, agentId, context);
      verifications.push(verification);
      totalCost += verification.costUsd;

      // Apply de-inflation: update the lesson's weight in the DB
      const currentWeight = m.weight || 0.7;
      const newWeight = Math.min(currentWeight, verification.recommendedWeight);

      if (verification.verdict === 'invalid') {
        // Mark as invalid by setting weight to near-zero
        await prisma.agentAuditLog.update({
          where: { id: record.id },
          data: {
            metadata: JSON.stringify({
              ...m,
              weight: 0.05,
              verified: false,
              verificationCritique: verification.critique,
              verifiedAt: new Date().toISOString(),
            }),
          },
        });
      } else if (newWeight < currentWeight - 0.1) {
        // De-inflate: reduce weight
        await prisma.agentAuditLog.update({
          where: { id: record.id },
          data: {
            metadata: JSON.stringify({
              ...m,
              weight: newWeight,
              verified: verification.verdict === 'valid',
              verificationScore: verification.overallScore,
              verifiedAt: new Date().toISOString(),
            }),
          },
        });
      }
    } catch { continue; }
  }

  const deInflatedCount = verifications.filter(v => v.verdict === 'questionable').length;
  const prunedCount = verifications.filter(v => v.verdict === 'invalid').length;
  const avgScore = verifications.length > 0
    ? verifications.reduce((s, v) => s + v.overallScore, 0) / verifications.length
    : 0;

  console.log(`[LESSON VERIFIER] ${agentId}: ${verifications.length} lessons verified — ${deInflatedCount} de-inflated, ${prunedCount} pruned, avg score: ${avgScore.toFixed(2)}`);

  return {
    verified: verifications,
    deInflatedCount,
    prunedCount,
    avgScore,
    costUsd: totalCost,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
