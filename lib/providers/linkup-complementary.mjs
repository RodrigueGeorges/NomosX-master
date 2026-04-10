/**
 * LinkUp Complementary Search Engine - Production Ready
 * 
 * CTO Architecture - Cross-Provider Intelligence
 * OpenClaw Enhanced - 100% Performance Optimized
 */

import { searchWithLinkUp, complementarySearchWithLinkUp } from './linkup-registry.mjs';

// ===== MOTEUR DE RECHERCHE COMPLÉMENTAIRE =====
export class LinkUpComplementaryEngine {
  constructor() {
    this.cache = new Map();
    this.metrics = {
      searchesPerformed: 0,
      complementaryFound: 0,
      qualityImprovement: 0,
      averageGapsIdentified: 0
    };
  }

  // ===== RECHERCHE COMPLÉMENTAIRE INTELLIGENTE =====
  async findComplementarySources(query, existingSources = [], options = {}) {
    console.log(`🔍 LinkUp: Finding complementary sources for "${query}"...`);
    
    const cacheKey = this.generateCacheKey(query, existingSources);
    if (this.cache.has(cacheKey) && !options.skipCache) {
      console.log('  ✅ Using cached complementary results');
      return this.cache.get(cacheKey);
    }
    
    try {
      const startTime = Date.now();
      
      // 1. Analyser les sources existantes
      const existingAnalysis = this.analyzeExistingSources(existingSources);
      console.log(`  📊 Analyzed ${existingSources.length} existing sources`);
      
      // 2. Identifier les gaps
      const gaps = this.identifyGaps(existingAnalysis);
      console.log(`  🔍 Identified ${gaps.length} gaps: ${gaps.map(g => g.type).join(', ')}`);
      
      // 3. Construire une requête enrichie
      const enrichedQuery = this.buildEnrichedQuery(query, gaps);
      console.log(`  🔄 Enriched query: "${enrichedQuery}"`);
      
      // 4. Exécuter la recherche complémentaire
      const response = await complementarySearchWithLinkUp(enrichedQuery, existingSources);
      
      if (!response.success) {
        throw new Error(response.error || 'Complementary search failed');
      }
      
      // 5. Filtrer et scorer les résultats
      const candidates = response.data?.complementary || response.data?.results || [];
      const complementaryResults = this.filterAndScore(candidates, existingSources);
      
      // 6. Calculer l'amélioration de qualité
      const qualityImprovement = this.calculateQualityImprovement(existingSources, complementaryResults);
      
      const duration = Date.now() - startTime;
      
      const result = {
        success: true,
        originalQuery: query,
        enrichedQuery,
        gapsIdentified: gaps,
        complementarySources: complementaryResults,
        qualityImprovement,
        metadata: {
          timestamp: new Date().toISOString(),
          sourcesAnalyzed: existingSources.length,
          complementaryFound: complementaryResults.length,
          duration,
          cacheKey
        }
      };
      
      // 7. Mettre en cache
      this.cache.set(cacheKey, result);
      
      // 8. Mettre à jour les métriques
      this.metrics.searchesPerformed++;
      this.metrics.complementaryFound += complementaryResults.length;
      this.metrics.qualityImprovement += qualityImprovement;
      this.metrics.averageGapsIdentified = 
        ((this.metrics.averageGapsIdentified * (this.metrics.searchesPerformed - 1)) + gaps.length) / 
        this.metrics.searchesPerformed;
      
      console.log(`  ✅ Found ${complementaryResults.length} complementary sources (+${qualityImprovement.toFixed(1)}% quality)`);
      
      return result;
      
    } catch (error) {
      console.error('  ❌ Complementary search failed:', error.message);
      return {
        success: false,
        originalQuery: query,
        error: error.message,
        complementarySources: [],
        gapsIdentified: [],
        qualityImprovement: 0
      };
    }
  }

  // ===== ANALYSE DES SOURCES EXISTANTES =====
  analyzeExistingSources(sources) {
    const analysis = {
      total: sources.length,
      sourceTypes: {},
      providers: {},
      recency: { recent: 0, old: 0, veryOld: 0 },
      quality: { excellent: 0, good: 0, average: 0, poor: 0 },
      diversity: { score: 0, uniqueTypes: 0 },
      coverage: { topics: new Set(), keywords: new Set() }
    };
    
    if (sources.length === 0) return analysis;
    
    sources.forEach(source => {
      // Types de sources
      const type = this.categorizeSource(source);
      analysis.sourceTypes[type] = (analysis.sourceTypes[type] || 0) + 1;
      
      // Providers
      const provider = source.provider || 'unknown';
      analysis.providers[provider] = (analysis.providers[provider] || 0) + 1;
      
      // Récence
      const ageHours = (Date.now() - new Date(source.publishedAt || Date.now())) / (1000 * 60 * 60);
      if (ageHours < 24) analysis.recency.recent++;
      else if (ageHours < 168) analysis.recency.old++;
      else analysis.recency.veryOld++;
      
      // Qualité
      const quality = this.assessQuality(source);
      if (quality >= 90) analysis.quality.excellent++;
      else if (quality >= 75) analysis.quality.good++;
      else if (quality >= 60) analysis.quality.average++;
      else analysis.quality.poor++;
      
      // Coverage
      if (source.metadata?.keywords) {
        source.metadata.keywords.forEach(kw => analysis.coverage.keywords.add(kw));
      }
    });
    
    // Calculer la diversité
    analysis.diversity.uniqueTypes = Object.keys(analysis.sourceTypes).length;
    analysis.diversity.score = analysis.diversity.uniqueTypes / Math.max(sources.length, 1);
    
    return analysis;
  }

  // ===== IDENTIFICATION DES GAPS =====
  identifyGaps(analysis) {
    const gaps = [];
    
    // Gap de diversité des sources
    if (analysis.diversity.uniqueTypes < 3) {
      gaps.push({
        type: 'diversity',
        severity: 'HIGH',
        description: `Limited source diversity (${analysis.diversity.uniqueTypes} types)`,
        recommendation: 'Search for diverse source types (academic, news, government, industry)',
        score: 1 - analysis.diversity.score
      });
    }
    
    // Gap de récence
    const recentRatio = analysis.recency.recent / Math.max(analysis.total, 1);
    if (recentRatio < 0.5) {
      gaps.push({
        type: 'recency',
        severity: recentRatio < 0.2 ? 'HIGH' : 'MEDIUM',
        description: `Outdated sources (${Math.round(recentRatio * 100)}% recent)`,
        recommendation: 'Search for recent sources from last 24 hours',
        score: 1 - recentRatio
      });
    }
    
    // Gap de qualité
    const qualityRatio = (analysis.quality.excellent + analysis.quality.good) / Math.max(analysis.total, 1);
    if (qualityRatio < 0.6) {
      gaps.push({
        type: 'quality',
        severity: qualityRatio < 0.3 ? 'HIGH' : 'MEDIUM',
        description: `Low source quality (${Math.round(qualityRatio * 100)}% high-quality)`,
        recommendation: 'Search for high-quality, credible, authoritative sources',
        score: 1 - qualityRatio
      });
    }
    
    // Gap de providers
    const uniqueProviders = Object.keys(analysis.providers).length;
    if (uniqueProviders < 3) {
      gaps.push({
        type: 'provider_diversity',
        severity: 'MEDIUM',
        description: `Limited provider diversity (${uniqueProviders} providers)`,
        recommendation: 'Search across multiple providers',
        score: 1 - (uniqueProviders / 5)
      });
    }
    
    // Gap de coverage
    if (analysis.coverage.keywords.size < 5) {
      gaps.push({
        type: 'coverage',
        severity: 'LOW',
        description: `Limited topic coverage (${analysis.coverage.keywords.size} keywords)`,
        recommendation: 'Search for broader topic coverage',
        score: 1 - (analysis.coverage.keywords.size / 10)
      });
    }
    
    // Trier par sévérité et score
    return gaps.sort((a, b) => {
      const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      return severityDiff !== 0 ? severityDiff : b.score - a.score;
    });
  }

  // ===== CONSTRUCTION DE REQUÊTE ENRICHIE =====
  buildEnrichedQuery(originalQuery, gaps) {
    let enrichedQuery = originalQuery;
    const enrichments = [];
    
    gaps.forEach(gap => {
      switch (gap.type) {
        case 'diversity':
          enrichments.push('diverse sources academic news research industry government');
          break;
        case 'recency':
          enrichments.push('recent latest 2024 current');
          break;
        case 'quality':
          enrichments.push('high-quality credible authoritative peer-reviewed');
          break;
        case 'provider_diversity':
          enrichments.push('multiple sources comprehensive');
          break;
        case 'coverage':
          enrichments.push('comprehensive detailed in-depth');
          break;
      }
    });
    
    // Ajouter les enrichissements de manière intelligente
    if (enrichments.length > 0) {
      enrichedQuery += ' ' + enrichments.join(' ');
    }
    
    return enrichedQuery;
  }

  // ===== FILTRAGE ET SCORING =====
  filterAndScore(candidates, existingSources) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return [];
    }
    
    return candidates
      .map(candidate => ({
        ...candidate,
        complementarityScore: this.calculateComplementarityScore(candidate, existingSources),
        qualityScore: this.assessQuality(candidate),
        uniquenessScore: this.calculateUniquenessScore(candidate, existingSources)
      }))
      .filter(candidate => 
        candidate.complementarityScore > 0.4 && 
        candidate.qualityScore > 50
      )
      .sort((a, b) => {
        const scoreA = (a.complementarityScore * 0.4) + (a.qualityScore / 100 * 0.4) + (a.uniquenessScore * 0.2);
        const scoreB = (b.complementarityScore * 0.4) + (b.qualityScore / 100 * 0.4) + (b.uniquenessScore * 0.2);
        return scoreB - scoreA;
      })
      .slice(0, 15); // Top 15 complementary sources
  }

  // ===== UTILITAIRES DE SCORING =====
  categorizeSource(source) {
    const url = (source.url || '').toLowerCase();
    const title = (source.title || '').toLowerCase();
    
    if (url.includes('arxiv') || url.includes('scholar') || title.includes('research') || title.includes('study')) 
      return 'academic';
    if (url.includes('news') || url.includes('reuters') || url.includes('bloomberg') || title.includes('news')) 
      return 'news';
    if (url.includes('.gov') || title.includes('government') || title.includes('official')) 
      return 'government';
    if (url.includes('.edu') || title.includes('university') || title.includes('college')) 
      return 'education';
    if (url.includes('blog') || title.includes('blog')) 
      return 'blog';
    if (url.includes('company') || url.includes('corp') || title.includes('corporate')) 
      return 'industry';
    
    return 'other';
  }

  assessQuality(source) {
    let score = 50; // Base score
    
    const url = (source.url || '').toLowerCase();
    const title = (source.title || '').toLowerCase();
    const content = (source.content || source.abstract || '').toLowerCase();
    
    // Source credibility (30 points)
    if (url.includes('.gov')) score += 30;
    else if (url.includes('.edu')) score += 25;
    else if (url.includes('reuters') || url.includes('bloomberg') || url.includes('wsj')) score += 20;
    else if (url.includes('.org')) score += 15;
    
    // Content quality indicators (20 points)
    if (title.includes('study') || title.includes('research')) score += 10;
    if (title.includes('report') || title.includes('analysis')) score += 10;
    
    // Completeness (20 points)
    if (content.length > 500) score += 10;
    if (content.length > 1000) score += 10;
    
    // Metadata (10 points)
    if (source.authors && source.authors.length > 0) score += 5;
    if (source.doi || source.metadata?.doi) score += 5;
    
    // Recency (20 points)
    if (source.publishedAt) {
      const ageHours = (Date.now() - new Date(source.publishedAt)) / (1000 * 60 * 60);
      if (ageHours < 24) score += 20;
      else if (ageHours < 168) score += 15;
      else if (ageHours < 720) score += 10;
      else if (ageHours < 2160) score += 5;
    }
    
    return Math.min(score, 100);
  }

  calculateComplementarityScore(candidate, existingSources) {
    let score = 0.5; // Base score
    
    // Vérifier si l'URL est unique
    const existingUrls = existingSources.map(s => s.url || '');
    if (!existingUrls.includes(candidate.url)) {
      score += 0.2;
    }
    
    // Vérifier si le type de source est nouveau
    const candidateType = this.categorizeSource(candidate);
    const existingTypes = existingSources.map(s => this.categorizeSource(s));
    if (!existingTypes.includes(candidateType)) {
      score += 0.2;
    }
    
    // Vérifier si le provider est différent
    const existingProviders = existingSources.map(s => s.provider || '');
    if (!existingProviders.includes(candidate.provider)) {
      score += 0.1;
    }
    
    return Math.min(score, 1);
  }

  calculateUniquenessScore(candidate, existingSources) {
    const candidateTitle = (candidate.title || '').toLowerCase();
    
    // Vérifier la similarité des titres
    let maxSimilarity = 0;
    existingSources.forEach(existing => {
      const existingTitle = (existing.title || '').toLowerCase();
      const similarity = this.calculateSimilarity(candidateTitle, existingTitle);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    });
    
    return 1 - maxSimilarity;
  }

  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const words1 = str1.split(/\s+/).filter(w => w.length > 3);
    const words2 = str2.split(/\s+/).filter(w => w.length > 3);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const common = words1.filter(word => words2.includes(word));
    const total = [...new Set([...words1, ...words2])].length;
    
    return total > 0 ? common.length / total : 0;
  }

  calculateQualityImprovement(existing, complementary) {
    if (existing.length === 0) return 0;
    if (complementary.length === 0) return 0;
    
    const existingQuality = existing.reduce((sum, s) => sum + this.assessQuality(s), 0) / existing.length;
    const complementaryQuality = complementary.reduce((sum, s) => sum + (s.qualityScore || this.assessQuality(s)), 0) / complementary.length;
    
    return ((complementaryQuality - existingQuality) / existingQuality) * 100;
  }

  // ===== GESTION DU CACHE =====
  generateCacheKey(query, sources) {
    const sourceSignature = sources
      .map(s => s.url || s.id)
      .sort()
      .join('|')
      .slice(0, 100);
    
    return `${query.toLowerCase().slice(0, 50)}-${sources.length}-${sourceSignature}`;
  }

  clearCache() {
    this.cache.clear();
    console.log('🗑️  LinkUp complementary cache cleared');
  }

  // ===== MÉTRIQUES =====
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.cache.size,
      averageComplementaryPerSearch: this.metrics.complementaryFound / Math.max(this.metrics.searchesPerformed, 1),
      averageQualityImprovement: this.metrics.qualityImprovement / Math.max(this.metrics.searchesPerformed, 1)
    };
  }

  resetMetrics() {
    this.metrics = {
      searchesPerformed: 0,
      complementaryFound: 0,
      qualityImprovement: 0,
      averageGapsIdentified: 0
    };
    console.log('📊 LinkUp complementary metrics reset');
  }
}

// ===== EXPORT SINGLETON =====
export const linkUpComplementaryEngine = new LinkUpComplementaryEngine();

// Export par défaut
export default linkUpComplementaryEngine;
