/**
 * RENDER EDITOR step — extracted from pipeline-v2.ts (the renderEditorHtml
 * closure + mapProspectiveToRenderFormat). Identical semantics.
 *
 * The legacy `renderBriefHTML` fallback stays in pipeline-v2.ts (exported
 * API surface) and is injected via `renderBriefFallback` — no circular import.
 */

import { prisma } from '../../db';
import { backfillMissingAnalyticalFields } from '../strategic-analyst-agent';
import { renderProfessionalBriefHTML, renderProfessionalStrategicHTML } from '../editor-agent';
import { renderPositionFirstBriefHTML } from '../position-first-renderer';
import { computeTrackRecordStats } from '../track-record';
import { renderStrategicReportHTML } from '../strategic-report-renderer';

export interface RenderEditorContext {
  label: string;
  query: string;
  isStrategic: boolean;
  isMemo: boolean;
  editorialV2: boolean;
  topicClassification: any;
  castingResult: any;
  institutePosition: any;
  analysis: Record<string, any>;
  topSources: any[];
  debateResult: any;
  stats: Record<string, any>;
  /** Legacy brief renderer kept in pipeline-v2 (exported API) — injected. */
  renderBriefFallback: (analysis: any, sources: any[]) => string;
}

// Map ProspectiveNote (analyst-multipass output) → fields expected by renderProfessionalStrategicHTML
export function mapProspectiveToRenderFormat(analysis: any): any {
  // Already has strategic-format fields (from strategic-analyst-agent) — no mapping needed
  if (analysis.executiveSummary || analysis.literatureOverview) return analysis;

  const causalChainText = Array.isArray(analysis.causalChain)
    ? analysis.causalChain.map((link: any) =>
        `**${link.claim || ''}**\nEvidence: ${link.evidence || ''}\nWarrant: ${link.warrant || ''}`
      ).join('\n\n')
    : '';

  const rejectedAltText = Array.isArray(analysis.rejectedAlternatives)
    ? analysis.rejectedAlternatives.map((alt: any) =>
        `**${alt.scenario || ''}** — ${alt.whyRejected || ''} (Residual risk: ${alt.residualRisk || ''})`
      ).join('\n\n')
    : '';

  const signalsText = analysis.whatToWatch?.signals?.length
    ? analysis.whatToWatch.signals.map((s: string) => `• ${s}`).join('\n')
    : '';

  const evidenceGapsText = analysis.evidenceAssessment?.gaps?.length
    ? analysis.evidenceAssessment.gaps.map((g: string) => `• ${g}`).join('\n')
    : '';

  const strongestLinksText = analysis.evidenceAssessment?.strongestLinks?.length
    ? analysis.evidenceAssessment.strongestLinks.map((s: string) => `• ${s}`).join('\n')
    : '';

  return {
    ...analysis,
    // Map ProspectiveNote fields to renderer-expected fields
    executiveSummary: analysis.verdict || '',
    literatureOverview: analysis.anchoringBasis || '',
    theoreticalFrameworks: '',
    methodologicalApproaches: causalChainText,
    consensus: analysis.throughLine || '',
    controversies: rejectedAltText,
    emergingTrends: analysis.trajectory?.state || '',
    // Map causalChain → causalArchitecture for the Causal Architecture section
    causalArchitecture: Array.isArray(analysis.causalChain)
      ? analysis.causalChain.map((link: any) => ({
          claim: link.claim || '',
          chain: `Evidence: ${link.evidence || ''} → Warrant: ${link.warrant || ''} → Status: ${link.temporalStatus || ''}`,
          confidence: link.temporalStatus === 'present_fact' ? 'high' : link.temporalStatus === 'active_mechanism' ? 'medium' : 'low',
          epistemicLevel: link.temporalStatus === 'present_fact' ? 'demonstrated' : link.temporalStatus === 'active_mechanism' ? 'suggested' : 'projected',
          counterfactual: `If ${link.evidence?.slice(0, 100) || 'this evidence'} were not observed, the causal chain would break at this link.`,
          alternativeExplanation: `An alternative explanation is that this observation is driven by confounding factors not captured in the source data.`,
          sources: link.sourceRef ? [`[SRC-${link.sourceRef}]`] : (link.sources || []),
        }))
      : [],
    // Themes from causal chain — group by domain if available
    themes: Array.isArray(analysis.causalChain)
      ? analysis.causalChain.map((link: any) => ({
          name: `Causal Link ${link.id}`,
          description: link.claim,
          evidence: link.evidence,
          sources: link.sourceRef ? `[SRC-${link.sourceRef}]` : '',
        }))
      : [],
    // Scenarios from trajectory + rejected alternatives
    scenarios: [
      ...(analysis.trajectory?.state ? [{
        name: 'Projected Trajectory',
        probability: '',
        description: analysis.trajectory.state,
        implications: analysis.trajectory.assumptions || '',
      }] : []),
      ...(Array.isArray(analysis.rejectedAlternatives) ? analysis.rejectedAlternatives.map((alt: any) => ({
        name: alt.scenario || 'Alternative Scenario',
        probability: '',
        description: alt.whyRejected || '',
        implications: alt.residualRisk || '',
      })) : []),
    ],
    // Evidence quality from evidenceAssessment
    evidenceQuality: {
      overallScore: 0,
      methodology: strongestLinksText,
      gaps: evidenceGapsText,
    },
    // Recommendations from whatToWatch
    recommendations: {
      immediate: analysis.whatToWatch?.signals || [],
      shortTerm: [],
      longTerm: [],
      riskMitigation: evidenceGapsText ? evidenceGapsText.split('\n') : [],
    },
    // Implementation from trajectory assumptions
    implementation: {
      timeline: analysis.trajectory?.horizon || '',
      resources: analysis.trajectory?.assumptions || '',
      obstacles: analysis.evidenceAssessment?.gaps || [],
    },
    conclusion: analysis.verdict || '',
    openQuestions: evidenceGapsText,
    whatChangesMind: analysis.whatToWatch?.whatWouldChangeMind || '',
    // Preserve keyFindings (already in both formats)
    keyFindings: analysis.keyFindings || [],
    // Preserve title
    title: analysis.title || '',
    // Pass through urgency/confidence if present
    urgencyLevel: analysis.urgencyLevel,
    confidenceLevel: analysis.convictionLevel === 'firm' ? 'high' : analysis.convictionLevel === 'tempered' ? 'medium' : 'low',
  };
}

export async function runRenderEditorStep(rc: RenderEditorContext): Promise<string> {
  const { label, query, isStrategic, isMemo, editorialV2, stats } = rc;
  const analysis = rc.analysis;
  const topSources = rc.topSources;
  const topicClassification = rc.topicClassification;
  const castingResult = rc.castingResult;
  const institutePosition = rc.institutePosition;
  const debateResult = rc.debateResult;

  console.log(`${label} EDITOR: render professional HTML`);

  // S14-F: EDITORIAL quality gate — check analysis quality before rendering
  // If the critic rejected the analysis or citation coverage is very low,
  // log a quality warning. The rendering still proceeds (the trust score
  // will cap the publication), but we add a visible quality disclaimer.
  const preRenderCriticVerdict = stats.critic?.verdict;
  const preRenderCriticScore = stats.critic?.overallScore;
  if (preRenderCriticVerdict === 'reject' || (preRenderCriticScore !== null && preRenderCriticScore !== undefined && preRenderCriticScore < 25)) {
    console.warn(`${label} EDITORIAL GATE: ⚠️ Low quality analysis (critic=${preRenderCriticVerdict}, score=${preRenderCriticScore}) — rendering with quality disclaimer`);
  }

  try {
    if (editorialV2 && castingResult && institutePosition) {
      // Determine think tank style profile from query domain for adaptive labels
      const q = query.toLowerCase();
      let styleProfile: 'harvard' | 'france-strategie' | 'montaigne' | 'mckinsey' | 'rand' | 'chatham' | 'caps' | 'default' = 'default';
      if (/diplomatie|diplomatique|affaires étrangères|prévision stratégique|ambassade|quai d'orsay/.test(q)) styleProfile = 'caps';
      else if (/france|français|europe|européen|réforme|politique publique/.test(q)) styleProfile = 'france-strategie';
      else if (/montaigne|français|modèle français|cohesion|état|action publique/.test(q)) styleProfile = 'montaigne';
      else if (/business|industry|productivity|growth|market|strategy|sector/.test(q)) styleProfile = 'mckinsey';
      else if (/defense|military|security|intelligence|threat|risk|war|weapon|cyber/.test(q)) styleProfile = 'rand';
      else if (/international|diplomacy|geopolitic|foreign policy|global|nato/.test(q)) styleProfile = 'chatham';
      else if (/policy memo|public policy|administration|governance/.test(q)) styleProfile = 'harvard';

      const rendered = renderPositionFirstBriefHTML({
        question: query,
        classification: topicClassification,
        casting: castingResult,
        position: institutePosition,
        analysis: analysis as Record<string, unknown>,
        sources: topSources,
        debate: debateResult,
        isStrategic,
        styleProfile,
      });
      stats.rendererUsed = "position_first";
      console.log(`${label} EDITOR: position-first template (${(rendered.length / 1024).toFixed(0)}KB)`);
      return rendered;
    }
    console.warn(`${label} RENDERER: position-first NOT used — editorialV2=${editorialV2}, casting=${!!castingResult}, arbiter=${!!institutePosition} — falling back to ${isStrategic ? 'strategic' : 'brief'} template`);
    const renderAnalysis = isStrategic ? mapProspectiveToRenderFormat(analysis) : analysis;

    // Backfill missing analytical fields (tailRisks, outsideIn, _redTeam, timeline, achMatrix)
    // The analyst multipass doesn't produce these fields — a focused second-pass LLM call generates them.
    if (isStrategic) {
      await backfillMissingAnalyticalFields(renderAnalysis, query, topSources);
    }
    // Build protocol metadata for transparency section (RAND 2022 standard)
    const protocolMeta = isStrategic ? {
      query,
      providers: stats.scout?.providers || [],
      sourcesFound: stats.scout?.found || 0,
      sourcesRetained: topSources.length,
      minQuality: 70,
      recentOnly: false,
      maxPerProvider: 4,
      llmFamily: analysis._producerFamily || 'unknown',
      llmModel: stats.analyst?.model || 'unknown',
      generationDate: new Date().toISOString(),
      pipelineVersion: 'v2',
      trustScore: stats.trustScore,
      citationCount: stats.citationRepair?.injected,
      claimCount: stats.claimGrounding ? (stats.claimGrounding.supported + stats.claimGrounding.partial + stats.claimGrounding.unsupported + stats.claimGrounding.uncited + stats.claimGrounding.contradicted) : undefined,
      groundedness: stats.claimGrounding?.groundedness,
    } : undefined;
    const rendered = isStrategic
      ? renderProfessionalStrategicHTML(renderAnalysis, topSources, protocolMeta, await computeTrackRecordStats(), isStrategic ? 'STRATEGIC_REPORT' : isMemo ? 'DECISION_MEMO' : 'ARTICLE')
      : renderProfessionalBriefHTML(analysis, topSources, isMemo ? 'DECISION_MEMO' : 'ARTICLE');
    stats.rendererUsed = isStrategic ? "professional_strategic" : "professional_brief";
    console.log(`${label} EDITOR: ${isStrategic ? 'strategic' : 'brief'} template rendered (${(rendered.length / 1024).toFixed(0)}KB)`);
    return rendered;
  } catch (editorErr) {
    console.warn(`${label} EDITOR: professional template failed, using legacy:`, editorErr);
    stats.rendererUsed = isStrategic ? "legacy_strategic" : "legacy_brief";
    // Fetch contradictions from DB to surface in the report (non-blocking)
    let contradictionsForRender: Array<{ claim1: string; claim2: string; contradictionType: string; confidence: number; explanation: string }> = [];
    if (isStrategic && topSources.length > 0) {
      try {
        const dbContradictions = await prisma.contradiction.findMany({
          where: { sourceId1: { in: topSources.map(s => s.id) } },
          select: { claim1: true, claim2: true, contradictionType: true, confidence: true, explanation: true },
          take: 10,
          orderBy: { confidence: "desc" },
        });
        contradictionsForRender = dbContradictions;
      } catch { /* non-blocking */ }
    }
    return isStrategic
      ? renderStrategicReportHTML(analysis as any, topSources, contradictionsForRender)
      : rc.renderBriefFallback(analysis, topSources);
  }
}
