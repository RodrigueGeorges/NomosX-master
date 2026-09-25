/**
 * Critic Panel — rubric-based multi-dimension review (G-Eval style).
 *
 * The scalar critic score compresses everything into one number: a paper can
 * score 18 for ten different reasons and nobody can tell which. Research on
 * LLM-as-judge (G-Eval, MT-Bench, peer-review agents) shows rubric-anchored
 * per-dimension scoring is more reliable, more actionable, and less biased.
 *
 * This panel runs 4 independent reviewers IN PARALLEL, each with its own
 * rubric and its own mandate. Each returns a 1-10 score + cited defects +
 * a mustFix flag. The veto only fires when a reviewer finds a REPAIRABLE
 * defect below its threshold — replacing the opaque "score=18 → reject".
 *
 * Cost: 4 × glm-4.5-air ≈ $0.005 per publication.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { getResearcherKB } from './researcher-kb';
import type { DomainExpertise } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PanelDimension = 'methodology' | 'coverage' | 'epistemic' | 'editorial' | 'differentiation';

export interface DimensionVerdict {
  dimension: PanelDimension;
  score: number;             // 1-10
  findings: string[];        // specific defects, quoting the offending passage
  strengths: string[];       // what works — reviewers must not only fault-find
  mustFix: boolean;          // a defect so severe it blocks publication
  mustFixReason: string | null;
}

export interface CriticPanelResult {
  dimensions: DimensionVerdict[];
  overallScore: number;      // 0-100, weighted aggregate
  veto: boolean;
  vetoReasons: string[];
  costUsd: number;
  durationMs: number;
}

// ─── Rubrics ────────────────────────────────────────────────────────────────

interface RubricDef {
  dimension: PanelDimension;
  weight: number;
  prompt: string;
}

const RUBRICS: RubricDef[] = [
  {
    dimension: 'methodology',
    weight: 0.30,
    prompt: `You are Reviewer 1 (methodology) on an editorial review panel.
Evaluate ONLY the analytical rigor of this analysis:
- Are causal claims supported by evidence or merely asserted?
- Are mechanisms specified (who does what, through which channel) rather than hand-waved?
- Are counter-evidence and alternative explanations engaged with, not ignored?
- Are quantitative claims sourced and internally consistent?

Score 1-10: 1-3 = assertion-driven, 4-6 = uneven rigor, 7-8 = solid with gaps, 9-10 = exemplary.
Set mustFix=true ONLY if a central causal claim is demonstrably false or a core mechanism is missing.`,
  },
  {
    dimension: 'coverage',
    weight: 0.30,
    prompt: `You are Reviewer 2 (coverage) on an editorial review panel.
Evaluate ONLY the completeness of coverage relative to the topic:
- Which important dimensions are ABSENT? (legal/institutional, economic, social, historical precedent, geographic scope, affected actors, timelines)
- Are dissenting or non-Western perspectives represented where relevant?
- Does the analysis answer the actual question asked, not an adjacent one?

List every missing dimension explicitly in findings — be specific ("no treatment of X's effect on Y"), not generic.
Score 1-10: 1-3 = major dimensions missing, 4-6 = notable gaps, 7-8 = minor gaps, 9-10 = comprehensive.
Set mustFix=true ONLY if a dimension so central is missing that the analysis misleads by omission.`,
  },
  {
    dimension: 'epistemic',
    weight: 0.25,
    prompt: `You are Reviewer 3 (epistemic calibration) on an editorial review panel.
Evaluate ONLY how the analysis handles uncertainty:
- Are predictions/scenarios marked with appropriate confidence, or stated as fact?
- Is speculation distinguished from evidence-backed claims?
- Are uncertainty ranges, contested figures, and disputed facts flagged as such?
- Does the text overclaim certainty ("will", "inevitably") where evidence is thin?

Score 1-10: 1-3 = systematic overclaiming, 4-6 = mixed calibration, 7-8 = mostly calibrated, 9-10 = exemplary epistemic hygiene.
Set mustFix=true ONLY if a headline conclusion asserts certainty the evidence cannot support.`,
  },
  {
    dimension: 'editorial',
    weight: 0.15,
    prompt: `You are Reviewer 4 (editorial quality) on an editorial review panel.
Evaluate ONLY the writing and structure:
- Is there a clear through-line (thesis → evidence → implications)?
- Is the prose specific and concrete, or padded with generic filler?
- Do sections build on each other, or repeat/disjoint?
- Would a demanding editor at a serious publication accept this structure?

Score 1-10: 1-3 = incoherent/filler, 4-6 = serviceable, 7-8 = strong, 9-10 = exceptional.
Set mustFix=true ONLY if the piece is structurally incoherent — never veto on style alone.`,
  },
];

const PANEL_JSON_SCHEMA = `Return STRICT JSON only:
{"score": <1-10>, "findings": ["specific defect quoting passage", ...], "strengths": ["what works", ...], "mustFix": <bool>, "mustFixReason": <string or null>}`;

// Field context from the positioning agent — activates the 5th reviewer.
export interface FieldContext {
  fieldCoverage: string[];
  uncoveredDimensions: string[];
  weakClaims: string[];
  strongestPiece: string | null;
}

function buildDifferentiationRubric(field: FieldContext): RubricDef {
  return {
    dimension: 'differentiation',
    weight: 0.20,
    prompt: `You are Reviewer 5 (differentiation) on an editorial review panel.
The competing field on this topic covers: ${field.fieldCoverage.slice(0, 6).join('; ') || 'unknown'}.
Dimensions NOBODY covers: ${field.uncoveredDimensions.slice(0, 5).join('; ') || 'none identified'}.
Weakly-evidenced competitor claims: ${field.weakClaims.slice(0, 3).join('; ') || 'none'}.
Strongest competing piece: "${field.strongestPiece || 'unknown'}".

Evaluate ONLY whether this analysis ADDS VALUE OVER THE FIELD:
- Does it cover at least one dimension competitors missed, OR challenge a weak consensus claim with evidence, OR go deeper on mechanism than the strongest competitor?
- Or does it merely re-synthesize what the field already published?

Score 1-10: 1-3 = re-synthesis of the field, 4-6 = marginal additions, 7-8 = clear value-add, 9-10 = decisively beats the field.
Set mustFix=true ONLY if the piece adds literally nothing over existing coverage (pure commodity content).`,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the review panel on an analysis (4 dimensions, +1 when fieldContext).
 * analysisText: the analysis content (plain text or HTML — tags are stripped).
 * topic: the research question, for coverage relevance judgments.
 */
export async function runCriticPanel(
  analysisText: string,
  topic: string,
  options?: { maxChars?: number; fieldContext?: FieldContext; domain?: string },
): Promise<CriticPanelResult> {
  const start = Date.now();
  const maxChars = options?.maxChars ?? 12_000;

  let rubrics = options?.fieldContext
    ? [...RUBRICS, buildDifferentiationRubric(options.fieldContext)]
    : [...RUBRICS];

  // S21: domain-aware methodology review — the analyst's KB declares its own
  // special requirements and known biases; the methodology reviewer checks
  // compliance (e.g. intelligence analysis must run an ACH-style comparison,
  // archaeology must name the dating method). Critic without the domain
  // checklist can only judge style, not method.
  const domainName = options?.domain;
  const domainKb = domainName ? getResearcherKB(domainName as DomainExpertise) : null;
  if (domainKb) {
    const reqs = domainKb.qualityCriteria?.specialRequirements ?? [];
    const biases = domainKb.knownBiases ?? [];
    if (reqs.length > 0 || biases.length > 0) {
      const idx = rubrics.findIndex(r => r.dimension === 'methodology');
      if (idx >= 0) {
        const domainBlock =
          `\n\nDOMAIN-SPECIFIC CHECKLIST (${domainName}):` +
          (reqs.length ? `\nThe domain requires: ${reqs.join('; ')}.` : '') +
          (biases.length ? `\nKnown domain biases to audit: ${biases.slice(0, 5).join('; ')}.` : '') +
          `\nFlag any violated requirement or unchecked bias as a finding.`;
        rubrics[idx] = { ...rubrics[idx], prompt: rubrics[idx].prompt + domainBlock };
      }
    }
  }

  // Strip HTML for reviewers — markup adds noise, not signal.
  // IMPORTANT: remove <style>/<script>/<head> CONTENT first (a bare tag-strip
  // leaves the CSS/JS body as prose — stored publications carry inline styles
  // that were scored as "CSS residue" findings and vetoed despite clean content).
  const text = analysisText
    .replace(/<(style|script|head)\b[^>]*>[\s\S]*?(<\/\1>|(?=<body\b)|(?=<article\b)|$)/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Decode entities rather than dropping them — &#039; is an apostrophe in
    // prose, not noise; dropping it produces "Chinas" which reads as a typo.
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#0?34;|&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);

  if (text.length < 200) {
    return {
      dimensions: [], overallScore: 0, veto: false,
      vetoReasons: ['analysis too short to review'], costUsd: 0,
      durationMs: Date.now() - start,
    };
  }

  const settled = await Promise.allSettled(
    rubrics.map(async (rubric) => {
      const res = await callLLM({
        messages: [{
          role: 'user',
          content: `${rubric.prompt}\n\nTOPIC UNDER REVIEW: "${topic.slice(0, 300)}"\n\nANALYSIS:\n${text}\n\n${PANEL_JSON_SCHEMA}`,
        }],
        temperature: 0.2,
        jsonMode: true,
        maxTokens: 1500,
        enableCache: false,
        task: 'reader_v3',
      });

      const parsed = parseJson<{
        score: number; findings: string[]; strengths: string[];
        mustFix: boolean; mustFixReason: string | null;
      }>(res.content);

      const score = Math.max(1, Math.min(10, Math.round(parsed?.score ?? 5)));
      return {
        dimension: rubric.dimension,
        score,
        findings: Array.isArray(parsed?.findings) ? parsed.findings.slice(0, 6).map(String) : [],
        strengths: Array.isArray(parsed?.strengths) ? parsed.strengths.slice(0, 4).map(String) : [],
        mustFix: parsed?.mustFix === true && score <= 4, // mustFix requires a genuinely failing score
        mustFixReason: typeof parsed?.mustFixReason === 'string' ? parsed.mustFixReason : null,
        costUsd: typeof res.costUsd === 'number' ? res.costUsd : 0,
      };
    }),
  );

  const dimensions: DimensionVerdict[] = [];
  let costUsd = 0;
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const { costUsd: c, ...v } = r.value;
      costUsd += c;
      dimensions.push(v);
    } else {
      // A failed reviewer abstains — never fabricate a score
      dimensions.push({
        dimension: rubrics[i].dimension, score: 0,
        findings: [`reviewer call failed: ${String(r.reason).slice(0, 100)}`],
        strengths: [], mustFix: false, mustFixReason: null,
      });
    }
  });

  // Weighted aggregate over the reviewers that actually scored
  let weighted = 0;
  let weightTotal = 0;
  for (const d of dimensions) {
    const w = rubrics.find(r => r.dimension === d.dimension)?.weight ?? 0;
    if (d.score > 0) { weighted += d.score * w; weightTotal += w; }
  }
  const overallScore = weightTotal > 0 ? Math.round((weighted / weightTotal) * 10) : 0;

  const vetoReasons = dimensions
    .filter(d => d.mustFix && d.mustFixReason)
    .map(d => `[${d.dimension}] ${d.mustFixReason}`);
  const veto = vetoReasons.length > 0;

  console.log(`[CRITIC PANEL] ${dimensions.map(d => `${d.dimension}=${d.score}`).join(' ')} → overall ${overallScore}/100${veto ? ` VETO: ${vetoReasons.join('; ')}` : ''}`);

  return {
    dimensions, overallScore, veto, vetoReasons,
    costUsd, durationMs: Date.now() - start,
  };
}
