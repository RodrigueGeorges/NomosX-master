/**
 * NomosX ALPHA-VERTICAL INTEGRATION
 * 
 * Integration of Alpha Intelligence (real-time monitoring) with Vertical Intelligence (PhD experts)
 * 
 * This bridges the gap:
 * - Alpha detects critical signals in real-time
 * - Vertical Intelligence (PhDs) respond proactively
 * - Creates original research instead of reactive summaries
 */

import { alphaIntelligenceEngine, RealTimeSignal } from './alpha-intelligence';
import { verticalIntelligenceEngine, InnovativeTopic } from '../vertical-intelligence/vertical-intelligence-engine';
import { expertLedResearchManager } from '../vertical-intelligence/expert-led-research';
import { omegaVerificationEngine } from './omega-verification';
import { referencePublisher } from './reference-publisher';
import { RESEARCHER_REGISTRY } from '../researcher-ownership';

// ============================================================================
// ALPHA-VERTICAL INTEGRATION TYPES
// ============================================================================

export interface AlphaVerticalIntegration {
  verticalSlug: string;
  leadExpert: {
    name: string;
    domain: string;
    institution: string;
  };
  alphaSignals: RealTimeSignal[];
  innovativeTopics: InnovativeTopic[];
  researchProjects: any[];
  referencePublications: any[];
  
  // Integration metrics
  responseTime: number; // Time from signal to research initiation
  researchTime: number; // Time from initiation to publication
  qualityScore: number; // Overall quality of integrated output
  
  // Competitive advantage
  firstMoverAdvantage: boolean;
  originalityScore: number;
  verificationScore: number;
}

export interface IntegrationConfig {
  verticalSlug: string;
  enableAlphaMonitoring: boolean;
  enableVerticalResponse: boolean;
  enableOmegaVerification: boolean;
  enableReferencePublishing: boolean;
  
  // Thresholds
  signalUrgencyThreshold: string;
  topicInnovationThreshold: number;
  researchQualityThreshold: number;
  publicationTrustThreshold: number;
  
  // Timing
  maxResponseTimeMs: number; // Max time to respond to signal
  maxResearchTimeMs: number; // Max time for research
  alertFrequency: 'immediate' | 'hourly' | 'daily';
}

// ============================================================================
// ALPHA-VERTICAL INTEGRATION ENGINE
// ============================================================================

export class AlphaVerticalIntegrationEngine {
  
  /**
   * Run complete Alpha-Vertical integration cycle
   */
  async runIntegrationCycle(config: IntegrationConfig): Promise<AlphaVerticalIntegration> {
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Starting integration for ${config.verticalSlug}`);
    
    const startTime = Date.now();
    
    // Step 1: Get lead expert for vertical
    const leadExpert = this.getLeadExpert(config.verticalSlug);
    
    // Step 2: Monitor Alpha signals
    const alphaSignals = await this.monitorAlphaSignals(config);
    
    // Step 3: Filter signals by urgency and relevance
    const relevantSignals = await this.filterRelevantSignals(alphaSignals, config, leadExpert);
    
    // Step 4: Generate innovative topics from signals
    const innovativeTopics = await this.generateInnovativeTopics(relevantSignals, config, leadExpert);
    
    // Step 5: Initiate expert-led research
    const researchProjects = await this.initiateResearchProjects(innovativeTopics, config);
    
    // Step 6: Verify with Omega
    const verifiedProjects = await this.verifyWithOmega(researchProjects, config);
    
    // Step 7: Create reference publications
    const referencePublications = await this.createReferencePublications(verifiedProjects, config);
    
    // Step 8: Calculate integration metrics
    const integration = this.calculateIntegrationMetrics(
      config.verticalSlug,
      leadExpert,
      alphaSignals,
      innovativeTopics,
      verifiedProjects,
      referencePublications,
      Date.now() - startTime
    );
    
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Completed: ${referencePublications.length} reference publications created`);
    
    return integration;
  }
  
  /**
   * Monitor Alpha signals for vertical
   */
  private async monitorAlphaSignals(config: IntegrationConfig): Promise<RealTimeSignal[]> {
    if (!config.enableAlphaMonitoring) {
      return [];
    }
    
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Monitoring Alpha signals for ${config.verticalSlug}`);
    
    // Get recent Alpha signals - placeholder implementation
    const signals: any[] = []; // TODO: Implement when alphaIntelligenceEngine.getRecentSignals is available
    
    return signals.filter((signal: any) => 
      signal.impact?.verticals?.includes(config.verticalSlug) &&
      this.meetsUrgencyThreshold(signal.urgency, config.signalUrgencyThreshold)
    );
  }
  
  /**
   * Filter signals by relevance to vertical
   */
  private async filterRelevantSignals(
    signals: RealTimeSignal[], 
    config: IntegrationConfig, 
    leadExpert: any
  ): Promise<RealTimeSignal[]> {
    
    const relevantSignals: RealTimeSignal[] = [];
    
    for (const signal of signals) {
      // Check if signal aligns with expert focus areas
      const relevanceScore = await this.calculateSignalRelevance(signal, leadExpert);
      
      if (relevanceScore >= 70) { // High relevance threshold
        relevantSignals.push({
          ...signal,
          competitiveAdvantage: {
            ...signal.competitiveAdvantage,
            relevanceScore
          }
        } as any);
      }
    }
    
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Filtered ${relevantSignals.length}/${signals.length} relevant signals`);
    
    return relevantSignals;
  }
  
  /**
   * Generate innovative topics from Alpha signals
   */
  private async generateInnovativeTopics(
    signals: RealTimeSignal[], 
    config: IntegrationConfig, 
    leadExpert: any
  ): Promise<InnovativeTopic[]> {
    
    if (!config.enableVerticalResponse || signals.length === 0) {
      return [];
    }
    
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Generating innovative topics from ${signals.length} signals`);
    
    // Use Vertical Intelligence Engine with Alpha signals as input
    const topics = await verticalIntelligenceEngine.discoverInnovativeTopics(config.verticalSlug, {
      maxTopicsPerRun: Math.min(signals.length, 3),
      innovationThreshold: config.topicInnovationThreshold,
      competitiveMode: true
    });
    
    // Enhance topics with Alpha signal context
    const enhancedTopics = topics.map(topic => ({
      ...topic,
      alphaSignalOrigin: signals.find(s => s.title.includes(topic.title.substring(0, 20))),
      firstMoverAdvantage: true, // Alpha signals give first-mover advantage
      urgencyLevel: signals[0]?.urgency || 'MEDIUM'
    }));
    
    return enhancedTopics;
  }
  
  /**
   * Initiate expert-led research projects
   */
  private async initiateResearchProjects(topics: InnovativeTopic[], config: IntegrationConfig): Promise<any[]> {
    if (!config.enableVerticalResponse || topics.length === 0) {
      return [];
    }
    
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Initiating research for ${topics.length} topics`);
    
    const projects: any[] = [];
    
    for (const topic of topics) {
      try {
        const project = await expertLedResearchManager.initiateResearchProject(topic);
        
        // Execute research with accelerated timeline for Alpha signals
        if ((topic as any).urgencyLevel === 'IMMEDIATE') {
          await this.executeAcceleratedResearch(project, config);
        } else {
          await this.executeStandardResearch(project, config);
        }
        
        projects.push(project);
        
      } catch (error) {
        console.error(`[ALPHA_VERTICAL_INTEGRATION] Failed to initiate research for topic ${topic.title}:`, error);
      }
    }
    
    return projects;
  }
  
  /**
   * Execute accelerated research for urgent signals
   */
  private async executeAcceleratedResearch(project: any, config: IntegrationConfig): Promise<void> {
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Executing accelerated research for ${project.title}`);
    
    const startTime = Date.now();
    
    // Compressed research timeline (2 hours instead of 24)
    const phases = [
      { name: 'specialized-sourcing', duration: 30 * 60 * 1000 }, // 30 minutes
      { name: 'expert-analysis', duration: 60 * 60 * 1000 }, // 60 minutes
      { name: 'synthesis', duration: 30 * 60 * 1000 } // 30 minutes
    ];
    
    for (const phase of phases) {
      const phaseStart = Date.now();
      
      switch (phase.name) {
        case 'specialized-sourcing':
          await expertLedResearchManager.executeSpecializedSourcing(project);
          break;
        case 'expert-analysis':
          await expertLedResearchManager.conductExpertAnalysis(project, project.sourcing);
          break;
        case 'synthesis':
          await expertLedResearchManager.synthesizeFinalPublication(project);
          break;
      }
      
      const phaseDuration = Date.now() - phaseStart;
      console.log(`[ALPHA_VERTICAL_INTEGRATION] Completed ${phase.name} in ${phaseDuration}ms`);
      
      // Check if we're exceeding time limit
      if (Date.now() - startTime > config.maxResearchTimeMs) {
        console.warn(`[ALPHA_VERTICAL_INTEGRATION] Research time limit exceeded for ${project.title}`);
        break;
      }
    }
  }
  
  /**
   * Execute standard research timeline
   */
  private async executeStandardResearch(project: any, config: IntegrationConfig): Promise<void> {
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Executing standard research for ${project.title}`);
    
    await expertLedResearchManager.executeSpecializedSourcing(project);
    await expertLedResearchManager.conductExpertAnalysis(project, project.sourcing);
    await expertLedResearchManager.synthesizeFinalPublication(project);
  }
  
  /**
   * Verify with Omega system
   */
  private async verifyWithOmega(projects: any[], config: IntegrationConfig): Promise<any[]> {
    if (!config.enableOmegaVerification) {
      return projects;
    }
    
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Verifying ${projects.length} projects with Omega`);
    
    const verifiedProjects: any[] = [];
    
    for (const project of projects) {
      try {
        const verificationResult = await omegaVerificationEngine.runOmegaVerification({
          targetId: project.id,
          targetType: 'RESEARCH_PROJECT',
          content: project.finalPublication || '',
          sources: project.sources?.map((s: any) => s.url) || [],
          urgency: project.urgencyLevel === 'IMMEDIATE' ? 'IMMEDIATE' : 'HIGH',
          requiredLayers: [
            { type: 'SOURCE_CHECK' as const, status: 'PENDING' as const, confidence: 0, findings: '', evidence: [], recommendations: [], verifier: 'system', duration: 0 },
            { type: 'FACT_CHECK' as const, status: 'PENDING' as const, confidence: 0, findings: '', evidence: [], recommendations: [], verifier: 'system', duration: 0 },
            { type: 'DATA_VERIFICATION' as const, status: 'PENDING' as const, confidence: 0, findings: '', evidence: [], recommendations: [], verifier: 'system', duration: 0 },
            { type: 'CONTEXT_ANALYSIS' as const, status: 'PENDING' as const, confidence: 0, findings: '', evidence: [], recommendations: [], verifier: 'system', duration: 0 }
          ]
        });
        
        if (verificationResult.canPublish) {
          verifiedProjects.push({
            ...project,
            omegaVerification: verificationResult,
            verificationScore: verificationResult.overallConfidence
          });
        } else {
          console.warn(`[ALPHA_VERTICAL_INTEGRATION] Project ${project.title} failed Omega verification`);
        }
        
      } catch (error) {
        console.error(`[ALPHA_VERTICAL_INTEGRATION] Omega verification failed for ${project.title}:`, error);
      }
    }
    
    return verifiedProjects;
  }
  
  /**
   * Create reference publications
   */
  private async createReferencePublications(projects: any[], config: IntegrationConfig): Promise<any[]> {
    if (!config.enableReferencePublishing) {
      return [];
    }
    
    console.log(`[ALPHA_VERTICAL_INTEGRATION] Creating reference publications from ${projects.length} projects`);
    
    const publications: any[] = [];
    
    for (const project of projects) {
      try {
        const publication = await referencePublisher.createReferencePublication(
          project.finalPublication || '',
          {
            title: project.title,
            verticalSlug: project.verticalSlug,
            publicationType: 'REFERENCE_BRIEF',
            referenceLevel: project.verificationScore >= 90 ? 'DEFINITIVE' : 
                           project.verificationScore >= 80 ? 'PREMIUM' : 'STANDARD',
            accessLevel: 'PUBLIC'
          },
          false // Already verified by Omega
        );
        
        publications.push({
          ...publication,
          researchProjectId: project.id,
          omegaVerification: project.omegaVerification
        });
        
      } catch (error) {
        console.error(`[ALPHA_VERTICAL_INTEGRATION] Failed to create reference publication for ${project.title}:`, error);
      }
    }
    
    return publications;
  }
  
  /**
   * Calculate integration metrics
   */
  private calculateIntegrationMetrics(
    verticalSlug: string,
    leadExpert: any,
    alphaSignals: RealTimeSignal[],
    innovativeTopics: InnovativeTopic[],
    researchProjects: any[],
    referencePublications: any[],
    totalDuration: number
  ): AlphaVerticalIntegration {
    
    // Calculate average response time (signal to research initiation)
    const responseTime = alphaSignals.length > 0 ? 
      Math.round(totalDuration / alphaSignals.length) : 0;
    
    // Calculate average research time
    const researchTime = researchProjects.length > 0 ?
      Math.round(totalDuration / researchProjects.length) : 0;
    
    // Calculate quality scores
    const qualityScore = referencePublications.length > 0 ?
      Math.round(referencePublications.reduce((sum, pub) => sum + pub.trustScore, 0) / referencePublications.length) : 0;
    
    const originalityScore = referencePublications.length > 0 ?
      Math.round(referencePublications.reduce((sum, pub) => sum + (pub.accuracyScore || 0), 0) / referencePublications.length) : 0;
    
    const verificationScore = researchProjects.length > 0 ?
      Math.round(researchProjects.reduce((sum, proj) => sum + (proj.verificationScore || 0), 0) / researchProjects.length) : 0;
    
    return {
      verticalSlug,
      leadExpert: {
        name: leadExpert.name,
        domain: leadExpert.id,
        institution: leadExpert.institution
      },
      alphaSignals,
      innovativeTopics,
      researchProjects,
      referencePublications,
      responseTime,
      researchTime,
      qualityScore,
      firstMoverAdvantage: alphaSignals.length > 0,
      originalityScore,
      verificationScore
    };
  }
  
  /**
   * Helper methods
   */
  private getLeadExpert(verticalSlug: string): any {
    const researcher = RESEARCHER_REGISTRY[verticalSlug as keyof typeof RESEARCHER_REGISTRY];
    if (!researcher) {
      throw new Error(`No lead expert found for vertical ${verticalSlug}`);
    }
    return researcher;
  }
  
  private meetsUrgencyThreshold(signalUrgency: string, threshold: string): boolean {
    const urgencyLevels = { 'IMMEDIATE': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    const signalLevel = urgencyLevels[signalUrgency as keyof typeof urgencyLevels] || 0;
    const thresholdLevel = urgencyLevels[threshold as keyof typeof urgencyLevels] || 0;
    
    return signalLevel >= thresholdLevel;
  }
  
  private async calculateSignalRelevance(signal: RealTimeSignal, leadExpert: any): Promise<number> {
    // Simple relevance calculation based on expert domains and signal entities
    let relevanceScore = 50; // Base score
    
    // Check domain overlap
    if (leadExpert.domains) {
      for (const domain of leadExpert.domains) {
        if (signal.entities.some(entity => entity.toLowerCase().includes(domain.toLowerCase()))) {
          relevanceScore += 20;
        }
      }
    }
    
    // Check focus areas
    if (leadExpert.focusAreas) {
      for (const focusArea of leadExpert.focusAreas) {
        if (signal.title.toLowerCase().includes(focusArea.toLowerCase()) ||
            signal.content.toLowerCase().includes(focusArea.toLowerCase())) {
          relevanceScore += 15;
        }
      }
    }
    
    // Boost for high predictive value
    if (signal.competitiveAdvantage.predictiveValue >= 80) {
      relevanceScore += 10;
    }
    
    return Math.min(100, relevanceScore);
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export const alphaVerticalIntegrationEngine = new AlphaVerticalIntegrationEngine();
