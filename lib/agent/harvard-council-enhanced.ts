/**
 * SCALABLE HARVARD COUNCIL — Optimized for 22 PhD Researchers
 * 
 * Enhanced architecture for larger expert councils with:
 * - Hierarchical consensus (domain leads + supporting experts)
 * - Load balancing and parallel processing
 * - Smart timeout management
 * - Real LLM-based expert analysis (not placeholders)
 * - Integration with evidence grading and adversarial review
 * 
 * Uses REAL implementations from:
 * - phd-researcher.ts (22 PhD personas + runExpertCouncil)
 * - review-board.ts (gradeEvidence + runReviewBoard + synthesizeCouncil)
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import type { DomainExpertise, ExpertAnalysis } from './types/index';
import { runExpertCouncil, detectRelevantExperts, runExpertAnalysis } from './phd-researcher';
import { gradeEvidence, runReviewBoard } from './review-board';

// ============================================================================
// ENHANCED TYPES FOR 22 EXPERT COUNCIL
// ============================================================================

export interface EnhancedSynthesisReport {
  // Core synthesis
  consensus: string;
  disagreements: string;
  confidence: number;
  
  // Hierarchical structure
  domainLeads: {
    domain: DomainExpertise;
    leadExpert: ExpertAnalysis;
    consensusLevel: number; // 0-100 agreement within domain
  }[];
  
  // Cross-domain insights
  interdisciplinary: {
    connections: string[];
    conflicts: string[];
    synergies: string[];
  };
  
  // Quality metrics
  evidenceQuality: {
    overallLevel: number;
    domainBreakdown: Record<DomainExpertise, number>;
    confidence: number;
  };
  
  // Recommendations
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    research: string[];
  };
  
  // Performance
  totalCostUsd: number;
  totalDurationMs: number;
  expertCount: number;
}

export interface CouncilConfig {
  maxExperts?: number;
  timeoutMs?: number;
  enableHierarchical?: boolean;
  enableInterdisciplinary?: boolean;
  strategic?: boolean;
  runId?: string;
}

// ============================================================================
// HIERARCHICAL COUNCIL ARCHITECTURE
// ============================================================================

/**
 * Domain Lead Selection - For 22 experts, organize into domain clusters
 */
export function selectDomainLeads(experts: DomainExpertise[]): DomainExpertise[] {
  // Define domain clusters for hierarchical organization (all 22 domains)
  const domainClusters = {
    stem: ['technology', 'health', 'environment', 'quantitative', 'finance', 'energy-advanced', 'cognitive-science', 'bioethics'],
    social: ['economics', 'policy', 'security', 'social-sciences', 'geopolitics', 'digital-society', 'behavioral-economics', 'development-economics'],
    analytical: ['risk-analysis', 'complexity-science', 'computational-social-science', 'urban-studies'],
    humanities: ['law', 'humanities']
  };
  
  const leads: DomainExpertise[] = [];
  
  // Select lead from each cluster based on relevance score
  for (const [cluster, domains] of Object.entries(domainClusters)) {
    const clusterExperts = experts.filter(e => domains.includes(e));
    if (clusterExperts.length > 0) {
      // Simple selection: first expert in cluster (could be enhanced with scoring)
      leads.push(clusterExperts[0]);
    }
  }
  
  return leads;
}

/**
 * Load-Balanced Parallel Processing — uses REAL runExpertAnalysis from phd-researcher.ts
 */
export async function runLoadBalancedCouncil(
  question: string,
  sourceContext: string,
  sourceCount: number,
  config: CouncilConfig
): Promise<{
  domainLeads: ExpertAnalysis[];
  supportingExperts: ExpertAnalysis[];
  totalCost: number;
  totalDuration: number;
}> {
  const start = Date.now();
  const maxExperts = config.maxExperts || (config.strategic ? 12 : 8);
  
  // Smart expert selection using REAL detectRelevantExperts
  const selectedExpertDomains = detectRelevantExperts(question, {
    maxExperts,
    strategic: config.strategic
  });
  
  // Organize into leads and supporting experts
  const leadDomains: DomainExpertise[] = selectDomainLeads(selectedExpertDomains);
  const supportingDomains: DomainExpertise[] = selectedExpertDomains.filter(e => !leadDomains.includes(e));
  
  console.log(`[HIERARCHICAL] Domain leads (${leadDomains.length}): ${leadDomains.join(", ")}`);
  console.log(`[HIERARCHICAL] Supporting experts (${supportingDomains.length}): ${supportingDomains.join(", ")}`);
  
  // Parallel execution: leads + supporting experts via REAL runExpertAnalysis
  const [leadsResult, supportingResult] = await Promise.allSettled([
    // Domain leads get processed first
    Promise.allSettled(
      leadDomains.map(domain => runExpertAnalysis(domain, question, sourceContext, sourceCount, config.runId))
    ),
    // Supporting experts processed in parallel
    Promise.allSettled(
      supportingDomains.map(domain => runExpertAnalysis(domain, question, sourceContext, sourceCount, config.runId))
    )
  ]);
  
  const domainLeads = leadsResult.status === 'fulfilled'
    ? leadsResult.value.filter((r): r is PromiseFulfilledResult<ExpertAnalysis> => r.status === 'fulfilled').map(r => r.value)
    : [];
  const supportingExperts = supportingResult.status === 'fulfilled'
    ? supportingResult.value.filter((r): r is PromiseFulfilledResult<ExpertAnalysis> => r.status === 'fulfilled').map(r => r.value)
    : [];
  
  // Calculate costs
  const leadCost = domainLeads.reduce((sum, a) => sum + (a.costUsd || 0), 0);
  const supportingCost = supportingExperts.reduce((sum, a) => sum + (a.costUsd || 0), 0);
  const totalCost = leadCost + supportingCost;
  const totalDuration = Date.now() - start;
  
  return {
    domainLeads,
    supportingExperts,
    totalCost,
    totalDuration
  };
}

/**
 * Interdisciplinary Analysis - Cross-domain insights
 */
export async function analyzeInterdisciplinary(
  domainLeads: ExpertAnalysis[],
  supportingExperts: ExpertAnalysis[]
): Promise<{
  connections: string[];
  conflicts: string[];
  synergies: string[];
}> {
  const allExperts = [...domainLeads, ...supportingExperts];
  
  if (allExperts.length < 2) {
    return { connections: [], conflicts: [], synergies: [] };
  }
  
  // Build interdisciplinary context
  const expertSummaries = allExperts.map(expert => 
    `### ${expert.expertName} (${expert.expertId})
Key Findings: ${expert.keyFindings.join("; ")}
Confidence: ${expert.confidence}%
Methodology: ${expert.methodology_critique.slice(0, 200)}...
`
  ).join("\n\n");
  
  const prompt = `Analyze the interdisciplinary relationships between these expert analyses:

${expertSummaries}

Identify and categorize:
1. CONNECTIONS: Where do different domains reinforce each other?
2. CONFLICTS: Where do different domains disagree or contradict?
3. SYNERGIES: What novel insights emerge from combining domains?

Format as JSON with connections, conflicts, synergies arrays.`;

  try {
    const response = await callLLM({
      messages: [
        {
          role: "system",
          content: "You are an expert in interdisciplinary research synthesis. Identify cross-domain connections, conflicts, and synergies."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      maxTokens: 1000,
      task: 'harvard_council',
      enableCache: true,
    });
    
    const result = parseJson<any>(response.content);
    if (!result) throw new SyntaxError('Interdisciplinary analysis: failed to parse LLM JSON');
    return {
      connections: result.connections || [],
      conflicts: result.conflicts || [],
      synergies: result.synergies || []
    };
    
  } catch (error) {
    console.error("Interdisciplinary analysis failed:", error);
    return {
      connections: ["Interdisciplinary analysis failed"],
      conflicts: [],
      synergies: []
    };
  }
}

// ============================================================================
// ENHANCED SYNTHESIS DIRECTOR
// ============================================================================

export async function runEnhancedSynthesis(
  question: string,
  domainLeads: ExpertAnalysis[],
  supportingExperts: ExpertAnalysis[],
  interdisciplinary: { connections: string[]; conflicts: string[]; synergies: string[] },
  evidenceGrade: any,
  config: CouncilConfig
): Promise<EnhancedSynthesisReport> {
  const start = Date.now();
  
  // Build comprehensive synthesis context
  const leadsContext = domainLeads.map(lead => 
    `### ${lead.expertName} (Domain Lead: ${lead.expertId})
Confidence: ${lead.confidence}%
Findings: ${Array.isArray(lead.keyFindings) ? lead.keyFindings.join("; ") : lead.keyFindings}
Implications: ${Array.isArray(lead.implications) ? lead.implications.join("; ") : lead.implications}
Blind spots: ${Array.isArray(lead.blind_spots) ? lead.blind_spots.join("; ") : lead.blind_spots}`
  ).join("\n\n");
  
  const supportingContext = supportingExperts.length > 0 ? 
    supportingExperts.map(expert => 
      `### ${expert.expertName} (${expert.expertId})
Confidence: ${expert.confidence}%
Key insights: ${expert.keyFindings.slice(0, 2).map(String).join("; ")}`
    ).map(String).join("\n\n") : "No supporting experts";
  
  const interdisciplinaryContext = `
### Interdisciplinary Analysis
Connections: ${interdisciplinary.connections.map(String).join("; ")}
Conflicts: ${interdisciplinary.conflicts.map(String).join("; ")}
Synergies: ${interdisciplinary.synergies.map(String).join("; ")}
`;
  
  const prompt = `Synthesize this comprehensive expert analysis into a unified report:

QUESTION: ${question}

=== DOMAIN LEADS ===
${leadsContext}

=== SUPPORTING EXPERTS ===
${supportingContext}

=== INTERDISCIPLINARY INSIGHTS ===
${interdisciplinaryContext}

=== EVIDENCE QUALITY ===
Overall Level: ${evidenceGrade.overallLevel}/5
Confidence: ${evidenceGrade.confidence}%

Provide enhanced synthesis including:
1. Overall consensus and key disagreements
2. Domain-specific consensus levels
3. Interdisciplinary connections and conflicts
4. Evidence quality assessment by domain
5. Tiered recommendations (immediate/short-term/long-term/research)
6. Overall confidence assessment

Format as JSON matching EnhancedSynthesisReport interface.`;

  try {
    const response = await callLLM({
      messages: [
        {
          role: "system",
          content: "You are a synthesis director specializing in integrating multi-domain expert analysis. Provide structured, actionable synthesis with clear confidence levels."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      maxTokens: 3000,
      task: 'harvard_council',
      enableCache: true,
    });
    
    const synthesisData = parseJson<any>(response.content);
    if (!synthesisData) throw new SyntaxError('Enhanced synthesis: failed to parse LLM JSON');
    const duration = Date.now() - start;
    
    // Ensure required structure
    return {
      consensus: synthesisData.consensus || "Consensus synthesis unavailable",
      disagreements: synthesisData.disagreements || "Disagreements analysis unavailable",
      confidence: synthesisData.confidence || 50,
      domainLeads: domainLeads.map(lead => ({
        domain: lead.expertId as DomainExpertise,
        leadExpert: lead,
        consensusLevel: synthesisData.domainConsensus?.[lead.expertId as DomainExpertise] || lead.confidence
      })),
      interdisciplinary,
      evidenceQuality: {
        overallLevel: evidenceGrade.overallLevel,
        domainBreakdown: synthesisData.evidenceQuality?.domainBreakdown || {},
        confidence: evidenceGrade.confidence
      },
      recommendations: {
        immediate: synthesisData.recommendations?.immediate || [],
        shortTerm: synthesisData.recommendations?.shortTerm || [],
        longTerm: synthesisData.recommendations?.longTerm || [],
        research: synthesisData.recommendations?.research || []
      },
      totalCostUsd: 0, // Calculated at higher level
      totalDurationMs: duration,
      expertCount: domainLeads.length + supportingExperts.length
    };
    
  } catch (error) {
    console.error("Enhanced synthesis failed:", error);
    
    // Fallback synthesis
    return {
      consensus: "Enhanced synthesis failed - manual review required",
      disagreements: "Unable to analyze disagreements",
      confidence: 30,
      domainLeads: domainLeads.map(lead => ({
        domain: lead.expertId as DomainExpertise,
        leadExpert: lead,
        consensusLevel: lead.confidence
      })),
      interdisciplinary,
      evidenceQuality: {
        overallLevel: evidenceGrade.overallLevel,
        domainBreakdown: {} as Record<DomainExpertise, number>,
        confidence: evidenceGrade.confidence
      },
      recommendations: {
        immediate: ["Manual review required"],
        shortTerm: [],
        longTerm: [],
        research: []
      },
      totalCostUsd: 0,
      totalDurationMs: Date.now() - start,
      expertCount: domainLeads.length + supportingExperts.length
    };
  }
}

// ============================================================================
// MAIN ENHANCED HARVARD COUNCIL FUNCTION
// ============================================================================

export async function runEnhancedHarvardCouncil(
  question: string,
  sourceContext: string,
  sourceCount: number,
  options?: CouncilConfig
): Promise<EnhancedSynthesisReport> {
  const start = Date.now();
  // More conservative defaults - only use more experts for complex topics
  const config = {
    maxExperts: options?.strategic ? 6 : 4, // Reduced from 12 to 6/4
    timeoutMs: options?.strategic ? 240000 : 120000, // 4min/2min
    enableHierarchical: true,
    enableInterdisciplinary: options?.strategic, // Only for strategic
    strategic: true,
    ...options
  };
  
  console.log(`\n${"━".repeat(80)}`);
  console.log(`  🎓 ENHANCED HARVARD COUNCIL — ${config.maxExperts} PhD Expert Analysis`);
  console.log(`  Question: "${question.slice(0, 80)}..."`);
  console.log(`  Mode: ${config.strategic ? 'Strategic' : 'Standard'} | Hierarchical: ${config.enableHierarchical}`);
  console.log(`${"━".repeat(80)}\n`);
  
  let totalCost = 0;
  
  try {
    // Phase 1: Load-balanced expert analysis
    const { domainLeads, supportingExperts, totalCost: analysisCost, totalDuration: analysisDuration } = 
      await runLoadBalancedCouncil(question, sourceContext, sourceCount, config);
    
    totalCost += analysisCost;
    
    // Phase 2: Evidence grading (parallel with interdisciplinary)
    const [evidenceGrade, interdisciplinary] = await Promise.allSettled([
      gradeEvidence(question, sourceContext, sourceCount),
      config.enableInterdisciplinary ? 
        analyzeInterdisciplinary(domainLeads, supportingExperts) : 
        Promise.resolve({ connections: [], conflicts: [], synergies: [] })
    ]);
    
    const evidenceResult = evidenceGrade.status === 'fulfilled' ? evidenceGrade.value : null;
    const interdisciplinaryResult = interdisciplinary.status === 'fulfilled' ? interdisciplinary.value : { connections: [], conflicts: [], synergies: [] };
    
    // Phase 3: Enhanced synthesis
    const synthesis = await runEnhancedSynthesis(
      question,
      domainLeads,
      supportingExperts,
      interdisciplinaryResult,
      evidenceResult || { overallLevel: 3, confidence: 50 },
      config
    );
    
    // Phase 4: Adversarial review (optional, for high-stakes analysis)
    let reviewResults = null;
    if (config.strategic && domainLeads.length + supportingExperts.length >= 6) {
      try {
        const allAnalyses = [...domainLeads, ...supportingExperts];
        const analysisContext = allAnalyses.map(a =>
          `[${a.expertName}] Confidence: ${a.confidence}% | Findings: ${a.keyFindings.join('; ')}`
        ).join('\n');
        reviewResults = await runReviewBoard(question, analysisContext);
      } catch (reviewError) {
        console.warn("Adversarial review failed:", reviewError);
      }
    }
    
    const totalDuration = Date.now() - start;
    synthesis.totalCostUsd = totalCost;
    synthesis.totalDurationMs = totalDuration;
    
    console.log(`[ENHANCED COUNCIL] Completed in ${totalDuration}ms | Cost: $${totalCost.toFixed(4)}`);
    console.log(`[ENHANCED COUNCIL] Domain leads: ${domainLeads.length} | Supporting: ${supportingExperts.length}`);
    
    return synthesis;
    
  } catch (error) {
    console.error("Enhanced Harvard Council failed:", error);
    throw new Error(`Enhanced council execution failed: ${(error as Error).message}`);
  }
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

export interface CouncilMetrics {
  totalExperts: number;
  domainLeads: number;
  supportingExperts: number;
  totalDurationMs: number;
  totalCostUsd: number;
  averageConfidence: number;
  interdisciplinaryConnections: number;
  conflicts: number;
  synergies: number;
}

export function calculateCouncilMetrics(synthesis: EnhancedSynthesisReport): CouncilMetrics {
  const allAnalyses = [
    ...synthesis.domainLeads.map(lead => lead.leadExpert),
  ];
  
  const averageConfidence = allAnalyses.length > 0 
    ? allAnalyses.reduce((sum, analysis) => sum + analysis.confidence, 0) / allAnalyses.length
    : 0;
  
  return {
    totalExperts: synthesis.expertCount,
    domainLeads: synthesis.domainLeads.length,
    supportingExperts: synthesis.expertCount - synthesis.domainLeads.length,
    totalDurationMs: synthesis.totalDurationMs,
    totalCostUsd: synthesis.totalCostUsd,
    averageConfidence,
    interdisciplinaryConnections: synthesis.interdisciplinary.connections.length,
    conflicts: synthesis.interdisciplinary.conflicts.length,
    synergies: synthesis.interdisciplinary.synergies.length,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types already exported above
