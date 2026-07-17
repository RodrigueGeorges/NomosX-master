/**
 * NomosX ADVERSARIAL REVIEW BOARD + SYNTHESIS DIRECTOR + EVIDENCE GRADER
 * 
 * The final quality layer that makes NomosX unreplicable:
 * 
 * 1. EVIDENCE GRADER — Oxford CEBM + GRADE framework scoring
 * 2. ADVERSARIAL REVIEW BOARD — 3 independent reviewers challenge every claim
 * 3. SYNTHESIS DIRECTOR — Senior researcher reconciles expert analyses + reviews
 * 
 * This is the moat: no generic LLM can replicate calibrated multi-agent
 * adversarial review with domain-specific evidence grading.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import type { ExpertAnalysis, DomainExpertise } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface EvidenceGrade {
  // Oxford CEBM Level (1a-5)
  cebmLevel: string;
  // GRADE certainty (high/moderate/low/very_low)
  gradeCertainty: "high" | "moderate" | "low" | "very_low";
  // Detailed breakdown
  riskOfBias: "low" | "some_concerns" | "high";
  inconsistency: "none" | "minor" | "serious";
  indirectness: "none" | "minor" | "serious";
  imprecision: "none" | "minor" | "serious";
  publicationBias: "unlikely" | "possible" | "likely";
  // Upgrade factors
  largeEffect: boolean;
  doseResponse: boolean;
  plausibleConfounding: boolean;
  // Summary
  narrative: string;
}

export interface ReviewVerdict {
  reviewerId: string;
  reviewerRole: string;
  
  // Verdicts per claim
  claimVerdicts: ClaimVerdict[];
  
  // Overall assessment
  overallRigor: number;           // 0-100
  methodologicalSoundness: number; // 0-100
  logicalCoherence: number;        // 0-100
  
  // Red flags
  criticalFlaws: string[];
  warnings: string[];
  suggestions: string[];
  
  costUsd: number;
}

interface ClaimVerdict {
  claim: string;
  verdict: "supported" | "partially_supported" | "unsupported" | "misleading";
  reasoning: string;
  requiredEvidence: string;  // What evidence would be needed to fully support this
}

export interface SynthesisReport {
  // Executive synthesis
  title: string;
  executiveSummary: string;        // 500+ words, Harvard-quality
  
  // Consensus map
  strongConsensus: string[];       // All experts agree
  weakConsensus: string[];         // Majority agrees
  activeDissent: string[];         // Significant disagreement
  
  // Evidence quality
  evidenceGrade: EvidenceGrade;
  
  // Cross-expert insights
  convergentFindings: string[];    // Same finding from different lenses
  divergentFindings: string[];     // Different conclusions from same data
  blindSpotsCovered: string[];     // Blind spots identified by one expert, addressed by another
  
  // Predictions (calibrated)
  calibratedPredictions: CalibratedPrediction[];
  
  // Policy recommendations (ranked by evidence strength)
  recommendations: Recommendation[];
  
  // Intellectual honesty
  whatWeKnow: string;
  whatWeDontKnow: string;
  whatWouldChangeOurMind: string;
  
  // Meta
  expertCount: number;
  reviewerCount: number;
  totalCostUsd: number;
  totalDurationMs: number;
}

interface CalibratedPrediction {
  claim: string;
  probability: number;
  expertAgreement: number;  // How many experts agree (0-1)
  timeframe: string;
  falsifiableBy: string;
}

interface Recommendation {
  action: string;
  evidenceStrength: "strong" | "moderate" | "weak";
  urgency: "immediate" | "short_term" | "long_term";
  stakeholders: string[];
  risks: string[];
}

// ============================================================================
// EVIDENCE GRADER — Oxford CEBM + GRADE Framework
// ============================================================================

export async function gradeEvidence(
  question: string,
  sourceContext: string,
  sourceCount: number
): Promise<{ grade: EvidenceGrade; costUsd: number }> {
  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are an evidence grading specialist trained in the Oxford Centre for Evidence-Based Medicine (CEBM) levels and the GRADE framework. You systematically assess the quality of a body of evidence.

CEBM Levels:
1a: Systematic review of RCTs
1b: Individual RCT
2a: Systematic review of cohort studies
2b: Individual cohort study / low-quality RCT
3a: Systematic review of case-control studies
3b: Individual case-control study
4: Case series / poor cohort or case-control
5: Expert opinion / mechanism-based reasoning

GRADE Framework downgrades for:
- Risk of bias (study limitations)
- Inconsistency (heterogeneous results)
- Indirectness (different populations/interventions)
- Imprecision (wide confidence intervals)
- Publication bias

GRADE upgrades for:
- Large effect (RR > 2 or < 0.5)
- Dose-response gradient
- Plausible confounding would reduce effect`,
      },
      {
        role: "user",
        content: `RESEARCH QUESTION: "${question}"

EVIDENCE BASE: ${sourceCount} sources
${sourceContext.slice(0, 4000)}

Grade this evidence body. Return JSON:
{
  "cebmLevel": "e.g. 2b",
  "gradeCertainty": "high|moderate|low|very_low",
  "riskOfBias": "low|some_concerns|high",
  "inconsistency": "none|minor|serious",
  "indirectness": "none|minor|serious",
  "imprecision": "none|minor|serious",
  "publicationBias": "unlikely|possible|likely",
  "largeEffect": true/false,
  "doseResponse": true/false,
  "plausibleConfounding": true/false,
  "narrative": "2-3 sentence summary of evidence quality and what it means for decision-making"
}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 800,
    jsonMode: true,
    enableCache: true,
    task: 'fact_check',
  });

  try {
    const parsed = parseJson<any>(result.content);
    if (!parsed) throw new SyntaxError('Review board grade: failed to parse LLM JSON');
    return { grade: parsed, costUsd: result.costUsd };
  } catch {
    return {
      grade: {
        cebmLevel: "4",
        gradeCertainty: "low",
        riskOfBias: "some_concerns",
        inconsistency: "minor",
        indirectness: "minor",
        imprecision: "minor",
        publicationBias: "possible",
        largeEffect: false,
        doseResponse: false,
        plausibleConfounding: false,
        narrative: "Evidence grading failed — defaulting to conservative assessment.",
      },
      costUsd: result.costUsd,
    };
  }
}

// ============================================================================
// ADVERSARIAL REVIEW BOARD — 3 independent reviewers
// ============================================================================

const REVIEWER_ROLES = [
  {
    id: "methodologist",
    role: "Senior Methodologist",
    prompt: `You are a senior research methodologist. Your job is to find EVERY methodological flaw in the analysis. Check for: selection bias, confounding, reverse causality, ecological fallacy, survivorship bias, p-hacking, HARKing, cherry-picking, base rate neglect. Be ruthless but fair.`,
  },
  {
    id: "statistician",
    role: "Biostatistician",
    prompt: `You are a senior biostatistician. Your job is to verify EVERY statistical claim. Check for: appropriate test selection, multiple comparisons correction, effect size vs significance, confidence interval interpretation, sample size adequacy, power analysis, heterogeneity assessment. Flag any statistical misinterpretation.`,
  },
  {
    id: "devil_advocate",
    role: "Devil's Advocate",
    prompt: `You are a professional devil's advocate. Your job is to construct the STRONGEST possible counter-argument to every major claim. Use steel-man argumentation: present the best version of the opposing view, not a straw man. Identify what evidence would be needed to overturn each conclusion.`,
  },
];

async function runSingleReview(
  reviewer: typeof REVIEWER_ROLES[0],
  question: string,
  analysisContext: string
): Promise<ReviewVerdict> {
  const result = await callLLM({
    messages: [
      { role: "system", content: reviewer.prompt },
      {
        role: "user",
        content: `RESEARCH QUESTION: "${question}"

ANALYSIS TO REVIEW:
${analysisContext.slice(0, 5000)}

Review this analysis with maximum rigor. Return JSON:
{
  "claimVerdicts": [
    {
      "claim": "The specific claim being evaluated",
      "verdict": "supported|partially_supported|unsupported|misleading",
      "reasoning": "Why this verdict",
      "requiredEvidence": "What would be needed to fully support this"
    }
  ],
  "overallRigor": 0-100,
  "methodologicalSoundness": 0-100,
  "logicalCoherence": 0-100,
  "criticalFlaws": ["flaw 1", ...],
  "warnings": ["warning 1", ...],
  "suggestions": ["suggestion 1", ...]
}

Be RIGOROUS. A Harvard peer review would catch these issues.`,
      },
    ],
    temperature: 0.15,
    maxTokens: 3500,
    jsonMode: true,
    task: 'elenchus',
  });

  try {
    const parsed = parseJson<any>(result.content);
    if (!parsed) throw new SyntaxError('Review board review: failed to parse LLM JSON');
    return {
      reviewerId: reviewer.id,
      reviewerRole: reviewer.role,
      claimVerdicts: parsed.claimVerdicts || [],
      overallRigor: parsed.overallRigor || 50,
      methodologicalSoundness: parsed.methodologicalSoundness || 50,
      logicalCoherence: parsed.logicalCoherence || 50,
      criticalFlaws: parsed.criticalFlaws || [],
      warnings: parsed.warnings || [],
      suggestions: parsed.suggestions || [],
      costUsd: result.costUsd,
    };
  } catch {
    return {
      reviewerId: reviewer.id,
      reviewerRole: reviewer.role,
      claimVerdicts: [],
      overallRigor: 0,
      methodologicalSoundness: 0,
      logicalCoherence: 0,
      criticalFlaws: ["Review failed to parse"],
      warnings: [],
      suggestions: [],
      costUsd: result.costUsd,
    };
  }
}

/**
 * Run the full Adversarial Review Board — 3 reviewers in parallel.
 */
export async function runReviewBoard(
  question: string,
  analysisContext: string
): Promise<{ reviews: ReviewVerdict[]; totalCostUsd: number }> {
  console.log(`[REVIEW BOARD] Running 3 adversarial reviewers in parallel`);

  const results = await Promise.allSettled(
    REVIEWER_ROLES.map(reviewer => runSingleReview(reviewer, question, analysisContext))
  );

  const reviews: ReviewVerdict[] = [];
  let totalCost = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      reviews.push(r.value);
      totalCost += r.value.costUsd;
      console.log(`[REVIEW BOARD] ${r.value.reviewerRole}: rigor=${r.value.overallRigor}, flaws=${r.value.criticalFlaws.length}`);
    } else {
      console.warn(`[REVIEW BOARD] ${REVIEWER_ROLES[i].role} failed:`, r.reason);
    }
  }

  console.log(`[REVIEW BOARD] ✅ ${reviews.length}/3 reviewers completed, $${totalCost.toFixed(4)}`);
  return { reviews, totalCostUsd: totalCost };
}

// ============================================================================
// SYNTHESIS DIRECTOR — Reconcile experts + reviews into final report
// ============================================================================

/**
 * The Synthesis Director: a senior researcher who reconciles all expert
 * analyses and review board feedback into a single authoritative report.
 */
export async function synthesizeCouncil(
  question: string,
  expertAnalyses: ExpertAnalysis[],
  reviews: ReviewVerdict[],
  evidenceGrade: EvidenceGrade,
  sourceCount: number
): Promise<{ synthesis: SynthesisReport; costUsd: number }> {
  const start = Date.now();

  // Build context from expert analyses
  const expertContext = expertAnalyses.map(e => `
### ${e.expertName} (confidence: ${e.confidence}%)
Key findings: ${e.keyFindings.join("; ")}
Methodology critique: ${e.methodology_critique}
Evidence level: ${e.evidence_quality.overallLevel}/5, bias risk: ${e.evidence_quality.biasRisk}
Causal mechanisms: ${e.causal_mechanisms.join("; ")}
Confounders: ${e.confounders.join("; ")}
Dissent: ${e.dissent || "None"}
Blind spots: ${e.blind_spots.join("; ")}
Predictions: ${e.predictions.map(p => `${p.claim} (p=${p.probability}, ${p.timeframe})`).join("; ")}
Policy implications: ${e.policy_implications.join("; ")}
`).join("\n");

  // Build context from reviews
  const reviewContext = reviews.map(r => `
### ${r.reviewerRole} (rigor: ${r.overallRigor}/100)
Critical flaws: ${r.criticalFlaws.join("; ") || "None"}
Warnings: ${r.warnings.join("; ") || "None"}
Claim verdicts: ${r.claimVerdicts.map(v => `"${v.claim.slice(0, 60)}..." → ${v.verdict}`).join("; ")}
`).join("\n");

  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are the Synthesis Director — a senior researcher with 20+ years experience leading multi-disciplinary research teams at institutions like Harvard, RAND, and France Stratégie.

Your role: Reconcile multiple expert analyses and adversarial reviews into a single authoritative synthesis. You are the final voice.

PRINCIPLES:
1. INTELLECTUAL HONESTY: Clearly separate what we know from what we don't
2. CALIBRATION: Probabilities should be well-calibrated (if you say 70%, it should happen ~70% of the time)
3. CONVERGENCE: When multiple experts agree from different angles, that's strong evidence
4. DISSENT: Minority views that survive adversarial review deserve prominent mention
5. ACTIONABILITY: Every finding should connect to a decision or action
6. HUMILITY: Acknowledge the limits of the evidence base`,
      },
      {
        role: "user",
        content: `RESEARCH QUESTION: "${question}"

EVIDENCE GRADE: CEBM Level ${evidenceGrade.cebmLevel}, GRADE: ${evidenceGrade.gradeCertainty}
${evidenceGrade.narrative}

EXPERT ANALYSES (${expertAnalyses.length} domain experts):
${expertContext}

ADVERSARIAL REVIEW BOARD (${reviews.length} reviewers):
${reviewContext}

SOURCE COUNT: ${sourceCount}

Synthesize everything into a final authoritative report. Return JSON:
{
  "title": "Compelling title",
  "executiveSummary": "500+ word executive summary — Harvard-quality, decision-ready",
  "strongConsensus": ["All experts agree on X [SRC-N]", ...],
  "weakConsensus": ["Majority agrees on Y [SRC-N]", ...],
  "activeDissent": ["Expert Z disagrees because...", ...],
  "convergentFindings": ["Finding confirmed by multiple lenses", ...],
  "divergentFindings": ["Same data, different conclusions", ...],
  "blindSpotsCovered": ["Blind spot X identified by expert A, addressed by expert B", ...],
  "calibratedPredictions": [
    {
      "claim": "Prediction [SRC-N]",
      "probability": 0.0-1.0,
      "expertAgreement": 0.0-1.0,
      "timeframe": "e.g. 2-5 years",
      "falsifiableBy": "What would prove this wrong"
    }
  ],
  "recommendations": [
    {
      "action": "Specific recommendation [SRC-N]",
      "evidenceStrength": "strong|moderate|weak",
      "urgency": "immediate|short_term|long_term",
      "stakeholders": ["who should act"],
      "risks": ["risk of this recommendation"]
    }
  ],
  "whatWeKnow": "Clear statement of established findings",
  "whatWeDontKnow": "Honest statement of gaps and uncertainties",
  "whatWouldChangeOurMind": "What new evidence would alter our conclusions"
}

This is the FINAL output. Make it worthy of a Harvard Kennedy School policy brief.`,
      },
    ],
    temperature: 0.2,
    maxTokens: 3000,
    jsonMode: true,
    task: 'meta_analysis',
  });

  const durationMs = Date.now() - start;

  try {
    const parsed = parseJson<any>(result.content);
    if (!parsed) throw new SyntaxError('Review board synthesis: failed to parse LLM JSON');
    return {
      synthesis: {
        ...parsed,
        evidenceGrade,
        expertCount: expertAnalyses.length,
        reviewerCount: reviews.length,
        totalCostUsd: 0, // Will be aggregated by caller
        totalDurationMs: durationMs,
      },
      costUsd: result.costUsd,
    };
  } catch {
    return {
      synthesis: {
        title: "Synthesis Failed",
        executiveSummary: "The synthesis director failed to produce a report.",
        strongConsensus: [],
        weakConsensus: [],
        activeDissent: [],
        evidenceGrade,
        convergentFindings: [],
        divergentFindings: [],
        blindSpotsCovered: [],
        calibratedPredictions: [],
        recommendations: [],
        whatWeKnow: "",
        whatWeDontKnow: "Synthesis failed",
        whatWouldChangeOurMind: "",
        expertCount: expertAnalyses.length,
        reviewerCount: reviews.length,
        totalCostUsd: 0,
        totalDurationMs: durationMs,
      },
      costUsd: result.costUsd,
    };
  }
}

// ============================================================================
// FULL HARVARD COUNCIL — Orchestrate everything
// ============================================================================

/**
 * Run the complete Harvard Council pipeline:
 * 1. PhD Expert Council (parallel domain analysis)
 * 2. Evidence Grader (CEBM + GRADE)
 * 3. Adversarial Review Board (3 parallel reviewers)
 * 4. Synthesis Director (final reconciliation)
 */
export async function runHarvardCouncil(
  question: string,
  sourceContext: string,
  sourceCount: number,
  options?: { experts?: DomainExpertise[]; strategic?: boolean; runId?: string }
): Promise<{
  synthesis: SynthesisReport;
  expertAnalyses: ExpertAnalysis[];
  reviews: ReviewVerdict[];
  evidenceGrade: EvidenceGrade;
  totalCostUsd: number;
  totalDurationMs: number;
}> {
  const start = Date.now();
  let totalCost = 0;

  console.log(`\n${"━".repeat(60)}`);
  console.log(`  🎓 HARVARD COUNCIL — PhD Expert Analysis`);
  console.log(`  Question: "${question.slice(0, 80)}..."`);
  console.log(`${"━".repeat(60)}\n`);

  // Import dynamically to avoid circular deps
  const { runExpertCouncil } = await import('./phd-researcher');

  // STEP 1 + 2: Run Expert Council + Evidence Grader in parallel
  console.log(`[HARVARD] Phase 1: Expert Council + Evidence Grading (parallel)`);
  const [councilResult, gradeResult] = await Promise.all([
    runExpertCouncil(question, sourceContext, sourceCount, { experts: options?.experts, strategic: options?.strategic, runId: options?.runId }),
    gradeEvidence(question, sourceContext, sourceCount),
  ]);

  totalCost += councilResult.totalCostUsd + gradeResult.costUsd;

  // Build rich analysis context for review board (more data = better adversarial review)
  const analysisContext = councilResult.analyses.map(e =>
    `### ${e.expertName} (confidence: ${e.confidence}%)
Findings: ${e.keyFindings.join("; ")}
Methodology: ${e.methodology_critique.slice(0, 300)}
Evidence level: ${e.evidence_quality.overallLevel}/5, bias: ${e.evidence_quality.biasRisk}
Causal mechanisms: ${e.causal_mechanisms.join("; ")}
Confounders: ${e.confounders.join("; ")}
Predictions: ${e.predictions.map(p => `${p.claim} (p=${p.probability})`).join("; ")}
Dissent: ${e.dissent || "None"}
Blind spots: ${e.blind_spots.join("; ")}`
  ).join("\n\n");

  // STEP 3: Adversarial Review Board
  console.log(`[HARVARD] Phase 2: Adversarial Review Board`);
  const reviewResult = await runReviewBoard(question, analysisContext);
  totalCost += reviewResult.totalCostUsd;

  // STEP 4: Synthesis Director
  console.log(`[HARVARD] Phase 3: Synthesis Director`);
  const synthesisResult = await synthesizeCouncil(
    question,
    councilResult.analyses,
    reviewResult.reviews,
    gradeResult.grade,
    sourceCount
  );
  totalCost += synthesisResult.costUsd;

  const totalDurationMs = Date.now() - start;

  // Update synthesis with total costs
  synthesisResult.synthesis.totalCostUsd = totalCost;
  synthesisResult.synthesis.totalDurationMs = totalDurationMs;

  console.log(`\n${"━".repeat(60)}`);
  console.log(`  ✅ HARVARD COUNCIL COMPLETE`);
  console.log(`  Experts: ${councilResult.analyses.length} | Reviewers: ${reviewResult.reviews.length}`);
  console.log(`  Evidence: CEBM ${gradeResult.grade.cebmLevel}, GRADE ${gradeResult.grade.gradeCertainty}`);
  console.log(`  Cost: $${totalCost.toFixed(4)} | Duration: ${totalDurationMs}ms`);
  console.log(`${"━".repeat(60)}\n`);

  return {
    synthesis: synthesisResult.synthesis,
    expertAnalyses: councilResult.analyses,
    reviews: reviewResult.reviews,
    evidenceGrade: gradeResult.grade,
    totalCostUsd: totalCost,
    totalDurationMs,
  };
}
