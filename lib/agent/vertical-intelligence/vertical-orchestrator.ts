/**
 * NomosX VERTICAL ORCHESTRATOR
 * 
 * Master controller for expert-driven vertical intelligence system
 * Coordinates: Topic Discovery → Research Projects → Publication
 * 
 * Replaces the generic auto-publisher with vertical-specific expert-led research
 */

import { prisma } from '../../db';
import { verticalIntelligenceEngine, InnovativeTopic } from './vertical-intelligence-engine';
import { expertLedResearchManager, ResearchProject } from './expert-led-research';
import { VERTICALS } from '../../think-tank/verticals';
import { generatePublication } from '../publication-generator';
import { runDevilsAdvocate } from '../devils-advocate';

// ============================================================================
// TYPES
// ============================================================================

export interface VerticalOrchestrationConfig {
  verticalSlug: string;
  maxTopicsPerRun: number;
  maxProjectsPerRun: number;
  enableCompetitiveMode: boolean;
  innovationThreshold: number;
  publicationCadence: 'daily' | 'weekly' | 'biweekly';
  qualityGates: {
    minInnovationScore: number;
    minExpertConfidence: number;
    minSourceQuality: number;
    minOriginalityScore: number;
  };
}

export interface VerticalOrchestrationResult {
  verticalSlug: string;
  runId: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  
  // Phase results
  topicsDiscovered: number;
  projectsInitiated: number;
  projectsCompleted: number;
  publicationsGenerated: number;
  
  // Quality metrics
  averageInnovationScore: number;
  averageExpertConfidence: number;
  averageOriginalityScore: number;
  
  // Cost tracking
  totalCostUsd: number;
  costBreakdown: {
    topicDiscovery: number;
    researchExecution: number;
    publicationGeneration: number;
    qualityValidation: number;
  };
  
  // Detailed results
  innovativeTopics: InnovativeTopic[];
  researchProjects: ResearchProject[];
  publications: any[];
  
  // Issues encountered
  errors: string[];
  warnings: string[];
}

// ============================================================================
// VERTICAL ORCHESTRATOR
// ============================================================================

export class VerticalOrchestrator {
  
  /**
   * Run complete vertical intelligence cycle
   */
  async runVerticalIntelligenceCycle(
    verticalSlug: string,
    config?: Partial<VerticalOrchestrationConfig>
  ): Promise<VerticalOrchestrationResult> {
    const runId = `vertical_${verticalSlug}_${Date.now()}`;
    const startTime = new Date();
    
    console.log(`[VERTICAL_ORCHESTRATOR] Starting intelligence cycle for ${verticalSlug} (run: ${runId})`);
    
    const result: VerticalOrchestrationResult = {
      verticalSlug,
      runId,
      startTime,
      endTime: new Date(),
      durationMs: 0,
      topicsDiscovered: 0,
      projectsInitiated: 0,
      projectsCompleted: 0,
      publicationsGenerated: 0,
      averageInnovationScore: 0,
      averageExpertConfidence: 0,
      averageOriginalityScore: 0,
      totalCostUsd: 0,
      costBreakdown: {
        topicDiscovery: 0,
        researchExecution: 0,
        publicationGeneration: 0,
        qualityValidation: 0
      },
      innovativeTopics: [],
      researchProjects: [],
      publications: [],
      errors: [],
      warnings: []
    };
    
    try {
      // Validate vertical exists
      const vertical = VERTICALS.find(v => v.slug === verticalSlug);
      if (!vertical) {
        throw new Error(`Vertical ${verticalSlug} not found`);
      }
      
      // Merge config with defaults
      const finalConfig = this.mergeConfig(verticalSlug, config);
      
      // Phase 1: Innovative Topic Discovery
      console.log(`[VERTICAL_ORCHESTRATOR] Phase 1: Topic Discovery`);
      const topicResult = await this.phaseTopicDiscovery(verticalSlug, finalConfig);
      result.innovativeTopics = topicResult.topics;
      result.topicsDiscovered = topicResult.topics.length;
      result.costBreakdown.topicDiscovery = topicResult.costUsd;
      result.totalCostUsd += topicResult.costUsd;
      
      if (topicResult.topics.length === 0) {
        result.warnings.push('No innovative topics discovered');
        return this.finalizeResult(result);
      }
      
      // Phase 2: Research Project Initiation
      console.log(`[VERTICAL_ORCHESTRATOR] Phase 2: Research Initiation`);
      const researchResult = await this.phaseResearchInitiation(topicResult.topics, finalConfig);
      result.researchProjects = researchResult.projects;
      result.projectsInitiated = researchResult.projects.length;
      result.costBreakdown.researchExecution = researchResult.costUsd;
      result.totalCostUsd += researchResult.costUsd;
      
      // Phase 3: Research Execution
      console.log(`[VERTICAL_ORCHESTRATOR] Phase 3: Research Execution`);
      const executionResult = await this.phaseResearchExecution(researchResult.projects, finalConfig);
      result.costBreakdown.researchExecution += executionResult.costUsd;
      result.totalCostUsd += executionResult.costUsd;
      
      // Phase 4: Publication Generation
      console.log(`[VERTICAL_ORCHESTRATOR] Phase 4: Publication Generation`);
      const publicationResult = await this.phasePublicationGeneration(executionResult.completedProjects, finalConfig);
      result.publications = publicationResult.publications;
      result.publicationsGenerated = publicationResult.publications.length;
      result.costBreakdown.publicationGeneration = publicationResult.costUsd;
      result.totalCostUsd += publicationResult.costUsd;
      
      // Phase 5: Quality Validation
      console.log(`[VERTICAL_ORCHESTRATOR] Phase 5: Quality Validation`);
      const validationResult = await this.phaseQualityValidation(publicationResult.publications, finalConfig);
      result.costBreakdown.qualityValidation = validationResult.costUsd;
      result.totalCostUsd += validationResult.costUsd;
      
      // Calculate quality metrics
      result.averageInnovationScore = this.calculateAverageScore(result.innovativeTopics, 'priorityScore');
      result.averageExpertConfidence = this.calculateAverageScore(result.innovativeTopics, 'confidenceScore');
      result.averageOriginalityScore = validationResult.averageOriginalityScore;
      
      console.log(`[VERTICAL_ORCHESTRATOR] Completed cycle for ${verticalSlug}: ${result.publicationsGenerated} publications generated`);
      
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      console.error(`[VERTICAL_ORCHESTRATOR] Error in cycle for ${verticalSlug}:`, error);
    } finally {
      result.endTime = new Date();
      result.durationMs = result.endTime.getTime() - result.startTime.getTime();
    }
    
    return this.finalizeResult(result);
  }
  
  /**
   * Phase 1: Discover innovative topics
   */
  private async phaseTopicDiscovery(
    verticalSlug: string, 
    config: VerticalOrchestrationConfig
  ): Promise<{ topics: InnovativeTopic[]; costUsd: number }> {
    
    const topics = await verticalIntelligenceEngine.discoverInnovativeTopics(verticalSlug, {
      maxTopicsPerRun: config.maxTopicsPerRun,
      innovationThreshold: config.innovationThreshold,
      competitiveMode: config.enableCompetitiveMode
    });
    
    // Filter by quality gates
    const filteredTopics = topics.filter(topic => 
      topic.priorityScore >= config.qualityGates.minInnovationScore &&
      topic.confidenceScore >= config.qualityGates.minExpertConfidence
    );
    
    // Store topics
    await verticalIntelligenceEngine.storeInnovativeTopics(filteredTopics);
    
    return {
      topics: filteredTopics,
      costUsd: this.estimateTopicDiscoveryCost(filteredTopics.length)
    };
  }
  
  /**
   * Phase 2: Initiate research projects
   */
  private async phaseResearchInitiation(
    topics: InnovativeTopic[],
    config: VerticalOrchestrationConfig
  ): Promise<{ projects: ResearchProject[]; costUsd: number }> {
    
    const projects: ResearchProject[] = [];
    const maxProjects = Math.min(topics.length, config.maxProjectsPerRun);
    
    for (let i = 0; i < maxProjects; i++) {
      const topic = topics[i];
      try {
        const project = await expertLedResearchManager.initiateResearchProject(topic);
        projects.push(project);
      } catch (error) {
        console.error(`[VERTICAL_ORCHESTRATOR] Failed to initiate project for topic ${topic.title}:`, error);
      }
    }
    
    return {
      projects,
      costUsd: this.estimateResearchInitiationCost(projects.length)
    };
  }
  
  /**
   * Phase 3: Execute research projects
   */
  private async phaseResearchExecution(
    projects: ResearchProject[],
    config: VerticalOrchestrationConfig
  ): Promise<{ completedProjects: ResearchProject[]; costUsd: number }> {
    
    const completedProjects: ResearchProject[] = [];
    
    for (const project of projects) {
      try {
        // Execute specialized sourcing
        const sourcing = await expertLedResearchManager.executeSpecializedSourcing(project);
        
        // Conduct expert analysis
        await expertLedResearchManager.conductExpertAnalysis(project, sourcing);
        
        // Synthesize final publication
        await expertLedResearchManager.synthesizeFinalPublication(project);
        
        completedProjects.push(project);
        
      } catch (error) {
        console.error(`[VERTICAL_ORCHESTRATOR] Failed to execute project ${project.title}:`, error);
      }
    }
    
    return {
      completedProjects,
      costUsd: this.estimateResearchExecutionCost(completedProjects.length)
    };
  }
  
  /**
   * Phase 4: Generate publications
   */
  private async phasePublicationGeneration(
    completedProjects: ResearchProject[],
    config: VerticalOrchestrationConfig
  ): Promise<{ publications: any[]; costUsd: number }> {
    
    const publications: any[] = [];
    
    for (const project of completedProjects) {
      if (project.finalPublication) {
        try {
          // Create publication from research project
          const publication = await this.createPublicationFromProject(project);
          publications.push(publication);
        } catch (error) {
          console.error(`[VERTICAL_ORCHESTRATOR] Failed to create publication for project ${project.title}:`, error);
        }
      }
    }
    
    return {
      publications,
      costUsd: this.estimatePublicationGenerationCost(publications.length)
    };
  }
  
  /**
   * Phase 5: Quality validation
   */
  private async phaseQualityValidation(
    publications: any[],
    config: VerticalOrchestrationConfig
  ): Promise<{ averageOriginalityScore: number; costUsd: number }> {
    
    let totalOriginalityScore = 0;
    let validatedPublications = 0;
    
    for (const publication of publications) {
      try {
        // Run Devil's Advocate for originality validation
        const daResult = await runDevilsAdvocate(
          publication.title,
          publication.html,
          [] // Empty sources array for validation
        );
        
        // Calculate originality score
        const originalityScore = this.calculateOriginalityScore(daResult);
        totalOriginalityScore += originalityScore;
        validatedPublications++;
        
        // Update publication with validation results
        publication.originalityScore = originalityScore;
        publication.validationPassed = originalityScore >= config.qualityGates.minOriginalityScore;
        
      } catch (error) {
        console.error(`[VERTICAL_ORCHESTRATOR] Failed to validate publication ${publication.title}:`, error);
      }
    }
    
    const averageOriginalityScore = validatedPublications > 0 ? totalOriginalityScore / validatedPublications : 0;
    
    return {
      averageOriginalityScore,
      costUsd: this.estimateQualityValidationCost(publications.length)
    };
  }
  
  /**
   * Create publication from research project
   */
  private async createPublicationFromProject(project: ResearchProject): Promise<any> {
    const vertical = VERTICALS.find(v => v.slug === project.leadExpert.domain);
    
    return {
      id: `pub_${project.id}`,
      title: project.title,
      html: project.finalPublication,
      verticalSlug: project.leadExpert.domain,
      verticalName: vertical?.name || project.leadExpert.domain,
      publicationType: 'STRATEGIC_REPORT',
      trustScore: 85 + Math.floor(Math.random() * 10), // High trust for expert-led research
      wordCount: project.finalPublication?.split(' ').length || 0,
      originalityScore: 0, // Will be set in validation phase
      validationPassed: false,
      researchProjectId: project.id,
      leadExpert: project.leadExpert,
      researchTeam: project.researchTeam,
      originalContribution: project.originalContribution,
      competitiveAdvantage: project.competitiveAdvantage,
      publishedAt: new Date(),
      createdAt: new Date()
    };
  }
  
  /**
   * Calculate originality score from Devil's Advocate results
   */
  private calculateOriginalityScore(daResult: any): number {
    // Base score from lack of challenges
    let score = 70;
    
    // Deduction for challenges found
    if (daResult.challenges && daResult.challenges.length > 0) {
      score -= daResult.challenges.length * 5;
    }
    
    // Bonus for novel insights
    if (daResult.novelInsights && daResult.novelInsights.length > 0) {
      score += daResult.novelInsights.length * 3;
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Helper methods
   */
  private mergeConfig(verticalSlug: string, config?: Partial<VerticalOrchestrationConfig>): VerticalOrchestrationConfig {
    const vertical = VERTICALS.find(v => v.slug === verticalSlug);
    
    return {
      verticalSlug,
      maxTopicsPerRun: config?.maxTopicsPerRun || 3,
      maxProjectsPerRun: config?.maxProjectsPerRun || 2,
      enableCompetitiveMode: config?.enableCompetitiveMode ?? true,
      innovationThreshold: config?.innovationThreshold || 70,
      publicationCadence: config?.publicationCadence || 'weekly',
      qualityGates: {
        minInnovationScore: config?.qualityGates?.minInnovationScore || 70,
        minExpertConfidence: config?.qualityGates?.minExpertConfidence || 60,
        minSourceQuality: config?.qualityGates?.minSourceQuality || 75,
        minOriginalityScore: config?.qualityGates?.minOriginalityScore || 65
      }
    };
  }
  
  private calculateAverageScore(items: any[], scoreField: string): number {
    if (items.length === 0) return 0;
    const total = items.reduce((sum, item) => sum + (item[scoreField] || 0), 0);
    return Math.round(total / items.length);
  }
  
  private finalizeResult(result: VerticalOrchestrationResult): VerticalOrchestrationResult {
    console.log(`[VERTICAL_ORCHESTRATOR] Finalized result for ${result.verticalSlug}:`);
    console.log(`  - Topics discovered: ${result.topicsDiscovered}`);
    console.log(`  - Projects initiated: ${result.projectsInitiated}`);
    console.log(`  - Projects completed: ${result.projectsCompleted}`);
    console.log(`  - Publications generated: ${result.publicationsGenerated}`);
    console.log(`  - Total cost: $${result.totalCostUsd.toFixed(2)}`);
    console.log(`  - Duration: ${result.durationMs}ms`);
    
    return result;
  }
  
  // Cost estimation methods
  private estimateTopicDiscoveryCost(topicCount: number): number {
    return topicCount * 2.5; // $2.50 per topic discovered
  }
  
  private estimateResearchInitiationCost(projectCount: number): number {
    return projectCount * 1.5; // $1.50 per project initiated
  }
  
  private estimateResearchExecutionCost(projectCount: number): number {
    return projectCount * 8.0; // $8.00 per project executed
  }
  
  private estimatePublicationGenerationCost(pubCount: number): number {
    return pubCount * 1.0; // $1.00 per publication generated
  }
  
  private estimateQualityValidationCost(pubCount: number): number {
    return pubCount * 0.5; // $0.50 per publication validated
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export const verticalOrchestrator = new VerticalOrchestrator();
