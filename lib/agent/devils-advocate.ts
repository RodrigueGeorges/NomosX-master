/**
 * NomosX DEVIL'S ADVOCATE — Permanent Adversarial Intelligence
 *
 * Every publication, before release, faces a dedicated adversarial agent
 * whose sole purpose is to find what is wrong, overstated, missing, or
 * intellectually dishonest in the analysis.
 *
 * This is not the same as the Critical Loop (which improves writing quality).
 * The Devil's Advocate operates at the EPISTEMIC level:
 * - Are the conclusions actually supported by the evidence?
 * - What would a hostile expert at McKinsey/Brookings say?
 * - What is the strongest possible counterargument?
 * - What would make this analysis look naive in 2 years?
 *
 * Inspired by: CIA's "Red Team" methodology, Kahneman's "pre-mortem",
 * and the adversarial peer review process at top journals.
 *
 * Output: A structured challenge report that forces the analyst to either
 * defend their position or revise it — producing a stronger final publication.
 */

import { callLLM } from '../llm/unified-llm';

// ============================================================================
// TYPES
// ============================================================================

export interface AdvocateChallenge {
  // The specific claim being challenged
  claim: string;
  sourceSection: string;      // Where in the analysis this appears

  // The challenge
  challengeType: ChallengeType;
  challenge: string;          // The adversarial argument
  severity: "fatal" | "major" | "moderate" | "minor";

  // Counterevidence
  counterEvidence: string[];  // What evidence would support the opposite view
  alternativeExplanation: string; // A plausible alternative interpretation

  // Resolution
  requiredAction: "revise" | "defend" | "qualify" | "remove";
  suggestedRevision?: string;
}

export type ChallengeType =
  | "overstated_conclusion"    // Conclusion goes beyond what evidence supports
  | "missing_counterevidence"  // Ignored evidence that contradicts the claim
  | "false_consensus"          // Presented contested view as settled
  | "causation_from_correlation" // Inferred causation without causal identification
  | "selection_bias"           // Cherry-picked sources
  | "temporal_fallacy"         // Applied past findings to present without justification
  | "ecological_fallacy"       // Applied group-level findings to individuals
  | "straw_man"                // Misrepresented the opposing view
  | "appeal_to_authority"      // Relied on prestige rather than evidence
  | "missing_stakeholder"      // Ignored a key affected party
  | "implementation_gap"       // Ignored feasibility of recommendations
  | "unknown_unknowns"         // Failed to acknowledge what we don't know
  | "institutional_bias"       // Analysis reflects institutional perspective uncritically
  | "recency_bias";            // Over-weighted recent evidence vs. historical patterns

export interface AdvocateReport {
  // Overall verdict
  verdict: "publish" | "revise" | "major_revision" | "reject";
  overallStrength: number;     // 0-100: how strong is the analysis?
  publishabilityScore: number; // 0-100: ready for think-tank publication?

  // Challenges
  fatalChallenges: AdvocateChallenge[];   // Must be resolved before publication
  majorChallenges: AdvocateChallenge[];   // Should be addressed
  minorChallenges: AdvocateChallenge[];   // Nice to address

  // Comparative benchmark
  vsInstitutionBenchmark: InstitutionComparison;

  // The strongest counterargument (the one that could sink the publication)
  killShot: string;

  // What a hostile expert would say
  hostileExpertReview: string;

  // What would make this analysis look naive in 2 years
  futureVulnerabilities: string[];

  // What is genuinely good (to preserve)
  strengths: string[];

  // Final recommendation
  recommendation: string;

  costUsd: number;
  durationMs: number;
}

export interface InstitutionComparison {
  mckinsey: ComparisonScore;
  brookings: ComparisonScore;
  rand: ComparisonScore;
  franceStrategie: ComparisonScore;
  overall: "superior" | "comparable" | "inferior";
  gaps: string[];              // What top institutions do that this analysis doesn't
}

export interface ComparisonScore {
  score: number;               // 0-100: how does this compare?
  strengths: string[];
  gaps: string[];
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run the Devil's Advocate challenge on a completed analysis.
 * Called as the final gate before publication.
 */
export async function runDevilsAdvocate(
  question: string,
  analysisContent: string,    // The full analysis text
  sources: Array<{ title: string; provider: string; year?: number }>,
  options: {
    mode?: "brief" | "strategic";
    targetAudience?: string;
    domain?: string;
    debateContext?: string; // P0-C: Steel-man context from Debate Agent
  } = {}
): Promise<AdvocateReport> {
  const start = Date.now();
  const { mode = "brief", targetAudience = "senior policymakers and executives", domain = "general", debateContext } = options;

  console.log(`[DEVIL'S ADVOCATE] Challenging analysis on: "${question.slice(0, 80)}..."`);

  // Run 3 parallel challenges: epistemic, strategic, institutional
  const [epistemicResult, strategicResult, benchmarkResult] = await Promise.allSettled([
    runEpistemicChallenge(question, analysisContent, sources, debateContext),
    runStrategicChallenge(question, analysisContent, targetAudience, mode),
    runInstitutionBenchmark(question, analysisContent, domain),
  ]);

  // Parse results
  const epistemic = epistemicResult.status === "fulfilled" ? epistemicResult.value : null;
  const strategic = strategicResult.status === "fulfilled" ? strategicResult.value : null;
  const benchmark = benchmarkResult.status === "fulfilled" ? benchmarkResult.value : null;

  // Aggregate challenges
  const allChallenges: AdvocateChallenge[] = [
    ...(epistemic?.challenges || []),
    ...(strategic?.challenges || []),
  ];

  const fatalChallenges = allChallenges.filter(c => c.severity === "fatal");
  const majorChallenges = allChallenges.filter(c => c.severity === "major");
  const minorChallenges = allChallenges.filter(c => c.severity === "moderate" || c.severity === "minor");

  // Compute verdict - A+ LEVEL: More flexible thresholds
  const verdict: AdvocateReport["verdict"] =
    fatalChallenges.length >= 3 ? "reject" :
    fatalChallenges.length >= 2 ? "major_revision" :
    majorChallenges.length >= 5 ? "revise" : "publish";

  const overallStrength = Math.max(0, 100 - (fatalChallenges.length * 20) - (majorChallenges.length * 8) - (minorChallenges.length * 2));
  const publishabilityScore = Math.max(0, overallStrength - (fatalChallenges.length * 10));

  const totalCost = (epistemic?.costUsd || 0) + (strategic?.costUsd || 0) + (benchmark?.costUsd || 0);
  const durationMs = Date.now() - start;

  console.log(`[DEVIL'S ADVOCATE] Verdict: ${verdict.toUpperCase()} | Strength: ${overallStrength}/100 | Fatal: ${fatalChallenges.length} | Major: ${majorChallenges.length}`);

  return {
    verdict,
    overallStrength,
    publishabilityScore,
    fatalChallenges,
    majorChallenges,
    minorChallenges,
    vsInstitutionBenchmark: benchmark?.comparison || defaultBenchmark(),
    killShot: epistemic?.killShot || strategic?.killShot || "No fatal flaw identified",
    hostileExpertReview: strategic?.hostileReview || "",
    futureVulnerabilities: strategic?.futureVulnerabilities || [],
    strengths: epistemic?.strengths || [],
    recommendation: buildRecommendation(verdict, fatalChallenges, majorChallenges),
    costUsd: totalCost,
    durationMs,
  };
}

// ============================================================================
// EPISTEMIC CHALLENGE — Are the conclusions actually supported?
// ============================================================================

async function runEpistemicChallenge(
  question: string,
  analysisContent: string,
  sources: Array<{ title: string; provider: string; year?: number }>,
  debateContext?: string
): Promise<{
  challenges: AdvocateChallenge[];
  killShot: string;
  strengths: string[];
  costUsd: number;
}> {
  const sourceList = sources.slice(0, 20).map((s, i) => `[SRC-${i + 1}] ${s.title} (${s.provider}, ${s.year || "n.d."})`).join("\n");

  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are the most rigorous epistemic critic in academic research. Your job is to find every logical flaw, unsupported claim, and intellectual weakness in an analysis. You are not trying to be destructive — you are trying to make the analysis bulletproof before publication.

You think like: a hostile peer reviewer at Nature, a red team analyst at the CIA, and a Socratic philosopher simultaneously.

Be specific. Quote the exact claims you are challenging. Provide the strongest possible counterargument.`,
      },
      {
        role: "user",
        content: `RESEARCH QUESTION: "${question}"

SOURCES AVAILABLE:
${sourceList}

ANALYSIS TO CHALLENGE:
${analysisContent.slice(0, 4000)}
${debateContext ? `
DEBATE CONTEXT (steel-man already addressed in the analysis):
${debateContext}
NOTE: Do NOT re-challenge arguments already addressed above. Focus on NEW blind spots.
` : ""}
Identify the 3-5 most significant epistemic weaknesses. For each:
1. Quote the specific claim
2. Explain the logical flaw
3. Provide the strongest counterargument
4. Suggest what evidence would be needed to make the claim defensible

Also identify:
- The "kill shot": the single argument that could most damage this analysis's credibility
- 3 genuine strengths worth preserving

Return JSON:
{
  "challenges": [
    {
      "claim": "exact quote from analysis",
      "sourceSection": "which section",
      "challengeType": "one of: overstated_conclusion|missing_counterevidence|false_consensus|causation_from_correlation|selection_bias|temporal_fallacy|ecological_fallacy|straw_man|appeal_to_authority|missing_stakeholder|implementation_gap|unknown_unknowns|institutional_bias|recency_bias",
      "challenge": "the adversarial argument",
      "severity": "fatal|major|moderate|minor",
      "counterEvidence": ["what evidence supports the opposite"],
      "alternativeExplanation": "a plausible alternative interpretation",
      "requiredAction": "revise|defend|qualify|remove",
      "suggestedRevision": "how to fix this (optional)"
    }
  ],
  "killShot": "the single most damaging argument against this analysis",
  "strengths": ["genuine strength 1", "genuine strength 2", "genuine strength 3"]
}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 3000,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(result.content);
    return {
      challenges: (parsed.challenges || []).map((c: any) => ({
        claim: c.claim || "",
        sourceSection: c.sourceSection || "unknown",
        challengeType: c.challengeType || "overstated_conclusion",
        challenge: c.challenge || "",
        severity: c.severity || "moderate",
        counterEvidence: c.counterEvidence || [],
        alternativeExplanation: c.alternativeExplanation || "",
        requiredAction: c.requiredAction || "qualify",
        suggestedRevision: c.suggestedRevision,
      })) as AdvocateChallenge[],
      killShot: parsed.killShot || "",
      strengths: parsed.strengths || [],
      costUsd: result.costUsd,
    };
  } catch {
    return { challenges: [], killShot: "", strengths: [], costUsd: result.costUsd };
  }
}

// ============================================================================
// STRATEGIC CHALLENGE — Would this survive hostile expert scrutiny?
// ============================================================================

async function runStrategicChallenge(
  question: string,
  analysisContent: string,
  targetAudience: string,
  mode: "brief" | "strategic"
): Promise<{
  challenges: AdvocateChallenge[];
  killShot: string;
  hostileReview: string;
  futureVulnerabilities: string[];
  costUsd: number;
}> {
  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are a senior partner at McKinsey who has just received this analysis from a competing think tank. You are preparing a rebuttal for your client. Find every strategic weakness, every missing stakeholder, every implementation gap, every way this analysis could be wrong in 2 years.

You are also conducting a "pre-mortem": imagine it is 2 years from now and this analysis turned out to be badly wrong. What happened?`,
      },
      {
        role: "user",
        content: `RESEARCH QUESTION: "${question}"
TARGET AUDIENCE: ${targetAudience}
FORMAT: ${mode === "strategic" ? "Strategic Report (10-15 pages)" : "Research Brief (4-6 pages)"}

ANALYSIS:
${analysisContent.slice(0, 3000)}

Provide:
1. 2-3 strategic challenges (missing stakeholders, implementation gaps, political economy blind spots)
2. A hostile expert review (what would a senior McKinsey partner say to dismiss this?)
3. 3 future vulnerabilities (what could make this look naive in 2 years?)

Return JSON:
{
  "challenges": [
    {
      "claim": "the problematic claim or gap",
      "sourceSection": "section",
      "challengeType": "missing_stakeholder|implementation_gap|institutional_bias|unknown_unknowns",
      "challenge": "the strategic critique",
      "severity": "fatal|major|moderate|minor",
      "counterEvidence": [],
      "alternativeExplanation": "alternative framing",
      "requiredAction": "revise|qualify|defend|remove"
    }
  ],
  "killShot": "the strategic argument that would sink this with a hostile audience",
  "hostileReview": "what a McKinsey senior partner would say to dismiss this (2-3 sentences)",
  "futureVulnerabilities": ["vulnerability 1", "vulnerability 2", "vulnerability 3"]
}`,
      },
    ],
    temperature: 0.4,
    maxTokens: 2000,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(result.content);
    return {
      challenges: (parsed.challenges || []).map((c: any) => ({
        claim: c.claim || "",
        sourceSection: c.sourceSection || "unknown",
        challengeType: c.challengeType || "implementation_gap",
        challenge: c.challenge || "",
        severity: c.severity || "moderate",
        counterEvidence: c.counterEvidence || [],
        alternativeExplanation: c.alternativeExplanation || "",
        requiredAction: c.requiredAction || "qualify",
        suggestedRevision: c.suggestedRevision,
      })) as AdvocateChallenge[],
      killShot: parsed.killShot || "",
      hostileReview: parsed.hostileReview || "",
      futureVulnerabilities: parsed.futureVulnerabilities || [],
      costUsd: result.costUsd,
    };
  } catch {
    return { challenges: [], killShot: "", hostileReview: "", futureVulnerabilities: [], costUsd: result.costUsd };
  }
}

// ============================================================================
// INSTITUTION BENCHMARK — How does this compare to top institutions?
// ============================================================================

async function runInstitutionBenchmark(
  question: string,
  analysisContent: string,
  domain: string
): Promise<{ comparison: InstitutionComparison; costUsd: number }> {
  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are a research quality assessor who has read thousands of publications from McKinsey Global Institute, Brookings Institution, RAND Corporation, and France Stratégie. You know exactly what makes their publications authoritative and what NomosX needs to match or exceed that standard.`,
      },
      {
        role: "user",
        content: `RESEARCH QUESTION: "${question}"
DOMAIN: ${domain}

ANALYSIS EXCERPT:
${analysisContent.slice(0, 2500)}

Compare this analysis to the publication standards of:
1. McKinsey Global Institute (known for: data-driven, actionable, executive-friendly)
2. Brookings Institution (known for: policy depth, bipartisan rigor, evidence-based)
3. RAND Corporation (known for: systematic methodology, scenario planning, defense/policy)
4. France Stratégie (known for: long-term vision, economic modeling, public interest)

For each institution, score 0-100 and identify gaps.
Also identify: what do ALL top institutions do that this analysis doesn't?

Return JSON:
{
  "mckinsey": { "score": 0-100, "strengths": [], "gaps": [] },
  "brookings": { "score": 0-100, "strengths": [], "gaps": [] },
  "rand": { "score": 0-100, "strengths": [], "gaps": [] },
  "franceStrategie": { "score": 0-100, "strengths": [], "gaps": [] },
  "overall": "superior|comparable|inferior",
  "gaps": ["what all top institutions do that this analysis lacks"]
}`,
      },
    ],
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(result.content);
    return {
      comparison: {
        mckinsey: parsed.mckinsey || { score: 50, strengths: [], gaps: [] },
        brookings: parsed.brookings || { score: 50, strengths: [], gaps: [] },
        rand: parsed.rand || { score: 50, strengths: [], gaps: [] },
        franceStrategie: parsed.franceStrategie || { score: 50, strengths: [], gaps: [] },
        overall: parsed.overall || "comparable",
        gaps: parsed.gaps || [],
      },
      costUsd: result.costUsd,
    };
  } catch {
    return { comparison: defaultBenchmark(), costUsd: result.costUsd };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function defaultBenchmark(): InstitutionComparison {
  return {
    mckinsey: { score: 0, strengths: [], gaps: ["Benchmark unavailable"] },
    brookings: { score: 0, strengths: [], gaps: ["Benchmark unavailable"] },
    rand: { score: 0, strengths: [], gaps: ["Benchmark unavailable"] },
    franceStrategie: { score: 0, strengths: [], gaps: ["Benchmark unavailable"] },
    overall: "comparable",
    gaps: [],
  };
}

function buildRecommendation(
  verdict: AdvocateReport["verdict"],
  fatalChallenges: AdvocateChallenge[],
  majorChallenges: AdvocateChallenge[]
): string {
  if (verdict === "reject") {
    return `DO NOT PUBLISH. ${fatalChallenges.length} fatal flaw(s) detected: ${fatalChallenges.map(c => c.challengeType).join(", ")}. Requires fundamental revision.`;
  }
  if (verdict === "major_revision") {
    return `HOLD FOR REVISION. 1 fatal flaw must be resolved: "${fatalChallenges[0]?.challenge.slice(0, 100)}...". Address before publication.`;
  }
  if (verdict === "revise") {
    return `REVISE BEFORE PUBLISHING. ${majorChallenges.length} major issues should be addressed to meet think-tank quality standards.`;
  }
  return `CLEARED FOR PUBLICATION. Analysis meets quality standards. ${majorChallenges.length > 0 ? `Consider addressing ${majorChallenges.length} minor issue(s) to strengthen the publication.` : "Strong analysis ready for distribution."}`;
}
