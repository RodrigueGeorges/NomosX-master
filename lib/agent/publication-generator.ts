/**
 * NomosX Publication Generator Agent
 * 
 * Generates publication content from signals and sources
 * Uses templates to enforce structure and constraints
 */

import { prisma } from '../db';
import { PublicationType,PublicationTemplate,CriticalLoopResult } from '@/lib/think-tank/types';
import { getTemplate,PUBLICATION_TEMPLATES } from '@/lib/think-tank/templates';
import { callLLM } from '../llm/unified-llm';
import { runCriticalLoopV2 } from './critical-loop-v2';
import { verifyCitations } from './citation-verifier';
import { debateAgent } from './debate-agent';
import { runDevilsAdvocate } from './devils-advocate';
import { recordAgentPerformance, autoDetectFailureModes } from './agent-memory';
import { recordPublication } from './cadence-enforcer';
import { AgentRole, assertPermission } from '../governance/index';

// ============================================================================
// TYPES
// ============================================================================

interface PublicationGeneratorInput {
  signalId: string;
  publicationType?: PublicationType;
}

export interface PublicationGeneratorOutput {
  publicationId: string;
  title: string;
  html: string;
  wordCount: number;
  trustScore: number;
  criticalLoopResult: CriticalLoopResult;
  success: boolean;
  error?: string;
  lineage?: PipelineLineage;
}

interface PipelineLineage {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  agents: Array<{ name: string; durationMs: number; costUsd: number; status: string }>;
  totalCostUsd: number;
  version: string;
}

// ============================================================================
// TEMPLATE SELECTION
// ============================================================================

function selectPublicationType(signalType: string): PublicationType {
  switch (signalType) {
    case "DATA_RELEASE":
      return "DATA_NOTE";
    case "POLICY_CHANGE":
      return "POLICY_NOTE";
    case "CONTRADICTION":
    case "TREND_BREAK":
    case "METHODOLOGY_SHIFT":
      return "RESEARCH_BRIEF";
    case "NEW_EVIDENCE":
    default:
      return "RESEARCH_BRIEF";
  }
}

// ============================================================================
// CONTENT GENERATION
// ============================================================================

async function generateContent(
  signal: any,
  sources: any[],
  template: PublicationTemplate,
  vertical: any
): Promise<{ title: string; html: string; wordCount: number; costUsd: number }> {
  console.log(`[PUBLICATION_GENERATOR] Generating ${template.type} content...`);
  
  // Build source context
  const sourceContext = sources.map((s, i) => {
    const authors = s.authors?.map((sa: any) => sa.author?.name).filter(Boolean).slice(0, 3).join(", ") || "N/A";
    return `[SRC-${i + 1}] ${s.title}
Authors: ${authors}
Year: ${s.year || "N/A"}
Provider: ${s.provider}
Quality: ${s.qualityScore || 0}/100
Abstract: ${(s.abstract || "").slice(0, 500)}...`;
  }).join("\n\n");
  
  // Build section instructions
  const sectionInstructions = template.sections.map(section => {
    return `## ${section.title} (${section.id})
- Required: ${section.required ? "Yes" : "No"}
- Word limit: ${section.minWords || 0}-${section.maxWords || 500} words
- Claim types allowed: ${section.claimTypes.join(", ")}`;
  }).join("\n\n");
  
  const prompt = `You are NomosX Publication Generator — Elite think tank analyst.

SIGNAL: ${signal.title}
VERTICAL: ${vertical.name}
PUBLICATION TYPE: ${template.type}

SOURCES (${sources.length}):
${sourceContext}

TEMPLATE STRUCTURE:
${sectionInstructions}

TOTAL WORD LIMIT: ${template.totalMinWords}-${template.totalMaxWords} words
MINIMUM SOURCES TO CITE: ${template.minSources}

FORBIDDEN PHRASES (never use):
${template.forbiddenPhrases.slice(0, 10).join(", ")}

CRITICAL RULES:
1. EVERY factual claim MUST cite [SRC-N] where N = source number
2. Use hedged language for interpretations ("suggests", "indicates", "may")
3. Never claim certainty without strong evidence
4. Include limitations and uncertainty
5. Be specific with numbers and data
6. Write in ${signal.summary?.match(/[àâäéèêëïîôùûüÿæœç]/i) ? 'FRENCH' : 'ENGLISH'}

OUTPUT FORMAT:
Return JSON with:
{
  "title": "Specific, descriptive title",
  "sections": {
    "section_id": "HTML content for this section"
  }
}

Generate premium, institutional-grade content.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 6000,
      enableCache: true,
    });

    const result = JSON.parse(response.content);
    
    // Build HTML from sections
    const html = buildHtml(result, template, sources, vertical, signal);
    const wordCount = countWords(html);
    
    console.log(`[PUBLICATION_GENERATOR] Generated ${wordCount} words (cost: $${response.costUsd.toFixed(4)})`);
    
    return {
      title: result.title || signal.title,
      html,
      wordCount,
      costUsd: response.costUsd,
    };
  } catch (error: any) {
    console.error(`[PUBLICATION_GENERATOR] Generation failed: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// HTML BUILDER
// ============================================================================

function buildHtml(
  content: any,
  template: PublicationTemplate,
  sources: any[],
  vertical: any,
  signal: any
): string {
  const sections = content.sections || {};
  const title = content.title || signal.title;
  
  let html = `<article class="nomosx-publication ${template.type.toLowerCase().replace(/_/g, '-')}">
  <header>
    <div class="meta">
      <span class="vertical" style="color: ${vertical.color || '#22D3EE'}">${vertical.icon || '📊'} ${vertical.name}</span>
      <span class="type">${formatPublicationType(template.type)}</span>
      <span class="date">${new Date().toISOString().split('T')[0]}</span>
    </div>
    <h1>${escapeHtml(title)}</h1>
  </header>
`;

  // Add each section
  for (const section of template.sections) {
    const sectionContent = sections[section.id];
    if (!sectionContent && !section.required) continue;
    
    html += `
  <section class="${section.id.replace(/_/g, '-')}">
    <h2>${section.title}</h2>
    ${sectionContent || '<p><em>Section non générée</em></p>'}
  </section>
`;
  }

  // Add bibliography
  html += `
  <footer class="bibliography">
    <h2>Sources</h2>
    <ol>
${sources.map((s, i) => {
  const authors = s.authors?.map((sa: any) => sa.author?.name).filter(Boolean).slice(0, 3).join(", ") || "N/A";
  return `      <li>[SRC-${i + 1}] ${escapeHtml(authors)} (${s.year || "N/A"}). ${escapeHtml(s.title)}. <em>${s.provider}</em>.</li>`;
}).join("\n")}
    </ol>
  </footer>
</article>`;

  return html;
}

function formatPublicationType(type: string): string {
  const formats: Record<string, string> = {
    RESEARCH_BRIEF: "Research Brief",
    UPDATE_NOTE: "Update Note",
    DATA_NOTE: "Data Note",
    POLICY_NOTE: "Policy Note",
    DOSSIER: "Dossier"
  };
  return formats[type] || type;
}

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.split(" ").filter(w => w.length > 0).length;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export async function generatePublication(
  input: PublicationGeneratorInput
): Promise<PublicationGeneratorOutput> {
  console.log(`[PUBLICATION_GENERATOR] Starting for signal ${input.signalId}...`);
  
  // Fetch signal with vertical
  const signal = await prisma.signal.findUnique({
    where: { id: input.signalId },
    include: { vertical: true }
  });
  
  if (!signal) {
    return {
      publicationId: "",
      title: "",
      html: "",
      wordCount: 0,
      trustScore: 0,
      criticalLoopResult: {} as CriticalLoopResult,
      success: false,
      error: "Signal not found"
    };
  }
  
  // Fetch sources
  const sources = await prisma.source.findMany({
    where: { id: { in: signal.sourceIds } },
    include: {
      authors: { include: { author: true } },
      institutions: { include: { institution: true } }
    }
  });
  
  if (sources.length === 0) {
    return {
      publicationId: "",
      title: "",
      html: "",
      wordCount: 0,
      trustScore: 0,
      criticalLoopResult: {} as CriticalLoopResult,
      success: false,
      error: "No sources found"
    };
  }
  
  // Select publication type and template
  const pubType = input.publicationType || selectPublicationType(signal.signalType);
  const template = getTemplate(pubType);
  
  if (!template) {
    return {
      publicationId: "",
      title: "",
      html: "",
      wordCount: 0,
      trustScore: 0,
      criticalLoopResult: {} as CriticalLoopResult,
      success: false,
      error: `Template not found for ${pubType}`
    };
  }
  
  const startedAt = new Date();
  const agentStats: PipelineLineage['agents'] = [];
  let totalCost = 0;

  try {
    assertPermission(AgentRole.PUBLISHER, "publish:publication");

    // ── STEP 1: Generate content via unified LLM ──
    const genStart = Date.now();
    const { title, html: rawHtml, wordCount, costUsd: genCost } = await generateContent(
      signal,
      sources,
      template,
      signal.vertical
    );
    agentStats.push({ name: "content-generator", durationMs: Date.now() - genStart, costUsd: genCost, status: "ok" });
    totalCost += genCost;

    let html = rawHtml;

    // ── STEP 2: Citation Verifier (semantic check) ──
    let citationCoverage = 1.0;
    try {
      const cvStart = Date.now();
      const verification = await verifyCitations(html, sources, { maxConcurrency: 3 });
      citationCoverage = verification.overallIntegrity / 100;
      agentStats.push({ name: "citation-verifier", durationMs: Date.now() - cvStart, costUsd: verification.costUsd, status: "ok" });
      totalCost += verification.costUsd;
      console.log(`[PUBLICATION_GENERATOR] Citation integrity: ${verification.overallIntegrity}%`);
    } catch (err) {
      console.warn(`[PUBLICATION_GENERATOR] Citation verifier failed (continuing):`, err);
      agentStats.push({ name: "citation-verifier", durationMs: 0, costUsd: 0, status: "error" });
    }

    // ── STEP 3: Critical Loop V2 (iterative peer review + rewrite) ──
    const clStart = Date.now();
    const criticalLoopResult = await runCriticalLoopV2({
      draftHtml: html,
      sources,
      maxIterations: 2,
      publishThreshold: 65,
    });
    agentStats.push({ name: "critical-loop-v2", durationMs: Date.now() - clStart, costUsd: criticalLoopResult.totalCostUsd || 0, status: "ok" });
    totalCost += criticalLoopResult.totalCostUsd || 0;

    // Use rewritten HTML if available
    if (criticalLoopResult.finalHtml) {
      html = criticalLoopResult.finalHtml;
    }

    // ── STEP 4: DEBATE Agent (adversarial steel-man, non-blocking) ──
    let debateResult: any = null;
    try {
      const dbStart = Date.now();
      debateResult = await debateAgent(signal.title, sources, undefined, html);
      agentStats.push({ name: "debate-agent", durationMs: Date.now() - dbStart, costUsd: debateResult.costUsd, status: "ok" });
      totalCost += debateResult.costUsd;
      console.log(`[PUBLICATION_GENERATOR] Debate: dominant=${debateResult.dominantThesis?.slice(0, 60)}, confidence=${debateResult.confidenceInDominant}`);
    } catch (err) {
      console.warn(`[PUBLICATION_GENERATOR] Debate agent failed (continuing):`, err);
      agentStats.push({ name: "debate-agent", durationMs: 0, costUsd: 0, status: "error" });
    }

    // ── STEP 5: DEVIL'S ADVOCATE — Final epistemic gate (P0-A + P0-C) ──
    // Passes debate context so DA knows what counter-arguments already exist
    const publication_placeholder_id = `signal-${signal.id}-${Date.now()}`;
    let daReport: any = null;
    try {
      const daStart = Date.now();
      // Build debate context to inject into DA (P0-C: Debate → DA context sharing)
      const debateContext = debateResult ? [
        `Debate dominant thesis: ${debateResult.dominantThesis}`,
        `Counter-position: ${debateResult.position2?.label || "N/A"}`,
        `Confidence in dominant: ${debateResult.confidenceInDominant}/100`,
        `Steel-man already addressed: ${debateResult.synthesis?.slice(0, 200) || "N/A"}`,
      ].join("\n") : undefined;

      daReport = await runDevilsAdvocate(
        signal.title,
        html,
        sources.map(s => ({ title: s.title, provider: s.provider, year: s.year ?? undefined })),
        { mode: "brief", debateContext }
      );
      agentStats.push({ name: "devils-advocate", durationMs: Date.now() - daStart, costUsd: daReport.costUsd, status: "ok" });
      totalCost += daReport.costUsd;
      console.log(`[PUBLICATION_GENERATOR] Devil's Advocate: verdict=${daReport.verdict}, strength=${daReport.overallStrength}/100, publishability=${daReport.publishabilityScore}/100`);

      // Record performance for AgentMemory learning
      const failureModes = autoDetectFailureModes({
        confidenceGiven: 70,
        trustScore: criticalLoopResult.compositeScore,
        citationCoverage,
        contradictionsFound: daReport.fatalChallenges.length,
        sourceDiversity: new Set(sources.map((s: any) => s.provider)).size,
        findingsCount: sources.length,
      });
      await recordAgentPerformance({
        agentId: "publication-generator",
        runId: publication_placeholder_id,
        question: signal.title,
        trustScore: daReport.publishabilityScore,
        qualityScore: daReport.overallStrength,
        confidenceGiven: 70,
        confidenceActual: daReport.overallStrength,
        citationCoverage,
        findingsCount: sources.length,
        failureModes,
        lessonsLearned: [],
      }).catch(err => console.warn(`[PUBLICATION_GENERATOR] AgentMemory record failed:`, err));
    } catch (err) {
      console.warn(`[PUBLICATION_GENERATOR] Devil's Advocate failed (continuing):`, err);
      agentStats.push({ name: "devils-advocate", durationMs: 0, costUsd: 0, status: "error" });
    }

    // ── STEP 6: Calculate trust score (DA publishabilityScore takes priority) ──
    const avgSourceQuality = sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / sources.length;
    const rawTrustScore = Math.round(
      criticalLoopResult.compositeScore * 0.5 +
      avgSourceQuality * 0.3 +
      (citationCoverage * 100) * 0.2
    );
    // Devil's Advocate publishabilityScore is more rigorous — use it when available
    const trustScore = daReport?.publishabilityScore ?? rawTrustScore;

    // DA verdict gate: reject = don't publish, major_revision = human review
    const daBlocked = daReport?.verdict === "reject";
    const daNeedsReview = daReport?.verdict === "major_revision" || daReport?.verdict === "revise";
    const needsHumanReview = criticalLoopResult.needsHumanReview || daNeedsReview || daBlocked;

    if (daBlocked) {
      console.warn(`[PUBLICATION_GENERATOR] ⛔ Devil's Advocate REJECTED: ${daReport.fatalChallenges.length} fatal flaw(s). Sending to human review.`);
    }

    const finishedAt = new Date();
    const lineage: PipelineLineage = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      agents: agentStats,
      totalCostUsd: totalCost,
      version: "v4.0",
    };

    // ── STEP 7: Persist publication with lineage ──
    const publication = await prisma.thinkTankPublication.create({
      data: {
        verticalId: signal.verticalId,
        signalId: signal.id,
        type: pubType,
        title,
        html,
        wordCount,
        trustScore,
        qualityScore: Math.round(avgSourceQuality),
        citationCoverage,
        sourceIds: signal.sourceIds,
        criticalLoopResult: {
          ...criticalLoopResult as any,
          debate: debateResult ? {
            dominantThesis: debateResult.dominantThesis,
            confidenceInDominant: debateResult.confidenceInDominant,
            synthesisQuality: debateResult.debateQuality?.synthesisQuality,
          } : null,
          devilsAdvocate: daReport ? {
            verdict: daReport.verdict,
            overallStrength: daReport.overallStrength,
            publishabilityScore: daReport.publishabilityScore,
            fatalChallenges: daReport.fatalChallenges.length,
            majorChallenges: daReport.majorChallenges.length,
            killShot: daReport.killShot,
            vsInstitutions: daReport.vsInstitutionBenchmark?.overall,
          } : null,
          lineage,
        },
        publishedAt: needsHumanReview ? null : new Date()
      }
    });

    // Record publication for cadence if published
    if (!needsHumanReview) {
      await recordPublication(signal.verticalId);
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "PUBLISHED" }
      });
    } else if (daBlocked) {
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "REJECTED" }
      });
    }

    console.log(`[PUBLICATION_GENERATOR] ✅ Created publication ${publication.id} (trust: ${trustScore}/100, cost: $${totalCost.toFixed(4)}, ${lineage.durationMs}ms)`);

    return {
      publicationId: publication.id,
      title,
      html,
      wordCount,
      trustScore,
      criticalLoopResult,
      success: true,
      lineage,
    };
    
  } catch (error: any) {
    console.error(`[PUBLICATION_GENERATOR] Failed: ${error.message}`);
    return {
      publicationId: "",
      title: "",
      html: "",
      wordCount: 0,
      trustScore: 0,
      criticalLoopResult: {} as CriticalLoopResult,
      success: false,
      error: error.message
    };
  }
}
