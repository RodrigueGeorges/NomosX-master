/**
 * NomosX Cross-Model Consensus + Reflective RAG
 *
 * Two complementary innovations from 2026 research:
 *
 * 1. CROSS-MODEL CONSENSUS (LLM Jury, arxiv 2026):
 *    Multiple independently-trained models vote on critical claims.
 *    Errors decorrelate → consensus emerges. +4.6 accuracy vs single model.
 *    Key insight: 3 models from different providers = ~1.3 independent models
 *    (r=0.77 error correlation), but still better than any single model.
 *
 * 2. REFLECTIVE RAG (ACL 2026 Findings):
 *    Self-evaluation after each pipeline phase. A "reflection tag" critiques
 *    the quality of the current output and guides the next strategy.
 *    Two-stage: (1) SFT learns reflection signals, (2) RL optimizes strategy.
 *    In practice (without RL): LLM self-evaluation + heuristic thresholds.
 *
 * Integration in NomosX:
 * - After SCOUT: "Do we have enough diverse, relevant sources?"
 * - After READER: "Are the readings consistent and well-grounded?"
 * - After ANALYST: "Is the analysis balanced, well-cited, and non-hallucinated?"
 * - For CRITICAL CLAIMS: 3 models verify independently, majority wins
 */

import { callLLM, type LLMProvider } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Cross-Model Consensus ──────────────────────────────────────────────────

export interface ConsensusVote {
  provider: string;
  model: string;
  verdict: 'support' | 'contradict' | 'uncertain';
  reasoning: string;
  confidence: number; // 0-1
}

export interface ConsensusResult {
  verdict: 'support' | 'contradict' | 'uncertain';
  votes: ConsensusVote[];
  agreement: number; // 0-1, fraction of models that agree
  costUsd: number;
  durationMs: number;
}

/**
 * Providers to use for cross-model consensus.
 * We use models from different families (OpenAI, DeepSeek, GLM) to maximize
 * error decorrelation. The LLM Jury paper shows that independent training
 * is what matters — not just different model sizes.
 */
const CONSENSUS_PROVIDERS: Array<{ provider: LLMProvider; label: string }> = [
  { provider: 'openai', label: 'openai/gpt-5.6-luna' },
  { provider: 'deepseek', label: 'deepseek/deepseek-flash' },
  { provider: 'glm', label: 'glm/glm-5.3-flash' },
];

const CONSENSUS_PROMPT = `You are a fact-checker. Verify this claim against the provided evidence.

CLAIM: {claim}

EVIDENCE:
{evidence}

Return JSON:
{
  "verdict": "support" | "contradict" | "uncertain",
  "reasoning": "Brief explanation of why",
  "confidence": 0.0-1.0
}

Rules:
- "support": Evidence clearly supports the claim
- "contradict": Evidence directly contradicts the claim
- "uncertain": Evidence is ambiguous or insufficient
- Be strict — only "support" if the evidence clearly backs the claim`;

/**
 * Run cross-model consensus on a critical claim.
 * Each model independently verifies the claim against the evidence.
 * Majority vote determines the final verdict.
 *
 * Use this for:
 * - Key statistics (e.g. "emissions reduced by 20%")
 * - Controversial claims (e.g. "policy X is effective")
 * - Claims that contradict other sources
 */
export async function crossModelConsensus(
  claim: string,
  evidence: string,
  providers?: Array<{ provider: LLMProvider; label: string }>,
): Promise<ConsensusResult> {
  const startTime = Date.now();
  const selectedProviders = providers || CONSENSUS_PROVIDERS;
  const votes: ConsensusVote[] = [];
  let totalCost = 0;

  // Run all models in parallel
  const results = await Promise.allSettled(
    selectedProviders.map(async (p) => {
      const response = await callLLM({
        messages: [{
          role: 'user',
          content: CONSENSUS_PROMPT
            .replace('{claim}', claim.slice(0, 500))
            .replace('{evidence}', evidence.slice(0, 2000)),
        }],
        temperature: 0.1,
        jsonMode: true,
        maxTokens: 300,
        provider: p.provider,
        task: 'reader_v3',
        enableCache: true,
      });

      const result = parseJson<{ verdict: string; reasoning: string; confidence: number }>(response.content);
      return {
        provider: p.label,
        model: response.model,
        verdict: (result?.verdict || 'uncertain') as ConsensusVote['verdict'],
        reasoning: result?.reasoning || '',
        confidence: result?.confidence ?? 0.5,
        costUsd: response.costUsd,
      };
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      votes.push({
        provider: r.value.provider,
        model: r.value.model,
        verdict: r.value.verdict,
        reasoning: r.value.reasoning,
        confidence: r.value.confidence,
      });
      totalCost += r.value.costUsd || 0;
    }
  }

  // Majority vote
  const supportCount = votes.filter(v => v.verdict === 'support').length;
  const contradictCount = votes.filter(v => v.verdict === 'contradict').length;
  const uncertainCount = votes.filter(v => v.verdict === 'uncertain').length;

  let verdict: ConsensusResult['verdict'];
  if (supportCount > contradictCount && supportCount > uncertainCount) {
    verdict = 'support';
  } else if (contradictCount >= supportCount && contradictCount > uncertainCount) {
    verdict = 'contradict';
  } else {
    verdict = 'uncertain';
  }

  const agreement = votes.length > 0
    ? Math.max(supportCount, contradictCount, uncertainCount) / votes.length
    : 0;

  const durationMs = Date.now() - startTime;

  return {
    verdict,
    votes,
    agreement,
    costUsd: totalCost,
    durationMs,
  };
}

// ─── Reflective RAG ─────────────────────────────────────────────────────────

export type PipelinePhase = 'scout' | 'reader' | 'analyst' | 'critic';

export interface ReflectionResult {
  phase: PipelinePhase;
  quality: 'high' | 'medium' | 'low';
  score: number; // 0-100
  issues: string[];
  recommendations: string[];
  shouldRetry: boolean;
  retryStrategy?: string;
  costUsd: number;
}

const REFLECTION_PROMPTS: Record<PipelinePhase, string> = {
  scout: `You are a research quality auditor. Evaluate the quality of sources collected for a research question.

RESEARCH QUESTION: {question}
SOURCES COLLECTED: {sourceCount} sources from {providerCount} providers
TOP SOURCES (by quality):
{topSources}

Evaluate:
1. RELEVANCE: Are the sources relevant to the research question?
2. DIVERSITY: Are there enough different providers, years, and perspectives?
3. COMPLETENESS: Are there obvious gaps (no contrarian views, no historical context)?
4. QUALITY: Are the sources high-quality (peer-reviewed, institutional)?

Return JSON:
{
  "quality": "high" | "medium" | "low",
  "score": 0-100,
  "issues": ["issue 1", "issue 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "shouldRetry": true/false,
  "retryStrategy": "If retry, what strategy to use (e.g. 'add contrarian providers', 'search for historical analogues')"
}`,

  reader: `You are a research quality auditor. Evaluate the quality of source readings.

RESEARCH QUESTION: {question}
SOURCES READ: {sourceCount}
READINGS SUMMARY:
{readingsSummary}

Evaluate:
1. COMPREHENSIVENESS: Were key claims, methods, and limitations extracted?
2. CONSISTENCY: Are the readings consistent across sources?
3. CONFIDENCE: Are the confidence levels appropriate?
4. GAPS: Are there sources with missing or low-quality readings?

Return JSON:
{
  "quality": "high" | "medium" | "low",
  "score": 0-100,
  "issues": ["issue 1"],
  "recommendations": ["recommendation 1"],
  "shouldRetry": true/false,
  "retryStrategy": "If retry, what to do"
}`,

  analyst: `You are a research quality auditor. Evaluate the quality of a research analysis.

RESEARCH QUESTION: {question}
ANALYSIS SUMMARY (first 2000 chars):
{analysisSummary}
SOURCES USED: {sourceCount}
CITATIONS USED: {citationCount}

Evaluate:
1. EVIDENCE GROUNDING: Are claims well-supported by cited sources?
2. BALANCE: Does the analysis present multiple perspectives?
3. COMPLETENESS: Are all key sections present (consensus, debate, risks)?
4. CITATION DENSITY: Are there enough citations?
5. HEDGING: Is the language appropriately calibrated (not overconfident)?

Return JSON:
{
  "quality": "high" | "medium" | "low",
  "score": 0-100,
  "issues": ["issue 1"],
  "recommendations": ["recommendation 1"],
  "shouldRetry": true/false,
  "retryStrategy": "If retry, what to fix"
}`,

  critic: `You are a research quality auditor. Evaluate the critic's verdict.

CRITIC VERDICT: {verdict}
CRITIC SCORE: {score}
ISSUES FOUND:
{issues}

Evaluate:
1. Was the critic thorough?
2. Are the issues genuine?
3. Is the verdict appropriate?

Return JSON:
{
  "quality": "high" | "medium" | "low",
  "score": 0-100,
  "issues": ["issue 1"],
  "recommendations": ["recommendation 1"],
  "shouldRetry": true/false,
  "retryStrategy": "If retry, what to do"
}`,
};

/**
 * Run a reflection on a pipeline phase.
 * This is the Reflective RAG pattern: self-evaluation after each phase.
 *
 * The reflection produces:
 * - A quality score (0-100)
 * - A list of issues found
 * - Recommendations for improvement
 * - A shouldRetry flag + retry strategy
 *
 * The pipeline orchestrator uses this to decide whether to retry the phase
 * or continue to the next one.
 */
export async function reflectOnPhase(
  phase: PipelinePhase,
  context: {
    question: string;
    sourceCount?: number;
    providerCount?: number;
    topSources?: string;
    readingsSummary?: string;
    analysisSummary?: string;
    citationCount?: number;
    verdict?: string;
    score?: number;
    issues?: string;
  },
): Promise<ReflectionResult> {
  const prompt = REFLECTION_PROMPTS[phase];

  try {
    const content = prompt
      .replace('{question}', context.question.slice(0, 500))
      .replace('{sourceCount}', String(context.sourceCount || 0))
      .replace('{providerCount}', String(context.providerCount || 0))
      .replace('{topSources}', context.topSources || 'N/A')
      .replace('{readingsSummary}', (context.readingsSummary || 'N/A').slice(0, 2000))
      .replace('{analysisSummary}', (context.analysisSummary || 'N/A').slice(0, 2000))
      .replace('{citationCount}', String(context.citationCount || 0))
      .replace('{verdict}', context.verdict || 'N/A')
      .replace('{score}', String(context.score || 0))
      .replace('{issues}', context.issues || 'N/A');

    const response = await callLLM({
      messages: [{ role: 'user', content }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 1000,
      task: 'reader_v3',
      enableCache: true,
    });

    const result = parseJson<{
      quality: string;
      score: number;
      issues: string[];
      recommendations: string[];
      shouldRetry: boolean;
      retryStrategy?: string;
    }>(response.content);

    if (result) {
      return {
        phase,
        quality: result.quality as ReflectionResult['quality'],
        score: result.score,
        issues: result.issues || [],
        recommendations: result.recommendations || [],
        shouldRetry: result.shouldRetry,
        retryStrategy: result.retryStrategy,
        costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0,
      };
    }
  } catch (err) {
    console.warn(`[ReflectiveRAG] Reflection on ${phase} failed:`, String(err).slice(0, 80));
  }

  // Fallback: heuristic-based reflection
  return heuristicReflection(phase, context);
}

/**
 * Heuristic fallback when LLM reflection fails.
 * Uses simple rules to assess quality.
 */
function heuristicReflection(phase: PipelinePhase, context: any): ReflectionResult {
  let score = 50;
  const issues: string[] = [];
  const recommendations: string[] = [];
  let shouldRetry = false;

  if (phase === 'scout') {
    if (context.sourceCount < 10) {
      score = 30;
      issues.push('Insufficient sources collected');
      recommendations.push('Re-search with broader queries or more providers');
      shouldRetry = true;
    } else if (context.sourceCount < 30) {
      score = 60;
      issues.push('Limited source count');
    } else {
      score = 75;
    }
    if (context.providerCount < 3) {
      score -= 15;
      issues.push('Low provider diversity');
      recommendations.push('Add more diverse providers');
      shouldRetry = true;
    }
  } else if (phase === 'reader') {
    score = 70; // Default: assume readings are OK
  } else if (phase === 'analyst') {
    if (context.citationCount < 3) {
      score = 35;
      issues.push('Insufficient citations');
      recommendations.push('Add more citations to support claims');
      shouldRetry = true;
    } else {
      score = 70;
    }
  }

  return {
    phase,
    quality: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
    score,
    issues,
    recommendations,
    shouldRetry,
    costUsd: 0,
  };
}

// ─── Semantic Failure Memory ────────────────────────────────────────────────

/**
 * Semantic Failure Memory (from Critic-Guided Hybrid Agentic RAG, OpenReview 2026).
 *
 * Records past failures so the pipeline doesn't repeat them.
 * Each failure is tagged with:
 * - The phase where it occurred
 * - The type of failure
 * - The fix that was applied
 *
 * On subsequent runs, the memory is consulted to avoid known pitfalls.
 */

export interface FailureRecord {
  id: string;
  phase: PipelinePhase;
  failureType: string;
  description: string;
  fix: string;
  timestamp: number;
  topicHash?: string;
}

const failureMemory: FailureRecord[] = [];
const MAX_MEMORY_SIZE = 100;

export function recordFailure(
  phase: PipelinePhase,
  failureType: string,
  description: string,
  fix: string,
  topicHash?: string,
): void {
  failureMemory.push({
    id: `failure_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    phase,
    failureType,
    description,
    fix,
    timestamp: Date.now(),
    topicHash,
  });

  // Trim to max size (keep most recent)
  if (failureMemory.length > MAX_MEMORY_SIZE) {
    failureMemory.splice(0, failureMemory.length - MAX_MEMORY_SIZE);
  }
}

export function getRelevantFailures(phase: PipelinePhase, topicHash?: string): FailureRecord[] {
  return failureMemory.filter(f => {
    if (f.phase !== phase) return false;
    if (topicHash && f.topicHash && f.topicHash !== topicHash) return false;
    // Only consider failures from the last 24 hours
    return Date.now() - f.timestamp < 24 * 60 * 60 * 1000;
  });
}

export function getFailureMemorySize(): number {
  return failureMemory.length;
}
