/**
 * RAV (Recon-Answer-Verify) Citation Verification — NomosX
 *
 * Inspired by:
 * - RAV (EMNLP 2025): Three-agent framework that iteratively generates
 *   and answers sub-questions to verify different claim aspects.
 *   Outperforms SOTA by 57.5% on PFO dataset.
 * - CiteGuard (ACL 2026): Retrieval-aware agent for citation attribution.
 * - CiteCheck: Hybrid scholarly retrieval + LLM verifier (88.9% accuracy).
 * - FIRE (NAACL 2025): Fact-checking with iterative retrieval, 7.6x cheaper.
 *
 * Architecture:
 * - For controversial/ungrounded claims, decompose into 2-3 sub-questions
 * - For each sub-question, retrieve targeted evidence from sources
 * - Answer each sub-question using retrieved evidence
 * - Verify the original claim against the sub-answers
 * - Aggregate into a composite verdict
 *
 * Integration:
 * - claim-grounding.ts: call verifyWithRAV() for claims with low grounding
 * - critic-agent.ts: use RAV verdicts for controversial claims
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SubQuestion {
  question: string;
  aspect: string; // what aspect of the claim this addresses
}

export interface SubAnswer {
  question: string;
  answer: string;
  evidence: string;
  confidence: number; // 0-100
  supportsClaim: boolean | null; // true=supports, false=contradicts, null=unclear
}

export interface RAVVerdict {
  claim: string;
  subQuestions: SubQuestion[];
  subAnswers: SubAnswer[];
  compositeVerdict: 'supported' | 'partially_supported' | 'unsupported' | 'contradicted' | 'unverifiable';
  confidence: number; // 0-100
  reasoning: string;
  costUsd: number;
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Decompose a claim into sub-questions for verification.
 * Each sub-question targets a specific aspect of the claim.
 */
export async function decomposeClaim(claim: string): Promise<SubQuestion[]> {
  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: `You are a fact-checking expert. Decompose this claim into 2-3 sub-questions that, when answered, will allow you to verify the claim.

CLAIM: "${claim}"

Each sub-question should target a DIFFERENT aspect of the claim:
- Factual assertions (specific numbers, dates, events)
- Causal relationships (does X cause Y?)
- Attribution (did the cited source actually say this?)
- Context (is the claim missing important context?)

Return JSON:
{
  "subQuestions": [
    { "question": "specific verifiable question", "aspect": "factual|causal|attribution|context" }
  ]
}`
      }],
      temperature: 0.15,
      jsonMode: true,
      maxTokens: 400,
      enableCache: true,
      task: 'fact_check',
    });

    const result = parseJson<{ subQuestions: SubQuestion[] }>(response.content);
    return result?.subQuestions?.slice(0, 3) || [];
  } catch (error) {
    console.warn('[RAV] Decomposition failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Answer a sub-question using the provided sources as evidence.
 */
export async function answerSubQuestion(
  question: string,
  sources: Array<{ title: string; abstract: string; text?: string }>,
): Promise<SubAnswer> {
  try {
    const evidenceText = sources.slice(0, 5).map((s, i) =>
      `[SRC-${i + 1}] ${s.title}\n${(s.text || s.abstract || '').slice(0, 500)}`
    ).join('\n---\n');

    const response = await callLLM({
      messages: [{
        role: 'user',
        content: `You are a research analyst verifying a specific aspect of a claim.

SUB-QUESTION: ${question}

AVAILABLE EVIDENCE:
${evidenceText}

Answer the sub-question based ONLY on the evidence provided. If the evidence doesn't address this question, say "INSUFFICIENT EVIDENCE".

Return JSON:
{
  "answer": "your answer based on the evidence",
  "evidence": "which source(s) support this answer, e.g. [SRC-1], [SRC-3]",
  "confidence": 0-100,
  "supportsClaim": true|false|null
}`
      }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 300,
      enableCache: true,
      task: 'citation_verification',
    });

    const result = parseJson<SubAnswer>(response.content);
    if (result) return result;

    return { question, answer: 'INSUFFICIENT EVIDENCE', evidence: '', confidence: 0, supportsClaim: null };
  } catch (error) {
    console.warn('[RAV] Answer failed:', error instanceof Error ? error.message : String(error));
    return { question, answer: 'ERROR', evidence: '', confidence: 0, supportsClaim: null };
  }
}

/**
 * Aggregate sub-answers into a composite verdict.
 */
export async function aggregateVerdict(
  claim: string,
  subAnswers: SubAnswer[],
): Promise<{ verdict: RAVVerdict['compositeVerdict']; confidence: number; reasoning: string }> {
  if (subAnswers.length === 0) {
    return { verdict: 'unverifiable', confidence: 0, reasoning: 'No sub-questions could be generated' };
  }

  const supports = subAnswers.filter(a => a.supportsClaim === true).length;
  const contradicts = subAnswers.filter(a => a.supportsClaim === false).length;
  const unclear = subAnswers.filter(a => a.supportsClaim === null).length;
  const total = subAnswers.length;

  const avgConfidence = subAnswers.reduce((sum, a) => sum + a.confidence, 0) / total;

  let verdict: RAVVerdict['compositeVerdict'];
  if (supports === total && avgConfidence >= 70) {
    verdict = 'supported';
  } else if (supports > contradicts && supports > unclear) {
    verdict = 'partially_supported';
  } else if (contradicts >= supports && contradicts > unclear) {
    verdict = 'contradicted';
  } else if (unclear === total) {
    verdict = 'unverifiable';
  } else {
    verdict = 'unsupported';
  }

  const reasoning = `Sub-questions: ${total} | Supports: ${supports} | Contradicts: ${contradicts} | Unclear: ${unclear} | Avg confidence: ${Math.round(avgConfidence)}%`;

  return { verdict, confidence: Math.round(avgConfidence), reasoning };
}

/**
 * Full RAV verification pipeline for a single claim.
 *
 * @param claim - The claim to verify
 * @param sources - Available sources for evidence
 * @returns RAVVerdict with decomposed questions, answers, and composite verdict
 */
export async function verifyWithRAV(
  claim: string,
  sources: Array<{ title: string; abstract: string; text?: string }>,
): Promise<RAVVerdict> {
  // Step 1: Decompose the claim into sub-questions
  const subQuestions = await decomposeClaim(claim);

  if (subQuestions.length === 0) {
    return {
      claim,
      subQuestions: [],
      subAnswers: [],
      compositeVerdict: 'unverifiable',
      confidence: 0,
      reasoning: 'Could not decompose claim into sub-questions',
      costUsd: 0,
    };
  }

  // Step 2: Answer each sub-question using available sources
  const subAnswers: SubAnswer[] = [];
  for (const sq of subQuestions) {
    const answer = await answerSubQuestion(sq.question, sources);
    subAnswers.push(answer);
  }

  // Step 3: Aggregate into composite verdict
  const { verdict, confidence, reasoning } = await aggregateVerdict(claim, subAnswers);

  return {
    claim,
    subQuestions,
    subAnswers,
    compositeVerdict: verdict,
    confidence,
    reasoning,
    costUsd: 0, // Cost tracking handled by callLLM
  };
}

/**
 * Batch RAV verification for multiple claims.
 * Only verifies claims that are controversial or have low grounding.
 *
 * @param claims - Claims to verify
 * @param sources - Available sources
 * @param options - Filter options
 */
export async function batchVerifyWithRAV(
  claims: Array<{ text: string; grounded?: boolean; controversial?: boolean }>,
  sources: Array<{ title: string; abstract: string; text?: string }>,
  options?: { maxConcurrent?: number; onlyControversial?: boolean },
): Promise<RAVVerdict[]> {
  const onlyControversial = options?.onlyControversial ?? true;

  // Filter claims that need RAV verification
  const claimsToVerify = onlyControversial
    ? claims.filter(c => c.controversial || !c.grounded)
    : claims;

  if (claimsToVerify.length === 0) return [];

  console.log(`[RAV] Verifying ${claimsToVerify.length}/${claims.length} claims (controversial/ungrounded)`);

  // Verify in parallel (max 3 concurrent to avoid rate limits)
  const maxConcurrent = options?.maxConcurrent ?? 3;
  const verdicts: RAVVerdict[] = [];

  for (let i = 0; i < claimsToVerify.length; i += maxConcurrent) {
    const batch = claimsToVerify.slice(i, i + maxConcurrent);
    const batchVerdicts = await Promise.all(
      batch.map(c => verifyWithRAV(c.text, sources))
    );
    verdicts.push(...batchVerdicts);
  }

  return verdicts;
}
