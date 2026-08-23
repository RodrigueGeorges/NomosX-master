/**
 * PRIMARY DATA SYNTHESIZER — NomosX
 *
 * Intègre des données primaires (entretiens d'experts, enquêtes, mémos,
 * datasets, observations terrain) dans un brief de think tank.
 *
 * Inspirations :
 * - Harvard Kennedy School — primary evidence in policy memos
 * - RAND — structured interview synthesis and Delphi panels
 * - Brookings — field research and expert quotes
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PrimarySourceType = 'expert_interview' | 'survey' | 'dataset' | 'memo' | 'field_observation';

export interface PrimarySourceInput {
  id: string;
  type: PrimarySourceType;
  title?: string;
  date?: string;
  author?: string;
  role?: string;
  organization?: string;
  /** Raw content, transcription, or memo text */
  content: string;
  /** Anonymization level */
  attribution?: 'named' | 'role_only' | 'anonymous';
  /** Methodology note for credibility */
  methodology?: string;
  /** Size of sample if survey/dataset */
  sampleSize?: number;
}

export interface SynthesizedFinding {
  finding: string;
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
  policyImplication: string;
}

export interface ExpertQuote {
  quote: string;
  sourceId: string;
  attribution: string;
  role: string;
  organization?: string;
  finding: string;
}

export interface PrimaryDataSynthesis {
  summary: string;
  findings: SynthesizedFinding[];
  quotes: ExpertQuote[];
  limitations: string[];
  methodNote: string;
  costUsd: number;
}

export interface PrimaryDataOptions {
  /** If provided, synthesize this primary material alongside the brief */
  inputs?: PrimarySourceInput[];
  question?: string;
  maxFindings?: number;
  maxQuotes?: number;
}

// ─── Synthesis ──────────────────────────────────────────────────────────────

export async function synthesizePrimaryData(
  question: string,
  inputs: PrimarySourceInput[],
  options: PrimaryDataOptions = {},
): Promise<PrimaryDataSynthesis> {
  if (!inputs.length) {
    return {
      summary: 'No primary data provided.',
      findings: [],
      quotes: [],
      limitations: [],
      methodNote: '',
      costUsd: 0,
    };
  }

  const maxFindings = options.maxFindings ?? 6;
  const maxQuotes = options.maxQuotes ?? 4;

  const inputsBlock = inputs.map((s, i) => `--- [PRI-SRC-${i + 1}] ---
ID: ${s.id}
Type: ${s.type}
Title: ${s.title ?? 'n/a'}
Date: ${s.date ?? 'n/a'}
Author/Expert: ${s.author ?? 'n/a'}
Role: ${s.role ?? 'n/a'}
Organization: ${s.organization ?? 'n/a'}
Attribution: ${s.attribution ?? 'role_only'}
Methodology/Sample: ${s.methodology ?? 'n/a'} ${s.sampleSize ? ` (n=${s.sampleSize})` : ''}
Content:
${s.content.slice(0, 4000)}
`).join('\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: `You are a senior researcher at a top-tier think tank. Your job is to synthesize primary research material (interviews, surveys, datasets, memos) into policy-usable findings.

RULES:
- Distinguish fact from interpretation.
- Quote directly only when the source is credible and the quote is substantive.
- Surface limitations (sample bias, partial view, methodology limits).
- Connect findings to the policy question.
- Output valid JSON only.`,
      },
      {
        role: 'user',
        content: `POLICY QUESTION: ${question}

PRIMARY SOURCES:
${inputsBlock}

TASK: Synthesize the primary sources into the following JSON:
{
  "summary": "3-5 sentences summarizing what the primary evidence adds to the question",
  "findings": [
    {
      "finding": "Concise claim",
      "evidence": "What the sources say",
      "confidence": "high|medium|low",
      "sources": ["PRI-SRC-1"],
      "policyImplication": "Why it matters for the recommendation"
    }
  ],
  "quotes": [
    {
      "quote": "Exact, short quote",
      "sourceId": "PRI-SRC-1",
      "attribution": "How to attribute (e.g. 'senior clinician', 'regulatory official')",
      "role": "Role of the interviewee",
      "organization": "Organization if releasable",
      "finding": "The finding this quote supports"
    }
  ],
  "limitations": ["Limitation 1", "Limitation 2"],
  "methodNote": "One sentence on method and how to cite this section"
}

Rules:
- Up to ${maxFindings} findings
- Up to ${maxQuotes} quotes
- Do not overstate the evidence
- Use [PRI-SRC-N] references`,
      },
    ],
    task: 'primary_data_synthesis',
    temperature: 0.25,
    maxTokens: 4000,
    jsonMode: true,
    enableCache: true,
  });

  const parsed = parseJson<PrimaryDataSynthesis>(response.content);
  if (!parsed) {
    return {
      summary: 'Primary data synthesis could not be parsed.',
      findings: [],
      quotes: [],
      limitations: ['Synthesis parse failed'],
      methodNote: '',
      costUsd: response.costUsd,
    };
  }

  return {
    ...parsed,
    findings: (parsed.findings || []).slice(0, maxFindings),
    quotes: (parsed.quotes || []).slice(0, maxQuotes),
    costUsd: response.costUsd,
  };
}

// ─── HTML Renderer ──────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m] as string));
}

export function renderPrimaryDataSection(synthesis: PrimaryDataSynthesis): string {
  if (!synthesis.findings.length && !synthesis.quotes.length) return '';

  const findingsHtml = synthesis.findings.length
    ? `<h3>Primary Evidence Findings</h3>
       <ul class="primary-findings">
       ${synthesis.findings.map((f) => `
         <li>
           <p><strong>${esc(f.finding)}</strong> <span class="confidence">[confidence: ${f.confidence}]</span></p>
           <p>${esc(f.evidence)}</p>
           <p><em>Sources:</em> ${f.sources.map(esc).join(', ')}</p>
           <p><strong>Implication:</strong> ${esc(f.policyImplication)}</p>
         </li>`).join('')}
       </ul>`
    : '';

  const quotesHtml = synthesis.quotes.length
    ? `<h3>Expert Voices</h3>
       <blockquote class="expert-quotes">
       ${synthesis.quotes.map((q) => `
         <p class="quote">"${esc(q.quote)}"</p>
         <p class="attribution">— ${esc(q.attribution)}${q.organization ? `, ${esc(q.organization)}` : ''}</p>
         <p class="source-ref">[${esc(q.sourceId)}] — ${esc(q.finding)}</p>`).join('')}
       </blockquote>`
    : '';

  const limitationsHtml = synthesis.limitations.length
    ? `<h3>Primary Evidence Limitations</h3>
       <ul>${synthesis.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    : '';

  return `<section class="primary-data">
    <h2>Primary Evidence & Expert Input</h2>
    <p class="summary">${esc(synthesis.summary)}</p>
    ${findingsHtml}
    ${quotesHtml}
    ${limitationsHtml}
    <p class="method-note"><em>${esc(synthesis.methodNote)}</em></p>
  </section>`;
}
