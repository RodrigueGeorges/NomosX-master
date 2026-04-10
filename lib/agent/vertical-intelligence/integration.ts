// @ts-nocheck
/**
 * NomosX VERTICAL INTELLIGENCE INTEGRATION
 * 
 * Integration layer to connect vertical intelligence with existing systems
 * Provides backward compatibility and migration path
 */

import { VerticalPublisher, VerticalPublisherConfig, VerticalPublisherOutput } from './vertical-publisher';
import { autoPublisher, AutoPublisherConfig, AutoPublisherOutput } from '../auto-publisher';
import type { PublicationResult, AutoPublisherLineage } from '../types';

// ============================================================================
// INTEGRATION CONFIGURATION
// ============================================================================

export interface HybridPublisherConfig extends AutoPublisherConfig {
  /** Enable vertical intelligence for specific verticals */
  enableVerticalIntelligence?: boolean;
  /** Verticals to use vertical intelligence (empty = all) */
  verticalIntelligenceVerticals?: string[];
  /** Fallback to auto-publisher if vertical intelligence fails */
  enableFallback?: boolean;
  /** Priority mode: vertical-first or auto-first */
  priorityMode?: 'vertical-first' | 'auto-first' | 'vertical-only';
}

export interface HybridPublisherOutput {
  /** Results from both systems */
  results: PublicationResult[];
  /** Auto-publisher lineage */
  lineage: AutoPublisherLineage;
  /** Total publications count */
  totalPublications: number;
  /** Total cost */
  totalCostUsd: number;
  /** Total duration */
  totalDurationMs: number;
  /** Summary text */
  summary: string;
  /** Vertical intelligence results */
  verticalResults?: VerticalPublisherOutput;
  /** Which system was used for each publication */
  publicationSources: Array<{
    publicationIndex: number;
    source: 'auto-publisher' | 'vertical-intelligence';
    metadata?: any;
  }>;
  /** Performance comparison */
  performanceComparison: {
    autoPublisher: {
      publications: number;
      averageInnovationScore: number;
      averageOriginalityScore: number;
      costPerPublication: number;
    };
    verticalIntelligence?: {
      publications: number;
      averageInnovationScore: number;
      averageOriginalityScore: number;
      costPerPublication: number;
    };
  };
}

// ============================================================================
// HYBRID PUBLISHER
// ============================================================================

export class HybridPublisher {
  
  /**
   * Run hybrid publisher with vertical intelligence and auto-publisher
   */
  async runHybridPublisher(config: HybridPublisherConfig = {}): Promise<HybridPublisherOutput> {
    console.log('[HYBRID_PUBLISHER] Starting hybrid publication cycle');
    
    const startTime = Date.now();
    const output: HybridPublisherOutput = {
      published: 0,
      pendingReview: 0,
      failed: 0,
      results: [],
      publicationSources: [],
      totalCostUsd: 0,
      totalDurationMs: 0,
      summary: '',
      lineage: {
        runId: `vertical-intelligence-${Date.now()}`,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      performanceComparison: {
        verticalIntelligence: {
          publications: 0,
          averageInnovationScore: 0,
          averageOriginalityScore: 0,
          costPerPublication: 0
        },
        autoPublisher: {
          publications: 0,
          averageInnovationScore: 0,
          averageOriginalityScore: 0,
          costPerPublication: 0
        }
      }
    };
    
    try {
      // Determine which system to use based on priority mode
      const priorityMode = config.priorityMode || 'vertical-first';
      
      if (priorityMode === 'vertical-only') {
        // Use only vertical intelligence
        const verticalOutput = await this.runVerticalOnly(config);
        return this.mergeOutputs(output, verticalOutput, startTime);
      }
      
      if (priorityMode === 'vertical-first') {
        // Try vertical intelligence first, fallback to auto-publisher
        const verticalOutput = await this.runVerticalWithFallback(config);
        return this.mergeOutputs(output, verticalOutput, startTime);
      }
      
      if (priorityMode === 'auto-first') {
        // Run auto-publisher, supplement with vertical intelligence
        const autoOutput = await this.runAutoWithSupplement(config);
        return this.mergeOutputs(output, autoOutput, startTime);
      }
      
      // Default: run both and compare
      const [verticalOutput, autoOutput] = await Promise.allSettled([
        this.runVerticalOnly(config),
        this.runAutoOnly(config)
      ]);
      
      return this.mergeComparisonResults(output, verticalOutput, autoOutput, startTime);
      
    } catch (error) {
      console.error('[HYBRID_PUBLISHER] Error in hybrid cycle:', error);
      return output;
    }
  }
  
  /**
   * Run vertical intelligence only
   */
  private async runVerticalOnly(config: HybridPublisherConfig): Promise<VerticalPublisherOutput> {
    const publisher = new VerticalPublisher({
      enableValidation: true,
      qualityGates: {
        minTrustScore: 70,
        minOriginalityScore: 60,
        minWordCount: 500
      }
    });
    
    // Mock publications for now
    const mockPublications: any[] = [];
    return publisher.run(mockPublications);
  }
  
  /**
   * Run auto-publisher only
   */
  private async runAutoOnly(config: HybridPublisherConfig): Promise<AutoPublisherOutput> {
    const autoConfig: AutoPublisherConfig = {
      maxPublications: config.maxPublications,
      minTrustScore: config.minTrustScore,
      minEditorialConfidence: config.minEditorialConfidence,
      enableProactiveScan: config.enableProactiveScan,
      enableContradictionDetection: config.enableContradictionDetection,
      enableTrendAnalysis: config.enableTrendAnalysis,
      enableKnowledgeGraph: config.enableKnowledgeGraph,
      verticalSlugs: config.verticalSlugs,
      dryRun: config.dryRun,
      maxCostUsd: config.maxCostUsd,
      forceTier: config.forceTier
    };
    
    return autoPublisher(autoConfig);
  }
  
  /**
   * Run vertical intelligence with fallback to auto-publisher
   */
  private async runVerticalWithFallback(config: HybridPublisherConfig): Promise<VerticalPublisherOutput> {
    try {
      const verticalOutput = await this.runVerticalOnly(config);
      
      // If vertical intelligence produced no publications, fallback
      if (verticalOutput.totalPublications === 0 && config.enableFallback !== false) {
        console.log('[HYBRID_PUBLISHER] Vertical intelligence produced no results, falling back to auto-publisher');
        const autoOutput = await this.runAutoOnly(config);
        return this.convertAutoToVerticalOutput(autoOutput);
      }
      
      return verticalOutput;
    } catch (error) {
      console.error('[HYBRID_PUBLISHER] Vertical intelligence failed, falling back to auto-publisher:', error);
      if (config.enableFallback !== false) {
        const autoOutput = await this.runAutoOnly(config);
        return this.convertAutoToVerticalOutput(autoOutput);
      }
      throw error;
    }
  }
  
  /**
   * Run auto-publisher with vertical intelligence supplement
   */
  private async runAutoWithSupplement(config: HybridPublisherConfig): Promise<AutoPublisherOutput> {
    // Run auto-publisher first
    const autoOutput = await this.runAutoOnly(config);
    
    // If there's room for more publications, run vertical intelligence
    const maxPublications = config.maxPublications || 3;
    if (autoOutput.results.length < maxPublications && config.enableVerticalIntelligence !== false) {
      console.log('[HYBRID_PUBLISHER] Auto-publisher incomplete, supplementing with vertical intelligence');
      
      const remainingSlots = maxPublications - autoOutput.results.length;
      const verticalConfig: VerticalPublisherConfig = {
        verticalSlugs: config.verticalIntelligenceVerticals,
        maxCostPerRun: (config.maxCostUsd || 50) - autoOutput.totalCostUsd,
        dryRun: config.dryRun
      };
      
      const verticalOutput = await new VerticalPublisher().run(verticalConfig);
      
      return this.mergeAutoAndVerticalOutputs(autoOutput, verticalOutput);
    }
    
    return autoOutput;
  }
  
  /**
   * Convert auto-publisher output to vertical output format
   */
  private convertAutoToVerticalOutput(autoOutput: AutoPublisherOutput): VerticalPublisherOutput {
    return {
      totalPublications: autoOutput.results.length,
      totalCostUsd: autoOutput.totalCostUsd,
      totalDurationMs: autoOutput.totalDurationMs,
      verticalResults: [],
      summary: {
        bestPerformingVertical: 'auto-publisher',
        averageInnovationScore: 0,
        averageOriginalityScore: 0,
        totalErrors: autoOutput.results.filter(r => r.status === 'failed').length,
        totalWarnings: 0
      }
    };
  }
  
  /**
   * Merge auto-publisher and vertical intelligence outputs
   */
  private mergeAutoAndVerticalOutputs(autoOutput: AutoPublisherOutput, verticalOutput: VerticalPublisherOutput): AutoPublisherOutput {
    // Convert vertical results to auto-publisher format
    const convertedResults = verticalOutput.verticalResults.map((result: any) => ({
      topic: result.title || 'Unknown',
      strategy: 'vertical-intelligence' as const,
      publicationId: result.id,
      briefId: result.id,
      trustScore: result.averageInnovationScore || 85,
      wordCount: 1000, // placeholder
      costUsd: result.costUsd || 1.0,
      durationMs: result.durationMs || 60000,
      providers: [],
      status: 'published' as const
    }));
    
    const mergedOutput: AutoPublisherOutput = {
      results: [
        ...autoOutput.results,
        ...convertedResults
      ],
      lineage: autoOutput.lineage,
      totalPublications: autoOutput.results.length + verticalOutput.totalPublications,
      totalCostUsd: autoOutput.totalCostUsd + verticalOutput.totalCostUsd,
      totalDurationMs: autoOutput.totalDurationMs + verticalOutput.totalDurationMs,
      summary: autoOutput.summary
    };
    
    return mergedOutput;
  }
  
  /**
   * Merge outputs for final result
   */
  private mergeOutputs(
    output: HybridPublisherOutput,
    result: VerticalPublisherOutput | AutoPublisherOutput,
    startTime: number
  ): HybridPublisherOutput {
    const duration = Date.now() - startTime;
    
    if ('totalPublications' in result) {
      // Vertical intelligence result
      output.published = result.totalPublications;
      output.totalCostUsd = result.totalCostUsd;
      output.totalDurationMs = result.totalDurationMs;
      output.verticalResults = result.verticalResults;
      
      output.performanceComparison.verticalIntelligence = {
        publications: result.totalPublications,
        averageInnovationScore: result.summary.averageInnovationScore,
        averageOriginalityScore: result.summary.averageOriginalityScore,
        costPerPublication: result.totalPublications > 0 ? result.totalCostUsd / result.totalPublications : 0
      };
    } else {
      // Auto-publisher result
      output.published = result.published;
      output.totalCostUsd = result.totalCostUsd;
      output.totalDurationMs = result.totalDurationMs;
      output.results = result.results;
      
      output.performanceComparison.autoPublisher = {
        publications: result.published,
        averageTrustScore: result.results.reduce((sum, r) => sum + (r.trustScore || 0), 0) / result.results.length,
        costPerPublication: result.published > 0 ? result.totalCostUsd / result.published : 0
      };
    }
    
    return output;
  }
  
  /**
   * Merge comparison results
   */
  private mergeComparisonResults(
    output: HybridPublisherOutput,
    verticalResult: PromiseSettledResult<VerticalPublisherOutput>,
    autoResult: PromiseSettledResult<AutoPublisherOutput>,
    startTime: number
  ): HybridPublisherOutput {
    const duration = Date.now() - startTime;
    
    // Process vertical intelligence result
    if (verticalResult.status === 'fulfilled') {
      output.verticalResults = verticalResult.value;
      output.totalPublications += verticalResult.value.totalPublications;
      output.totalCostUsd += verticalResult.value.totalCostUsd;
      output.totalDurationMs += verticalResult.value.totalDurationMs;
      output.performanceComparison.verticalIntelligence = {
        publications: verticalResult.value.totalPublications,
        averageInnovationScore: verticalResult.value.summary.averageInnovationScore || 0,
        averageOriginalityScore: verticalResult.value.summary.averageOriginalityScore || 0,
        costPerPublication: verticalResult.value.totalPublications > 0 ? verticalResult.value.totalCostUsd / verticalResult.value.totalPublications : 0
      };
    }
    
    // Process auto-publisher result
    if (autoResult.status === 'fulfilled') {
      output.results = autoResult.value.results;
      output.totalPublications += autoResult.value.results.length;
      output.totalCostUsd += autoResult.value.totalCostUsd;
      output.totalDurationMs += autoResult.value.totalDurationMs;
      output.performanceComparison.autoPublisher = {
        publications: autoResult.value.results.length,
        averageInnovationScore: 0,
        averageOriginalityScore: 0,
        costPerPublication: autoResult.value.results.length > 0 ? autoResult.value.totalCostUsd / autoResult.value.results.length : 0
      };
    }
    
    output.totalDurationMs = duration;
    
    return output;
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export const hybridPublisher = new HybridPublisher();

// Convenience function for backward compatibility
export async function runHybridPublisher(config?: HybridPublisherConfig): Promise<HybridPublisherOutput> {
  return hybridPublisher.runHybridPublisher(config);
}
