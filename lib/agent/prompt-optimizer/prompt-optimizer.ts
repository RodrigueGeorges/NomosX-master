/**
 * Prompt Optimizer — NomosX Sprint 6 (Gap 1)
 *
 * Optimisation end-to-end des prompts des agents via "textual gradients".
 * Inspiré de :
 * - DSPy (stanfordnlp/dspy) — prompt optimization via BootstrapFewShot, MIPRO
 * - TextGrad (zou-group/textgrad) — backprop textuelle PyTorch-style
 * - Trace / OPTO (microsoft/Trace, NeurIPS 2024) — AutoDiff-like pour workflows
 *
 * Le problème :
 * Le Witness *suggère* des prompt modifications (append-only), mais il n'y a pas
 * d'optimisation systématique. L'optimizer applique les modifications, mesure
 * l'impact via le PRM, et garde les meilleures versions (best-of-N style).
 *
 * Architecture :
 * 1. Chaque agent a un "prompt program" (system prompt + few-shot examples)
 * 2. Après chaque run, on collecte les feedbacks (PRM scores, self-play lessons,
 *    human corrections, Witness learnings)
 * 3. Un LLM-as-optimizer propose des versions alternatives du prompt
 * 4. Les versions sont évaluées (via PRM ou LLM judge) et la meilleure est gardée
 * 5. L'archive des versions + scores grandit avec chaque run (moat)
 *
 * Le moat : après des milliers de runs, les prompts sont optimisés pour le domaine
 * et le style de NomosX — impossible à répliquer sans le même volume de données.
 */

import { callLLM } from '../../llm/unified-llm';
import { parseJson } from '../json-utils';
import { prisma } from '../../db';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A version of an agent's prompt program with metadata for optimization. */
export interface PromptVersion {
  /** Unique ID for this version */
  id: string;
  /** Which agent (scout, reader, analyst, critic, etc.) */
  agent: string;
  /** Version number (incremented each time) */
  version: number;
  /** The full system prompt */
  systemPrompt: string;
  /** Optional few-shot examples */
  fewShotExamples?: string[];
  /** Quality score from evaluation (0-1) */
  score: number;
  /** Number of runs that used this version */
  runCount: number;
  /** Average PRM reward across runs using this version */
  avgPrmReward: number;
  /** Average citation count across runs */
  avgCitationCount: number;
  /** Average trust score across runs */
  avgTrustScore: number;
  /** Why this version was created (what changed) */
  changeReason: string;
  /** What feedback drove this version */
  feedbackSources: FeedbackSource[];
  /** When this version was created */
  createdAt: number;
  /** Whether this is the active version */
  isActive: boolean;
}

export type FeedbackSource =
  | 'prm'
  | 'self_play'
  | 'human_correction'
  | 'witness_learning'
  | 'self_correction'
  | 'critic';

export interface PromptOptimizationInput {
  agent: string;
  currentVersion: PromptVersion;
  /** Feedback signals from recent runs */
  feedback: OptimizationFeedback;
  /** Domain (for domain-specific optimization) */
  domain?: string;
}

export interface OptimizationFeedback {
  /** PRM scores from recent runs (0-1) */
  prmScores: number[];
  /** Self-play lessons (text) */
  selfPlayLessons: string[];
  /** Human corrections (original → corrected) */
  humanCorrections: Array<{ original: string; corrected: string; type: string }>;
  /** Witness prompt modifications suggested */
  witnessSuggestions: Array<{ agent: string; suggestedFragment: string; reason: string; confidence: number }>;
  /** Self-correction feedback (what was retried and why) */
  selfCorrectionFeedback: Array<{ agent: string; feedback: string; improvedScore: number }>;
  /** Critic verdicts */
  criticFeedback: Array<{ issues: string[]; repairInstructions: string }>;
  /** Average metrics from recent runs */
  avgCitationCount: number;
  avgTrustScore: number;
  avgPrmReward: number;
}

export interface PromptOptimizationResult {
  /** New version if optimization was applied */
  newVersion: PromptVersion | null;
  /** Why optimization was or wasn't applied */
  reason: string;
  /** Cost of the optimization in USD */
  costUsd: number;
  /** Whether the new version was auto-activated */
  activated: boolean;
}

// ─── Prompt Archive (in-memory cache + DB persistence) ──────────────────────

const promptArchive = new Map<string, PromptVersion[]>();

/**
 * Get all versions of an agent's prompt, sorted by version number.
 */
export function getPromptVersions(agent: string): PromptVersion[] {
  return promptArchive.get(agent) || [];
}

/**
 * Get the active version of an agent's prompt.
 */
export function getActivePromptVersion(agent: string): PromptVersion | null {
  const versions = promptArchive.get(agent) || [];
  return versions.find(v => v.isActive) || versions[versions.length - 1] || null;
}

/**
 * Register a prompt version in the archive.
 */
export function registerPromptVersion(version: PromptVersion): void {
  const versions = promptArchive.get(version.agent) || [];
  versions.push(version);
  promptArchive.set(version.agent, versions);
}

/**
 * Set a version as active (deactivating others).
 */
export function setActivePromptVersion(agent: string, versionId: string): void {
  const versions = promptArchive.get(agent) || [];
  for (const v of versions) {
    v.isActive = v.id === versionId;
  }
}

// ─── Main Optimization Function ─────────────────────────────────────────────

/**
 * Optimize an agent's prompt based on accumulated feedback.
 *
 * This is the "textual gradient descent" step:
 * 1. Collect feedback signals (PRM, self-play, human, witness, critic)
 * 2. An LLM-as-optimizer proposes an improved prompt
 * 3. The new prompt is scored (via LLM judge or PRM prediction)
 * 4. If the new version scores higher, it becomes the active version
 *
 * @param input - The agent ID, current version, and feedback
 * @returns The optimization result (new version if applied)
 */
export async function optimizePrompt(
  input: PromptOptimizationInput,
): Promise<PromptOptimizationResult> {
  const { agent, currentVersion, feedback, domain } = input;

  // Don't optimize if there's not enough feedback signal
  const totalFeedbackSignals =
    feedback.prmScores.length +
    feedback.selfPlayLessons.length +
    feedback.humanCorrections.length +
    feedback.witnessSuggestions.length +
    feedback.selfCorrectionFeedback.length +
    feedback.criticFeedback.length;

  if (totalFeedbackSignals < 3) {
    return {
      newVersion: null,
      reason: `Insufficient feedback signals (${totalFeedbackSignals} < 3) — need more runs before optimizing`,
      costUsd: 0,
      activated: false,
    };
  }

  // Don't optimize if current version is already performing well
  if (currentVersion.avgPrmReward > 0.8 && currentVersion.runCount > 10) {
    return {
      newVersion: null,
      reason: `Current version performing well (PRM=${currentVersion.avgPrmReward.toFixed(2)}, runs=${currentVersion.runCount}) — no optimization needed`,
      costUsd: 0,
      activated: false,
    };
  }

  try {
    // Step 1: Generate an improved prompt via LLM-as-optimizer
    const optimized = await llmOptimizePrompt(currentVersion, feedback, domain);

    // Step 2: Score the new prompt (predict its quality)
    const newScore = await scorePromptVersion(optimized.systemPrompt, agent, domain);

    // Step 3: Compare with current version
    const currentScore = currentVersion.score;
    const improvement = newScore - currentScore;

    // Step 4: Apply if improvement is significant (> 0.05)
    if (improvement > 0.05) {
      const newVersion: PromptVersion = {
        id: `${agent}_v${currentVersion.version + 1}_${Date.now()}`,
        agent,
        version: currentVersion.version + 1,
        systemPrompt: optimized.systemPrompt,
        fewShotExamples: optimized.fewShotExamples,
        score: newScore,
        runCount: 0,
        avgPrmReward: 0,
        avgCitationCount: 0,
        avgTrustScore: 0,
        changeReason: optimized.changeReason,
        feedbackSources: optimized.feedbackSources,
        createdAt: Date.now(),
        isActive: false, // Not activated yet — needs validation runs
      };

      registerPromptVersion(newVersion);
      await persistPromptVersion(newVersion);

      // Auto-activate if improvement is large (> 0.15) or current version is bad
      const shouldActivate = improvement > 0.15 || currentScore < 0.4;
      if (shouldActivate) {
        setActivePromptVersion(agent, newVersion.id);
        await persistActiveVersion(agent, newVersion.id);
      }

      return {
        newVersion,
        reason: `Optimized: score ${currentScore.toFixed(2)} → ${newScore.toFixed(2)} (+${improvement.toFixed(2)})`,
        costUsd: optimized.costUsd + newScore > 0 ? 0.001 : 0, // Approximate
        activated: shouldActivate,
      };
    }

    return {
      newVersion: null,
      reason: `No improvement: current=${currentScore.toFixed(2)}, proposed=${newScore.toFixed(2)} (delta=${improvement.toFixed(2)})`,
      costUsd: 0.002,
      activated: false,
    };
  } catch (err) {
    console.warn(`[PromptOptimizer] Failed to optimize ${agent}:`, err);
    return {
      newVersion: null,
      reason: `Optimization failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      costUsd: 0,
      activated: false,
    };
  }
}

// ─── LLM-as-Optimizer ───────────────────────────────────────────────────────

/**
 * Use an LLM to propose an improved prompt based on feedback.
 * This is the "textual gradient" — the LLM computes the direction of improvement.
 */
async function llmOptimizePrompt(
  current: PromptVersion,
  feedback: OptimizationFeedback,
  domain?: string,
): Promise<{
  systemPrompt: string;
  fewShotExamples?: string[];
  changeReason: string;
  feedbackSources: FeedbackSource[];
  costUsd: number;
}> {
  const feedbackSources: FeedbackSource[] = [];

  // Build feedback summary
  const parts: string[] = [];

  if (feedback.prmScores.length > 0) {
    const avgPrm = feedback.prmScores.reduce((a, b) => a + b, 0) / feedback.prmScores.length;
    parts.push(`### PRM Scores (Process Reward Model)
Average: ${avgPrm.toFixed(2)} (0=bad, 1=excellent)
Recent scores: ${feedback.prmScores.slice(-5).map(s => s.toFixed(2)).join(', ')}
Interpretation: ${avgPrm < 0.4 ? 'POOR — reasoning quality is low' : avgPrm < 0.6 ? 'MEDIOCRE — needs improvement' : avgPrm < 0.8 ? 'GOOD but can be better' : 'EXCELLENT'}`);
    feedbackSources.push('prm');
  }

  if (feedback.selfPlayLessons.length > 0) {
    parts.push(`### Self-Play Lessons (adversarial attacks found weaknesses)
${feedback.selfPlayLessons.slice(0, 5).map((l, i) => `${i + 1}. ${l}`).join('\n')}`);
    feedbackSources.push('self_play');
  }

  if (feedback.humanCorrections.length > 0) {
    parts.push(`### Human Corrections (highest weight — human signals)
${feedback.humanCorrections.slice(0, 5).map(c => `- [${c.type}] Original: "${c.original.slice(0, 150)}..." → Corrected: "${c.corrected.slice(0, 150)}..."`).join('\n')}`);
    feedbackSources.push('human_correction');
  }

  if (feedback.witnessSuggestions.length > 0) {
    const relevant = feedback.witnessSuggestions.filter(s => s.agent === current.agent);
    if (relevant.length > 0) {
      parts.push(`### Witness Suggestions (metacognitive observer)
${relevant.map(s => `- Suggested: "${s.suggestedFragment}" (confidence: ${s.confidence}) — Reason: ${s.reason}`).join('\n')}`);
      feedbackSources.push('witness_learning');
    }
  }

  if (feedback.selfCorrectionFeedback.length > 0) {
    const relevant = feedback.selfCorrectionFeedback.filter(s => s.agent === current.agent);
    if (relevant.length > 0) {
      parts.push(`### Self-Correction Feedback (retries that improved the score)
${relevant.map(s => `- Feedback: "${s.feedback}" → Score improved to ${s.improvedScore}`).join('\n')}`);
      feedbackSources.push('self_correction');
    }
  }

  if (feedback.criticFeedback.length > 0) {
    parts.push(`### Critic Feedback (post-analysis verification)
${feedback.criticFeedback.slice(0, 3).map(c => `- Issues: ${c.issues.join('; ')}\n  Repair: ${c.repairInstructions}`).join('\n')}`);
    feedbackSources.push('critic');
  }

  parts.push(`### Average Metrics
- Citations per analysis: ${feedback.avgCitationCount.toFixed(1)}
- Trust score: ${feedback.avgTrustScore.toFixed(1)}/100
- PRM reward: ${feedback.avgPrmReward.toFixed(2)}`);

  const feedbackSummary = parts.join('\n\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a Prompt Optimizer — an expert at improving LLM agent prompts based on performance feedback.

Your job: given the current prompt and feedback signals, propose an IMPROVED version of the prompt.

Principles (DSPy/TextGrad-inspired):
1. Treat the prompt as an optimizable parameter — feedback is the "gradient"
2. Make TARGETED changes based on the feedback — don't rewrite from scratch
3. If human corrections say "missing citations", add explicit citation instructions
4. If PRM scores are low on "evidence grounding", strengthen the evidence requirements
5. If self-play found "cherry picking", add instructions to present counter-evidence
6. If critic found "false consensus", add instructions to acknowledge disagreements
7. Keep the prompt concise — don't bloat it with every piece of feedback
8. Preserve what works — only change what the feedback indicates is broken

Output JSON:
{
  "systemPrompt": "the full improved system prompt",
  "fewShotExamples": ["optional example 1", "optional example 2"],
  "changeReason": "what you changed and why (1-2 sentences)",
  "expectedImprovement": "what should improve (1 sentence)"
}`,
      },
      {
        role: 'user',
        content: `## Agent: ${current.agent}
${domain ? `## Domain: ${domain}` : ''}

## Current Prompt (version ${current.version}, score ${current.score.toFixed(2)})
"""
${current.systemPrompt}
"""

## Few-Shot Examples
${current.fewShotExamples?.map((e, i) => `Example ${i + 1}: ${e.slice(0, 200)}...`).join('\n') || 'none'}

## Performance Feedback
${feedbackSummary}

## Task
Propose an improved version of this prompt that addresses the feedback above.
Make targeted changes — don't rewrite from scratch. Preserve what works.`,
      },
    ],
    temperature: 0.4,
    jsonMode: true,
    maxTokens: 4000,
    task: 'enrichment_reasoner',
  });

  const parsed = parseJson<{
    systemPrompt: string;
    fewShotExamples?: string[];
    changeReason: string;
    expectedImprovement: string;
  }>(response.content);

  if (!parsed || !parsed.systemPrompt) {
    throw new Error('LLM optimizer returned no systemPrompt');
  }

  // Safety: don't accept prompts that are drastically different in size (> 3x or < 0.3x)
  const sizeRatio = parsed.systemPrompt.length / current.systemPrompt.length;
  if (sizeRatio > 3 || sizeRatio < 0.3) {
    throw new Error(`Optimized prompt size ratio ${sizeRatio.toFixed(2)} is out of bounds — rejecting`);
  }

  return {
    systemPrompt: parsed.systemPrompt,
    fewShotExamples: parsed.fewShotExamples,
    changeReason: parsed.changeReason || 'Optimized based on accumulated feedback',
    feedbackSources,
    costUsd: response.costUsd,
  };
}

// ─── Prompt Scoring (predict quality without running) ───────────────────────

/**
 * Score a prompt version to predict its quality.
 * Uses an LLM judge to evaluate the prompt against criteria.
 */
async function scorePromptVersion(
  systemPrompt: string,
  agent: string,
  domain?: string,
): Promise<number> {
  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a Prompt Quality Evaluator. Score the given LLM agent prompt on a scale of 0.0 to 1.0.

Criteria:
- Clarity: Is the prompt clear and unambiguous? (0-1)
- Completeness: Does it cover the necessary instructions? (0-1)
- Evidence grounding: Does it require citations and source backing? (0-1)
- Bias mitigation: Does it ask for counter-evidence and balanced views? (0-1)
- Uncertainty handling: Does it require hedging and confidence calibration? (0-1)
- Specificity: Is it specific enough to produce good output? (0-1)

Respond with JSON: {"score": 0.75, "breakdown": {"clarity": 0.8, "completeness": 0.7, ...}, "reason": "brief"}`,
        },
        {
          role: 'user',
          content: `Agent: ${agent}
${domain ? `Domain: ${domain}` : ''}

Prompt to evaluate:
"""
${systemPrompt.slice(0, 3000)}
"""

Score this prompt:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 300,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ score: number; reason: string }>(response.content);
    if (parsed && typeof parsed.score === 'number') {
      return Math.max(0, Math.min(1, parsed.score));
    }
  } catch (err) {
    console.warn('[PromptOptimizer] Scoring failed:', err);
  }
  return 0.5; // Default neutral
}

// ─── Update prompt metrics after a run ──────────────────────────────────────

/**
 * Update a prompt version's metrics after a run that used it.
 * This is how the optimizer learns which versions perform well in practice.
 */
export async function updatePromptMetrics(
  agent: string,
  versionId: string,
  metrics: {
    prmReward: number;
    citationCount: number;
    trustScore: number;
  },
): Promise<void> {
  const versions = promptArchive.get(agent) || [];
  const version = versions.find(v => v.id === versionId);
  if (!version) return;

  // Running average
  const n = version.runCount;
  version.avgPrmReward = (version.avgPrmReward * n + metrics.prmReward) / (n + 1);
  version.avgCitationCount = (version.avgCitationCount * n + metrics.citationCount) / (n + 1);
  version.avgTrustScore = (version.avgTrustScore * n + metrics.trustScore) / (n + 1);
  version.runCount = n + 1;

  // Update the overall score (weighted combination)
  version.score = Math.min(1, (
    version.avgPrmReward * 0.4 +
    (version.avgCitationCount / 20) * 0.3 + // Normalize: 20 citations = max
    (version.avgTrustScore / 100) * 0.3
  ));

  await persistPromptVersion(version);
}

// ─── Batch Optimization (optimize all agents) ───────────────────────────────

/**
 * Optimize prompts for all agents that have accumulated feedback.
 * Called periodically (e.g., after every 10 runs).
 */
export async function optimizeAllPrompts(
  feedbackByAgent: Map<string, OptimizationFeedback>,
  domain?: string,
): Promise<Array<{ agent: string; result: PromptOptimizationResult }>> {
  const results: Array<{ agent: string; result: PromptOptimizationResult }> = [];

  for (const [agent, feedback] of feedbackByAgent) {
    const current = getActivePromptVersion(agent);
    if (!current) continue;

    const result = await optimizePrompt({
      agent,
      currentVersion: current,
      feedback,
      domain,
    });

    results.push({ agent, result });

    if (result.newVersion) {
      console.log(`[PromptOptimizer] ${agent}: ${result.reason}`);
    }
  }

  return results;
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persistPromptVersion(version: PromptVersion): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        action: 'PROMPT_VERSION',
        agent: version.agent,
        resource: `prompt_${version.id}`,
        metadata: JSON.stringify(version),
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.warn('[PromptOptimizer] Persist failed:', err);
  }
}

async function persistActiveVersion(agent: string, versionId: string): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        action: 'PROMPT_ACTIVATED',
        agent,
        resource: `prompt_activate_${versionId}`,
        metadata: JSON.stringify({ agent, versionId, activatedAt: Date.now() }),
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.warn('[PromptOptimizer] Persist active failed:', err);
  }
}

/**
 * Load prompt versions from the database on startup.
 */
export async function loadPromptArchive(): Promise<void> {
  try {
    const records = await prisma.agentAuditLog.findMany({
      where: { action: 'PROMPT_VERSION' },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });

    for (const record of records) {
      const version = parseJson<PromptVersion>(record.metadata || '');
      if (version) {
        registerPromptVersion(version);
      }
    }

    // Restore active versions
    const activeRecords = await prisma.agentAuditLog.findMany({
      where: { action: 'PROMPT_ACTIVATED' },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    for (const record of activeRecords) {
      const data = parseJson<{ agent: string; versionId: string }>(record.metadata || '');
      if (data) {
        setActivePromptVersion(data.agent, data.versionId);
      }
    }

    console.log(`[PromptOptimizer] Loaded ${Array.from(promptArchive.values()).reduce((a, v) => a + v.length, 0)} prompt versions`);
  } catch (err) {
    console.warn('[PromptOptimizer] Load failed:', err);
  }
}

// ─── Initialize default prompts ─────────────────────────────────────────────

/**
 * Register the default (v1) prompt for an agent.
 * Called on startup for each agent.
 */
export function registerDefaultPrompt(agent: string, systemPrompt: string): void {
  const existing = getPromptVersions(agent);
  if (existing.length > 0) return; // Already initialized

  const version: PromptVersion = {
    id: `${agent}_v1_${Date.now()}`,
    agent,
    version: 1,
    systemPrompt,
    score: 0.5, // Neutral until we have data
    runCount: 0,
    avgPrmReward: 0,
    avgCitationCount: 0,
    avgTrustScore: 0,
    changeReason: 'Initial default prompt',
    feedbackSources: [],
    createdAt: Date.now(),
    isActive: true,
  };

  registerPromptVersion(version);
}

/**
 * Get the active system prompt for an agent (with fallback to provided default).
 */
export function getActiveSystemPrompt(agent: string, fallback: string): string {
  const active = getActivePromptVersion(agent);
  return active?.systemPrompt || fallback;
}
