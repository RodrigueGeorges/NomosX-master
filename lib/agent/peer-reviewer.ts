/**
 * Peer Reviewer Agent — NomosX 2026
 *
 * Inspired by Feynman (companion-inc/feynman) and OpenResearcher:
 * - Four bundled research agents: Researcher, Reviewer, Writer, Verifier
 * - Simulated peer review with severity-graded feedback
 * - Checks: novelty, methodology, citations, clarity, significance, limitations
 *
 * This agent runs BEFORE the EDITOR to catch flaws that the primary ANALYST missed.
 * It acts as an external reviewer, not a friend of the analysis.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReviewIssue {
  category: 'methodology' | 'citations' | 'clarity' | 'significance' | 'limitations' | 'novelty' | 'logic' | 'bias';
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  location?: string; // section or sentence
  description: string;
  suggestedFix: string;
}

export interface PeerReview {
  overallScore: number; // 0-100
  recommendation: 'accept' | 'minor_revision' | 'major_revision' | 'reject';
  summary: string;
  issues: ReviewIssue[];
  strengths: string[];
  weaknesses: string[];
  costUsd: number;
}

// ─── Main Review Function ───────────────────────────────────────────────────

export async function runPeerReview(
  analysisText: string,
  sources: any[],
  options: { title?: string; reviewDepth?: 'light' | 'standard' | 'deep' } = {},
): Promise<PeerReview> {
  const title = options.title || 'Research brief';
  const depth = options.reviewDepth || 'standard';

  const sourceList = sources.slice(0, 20).map((s, i) => `[${i + 1}] ${s.title || s.id} (${s.year || 'n/a'})`).join('\n');
  const text = analysisText.slice(0, 12000);

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a senior peer reviewer at a top-tier think tank or journal (RAND, Brookings, Nature). Review the attached research brief as if you were an external referee. Be critical but constructive.`,
      },
      {
        role: 'user',
        content: `TITLE: ${title}

ANALYSIS TO REVIEW:
${text}

SOURCES USED:
${sourceList}

REVIEW DEPTH: ${depth}

TASK: Conduct a peer review. Return JSON with:
{
  "overallScore": 0-100,
  "recommendation": "accept|minor_revision|major_revision|reject",
  "summary": "One-paragraph synthesis of the review",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "issues": [
    {
      "category": "methodology|citations|clarity|significance|limitations|novelty|logic|bias",
      "severity": "critical|major|minor|suggestion",
      "location": "section or claim where it occurs",
      "description": "What is wrong or missing",
      "suggestedFix": "How to fix it"
    }
  ]
}

Review criteria:
- Methodology: is the approach sound? are the methods described or inferable?
- Citations: do citations actually support the claims? are there missing citations?
- Clarity: is the argument easy to follow? is the prose clean?
- Significance: is the bottom line important for a decision-maker?
- Limitations: are limitations and uncertainty acknowledged?
- Novelty: does the brief add value beyond a summary?
- Logic: any contradictions, non-sequiturs, or overstatements?
- Bias: any evident geographic, temporal, or ideological bias?

Severity rules:
- critical: factual error, misattributed citation, unsupported major claim
- major: missing key context, overstatement, weak methodology
- minor: unclear phrasing, minor citation gap
- suggestion: stylistic or optional improvement

Be concise. Return valid JSON only.`,
      },
    ],
    task: 'critique',
    temperature: 0.2,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<PeerReview>(response.content);
  if (!parsed) {
    return {
      overallScore: 50,
      recommendation: 'minor_revision',
      summary: 'Peer review parse failed; assuming minor revision needed.',
      issues: [],
      strengths: [],
      weaknesses: [],
      costUsd: response.costUsd,
    };
  }

  return { ...parsed, costUsd: response.costUsd };
}

// ─── Render review as injection text ────────────────────────────────────────

export function renderPeerReviewInjection(review: PeerReview): string {
  const critical = review.issues.filter(i => i.severity === 'critical').length;
  const major = review.issues.filter(i => i.severity === 'major').length;
  const lines = [
    `## PEER REVIEW FEEDBACK (score ${review.overallScore}/100, recommendation: ${review.recommendation})`,
    '',
    `Summary: ${review.summary}`,
    '',
    `Strengths:`,
    ...review.strengths.map(s => `- ${s}`),
    '',
    `Weaknesses:`,
    ...review.weaknesses.map(w => `- ${w}`),
    '',
    `Issues to address (${critical} critical, ${major} major):`,
    ...review.issues.map(i => `- [${i.severity.toUpperCase()}] ${i.category}: ${i.description} ${i.location ? `(location: ${i.location})` : ''} → Fix: ${i.suggestedFix}`),
  ];
  return lines.join('\n');
}
