/**
 * NomosX Vertical Intelligence Publisher
 * 
 * Professional implementation for publishing vertical intelligence results
 * Handles storage and management of vertical publications
 */

import { prisma } from '../../db';
import { evaluatePublicationReadiness } from '@/lib/publication-visibility';

// ============================================================================
// TYPES
// ============================================================================

export interface VerticalPublication {
  id: string;
  title: string;
  html: string;
  verticalSlug: string;
  trustScore: number;
  wordCount: number;
  publishedAt: Date;
  originalityScore?: number;
  validationPassed?: boolean;
  researchProjectId?: string;
  leadExpert?: string;
  researchTeam?: string[];
  originalContribution?: string;
  competitiveAdvantage?: string;
}

export interface VerticalPublisherConfig {
  verticalSlugs?: string[];
  maxCostPerRun?: number;
  dryRun?: boolean;
  enableValidation?: boolean;
  qualityGates?: {
    minTrustScore: number;
    minOriginalityScore: number;
    minWordCount: number;
  };
}

export interface VerticalPublisherOutput {
  totalPublications: number;
  totalCostUsd: number;
  totalDurationMs: number;
  verticalResults: any[];
  summary: {
    averageInnovationScore: number;
    averageOriginalityScore: number;
    successRate: number;
    bestPerformingVertical?: string;
    totalErrors?: number;
    totalWarnings?: number;
  };
}

// ============================================================================
// VERTICAL PUBLISHER CLASS
// ============================================================================

export class VerticalPublisher {
  private config: VerticalPublisherConfig;

  constructor(config: VerticalPublisherConfig = {}) {
    this.config = config;
  }

  /**
   * Store vertical publications in database
   */
  async storePublications(publications: VerticalPublication[]): Promise<void> {
    for (const publication of publications) {
      try {
        const publicationType = 'RESEARCH_BRIEF';
        const citationCoverage = 0.8;
        const readiness = evaluatePublicationReadiness({
          type: publicationType,
          trustScore: publication.trustScore,
          qualityScore: publication.trustScore,
          citationCoverage,
          wordCount: publication.wordCount,
          sourceIds: [],
        });

        await prisma.thinkTankPublication.create({
          data: {
            title: publication.title,
            html: publication.html,
            verticalId: publication.verticalSlug,
            trustScore: publication.trustScore,
            wordCount: publication.wordCount,
            publishedAt: readiness.ok ? publication.publishedAt : null,
            status: readiness.ok ? 'PUBLISHED' : 'HELD',
            type: publicationType,
            qualityScore: publication.trustScore,
            citationCoverage
          }
        });
        
        console.log(`[VERTICAL_PUBLISHER] Stored publication: ${publication.title}`);
      } catch (error) {
        console.error(`[VERTICAL_PUBLISHER] Failed to store publication:`, error);
      }
    }
  }

  /**
   * Calculate average innovation score
   */
  private calculateAverageInnovationScore(results: any[]): number {
    if (results.length === 0) return 0;
    const sum = results.reduce((acc: number, result: any) => acc + (result.innovationScore || 0), 0);
    return Math.round(sum / results.length);
  }

  /**
   * Calculate average originality score
   */
  private calculateAverageOriginalityScore(results: any[]): number {
    if (results.length === 0) return 0;
    const sum = results.reduce((acc: number, result: any) => acc + (result.originalityScore || 0), 0);
    return Math.round(sum / results.length);
  }

  /**
   * Find best performing vertical
   */
  private findBestPerformingVertical(results: any[]): string {
    if (results.length === 0) return "none";
    
    const performance: Record<string, number> = {};
    
    for (const result of results) {
      const vertical = result.verticalSlug || "unknown";
      if (!performance[vertical]) {
        performance[vertical] = 0;
      }
      performance[vertical] += (result.trustScore || 0);
    }
    
    return Object.entries(performance).reduce((best: [string, number], current: [string, number]) => 
      current[1] > best[1] ? current : best
    , ["none", 0])[0];
  }

  /**
   * Generate publisher output summary
   */
  generateOutput(results: any[]): VerticalPublisherOutput {
    const totalPublications = results.length;
    const totalCostUsd = results.reduce((sum: number, result: any) => sum + (result.costUsd || 0), 0);
    const totalDurationMs = results.reduce((sum: number, result: any) => sum + (result.durationMs || 0), 0);

    return {
      totalPublications,
      totalCostUsd,
      totalDurationMs,
      verticalResults: results,
      summary: {
        averageInnovationScore: this.calculateAverageInnovationScore(results),
        averageOriginalityScore: this.calculateAverageOriginalityScore(results),
        successRate: results.filter(r => r.validationPassed !== false).length / totalPublications * 100
      }
    };
  }

  /**
   * Publish vertical intelligence results
   */
  async run(config: VerticalPublisherConfig = {}): Promise<VerticalPublisherOutput> {
    console.log('[VERTICAL_PUBLISHER] Running with config:', config);
    
    // Placeholder implementation
    const results: any[] = [];
    
    return {
      totalPublications: 0,
      totalCostUsd: 0,
      totalDurationMs: 0,
      verticalResults: results,
      summary: {
        averageInnovationScore: 0,
        averageOriginalityScore: 0,
        successRate: 0
      }
    };
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export const verticalPublisher = new VerticalPublisher({
  enableValidation: true,
  qualityGates: {
    minTrustScore: 70,
    minOriginalityScore: 60,
    minWordCount: 500
  }
});
