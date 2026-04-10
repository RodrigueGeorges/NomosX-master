/**
 * LinkUp Universal Monitoring Configuration - All Domains
 * 
 * CTO Architecture - Comprehensive Multi-Domain Intelligence
 * OpenClaw Enhanced - 100% Performance Optimized
 */

// ===== CONFIGURATION UNIVERSELLE LINKUP =====
export const LINKUP_UNIVERSAL_CONFIG = {
  enabled: true,
  priority: 'HIGH',
  
  // 🌍 DOMAINES COUVERTS
  domains: {
    // 💰 Finance & Business
    finance: {
      enabled: true,
      priority: 'CRITICAL',
      companies: [
        'Microsoft', 'Apple', 'Google', 'Amazon', 'Meta', 'NVIDIA', 'Tesla',
        'Netflix', 'Adobe', 'Salesforce', 'Oracle', 'IBM', 'Intel', 'AMD',
        'JPMorgan', 'Goldman Sachs', 'Morgan Stanley', 'BlackRock', 'Visa',
        'Mastercard', 'PayPal', 'Square', 'Stripe', 'Coinbase'
      ],
      topics: [
        'earnings reports', 'quarterly results', 'revenue growth',
        'market capitalization', 'stock performance', 'mergers acquisitions',
        'IPO', 'venture capital', 'private equity', 'hedge funds'
      ]
    },
    
    // 🤖 AI & Machine Learning
    ai: {
      enabled: true,
      priority: 'CRITICAL',
      subtopics: [
        'large language models', 'GPT', 'ChatGPT', 'Claude', 'Gemini',
        'computer vision', 'natural language processing', 'deep learning',
        'neural networks', 'transformers', 'reinforcement learning',
        'AI safety', 'AI alignment', 'AI ethics', 'AI regulation',
        'generative AI', 'AI agents', 'multimodal AI', 'AGI',
        'AI infrastructure', 'AI chips', 'AI training', 'AI inference'
      ],
      companies: [
        'OpenAI', 'Anthropic', 'Google DeepMind', 'Meta AI', 'Microsoft AI',
        'Stability AI', 'Midjourney', 'Hugging Face', 'Cohere', 'AI21 Labs'
      ]
    },
    
    // 🔬 Science & Research
    science: {
      enabled: true,
      priority: 'HIGH',
      fields: [
        'quantum computing', 'quantum mechanics', 'particle physics',
        'biotechnology', 'genetic engineering', 'CRISPR', 'gene therapy',
        'neuroscience', 'brain research', 'cognitive science',
        'materials science', 'nanotechnology', 'superconductors',
        'fusion energy', 'nuclear energy', 'renewable energy',
        'space exploration', 'astronomy', 'astrophysics', 'cosmology',
        'climate science', 'environmental science', 'oceanography'
      ]
    },
    
    // 🏥 Healthcare & Medicine
    healthcare: {
      enabled: true,
      priority: 'HIGH',
      topics: [
        'drug discovery', 'clinical trials', 'FDA approvals',
        'cancer research', 'immunotherapy', 'vaccines',
        'precision medicine', 'personalized medicine', 'genomics',
        'medical devices', 'digital health', 'telemedicine',
        'mental health', 'neurodegenerative diseases', 'Alzheimer',
        'diabetes', 'cardiovascular disease', 'infectious diseases',
        'pandemic preparedness', 'public health', 'epidemiology'
      ],
      companies: [
        'Pfizer', 'Moderna', 'Johnson & Johnson', 'Novartis', 'Roche',
        'AstraZeneca', 'GSK', 'Merck', 'Eli Lilly', 'BioNTech'
      ]
    },
    
    // 🔐 Cybersecurity
    cybersecurity: {
      enabled: true,
      priority: 'CRITICAL',
      topics: [
        'zero-day vulnerabilities', 'ransomware', 'malware',
        'data breaches', 'cyber attacks', 'APT groups',
        'security patches', 'CVE', 'threat intelligence',
        'penetration testing', 'red team', 'blue team',
        'encryption', 'cryptography', 'quantum cryptography',
        'identity management', 'zero trust', 'SIEM',
        'cloud security', 'container security', 'API security'
      ]
    },
    
    // 🌐 Geopolitics & International Relations
    geopolitics: {
      enabled: true,
      priority: 'HIGH',
      topics: [
        'international conflicts', 'diplomacy', 'sanctions',
        'trade agreements', 'tariffs', 'supply chain',
        'energy security', 'rare earth minerals', 'semiconductors',
        'military technology', 'defense spending', 'NATO',
        'UN Security Council', 'G7', 'G20', 'BRICS',
        'nuclear proliferation', 'arms control', 'cyber warfare'
      ],
      regions: [
        'United States', 'China', 'Russia', 'European Union',
        'Middle East', 'Asia Pacific', 'Latin America', 'Africa'
      ]
    },
    
    // 🏛️ Policy & Regulation
    policy: {
      enabled: true,
      priority: 'HIGH',
      topics: [
        'AI regulation', 'data privacy', 'GDPR', 'CCPA',
        'antitrust', 'competition policy', 'tech regulation',
        'financial regulation', 'SEC', 'FTC', 'DOJ',
        'environmental policy', 'climate policy', 'carbon tax',
        'healthcare policy', 'drug pricing', 'insurance',
        'labor policy', 'minimum wage', 'unions',
        'immigration policy', 'education policy', 'housing policy'
      ]
    },
    
    // 🌱 Climate & Environment
    climate: {
      enabled: true,
      priority: 'HIGH',
      topics: [
        'climate change', 'global warming', 'carbon emissions',
        'renewable energy', 'solar power', 'wind power',
        'electric vehicles', 'battery technology', 'energy storage',
        'carbon capture', 'carbon sequestration', 'net zero',
        'sustainable agriculture', 'deforestation', 'biodiversity',
        'ocean acidification', 'sea level rise', 'extreme weather',
        'climate adaptation', 'climate mitigation', 'Paris Agreement'
      ]
    },
    
    // 💻 Technology & Innovation
    technology: {
      enabled: true,
      priority: 'HIGH',
      topics: [
        'blockchain', 'cryptocurrency', 'Bitcoin', 'Ethereum',
        'DeFi', 'NFT', 'Web3', 'metaverse',
        'cloud computing', 'edge computing', 'serverless',
        '5G', '6G', 'telecommunications', 'satellite internet',
        'IoT', 'smart cities', 'autonomous vehicles',
        'robotics', 'automation', 'manufacturing',
        'augmented reality', 'virtual reality', 'mixed reality',
        'quantum computing', 'quantum internet'
      ]
    },
    
    // 📊 Economics & Markets
    economics: {
      enabled: true,
      priority: 'HIGH',
      topics: [
        'inflation', 'interest rates', 'Federal Reserve', 'ECB',
        'recession', 'economic growth', 'GDP', 'unemployment',
        'stock market', 'bond market', 'commodities',
        'oil prices', 'gold prices', 'currency exchange',
        'housing market', 'real estate', 'commercial real estate',
        'consumer spending', 'retail sales', 'manufacturing',
        'trade deficit', 'fiscal policy', 'monetary policy'
      ]
    },
    
    // 🎓 Education & Research
    education: {
      enabled: true,
      priority: 'MEDIUM',
      topics: [
        'online learning', 'EdTech', 'MOOCs',
        'university research', 'academic publishing',
        'research funding', 'NSF', 'NIH', 'DARPA',
        'STEM education', 'coding bootcamps',
        'student loans', 'higher education', 'K-12 education'
      ]
    },
    
    // 🏢 Startups & Venture Capital
    startups: {
      enabled: true,
      priority: 'MEDIUM',
      topics: [
        'unicorn startups', 'Series A', 'Series B', 'Series C',
        'venture capital funding', 'angel investors', 'seed funding',
        'startup valuations', 'startup exits', 'acquisitions',
        'Y Combinator', 'Sequoia', 'Andreessen Horowitz',
        'startup trends', 'founder stories', 'pitch decks'
      ]
    },
    
    // 🎮 Gaming & Entertainment
    gaming: {
      enabled: true,
      priority: 'MEDIUM',
      topics: [
        'video games', 'gaming industry', 'esports',
        'game development', 'Unity', 'Unreal Engine',
        'streaming', 'Twitch', 'YouTube Gaming',
        'mobile gaming', 'console gaming', 'PC gaming',
        'VR gaming', 'cloud gaming', 'game streaming'
      ]
    },
    
    // 🚀 Space & Aerospace
    space: {
      enabled: true,
      priority: 'MEDIUM',
      topics: [
        'SpaceX', 'Blue Origin', 'NASA', 'ESA',
        'Mars missions', 'Moon missions', 'ISS',
        'satellite launches', 'Starlink', 'space tourism',
        'asteroid mining', 'space debris', 'space law',
        'rocket technology', 'reusable rockets'
      ]
    },
    
    // 🧬 Biotech & Life Sciences
    biotech: {
      enabled: true,
      priority: 'MEDIUM',
      topics: [
        'synthetic biology', 'bioinformatics', 'proteomics',
        'metabolomics', 'systems biology', 'computational biology',
        'bioengineering', 'tissue engineering', 'organ transplants',
        'stem cells', 'regenerative medicine', 'longevity research',
        'aging research', 'senolytics', 'life extension'
      ]
    }
  },
  
  // ⏰ SCHEDULING INTELLIGENT
  schedule: {
    // Domaines critiques: toutes les 30 minutes
    critical: {
      interval: 30,
      domains: ['finance', 'ai', 'cybersecurity']
    },
    // Domaines haute priorité: toutes les heures
    high: {
      interval: 60,
      domains: ['science', 'healthcare', 'geopolitics', 'policy', 'climate', 'technology', 'economics']
    },
    // Domaines priorité moyenne: toutes les 2 heures
    medium: {
      interval: 120,
      domains: ['education', 'startups', 'gaming', 'space', 'biotech']
    }
  },
  
  // 🎯 QUALITY SETTINGS
  quality: {
    minScore: 70,              // Score minimum global
    minScoreFinance: 85,       // Score plus élevé pour finance
    minScoreCyber: 80,         // Score élevé pour cybersécurité
    maxAge: 48,                // Maximum 48 heures
    maxAgeFinance: 24,         // Maximum 24h pour finance
    maxAgeCyber: 12,           // Maximum 12h pour cybersécurité
    sourcesRequired: 3,
    diversityThreshold: 0.6
  },
  
  // 🚨 ALERTES PAR DOMAINE
  alerts: {
    finance: {
      revenueSurprise: { threshold: 5, enabled: true, priority: 'HIGH' },
      earningsMiss: { threshold: -3, enabled: true, priority: 'CRITICAL' },
      marketCrash: { threshold: -10, enabled: true, priority: 'CRITICAL' }
    },
    cybersecurity: {
      zeroDay: { enabled: true, priority: 'CRITICAL' },
      dataBreach: { enabled: true, priority: 'CRITICAL' },
      ransomware: { enabled: true, priority: 'HIGH' }
    },
    ai: {
      breakthrough: { enabled: true, priority: 'HIGH' },
      regulation: { enabled: true, priority: 'HIGH' },
      safety: { enabled: true, priority: 'CRITICAL' }
    },
    geopolitics: {
      conflict: { enabled: true, priority: 'CRITICAL' },
      sanctions: { enabled: true, priority: 'HIGH' },
      treaty: { enabled: true, priority: 'MEDIUM' }
    },
    climate: {
      extremeWeather: { enabled: true, priority: 'HIGH' },
      policyChange: { enabled: true, priority: 'MEDIUM' },
      breakthrough: { enabled: true, priority: 'HIGH' }
    }
  },
  
  // 🔧 API CONFIGURATION
  api: {
    depth: 'standard',        // 'shallow', 'standard', 'deep'
    outputType: 'searchResults',
    includeImages: false,
    timeout: 30000,
    retryAttempts: 3,
    rateLimit: 100
  }
};

// ===== GÉNÉRATEUR DE REQUÊTES UNIVERSEL =====
export function generateUniversalQueries(domains = null, timeframe = '2026') {
  const queries = [];
  const domainsToProcess = domains || Object.keys(LINKUP_UNIVERSAL_CONFIG.domains);
  
  domainsToProcess.forEach(domainKey => {
    const domain = LINKUP_UNIVERSAL_CONFIG.domains[domainKey];
    if (!domain || !domain.enabled) return;
    
    const priority = domain.priority || 'MEDIUM';
    
    // Finance
    if (domainKey === 'finance') {
      domain.companies?.forEach(company => {
        queries.push({
          query: `${company} financial performance revenue earnings ${timeframe}`,
          domain: 'finance',
          priority,
          company
        });
      });
      domain.topics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} analysis trends`,
          domain: 'finance',
          priority,
          topic
        });
      });
    }
    
    // AI
    else if (domainKey === 'ai') {
      domain.subtopics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} developments research breakthroughs`,
          domain: 'ai',
          priority,
          topic
        });
      });
      domain.companies?.forEach(company => {
        queries.push({
          query: `${company} AI models releases ${timeframe}`,
          domain: 'ai',
          priority,
          company
        });
      });
    }
    
    // Science
    else if (domainKey === 'science') {
      domain.fields?.forEach(field => {
        queries.push({
          query: `${field} ${timeframe} research breakthrough discovery`,
          domain: 'science',
          priority,
          field
        });
      });
    }
    
    // Healthcare
    else if (domainKey === 'healthcare') {
      domain.topics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} clinical trials FDA approval`,
          domain: 'healthcare',
          priority,
          topic
        });
      });
      domain.companies?.forEach(company => {
        queries.push({
          query: `${company} drug development pipeline ${timeframe}`,
          domain: 'healthcare',
          priority,
          company
        });
      });
    }
    
    // Cybersecurity
    else if (domainKey === 'cybersecurity') {
      domain.topics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} security threat vulnerability`,
          domain: 'cybersecurity',
          priority,
          topic
        });
      });
    }
    
    // Geopolitics
    else if (domainKey === 'geopolitics') {
      domain.topics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} international relations`,
          domain: 'geopolitics',
          priority,
          topic
        });
      });
      domain.regions?.forEach(region => {
        queries.push({
          query: `${region} geopolitical developments ${timeframe}`,
          domain: 'geopolitics',
          priority,
          region
        });
      });
    }
    
    // Policy
    else if (domainKey === 'policy') {
      domain.topics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} legislation regulation policy`,
          domain: 'policy',
          priority,
          topic
        });
      });
    }
    
    // Climate
    else if (domainKey === 'climate') {
      domain.topics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} climate change environmental`,
          domain: 'climate',
          priority,
          topic
        });
      });
    }
    
    // Technology
    else if (domainKey === 'technology') {
      domain.topics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} technology innovation trends`,
          domain: 'technology',
          priority,
          topic
        });
      });
    }
    
    // Economics
    else if (domainKey === 'economics') {
      domain.topics?.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} economic analysis forecast`,
          domain: 'economics',
          priority,
          topic
        });
      });
    }
    
    // Autres domaines (générique)
    else {
      const topics = domain.topics || domain.subtopics || domain.fields || [];
      topics.forEach(topic => {
        queries.push({
          query: `${topic} ${timeframe} latest developments`,
          domain: domainKey,
          priority,
          topic
        });
      });
    }
  });
  
  return queries;
}

// ===== FILTRAGE PAR DOMAINE =====
export function filterQueriesByDomain(queries, domains) {
  if (!domains || domains.length === 0) return queries;
  return queries.filter(q => domains.includes(q.domain));
}

// ===== FILTRAGE PAR PRIORITÉ =====
export function filterQueriesByPriority(queries, minPriority = 'MEDIUM') {
  const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const minLevel = priorityOrder[minPriority] || 2;
  
  return queries.filter(q => {
    const level = priorityOrder[q.priority] || 2;
    return level >= minLevel;
  });
}

// ===== SCORING ADAPTATIF PAR DOMAINE =====
export function scoreDomainSource(source, domain) {
  const config = LINKUP_UNIVERSAL_CONFIG.quality;
  let minScore = config.minScore;
  
  // Ajuster le score minimum selon le domaine
  if (domain === 'finance') minScore = config.minScoreFinance;
  else if (domain === 'cybersecurity') minScore = config.minScoreCyber;
  
  // Scoring de base
  let score = 50;
  const url = (source.url || '').toLowerCase();
  const content = (source.content || '').toLowerCase();
  
  // Bonus selon le domaine
  if (domain === 'finance') {
    if (url.includes('sec.gov') || url.includes('investor')) score += 30;
    if (content.includes('revenue') || content.includes('earnings')) score += 10;
  } else if (domain === 'cybersecurity') {
    if (url.includes('cisa.gov') || url.includes('cert')) score += 30;
    if (content.includes('cve-') || content.includes('vulnerability')) score += 10;
  } else if (domain === 'ai') {
    if (url.includes('arxiv') || url.includes('openai') || url.includes('anthropic')) score += 20;
    if (content.includes('model') || content.includes('training')) score += 10;
  } else if (domain === 'science') {
    if (url.includes('.edu') || url.includes('nature') || url.includes('science')) score += 25;
    if (content.includes('research') || content.includes('study')) score += 10;
  }
  
  // Récence
  const ageHours = (Date.now() - new Date(source.publishedAt || Date.now())) / (1000 * 60 * 60);
  let maxAge = config.maxAge;
  if (domain === 'finance') maxAge = config.maxAgeFinance;
  else if (domain === 'cybersecurity') maxAge = config.maxAgeCyber;
  
  if (ageHours < maxAge / 4) score += 20;
  else if (ageHours < maxAge / 2) score += 10;
  else if (ageHours > maxAge) score -= 20;
  
  return { score: Math.min(Math.max(score, 0), 100), meetsThreshold: score >= minScore };
}

// ===== DÉTECTION D'ALERTES PAR DOMAINE =====
export function detectDomainAlerts(source, domain) {
  const alerts = [];
  const content = (source.content || '').toLowerCase();
  const title = (source.title || '').toLowerCase();
  const alertConfig = LINKUP_UNIVERSAL_CONFIG.alerts[domain];
  
  if (!alertConfig) return alerts;
  
  // Alertes Finance
  if (domain === 'finance') {
    if (alertConfig.revenueSurprise?.enabled) {
      const match = content.match(/revenue.*?(\d+)%/i);
      if (match && Math.abs(parseFloat(match[1])) >= alertConfig.revenueSurprise.threshold) {
        alerts.push({
          type: 'revenueSurprise',
          severity: alertConfig.revenueSurprise.priority,
          message: `Revenue surprise: ${match[1]}%`,
          domain
        });
      }
    }
  }
  
  // Alertes Cybersecurity
  else if (domain === 'cybersecurity') {
    if (alertConfig.zeroDay?.enabled && (content.includes('zero-day') || content.includes('0-day'))) {
      alerts.push({
        type: 'zeroDay',
        severity: alertConfig.zeroDay.priority,
        message: 'Zero-day vulnerability detected',
        domain
      });
    }
    if (alertConfig.dataBreach?.enabled && content.includes('data breach')) {
      alerts.push({
        type: 'dataBreach',
        severity: alertConfig.dataBreach.priority,
        message: 'Data breach reported',
        domain
      });
    }
  }
  
  // Alertes AI
  else if (domain === 'ai') {
    if (alertConfig.breakthrough?.enabled && (content.includes('breakthrough') || content.includes('milestone'))) {
      alerts.push({
        type: 'breakthrough',
        severity: alertConfig.breakthrough.priority,
        message: 'AI breakthrough detected',
        domain
      });
    }
    if (alertConfig.safety?.enabled && (content.includes('ai safety') || content.includes('alignment'))) {
      alerts.push({
        type: 'safety',
        severity: alertConfig.safety.priority,
        message: 'AI safety concern',
        domain
      });
    }
  }
  
  // Alertes Geopolitics
  else if (domain === 'geopolitics') {
    if (alertConfig.conflict?.enabled && (content.includes('conflict') || content.includes('war') || content.includes('military'))) {
      alerts.push({
        type: 'conflict',
        severity: alertConfig.conflict.priority,
        message: 'Geopolitical conflict detected',
        domain
      });
    }
  }
  
  // Alertes Climate
  else if (domain === 'climate') {
    if (alertConfig.extremeWeather?.enabled && (content.includes('extreme weather') || content.includes('hurricane') || content.includes('flood'))) {
      alerts.push({
        type: 'extremeWeather',
        severity: alertConfig.extremeWeather.priority,
        message: 'Extreme weather event',
        domain
      });
    }
  }
  
  return alerts;
}

// ===== STATISTIQUES PAR DOMAINE =====
export function getDomainStatistics() {
  const stats = {
    totalDomains: Object.keys(LINKUP_UNIVERSAL_CONFIG.domains).length,
    enabledDomains: Object.values(LINKUP_UNIVERSAL_CONFIG.domains).filter(d => d.enabled).length,
    criticalDomains: LINKUP_UNIVERSAL_CONFIG.schedule.critical.domains.length,
    highPriorityDomains: LINKUP_UNIVERSAL_CONFIG.schedule.high.domains.length,
    mediumPriorityDomains: LINKUP_UNIVERSAL_CONFIG.schedule.medium.domains.length,
    estimatedQueriesPerDay: 0
  };
  
  // Calculer le nombre estimé de requêtes par jour
  const criticalQueries = LINKUP_UNIVERSAL_CONFIG.schedule.critical.domains.length * (24 * 60 / 30);
  const highQueries = LINKUP_UNIVERSAL_CONFIG.schedule.high.domains.length * (24 * 60 / 60);
  const mediumQueries = LINKUP_UNIVERSAL_CONFIG.schedule.medium.domains.length * (24 * 60 / 120);
  
  stats.estimatedQueriesPerDay = Math.round(criticalQueries + highQueries + mediumQueries);
  
  return stats;
}

// ===== EXPORT PAR DÉFAUT =====
export default {
  config: LINKUP_UNIVERSAL_CONFIG,
  generateQueries: generateUniversalQueries,
  filterByDomain: filterQueriesByDomain,
  filterByPriority: filterQueriesByPriority,
  scoreSource: scoreDomainSource,
  detectAlerts: detectDomainAlerts,
  getStatistics: getDomainStatistics
};
