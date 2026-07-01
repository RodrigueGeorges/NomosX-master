/**
 * NomosX RESEARCHER IDENTITY — Persistent Intellectual Personas
 *
 * Each PhD researcher is not a stateless prompt — they are an intellectual
 * entity with a history of positions, a track record of predictions, and
 * the ability to evolve their views based on new evidence.
 *
 * This is what makes NomosX publications genuinely superior:
 * Dr. Vasquez has published 23 analyses. She predicted in March that carbon
 * taxes would underperform in high-inequality contexts. New evidence confirms
 * this. She now cites her own prior work and updates her position.
 *
 * Features:
 * 1. POSITION HISTORY — track each expert's past stances on key topics
 * 2. PREDICTION TRACKING — did their predictions come true?
 * 3. INTELLECTUAL EVOLUTION — detect when a researcher should update their view
 * 4. CROSS-ANALYSIS COHERENCE — ensure consistency across publications
 * 5. DISSENT MEMORY — remember where each expert disagreed with consensus
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { embedText, cosineSimilarity } from './semantic-engine';
import type { DomainExpertise } from './types';
import { RESEARCHER_REGISTRY } from './researcher-ownership';

// ============================================================================
// TYPES
// ============================================================================

export interface ResearcherPosition {
  expertId: DomainExpertise;
  topic: string;              // Normalized topic (e.g., "carbon tax effectiveness")
  topicEmbedding?: number[];
  stance: string;             // Their position in 1-2 sentences
  confidence: number;         // 0-100
  keyArguments: string[];
  keyEvidence: string[];      // Source IDs that support this position
  runId: string;              // Which analysis produced this position
  briefId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PredictionRecord {
  expertId: DomainExpertise;
  prediction: string;
  probability: number;        // 0-1 at time of prediction
  timeframe: string;
  falsifiableBy: string;
  runId: string;
  createdAt: Date;
  // Resolution (filled in later)
  resolved: boolean;
  outcome?: "correct" | "incorrect" | "partial" | "unresolvable";
  resolvedAt?: Date;
  resolutionNote?: string;
}

export interface ResearcherProfile {
  expertId: DomainExpertise;
  expertName: string;

  // Intellectual history
  totalAnalyses: number;
  avgConfidence: number;
  calibrationScore: number;   // How well-calibrated are their confidence claims?

  // Position history (last 10 relevant positions)
  recentPositions: ResearcherPosition[];

  // Prediction track record
  predictionsTotal: number;
  predictionsCorrect: number;
  predictionsAccuracy: number; // 0-1

  // Intellectual signature
  recurringThemes: string[];   // Topics they keep returning to
  knownDissents: string[];     // Where they consistently disagree with consensus
  methodologicalBiases: string[]; // Their known analytical tendencies

  // Context block for prompt injection
  identityBlock: string;
}

export interface PositionUpdate {
  expertId: DomainExpertise;
  topic: string;
  previousStance: string;
  newStance: string;
  reason: string;             // Why the position changed
  evidenceShift: string;      // What new evidence caused the update
  runId: string;
}

// ============================================================================
// POSITION STORAGE
// ============================================================================

/**
 * Store a researcher's position from a completed analysis.
 */
export async function storeResearcherPosition(
  position: Omit<ResearcherPosition, "topicEmbedding" | "updatedAt">
): Promise<void> {
  try {
    // Embed the topic for semantic retrieval
    const embedding = await embedText(position.topic);

    await prisma.agentAuditLog.create({
      data: {
        agent: `researcher:${position.expertId}`,
        action: "POSITION_STORED",
        resource: position.runId,
        metadata: JSON.stringify({
          topic: position.topic,
          topicEmbedding: embedding.slice(0, 50), // Store truncated for metadata
          stance: position.stance,
          confidence: position.confidence,
          keyArguments: position.keyArguments,
          keyEvidence: position.keyEvidence,
          briefId: position.briefId,
          createdAt: position.createdAt.toISOString(),
        }),
      },
    });

    console.log(`[RESEARCHER IDENTITY] Stored position for ${position.expertId} on "${position.topic.slice(0, 60)}"`);
  } catch (err) {
    console.warn("[RESEARCHER IDENTITY] Failed to store position:", err);
  }
}

/**
 * Store a prediction for later resolution tracking.
 */
export async function storePrediction(
  prediction: Omit<PredictionRecord, "resolved" | "outcome" | "resolvedAt" | "resolutionNote">
): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: `researcher:${prediction.expertId}`,
        action: "PREDICTION_STORED",
        resource: prediction.runId,
        metadata: JSON.stringify({
          prediction: prediction.prediction,
          probability: prediction.probability,
          timeframe: prediction.timeframe,
          falsifiableBy: prediction.falsifiableBy,
          resolved: false,
          createdAt: prediction.createdAt.toISOString(),
        }),
      },
    });
  } catch (err) {
    console.warn("[RESEARCHER IDENTITY] Failed to store prediction:", err);
  }
}

// ============================================================================
// PROFILE RETRIEVAL
// ============================================================================

/**
 * Build a full researcher profile from their history.
 * This is the core of the identity system.
 */
export async function buildResearcherProfile(
  expertId: DomainExpertise,
  currentTopic: string,
  lookbackDays: number = 180
): Promise<ResearcherProfile> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const agentKey = `researcher:${expertId}`;

  // Fetch all records for this researcher
  const [positionRecords, predictionRecords] = await Promise.all([
    prisma.agentAuditLog.findMany({
      where: { agent: agentKey, action: "POSITION_STORED", timestamp: { gte: cutoff } },
      orderBy: { timestamp: "desc" },
      take: 100,
    }),
    prisma.agentAuditLog.findMany({
      where: { agent: agentKey, action: "PREDICTION_STORED", timestamp: { gte: cutoff } },
      orderBy: { timestamp: "desc" },
      take: 50,
    }),
  ]);

  // Parse positions
  const positions: ResearcherPosition[] = positionRecords
    .map(r => {
      try {
        const m = JSON.parse(r.metadata || "{}");
        return {
          expertId,
          topic: m.topic,
          stance: m.stance,
          confidence: m.confidence || 50,
          keyArguments: m.keyArguments || [],
          keyEvidence: m.keyEvidence || [],
          runId: r.resource || "",
          briefId: m.briefId,
          createdAt: new Date(m.createdAt || r.timestamp),
          updatedAt: r.timestamp,
        } as ResearcherPosition;
      } catch { return null; }
    })
    .filter(Boolean) as ResearcherPosition[];

  // Parse predictions
  const predictions = predictionRecords
    .map(r => {
      try { return JSON.parse(r.metadata || "{}"); } catch { return null; }
    })
    .filter(Boolean);

  // Find positions semantically related to current topic
  let relevantPositions: ResearcherPosition[] = [];
  if (positions.length > 0 && currentTopic) {
    try {
      const topicEmbedding = await embedText(currentTopic);
      const positionsWithEmbeddings = await Promise.all(
        positions.slice(0, 30).map(async p => {
          const emb = await embedText(p.topic);
          return { position: p, similarity: cosineSimilarity(topicEmbedding, emb) };
        })
      );
      relevantPositions = positionsWithEmbeddings
        .filter(p => p.similarity >= 0.5)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map(p => p.position);
    } catch {
      relevantPositions = positions.slice(0, 3);
    }
  }

  // Compute prediction accuracy
  const resolved = predictions.filter(p => p.resolved);
  const correct = resolved.filter(p => p.outcome === "correct" || p.outcome === "partial");
  const predictionsAccuracy = resolved.length > 0 ? correct.length / resolved.length : 0;

  // Compute calibration score (how well confidence matches outcomes)
  const avgConfidence = positions.length > 0
    ? positions.reduce((s, p) => s + p.confidence, 0) / positions.length
    : 50;

  // Extract recurring themes (topics mentioned 2+ times)
  const topicCounts: Record<string, number> = {};
  for (const p of positions) {
    const normalized = p.topic.toLowerCase().split(" ").slice(0, 3).join(" ");
    topicCounts[normalized] = (topicCounts[normalized] || 0) + 1;
  }
  const recurringThemes = Object.entries(topicCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([theme]) => theme);

  const expertNames = Object.fromEntries(
    Object.entries(RESEARCHER_REGISTRY).map(([k, v]) => [k, v.name])
  ) as Record<DomainExpertise, string>;

  const profile: ResearcherProfile = {
    expertId,
    expertName: expertNames[expertId],
    totalAnalyses: positions.length,
    avgConfidence,
    calibrationScore: predictionsAccuracy * 100,
    recentPositions: relevantPositions,
    predictionsTotal: predictions.length,
    predictionsCorrect: correct.length,
    predictionsAccuracy,
    recurringThemes,
    knownDissents: [],   // Populated from dissent field in ExpertAnalysis
    methodologicalBiases: [],
    identityBlock: "",
  };

  profile.identityBlock = buildIdentityBlock(profile, currentTopic);
  return profile;
}

// ============================================================================
// IDENTITY BLOCK BUILDER
// ============================================================================

function buildIdentityBlock(profile: ResearcherProfile, currentTopic: string): string {
  if (profile.totalAnalyses === 0) {
    return ""; // First analysis — no history to inject
  }

  const lines: string[] = [];
  lines.push("=== YOUR INTELLECTUAL HISTORY ===");
  lines.push(`You have completed ${profile.totalAnalyses} prior analyses.`);

  if (profile.avgConfidence > 0) {
    lines.push(`Your average confidence level: ${profile.avgConfidence.toFixed(0)}/100`);
  }

  if (profile.predictionsTotal > 0) {
    lines.push(`Prediction track record: ${profile.predictionsCorrect}/${profile.predictionsTotal} resolved predictions correct (${(profile.predictionsAccuracy * 100).toFixed(0)}% accuracy)`);
  }

  if (profile.recentPositions.length > 0) {
    lines.push(`\n## Your Prior Positions on Related Topics`);
    lines.push(`The following are YOUR OWN past stances on topics related to "${currentTopic}":`);
    for (const pos of profile.recentPositions) {
      lines.push(`\n[${pos.createdAt.toISOString().split("T")[0]}] On "${pos.topic}":`);
      lines.push(`  Stance: ${pos.stance}`);
      lines.push(`  Confidence: ${pos.confidence}/100`);
      if (pos.keyArguments.length > 0) {
        lines.push(`  Key arguments: ${pos.keyArguments.slice(0, 2).join("; ")}`);
      }
    }
    lines.push(`\nIMPORTANT: If new evidence CONFIRMS your prior positions, say so explicitly.`);
    lines.push(`If new evidence CONTRADICTS your prior positions, acknowledge the shift and explain why you are updating your view.`);
    lines.push(`Do NOT silently contradict your past self. Intellectual evolution must be explicit.`);
  }

  if (profile.recurringThemes.length > 0) {
    lines.push(`\n## Your Recurring Research Themes`);
    lines.push(`Topics you have analyzed repeatedly: ${profile.recurringThemes.join(", ")}`);
    lines.push(`Apply your accumulated expertise on these themes with extra depth.`);
  }

  lines.push("\n=== END INTELLECTUAL HISTORY ===");
  return lines.join("\n");
}

// ============================================================================
// POSITION EVOLUTION DETECTION
// ============================================================================

/**
 * Detect if a new analysis represents a position change from prior stances.
 * Returns a PositionUpdate if the researcher's view has evolved.
 */
export async function detectPositionEvolution(
  expertId: DomainExpertise,
  topic: string,
  newStance: string,
  priorPositions: ResearcherPosition[]
): Promise<PositionUpdate | null> {
  if (priorPositions.length === 0) return null;

  const mostRecent = priorPositions[0];

  // Quick check: are the stances obviously different?
  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: "You are analyzing whether a researcher has changed their position. Be precise and brief.",
      },
      {
        role: "user",
        content: `RESEARCHER: ${expertId} expert
TOPIC: "${topic}"

PRIOR STANCE (${mostRecent.createdAt.toISOString().split("T")[0]}):
"${mostRecent.stance}"

NEW STANCE:
"${newStance}"

Has the researcher's position meaningfully changed? If yes, explain what changed and why.
Return JSON: {
  "changed": true/false,
  "reason": "explanation or null",
  "evidenceShift": "what new evidence caused this or null"
}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 300,
    jsonMode: true,
    task: 'topic_classification',
  });

  try {
    const parsed = JSON.parse(result.content);
    if (!parsed.changed) return null;

    return {
      expertId,
      topic,
      previousStance: mostRecent.stance,
      newStance,
      reason: parsed.reason || "Position evolved based on new evidence",
      evidenceShift: parsed.evidenceShift || "New sources provided updated evidence",
      runId: "",
    };
  } catch {
    return null;
  }
}

// ============================================================================
// BATCH STORE — Called at end of pipeline run
// ============================================================================

/**
 * Extract and store positions + predictions from an ExpertAnalysis result.
 * Called automatically after runExpertCouncil().
 */
export async function storeExpertAnalysisMemory(
  expertId: DomainExpertise,
  question: string,
  analysis: {
    keyFindings: string[];
    predictions: Array<{ claim: string; probability: number; timeframe: string; falsifiable_by: string }>;
    confidence: number;
    dissent: string | null;
  },
  runId: string,
  briefId?: string
): Promise<void> {
  const now = new Date();

  // Store position
  if (analysis.keyFindings.length > 0) {
    await storeResearcherPosition({
      expertId,
      topic: question,
      stance: analysis.keyFindings.slice(0, 2).join(" | "),
      confidence: analysis.confidence,
      keyArguments: analysis.keyFindings.slice(0, 3),
      keyEvidence: [],
      runId,
      briefId,
      createdAt: now,
    });
  }

  // Store predictions
  for (const pred of analysis.predictions.slice(0, 3)) {
    await storePrediction({
      expertId,
      prediction: pred.claim,
      probability: pred.probability,
      timeframe: pred.timeframe,
      falsifiableBy: pred.falsifiable_by,
      runId,
      createdAt: now,
    });
  }
}
