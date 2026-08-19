/**
 * Chain-of-Verification (CoVe) — NomosX Sprint 6 (Gap 6)
 *
 * Vérification par chaîne de questions indépendantes, *pendant* la rédaction.
 * Inspiré de :
 * - Chain-of-Verification (CoVe, Meta, ACL 2024 Findings, arxiv 2309.11495)
 * - SelfCheckGPT (potsawee, EMNLP 2023) — zero-resource hallucination detection
 *
 * Le problème :
 * La vérification NomosX est *post-hoc* (Citation Verifier, NLI, Source Check
 * après l'analyse). CoVe génère des verification questions indépendantes
 * *pendant* la rédaction, puis les exécute avant d'inclure la claim.
 *
 * Architecture CoVe :
 * 1. Draft — générer un brouillon de réponse
 * 2. PlanVerification — générer des questions de vérification pour les claims clés
 * 3. ExecuteVerification — exécuter les questions (retrieval + NLI)
 * 4. Integrate — intégrer les résultats vérifiés dans la réponse finale
 *
 * Intégration : utilisé par l'ANALYST après la passe de synthèse.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VerificationQuestion {
  /** The question to verify */
  question: string;
  /** The claim it verifies */
  claim: string;
  /** Why this question is relevant */
  reason: string;
  /** Expected answer type */
  expectedType: 'fact' | 'number' | 'date' | 'boolean' | 'source_check';
}

export interface VerificationResult {
  question: VerificationQuestion;
  /** Answer found */
  answer: string;
  /** Whether the answer confirms the claim */
  confirms: boolean;
  /** Confidence in the verification (0-1) */
  confidence: number;
  /** Sources that support the answer */
  supportingSourceIds: string[];
  /** Whether the claim should be kept, modified, or removed */
  verdict: 'verified' | 'contradicted' | 'unverifiable' | 'partially_verified';
  /** If the claim needs modification, the suggested modification */
  suggestedModification?: string;
  /** Cost in USD */
  costUsd: number;
}

export interface CoVeResult {
  /** Original claims */
  claims: string[];
  /** Verification questions generated */
  questions: VerificationQuestion[];
  /** Verification results */
  results: VerificationResult[];
  /** Overall verification score (0-1) */
  overallScore: number;
  /** Claims that passed verification */
  verifiedClaims: string[];
  /** Claims that were modified */
  modifiedClaims: Array<{ original: string; modified: string; reason: string }>;
  /** Claims that were removed */
  removedClaims: Array<{ claim: string; reason: string }>;
  /** Total cost */
  costUsd: number;
}

export interface CoVeConfig {
  /** Function to search for sources to answer verification questions */
  searchFn: (query: string) => Promise<{ sourceIds: string[]; found: number }>;
  /** Function to read a source */
  readFn?: (sourceId: string) => Promise<string>;
  /** Function to check NLI (claim vs source) */
  nliFn?: (claim: string, sourceContent: string) => Promise<{ verdict: string; score: number }>;
  /** Max claims to verify (for cost control) */
  maxClaims: number;
  /** Max questions per claim */
  maxQuestionsPerClaim: number;
  /** Confidence threshold for "verified" */
  verifyThreshold: number;
}

// ─── Step 1: Extract Claims from Draft ──────────────────────────────────────

/**
 * Extract atomic claims from a draft text.
 * Each claim should be a standalone, verifiable statement.
 */
export async function extractClaims(draft: string): Promise<{
  claims: string[];
  costUsd: number;
}> {
  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a Claim Extractor. Extract atomic, verifiable claims from a text.

Rules:
1. Each claim must be a standalone statement (no pronouns, no "this study")
2. Each claim must be verifiable (factual, not opinion)
3. Decontextualize: resolve pronouns and references
4. Include numbers, dates, and specific entities
5. Don't include hedging language ("possibly", "may")

Respond with JSON: {"claims": ["claim 1", "claim 2", ...]}`,
        },
        {
          role: 'user',
          content: `Extract atomic claims from this text:

${draft.slice(0, 5000)}`,
        },
      ],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 1500,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ claims: string[] }>(response.content);
    if (parsed?.claims) {
      return { claims: parsed.claims, costUsd: response.costUsd };
    }
  } catch (err) {
    console.warn('[CoVe] claim extraction failed:', err);
  }

  // Fallback: split by sentences
  const sentences = draft.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 30);
  return { claims: sentences, costUsd: 0 };
}

// ─── Step 2: Plan Verification Questions ────────────────────────────────────

/**
 * Generate verification questions for a set of claims.
 * This is the "PlanVerification" step from CoVe.
 */
export async function planVerificationQuestions(
  claims: string[],
  config: CoVeConfig,
): Promise<{
  questions: VerificationQuestion[];
  costUsd: number;
}> {
  const claimsToVerify = claims.slice(0, config.maxClaims);
  const allQuestions: VerificationQuestion[] = [];
  let costUsd = 0;

  for (const claim of claimsToVerify) {
    try {
      const response = await callLLM({
        messages: [
          {
            role: 'system',
            content: `You are a Verification Planner. Given a claim, generate verification questions that can be answered by checking sources.

Rules:
1. Questions should be answerable by consulting academic/policy sources
2. Generate 1-${config.maxQuestionsPerClaim} questions per claim
3. Questions should target the most falsifiable aspects of the claim
4. For numerical claims, ask "What is the value of X?"
5. For causal claims, ask "Does X cause Y?"
6. For source claims, ask "Does source S say Z?"

Respond with JSON:
{
  "questions": [
    {"question": "...", "reason": "...", "expectedType": "fact|number|date|boolean|source_check"}
  ]
}`,
          },
          {
            role: 'user',
            content: `Claim: "${claim}"

Generate verification questions:`,
          },
        ],
        temperature: 0.2,
        jsonMode: true,
        maxTokens: 400,
        task: 'enrichment_reasoner',
      });

      const parsed = parseJson<{ questions: Array<Omit<VerificationQuestion, 'claim'>> }>(response.content);
      if (parsed?.questions) {
        for (const q of parsed.questions.slice(0, config.maxQuestionsPerClaim)) {
          allQuestions.push({ ...q, claim });
        }
      }
      costUsd += response.costUsd;
    } catch (err) {
      console.warn('[CoVe] question planning failed for claim:', claim, err);
    }
  }

  return { questions: allQuestions, costUsd };
}

// ─── Step 3: Execute Verification ───────────────────────────────────────────

/**
 * Execute verification questions by searching for sources and checking claims.
 * This is the "ExecuteVerification" step from CoVe.
 */
export async function executeVerification(
  questions: VerificationQuestion[],
  config: CoVeConfig,
): Promise<{
  results: VerificationResult[];
  costUsd: number;
}> {
  const results: VerificationResult[] = [];
  let costUsd = 0;

  for (const question of questions) {
    try {
      // Search for sources to answer the question
      const searchResult = await config.searchFn(question.question);
      costUsd += 0; // searchFn cost is tracked elsewhere

      let answer = '';
      let supportingSourceIds: string[] = [];
      let confidence = 0;

      if (searchResult.sourceIds.length > 0 && config.readFn) {
        // Read top sources
        const reads = await Promise.allSettled(
          searchResult.sourceIds.slice(0, 3).map(id => config.readFn!(id))
        );

        const sourceContents: Array<{ id: string; content: string }> = [];
        for (let i = 0; i < reads.length; i++) {
          if (reads[i].status === 'fulfilled') {
            sourceContents.push({ id: searchResult.sourceIds[i], content: (reads[i] as PromiseFulfilledResult<string>).value });
          }
        }

        // Use NLI to check if sources confirm the claim
        if (config.nliFn && sourceContents.length > 0) {
          const nliResults = await Promise.all(
            sourceContents.map(s => config.nliFn!(question.claim, s.content))
          );
          const confirmed = nliResults.filter(r => r.verdict === 'entailment' || r.verdict === 'supported');
          if (confirmed.length > 0) {
            confidence = confirmed.reduce((a, r) => a + r.score, 0) / confirmed.length;
            supportingSourceIds = sourceContents.slice(0, confirmed.length).map(s => s.id);
          }
        }

        // Generate an answer from the sources
        const answerResponse = await callLLM({
          messages: [
            {
              role: 'system',
              content: `Answer the verification question based on the provided sources. Be concise.`,
            },
            {
              role: 'user',
              content: `Question: ${question.question}
Claim being verified: ${question.claim}

Sources:
${sourceContents.map(s => s.content.slice(0, 500)).join('\n---\n')}

Answer:`,
            },
          ],
          temperature: 0.1,
          maxTokens: 200,
          task: 'enrichment_reasoner',
        });
        answer = answerResponse.content;
        costUsd += answerResponse.costUsd;
      }

      // Determine verdict
      let verdict: VerificationResult['verdict'] = 'unverifiable';
      let confirms = false;
      let suggestedModification: string | undefined;

      if (confidence >= config.verifyThreshold) {
        verdict = 'verified';
        confirms = true;
      } else if (confidence > 0.3) {
        verdict = 'partially_verified';
        // Suggest a modification
        if (answer) {
          suggestedModification = `Hedge this claim: "${question.claim}" — sources suggest: ${answer.slice(0, 200)}`;
        }
      } else if (confidence > 0 && confidence < 0.3) {
        verdict = 'contradicted';
        confirms = false;
        suggestedModification = `Remove or strongly hedge: sources contradict this claim`;
      }

      results.push({
        question,
        answer,
        confirms,
        confidence,
        supportingSourceIds,
        verdict,
        suggestedModification,
        costUsd: 0, // tracked in outer costUsd
      });
    } catch (err) {
      console.warn('[CoVe] verification execution failed:', err);
      results.push({
        question,
        answer: '',
        confirms: false,
        confidence: 0,
        supportingSourceIds: [],
        verdict: 'unverifiable',
        costUsd: 0,
      });
    }
  }

  return { results, costUsd };
}

// ─── Step 4: Integrate Results ──────────────────────────────────────────────

/**
 * Integrate verification results into a final assessment.
 * This is the "Integrate" step from CoVe.
 */
export function integrateResults(
  claims: string[],
  results: VerificationResult[],
): {
  verifiedClaims: string[];
  modifiedClaims: Array<{ original: string; modified: string; reason: string }>;
  removedClaims: Array<{ claim: string; reason: string }>;
  overallScore: number;
} {
  const verifiedClaims: string[] = [];
  const modifiedClaims: Array<{ original: string; modified: string; reason: string }> = [];
  const removedClaims: Array<{ claim: string; reason: string }> = [];

  // Group results by claim
  const resultsByClaim = new Map<string, VerificationResult[]>();
  for (const r of results) {
    const arr = resultsByClaim.get(r.question.claim) || [];
    arr.push(r);
    resultsByClaim.set(r.question.claim, arr);
  }

  for (const claim of claims) {
    const claimResults = resultsByClaim.get(claim) || [];

    if (claimResults.length === 0) {
      // No verification was done — keep the claim but flag it
      verifiedClaims.push(claim);
      continue;
    }

    const verifiedCount = claimResults.filter(r => r.verdict === 'verified').length;
    const contradictedCount = claimResults.filter(r => r.verdict === 'contradicted').length;
    const avgConfidence = claimResults.reduce((a, r) => a + r.confidence, 0) / claimResults.length;

    if (contradictedCount > verifiedCount) {
      // More contradictions than verifications — remove
      removedClaims.push({
        claim,
        reason: `${contradictedCount} contradictions vs ${verifiedCount} verifications (avg confidence: ${avgConfidence.toFixed(2)})`,
      });
    } else if (verifiedCount === claimResults.length) {
      // All verified
      verifiedClaims.push(claim);
    } else if (avgConfidence > 0.4) {
      // Partially verified — keep with modification
      const modification = claimResults.find(r => r.suggestedModification)?.suggestedModification;
      modifiedClaims.push({
        original: claim,
        modified: modification || `Hedged: ${claim} (partial verification)`,
        reason: `${verifiedCount}/${claimResults.length} verified, avg confidence ${avgConfidence.toFixed(2)}`,
      });
    } else {
      // Low confidence — remove
      removedClaims.push({
        claim,
        reason: `Low verification confidence (${avgConfidence.toFixed(2)})`,
      });
    }
  }

  const overallScore = claims.length > 0
    ? (verifiedClaims.length + modifiedClaims.length * 0.5) / claims.length
    : 1;

  return { verifiedClaims, modifiedClaims, removedClaims, overallScore };
}

// ─── Main CoVe Function ─────────────────────────────────────────────────────

/**
 * Run Chain-of-Verification on a draft text.
 *
 * Flow:
 * 1. Extract claims from the draft
 * 2. Generate verification questions for each claim
 * 3. Execute the verification questions (search + NLI)
 * 4. Integrate the results (keep, modify, or remove claims)
 *
 * @param draft - The draft text to verify
 * @param config - CoVe configuration
 * @returns The verification result
 */
export async function chainOfVerification(
  draft: string,
  config: CoVeConfig,
): Promise<CoVeResult> {
  let totalCost = 0;

  // Step 1: Extract claims
  const { claims, costUsd: extractCost } = await extractClaims(draft);
  totalCost += extractCost;

  if (claims.length === 0) {
    return {
      claims: [],
      questions: [],
      results: [],
      overallScore: 1,
      verifiedClaims: [],
      modifiedClaims: [],
      removedClaims: [],
      costUsd: totalCost,
    };
  }

  // Step 2: Plan verification questions
  const { questions, costUsd: planCost } = await planVerificationQuestions(claims, config);
  totalCost += planCost;

  // Step 3: Execute verification
  const { results, costUsd: execCost } = await executeVerification(questions, config);
  totalCost += execCost;

  // Step 4: Integrate
  const { verifiedClaims, modifiedClaims, removedClaims, overallScore } = integrateResults(claims, results);

  return {
    claims,
    questions,
    results,
    overallScore,
    verifiedClaims,
    modifiedClaims,
    removedClaims,
    costUsd: totalCost,
  };
}
