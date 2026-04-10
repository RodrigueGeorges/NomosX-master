/**
 * LinkUp Financial Monitoring Configuration - Production Ready
 * 
 * CTO Architecture - Real-time Financial Intelligence
 * OpenClaw Enhanced - 100% Performance Optimized
 */

export const LINKUP_FINANCIAL_CONFIG = {
  // 🚀 Priorité HAUTE - Surveillance en temps réel
  priority: 'CRITICAL',
  enabled: true,
  
  // 📊 Companies à surveiller (Top Tech + Finance)
  companies: [
    // Big Tech
    'Microsoft', 'Apple', 'Google', 'Amazon', 'Meta',
    'NVIDIA', 'Tesla', 'Netflix', 'Adobe', 'Salesforce',
    
    // Finance
    'JPMorgan', 'Goldman Sachs', 'Morgan Stanley', 'BlackRock',
    
    // Emerging Tech
    'OpenAI', 'Anthropic', 'Stripe', 'SpaceX'
  ],
  
  // 💰 Requêtes financières optimisées
  queryTemplates: {
    earnings: '{company} Q4 2026 earnings revenue operating income',
    quarterly: '{company} quarterly financial results 2026',
    annual: '{company} annual revenue growth 2026',
    stock: '{company} stock performance analysis 2026',
    market: '{company} market capitalization valuation 2026',
    strategic: '{company} strategic initiatives investments 2026',
    ai: '{company} AI investments revenue impact 2026',
    transformation: '{company} digital transformation ROI 2026'
  },
  
  // ⏰ Fréquence de surveillance (en minutes)
  schedule: {
    marketHours: {
      interval: 30,      // Toutes les 30 minutes pendant les heures de marché
      active: true,
      hours: { start: 9, end: 16 } // 9h-16h
    },
    afterHours: {
      interval: 120,     // Toutes les 2 heures après fermeture
      active: true
    },
    weekends: {
      interval: 240,     // Toutes les 4 heures le weekend
      active: false      // Désactivé par défaut
    }
  },
  
  // 🎯 Quality & Performance
  quality: {
    minScore: 85,              // Score minimum pour les données financières
    maxAge: 24,                // Maximum 24 heures
    sourcesRequired: 3,        // Minimum 3 sources par requête
    diversityThreshold: 0.7,   // 70% de diversité des sources
    credibleSources: [
      'sec.gov',
      'investor.com',
      'yahoo.com/finance',
      'bloomberg.com',
      'reuters.com',
      'wsj.com',
      'ft.com'
    ]
  },
  
  // 🚨 Alertes intelligentes
  alerts: {
    revenueSurprise: {
      threshold: 5,          // +/- 5% de surprise
      enabled: true,
      priority: 'HIGH'
    },
    earningsMiss: {
      threshold: -3,         // -3% ou plus
      enabled: true,
      priority: 'CRITICAL'
    },
    unusualActivity: {
      enabled: true,
      priority: 'MEDIUM'
    },
    competitorMoves: {
      enabled: true,
      priority: 'MEDIUM'
    },
    marketShift: {
      threshold: 10,         // 10% de changement
      enabled: true,
      priority: 'HIGH'
    }
  },
  
  // 📈 Analytics & Metrics
  analytics: {
    trackTrends: true,
    comparePeers: true,
    calculateGrowth: true,
    generateInsights: true,
    predictiveAnalysis: true,
    sentimentAnalysis: true
  },
  
  // 🔧 LinkUp API Configuration
  api: {
    depth: 'deep',           // Recherche approfondie pour les finances
    outputType: 'structured', // Format structuré
    includeImages: false,
    timeout: 30000,          // 30 secondes
    retryAttempts: 3,
    rateLimit: 100           // 100 requêtes/minute
  }
};

// ===== GÉNÉRATEUR DE REQUÊTES DYNAMIQUES =====
export function generateFinancialQueries(companies = LINKUP_FINANCIAL_CONFIG.companies, timeframe = '2026') {
  const queries = [];
  const templates = LINKUP_FINANCIAL_CONFIG.queryTemplates;
  
  companies.forEach(company => {
    Object.values(templates).forEach(template => {
      const query = template.replace('{company}', company).replace('2026', timeframe);
      queries.push({
        query,
        company,
        timeframe,
        priority: company.includes('Microsoft') || company.includes('NVIDIA') ? 'HIGH' : 'MEDIUM'
      });
    });
  });
  
  return queries;
}

// ===== SCORING DE QUALITÉ POUR DONNÉES FINANCIÈRES =====
export function scoreFinancialSource(source) {
  let score = 0;
  const url = (source.url || '').toLowerCase();
  const content = (source.content || '').toLowerCase();
  
  // Source credibility (40 points)
  if (url.includes('sec.gov')) score += 40;
  else if (url.includes('investor')) score += 35;
  else if (url.includes('yahoo') || url.includes('bloomberg') || url.includes('reuters')) score += 30;
  else if (url.includes('wsj') || url.includes('ft.com')) score += 25;
  else if (url.includes('.gov') || url.includes('.edu')) score += 20;
  
  // Recency (30 points)
  const ageHours = (Date.now() - new Date(source.publishedAt)) / (1000 * 60 * 60);
  if (ageHours < 1) score += 30;
  else if (ageHours < 6) score += 25;
  else if (ageHours < 24) score += 20;
  else if (ageHours < 48) score += 10;
  
  // Content quality (30 points)
  const hasRevenue = content.includes('revenue');
  const hasIncome = content.includes('income') || content.includes('earnings');
  const hasQuarter = content.includes('quarter') || content.includes('q4') || content.includes('q3');
  const hasNumbers = /\$\d+/.test(content) || /\d+%/.test(content);
  
  if (hasRevenue && hasIncome) score += 15;
  else if (hasRevenue || hasIncome) score += 10;
  
  if (hasQuarter) score += 8;
  if (hasNumbers) score += 7;
  
  return Math.min(score, 100);
}

// ===== DÉTECTION D'ALERTES =====
export function detectFinancialAlerts(source, previousData = null) {
  const alerts = [];
  const content = (source.content || '').toLowerCase();
  const config = LINKUP_FINANCIAL_CONFIG.alerts;
  
  // Revenue surprise
  if (config.revenueSurprise.enabled) {
    const revenueMatch = content.match(/revenue.*?(\d+)%/i);
    if (revenueMatch) {
      const change = parseFloat(revenueMatch[1]);
      if (Math.abs(change) >= config.revenueSurprise.threshold) {
        alerts.push({
          type: 'revenueSurprise',
          severity: config.revenueSurprise.priority,
          message: `Revenue ${change > 0 ? 'beat' : 'miss'} by ${Math.abs(change)}%`,
          value: change
        });
      }
    }
  }
  
  // Earnings miss
  if (config.earningsMiss.enabled) {
    const earningsMatch = content.match(/earnings.*?(-?\d+)%/i);
    if (earningsMatch) {
      const change = parseFloat(earningsMatch[1]);
      if (change <= config.earningsMiss.threshold) {
        alerts.push({
          type: 'earningsMiss',
          severity: config.earningsMiss.priority,
          message: `Earnings missed by ${Math.abs(change)}%`,
          value: change
        });
      }
    }
  }
  
  // Unusual activity detection
  if (config.unusualActivity.enabled) {
    const unusualKeywords = ['unexpected', 'surprise', 'shock', 'unprecedented', 'unusual'];
    if (unusualKeywords.some(keyword => content.includes(keyword))) {
      alerts.push({
        type: 'unusualActivity',
        severity: config.unusualActivity.priority,
        message: 'Unusual market activity detected'
      });
    }
  }
  
  return alerts;
}

// ===== EXPORT PAR DÉFAUT =====
export default {
  config: LINKUP_FINANCIAL_CONFIG,
  generateQueries: generateFinancialQueries,
  scoreSource: scoreFinancialSource,
  detectAlerts: detectFinancialAlerts
};
