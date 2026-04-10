/**
 * NomosX Editorial Gate Agent
 * 
 * Evaluates signals AND drafts for publication readiness
 * Runs all gate checks in sequence
 * Decisions: PUBLISH, HOLD, REJECT, SILENCE
 */

import { prisma } from '@/lib/db';
import { EditorialChecks,EditorialDecisionType,SIGNAL_THRESHOLDS,FORBIDDEN_PHRASES,VerticalConfig } from '@/lib/think-tank/types';
import { cadenceEnforcer } from './cadence-enforcer';

// ============================================================================
// TYPES
// ============================================================================

interface EditorialGateInput {
  signalId?: string;  // Signal OR Draft required
  draftId?: string;   // Draft ID for human-initiated publications
  draftHtml?: string; // Optional: for content checks
}

interface EditorialGateOutput {
  decision: EditorialDecisionType; // PUBLISH, HOLD, REJECT, SILENCE
  reasons: string[];
  checks: EditorialChecks;
  humanReviewRequired: boolean;
  scores: {
    trust: number;
    novelty: number;
    quality: number;
  };
}

// ============================================================================
// INDIVIDUAL CHECKS
// ============================================================================

async function checkCadence(verticalId: string): Promise<{ passed: boolean; details: string }> {
  const result = await cadenceEnforcer({ verticalId });
  
  if (result.allowed) {
    return { passed: true, details: "Cadence OK" };
  }
  
  return { 
    passed: false, 
    details: result.reason || "Cadence limit reached"
  };
}

function checkThreshold(context: any): { passed: boolean; details: string } {
  const priority = context.priorityScore || context.qualityScore || 0;
  
  if (priority < SIGNAL_THRESHOLDS.MIN_PRIORITY_FOR_PUBLICATION) {
    return {
      passed: false,
      details: `Priority ${priority} < ${SIGNAL_THRESHOLDS.MIN_PRIORITY_FOR_PUBLICATION} minimum`
    };
  }
  
  return { passed: true, details: `Priority ${priority} meets threshold` };
}

function checkQuality(context: any, config: VerticalConfig): { passed: boolean; score: number } {
  const avgQuality = context.confidenceScore || context.trustScore || 0;
  const minRequired = config.thresholds?.minTrustScore || 60;
  
  return {
    passed: avgQuality >= minRequired,
    score: avgQuality
  };
}

function checkCitation(draftHtml?: string): { passed: boolean; coverage: number } {
  if (!draftHtml) {
    return { passed: true, coverage: 1.0 };
  }
  
  const citationPattern = /\[SRC-\d+\]/g;
  const citations = draftHtml.match(citationPattern) || [];
  const hasCitations = citations.length > 0;
  
  return {
    passed: hasCitations,
    coverage: hasCitations ? 1.0 : 0
  };
}

function checkForbiddenPatterns(draftHtml?: string): { passed: boolean; matches: string[] } {
  if (!draftHtml) {
    return { passed: true, matches: [] };
  }
  
  const lowerHtml = draftHtml.toLowerCase();
  const matches = FORBIDDEN_PHRASES.filter(phrase => lowerHtml.includes(phrase.toLowerCase()));
  
  return {
    passed: matches.length === 0,
    matches
  };
}

/**
 * P0 FIX: Dynamic methodology scoring
 * Evaluates source methodology quality based on multiple factors
 */
function checkMethodology(context: any): { passed: boolean; score: number; flagged: boolean } {
  let score = 50; // Base score
  
  // Boost for high quality sources
  if (context.qualityScore >= 80) score += 20;
  else if (context.qualityScore >= 60) score += 10;
  
  // Boost for confidence
  if (context.confidenceScore >= 80) score += 15;
  else if (context.confidenceScore >= 60) score += 8;
  
  // Boost for institutional sources
  const institutionalProviders = ["imf", "worldbank", "oecd", "nist", "nato", "un"];
  if (institutionalProviders.includes(context.provider?.toLowerCase())) {
    score += 15;
  }
  
  // Penalty for very recent (unverified) sources
  const currentYear = new Date().getFullYear();
  if (context.year === currentYear) score -= 5;
  
  score = Math.max(0, Math.min(100, score));
  const passed = score >= 60;
  const flagged = score < 60;
  
  return { passed, score, flagged };
}

/**
 * P0 FIX: Dynamic adversarial scoring
 * Evaluates robustness against adversarial/biased sources
 */
function checkAdversarial(context: any): { passed: boolean; score: number; flagged: boolean } {
  let score = 60; // Base score
  
  // High citation count = more vetted
  if ((context.citationCount || 0) > 100) score += 20;
  else if ((context.citationCount || 0) > 20) score += 10;
  
  // Multiple sources = harder to manipulate
  if ((context.sourceCount || 1) >= 5) score += 15;
  else if ((context.sourceCount || 1) >= 3) score += 8;
  
  // Open access = more transparent
  if (context.oaStatus === "gold" || context.oaStatus === "green") score += 5;
  
  // Peer-reviewed providers
  const peerReviewedProviders = ["openalex", "pubmed", "crossref", "semanticscholar"];
  if (peerReviewedProviders.includes(context.provider?.toLowerCase())) {
    score += 10;
  }
  
  score = Math.max(0, Math.min(100, score));
  const passed = score >= 55;
  const flagged = score < 55;
  
  return { passed, score, flagged };
}

/**
 * P0 FIX: Dynamic calibration scoring
 * Evaluates confidence calibration (are claims appropriately hedged?)
 */
function checkCalibration(context: any): { passed: boolean; score: number; flagged: boolean } {
  let score = 55; // Base score
  
  // Trust score correlation
  if (context.trustScore >= 80) score += 20;
  else if (context.trustScore >= 60) score += 10;
  
  // Novelty vs confidence balance
  // High novelty + high confidence = potentially overconfident
  const novelty = context.noveltyScore || 50;
  const confidence = context.confidenceScore || 50;
  
  if (novelty > 80 && confidence > 80) {
    score -= 10; // Penalty for overconfidence on novel claims
  }
  
  // Quality score contribution
  if (context.qualityScore >= 70) score += 10;
  
  // Multiple sources improve calibration
  if ((context.sourceCount || 1) >= 3) score += 10;
  
  score = Math.max(0, Math.min(100, score));
  const passed = score >= 50;
  const flagged = score < 50;
  
  return { passed, score, flagged };
}

// ============================================================================
// MAIN GATE
// ============================================================================

export async function editorialGate(input: EditorialGateInput): Promise<EditorialGateOutput> {
  if (!input.signalId && !input.draftId) {
    return {
      decision: "REJECT",
      reasons: ["Must provide signalId or draftId"],
      checks: createEmptyChecks(),
      humanReviewRequired: false,
      scores: { trust: 0, novelty: 0, quality: 0 }
    };
  }
  
  console.log(`[EDITORIAL_GATE] Evaluating ${input.draftId ? `draft ${input.draftId}` : `signal ${input.signalId}`}...`);
  
  let verticalId: string;
  let verticalConfig: VerticalConfig;
  let trustScore = 0;
  let noveltyScore = 0;
  let qualityScore = 0;
  let signal: any = null;
  let draft: any = null;
  
  if (input.draftId) {
    draft = await prisma.draft.findUnique({
      where: { id: input.draftId },
      include: { vertical: true, signal: true }
    });
    
    if (!draft) {
      return {
        decision: "REJECT",
        reasons: ["Draft not found"],
        checks: createEmptyChecks(),
        humanReviewRequired: false,
        scores: { trust: 0, novelty: 0, quality: 0 }
      };
    }
    
    verticalId = draft.verticalId;
    verticalConfig = draft.vertical.config as VerticalConfig;
    trustScore = draft.trustScore || 0;
    noveltyScore = draft.noveltyScore || 0;
    qualityScore = draft.qualityScore || 0;
    signal = draft.signal;
  } else {
    signal = await prisma.signal.findUnique({
      where: { id: input.signalId },
      include: { vertical: true }
    });
    
    if (!signal) {
      return {
        decision: "REJECT",
        reasons: ["Signal not found"],
        checks: createEmptyChecks(),
        humanReviewRequired: false,
        scores: { trust: 0, novelty: 0, quality: 0 }
      };
    }
    
    verticalId = signal.verticalId;
    verticalConfig = signal.vertical.config as VerticalConfig;
    trustScore = signal.confidenceScore || 0;
    noveltyScore = signal.noveltyScore || 0;
    qualityScore = signal.impactScore || 0;
  }
  
  const config = verticalConfig;
  const reasons: string[] = [];
  let decision: EditorialDecisionType = "PUBLISH";
  let humanReviewRequired = false;
  
  const evalContext = signal || draft || { confidenceScore: trustScore, noveltyScore, priorityScore: qualityScore };
  
  const checks: EditorialChecks = {
    cadence: await checkCadence(verticalId),
    threshold: checkThreshold(evalContext),
    quality: checkQuality(evalContext, config),
    citation: checkCitation(input.draftHtml || draft?.html),
    forbiddenPatterns: checkForbiddenPatterns(input.draftHtml || draft?.html),
    methodology: checkMethodology(evalContext),
    adversarial: checkAdversarial(evalContext),
    calibration: checkCalibration(evalContext)
  };
  
  // Check for SILENCE decision
  const silenceThreshold = config.thresholds?.silenceThreshold || 40;
  if (noveltyScore < silenceThreshold && qualityScore < silenceThreshold) {
    decision = "SILENCE";
    reasons.push(`Novelty (${noveltyScore}) and quality (${qualityScore}) below silence threshold (${silenceThreshold})`);
    reasons.push("Signal does not warrant publication - silence is appropriate");
  }
  
  // Evaluate hard checks (only if not SILENCE)
  if (decision !== "SILENCE") {
    if (!checks.cadence.passed) {
      decision = "HOLD";
      reasons.push(`Cadence: ${checks.cadence.details}`);
    }
    
    if (!checks.threshold.passed) {
      decision = "REJECT";
      reasons.push(`Threshold: ${checks.threshold.details}`);
    }
    
    if (!checks.quality.passed) {
      decision = "REJECT";
      reasons.push(`Quality score ${checks.quality.score} below minimum`);
    }
    
    if (!checks.citation.passed) {
      decision = "REJECT";
      reasons.push(`Citation coverage ${Math.round(checks.citation.coverage * 100)}% insufficient`);
    }
    
    if (!checks.forbiddenPatterns.passed) {
      decision = "REJECT";
      reasons.push(`Forbidden patterns detected: ${checks.forbiddenPatterns.matches.join(", ")}`);
    }
  }
  
  // Soft checks
  if (checks.methodology.flagged) {
    humanReviewRequired = true;
    reasons.push(`Methodology score ${checks.methodology.score} flagged for review`);
  }
  
  if (checks.adversarial.flagged) {
    humanReviewRequired = true;
    reasons.push(`Adversarial score ${checks.adversarial.score} flagged for review`);
  }
  
  if (checks.calibration.flagged) {
    humanReviewRequired = true;
    reasons.push(`Calibration score ${checks.calibration.score} flagged for review`);
  }
  
  if (humanReviewRequired && decision === "PUBLISH") {
    decision = "HOLD";
    reasons.push("Requires human review");
  }
  
  if (reasons.length === 0) {
    reasons.push("All checks passed");
  }
  
  console.log(`[EDITORIAL_GATE] Decision: ${decision} (${reasons.join("; ")})`);
  
  // Store decision
  await prisma.editorialDecision.create({
    data: {
      signalId: signal?.id || null,
      draftId: draft?.id || null,
      verticalId,
      decision,
      reasons,
      checks: checks as any,
      trustScore,
      noveltyScore,
      qualityScore,
      cadenceBlocked: !checks.cadence.passed,
      cadenceReason: !checks.cadence.passed ? checks.cadence.details : null,
      humanReviewRequired
    }
  });
  
  // Update signal status
  if (signal && !draft) {
    const newStatus = decision === "PUBLISH" ? "PUBLISHED" : 
                      decision === "HOLD" ? "HELD" : 
                      decision === "SILENCE" ? "SILENT" : "REJECTED";
    
    await prisma.signal.update({
      where: { id: signal.id },
      data: { status: newStatus }
    });
  }
  
  // Update draft status
  if (draft) {
    const newStatus = decision === "PUBLISH" ? "APPROVED" : 
                      decision === "HOLD" ? "UNDER_REVIEW" : "REJECTED";
    
    await prisma.draft.update({
      where: { id: draft.id },
      data: { status: newStatus }
    });
  }
  
  return {
    decision,
    reasons,
    checks,
    humanReviewRequired,
    scores: {
      trust: trustScore,
      novelty: noveltyScore,
      quality: qualityScore
    }
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyChecks(): EditorialChecks {
  return {
    cadence: { passed: false, details: "Not evaluated" },
    threshold: { passed: false, details: "Not evaluated" },
    quality: { passed: false, score: 0 },
    citation: { passed: false, coverage: 0 },
    forbiddenPatterns: { passed: false, matches: [] },
    methodology: { passed: false, score: 0, flagged: true },
    adversarial: { passed: false, score: 0, flagged: true },
    calibration: { passed: false, score: 0, flagged: true }
  };
}

// ============================================================================
// BATCH EVALUATION
// ============================================================================

export async function evaluatePendingSignals(): Promise<{
  evaluated: number;
  approved: number;
  held: number;
  rejected: number;
  silenced: number;
}> {
  console.log(`[EDITORIAL_GATE] Evaluating pending signals...`);
  
  const pendingSignals = await prisma.signal.findMany({
    where: { status: "NEW" },
    orderBy: { priorityScore: "desc" },
    take: 20
  });
  
  let approved = 0;
  let held = 0;
  let rejected = 0;
  let silenced = 0;
  
  for (const signal of pendingSignals) {
    const result = await editorialGate({ signalId: signal.id });
    
    switch (result.decision) {
      case "PUBLISH": approved++; break;
      case "HOLD": held++; break;
      case "REJECT": rejected++; break;
      case "SILENCE": silenced++; break;
    }
  }
  
  console.log(`[EDITORIAL_GATE] Evaluated ${pendingSignals.length}: ${approved} approved, ${held} held, ${rejected} rejected, ${silenced} silenced`);
  
  return {
    evaluated: pendingSignals.length,
    approved,
    held,
    rejected,
    silenced
  };
}

// ============================================================================
// DRAFT SUBMISSION
// ============================================================================

export async function submitDraftToGate(draftId: string): Promise<EditorialGateOutput> {
  // Update draft status to SUBMITTED_TO_GATE
  await prisma.draft.update({
    where: { id: draftId },
    data: { status: "SUBMITTED_TO_GATE" }
  });
  
  // Run editorial gate
  return editorialGate({ draftId });
}
