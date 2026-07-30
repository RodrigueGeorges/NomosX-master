/**
 * NomosX STRUCTURAL EDITOR — Storyline Review
 *
 * Think tanks like McKinsey, BCG, France Stratégie enforce a strict
 * narrative structure: every section has a "governing thought" (key message),
 * supporting evidence, and a "so what" (implication).
 *
 * This agent reviews the analysis JSON BEFORE rendering to HTML and:
 * 1. Validates narrative arc (does the story flow logically?)
 * 2. Ensures each section has a governing thought
 * 3. Checks "so what" per section (actionable implication)
 * 4. Detects logical gaps between sections
 * 5. Suggests restructuring if needed
 * 6. Enforces the "pyramid principle" (conclusion first, evidence after)
 *
 * Inspired by:
 * - McKinsey's "Situation-Complication-Resolution" framework
 * - Barbara Minto's Pyramid Principle
 * - France Stratégie's "Constat-Enjeu-Option" structure
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ============================================================================
// TYPES
// ============================================================================

export interface SectionReview {
  sectionName: string;
  governingThought: string;    // The key message of this section
  hasGoverningThought: boolean; // Does the section have a clear key message?
  hasSoWhat: boolean;           // Does it answer "so what?"
  hasEvidence: boolean;         // Does it cite sources?
  logicalFlow: number;          // 0-100: how well does it connect to the next section
  issues: string[];             // Specific structural issues
  suggestedFix: string;         // How to fix it
}

export interface StructuralReviewResult {
  overallStructure: number;       // 0-100: overall narrative quality
  narrativeArcValid: boolean;     // Does the story flow from problem → evidence → resolution?
  sectionReviews: SectionReview[];
  logicalGaps: string[];          // Gaps between sections
  restructuringSuggestions: string[];
  revisedAnalysis?: any;          // If restructured, the new analysis JSON
  costUsd: number;
  durationMs: number;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function structuralEditorReview(
  analysis: any,
  question: string
): Promise<StructuralReviewResult> {
  const start = Date.now();
  console.log(`[STRUCTURAL EDITOR] Reviewing narrative structure for: "${question.slice(0, 60)}"`);

  // Build section inventory from analysis
  const sections = buildSectionInventory(analysis);

  const prompt = `You are a STRUCTURAL EDITOR at a top-tier think tank (McKinsey / France Stratégie / Brookings level).

RESEARCH QUESTION: "${question}"

ANALYSIS SECTIONS:
${sections}

═══ YOUR MISSION ═══
Review the NARRATIVE STRUCTURE of this analysis. Think tanks follow strict principles:

1. PYRAMID PRINCIPLE (Barbara Minto): Lead with the answer, then support with evidence.
   - The summary/executive summary must state the KEY FINDING upfront
   - Each section must open with its GOVERNING THOUGHT (the "so what" of that section)
   - Evidence follows the governing thought, not the other way around

2. SITUATION-COMPLICATION-RESOLUTION (McKinsey):
   - Situation: What is the current state? (consensus section)
   - Complication: What is the problem/tension? (disagreements + debate)
   - Resolution: What should be done? (implications + recommendations)

3. CONSTAT-ENJEU-OPTION (France Stratégie):
   - Constat: What do we observe? (evidence)
   - Enjeu: Why does it matter? (implications/risks)
   - Option: What are the choices? (debate + recommendations)

For EACH section, assess:
- Does it have a clear GOVERNING THOUGHT? (Can you state its key message in one sentence?)
- Does it answer "SO WHAT?" (Why should the reader care?)
- Does it cite EVIDENCE? ([SRC-N] references)
- Does it FLOW LOGICALLY from the previous section?

Also assess the OVERALL narrative arc:
- Does the story progress from evidence → insight → action?
- Are there logical gaps between sections?
- Is the conclusion earned by the evidence presented?

Return JSON:
{
  "overallStructure": 0-100,
  "narrativeArcValid": true/false,
  "sectionReviews": [
    {
      "sectionName": "name",
      "governingThought": "the key message in one sentence (extract or infer)",
      "hasGoverningThought": true/false,
      "hasSoWhat": true/false,
      "hasEvidence": true/false,
      "logicalFlow": 0-100,
      "issues": ["specific structural issue"],
      "suggestedFix": "how to fix the structure"
    }
  ],
  "logicalGaps": ["gap between section X and Y: ..."],
  "restructuringSuggestions": ["specific, actionable suggestion to improve narrative flow"]
}

Be RIGOROUS. A McKinsey partner would reject a document without clear governing thoughts.
This is an ASSESSMENT ONLY — do NOT rewrite the analysis. Provide diagnostics and
actionable suggestions; the revision stage will act on them.
Keep every string concise (governingThought and issues under 20 words).
Output ONLY the JSON object — no markdown, no prose.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.15,
      jsonMode: true,
      maxTokens: 3000,
      task: 'structural_editor',
    });

    const result = parseJson<StructuralReviewResult>(response.content);
    if (!result) throw new SyntaxError('Structural editor: failed to parse LLM JSON');
    result.costUsd = response.costUsd;
    result.durationMs = Date.now() - start;

    const issues = result.sectionReviews?.filter(s => s.issues?.length > 0).length || 0;
    console.log(`[STRUCTURAL EDITOR] Review complete: structure=${result.overallStructure}/100, ${issues} sections with issues, ${result.logicalGaps?.length || 0} logical gaps`);

    if (result.revisedAnalysis) {
      console.log(`[STRUCTURAL EDITOR] Restructuring suggested — revised analysis provided`);
    }

    return result;
  } catch (error: any) {
    console.error(`[STRUCTURAL EDITOR] Failed: ${error.message}`);
    return {
      overallStructure: 50,
      narrativeArcValid: false,
      sectionReviews: [],
      logicalGaps: [`Structural review failed: ${error.message}`],
      restructuringSuggestions: [],
      costUsd: 0,
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// SECTION INVENTORY BUILDER
// ============================================================================

function buildSectionInventory(analysis: any): string {
  const sections: string[] = [];

  const fields = [
    { key: 'title', label: 'Title' },
    { key: 'summary', label: 'Executive Summary' },
    { key: 'consensus', label: 'Consensus' },
    { key: 'disagreements', label: 'Disagreements' },
    { key: 'evidence', label: 'Evidence Quality' },
    { key: 'implications', label: 'Implications' },
    { key: 'risks', label: 'Risks' },
    { key: 'open_questions', label: 'Open Questions' },
    { key: 'what_changes_mind', label: 'What Would Change Our Mind' },
  ];

  for (const field of fields) {
    const content = analysis[field.key];
    if (content && (typeof content === 'string') && content.trim().length > 0) {
      const wordCount = content.split(/\s+/).length;
      const hasCitations = /\[SRC-\d+\]/.test(content);
      sections.push(`── ${field.label} (${wordCount} words, citations: ${hasCitations}) ──\n${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`);
    }
  }

  // Debate section (special structure)
  if (analysis.debate) {
    const d = analysis.debate;
    const proWords = (d.pro || '').split(/\s+/).length;
    const conWords = (d.con || '').split(/\s+/).length;
    const synWords = (d.synthesis || '').split(/\s+/).length;
    sections.push(`── Debate (Pro: ${proWords}w, Con: ${conWords}w, Synthesis: ${synWords}w) ──\nPro: ${(d.pro || '').slice(0, 300)}...\nCon: ${(d.con || '').slice(0, 300)}...\nSynthesis: ${(d.synthesis || '').slice(0, 300)}...`);
  }

  // Strategic report fields
  const strategicFields = [
    { key: 'executiveSummary', label: 'Executive Summary (Strategic)' },
    { key: 'literatureOverview', label: 'Literature Review' },
    { key: 'keyFindings', label: 'Key Findings' },
    { key: 'themes', label: 'Thematic Analysis' },
    { key: 'controversies', label: 'Controversies' },
    { key: 'emergingTrends', label: 'Emerging Trends' },
    { key: 'stakeholderAnalysis', label: 'Stakeholder Impact' },
    { key: 'scenarios', label: 'Scenario Planning' },
    { key: 'recommendations', label: 'Recommendations' },
    { key: 'implementation', label: 'Implementation Roadmap' },
    { key: 'conclusion', label: 'Conclusion' },
  ];

  for (const field of strategicFields) {
    const content = analysis[field.key];
    if (content) {
      if (typeof content === 'string' && content.trim().length > 0) {
        const wordCount = content.split(/\s+/).length;
        sections.push(`── ${field.label} (${wordCount} words) ──\n${content.slice(0, 500)}`);
      } else if (Array.isArray(content)) {
        sections.push(`── ${field.label} (${content.length} items) ──\n${JSON.stringify(content.slice(0, 3)).slice(0, 500)}`);
      } else if (typeof content === 'object') {
        sections.push(`── ${field.label} (structured) ──\n${JSON.stringify(content, null, 2).slice(0, 500)}`);
      }
    }
  }

  return sections.join('\n\n');
}
