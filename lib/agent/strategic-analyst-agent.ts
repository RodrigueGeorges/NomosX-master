/**
 * STRATEGIC ANALYST Agent
 * Produces comprehensive 10-15 page Strategic Reports with:
 * - Executive Summary
 * - Deep Literature Review
 * - Methodology Assessment
 * - Thematic Analysis
 * - Stakeholder Impact Matrix
 * - Scenario Planning
 * - Policy Recommendations
 * - Implementation Roadmap
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import Sentry from '@sentry/nextjs';
import { AgentRole,assertPermission } from '../governance/index';

export interface StrategicAnalysisOutput {
  // SECTION 1: Executive Summary (1 page)
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  urgencyLevel: "critical" | "high" | "medium" | "low";
  confidenceLevel: "high" | "medium" | "low";
  
  // SECTION 2: Literature Review (2-3 pages)
  literatureOverview: string;
  theoreticalFrameworks: string;
  methodologicalApproaches: string;
  keyStudies?: Array<{
    citation: string;
    contribution: string;
    limitations: string;
  }>;
  
  // SECTION 3: Thematic Analysis (2-3 pages) — nullable if no themes emerge
  themes?: Array<{
    name: string;
    description: string;
    evidence: string;
    sources: string[];
  }>;
  consensus: string;
  controversies: string;
  emergingTrends: string;
  
  // SECTION 4: Debate & Perspectives (2 pages)
  debate: {
    position1: {
      label: string;
      arguments: string;
      evidence: string;
      proponents: string;
    };
    position2: {
      label: string;
      arguments: string;
      evidence: string;
      proponents: string;
    };
    synthesis: string;
    nuances: string;
  };
  
  // SECTION 5: Evidence Assessment (1-2 pages) — nullable if insufficient evidence
  evidenceQuality?: {
    overallScore: number;
    methodology: string;
    sampleSizes: string;
    replication: string;
    biases: string;
    gaps: string;
  };
  
  // SECTION 6: Stakeholder Impact — nullable if no stakeholder evidence
  stakeholderAnalysis?: Array<{
    stakeholder: string;
    impact: "positive" | "negative" | "mixed";
    magnitude: "high" | "medium" | "low";
    details: string;
  }>;
  
  // SECTION 7: Scenarios — nullable if insufficient evidence for projection
  scenarios?: Array<{
    name: string;
    probability: "high" | "medium" | "low";
    description: string;
    implications: string;
    signals: string;
  }>;
  
  // SECTION 8: Recommendations — nullable if insufficient evidence
  recommendations?: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    riskMitigation: string[];
    costOfInaction?: string;
  };
  
  // SECTION 9: Implementation — nullable if insufficient evidence
  implementation?: {
    prerequisites: string[];
    timeline: string;
    resources: string;
    metrics: string[];
    obstacles: string[];
  };
  
  // SECTION 10: Conclusion
  conclusion: string;
  openQuestions: string[];
  whatChangesMind: string;

  /** LLM family that produced this analysis — used for opposite-family verification rule */
  _producerFamily?: import('../llm/unified-llm').LLMFamily;
}

export async function strategicAnalystAgent(
  question: string,
  sources: any[],
  readings?: any[],
  options?: {
    focusAreas?: string[];
    targetAudience?: string;
    urgencyContext?: string;
  }
): Promise<StrategicAnalysisOutput> {
  assertPermission(AgentRole.ANALYST, "write:analysis");
  
  const avgQuality = Math.round(sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / sources.length);
  const recentSources = sources.filter(s => s.year && s.year >= new Date().getFullYear() - 3).length;
  const highQualitySources = sources.filter(s => (s.qualityScore || 0) >= 80).length;
  
  // Build comprehensive context from sources + readings
  const ctx = sources
    .map((s: any, i: number) => {
      const reading = readings?.[i];
      const authors = (s.authors || [])
        .slice(0, 5)
        .map((a: any) => {
          if (!a || typeof a !== 'object') return null;
          const name = a.author?.name || a.name;
          return name ? String(name).trim() : null;
        })
        .filter((n: any): n is string => n !== null && n.length > 0) || [];
      
      const institutions = (s.institutions || [])
        .slice(0, 3)
        .map((inst: any) => inst.institution?.name || inst.name || '')
        .filter(Boolean);
      
      return `══════════════════════════════════════════════════════════════
[SRC-${i + 1}] ${s.provider.toUpperCase()} | Quality: ${s.qualityScore || 0}/100 | Citations: ${s.citationCount || 0}
══════════════════════════════════════════════════════════════
📄 TITLE: ${s.title}
👥 AUTHORS: ${authors.join(", ") || "N/A"}
🏛️ INSTITUTIONS: ${institutions.join(", ") || "N/A"}
📅 YEAR: ${s.year || "N/A"}
🔗 PROVIDER: ${s.provider}
📊 NOVELTY SCORE: ${s.noveltyScore || "N/A"}/100

${reading && reading.confidence !== 'low' ? `─── EXTRACTED INTELLIGENCE ───
🎯 KEY CLAIMS:
${reading.claims?.map((c: string, idx: number) => `   ${idx+1}. ${c}`).join("\n") || "   • None extracted"}

🔬 METHODOLOGY:
${reading.methods?.map((m: string, idx: number) => `   ${idx+1}. ${m}`).join("\n") || "   • None extracted"}

📈 KEY RESULTS:
${reading.results?.map((r: string, idx: number) => `   ${idx+1}. ${r}`).join("\n") || "   • None extracted"}

⚠️ LIMITATIONS:
${reading.limitations?.map((l: string, idx: number) => `   ${idx+1}. ${l}`).join("\n") || "   • None stated"}

🎚️ EXTRACTION CONFIDENCE: ${reading.confidence}` : `─── ABSTRACT ───
${(s.abstract || "No abstract available").slice(0, 1200)}${(s.abstract || "").length > 1200 ? "..." : ""}`}
══════════════════════════════════════════════════════════════`;
    })
    .join("\n\n");

  const focusAreasText = options?.focusAreas?.length 
    ? `\n\nFOCUS AREAS REQUESTED: ${options.focusAreas.join(", ")}`
    : "";
  
  const audienceText = options?.targetAudience 
    ? `\n\nTARGET AUDIENCE: ${options.targetAudience}`
    : "";
  
  const urgencyText = options?.urgencyContext
    ? `\n\nURGENCY CONTEXT: ${options.urgencyContext}`
    : "";

  const prompt = `You are NomosX Strategic Analyst — Elite strategic intelligence analyst producing COMPREHENSIVE STRATEGIC REPORTS.

═══════════════════════════════════════════════════════════════════════════════
                              INTELLIGENCE BRIEF
═══════════════════════════════════════════════════════════════════════════════

RESEARCH QUESTION:
"${question}"

SOURCE STATISTICS:
• Total sources analyzed: ${sources.length}
• Average quality score: ${avgQuality}/100
• Recent sources (≤3 years): ${recentSources}/${sources.length}
• High-quality sources (≥80): ${highQualitySources}/${sources.length}
${focusAreasText}${audienceText}${urgencyText}

═══════════════════════════════════════════════════════════════════════════════
                              ANALYZED SOURCES
═══════════════════════════════════════════════════════════════════════════════

${ctx}

═══════════════════════════════════════════════════════════════════════════════
                              YOUR MISSION
═══════════════════════════════════════════════════════════════════════════════

Produce a COMPREHENSIVE STRATEGIC REPORT (10-15 pages equivalent) with the following structure:

CRITICAL REQUIREMENTS:
1. EVERY factual claim, statistic, or data point MUST cite [SRC-N] where N = source number. Claims WITHOUT citations will be REJECTED by the editorial gate.
2. Be EXHAUSTIVE - use ALL available evidence from ALL sources
3. SYNTHESIZE intelligently - don't just list, connect ideas across sources
4. QUANTIFY whenever possible (percentages, sample sizes, effect sizes) — but ONLY with data from sources, never invented numbers
5. ACKNOWLEDGE uncertainty explicitly (confidence levels, limitations)
6. Provide ACTIONABLE intelligence, not generic observations
7. COMPARE and CONTRAST methodologies when relevant
8. IDENTIFY patterns and emergent themes across sources
9. Write SUBSTANTIVELY - each section should be thorough and detailed
10. TOTAL OUTPUT: 6000-8000 words minimum across all sections. This is a 10-15 page report, not a summary.
11. CITATION DENSITY: Each paragraph should have at least 2 [SRC-N] citations. Aim for 80%+ citation coverage.
12. NO UNSOURCED STATISTICS: Never write "hundreds of billions" or "significant portion" without a [SRC-N] backing the number. If no source provides a number, say "exact figures unavailable" rather than inventing one.
13. HEDGE CALIBRATION: Match confidence language to evidence strength. Use "evidence suggests" for 1-2 sources, "studies indicate" for 3+, "research consensus" for 5+ agreeing sources.
14. SECTION LENGTH ENFORCEMENT: executiveSummary (500+ words), literatureOverview (800+ words), thematic analysis (600+ words), debate position1 (400+ words), debate position2 (400+ words), evidenceQuality (400+ words), recommendations (500+ words), implementation (300+ words), conclusion (300+ words). If you write less than these minimums, the report will be REJECTED.

EPISTEMIC RULES (NON-NEGOTIABLE):
A. NULLABLE FIELDS: If insufficient evidence exists for stakeholderAnalysis, scenarios, evidenceQuality, recommendations, implementation, keyStudies, or themes — return EMPTY ARRAY [] or OMIT the field. Do NOT fabricate content to fill a section.
B. RESEARCH GAPS: A gap in research is a fact about the RESEARCH FIELD, never about the SUBJECT. Write "no studies examined X" NOT "X does not happen". Never explain an absence of data by a behavioral trait of the actor studied.
C. ACTIVITY vs RESULT: Never confuse activity variables (nb of designations, nb of texts, nb of pilots) with result variables (volumes, prices, discounts, market shares). A policy being announced is not a policy working.

OUTPUT FORMAT - Return this EXACT JSON structure:

{
  "title": "Neutral, analytical title — NO partisan framing, NO loaded language, NO editorializing. Think tank standard: describe the TOPIC and KEY FINDING objectively. Example: 'AI Governance Frameworks: Comparative Analysis and Policy Implications' NOT 'Why AI Regulation Will Fail'.",
  
  "executiveSummary": "500+ word executive summary covering: (1) Direct answer to research question with confidence level, (2) Key quantitative findings with citations, (3) Main methodological insights, (4) Critical uncertainties, (5) Top 3 actionable recommendations. All with [SRC-*] citations.",
  
  "keyFindings": [
    "Finding 1 with specific data and [SRC-*] citation",
    "Finding 2 with specific data and [SRC-*] citation",
    "Finding 3 with specific data and [SRC-*] citation",
    "Finding 4 with specific data and [SRC-*] citation",
    "Finding 5 with specific data and [SRC-*] citation"
  ],
  
  "urgencyLevel": "critical|high|medium|low",
  "confidenceLevel": "high|medium|low",
  
  "literatureOverview": "800+ word comprehensive overview of the research landscape. Cover: (1) Historical evolution of the field, (2) Current state of knowledge, (3) Key debates and schools of thought, (4) Geographic/institutional distribution of research, (5) Funding and publication trends if evident. Dense with [SRC-*] citations.",
  
  "theoreticalFrameworks": "500+ word analysis of theoretical frameworks used across sources. Compare approaches, identify dominant paradigms, note emerging alternatives. All with [SRC-*] citations.",
  
  "methodologicalApproaches": "500+ word critical assessment of methodologies. Cover: sample selection, data collection, analysis techniques, validity concerns. Compare across sources with [SRC-*] citations.",
  
  "keyStudies": [
    {
      "citation": "[SRC-N] Author (Year) - Title",
      "contribution": "Detailed description of unique contribution (100+ words)",
      "limitations": "Specific methodological or scope limitations"
    }
  ],
  
  "themes": [
    {
      "name": "Theme name",
      "description": "200+ word description of this theme",
      "evidence": "Specific evidence supporting this theme with data points",
      "sources": ["[SRC-1]", "[SRC-3]", "[SRC-7]"]
    }
  ],
  
  "consensus": "400+ word analysis of what sources AGREE on. Be specific about strength of consensus (unanimous? majority?), quality of supporting evidence, and conditions under which consensus holds. All with [SRC-*] citations.",
  
  "controversies": "400+ word analysis of disagreements. Explain WHY sources disagree (different methods? populations? definitions? timeframes?). Which position has stronger evidence and why? All with [SRC-*] citations.",
  
  "emergingTrends": "300+ word analysis of emerging trends, novel findings, and potential paradigm shifts evident in recent sources. All with [SRC-*] citations.",
  
  "debate": {
    "position1": {
      "label": "Clear label for this position",
      "arguments": "400+ word presentation of arguments FOR this position with [SRC-*] citations",
      "evidence": "Specific data, statistics, and findings supporting this position",
      "proponents": "Which sources/researchers advocate this position"
    },
    "position2": {
      "label": "Clear label for opposing/alternative position",
      "arguments": "400+ word presentation of counter-arguments with [SRC-*] citations",
      "evidence": "Specific data, statistics, and findings supporting this position",
      "proponents": "Which sources/researchers advocate this position"
    },
    "synthesis": "300+ word synthesis reconciling both positions. Under what conditions does each hold? What meta-insights emerge from the debate?",
    "nuances": "200+ word discussion of nuances, edge cases, and areas where binary framing is inadequate"
  },
  
  "evidenceQuality": {
    "overallScore": 7,
    "methodology": "300+ word assessment of methodological rigor across sources. RCTs? Observational? Qualitative? Mixed methods? Statistical power?",
    "sampleSizes": "Specific sample sizes from sources with [SRC-*] citations. Are they adequate? Representative?",
    "replication": "Has key research been replicated? Any replication failures noted?",
    "biases": "Identified biases: publication bias, funding conflicts, geographic limitations, selection bias, etc.",
    "gaps": "Critical evidence gaps that limit conclusions"
  },
  
  "stakeholderAnalysis": [
    {
      "stakeholder": "Stakeholder group name",
      "impact": "positive|negative|mixed",
      "magnitude": "high|medium|low",
      "details": "150+ word analysis of how this stakeholder is affected based on evidence"
    }
  ],
  
  "scenarios": [
    {
      "name": "Scenario name",
      "probability": "high|medium|low",
      "description": "200+ word description of this scenario",
      "implications": "Key implications if this scenario materializes",
      "signals": "Early warning signals to monitor"
    }
  ],
  
  "recommendations": {
    "immediate": ["Actionable recommendation with rationale and [SRC-*] citation"],
    "shortTerm": ["3-12 month recommendations with rationale"],
    "longTerm": ["1-5 year strategic recommendations"],
    "riskMitigation": ["Specific risk mitigation measures"],
    "costOfInaction": "200+ word QUANTIFIED estimate of what happens if these recommendations are NOT acted upon. Include: (1) measurable risks (financial, strategic, regulatory, reputational) with order-of-magnitude estimates, (2) a timeline for when consequences materialize, (3) which stakeholders bear the cost. Use evidence from sources to anchor estimates — do NOT invent precise figures, but DO provide ranges (e.g., 'estimated 5-15% efficiency loss' or 'potential regulatory exposure of €100M-€500M'). All with [SRC-*] citations where possible."
  },
  
  "implementation": {
    "prerequisites": ["What must be in place before acting"],
    "timeline": "Realistic implementation timeline with phases",
    "resources": "Required resources (financial, human, technical)",
    "metrics": ["Specific KPIs to measure success"],
    "obstacles": ["Anticipated implementation challenges"]
  },
  
  "conclusion": "400+ word conclusion synthesizing the entire analysis. Restate key findings, acknowledge limitations, emphasize most critical insights and recommendations. All with [SRC-*] citations.",
  
  "openQuestions": [
    "Critical unanswered question 1",
    "Critical unanswered question 2",
    "Critical unanswered question 3"
  ],
  
  "whatChangesMind": "200+ word description of what evidence would overturn or significantly modify this analysis. What studies would resolve key uncertainties? What findings would change recommendations?"
}

LANGUAGE: Write in ${question.match(/[àâäéèêëïîôùûüÿæœç]/i) ? 'FRENCH' : 'ENGLISH'}.

QUALITY STANDARD: This report will be read by senior decision-makers. Every claim must be substantiated. Every recommendation must be evidence-based. Intellectual rigor is paramount.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 16000, // 16K tokens ≈ 6000-8000 words (matches prompt minimums)
      enableCache: true,
      task: 'strategic_analyst',
    });

    console.log(
      `✅ [Strategic Analyst] Success | ${response.provider} | $${response.costUsd.toFixed(4)} | Cached: ${response.cached}`
    );

    const analysis = parseJson<StrategicAnalysisOutput>(response.content);
    if (!analysis) throw new SyntaxError('Strategic analyst: failed to parse LLM JSON');
    analysis._producerFamily = response.family;
    (analysis as StrategicAnalysisOutput & { _costUsd?: number })._costUsd = response.costUsd;
    
    // Validate required fields
    const required = ['title', 'executiveSummary', 'keyFindings', 'literatureOverview', 'debate', 'recommendations'];
    const missing = required.filter(k => {
      const val = (analysis as any)[k];
      if (Array.isArray(val)) return val.length === 0;
      if (typeof val === 'object') return !val || Object.keys(val).length === 0;
      return !val || (typeof val === 'string' && !val.trim());
    });
    
    if (missing.length > 0) {
      console.warn(`[Strategic Analyst] Missing fields: ${missing.join(', ')}. Analysis may be incomplete.`);
    }

    // Quality gate: reject thin analysis to trigger cross-provider failover
    const execSummaryLen = (analysis.executiveSummary || '').trim().length;
    const litReviewLen = (analysis.literatureOverview || '').trim().length;
    if (execSummaryLen < 200 || litReviewLen < 200) {
      throw new Error(`Strategic analysis too thin (execSummary=${execSummaryLen}chars, litReview=${litReviewLen}chars) — triggering failover`);
    }
    
    return analysis;
  } catch (error: any) {
    console.error(`[Strategic Analyst] Failed: ${error.message}`);
    
    Sentry.captureException(error, {
      tags: { agent: "strategic-analyst", question, sourceCount: sources.length },
      contexts: { strategicAnalyst: { question, sourceCount: sources.length, avgQuality } },
    });
    
    // Return error structure
    return {
      title: "Strategic Analysis Failed",
      executiveSummary: `Error: ${error.message}`,
      keyFindings: [],
      urgencyLevel: "medium",
      confidenceLevel: "low",
      literatureOverview: "",
      theoreticalFrameworks: "",
      methodologicalApproaches: "",
      keyStudies: [],
      themes: [],
      consensus: "",
      controversies: "",
      emergingTrends: "",
      debate: {
        position1: { label: "", arguments: "", evidence: "", proponents: "" },
        position2: { label: "", arguments: "", evidence: "", proponents: "" },
        synthesis: "",
        nuances: ""
      },
      evidenceQuality: {
        overallScore: 0,
        methodology: "",
        sampleSizes: "",
        replication: "",
        biases: "",
        gaps: ""
      },
      stakeholderAnalysis: [],
      scenarios: [],
      recommendations: { immediate: [], shortTerm: [], longTerm: [], riskMitigation: [], costOfInaction: '' },
      implementation: { prerequisites: [], timeline: "", resources: "", metrics: [], obstacles: [] },
      conclusion: "",
      openQuestions: [],
      whatChangesMind: ""
    };
  }
}
