/**
 * Process Reward Model (PRM) — NomosX
 *
 * Le Process Reward Model est le moat le plus profond du système.
 * Il apprend, à partir de chaque run, quels chemins de raisonnement
 * mènent à de bons résultats et lesquels mènent à des échecs.
 *
 * Inspiré de :
 * - OpenAI PRM (Process Reward Model, "Let's Verify Step by Step", 2023-2024)
 * - DeepMind step-level rewards (2024-2026)
 * - Math-Shepherd (automatic process annotation)
 *
 * Architecture :
 * 1. Chaque étape du pipeline reçoit un score de processus (0-1)
 * 2. Le score est basé sur des features extractibles + un LLM judge
 * 3. Les scores sont persistés et utilisés pour entraîner un modèle heuristique
 * 4. Les runs futurs utilisent le PRM pour :
 *    - Prédire la qualité d'un chemin avant de l'exécuter
 *    - Choisir entre plusieurs chemins (best-of-N)
 *    - Détecter tôt les chemins qui vont échouer
 *
 * Le moat : après des milliers de runs, le PRM contient une connaissance
 * propriétaire de "what good research reasoning looks like" que les
 * concurrents ne peuvent pas répliquer sans le même volume de données.
 */

import { callLLM } from '../../llm/unified-llm';
import { parseJson } from '../json-utils';
import { judgeForPRM } from '../local-judge';
import { prisma } from '../../db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProcessStep {
  /** Unique ID for this step */
  id: string;
  /** Which pipeline phase (scout, rank, reader, analyst, etc.) */
  phase: string;
  /** Which sub-step within the phase (e.g., "pass_1", "pass_2", "react_step_3") */
  subStep?: string;
  /** What the step did (description) */
  action: string;
  /** Output of the step (truncated) */
  output: string;
  /** Features extracted from the step */
  features: ProcessFeatures;
  /** The reward score (0-1) — assigned by the PRM */
  reward?: number;
  /** Whether this step led to a good final outcome */
  outcome?: 'good' | 'bad' | 'neutral';
  /** Run ID */
  runId: string;
  /** Timestamp */
  timestamp: number;
}

export interface ProcessFeatures {
  // Content features
  outputLength: number;
  citationCount: number;
  citationDensity: number; // citations per 1000 chars
  hasStructure: boolean; // has sections, bullet points, etc.
  hasHedging: boolean; // uses uncertainty language
  specificityScore: number; // 0-1, how specific vs generic

  // Process features
  stepIndex: number;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
  retryCount: number;
  toolCallsCount: number;

  // Quality signals
  selfEvaluationScore?: number; // from self-correction
  witnessHealthScore?: number; // from Witness
  contradictionDetected: boolean;
  evidenceGrounded: boolean; // claims backed by sources
}

export interface PRMPrediction {
  /** Predicted reward (0-1) */
  predictedReward: number;
  /** Confidence in the prediction (0-1) */
  confidence: number;
  /** Which features contributed most */
  topFeatures: Array<{ feature: string; contribution: number }>;
  /** Should this path be taken? */
  recommendation: 'proceed' | 'proceed_with_caution' | 'abort' | 'retry';
}

export interface PRMModel {
  /** Feature weights learned from past data */
  weights: Record<string, number>;
  /** Bias term */
  bias: number;
  /** Number of training examples */
  trainingExamples: number;
  /** Last updated */
  updatedAt: number;
  /** Average reward across all training examples */
  avgReward: number;
}

// ─── Feature Extraction ─────────────────────────────────────────────────────

/**
 * Extract process features from a pipeline step's output.
 * These features are the input to the PRM.
 */
export function extractFeatures(
  step: Omit<ProcessStep, 'features' | 'id'>,
): ProcessFeatures {
  const output = step.output || '';
  const outputLength = output.length;

  // Citation features
  const citationMatches = output.match(/\[SRC-\d+\]/g) || [];
  const citationCount = new Set(citationMatches).size;
  const citationDensity = outputLength > 0 ? (citationCount / outputLength) * 1000 : 0;

  // Structure features
  const hasStructure = /#{1,3}\s|^\s*[-•*]\s|\d+\.\s/m.test(output);
  const hasHedging = /\b(possibly|likely|may|might|could|uncertain|unclear|non établie|tentative|suggests?|appears?)\b/i.test(output);

  // Specificity: longer, more detailed outputs with numbers and proper nouns
  const numbers = (output.match(/\d+/g) || []).length;
  const properNouns = (output.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g) || []).length;
  const specificityScore = Math.min(1, (numbers * 0.05) + (properNouns * 0.03) + (outputLength > 500 ? 0.3 : outputLength / 1500));

  // Contradiction detection (simple heuristic)
  const contradictionDetected = /\b(contradict|conflict|inconsistent|disagree|however.*but|on the contrary)\b/i.test(output);

  // Evidence grounding
  const evidenceGrounded = citationCount > 0 && citationDensity > 2;

  return {
    outputLength,
    citationCount,
    citationDensity,
    hasStructure,
    hasHedging,
    specificityScore,
    stepIndex: step.subStep ? parseInt(step.subStep.replace(/\D/g, '')) || 0 : 0,
    tokensUsed: 0, // Filled by caller
    costUsd: 0, // Filled by caller
    durationMs: 0, // Filled by caller
    retryCount: 0, // Filled by caller
    toolCallsCount: 0, // Filled by caller
    contradictionDetected,
    evidenceGrounded,
  };
}

// ─── PRM Scoring ────────────────────────────────────────────────────────────

/**
 * Score a process step using the current PRM model.
 * This is a linear model: reward = sigmoid(weights · features + bias)
 */
export function scoreStep(
  features: ProcessFeatures,
  model: PRMModel,
): PRMPrediction {
  const featureVector = featuresToVector(features);

  // Compute weighted sum
  let sum = model.bias;
  const contributions: Array<{ feature: string; contribution: number }> = [];

  for (const [name, value] of Object.entries(featureVector)) {
    const weight = model.weights[name] || 0;
    const contribution = weight * value;
    sum += contribution;
    if (Math.abs(contribution) > 0.01) {
      contributions.push({ feature: name, contribution });
    }
  }

  // Sigmoid → 0-1
  const predictedReward = sigmoid(sum);

  // Confidence: higher with more training examples
  const confidence = Math.min(1, model.trainingExamples / 100);

  // Sort contributions by absolute value
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const topFeatures = contributions.slice(0, 5);

  // Recommendation
  let recommendation: PRMPrediction['recommendation'] = 'proceed';
  if (predictedReward < 0.3) recommendation = 'abort';
  else if (predictedReward < 0.5) recommendation = 'retry';
  else if (predictedReward < 0.65) recommendation = 'proceed_with_caution';

  return { predictedReward, confidence, topFeatures, recommendation };
}

// ─── LLM-based Scoring (for high-quality labels) ────────────────────────────

/**
 * Use an LLM to score a process step. This produces higher-quality labels
 * than the linear model, but costs money. Used for:
 * - Initial training data (cold start)
 * - Periodic re-labeling to calibrate the linear model
 */
export async function llmScoreStep(step: ProcessStep): Promise<number> {
  try {
    // Sprint 6: use open-source local judge for PRM labels when enabled
    if (process.env.ENABLE_LOCAL_JUDGE === 'true') {
      const { score } = await judgeForPRM(step.output);
      return score;
    }
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a Process Reward Model evaluator. Score the quality of this reasoning step on a scale of 0.0 to 1.0.

Consider:
- Is the output well-grounded in evidence? (citations present?)
- Is it specific or generic?
- Does it acknowledge uncertainty where appropriate?
- Is the reasoning sound?
- Does it advance the analysis?

Respond with JSON: {"score": 0.75, "reason": "brief explanation"}`,
        },
        {
          role: 'user',
          content: `Phase: ${step.phase}
Sub-step: ${step.subStep || 'main'}
Action: ${step.action}
Output (truncated): ${step.output.slice(0, 1000)}

Features:
- Citations: ${step.features.citationCount} (density: ${step.features.citationDensity.toFixed(1)}/1k chars)
- Specificity: ${step.features.specificityScore.toFixed(2)}
- Has hedging: ${step.features.hasHedging}
- Evidence grounded: ${step.features.evidenceGrounded}
- Contradiction detected: ${step.features.contradictionDetected}

Score this step:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 150,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ score: number; reason: string }>(response.content);
    if (parsed && typeof parsed.score === 'number') {
      return Math.max(0, Math.min(1, parsed.score));
    }
  } catch (err) {
    console.warn('[PRM] LLM scoring failed:', err);
  }
  return 0.5; // Default neutral score
}

// ─── Model Training ─────────────────────────────────────────────────────────

/**
 * Train the PRM model from accumulated step data.
 * Uses simple logistic regression (gradient descent) on the feature vectors.
 */
export function trainPRM(
  steps: ProcessStep[],
  options: { learningRate?: number; epochs?: number; l2Reg?: number } = {},
): PRMModel {
  const { learningRate = 0.01, epochs = 100, l2Reg = 0.001 } = options;

  // Initialize weights
  const featureNames = [
    'outputLength', 'citationCount', 'citationDensity', 'hasStructure',
    'hasHedging', 'specificityScore', 'stepIndex', 'tokensUsed',
    'costUsd', 'durationMs', 'retryCount', 'toolCallsCount',
    'contradictionDetected', 'evidenceGrounded', 'selfEvaluationScore',
    'witnessHealthScore',
  ];

  const weights: Record<string, number> = {};
  for (const name of featureNames) weights[name] = 0;
  let bias = 0;

  // Prepare training data
  const trainingData = steps
    .filter(s => s.reward !== undefined)
    .map(s => ({
      features: featuresToVector(s.features),
      label: s.reward!,
    }));

  if (trainingData.length === 0) {
    return {
      weights,
      bias,
      trainingExamples: 0,
      updatedAt: Date.now(),
      avgReward: 0.5,
    };
  }

  // Gradient descent
  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;

    for (const { features, label } of trainingData) {
      // Forward pass
      let sum = bias;
      for (const [name, value] of Object.entries(features)) {
        sum += (weights[name] || 0) * value;
      }
      const pred = sigmoid(sum);
      const error = pred - label;
      totalLoss += error * error;

      // Backward pass (gradient)
      const gradient = error * pred * (1 - pred);
      bias -= learningRate * gradient;
      for (const name of featureNames) {
        const value = features[name] || 0;
        // L2 regularization
        const regGrad = l2Reg * (weights[name] || 0);
        weights[name] -= learningRate * (gradient * value + regGrad);
      }
    }
  }

  const avgReward = trainingData.reduce((s, d) => s + d.label, 0) / trainingData.length;

  return {
    weights,
    bias,
    trainingExamples: trainingData.length,
    updatedAt: Date.now(),
    avgReward,
  };
}

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Persist a process step to the database for future training.
 */
export async function persistProcessStep(step: ProcessStep): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: 'prm',
        action: 'PROCESS_STEP',
        metadata: JSON.stringify({
          stepId: step.id,
          runId: step.runId,
          phase: step.phase,
          subStep: step.subStep,
          action: step.action,
          output: step.output.slice(0, 500),
          features: step.features,
          reward: step.reward,
          outcome: step.outcome,
          timestamp: step.timestamp,
        }),
      },
    });
  } catch (err) {
    console.warn('[PRM] Failed to persist step:', err);
  }
}

/**
 * Persist the trained PRM model.
 */
export async function persistPRMModel(model: PRMModel): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: 'prm',
        action: 'MODEL_UPDATE',
        metadata: JSON.stringify({
          weights: model.weights,
          bias: model.bias,
          trainingExamples: model.trainingExamples,
          avgReward: model.avgReward,
          updatedAt: model.updatedAt,
        }),
      },
    });
    console.log(`[PRM] Model persisted: ${model.trainingExamples} examples, avg reward ${model.avgReward.toFixed(3)}`);
  } catch (err) {
    console.warn('[PRM] Failed to persist model:', err);
  }
}

/**
 * Load the latest PRM model from the database.
 */
export async function loadPRMModel(): Promise<PRMModel | null> {
  try {
    const record = await prisma.agentAuditLog.findFirst({
      where: {
        agent: 'prm',
        action: 'MODEL_UPDATE',
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!record) return null;

    const meta = JSON.parse(record.metadata || '{}');
    return {
      weights: meta.weights || {},
      bias: meta.bias || 0,
      trainingExamples: meta.trainingExamples || 0,
      updatedAt: meta.updatedAt || Date.now(),
      avgReward: meta.avgReward || 0.5,
    };
  } catch (err) {
    console.warn('[PRM] Failed to load model:', err);
    return null;
  }
}

/**
 * Load process steps from the database for training.
 */
export async function loadProcessSteps(
  options: { lookbackDays?: number; maxSteps?: number } = {},
): Promise<ProcessStep[]> {
  const { lookbackDays = 30, maxSteps = 1000 } = options;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const records = await prisma.agentAuditLog.findMany({
      where: {
        agent: 'prm',
        action: 'PROCESS_STEP',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: maxSteps,
    });

    const steps: ProcessStep[] = [];
    for (const record of records) {
      try {
        const m = JSON.parse(record.metadata || '{}');
        steps.push({
          id: m.stepId,
          runId: m.runId,
          phase: m.phase,
          subStep: m.subStep,
          action: m.action,
          output: m.output || '',
          features: m.features,
          reward: m.reward,
          outcome: m.outcome,
          timestamp: m.timestamp,
        });
      } catch {}
    }
    return steps;
  } catch (err) {
    console.warn('[PRM] Failed to load steps:', err);
    return [];
  }
}

// ─── Best-of-N Selection ────────────────────────────────────────────────────

/**
 * Given multiple candidate paths, use the PRM to select the best one.
 * This is the "best-of-N" pattern from the PRM paper.
 */
export function selectBestPath(
  candidates: Array<{ steps: ProcessStep[]; label: string }>,
  model: PRMModel,
): { best: typeof candidates[0] | null; scores: Array<{ label: string; score: number }> } {
  if (candidates.length === 0) return { best: null, scores: [] };

  const scores = candidates.map(c => {
    const stepScores = c.steps.map(s => scoreStep(s.features, model).predictedReward);
    // Path score = average of step scores, weighted toward later steps
    const avgScore = stepScores.reduce((s, x) => s + x, 0) / stepScores.length;
    return { label: c.label, score: avgScore };
  });

  scores.sort((a, b) => b.score - a.score);
  const best = candidates.find(c => c.label === scores[0].label) || candidates[0];

  return { best, scores };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function featuresToVector(features: ProcessFeatures): Record<string, number> {
  return {
    outputLength: normalize(features.outputLength, 0, 5000),
    citationCount: normalize(features.citationCount, 0, 20),
    citationDensity: normalize(features.citationDensity, 0, 10),
    hasStructure: features.hasStructure ? 1 : 0,
    hasHedging: features.hasHedging ? 1 : 0,
    specificityScore: features.specificityScore,
    stepIndex: normalize(features.stepIndex, 0, 10),
    tokensUsed: normalize(features.tokensUsed, 0, 50000),
    costUsd: normalize(features.costUsd, 0, 1),
    durationMs: normalize(features.durationMs, 0, 300000),
    retryCount: normalize(features.retryCount, 0, 3),
    toolCallsCount: normalize(features.toolCallsCount, 0, 10),
    contradictionDetected: features.contradictionDetected ? 1 : 0,
    evidenceGrounded: features.evidenceGrounded ? 1 : 0,
    selfEvaluationScore: features.selfEvaluationScore ?? 0.5,
    witnessHealthScore: normalize(features.witnessHealthScore ?? 100, 0, 100),
  };
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function sigmoid(x: number): number {
  if (x < -500) return 0;
  if (x > 500) return 1;
  return 1 / (1 + Math.exp(-x));
}

// ─── Retrain Pipeline ───────────────────────────────────────────────────────

/**
 * Retrain the PRM model from accumulated data.
 * Called periodically (e.g., after every 10 runs) or on demand.
 */
export async function retrainPRM(): Promise<PRMModel | null> {
  console.log('[PRM] Retraining from accumulated data...');

  const steps = await loadProcessSteps({ lookbackDays: 30, maxSteps: 2000 });

  if (steps.filter(s => s.reward !== undefined).length < 10) {
    console.log('[PRM] Not enough labeled data for retraining');
    return null;
  }

  const model = trainPRM(steps);
  await persistPRMModel(model);

  console.log(`[PRM] Retrained: ${model.trainingExamples} examples, avg reward ${model.avgReward.toFixed(3)}`);

  // Log top features
  const topWeights = Object.entries(model.weights)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5);
  console.log('[PRM] Top feature weights:');
  for (const [name, weight] of topWeights) {
    console.log(`  ${name}: ${weight.toFixed(4)}`);
  }

  return model;
}
