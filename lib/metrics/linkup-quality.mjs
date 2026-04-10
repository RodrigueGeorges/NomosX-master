/**
 * LinkUp Quality Metrics System - Production Ready
 * 
 * CTO Architecture - Performance & Quality Tracking
 * OpenClaw Enhanced - 100% Performance Optimized
 */

export class LinkUpQualityMetrics {
  constructor() {
    this.metrics = new Map();
    this.history = [];
    this.thresholds = {
      excellent: 90,
      good: 75,
      acceptable: 60,
      poor: 40
    };
  }

  // ===== SCORING COMPLET =====
  calculateOverallScore(source, context = {}) {
    const scores = {
      relevance: this.calculateRelevanceScore(source, context),
      credibility: this.calculateCredibilityScore(source),
      recency: this.calculateRecencyScore(source),
      completeness: this.calculateCompletenessScore(source),
      uniqueness: this.calculateUniquenessScore(source, context.allSources || [])
    };
    
    const weights = {
      relevance: 0.30,
      credibility: 0.25,
      recency: 0.20,
      completeness: 0.15,
      uniqueness: 0.10
    };
    
    const overallScore = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + (score * weights[key]);
    }, 0);
    
    const result = {
      overall: Math.round(overallScore),
      breakdown: scores,
      weights,
      grade: this.getGrade(overallScore),
      timestamp: new Date().toISOString()
    };
    
    // Enregistrer dans l'historique
    this.history.push({
      sourceId: source.id || source.url,
      score: result.overall,
      timestamp: result.timestamp
    });
    
    return result;
  }

  // ===== SCORE DE PERTINENCE =====
  calculateRelevanceScore(source, context = {}) {
    let score = 50;
    
    const title = (source.title || '').toLowerCase();
    const content = (source.content || source.abstract || '').toLowerCase();
    const query = (context.query || '').toLowerCase();
    
    if (!query) return score;
    
    // Matching des termes de la requête
    const queryTerms = query.split(/\s+/).filter(term => term.length > 2);
    
    queryTerms.forEach(term => {
      if (title.includes(term)) score += 10;
      if (content.includes(term)) score += 5;
    });
    
    // Bonus pour titre pertinent
    if (title.length > 10 && title.length < 150) score += 5;
    
    // Bonus pour contenu substantiel
    if (content.length > 200) score += 5;
    
    return Math.min(score, 100);
  }

  // ===== SCORE DE CRÉDIBILITÉ =====
  calculateCredibilityScore(source) {
    let score = 50;
    
    const url = (source.url || '').toLowerCase();
    const domain = url.split('/')[2] || '';
    
    // Sources gouvernementales (30 points)
    if (domain.includes('.gov')) score += 30;
    // Sources académiques (25 points)
    else if (domain.includes('.edu')) score += 25;
    // Sources news réputées (20 points)
    else if (domain.includes('reuters') || domain.includes('bloomberg') || domain.includes('wsj') || domain.includes('ft.com')) score += 20;
    // Sources organisations (15 points)
    else if (domain.includes('.org')) score += 15;
    // Sources financières (15 points)
    else if (domain.includes('yahoo.com/finance') || domain.includes('sec.gov') || domain.includes('investor')) score += 15;
    
    // Présence d'auteurs (10 points)
    if (source.authors && source.authors.length > 0) score += 10;
    
    // Présence de DOI (10 points)
    if (source.doi || source.metadata?.doi) score += 10;
    
    // Citations (5 points)
    if (source.citationCount && source.citationCount > 10) score += 5;
    
    return Math.min(score, 100);
  }

  // ===== SCORE DE RÉCENCE =====
  calculateRecencyScore(source) {
    if (!source.publishedAt) return 30; // Score par défaut si pas de date
    
    const publishedDate = new Date(source.publishedAt);
    const now = new Date();
    const ageHours = (now - publishedDate) / (1000 * 60 * 60);
    
    // Scoring progressif basé sur l'âge
    if (ageHours < 1) return 100;        // Moins d'1 heure
    if (ageHours < 6) return 95;         // Moins de 6 heures
    if (ageHours < 24) return 90;        // Moins d'1 jour
    if (ageHours < 48) return 80;        // Moins de 2 jours
    if (ageHours < 168) return 70;       // Moins d'1 semaine
    if (ageHours < 720) return 60;       // Moins d'1 mois
    if (ageHours < 2160) return 50;      // Moins de 3 mois
    if (ageHours < 4320) return 40;      // Moins de 6 mois
    if (ageHours < 8760) return 30;      // Moins d'1 an
    
    return 20; // Plus d'1 an
  }

  // ===== SCORE DE COMPLÉTUDE =====
  calculateCompletenessScore(source) {
    let score = 0;
    
    // Titre (20 points)
    if (source.title) {
      if (source.title.length > 10) score += 10;
      if (source.title.length > 30) score += 10;
    }
    
    // Contenu/Abstract (30 points)
    const content = source.content || source.abstract || '';
    if (content.length > 50) score += 10;
    if (content.length > 200) score += 10;
    if (content.length > 500) score += 10;
    
    // URL (15 points)
    if (source.url) score += 15;
    
    // Date de publication (15 points)
    if (source.publishedAt) score += 15;
    
    // Auteurs (10 points)
    if (source.authors && source.authors.length > 0) score += 10;
    
    // Métadonnées additionnelles (10 points)
    if (source.metadata) {
      if (source.metadata.keywords && source.metadata.keywords.length > 0) score += 5;
      if (source.metadata.doi || source.doi) score += 5;
    }
    
    return Math.min(score, 100);
  }

  // ===== SCORE D'UNICITÉ =====
  calculateUniquenessScore(source, allSources = []) {
    if (allSources.length === 0) return 100;
    
    const title = (source.title || '').toLowerCase();
    const url = source.url || '';
    
    let score = 100;
    
    // Vérifier les URLs dupliquées
    const duplicateUrls = allSources.filter(s => s.url === url).length;
    if (duplicateUrls > 0) score -= 50;
    
    // Vérifier la similarité des titres
    let maxSimilarity = 0;
    allSources.forEach(existing => {
      if (existing.url === url) return; // Skip même source
      
      const existingTitle = (existing.title || '').toLowerCase();
      const similarity = this.calculateSimilarity(title, existingTitle);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    });
    
    // Pénalité basée sur la similarité
    score -= maxSimilarity * 50;
    
    return Math.max(score, 0);
  }

  // ===== UTILITAIRES =====
  getGrade(score) {
    if (score >= this.thresholds.excellent) return 'A';
    if (score >= this.thresholds.good) return 'B';
    if (score >= this.thresholds.acceptable) return 'C';
    if (score >= this.thresholds.poor) return 'D';
    return 'F';
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

  // ===== ANALYTICS & REPORTING =====
  generateQualityReport(sources, context = {}) {
    console.log(`📊 Generating quality report for ${sources.length} sources...`);
    
    const reports = sources.map(source => 
      this.calculateOverallScore(source, { ...context, allSources: sources })
    );
    
    const summary = {
      totalSources: sources.length,
      averageScore: Math.round(reports.reduce((sum, r) => sum + r.overall, 0) / reports.length),
      medianScore: this.calculateMedian(reports.map(r => r.overall)),
      gradeDistribution: reports.reduce((dist, r) => {
        dist[r.grade] = (dist[r.grade] || 0) + 1;
        return dist;
      }, {}),
      scoreDistribution: {
        excellent: reports.filter(r => r.overall >= 90).length,
        good: reports.filter(r => r.overall >= 75 && r.overall < 90).length,
        acceptable: reports.filter(r => r.overall >= 60 && r.overall < 75).length,
        poor: reports.filter(r => r.overall < 60).length
      },
      topPerformers: reports
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 5)
        .map(r => ({ score: r.overall, grade: r.grade })),
      needsImprovement: reports
        .sort((a, b) => a.overall - b.overall)
        .slice(0, 5)
        .map(r => ({ score: r.overall, grade: r.grade })),
      breakdownAverages: {
        relevance: Math.round(reports.reduce((sum, r) => sum + r.breakdown.relevance, 0) / reports.length),
        credibility: Math.round(reports.reduce((sum, r) => sum + r.breakdown.credibility, 0) / reports.length),
        recency: Math.round(reports.reduce((sum, r) => sum + r.breakdown.recency, 0) / reports.length),
        completeness: Math.round(reports.reduce((sum, r) => sum + r.breakdown.completeness, 0) / reports.length),
        uniqueness: Math.round(reports.reduce((sum, r) => sum + r.breakdown.uniqueness, 0) / reports.length)
      }
    };
    
    console.log(`  ✅ Average score: ${summary.averageScore}/100 (${this.getGrade(summary.averageScore)})`);
    console.log(`  📊 Distribution: A:${summary.gradeDistribution.A || 0}, B:${summary.gradeDistribution.B || 0}, C:${summary.gradeDistribution.C || 0}, D:${summary.gradeDistribution.D || 0}, F:${summary.gradeDistribution.F || 0}`);
    
    return { reports, summary };
  }

  calculateMedian(numbers) {
    if (numbers.length === 0) return 0;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  // ===== TRENDING & ANALYTICS =====
  getTrends(timeframe = 3600000) { // Default 1 hour
    const cutoff = Date.now() - timeframe;
    const recentHistory = this.history.filter(h => 
      new Date(h.timestamp).getTime() > cutoff
    );
    
    if (recentHistory.length === 0) {
      return {
        averageScore: 0,
        trend: 'stable',
        change: 0,
        dataPoints: 0
      };
    }
    
    const averageScore = recentHistory.reduce((sum, h) => sum + h.score, 0) / recentHistory.length;
    
    // Calculer la tendance
    const firstHalf = recentHistory.slice(0, Math.floor(recentHistory.length / 2));
    const secondHalf = recentHistory.slice(Math.floor(recentHistory.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, h) => sum + h.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, h) => sum + h.score, 0) / secondHalf.length;
    
    const change = secondAvg - firstAvg;
    const trend = change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable';
    
    return {
      averageScore: Math.round(averageScore),
      trend,
      change: Math.round(change),
      dataPoints: recentHistory.length,
      timeframe
    };
  }

  // ===== BENCHMARKING =====
  benchmark(sources, benchmarkName = 'default') {
    const report = this.generateQualityReport(sources);
    
    const benchmark = {
      name: benchmarkName,
      timestamp: new Date().toISOString(),
      sources: sources.length,
      averageScore: report.summary.averageScore,
      distribution: report.summary.scoreDistribution,
      breakdown: report.summary.breakdownAverages
    };
    
    this.metrics.set(benchmarkName, benchmark);
    
    console.log(`📊 Benchmark "${benchmarkName}" created: ${benchmark.averageScore}/100`);
    
    return benchmark;
  }

  compareBenchmarks(benchmark1Name, benchmark2Name) {
    const b1 = this.metrics.get(benchmark1Name);
    const b2 = this.metrics.get(benchmark2Name);
    
    if (!b1 || !b2) {
      console.error('❌ One or both benchmarks not found');
      return null;
    }
    
    const comparison = {
      benchmark1: b1.name,
      benchmark2: b2.name,
      scoreDifference: b2.averageScore - b1.averageScore,
      percentageChange: ((b2.averageScore - b1.averageScore) / b1.averageScore) * 100,
      breakdownChanges: {
        relevance: b2.breakdown.relevance - b1.breakdown.relevance,
        credibility: b2.breakdown.credibility - b1.breakdown.credibility,
        recency: b2.breakdown.recency - b1.breakdown.recency,
        completeness: b2.breakdown.completeness - b1.breakdown.completeness,
        uniqueness: b2.breakdown.uniqueness - b1.breakdown.uniqueness
      },
      improvement: b2.averageScore > b1.averageScore
    };
    
    console.log(`📊 Comparison: ${b1.name} (${b1.averageScore}) vs ${b2.name} (${b2.averageScore})`);
    console.log(`  ${comparison.improvement ? '✅' : '❌'} ${comparison.improvement ? 'Improved' : 'Declined'} by ${Math.abs(comparison.percentageChange).toFixed(1)}%`);
    
    return comparison;
  }

  // ===== GESTION DES MÉTRIQUES =====
  getMetrics() {
    return {
      totalScored: this.history.length,
      benchmarks: Array.from(this.metrics.keys()),
      recentTrends: this.getTrends(),
      thresholds: this.thresholds
    };
  }

  clearHistory() {
    this.history = [];
    console.log('🗑️  Quality metrics history cleared');
  }

  clearBenchmarks() {
    this.metrics.clear();
    console.log('🗑️  Quality benchmarks cleared');
  }

  // ===== EXPORT DE RAPPORT =====
  exportReport(sources, format = 'json') {
    const report = this.generateQualityReport(sources);
    
    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }
    
    if (format === 'markdown') {
      return `
# LinkUp Quality Report

## Summary
- **Total Sources**: ${report.summary.totalSources}
- **Average Score**: ${report.summary.averageScore}/100 (${this.getGrade(report.summary.averageScore)})
- **Median Score**: ${report.summary.medianScore}/100

## Grade Distribution
- **A (Excellent)**: ${report.summary.gradeDistribution.A || 0}
- **B (Good)**: ${report.summary.gradeDistribution.B || 0}
- **C (Acceptable)**: ${report.summary.gradeDistribution.C || 0}
- **D (Poor)**: ${report.summary.gradeDistribution.D || 0}
- **F (Failing)**: ${report.summary.gradeDistribution.F || 0}

## Breakdown Averages
- **Relevance**: ${report.summary.breakdownAverages.relevance}/100
- **Credibility**: ${report.summary.breakdownAverages.credibility}/100
- **Recency**: ${report.summary.breakdownAverages.recency}/100
- **Completeness**: ${report.summary.breakdownAverages.completeness}/100
- **Uniqueness**: ${report.summary.breakdownAverages.uniqueness}/100

## Top Performers
${report.summary.topPerformers.map((p, i) => `${i + 1}. Score: ${p.score}/100 (${p.grade})`).join('\n')}

---
*Generated by LinkUp Quality Metrics System*
`;
    }
    
    return report;
  }
}

// ===== EXPORT SINGLETON =====
export const linkUpQualityMetrics = new LinkUpQualityMetrics();

// Export par défaut
export default linkUpQualityMetrics;
