/**
 * NomosX VERTICAL INTELLIGENCE ENGINE
 * 
 * PhD Expert-Driven Vertical Intelligence System
 * Replaces passive signal detection with proactive expert-led research
 * 
 * Each vertical is led by PhD researchers who:
 * 1. Actively monitor their domain (news, research, competitors)
 * 2. Identify innovative topics with unique angles
 * 3. Lead specialized research with domain-specific sources
 * 4. Produce original analysis, not generic summaries
 */

import { prisma } from '../../db';
import { callLLM } from '../../llm/unified-llm';
import { VERTICALS } from '../../think-tank/verticals';
import { RESEARCHER_REGISTRY as DOMAIN_EXPERTS, getPrimaryOwner as getPrimaryDomainOwner } from '../researcher-ownership';
import { runExpertCouncil, detectRelevantExperts } from '../phd-researcher';
import { selectSmartProviders } from '../smart-provider-selector';

// ============================================================================
// TYPES
// ============================================================================

export interface InnovativeTopic {
  id: string;
  verticalSlug: string;
  title: string;
  originalAngle: string;
  innovationType: 'BREAKTHROUGH' | 'CONTRADICTION' | 'TREND_ACCELERATION' | 'MARKET_SHIFT';
  leadExpert: {
    name: string;
    domain: string;
    institution: string;
  };
  supportingExperts: Array<{
    name: string;
    domain: string;
    role: string;
  }>;
  competitiveAdvantage: string;
  specializedProviders: string[];
  researchHypothesis: string;
  methodology: string;
  expectedImpact: string;
  priorityScore: number;
  confidenceScore: number;
  detectedAt: Date;
  sources: string[];
}

export interface CompetitiveIntelligence {
  topInstitutions: Array<{
    name: string;
    recentPublications: number;
    trendingTopics: string[];
    qualityScore: number;
  }>;
  emergingMethodologies: string[];
  gapsInCoverage: string[];
  citationHotspots: string[];
}

export interface VerticalIntelligenceConfig {
  verticalSlug: string;
  leadExpert: string;
  monitoringFrequency: 'realtime' | 'hourly' | 'daily';
  competitiveMode: boolean;
  innovationThreshold: number;
  maxTopicsPerRun: number;
  specializedProviders: string[];
  competitorInstitutions: string[];
  focusAreas: string[];
}

// ============================================================================
// SPECIALIZED PROVIDERS BY VERTICAL
// ============================================================================

const VERTICAL_SPECIALIZED_PROVIDERS: Record<string, string[]> = {
  'climate-industry': [
    'ipcc-reports', 'nature-climate', 'mit-climate-lab', 'iea-analysis', 
    'carbonbrief', 'climate-analytics', 'world-resources-institute',
    'imperial-college-climate', 'stanford-woods', 'oxford-martin'
  ],
  'ai-labor': [
    'arxiv-ai', 'nature-ai', 'neurips-proceedings', 'icml-papers',
    'openai-research', 'deepmind-blog', 'anthropic-research', 'mit-csail',
    'stanford-ai-lab', 'berkeley-ai-research', 'nvidia-research'
  ],
  'eu-policy': [
    'eu-commission', 'eu-parliament', 'eu-council', 'court-of-justice',
    'brussels-think-tank', 'ceps', 'bruegel', 'european-council',
    'chatham-house-europe', 'carnegie-europe'
  ],
  'geopolitics': [
    'rand-corporation', 'csis', 'brookings-foreign-policy', 'cfr',
    'chatham-house', 'iiss', 'asia-society', 'carnegie-international',
    'atlantic-council', 'aspen-strategy'
  ],
  'finance-regulation': [
    'bis-reports', 'federal-reserve', 'ecb-statistics', 'sec-filings',
    'financial-stability-board', 'bank-of-england', 'bank-of-japan',
    'people-bank-china', 'basel-committee', 'iosco-reports'
  ]
};

// ============================================================================
// COMPETITOR INSTITUTIONS BY VERTICAL
// ============================================================================

const VERTICAL_COMPETITORS: Record<string, string[]> = {
  'climate-industry': [
    'IPCC', 'IEA', 'MIT Climate Lab', 'Stanford Woods', 'Oxford Martin',
    'Imperial College Grantham', 'Potsdam Institute', 'Climate Analytics'
  ],
  'ai-labor': [
    'MIT CSAIL', 'Stanford AI Lab', 'Berkeley BAIR', 'OpenAI', 'DeepMind',
    'Anthropic', 'Microsoft Research', 'Google Brain', 'Meta AI'
  ],
  'eu-policy': [
    'Bruegel', 'CEPS', 'European Council', 'Chatham House Europe',
    'Carnegie Europe', 'Brussels Think Tank', 'Egmont'
  ],
  'geopolitics': [
    'Council on Foreign Relations', 'CSIS', 'RAND Corporation',
    'Chatham House', 'IISS', 'Brookings Foreign Policy', 'Atlantic Council'
  ],
  'finance-regulation': [
    'BIS', 'Federal Reserve', 'ECB', 'Bank of England', 'Bank of Japan',
    'People\'s Bank China', 'Financial Stability Board', 'IOSCO'
  ]
};

// ============================================================================
// MAIN INTELLIGENCE ENGINE
// ============================================================================

export class VerticalIntelligenceEngine {
  
  /**
   * Discover innovative topics for a specific vertical
   * Led by PhD experts with competitive intelligence
   */
  async discoverInnovativeTopics(
    verticalSlug: string, 
    config?: Partial<VerticalIntelligenceConfig>
  ): Promise<InnovativeTopic[]> {
    console.log(`[VERTICAL_INTELLIGENCE] Discovering innovative topics for ${verticalSlug}`);
    
    const vertical = VERTICALS.find(v => v.slug === verticalSlug);
    if (!vertical) {
      throw new Error(`Vertical ${verticalSlug} not found`);
    }
    
    // Get lead expert for this vertical
    const leadExpert = getPrimaryDomainOwner(verticalSlug);
    if (!leadExpert) {
      throw new Error(`No lead expert found for vertical ${verticalSlug}`);
    }
    
    // 1. Competitive Intelligence Gathering
    const competitiveIntel = await this.gatherCompetitiveIntelligence(verticalSlug);
    
    // 2. Expert-Led Topic Discovery
    const expertTopics = await this.expertLedTopicDiscovery(
      verticalSlug, 
      leadExpert, 
      competitiveIntel
    );
    
    // 3. Innovation Scoring & Filtering
    const scoredTopics = await this.scoreAndFilterTopics(expertTopics, competitiveIntel);
    
    // 4. Final Selection (max topics per run)
    const maxTopics = config?.maxTopicsPerRun || 3;
    const selectedTopics = scoredTopics
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, maxTopics);
    
    console.log(`[VERTICAL_INTELLIGENCE] Selected ${selectedTopics.length} innovative topics for ${verticalSlug}`);
    
    return selectedTopics;
  }
  
  /**
   * Gather competitive intelligence for the vertical
   */
  private async gatherCompetitiveIntelligence(verticalSlug: string): Promise<CompetitiveIntelligence> {
    const competitors = VERTICAL_COMPETITORS[verticalSlug] || [];
    const specializedProviders = VERTICAL_SPECIALIZED_PROVIDERS[verticalSlug] || [];
    
    // Analyze competitor activity (simulate with LLM)
    const prompt = `As a senior research analyst, analyze the competitive landscape for ${verticalSlug}.
    
Competitors: ${competitors.join(', ')}
Specialized Sources: ${specializedProviders.join(', ')}

Provide JSON with:
1. topInstitutions (name, recentPublications, trendingTopics, qualityScore)
2. emergingMethodologies (list)
3. gapsInCoverage (list)
4. citationHotspots (list)

Focus on what's being published, methodologies used, and gaps we can exploit.`;
    
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 2000,
      enableCache: true
    });
    
    return JSON.parse(response.content);
  }
  
  /**
   * Expert-led topic discovery using PhD researchers
   */
  private async expertLedTopicDiscovery(
    verticalSlug: string,
    leadExpert: any,
    competitiveIntel: CompetitiveIntelligence
  ): Promise<Partial<InnovativeTopic>[]> {
    
    // Get supporting experts based on complexity
    const supportingDomains = detectRelevantExperts(`Research in ${verticalSlug}`, { maxExperts: 3 });
    
    const prompt = `You are ${leadExpert.name}, ${leadExpert.title} at ${leadExpert.institution}.
You are the lead expert for ${verticalSlug} research at NomosX.

COMPETITIVE INTELLIGENCE:
${JSON.stringify(competitiveIntel, null, 2)}

YOUR EXPERTISE:
Domain: ${leadExpert.domains?.join(', ')}
Focus Areas: ${leadExpert.focusAreas?.join(', ')}
Specialized Sources: ${leadExpert.providers?.join(', ')}

TASK: Identify 3-5 innovative research topics that will:
1. Outperform competitor analysis
2. Provide unique insights not covered elsewhere
3. Leverage your specialized expertise
4. Exploit identified gaps in coverage
5. Use emerging methodologies

For each topic provide:
- title (specific, compelling)
- originalAngle (what makes it unique)
- innovationType (BREAKTHROUGH/CONTRADICTION/TREND_ACCELERATION/MARKET_SHIFT)
- researchHypothesis (testable claim)
- methodology (how to validate)
- expectedImpact (why it matters)
- competitiveAdvantage (why we're better positioned)

Return JSON array of topics.`;
    
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 3000,
      enableCache: true
    });
    
    const topics = JSON.parse(response.content);
    
    // Enrich with supporting experts and providers
    return topics.map((topic: any) => ({
      ...topic,
      verticalSlug,
      leadExpert: {
        name: leadExpert.name,
        domain: leadExpert.id,
        institution: leadExpert.institution
      },
      supportingExperts: supportingDomains.map(domain => ({
        name: DOMAIN_EXPERTS[domain]?.name || domain,
        domain,
        role: this.getExpertRole(domain, topic.originalAngle)
      })),
      specializedProviders: VERTICAL_SPECIALIZED_PROVIDERS[verticalSlug] || [],
      detectedAt: new Date(),
      priorityScore: 0, // Will be calculated
      confidenceScore: 0, // Will be calculated
      sources: [] // Will be populated
    }));
  }
  
  /**
   * Score and filter topics based on innovation potential
   */
  private async scoreAndFilterTopics(
    topics: Partial<InnovativeTopic>[],
    competitiveIntel: CompetitiveIntelligence
  ): Promise<InnovativeTopic[]> {
    
    const scoredTopics: InnovativeTopic[] = [];
    
    for (const topic of topics) {
      // Calculate innovation score
      const innovationScore = await this.calculateInnovationScore(topic, competitiveIntel);
      
      // Calculate feasibility score
      const feasibilityScore = await this.calculateFeasibilityScore(topic);
      
      // Calculate market impact score
      const impactScore = await this.calculateImpactScore(topic, competitiveIntel);
      
      // Composite priority score
      const priorityScore = Math.round(
        innovationScore * 0.4 + 
        feasibilityScore * 0.3 + 
        impactScore * 0.3
      );
      
      // Confidence based on expert alignment
      const confidenceScore = this.calculateConfidenceScore(topic);
      
      scoredTopics.push({
        ...topic,
        id: `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        priorityScore,
        confidenceScore,
        sources: [] // Will be populated during research
      } as InnovativeTopic);
    }
    
    // Filter by minimum thresholds
    return scoredTopics.filter(topic => 
      topic.priorityScore >= 70 && 
      topic.confidenceScore >= 60
    );
  }
  
  /**
   * Calculate innovation score based on uniqueness and novelty
   */
  private async calculateInnovationScore(
    topic: Partial<InnovativeTopic>,
    competitiveIntel: CompetitiveIntelligence
  ): Promise<number> {
    
    const prompt = `Rate the innovation potential of this research topic (0-100):

TOPIC: ${topic.title}
ANGLE: ${topic.originalAngle}
HYPOTHESIS: ${topic.researchHypothesis}
METHODOLOGY: ${topic.methodology}

COMPETITOR COVERAGE:
${JSON.stringify(competitiveIntel.gapsInCoverage, null, 2)}

Score based on:
1. Novelty of hypothesis (0-25)
2. Originality of angle (0-25) 
3. Innovation in methodology (0-25)
4. Gap exploitation (0-25)

Return just the number (0-100).`;
    
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 10,
      enableCache: true
    });
    
    return Math.min(100, Math.max(0, parseInt(response.content) || 0));
  }
  
  /**
   * Calculate feasibility score based on available sources and expertise
   */
  private async calculateFeasibilityScore(topic: Partial<InnovativeTopic>): Promise<number> {
    // Base score from specialized providers availability
    const providerScore = (topic.specializedProviders?.length || 0) * 10;
    
    // Expert alignment score
    const expertScore = (topic.supportingExperts?.length || 0) * 15;
    
    // Methodology complexity (lower is more feasible)
    const complexityPenalty = (topic.methodology?.length || 0) > 200 ? 10 : 0;
    
    return Math.min(100, Math.max(0, providerScore + expertScore - complexityPenalty));
  }
  
  /**
   * Calculate potential market impact
   */
  private async calculateImpactScore(
    topic: Partial<InnovativeTopic>,
    competitiveIntel: CompetitiveIntelligence
  ): Promise<number> {
    
    const prompt = `Rate the potential impact of this research topic (0-100):

TOPIC: ${topic.title}
EXPECTED IMPACT: ${topic.expectedImpact}
COMPETITIVE ADVANTAGE: ${topic.competitiveAdvantage}

CITATION HOTSPOTS:
${JSON.stringify(competitiveIntel.citationHotspots, null, 2)}

Score based on:
1. Policy relevance (0-30)
2. Academic interest (0-25)
3. Media potential (0-25)
4. Practical applications (0-20)

Return just the number (0-100).`;
    
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 10,
      enableCache: true
    });
    
    return Math.min(100, Math.max(0, parseInt(response.content) || 0));
  }
  
  /**
   * Calculate confidence score based on expert alignment
   */
  private calculateConfidenceScore(topic: Partial<InnovativeTopic>): number {
    // Base confidence from lead expert domain match
    let confidence = 70;
    
    // Boost from supporting experts
    confidence += (topic.supportingExperts?.length || 0) * 5;
    
    // Boost from specialized providers
    confidence += (topic.specializedProviders?.length || 0) * 2;
    
    return Math.min(100, confidence);
  }
  
  /**
   * Get role for supporting expert based on topic angle
   */
  private getExpertRole(domain: string, angle: string): string {
    const angleLower = angle.toLowerCase();
    
    if (angleLower.includes('econom') || angleLower.includes('market') || angleLower.includes('cost')) {
      return 'economic-analysis';
    }
    
    if (angleLower.includes('policy') || angleLower.includes('regulat') || angleLower.includes('govern')) {
      return 'policy-analysis';
    }
    
    if (angleLower.includes('quantitat') || angleLower.includes('statistic') || angleLower.includes('data')) {
      return 'methodology-review';
    }
    
    if (angleLower.includes('risk') || angleLower.includes('uncertainty') || angleLower.includes('scenario')) {
      return 'risk-assessment';
    }
    
    return 'domain-expert';
  }
  
  /**
   * Store innovative topics in database
   */
  async storeInnovativeTopics(topics: InnovativeTopic[]): Promise<void> {
    for (const topic of topics) {
      try {
        // Store innovative topics in memory for now - TODO: Implement when innovativeTopic table is available
      console.log(`[VERTICAL_INTELLIGENCE] Storing innovative topic: ${topic.id}`);
      // TODO: Implement when innovativeTopic table is available
      } catch (error) {
        console.error(`[VERTICAL_INTELLIGENCE] Error storing innovative topic:`, error);
      }
    }
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export const verticalIntelligenceEngine = new VerticalIntelligenceEngine();
