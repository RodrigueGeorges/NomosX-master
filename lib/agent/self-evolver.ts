/**
 * SELF-EVOLVER — NomosX
 *
 * Agent autonome qui ameliore ses propres prompts a partir des experiences passees.
 * Inspiration : HyperAgents, SePO, FAPO, Karpathy autoresearch, EvoTool, canvas-org/meta-agent.
 *
 * Principe : apres chaque run, le Self-Evolver :
 * 1. collecte les lecons et echecs
 * 2. propose une mutation ciblee du prompt system
 * 3. evalue l'ancien vs le nouveau via un juge
 * 4. garde le meilleur et versionne
 *
 * Le modele reste gele ; seul le texte du prompt evolue.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { prisma } from '../db';
import { buildMemoryInjection } from './agent-memory';
import { optimizePrompt, segmentPrompt, DEFAULT_GMPO_CONFIG, type OptimizationResult } from './gmpo-optimizer';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptVersion {
  version: number;
  prompt: string;
  score: number;
  source: 'manual' | 'evolved' | 'witness';
  createdAt: Date;
  lessons: string[];
}

export interface EvolutionResult {
  agentId: string;
  improved: boolean;
  newVersion?: PromptVersion;
  previousBest?: PromptVersion;
  delta: number;
  costUsd: number;
}

export interface EvolverConfig {
  minRunsBeforeEvolve: number;
  lookbackRuns: number;
  minLessonSignal: number; // 0-1
  maxMutationsPerRun: number;
  testCases: string[];
  judgeTask?: string;
}

// ─── In-memory cache for latest prompt per agent ─────────────────────────────

const latestPromptCache: Record<string, PromptVersion> = {};

// ─── Collect lessons and failures ───────────────────────────────────────────

export async function collectEvolutionSignal(
  agentId: string,
  lookback: number = 50,
): Promise<{ lessons: string[]; avgTrust: number; failurePatterns: Record<string, number> }> {
  const logs = await prisma.agentAuditLog.findMany({
    where: {
      agent: agentId,
      action: { in: ['LESSON_LEARNED', 'SELF_CORRECTION', 'HUMAN_CORRECTION', 'WITNESS_INTERVENTION'] },
    },
    orderBy: { timestamp: 'desc' },
    take: lookback,
  });

  const lessons: string[] = [];
  const patterns: Record<string, number> = {};
  let totalTrust = 0;
  let trustCount = 0;

  for (const log of logs) {
    const meta = JSON.parse(log.metadata || '{}');
    if (log.action === 'LESSON_LEARNED' && meta.lesson) {
      lessons.push(meta.lesson);
    }
    if (log.action === 'SELF_CORRECTION' && meta.failureMode) {
      patterns[meta.failureMode] = (patterns[meta.failureMode] || 0) + 1;
    }
    if (log.action === 'HUMAN_CORRECTION' && meta.correctionType) {
      patterns[meta.correctionType] = (patterns[meta.correctionType] || 0) + 1;
    }
    if (typeof meta.trustScore === 'number') {
      totalTrust += meta.trustScore;
      trustCount++;
    }
  }

  return {
    lessons,
    avgTrust: trustCount > 0 ? totalTrust / trustCount : 50,
    failurePatterns: patterns,
  };
}

// ─── Propose a targeted prompt mutation ─────────────────────────────────────

export async function proposePromptMutation(
  agentId: string,
  currentPrompt: string,
  signal: { lessons: string[]; avgTrust: number; failurePatterns: Record<string, number> },
): Promise<{ prompt: string; rationale: string } | null> {
  if (signal.lessons.length === 0) return null;

  const failureText = Object.entries(signal.failurePatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are a prompt engineer for an autonomous think-tank agent. Given a system prompt, past lessons and failure patterns, propose a single targeted improvement. Return JSON only.',
      },
      {
        role: 'user',
        content: `AGENT: ${agentId}\n\nCURRENT PROMPT:\n${currentPrompt.slice(0, 4000)}\n\nPAST LESSONS:\n${signal.lessons.slice(0, 10).map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\nFAILURE PATTERNS:\n${failureText}\n\nAVG TRUST: ${signal.avgTrust.toFixed(1)}/100\n\nTASK: Return JSON:\n{\n  "prompt": "complete rewritten system prompt",\n  "rationale": "what changed and why"\n}\n\nRules:\n- Make ONE targeted change\n- Do not remove core instructions\n- Keep the prompt under 3500 chars\n- Be specific, not generic`,
      },
    ],
    task: 'enrichment_reasoner',
    temperature: 0.4,
    maxTokens: 3000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<{ prompt: string; rationale: string }>(response.content);
  if (!parsed) return null;

  return {
    prompt: parsed.prompt,
    rationale: parsed.rationale,
  };
}

// ─── Evaluate a prompt variant (placeholder — can be expensive) ───────────────

export async function scorePromptVariant(
  _agentId: string,
  prompt: string,
  testCases: string[],
): Promise<number> {
  // Lightweight proxy: ask the LLM to score the prompt's robustness on test cases
  // In production, this should run the actual pipeline on a golden set.
  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'Score the following system prompt on a 0-100 scale for robustness, clarity, and task fit. Return only a JSON {"score": number}.',
      },
      {
        role: 'user',
        content: `TEST CASES:\n${testCases.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nPROMPT:\n${prompt.slice(0, 2000)}\n\nReturn JSON: {"score": 0-100}`,
      },
    ],
    task: 'critique',
    temperature: 0.2,
    maxTokens: 200,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<{ score: number }>(response.content);
  return parsed ? Math.max(0, Math.min(100, parsed.score)) : 50;
}

// ─── Version store ───────────────────────────────────────────────────────────

async function loadLatestFromDB(agentId: string): Promise<PromptVersion | null> {
  const rows = await prisma.agentAuditLog.findMany({
    where: { agent: agentId, action: 'PROMPT_VERSION' },
    orderBy: { timestamp: 'desc' },
    take: 1,
  });
  if (rows.length === 0) return null;
  const meta = JSON.parse(rows[0].metadata || '{}');
  return {
    version: meta.version || 1,
    prompt: meta.prompt || '',
    score: meta.score || 0,
    source: meta.source || 'manual',
    createdAt: rows[0].timestamp,
    lessons: meta.lessons || [],
  };
}

async function saveVersionToDB(version: PromptVersion & { agentId: string }): Promise<void> {
  await prisma.agentAuditLog.create({
    data: {
      agent: version.agentId,
      resource: 'self-evolver',
      action: 'PROMPT_VERSION',
      metadata: JSON.stringify({
        version: version.version,
        prompt: version.prompt,
        score: version.score,
        source: version.source,
        lessons: version.lessons,
      }),
    },
  });
}

// ─── Main evolution entry point ─────────────────────────────────────────────

export async function evolveAgentPrompt(
  agentId: string,
  currentPrompt: string,
  config: Partial<EvolverConfig> = {},
): Promise<EvolutionResult> {
  const fullConfig: EvolverConfig = {
    minRunsBeforeEvolve: 5,
    lookbackRuns: 50,
    minLessonSignal: 0.3,
    maxMutationsPerRun: 1,
    testCases: ['How do carbon border adjustments interact with AI supply chain automation?'],
    ...config,
  };

  const signal = await collectEvolutionSignal(agentId, fullConfig.lookbackRuns);

  // Not enough signal
  const lessonSignal = signal.lessons.length / fullConfig.lookbackRuns;
  if (lessonSignal < fullConfig.minLessonSignal || signal.lessons.length === 0) {
    return { agentId, improved: false, delta: 0, costUsd: 0 };
  }

  const existing = await loadLatestFromDB(agentId);
  const currentVersion: PromptVersion = existing || {
    version: 1,
    prompt: currentPrompt,
    score: signal.avgTrust,
    source: 'manual',
    createdAt: new Date(),
    lessons: [],
  };

  const mutation = await proposePromptMutation(agentId, currentVersion.prompt, signal);
  if (!mutation) {
    return { agentId, improved: false, delta: 0, costUsd: 0 };
  }

  // Score both variants
  const [oldScore, newScore] = await Promise.all([
    scorePromptVariant(agentId, currentVersion.prompt, fullConfig.testCases),
    scorePromptVariant(agentId, mutation.prompt, fullConfig.testCases),
  ]);

  const costUsd = 0; // tracked by unified-llm internally

  if (newScore > oldScore * 1.05) {
    const newVersion: PromptVersion = {
      version: currentVersion.version + 1,
      prompt: mutation.prompt,
      score: newScore,
      source: 'evolved',
      createdAt: new Date(),
      lessons: signal.lessons.slice(0, 10),
    };
    await saveVersionToDB({ ...newVersion, agentId });
    latestPromptCache[agentId] = newVersion;

    return {
      agentId,
      improved: true,
      newVersion,
      previousBest: currentVersion,
      delta: newScore - oldScore,
      costUsd,
    };
  }

  return {
    agentId,
    improved: false,
    previousBest: currentVersion,
    delta: newScore - oldScore,
    costUsd,
  };
}

// ─── Retrieve latest evolved prompt ──────────────────────────────────────────

export async function getLatestPrompt(agentId: string, fallbackPrompt: string): Promise<string> {
  if (latestPromptCache[agentId]) return latestPromptCache[agentId].prompt;
  const fromDB = await loadLatestFromDB(agentId);
  if (fromDB) {
    latestPromptCache[agentId] = fromDB;
    return fromDB.prompt;
  }
  return fallbackPrompt;
}

// ─── Run evolution for a list of agents after pipeline completion ─────────────

export async function runEvolutionCycle(
  agentIds: string[],
  getFallbackPrompt: (id: string) => string,
): Promise<EvolutionResult[]> {
  // K13: MAGE — initialize co-evolutionary knowledge graph
  const mageState = createMAGEState();
  const results: EvolutionResult[] = [];
  for (const agentId of agentIds) {
    const fallback = getFallbackPrompt(agentId);
    try {
      // S18: Use agentic evolution (ReASearch+OEO) as primary, fall back to scripted
      const result = await evolveAgentPromptAgentic(agentId, fallback).catch(() =>
        evolveAgentPrompt(agentId, fallback),
      );
      if (result.improved) {
        console.log(`[SelfEvolver] ${agentId} improved by ${result.delta.toFixed(1)} points to v${result.newVersion!.version}`);
        // K13: Record successful evolution in MAGE
        runMAGEEvolutionCycle(mageState, agentId, 'prompt_evolution', {
          success: true,
          quality: result.newVersion!.score / 100,
          successTrace: `Improved prompt v${result.newVersion!.version}: ${result.newVersion!.lessons.join('; ').slice(0, 100)}`,
          skillUsed: 'prompt_mutation',
          performance: result.newVersion!.score / 100,
        }).catch(() => {}); // Non-blocking
      } else {
        // K13: Record failed evolution attempt
        runMAGEEvolutionCycle(mageState, agentId, 'prompt_evolution', {
          success: false,
          quality: result.delta / 100,
          failureCorrection: `No improvement for ${agentId} (delta=${result.delta.toFixed(1)})`,
          skillUsed: 'prompt_mutation',
          performance: 0.5,
        }).catch(() => {});
      }
      results.push(result);
    } catch (err) {
      console.warn(`[SelfEvolver] ${agentId} evolution failed:`, err);
      results.push({ agentId, improved: false, delta: 0, costUsd: 0 });
    }
  }
  // K13: Log MAGE state summary
  const curriculumRecs = getMAGECurriculumRecommendations(mageState);
  if (curriculumRecs.length > 0) {
    console.log(`[SelfEvolver K13] MAGE: ${mageState.experience.length} experiences, ${mageState.skills.length} skills, ${curriculumRecs.length} task types need practice`);
  }
  return results;
}

// ============================================================================
// K13: MAGE — Multi-Agent Graph-guided Evolution with Co-Evolutionary KG
// arXiv 2026 — "Multi-Agent Self-Evolution with Co-Evolutionary Knowledge Graphs"
// ============================================================================
//
// MAGE externalizes self-knowledge into a four-subgraph co-evolutionary
// knowledge graph (EVOKG):
//
//   1. Experience subgraph: teacher-written failure corrections + learner's
//      own past correct reasoning traces, retrieved as task-conditioned guidance.
//
//   2. Skill subgraph: maps task types to effective strategies (a task-level
//      search bandit).
//
//   3. Curriculum subgraph: tracks which task types have been mastered and
//      which need more practice (bounded curriculum coverage).
//
//   4. Performance subgraph: tracks agent performance metrics over time,
//      used for routing and weight updates.
//
// During evolution, the graph, a task-level search bandit, and a skill-level
// routing bandit are updated from the same reward stream, while the learner's
// backbone remains unchanged.
//
// Result (paper): strong performance across 9 benchmarks with frozen backbone.

export type MagesubgraphType = 'experience' | 'skill' | 'curriculum' | 'performance';

export interface MAGEExperienceNode {
  id: string;
  /** The failure correction or success trace */
  content: string;
  /** Whether this is a correction (failure) or a success trace */
  type: 'correction' | 'success_trace';
  /** The task that generated this experience */
  taskType: string;
  /** The agent that produced this */
  agentId: string;
  /** Quality score (0-1) */
  quality: number;
  /** When this was recorded */
  timestamp: number;
}

export interface MAGESkillNode {
  id: string;
  /** The skill/strategy description */
  skill: string;
  /** Task types this skill is effective for */
  taskTypes: string[];
  /** Number of times this skill was used */
  useCount: number;
  /** Success rate when using this skill */
  successRate: number;
  /** Bandit value (UCB1-style) */
  ucbValue: number;
}

export interface MAGECurriculumNode {
  id: string;
  /** The task type */
  taskType: string;
  /** Mastery level (0-1) */
  mastery: number;
  /** Number of attempts */
  attempts: number;
  /** Number of successes */
  successes: number;
  /** Whether this task type needs more practice */
  needsPractice: boolean;
}

export interface MAGEPerformanceNode {
  id: string;
  /** Agent ID */
  agentId: string;
  /** Performance score (0-1) */
  performance: number;
  /** Timestamp */
  timestamp: number;
  /** Task type */
  taskType: string;
}

export interface MAGEState {
  experience: MAGEExperienceNode[];
  skills: MAGESkillNode[];
  curriculum: MAGECurriculumNode[];
  performance: MAGEPerformanceNode[];
  /** UCB1 exploration constant for the skill bandit */
  explorationConstant: number;
  /** Maximum nodes per subgraph */
  maxNodesPerSubgraph: number;
}

/**
 * Create a new MAGE state.
 */
export function createMAGEState(
  explorationConstant: number = 1.414,
  maxNodesPerSubgraph: number = 50,
): MAGEState {
  return {
    experience: [],
    skills: [],
    curriculum: [],
    performance: [],
    explorationConstant,
    maxNodesPerSubgraph,
  };
}

/**
 * Record an experience (failure correction or success trace) in the experience subgraph.
 */
export function recordMAGEExperience(
  state: MAGEState,
  content: string,
  type: 'correction' | 'success_trace',
  taskType: string,
  agentId: string,
  quality: number,
): void {
  state.experience.push({
    id: `exp_${state.experience.length}_${Date.now()}`,
    content,
    type,
    taskType,
    agentId,
    quality,
    timestamp: Date.now(),
  });

  // LRU eviction: keep highest-quality experiences
  state.experience.sort((a, b) => b.quality - a.quality);
  if (state.experience.length > state.maxNodesPerSubgraph) {
    state.experience = state.experience.slice(0, state.maxNodesPerSubgraph);
  }
}

/**
 * Select a skill using UCB1 bandit (task-level search bandit).
 */
export function selectMAGESkill(
  state: MAGEState,
  taskType: string,
): MAGESkillNode | null {
  const relevantSkills = state.skills.filter(s => s.taskTypes.includes(taskType));
  if (relevantSkills.length === 0) return null;

  const totalPulls = relevantSkills.reduce((s, skill) => s + skill.useCount, 0);
  if (totalPulls === 0) return relevantSkills[0];

  // UCB1: Q(s) + c * sqrt(ln(N) / n_s)
  for (const skill of relevantSkills) {
    if (skill.useCount === 0) {
      skill.ucbValue = Infinity;
    } else {
      const avgReward = skill.successRate;
      const exploration = state.explorationConstant * Math.sqrt(Math.log(totalPulls) / skill.useCount);
      skill.ucbValue = avgReward + exploration;
    }
  }

  relevantSkills.sort((a, b) => b.ucbValue - a.ucbValue);
  return relevantSkills[0];
}

/**
 * Update a skill's statistics after use (skill-level routing bandit update).
 */
export function updateMAGESkill(
  state: MAGEState,
  skillId: string,
  success: boolean,
): void {
  const skill = state.skills.find(s => s.id === skillId);
  if (!skill) return;

  skill.useCount++;
  skill.successRate = (skill.successRate * (skill.useCount - 1) + (success ? 1 : 0)) / skill.useCount;
}

/**
 * Update curriculum mastery for a task type.
 */
export function updateMAGECurriculum(
  state: MAGEState,
  taskType: string,
  success: boolean,
): void {
  let node = state.curriculum.find(c => c.taskType === taskType);
  if (!node) {
    node = {
      id: `curr_${state.curriculum.length}_${Date.now()}`,
      taskType,
      mastery: 0,
      attempts: 0,
      successes: 0,
      needsPractice: true,
    };
    state.curriculum.push(node);
  }

  node.attempts++;
  node.successes += success ? 1 : 0;
  node.mastery = node.successes / node.attempts;
  node.needsPractice = node.mastery < 0.7 || node.attempts < 5;
}

/**
 * Record a performance data point.
 */
export function recordMAGEPerformance(
  state: MAGEState,
  agentId: string,
  performance: number,
  taskType: string,
): void {
  state.performance.push({
    id: `perf_${state.performance.length}_${Date.now()}`,
    agentId,
    performance,
    timestamp: Date.now(),
    taskType,
  });

  // Keep only recent performance data
  if (state.performance.length > state.maxNodesPerSubgraph) {
    state.performance = state.performance.slice(-state.maxNodesPerSubgraph);
  }
}

/**
 * Retrieve relevant experience for a task (task-conditioned guidance).
 */
export function retrieveMAGEExperience(
  state: MAGEState,
  taskType: string,
  topK: number = 3,
): MAGEExperienceNode[] {
  return state.experience
    .filter(e => e.taskType === taskType)
    .sort((a, b) => b.quality - a.quality)
    .slice(0, topK);
}

/**
 * Get curriculum recommendations: which task types need more practice.
 */
export function getMAGECurriculumRecommendations(state: MAGEState): MAGECurriculumNode[] {
  return state.curriculum
    .filter(c => c.needsPractice)
    .sort((a, b) => a.mastery - b.mastery);
}

/**
 * Build a MAGE injection for the agent's prompt.
 * Includes relevant experience, selected skill, and curriculum context.
 */
export function buildMAGEInjection(
  state: MAGEState,
  taskType: string,
  agentId: string,
): string {
  const parts: string[] = [];

  // 1. Retrieve relevant experience
  const experiences = retrieveMAGEExperience(state, taskType, 3);
  if (experiences.length > 0) {
    parts.push('=== PAST EXPERIENCE (from co-evolutionary KG) ===');
    for (const exp of experiences) {
      const label = exp.type === 'correction' ? '⚠️ PAST FAILURE' : '✅ PAST SUCCESS';
      parts.push(`- ${label}: ${exp.content.slice(0, 120)}`);
    }
    parts.push('=== END EXPERIENCE ===');
  }

  // 2. Select a skill via UCB1 bandit
  const skill = selectMAGESkill(state, taskType);
  if (skill) {
    parts.push(`=== RECOMMENDED SKILL (UCB1 bandit, ${(skill.successRate * 100).toFixed(0)}% success) ===`);
    parts.push(skill.skill.slice(0, 150));
    parts.push('=== END SKILL ===');
  }

  // 3. Curriculum context
  const curriculum = state.curriculum.find(c => c.taskType === taskType);
  if (curriculum) {
    parts.push(`=== MASTERY LEVEL: ${(curriculum.mastery * 100).toFixed(0)}% (${curriculum.attempts} attempts) ===`);
    if (curriculum.needsPractice) {
      parts.push('Note: This task type needs more practice — be extra careful.');
    }
    parts.push('=== END MASTERY ===');
  }

  return parts.length > 0 ? `\n${parts.join('\n')}\n` : '';
}

/**
 * Run a full MAGE evolution cycle: update all four subgraphs from a run's outcome.
 */
export async function runMAGEEvolutionCycle(
  state: MAGEState,
  agentId: string,
  taskType: string,
  outcome: {
    success: boolean;
    quality: number;
    failureCorrection?: string;
    successTrace?: string;
    skillUsed?: string;
    performance: number;
  },
): Promise<void> {
  // 1. Record experience
  if (outcome.failureCorrection && !outcome.success) {
    recordMAGEExperience(state, outcome.failureCorrection, 'correction', taskType, agentId, outcome.quality);
  }
  if (outcome.successTrace && outcome.success) {
    recordMAGEExperience(state, outcome.successTrace, 'success_trace', taskType, agentId, outcome.quality);
  }

  // 2. Update skill
  if (outcome.skillUsed) {
    const skill = state.skills.find(s => s.skill === outcome.skillUsed);
    if (skill) {
      updateMAGESkill(state, skill.id, outcome.success);
    } else {
      // Register new skill
      state.skills.push({
        id: `skill_${state.skills.length}_${Date.now()}`,
        skill: outcome.skillUsed,
        taskTypes: [taskType],
        useCount: 1,
        successRate: outcome.success ? 1 : 0,
        ucbValue: outcome.success ? 1 : 0,
      });
    }
  }

  // 3. Update curriculum
  updateMAGECurriculum(state, taskType, outcome.success);

  // 4. Record performance
  recordMAGEPerformance(state, agentId, outcome.performance, taskType);

  console.log(`[MAGE] Evolution cycle: ${agentId}/${taskType} — success=${outcome.success}, quality=${outcome.quality.toFixed(2)}`);
}

// ============================================================================
// S18: ReASearch + OEO — Agentic Self-Optimization
// arXiv 2608.06714 (ReASearch) + arXiv 2608.09629 (OEO)
// ============================================================================
//
// ReASearch: The agent internalizes the search optimization logic instead of
// an outer-loop controller. The agent decides WHAT to optimize and HOW.
//
// OEO (Open-Ended Optimization): The model composes its own improvement
// process. Instead of fixed mutation strategies, the agent proposes its own
// optimization trajectory based on self-assessment.
//
// Together: the evolution process itself becomes agentic rather than scripted.
// The agent chooses from 6 strategies, self-reflects on results, and adapts
// its optimization approach over time.

export type OptimizationStrategy =
  | 'targeted_mutation'    // Fix a specific failure pattern
  | 'expansion'            // Add instructions for uncovered scenarios
  | 'compression'          // Remove redundancy to reduce prompt length
  | 'restructuring'        // Reorganize for clarity
  | 'example_injection'    // Add few-shot examples from past failures
  | 'constraint_relaxation'; // Relax overly strict constraints

export interface AgenticEvolutionState {
  agentId: string;
  iteration: number;
  exploredStrategies: OptimizationStrategy[];
  strategyPerformance: Record<OptimizationStrategy, { attempts: number; successes: number; avgDelta: number }>;
  stagnationCount: number;
  bestScore: number;
}

const STRATEGY_DESCRIPTIONS: Record<OptimizationStrategy, string> = {
  targeted_mutation: 'Fix a specific failure pattern by modifying the relevant instruction',
  expansion: 'Add new instructions for scenarios not covered by the current prompt',
  compression: 'Remove redundant or verbose instructions to reduce prompt length and token cost',
  restructuring: 'Reorganize the prompt structure for clarity and logical flow',
  example_injection: 'Add few-shot examples from past failures to guide the model',
  constraint_relaxation: 'Relax overly strict constraints that cause unnecessary failures',
};

const ALL_STRATEGIES: OptimizationStrategy[] = [
  'targeted_mutation', 'expansion', 'compression', 'restructuring', 'example_injection', 'constraint_relaxation',
];

async function chooseOptimizationStrategy(
  agentId: string,
  currentPrompt: string,
  signal: { lessons: string[]; avgTrust: number; failurePatterns: Record<string, number> },
  state: AgenticEvolutionState,
): Promise<OptimizationStrategy> {
  const unexplored = ALL_STRATEGIES.filter(s => !state.exploredStrategies.includes(s));
  if (unexplored.length > 0) {
    return unexplored[0];
  }

  const topFailures = Object.entries(signal.failurePatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const promptLength = currentPrompt.length;
  const hasFewShots = currentPrompt.toLowerCase().includes('example') || currentPrompt.toLowerCase().includes('e.g.');

  const candidates: OptimizationStrategy[] = [];
  if (topFailures.length > 0) candidates.push('targeted_mutation');
  if (promptLength > 3000) candidates.push('compression');
  if (promptLength < 1500) candidates.push('expansion');
  if (!hasFewShots && signal.lessons.length > 3) candidates.push('example_injection');
  if (state.stagnationCount > 2) candidates.push('restructuring');
  candidates.push('constraint_relaxation');

  const perfScores = candidates.map(s => {
    const perf = state.strategyPerformance[s];
    if (!perf || perf.attempts === 0) return { strategy: s, score: 0.5 };
    const successRate = perf.successes / perf.attempts;
    const explorationBonus = Math.sqrt(2 * Math.log(state.iteration + 1) / perf.attempts);
    return { strategy: s, score: successRate + 0.3 * explorationBonus };
  });
  perfScores.sort((a, b) => b.score - a.score);
  return perfScores[0].strategy;
}

async function executeStrategy(
  strategy: OptimizationStrategy,
  agentId: string,
  currentPrompt: string,
  signal: { lessons: string[]; avgTrust: number; failurePatterns: Record<string, number> },
): Promise<{ prompt: string; rationale: string } | null> {
  const failureText = Object.entries(signal.failurePatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const strategyDesc = STRATEGY_DESCRIPTIONS[strategy];
  const lessonsText = signal.lessons.slice(0, 10).map((l, i) => `${i + 1}. ${l}`).join('\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are an expert prompt engineer for an autonomous think-tank agent. You will apply a specific optimization strategy to improve the agent's system prompt. Return JSON only.`,
      },
      {
        role: 'user',
        content: `AGENT: ${agentId}

OPTIMIZATION STRATEGY: ${strategy}
DESCRIPTION: ${strategyDesc}

CURRENT PROMPT (${currentPrompt.length} chars):
${currentPrompt.slice(0, 4000)}

PAST LESSONS:
${lessonsText}

FAILURE PATTERNS:
${failureText}

AVG TRUST: ${signal.avgTrust.toFixed(1)}/100

TASK: Apply the "${strategy}" strategy to improve this prompt. Return JSON:
{
  "prompt": "complete rewritten system prompt",
  "rationale": "what changed and why this strategy was effective"
}

Rules:
- Apply ONLY the specified strategy
- Do not remove core instructions
- Keep the prompt under 3500 chars
- Be specific about what you changed`,
      },
    ],
    task: 'enrichment_reasoner',
    temperature: 0.4,
    maxTokens: 3000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<{ prompt: string; rationale: string }>(response.content);
  if (!parsed) return null;
  return { prompt: parsed.prompt, rationale: parsed.rationale };
}

export async function evolveAgentPromptAgentic(
  agentId: string,
  currentPrompt: string,
  config: Partial<EvolverConfig> = {},
): Promise<EvolutionResult> {
  const fullConfig: EvolverConfig = {
    minRunsBeforeEvolve: 5,
    lookbackRuns: 50,
    minLessonSignal: 0.3,
    maxMutationsPerRun: 1,
    testCases: ['How do carbon border adjustments interact with AI supply chain automation?'],
    ...config,
  };

  const signal = await collectEvolutionSignal(agentId, fullConfig.lookbackRuns);
  const lessonSignal = signal.lessons.length / fullConfig.lookbackRuns;
  if (lessonSignal < fullConfig.minLessonSignal || signal.lessons.length === 0) {
    return { agentId, improved: false, delta: 0, costUsd: 0 };
  }

  const existing = await loadLatestFromDB(agentId);
  const currentVersion: PromptVersion = existing || {
    version: 1,
    prompt: currentPrompt,
    score: signal.avgTrust,
    source: 'manual',
    createdAt: new Date(),
    lessons: [],
  };

  const state: AgenticEvolutionState = {
    agentId,
    iteration: existing?.version ?? 1,
    exploredStrategies: [],
    strategyPerformance: {} as Record<OptimizationStrategy, { attempts: number; successes: number; avgDelta: number }>,
    stagnationCount: 0,
    bestScore: currentVersion.score,
  };

  const strategy = await chooseOptimizationStrategy(agentId, currentVersion.prompt, signal, state);
  const mutation = await executeStrategy(strategy, agentId, currentVersion.prompt, signal);
  if (!mutation) {
    return { agentId, improved: false, delta: 0, costUsd: 0 };
  }

  const [oldScore, newScore] = await Promise.all([
    scorePromptVariant(agentId, currentVersion.prompt, fullConfig.testCases),
    scorePromptVariant(agentId, mutation.prompt, fullConfig.testCases),
  ]);

  const costUsd = 0;
  const improved = newScore > oldScore * 1.05;

  if (!state.exploredStrategies.includes(strategy)) {
    state.exploredStrategies.push(strategy);
  }
  const perf = state.strategyPerformance[strategy] || { attempts: 0, successes: 0, avgDelta: 0 };
  perf.attempts++;
  if (improved) perf.successes++;
  perf.avgDelta = (perf.avgDelta * (perf.attempts - 1) + (newScore - oldScore)) / perf.attempts;
  state.strategyPerformance[strategy] = perf;

  if (improved) {
    const newVersion: PromptVersion = {
      version: currentVersion.version + 1,
      prompt: mutation.prompt,
      score: newScore,
      source: 'evolved',
      createdAt: new Date(),
      lessons: signal.lessons.slice(0, 10),
    };
    await saveVersionToDB({ ...newVersion, agentId });
    latestPromptCache[agentId] = newVersion;

    console.log(`[SelfEvolver/ReASearch+OEO] ${agentId} improved via ${strategy}: +${(newScore - oldScore).toFixed(1)} points to v${newVersion.version}`);

    return {
      agentId,
      improved: true,
      newVersion,
      previousBest: currentVersion,
      delta: newScore - oldScore,
      costUsd,
    };
  }

  return {
    agentId,
    improved: false,
    previousBest: currentVersion,
    delta: newScore - oldScore,
    costUsd,
  };
}

// ============================================================================
// S16-08: GMPO — Gradient-Guided Multi-Judge Prompt Optimization
// ============================================================================

/**
 * Optimize an agent prompt using GMPO (Gradient-guided Multi-Judge Prompt
 * Optimization). Segments the prompt, approximates per-segment importance,
 * and iteratively proposes edits selected by a multi-judge panel.
 *
 * @param prompt - The current system prompt to optimize
 * @param input - A representative task input
 * @param output - A representative expected output
 * @param evaluateFn - Function that evaluates a (prompt, input) pair and
 *   returns a quality score (0-1) and cost in USD
 * @returns The optimization result with the improved prompt and diagnostics
 */
export async function optimizeAgentPrompt(
  prompt: string,
  input: string,
  output: string,
  evaluateFn: (prompt: string, input: string) => Promise<{ quality: number; cost: number }>,
): Promise<OptimizationResult> {
  console.log(`[SelfEvolver] GMPO prompt optimization starting...`);
  const result = await optimizePrompt(prompt, input, output, evaluateFn, DEFAULT_GMPO_CONFIG);
  console.log(
    `[SelfEvolver] GMPO complete: improvement=${result.improvementScore.toFixed(2)}, cost=$${result.costUsd.toFixed(4)}`,
  );
  return result;
}

/**
 * Run GMPO optimization for a single agent end-to-end: load its current prompt,
 * optimize against representative test cases, persist the improved version.
 * Returns null if there's not enough signal or no improvement.
 */
export async function runGMPOForAgent(
  agentId: string,
  fallbackPrompt: string,
  testCases: string[],
): Promise<{ improved: boolean; newVersion?: PromptVersion; improvementScore: number; costUsd: number }> {
  const currentPrompt = await getLatestPrompt(agentId, fallbackPrompt);

  // Representative input/output pair for evaluation
  const input = testCases[0] || 'Summarize the key drivers of the topic.';
  const output = 'A rigorous, well-cited analytical response.';

  // evaluateFn: score the candidate prompt on the test input via LLM judge
  const evaluateFn = async (prompt: string, inp: string) => {
    const score = await scorePromptVariant(agentId, prompt, [inp]);
    return { quality: score / 100, cost: 0.002 };
  };

  const result = await optimizeAgentPrompt(currentPrompt, input, output, evaluateFn);

  if (result.improvementScore <= 0) {
    return { improved: false, improvementScore: 0, costUsd: result.costUsd };
  }

  // Persist the optimized prompt as a new version
  const existing = await loadLatestFromDB(agentId);
  const nextVersion = (existing?.version ?? 0) + 1;
  const newVersion: PromptVersion & { agentId: string } = {
    agentId,
    version: nextVersion,
    prompt: result.optimizedPrompt,
    score: Math.round(result.improvementScore * 100),
    source: 'evolved',
    createdAt: new Date(),
    lessons: [`GMPO optimization: +${(result.improvementScore * 100).toFixed(0)}pts quality`],
  };
  await saveVersionToDB(newVersion);
  latestPromptCache[agentId] = newVersion;

  console.log(`[SelfEvolver] GMPO: ${agentId} prompt v${nextVersion} saved (+${(result.improvementScore * 100).toFixed(0)}pts)`);
  return { improved: true, newVersion, improvementScore: result.improvementScore, costUsd: result.costUsd };
}
