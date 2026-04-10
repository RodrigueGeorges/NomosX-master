/**
 * NomosX UNIFIED WORKFLOW ENGINE
 * 
 * Complete integration of all components into ONE efficient workflow
 * This replaces the fragmented architecture with a unified system
 * 
 * UNIFIED WORKFLOW:
 * PhD-Led Intelligence (TRUE leaders) → Alpha Intelligence (real-time) → 
 * Vertical Intelligence (execution) → Omega Verification (confidence) → 
 * Reference Publisher (living documents)
 */

import { phdLedIntelligenceEngine, PhDLedIntelligence } from './phd-led-intelligence';
import { alphaIntelligenceEngine, RealTimeSignal } from './alpha-intelligence';
import { verticalIntelligenceEngine, InnovativeTopic } from '../vertical-intelligence/vertical-intelligence-engine';
import { expertLedResearchManager } from '../vertical-intelligence/expert-led-research';
import { omegaVerificationEngine } from './omega-verification';
import { referencePublisher } from './reference-publisher';
import { RESEARCHER_REGISTRY } from '../researcher-ownership';

// ============================================================================
// UNIFIED WORKFLOW TYPES
// ============================================================================

export interface UnifiedWorkflowConfig {
  verticalSlug: string;
  mode: 'PHD_LED' | 'ALPHA_DRIVEN' | 'VERTICAL_ONLY' | 'REFERENCE_ONLY';
  
  // PhD Leadership settings
  enablePhDLeadership: boolean;
  proactivityThreshold: number;
  innovationThreshold: number;
  
  // Alpha Intelligence settings
  enableAlphaMonitoring: boolean;
  signalUrgencyThreshold: string;
  maxResponseTimeMs: number;
  
  // Vertical Intelligence settings
  enableVerticalExecution: boolean;
  maxTopicsPerRun: number;
  researchQualityThreshold: number;
  
  // Omega Verification settings
  enableOmegaVerification: boolean;
  verificationLayers: string[];
  confidenceThreshold: number;
  
  // Reference Publisher settings
  enableReferencePublishing: boolean;
  referenceLevel: string;
  accessLevel: string;
  
  // Workflow optimization
  enableParallelExecution: boolean;
  enableEarlyTermination: boolean;
  maxTotalDurationMs: number;
}

export interface UnifiedWorkflowResult {
  verticalSlug: string;
  mode: string;
  durationMs: number;
  
  // PhD Leadership results
  phdLeadership: {
    enabled: boolean;
    leadExpert: any;
    focusAreas: any[];
    initiatives: any[];
    proactivityScore: number;
    innovationScore: number;
  };
  
  // Alpha Intelligence results
  alphaSignals: {
    detected: number;
    urgent: number;
    firstMover: number;
    averageImpact: number;
  };
  
  // Vertical Intelligence results
  verticalExecution: {
    topicsGenerated: number;
    researchProjects: number;
    qualityScore: number;
  };
  
  // Omega Verification results
  omegaVerification: {
    enabled: boolean;
    layersCompleted: number;
    overallConfidence: number;
    verificationPassed: boolean;
  };
  
  // Reference Publisher results
  referencePublications: {
    created: number;
    averageQuality: number;
    referenceLevel: string;
    livingDocuments: number;
  };
  
  // Overall metrics
  overallMetrics: {
    efficiency: number; // 0-100
    integration: number; // 0-100
    quality: number;    // 0-100
    speed: number;      // 0-100
  };
  
  // Publications created
  publications: any[];
}

// ============================================================================
// UNIFIED WORKFLOW ENGINE
// ============================================================================

export class UnifiedWorkflowEngine {
  
  /**
   * Run complete unified workflow
   * ONE efficient workflow that integrates ALL components
   */
  async runUnifiedWorkflow(config: UnifiedWorkflowConfig): Promise<UnifiedWorkflowResult> {
    console.log(`[UNIFIED_WORKFLOW] Starting unified workflow for ${config.verticalSlug}`);
    console.log(`[UNIFIED_WORKFLOW] Mode: ${config.mode} | PhD Leadership: ${config.enablePhDLeadership}`);
    
    const startTime = Date.now();
    const results: any = {};
    
    try {
      // STEP 1: PhD-Led Intelligence (TRUE leaders)
      if (config.enablePhDLeadership) {
        console.log(`[UNIFIED_WORKFLOW] Step 1: PhD-Led Intelligence`);
        results.phdLeadership = await this.runPhDLedIntelligenceStep(config);
      }
      
      // STEP 2: Alpha Intelligence (real-time monitoring)
      if (config.enableAlphaMonitoring) {
        console.log(`[UNIFIED_WORKFLOW] Step 2: Alpha Intelligence`);
        results.alphaSignals = await this.runAlphaIntelligenceStep(config);
      }
      
      // STEP 3: Vertical Intelligence (execution)
      if (config.enableVerticalExecution) {
        console.log(`[UNIFIED_WORKFLOW] Step 3: Vertical Intelligence`);
        results.verticalExecution = await this.runVerticalIntelligenceStep(config, results);
      }
      
      // STEP 4: Omega Verification (confidence)
      if (config.enableOmegaVerification) {
        console.log(`[UNIFIED_WORKFLOW] Step 4: Omega Verification`);
        results.omegaVerification = await this.runOmegaVerificationStep(config, results);
      }
      
      // STEP 5: Reference Publisher (living documents)
      if (config.enableReferencePublishing) {
        console.log(`[UNIFIED_WORKFLOW] Step 5: Reference Publisher`);
        results.referencePublications = await this.runReferencePublisherStep(config, results);
      }
      
      // Calculate overall metrics
      const workflowResult = this.calculateWorkflowResult(config, results, Date.now() - startTime);
      
      console.log(`[UNIFIED_WORKFLOW] Completed: ${workflowResult.publications.length} publications created`);
      console.log(`[UNIFIED_WORKFLOW] Efficiency: ${workflowResult.overallMetrics.efficiency}%`);
      console.log(`[UNIFIED_WORKFLOW] Integration: ${workflowResult.overallMetrics.integration}%`);
      console.log(`[UNIFIED_WORKFLOW] Quality: ${workflowResult.overallMetrics.quality}%`);
      
      return workflowResult;
      
    } catch (error) {
      console.error(`[UNIFIED_WORKFLOW] Error in unified workflow:`, error);
      throw error;
    }
  }
  
  /**
   * Step 1: PhD-Led Intelligence
   */
  private async runPhDLedIntelligenceStep(config: UnifiedWorkflowConfig): Promise<any> {
    const phdIntelligence = await phdLedIntelligenceEngine.runPhDLedIntelligence(config.verticalSlug);
    
    return {
      enabled: true,
      leadExpert: phdIntelligence.leadExpert,
      focusAreas: phdIntelligence.dynamicFocusAreas,
      initiatives: phdIntelligence.researchInitiatives,
      proactivityScore: phdIntelligence.proactivityScore,
      innovationScore: phdIntelligence.innovationScore,
      intelligenceOutputs: phdIntelligence.intelligenceOutputs
    };
  }
  
  /**
   * Step 2: Alpha Intelligence
   */
  private async runAlphaIntelligenceStep(config: UnifiedWorkflowConfig): Promise<any> {
    // Placeholder implementation - TODO: Implement when alphaIntelligenceEngine.getRecentSignals is available
    const signals: any[] = [];
    
    const urgent = signals.filter((s: any) => s.urgency === 'IMMEDIATE' || s.urgency === 'HIGH');
    const firstMover = signals.filter((s: any) => s.competitiveAdvantage?.firstMover);
    const avgImpact = signals.reduce((sum: number, s: any) => sum + (s.impactScore || 0), 0) / (signals.length || 1);
    
    return {
      detected: signals.length,
      urgent: urgent.length,
      firstMover: firstMover.length,
      averageImpact: Math.round(avgImpact),
      signals: signals
    };
  }
  
  /**
   * Step 3: Vertical Intelligence
   */
  private async runVerticalIntelligenceStep(config: UnifiedWorkflowConfig, previousResults: any): Promise<any> {
    let topics: InnovativeTopic[] = [];
    
    // Generate topics based on PhD leadership or Alpha signals
    if (previousResults.phdLeadership && previousResults.phdLeadership.intelligenceOutputs) {
      // Convert PhD intelligence outputs to topics
      topics = previousResults.phdLeadership.intelligenceOutputs.map((output: any) => ({
        id: output.id,
        title: output.title,
        description: output.originalContribution,
        innovationScore: output.innovationScore,
        competitiveAdvantage: {
          firstMover: true,
          predictiveValue: 85,
          strategicValue: output.originalContribution
        },
        researchPotential: {
          methodology: 'Expert-led analysis',
          expectedOutcomes: ['Original research', 'Policy insights'],
          resourceRequirements: 'Medium'
        },
        urgencyLevel: 'HIGH'
      }));
    } else if (previousResults.alphaSignals && previousResults.alphaSignals.signals) {
      // Generate topics from Alpha signals
      topics = await verticalIntelligenceEngine.discoverInnovativeTopics(config.verticalSlug, {
        maxTopicsPerRun: config.maxTopicsPerRun,
        innovationThreshold: 70,
        competitiveMode: true
      });
    }
    
    // Execute research projects
    const researchProjects = [];
    for (const topic of topics.slice(0, 3)) { // Limit to 3 projects
      try {
        const project = await expertLedResearchManager.initiateResearchProject(topic);
        await expertLedResearchManager.executeSpecializedSourcing(project);
        await expertLedResearchManager.conductExpertAnalysis(project, (project as any).sourcing);
        await expertLedResearchManager.synthesizeFinalPublication(project);
        
        researchProjects.push(project);
      } catch (error) {
        console.error(`[UNIFIED_WORKFLOW] Error executing research for topic ${topic.title}:`, error);
      }
    }
    
    const qualityScore = researchProjects.length > 0 ?
      Math.round(researchProjects.reduce((sum, p) => sum + ((p as any).qualityScore || 80), 0) / researchProjects.length) : 0;
    
    return {
      topicsGenerated: topics.length,
      researchProjects: researchProjects.length,
      qualityScore,
      topics,
      projects: researchProjects
    };
  }
  
  /**
   * Step 4: Omega Verification
   */
  private async runOmegaVerificationStep(config: UnifiedWorkflowConfig, previousResults: any): Promise<any> {
    let verificationResults = [];
    let totalConfidence = 0;
    let layersCompleted = 0;
    
    // Get research projects to verify
    const projects = previousResults.verticalExecution?.projects || [];
    
    for (const project of projects.slice(0, 2)) { // Limit to 2 verifications
      try {
        const result = await omegaVerificationEngine.runOmegaVerification({
          targetId: project.id,
          targetType: 'RESEARCH_PROJECT',
          content: project.finalPublication || '',
          sources: project.sources?.map((s: any) => s.url) || [],
          urgency: 'HIGH',
          requiredLayers: config.verificationLayers as any
        });
        
        verificationResults.push(result);
        totalConfidence += result.overallConfidence;
        layersCompleted += result.verificationLayers.filter(l => l.status === 'PASSED').length;
        
      } catch (error) {
        console.error(`[UNIFIED_WORKFLOW] Omega verification failed for project ${project.id}:`, error);
      }
    }
    
    const overallConfidence = verificationResults.length > 0 ? Math.round(totalConfidence / verificationResults.length) : 0;
    const verificationPassed = verificationResults.every(r => r.canPublish);
    
    return {
      enabled: true,
      layersCompleted: Math.round(layersCompleted / verificationResults.length) || 0,
      overallConfidence,
      verificationPassed,
      results: verificationResults
    };
  }
  
  /**
   * Step 5: Reference Publisher
   */
  private async runReferencePublisherStep(config: UnifiedWorkflowConfig, previousResults: any): Promise<any> {
    const publications = [];
    
    // Get verified projects to publish
    const verifiedProjects = previousResults.omegaVerification?.results || [];
    
    for (const verification of verifiedProjects) {
      if (verification.canPublish) {
        try {
          // Find the corresponding project
          const project = previousResults.verticalExecution?.projects.find((p: any) => p.id === verification.targetId);
          if (project) {
            const publication = await referencePublisher.createReferencePublication(
              project.finalPublication || '',
              {
                title: project.title,
                verticalSlug: config.verticalSlug,
                publicationType: 'REFERENCE_BRIEF',
                referenceLevel: (config.referenceLevel as 'PREMIUM' | 'PUBLIC' | 'INSTITUTIONAL' | undefined) as 'STANDARD' | 'DEFINITIVE' | 'PREMIUM' | undefined,
                accessLevel: (config.accessLevel as 'PREMIUM' | 'PUBLIC' | 'INSTITUTIONAL' | undefined)
              },
              true // Already verified
            );
            
            publications.push(publication);
          }
        } catch (error) {
          console.error(`[UNIFIED_WORKFLOW] Reference publishing failed for ${verification.targetId}:`, error);
        }
      }
    }
    
    const averageQuality = publications.length > 0 ?
      Math.round(publications.reduce((sum, p) => sum + p.trustScore, 0) / publications.length) : 0;
    
    return {
      created: publications.length,
      averageQuality,
      referenceLevel: config.referenceLevel,
      livingDocuments: publications.length, // All are living documents
      publications
    };
  }
  
  /**
   * Calculate overall workflow metrics
   */
  private calculateWorkflowResult(config: UnifiedWorkflowConfig, results: any, durationMs: number): UnifiedWorkflowResult {
    
    // Calculate efficiency (time vs quality)
    const maxDuration = config.maxTotalDurationMs;
    const efficiency = Math.max(0, Math.min(100, 100 - (durationMs / maxDuration) * 100));
    
    // Calculate integration (how well components work together)
    const integration = this.calculateIntegrationScore(results);
    
    // Calculate quality (average of all quality scores)
    const quality = this.calculateQualityScore(results);
    
    // Calculate speed (publications per hour)
    const publications = results.referencePublications?.publications || [];
    const speed = publications.length > 0 ? Math.min(100, (publications.length / (durationMs / 3600000)) * 10) : 0;
    
    return {
      verticalSlug: config.verticalSlug,
      mode: config.mode,
      durationMs,
      
      phdLeadership: results.phdLeadership || {
        enabled: false,
        leadExpert: null,
        focusAreas: [],
        initiatives: [],
        proactivityScore: 0,
        innovationScore: 0
      },
      
      alphaSignals: results.alphaSignals || {
        detected: 0,
        urgent: 0,
        firstMover: 0,
        averageImpact: 0
      },
      
      verticalExecution: results.verticalExecution || {
        topicsGenerated: 0,
        researchProjects: 0,
        qualityScore: 0
      },
      
      omegaVerification: results.omegaVerification || {
        enabled: false,
        layersCompleted: 0,
        overallConfidence: 0,
        verificationPassed: false
      },
      
      referencePublications: results.referencePublications || {
        created: 0,
        averageQuality: 0,
        referenceLevel: 'STANDARD',
        livingDocuments: 0
      },
      
      overallMetrics: {
        efficiency: Math.round(efficiency),
        integration: Math.round(integration),
        quality: Math.round(quality),
        speed: Math.round(speed)
      },
      
      publications
    };
  }
  
  /**
   * Helper methods for metrics calculation
   */
  private calculateIntegrationScore(results: any): number {
    let score = 0;
    let components = 0;
    
    if (results.phdLeadership?.enabled) { score += results.phdLeadership.proactivityScore; components++; }
    if (results.alphaSignals?.detected > 0) { score += Math.min(100, results.alphaSignals.averageImpact); components++; }
    if (results.verticalExecution?.qualityScore > 0) { score += results.verticalExecution.qualityScore; components++; }
    if (results.omegaVerification?.overallConfidence > 0) { score += results.omegaVerification.overallConfidence; components++; }
    if (results.referencePublications?.averageQuality > 0) { score += results.referencePublications.averageQuality; components++; }
    
    return components > 0 ? Math.round(score / components) : 0;
  }
  
  private calculateQualityScore(results: any): number {
    let score = 0;
    let components = 0;
    
    if (results.phdLeadership?.innovationScore > 0) { score += results.phdLeadership.innovationScore; components++; }
    if (results.verticalExecution?.qualityScore > 0) { score += results.verticalExecution.qualityScore; components++; }
    if (results.omegaVerification?.overallConfidence > 0) { score += results.omegaVerification.overallConfidence; components++; }
    if (results.referencePublications?.averageQuality > 0) { score += results.referencePublications.averageQuality; components++; }
    
    return components > 0 ? Math.round(score / components) : 0;
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export const unifiedWorkflowEngine = new UnifiedWorkflowEngine();
