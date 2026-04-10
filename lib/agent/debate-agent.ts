/**
 * NomosX DEBATE Agent — Adversarial Deliberation
 * 
 * A dedicated agent that generates the STRONGEST possible counter-arguments
 * to any analysis. Unlike the adversarial reviewer in Critical Loop (which
 * reviews a draft), this agent operates at the EVIDENCE level:
 * 
 * 1. Takes the analysis question + sources + readings
 * 2. Identifies the dominant thesis
 * 3. Constructs the STEEL MAN of the opposing view
 * 4. Finds evidence FROM THE SAME SOURCES that supports the counter
 * 5. Produces a structured debate with weighted arguments
 * 6. Forces the final synthesis to acknowledge both sides
 * 
 * This is what separates a think tank from an echo chamber.
 */

import { callLLM } from '../llm/unified-llm';
import { AgentRole, assertPermission } from '../governance/index';

// ============================================================================
// TYPES
// ============================================================================

export interface DebateArgument {
  claim: string;
  evidence: string[];           // [SRC-N] references
  strength: "strong" | "moderate" | "weak";
  methodology: string;          // What type of evidence supports this
  limitations: string[];        // Weaknesses of this argument
}

export interface DebatePosition {
  label: string;                // e.g., "Carbon taxes reduce emissions effectively"
  arguments: DebateArgument[];
  overallStrength: number;      // 0-100
  proponents: string[];         // Which sources support this position
}

export interface DebateResult {
  question: string;
  dominantThesis: string;
  position1: DebatePosition;    // The dominant view
  position2: DebatePosition;    // The steel-man counter
  synthesis: string;            // Balanced conclusion acknowledging both
  nuances: string[];            // Important caveats and edge cases
  whatWouldChangeOurMind: string[]; // What evidence would shift the balance
  confidenceInDominant: number; // 0-100, how confident we are in position 1
  debateQuality: {
    evidenceBalance: number;    // 0-100, are both sides well-supported?
    steelManStrength: number;   // 0-100, how strong is the counter?
    synthesisQuality: number;   // 0-100, does synthesis acknowledge both?
  };
  costUsd: number;
}

// ============================================================================
// DEBATE GENERATION
// ============================================================================

/**
 * Run a structured adversarial debate on a research question.
 * 
 * @param question - The research question
 * @param sources - Ranked sources with abstracts
 * @param readings - Reader agent output (claims, methods, results)
 * @param analysisText - Optional: existing analysis to debate against
 */
export async function debateAgent(
  question: string,
  sources: any[],
  readings?: any[],
  analysisText?: string
): Promise<DebateResult> {
  assertPermission(AgentRole.ANALYST, "write:analysis");

  console.log(`[DEBATE] Starting adversarial deliberation for: "${question.slice(0, 80)}..."`);
  let totalCost = 0;

  // Build source context
  const sourceContext = sources.map((s, i) => {
    const reading = readings?.[i];
    const claims = reading?.claims?.join("; ") || "No claims extracted";
    const methods = reading?.methods?.join("; ") || "No methods";
    const results = reading?.results?.join("; ") || "No results";
    return `[SRC-${i + 1}] ${s.title} (${s.year || "N/A"}, ${s.provider})
Claims: ${claims}
Methods: ${methods}
Results: ${results}
Quality: ${s.qualityScore || 0}/100 | Citations: ${s.citationCount || 0}`;
  }).join("\n\n");

  // ── PASS 1: Identify dominant thesis and construct steel-man counter ──
  console.log(`[DEBATE] Pass 1: Thesis identification + steel-man construction`);

  const pass1Response = await callLLM({
    messages: [{
      role: "system",
      content: `You are a world-class debate moderator at an elite policy think tank. Your job is to ensure BOTH sides of every issue are represented with maximum intellectual rigor. You must be fair, precise, and evidence-based. Never strawman — always steel-man.`
    }, {
      role: "user",
      content: `RESEARCH QUESTION: ${question}

${analysisText ? `EXISTING ANALYSIS (first 3000 chars):\n${analysisText.slice(0, 3000)}\n\n` : ""}SOURCES:
${sourceContext}

TASK: Identify the dominant thesis emerging from these sources, then construct the STRONGEST possible counter-argument.

Rules:
1. The counter-argument must be the STEEL MAN — the strongest version an intelligent opponent would make
2. Both positions must cite specific [SRC-N] references
3. Each argument must specify its evidence type (RCT, meta-analysis, observational, theoretical, etc.)
4. Acknowledge the limitations of BOTH positions
5. Do NOT create a false equivalence — if evidence strongly favors one side, say so

Return JSON:
{
  "dominantThesis": "The main conclusion from the evidence",
  "position1": {
    "label": "Clear statement of the dominant position",
    "arguments": [
      {
        "claim": "Specific claim",
        "evidence": ["SRC-1", "SRC-3"],
        "strength": "strong|moderate|weak",
        "methodology": "Type of evidence (RCT, meta-analysis, etc.)",
        "limitations": ["Weakness of this argument"]
      }
    ],
    "overallStrength": 0-100,
    "proponents": ["SRC-1", "SRC-3", "SRC-5"]
  },
  "position2": {
    "label": "Clear statement of the steel-man counter",
    "arguments": [
      {
        "claim": "Specific counter-claim",
        "evidence": ["SRC-2", "SRC-4"],
        "strength": "strong|moderate|weak",
        "methodology": "Type of evidence",
        "limitations": ["Weakness of this counter"]
      }
    ],
    "overallStrength": 0-100,
    "proponents": ["SRC-2", "SRC-4"]
  },
  "confidenceInDominant": 0-100
}`
    }],
    temperature: 0.25,
    jsonMode: true,
    maxTokens: 4000,
    enableCache: true,
  });

  totalCost += pass1Response.costUsd;
  const pass1 = JSON.parse(pass1Response.content);

  // ── PASS 2: Synthesis + nuances + what would change our mind ──
  console.log(`[DEBATE] Pass 2: Synthesis and nuance extraction`);

  const pass2Response = await callLLM({
    messages: [{
      role: "system",
      content: `You are a senior policy analyst producing the final synthesis of a structured debate. You must be intellectually honest, acknowledge uncertainty, and identify what evidence would change the conclusion.`
    }, {
      role: "user",
      content: `QUESTION: ${question}

POSITION 1 (Dominant, strength ${pass1.position1?.overallStrength || 0}/100):
${pass1.position1?.label || "N/A"}
Arguments: ${JSON.stringify(pass1.position1?.arguments?.map((a: any) => a.claim) || [])}

POSITION 2 (Counter, strength ${pass1.position2?.overallStrength || 0}/100):
${pass1.position2?.label || "N/A"}
Arguments: ${JSON.stringify(pass1.position2?.arguments?.map((a: any) => a.claim) || [])}

Confidence in dominant: ${pass1.confidenceInDominant || 50}%

Produce:
1. A balanced SYNTHESIS (3-5 sentences) that acknowledges both positions and explains where the evidence points
2. NUANCES: Important caveats, edge cases, and context-dependent factors (max 5)
3. WHAT WOULD CHANGE OUR MIND: Specific evidence that would shift the balance toward position 2 (max 4)
4. DEBATE QUALITY assessment

Return JSON:
{
  "synthesis": "Balanced conclusion...",
  "nuances": ["Important caveat 1", "Edge case 2"],
  "whatWouldChangeOurMind": ["If a large-scale RCT showed...", "If longitudinal data revealed..."],
  "debateQuality": {
    "evidenceBalance": 0-100,
    "steelManStrength": 0-100,
    "synthesisQuality": 0-100
  }
}`
    }],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 2000,
    enableCache: true,
  });

  totalCost += pass2Response.costUsd;
  const pass2 = JSON.parse(pass2Response.content);

  const result: DebateResult = {
    question,
    dominantThesis: pass1.dominantThesis || "",
    position1: {
      label: pass1.position1?.label || "",
      arguments: (pass1.position1?.arguments || []).map((a: any) => ({
        claim: a.claim || "",
        evidence: a.evidence || [],
        strength: a.strength || "moderate",
        methodology: a.methodology || "unspecified",
        limitations: a.limitations || [],
      })),
      overallStrength: pass1.position1?.overallStrength || 50,
      proponents: pass1.position1?.proponents || [],
    },
    position2: {
      label: pass1.position2?.label || "",
      arguments: (pass1.position2?.arguments || []).map((a: any) => ({
        claim: a.claim || "",
        evidence: a.evidence || [],
        strength: a.strength || "moderate",
        methodology: a.methodology || "unspecified",
        limitations: a.limitations || [],
      })),
      overallStrength: pass1.position2?.overallStrength || 50,
      proponents: pass1.position2?.proponents || [],
    },
    synthesis: pass2.synthesis || "",
    nuances: pass2.nuances || [],
    whatWouldChangeOurMind: pass2.whatWouldChangeOurMind || [],
    confidenceInDominant: pass1.confidenceInDominant || 50,
    debateQuality: {
      evidenceBalance: pass2.debateQuality?.evidenceBalance || 50,
      steelManStrength: pass2.debateQuality?.steelManStrength || 50,
      synthesisQuality: pass2.debateQuality?.synthesisQuality || 50,
    },
    costUsd: totalCost,
  };

  console.log(`[DEBATE] ✅ Complete: P1 strength=${result.position1.overallStrength}, P2 strength=${result.position2.overallStrength}, confidence=${result.confidenceInDominant}%, cost=$${totalCost.toFixed(4)}`);

  return result;
}
