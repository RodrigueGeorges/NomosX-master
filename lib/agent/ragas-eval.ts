/**
 * RAGAS-style Evaluation — NomosX 2026
 *
 * Inspired by the RAGAS framework (Retrieval-Augmented Generation Assessment).
 * Evaluates the RAG pipeline without human labels by using the LLM itself
 * as an evaluator on:
 *  - Faithfulness: does the answer stick to the retrieved context?
 *  - Answer Relevancy: does the answer address the question?
 *  - Context Precision: how much of the retrieved context is relevant?
 *  - Context Recall: did we retrieve the information needed to answer?
 *
 * Reference: https://github.com/explodinggradients/ragas
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RagasMetrics {
  faithfulness: number;      // 0-100: answer supported by context
  answerRelevancy: number;   // 0-100: answer addresses question
  contextPrecision: number;  // 0-100: retrieved context is relevant
  contextRecall: number;     // 0-100: all needed info was retrieved
  overall: number;           // 0-100 composite
}

export interface RagasEvaluation {
  question: string;
  answer: string;
  contexts: string[];
  metrics: RagasMetrics;
  explanation: string;
  costUsd: number;
}

// ─── Main Eval ──────────────────────────────────────────────────────────────

export async function evaluateRAG(
  question: string,
  answer: string,
  contexts: string[],
): Promise<RagasEvaluation> {
  const joinedContexts = contexts.map((c, i) => `--- Context ${i + 1} ---\n${c.slice(0, 2000)}`).join('\n\n');
  const answerShort = answer.slice(0, 4000);

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are a RAGAS evaluator. Evaluate a question-answering system on four metrics. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `QUESTION: ${question}

ANSWER: ${answerShort}

RETRIEVED CONTEXTS:
${joinedContexts}

Evaluate the following metrics (0-100 each):
1. **Faithfulness**: every claim in the answer is supported by the retrieved contexts.
2. **Answer Relevancy**: the answer directly addresses the question, no off-topic content.
3. **Context Precision**: the retrieved contexts are mostly relevant to the question.
4. **Context Recall**: the contexts contain enough information to fully answer the question.

Return JSON:
{
  "metrics": {
    "faithfulness": 0-100,
    "answerRelevancy": 0-100,
    "contextPrecision": 0-100,
    "contextRecall": 0-100
  },
  "explanation": "short explanation of the scores"
}

Be critical. A good RAG system should score >70 on all four.`,
      },
    ],
    task: 'critique',
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<{ metrics: RagasMetrics; explanation: string }>(response.content);
  if (!parsed) {
    return {
      question,
      answer,
      contexts,
      metrics: { faithfulness: 0, answerRelevancy: 0, contextPrecision: 0, contextRecall: 0, overall: 0 },
      explanation: 'RAGAS parse failed',
      costUsd: response.costUsd,
    };
  }

  const m = parsed.metrics;
  const overall = Math.round((m.faithfulness + m.answerRelevancy + m.contextPrecision + m.contextRecall) / 4);

  return {
    question,
    answer,
    contexts,
    metrics: { ...m, overall },
    explanation: parsed.explanation,
    costUsd: response.costUsd,
  };
}

// ─── Convenience: evaluate brief against sources ────────────────────────────

export async function evaluateBriefRAG(
  question: string,
  html: string,
  sources: any[],
): Promise<RagasEvaluation> {
  const answer = stripHtml(html).slice(0, 4000);
  const contexts = sources
    .filter(s => s.abstract || s.summary || s.fullText)
    .slice(0, 15)
    .map(s => `${s.title || s.id}\n${(s.abstract || s.summary || s.fullText || '').slice(0, 1500)}`);
  return evaluateRAG(question, answer, contexts);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
