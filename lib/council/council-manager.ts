/**
 * NomosX Council Manager - Advanced 22 Expert Management
 * 
 * Intelligent selection and load balancing for 22 domain experts
 * Optimized for performance and quality
 */

import { DomainExpertise, DomainExpert, DOMAIN_EXPERTS } from '@/lib/agent/domain-expert';
import { ExpertAnalysis } from '@/lib/agent/types';
import { knowledgeBase } from '@/lib/knowledge/multi-domain-corpus';

export interface CouncilQuery {
  question: string;
  sourceContext: string;
  sourceCount: number;
  options?: {
    maxExperts?: number;
    strategic?: boolean;
    complexity?: 'low' | 'medium' | 'high';
    priority?: 'speed' | 'quality' | 'balanced';
    domains?: DomainExpertise[];
    excludeDomains?: DomainExpertise[];
  };
}

export interface CouncilSelection {
  experts: DomainExpert[];
  selectionReason: string;
  estimatedDuration: number;
  estimatedCost: number;
  qualityScore: number;
}

export interface CouncilResult {
  query: string;
  selection: CouncilSelection;
  analyses: ExpertAnalysis[];
  totalCost: number;
  totalDuration: number;
  qualityMetrics: {
    avgConfidence: number;
    avgFindings: number;
    consensusScore: number;
    dissentCount: number;
  };
  performance: {
    expertCount: number;
    parallelEfficiency: number;
    loadBalanceScore: number;
  };
}

export interface ExpertLoadBalance {
  expertId: string;
  currentLoad: number;
  avgResponseTime: number;
  successRate: number;
  lastUsed: Date;
  capacity: number;
  // Performance history (AgentTuning-inspired)
  totalTasks: number;
  avgQualityScore: number;
  avgTrustScore: number;
  bestTopics: string[];
  weakTopics: string[];
}

export interface ExpertPerformanceRecord {
  expertId: string;
  domain: string;
  topic: string;
  qualityScore: number;
  trustScore: number;
  durationMs: number;
  success: boolean;
  timestamp: Date;
}

export class CouncilManager {

  private expertLoadBalance: Map<string, ExpertLoadBalance> = new Map();
  private performanceHistory: ExpertPerformanceRecord[] = [];
  private readonly MAX_CONCURRENT_EXPERTS = 22;
  private readonly DEFAULT_TIMEOUT = 20000; // 20s per expert
  private readonly MAX_HISTORY = 500; // Keep last 500 records
  
  constructor() {
    this.initializeLoadBalance();
  }
  
  /**
   * Initialize load balancing for all experts
   */
  private initializeLoadBalance(): void {
    Object.values(DOMAIN_EXPERTS).forEach(expert => {
      this.expertLoadBalance.set(expert.id, {
        expertId: expert.id,
        currentLoad: 0,
        avgResponseTime: 15000, // 15s average
        successRate: 0.95, // 95% success rate
        lastUsed: new Date(),
        capacity: 10, // Max concurrent requests
        totalTasks: 0,
        avgQualityScore: 0,
        avgTrustScore: 0,
        bestTopics: [],
        weakTopics: [],
      });
    });
  }
  
  /**
   * Select optimal experts for a given query
   */
  async selectOptimalExperts(query: CouncilQuery): Promise<CouncilSelection> {
    const startTime = Date.now();
    
    // Determine expert count based on complexity and options
    const expertCount = this.determineExpertCount(query);
    
    // Get candidate experts
    let candidates = this.getCandidateExperts(query);
    
    // Score and rank candidates
    const scoredExperts = await this.scoreExperts(candidates, query);
    
    // Apply load balancing
    const balancedExperts = this.applyLoadBalancing(scoredExperts, expertCount);
    
    // Calculate metrics
    const estimatedDuration = this.estimateDuration(balancedExperts);
    const estimatedCost = this.estimateCost(balancedExperts);
    const qualityScore = this.calculateQualityScore(balancedExperts, query);
    
    const selectionReason = this.generateSelectionReason(balancedExperts, query);
    
    return {
      experts: balancedExperts,
      selectionReason,
      estimatedDuration,
      estimatedCost,
      qualityScore
    };
  }
  
  /**
   * Determine optimal expert count based on query complexity
   */
  private determineExpertCount(query: CouncilQuery): number {
    const { options } = query;
    
    // User-specified count takes precedence
    if (options?.maxExperts) {
      return Math.min(options.maxExperts, this.MAX_CONCURRENT_EXPERTS);
    }
    
    // Strategic queries get more experts
    if (options?.strategic) {
      return Math.min(8, this.MAX_CONCURRENT_EXPERTS);
    }
    
    // Complexity-based selection
    switch (options?.complexity) {
      case 'high':
        return Math.min(6, this.MAX_CONCURRENT_EXPERTS);
      case 'medium':
        return Math.min(4, this.MAX_CONCURRENT_EXPERTS);
      case 'low':
        return Math.min(3, this.MAX_CONCURRENT_EXPERTS);
      default:
        return Math.min(4, this.MAX_CONCURRENT_EXPERTS);
    }
  }
  
  /**
   * Get candidate experts based on query
   */
  private getCandidateExperts(query: CouncilQuery): DomainExpert[] {
    const { options } = query;
    let candidates = Object.values(DOMAIN_EXPERTS);
    
    // Filter by specified domains
    if (options?.domains && options.domains.length > 0) {
      candidates = candidates.filter(expert => 
        options.domains!.includes(expert.domain as DomainExpertise)
      );
    }
    
    // Exclude specified domains
    if (options?.excludeDomains && options.excludeDomains.length > 0) {
      candidates = candidates.filter(expert => 
        !options.excludeDomains!.includes(expert.domain as DomainExpertise)
      );
    }
    
    return candidates;
  }
  
  /**
   * Score experts based on query relevance and performance
   */
  private async scoreExperts(
    experts: DomainExpert[], 
    query: CouncilQuery
  ): Promise<Array<{ expert: DomainExpert; score: number }>> {
    const scored = await Promise.all(
      experts.map(async (expert) => {
        let score = 0;
        
        // Domain relevance (40% weight)
        const domainScore = this.calculateDomainRelevance(expert, query.question);
        score += domainScore * 0.4;
        
        // Load balance (30% weight)
        const loadScore = this.calculateLoadScore(expert);
        score += loadScore * 0.3;
        
        // Performance (20% weight)
        const perfScore = this.calculatePerformanceScore(expert);
        score += perfScore * 0.2;
        
        // Knowledge base coverage (10% weight)
        const knowledgeScore = await this.calculateKnowledgeScore(expert, query);
        score += knowledgeScore * 0.1;
        
        return { expert, score };
      })
    );
    
    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score);
  }
  
  /**
   * Calculate domain relevance score
   */
  private calculateDomainRelevance(expert: DomainExpert, question: string): number {
    const q = question.toLowerCase();
    let score = 0;
    
    // Normalize query: replace hyphens with spaces and expand common abbreviations
    const ABBREVIATIONS: Record<string, string> = {
      'ai': 'artificial intelligence',
      'ml': 'machine learning',
      'nlp': 'natural language processing',
      'gdpr': 'general data protection regulation',
      'esg': 'environmental social governance',
    };
    const normalizedQ = q.replace(/-/g, ' ').replace(/\b(ai|ml|nlp|gdpr|esg)\b/g, (m) => ABBREVIATIONS[m] || m);

    // Direct domain matches (with stem matching for plurals)
    const domainNorm = expert.domain.toLowerCase().replace(/-/g, ' ');
    const domainStem = domainNorm.replace(/s$/, '');
    if (normalizedQ.includes(domainNorm) || normalizedQ.includes(domainStem)) {
      score += 50;
    }

    // Sub-domain matches (normalize hyphens to spaces)
    expert.subDomains.forEach(subDomain => {
      const normalizedSub = subDomain.toLowerCase().replace(/-/g, ' ');
      if (normalizedQ.includes(normalizedSub)) {
        score += 20;
      }
    });

    // Key concepts matches
    expert.methodologies.forEach(method => {
      if (normalizedQ.includes(method.toLowerCase())) {
        score += 10;
      }
    });

    // Known biases (negative scoring)
    expert.knownBiases.forEach(bias => {
      if (normalizedQ.includes(bias.toLowerCase())) {
        score -= 5;
      }
    });
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Calculate load balancing score
   */
  private calculateLoadScore(expert: DomainExpert): number {
    const load = this.expertLoadBalance.get(expert.id);
    if (!load) return 50; // Default score
    
    // Lower load = higher score
    const loadScore = Math.max(0, 100 - (load.currentLoad / load.capacity) * 100);
    
    // Recent usage penalty
    const hoursSinceLastUse = (Date.now() - load.lastUsed.getTime()) / (1000 * 60 * 60);
    const recencyPenalty = Math.max(0, 20 - hoursSinceLastUse);
    
    return Math.max(0, loadScore - recencyPenalty);
  }
  
  /**
   * Calculate performance score
   */
  private calculatePerformanceScore(expert: DomainExpert): number {
    const load = this.expertLoadBalance.get(expert.id);
    if (!load) return 80; // Default score
    
    // Success rate (40% weight)
    const successScore = load.successRate * 40;
    
    // Response time (60% weight, inverted)
    const responseScore = Math.max(0, 60 - (load.avgResponseTime / 1000) * 2);
    
    return successScore + responseScore;
  }
  
  /**
   * Calculate knowledge base coverage score
   */
  private async calculateKnowledgeScore(
    expert: DomainExpert, 
    query: CouncilQuery
  ): Promise<number> {
    try {
      // Get knowledge context for expert's domain
      const context = await knowledgeBase.getExpertContext(
        expert.domain as DomainExpertise,
        expert.subDomains.slice(0, 3)
      );
      
      // Score based on context richness
      const contextLength = context.length;
      const baseScore = Math.min(100, contextLength / 100); // Normalize to 0-100
      
      // Bonus for high-quality documents
      const qualityBonus = context.includes('Quality Score: 9') ? 20 : 0;
      
      return Math.min(100, baseScore + qualityBonus);
    } catch (error) {
      console.warn(`[CouncilManager] Knowledge score error for ${expert.id}:`, error);
      return 50; // Default score on error
    }
  }
  
  /**
   * Apply load balancing to selected experts
   */
  private applyLoadBalancing(
    scoredExperts: Array<{ expert: DomainExpert; score: number }>,
    count: number
  ): DomainExpert[] {
    const selected: DomainExpert[] = [];
    const usedExperts = new Set<string>();
    
    // Select top experts with load balancing
    for (const { expert } of scoredExperts) {
      if (selected.length >= count) break;
      if (usedExperts.has(expert.id)) continue;
      
      const load = this.expertLoadBalance.get(expert.id);
      if (load && load.currentLoad < load.capacity) {
        selected.push(expert);
        usedExperts.add(expert.id);
        
        // Update load
        load.currentLoad++;
        load.lastUsed = new Date();
      }
    }
    
    // Fallback: if not enough experts, ignore load constraints
    if (selected.length < count) {
      for (const { expert } of scoredExperts) {
        if (selected.length >= count) break;
        if (!usedExperts.has(expert.id)) {
          selected.push(expert);
          usedExperts.add(expert.id);
        }
      }
    }
    
    return selected;
  }
  
  /**
   * Estimate total duration for council
   */
  private estimateDuration(experts: DomainExpert[]): number {
    const avgExpertTime = experts.reduce((sum, expert) => {
      const load = this.expertLoadBalance.get(expert.id);
      return sum + (load?.avgResponseTime || 15000);
    }, 0) / experts.length;
    
    // Parallel execution with some overhead
    return Math.round(avgExpertTime * 1.1); // 10% overhead
  }
  
  /**
   * Estimate total cost for council
   */
  private estimateCost(experts: DomainExpert[]): number {
    // Base cost per expert + complexity multiplier
    const baseCostPerExpert = 0.50; // $0.50 per expert
    const complexityMultiplier = 1.2; // 20% for complex queries
    
    return Math.round(experts.length * baseCostPerExpert * complexityMultiplier * 100) / 100;
  }
  
  /**
   * Calculate quality score for council selection
   */
  private calculateQualityScore(experts: DomainExpert[], query: CouncilQuery): number {
    let score = 0;
    
    // Expert diversity (30% weight)
    const domains = new Set(experts.map(e => e.domain));
    const diversityScore = (domains.size / experts.length) * 30;
    score += diversityScore;
    
    // Expert quality (40% weight) — based on actual success rates
    const avgQuality = experts.reduce((sum, expert) => {
      const load = this.expertLoadBalance.get(expert.id);
      return sum + (load ? load.successRate * 100 : 85);
    }, 0) / experts.length;
    const qualityScore = (avgQuality / 100) * 40;
    score += qualityScore;
    
    // Load balance (30% weight)
    const avgLoadScore = experts.reduce((sum, expert) => {
      return sum + this.calculateLoadScore(expert);
    }, 0) / experts.length;
    const loadScore = (avgLoadScore / 100) * 30;
    score += loadScore;
    
    return Math.round(score);
  }
  
  /**
   * Generate selection reason explanation
   */
  private generateSelectionReason(experts: DomainExpert[], query: CouncilQuery): string {
    const domains = experts.map(e => e.domain).join(', ');
    const complexity = query.options?.complexity || 'medium';
    const strategic = query.options?.strategic ? 'strategic' : 'standard';
    
    return `Selected ${experts.length} experts (${domains}) for ${strategic} ${complexity} complexity query. Optimized for domain relevance, load balance, and knowledge coverage.`;
  }
  
  /**
   * Update expert performance metrics
   */
  updateExpertMetrics(
    expertId: string,
    duration: number,
    success: boolean,
    performance?: { qualityScore?: number; trustScore?: number; domain?: string; topic?: string }
  ): void {
    const load = this.expertLoadBalance.get(expertId);
    if (!load) return;

    // Update load
    load.currentLoad = Math.max(0, load.currentLoad - 1);

    // Update response time (exponential moving average)
    const alpha = 0.1; // Smoothing factor
    load.avgResponseTime = load.avgResponseTime * (1 - alpha) + duration * alpha;

    // Update success rate
    const beta = 0.05; // Smoothing factor
    load.successRate = load.successRate * (1 - beta) + (success ? 1 : 0) * beta;

    // Track detailed performance (AgentTuning-inspired)
    if (performance) {
      load.totalTasks++;
      if (performance.qualityScore !== undefined) {
        load.avgQualityScore = load.avgQualityScore * (1 - alpha) + performance.qualityScore * alpha;
      }
      if (performance.trustScore !== undefined) {
        load.avgTrustScore = load.avgTrustScore * (1 - alpha) + performance.trustScore * alpha;
      }
      // Track best/weak topics
      if (performance.topic) {
        if ((performance.trustScore ?? 0) >= 75 && !load.bestTopics.includes(performance.topic)) {
          load.bestTopics.push(performance.topic);
          if (load.bestTopics.length > 10) load.bestTopics.shift();
        }
        if ((performance.trustScore ?? 100) < 60 && !load.weakTopics.includes(performance.topic)) {
          load.weakTopics.push(performance.topic);
          if (load.weakTopics.length > 10) load.weakTopics.shift();
        }
      }
      // Store in history
      this.performanceHistory.push({
        expertId,
        domain: performance.domain || '',
        topic: performance.topic || '',
        qualityScore: performance.qualityScore || 0,
        trustScore: performance.trustScore || 0,
        durationMs: duration,
        success,
        timestamp: new Date(),
      });
      // Trim history
      if (this.performanceHistory.length > this.MAX_HISTORY) {
        this.performanceHistory = this.performanceHistory.slice(-this.MAX_HISTORY);
      }
    }
  }

  /**
   * Get performance history for an expert (or all experts if no ID specified).
   */
  getPerformanceHistory(expertId?: string): ExpertPerformanceRecord[] {
    if (expertId) return this.performanceHistory.filter(r => r.expertId === expertId);
    return this.performanceHistory;
  }
  
  /**
   * Get council performance metrics
   */
  getCouncilMetrics(): {
    totalExperts: number;
    avgLoad: number;
    avgResponseTime: number;
    avgSuccessRate: number;
    expertDetails: ExpertLoadBalance[];
  } {
    const loads = Array.from(this.expertLoadBalance.values());
    
    return {
      totalExperts: loads.length,
      avgLoad: loads.reduce((sum, load) => sum + load.currentLoad, 0) / loads.length,
      avgResponseTime: loads.reduce((sum, load) => sum + load.avgResponseTime, 0) / loads.length,
      avgSuccessRate: loads.reduce((sum, load) => sum + load.successRate, 0) / loads.length,
      expertDetails: loads
    };
  }
  
  /**
   * Reset expert metrics (for testing or maintenance)
   */
  resetMetrics(): void {
    this.initializeLoadBalance();
  }
}

// Export singleton instance
export const councilManager = new CouncilManager();
