/**
 * OpenClaw Integration Validator - Design, UX & Provider Audit
 * 
 * CTO Architecture - Comprehensive Integration Quality Check
 * OpenClaw Enhanced - 100% Validation
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

class OpenClawIntegrationValidator {
  constructor() {
    this.projectRoot = process.cwd();
    this.results = {
      design: { score: 0, issues: [], strengths: [] },
      ux: { score: 0, issues: [], strengths: [] },
      providers: { score: 0, issues: [], strengths: [] },
      architecture: { score: 0, issues: [], strengths: [] },
      integration: { score: 0, issues: [], strengths: [] }
    };
  }

  async validateAll() {
    console.log('🔍 OpenClaw Integration Validator - Starting Analysis\n');

    await this.validateDesignSystem();
    await this.validateUXConsistency();
    await this.validateProviderIntegration();
    await this.validateArchitecture();
    await this.validateLinkUpIntegration();

    return this.generateReport();
  }

  // ===== DESIGN SYSTEM VALIDATION =====
  async validateDesignSystem() {
    console.log('🎨 Validating Design System...');
    
    const designFiles = [
      'app/globals.css',
      'tailwind.config.ts',
      'components/ui',
      'app/layout.tsx'
    ];

    let score = 100;
    const issues = [];
    const strengths = [];

    // Vérifier Tailwind
    const tailwindPath = join(this.projectRoot, 'tailwind.config.ts');
    if (existsSync(tailwindPath)) {
      const content = readFileSync(tailwindPath, 'utf-8');
      
      if (content.includes('theme')) {
        strengths.push('Tailwind theme configuration présente');
      }
      
      if (content.includes('darkMode')) {
        strengths.push('Dark mode configuré');
      } else {
        issues.push('Dark mode non configuré dans Tailwind');
        score -= 5;
      }

      if (content.includes('animation')) {
        strengths.push('Animations personnalisées configurées');
      }
    } else {
      issues.push('CRITICAL: tailwind.config.ts manquant');
      score -= 20;
    }

    // Vérifier globals.css
    const globalsPath = join(this.projectRoot, 'app/globals.css');
    if (existsSync(globalsPath)) {
      const content = readFileSync(globalsPath, 'utf-8');
      
      if (content.includes('@tailwind')) {
        strengths.push('Tailwind directives correctement importées');
      }
      
      if (content.includes(':root')) {
        strengths.push('Variables CSS root définies');
      }
      
      if (content.includes('dark:')) {
        strengths.push('Styles dark mode présents');
      }
    } else {
      issues.push('CRITICAL: globals.css manquant');
      score -= 20;
    }

    // Vérifier composants UI
    const uiPath = join(this.projectRoot, 'components/ui');
    if (existsSync(uiPath)) {
      const uiComponents = readdirSync(uiPath).filter(f => f.endsWith('.tsx'));
      
      if (uiComponents.length > 10) {
        strengths.push(`${uiComponents.length} composants UI disponibles`);
      } else if (uiComponents.length > 5) {
        strengths.push(`${uiComponents.length} composants UI de base`);
      } else {
        issues.push(`Peu de composants UI (${uiComponents.length})`);
        score -= 10;
      }

      // Vérifier les composants essentiels
      const essentialComponents = ['button', 'card', 'input', 'dialog', 'badge'];
      essentialComponents.forEach(comp => {
        const exists = uiComponents.some(f => f.toLowerCase().includes(comp));
        if (exists) {
          strengths.push(`Composant ${comp} présent`);
        } else {
          issues.push(`Composant ${comp} manquant`);
          score -= 3;
        }
      });
    } else {
      issues.push('CRITICAL: Dossier components/ui manquant');
      score -= 25;
    }

    this.results.design = { score: Math.max(0, score), issues, strengths };
    console.log(`  Score Design: ${this.results.design.score}/100\n`);
  }

  // ===== UX CONSISTENCY VALIDATION =====
  async validateUXConsistency() {
    console.log('🎯 Validating UX Consistency...');
    
    let score = 100;
    const issues = [];
    const strengths = [];

    // Vérifier la structure de navigation
    const layoutPath = join(this.projectRoot, 'app/layout.tsx');
    if (existsSync(layoutPath)) {
      const content = readFileSync(layoutPath, 'utf-8');
      
      if (content.includes('Navbar') || content.includes('Header')) {
        strengths.push('Navigation globale présente');
      } else {
        issues.push('Pas de navigation globale détectée');
        score -= 10;
      }

      if (content.includes('Footer')) {
        strengths.push('Footer global présent');
      }

      if (content.includes('metadata')) {
        strengths.push('Metadata SEO configurées');
      } else {
        issues.push('Metadata SEO manquantes');
        score -= 5;
      }
    }

    // Vérifier les pages principales
    const appPath = join(this.projectRoot, 'app');
    const mainPages = ['page.tsx', 'about', 'contact', 'dashboard'];
    
    mainPages.forEach(page => {
      const pagePath = join(appPath, page);
      if (existsSync(pagePath)) {
        strengths.push(`Page ${page} existe`);
      }
    });

    // Vérifier la cohérence des routes API
    const apiPath = join(this.projectRoot, 'app/api');
    if (existsSync(apiPath)) {
      const apiRoutes = this.findDirectories(apiPath);
      
      if (apiRoutes.length > 5) {
        strengths.push(`${apiRoutes.length} routes API disponibles`);
      } else if (apiRoutes.length > 0) {
        strengths.push(`${apiRoutes.length} routes API de base`);
      } else {
        issues.push('Aucune route API trouvée');
        score -= 15;
      }

      // Vérifier les routes essentielles
      const essentialRoutes = ['search', 'analysis', 'sources'];
      essentialRoutes.forEach(route => {
        const exists = apiRoutes.some(r => r.includes(route));
        if (exists) {
          strengths.push(`Route API ${route} présente`);
        } else {
          issues.push(`Route API ${route} manquante`);
          score -= 5;
        }
      });
    } else {
      issues.push('CRITICAL: Dossier app/api manquant');
      score -= 30;
    }

    // Vérifier les composants de feedback utilisateur
    const componentsPath = join(this.projectRoot, 'components');
    if (existsSync(componentsPath)) {
      const allComponents = this.findFiles(componentsPath, '.tsx');
      const componentNames = allComponents.map(f => f.toLowerCase());

      const feedbackComponents = ['loading', 'error', 'toast', 'alert', 'skeleton'];
      feedbackComponents.forEach(comp => {
        const exists = componentNames.some(name => name.includes(comp));
        if (exists) {
          strengths.push(`Composant feedback ${comp} présent`);
        } else {
          issues.push(`Composant feedback ${comp} manquant`);
          score -= 3;
        }
      });
    }

    this.results.ux = { score: Math.max(0, score), issues, strengths };
    console.log(`  Score UX: ${this.results.ux.score}/100\n`);
  }

  // ===== PROVIDER INTEGRATION VALIDATION =====
  async validateProviderIntegration() {
    console.log('🔌 Validating Provider Integration...');
    
    let score = 100;
    const issues = [];
    const strengths = [];

    // Vérifier monitoring-agent.ts
    const monitoringPath = join(this.projectRoot, 'lib/agent/monitoring-agent.ts');
    if (!existsSync(monitoringPath)) {
      issues.push('CRITICAL: monitoring-agent.ts manquant');
      score -= 50;
    } else {
      const content = readFileSync(monitoringPath, 'utf-8');
      
      // Compter les providers
      const providerMatches = content.match(/'[a-z-]+'\s*:/g) || [];
      const providerCount = providerMatches.length;
      
      if (providerCount > 50) {
        strengths.push(`${providerCount} providers intégrés - EXCELLENT`);
      } else if (providerCount > 30) {
        strengths.push(`${providerCount} providers intégrés - BON`);
      } else if (providerCount > 10) {
        strengths.push(`${providerCount} providers intégrés - CORRECT`);
        score -= 10;
      } else {
        issues.push(`Seulement ${providerCount} providers - INSUFFISANT`);
        score -= 30;
      }

      // Vérifier LinkUp
      if (content.includes('linkup')) {
        strengths.push('LinkUp intégré dans monitoring');
        
        if (content.includes('linkup-financial')) {
          strengths.push('LinkUp financial provider présent');
        }
        
        if (content.includes('linkup-complement')) {
          strengths.push('LinkUp complementary provider présent');
        }
      } else {
        issues.push('LinkUp NON intégré dans monitoring');
        score -= 20;
      }

      // Vérifier les catégories de providers
      const categories = [
        { name: 'Academic', keywords: ['crossref', 'openalex', 'arxiv', 'pubmed'] },
        { name: 'Institutional', keywords: ['worldbank', 'imf', 'oecd', 'un'] },
        { name: 'Intelligence', keywords: ['odni', 'cia', 'nsa', 'nato'] },
        { name: 'Business', keywords: ['techcrunch', 'crunchbase', 'reuters'] },
        { name: 'Think Tanks', keywords: ['brookings', 'rand', 'cset'] }
      ];

      categories.forEach(cat => {
        const hasCategory = cat.keywords.some(kw => content.includes(kw));
        if (hasCategory) {
          strengths.push(`Catégorie ${cat.name} couverte`);
        } else {
          issues.push(`Catégorie ${cat.name} manquante`);
          score -= 5;
        }
      });
    }

    // Vérifier la structure des providers
    const providersPath = join(this.projectRoot, 'lib/providers');
    if (existsSync(providersPath)) {
      const providerFiles = readdirSync(providersPath);
      const providerCount = providerFiles.filter(f => 
        f.endsWith('.ts') || f.endsWith('.mjs') || f.endsWith('.js')
      ).length;
      
      strengths.push(`${providerCount} fichiers providers dans lib/providers`);

      // Vérifier les sous-dossiers
      const subdirs = ['academic', 'institutional', 'business', 'data', 'patents'];
      subdirs.forEach(dir => {
        const dirPath = join(providersPath, dir);
        if (existsSync(dirPath)) {
          const files = readdirSync(dirPath).filter(f => 
            f.endsWith('.ts') || f.endsWith('.mjs')
          );
          strengths.push(`${dir}: ${files.length} providers`);
        }
      });
    } else {
      issues.push('CRITICAL: Dossier lib/providers manquant');
      score -= 40;
    }

    this.results.providers = { score: Math.max(0, score), issues, strengths };
    console.log(`  Score Providers: ${this.results.providers.score}/100\n`);
  }

  // ===== ARCHITECTURE VALIDATION =====
  async validateArchitecture() {
    console.log('🏗️  Validating Architecture...');
    
    let score = 100;
    const issues = [];
    const strengths = [];

    // Vérifier la structure des dossiers
    const requiredDirs = [
      { path: 'app', critical: true },
      { path: 'components', critical: true },
      { path: 'lib', critical: true },
      { path: 'lib/agent', critical: true },
      { path: 'lib/providers', critical: true },
      { path: 'lib/config', critical: false },
      { path: 'lib/metrics', critical: false },
      { path: 'prisma', critical: true },
      { path: 'public', critical: false }
    ];

    requiredDirs.forEach(({ path, critical }) => {
      const fullPath = join(this.projectRoot, path);
      if (existsSync(fullPath)) {
        strengths.push(`✓ ${path}`);
      } else {
        const msg = `${path} manquant`;
        if (critical) {
          issues.push(`CRITICAL: ${msg}`);
          score -= 15;
        } else {
          issues.push(msg);
          score -= 5;
        }
      }
    });

    // Vérifier la séparation des responsabilités
    const libPath = join(this.projectRoot, 'lib');
    if (existsSync(libPath)) {
      const libDirs = readdirSync(libPath).filter(f => 
        statSync(join(libPath, f)).isDirectory()
      );
      
      if (libDirs.length > 5) {
        strengths.push(`Architecture modulaire: ${libDirs.length} modules`);
      } else {
        issues.push('Architecture peu modulaire');
        score -= 10;
      }
    }

    // Vérifier les fichiers de configuration
    const configFiles = [
      'package.json',
      'tsconfig.json',
      'next.config.cjs',
      '.env',
      'prisma/schema.prisma'
    ];

    configFiles.forEach(file => {
      if (existsSync(join(this.projectRoot, file))) {
        strengths.push(`✓ ${file}`);
      } else {
        issues.push(`${file} manquant`);
        score -= 5;
      }
    });

    this.results.architecture = { score: Math.max(0, score), issues, strengths };
    console.log(`  Score Architecture: ${this.results.architecture.score}/100\n`);
  }

  // ===== LINKUP INTEGRATION VALIDATION =====
  async validateLinkUpIntegration() {
    console.log('🚀 Validating LinkUp Integration...');
    
    let score = 100;
    const issues = [];
    const strengths = [];

    // Vérifier les fichiers LinkUp
    const linkupFiles = [
      { path: 'lib/providers/linkup-registry.mjs', critical: true },
      { path: 'lib/providers/linkup-complementary.mjs', critical: true },
      { path: 'lib/metrics/linkup-quality.mjs', critical: true },
      { path: 'lib/config/linkup-financial-monitoring.mjs', critical: false },
      { path: 'lib/config/linkup-universal-monitoring.mjs', critical: false }
    ];

    linkupFiles.forEach(({ path, critical }) => {
      const fullPath = join(this.projectRoot, path);
      if (existsSync(fullPath)) {
        strengths.push(`✓ ${path}`);
        
        // Analyser le contenu
        const content = readFileSync(fullPath, 'utf-8');
        
        // Vérifier la sécurité
        if (content.includes('process.env.LINKUP_API_KEY')) {
          strengths.push(`  → Clé API sécurisée`);
        } else if (content.includes('800bf484')) {
          issues.push(`  → Clé API hardcodée dans ${path}`);
          score -= 10;
        }
        
        // Vérifier les exports
        if (content.includes('export')) {
          strengths.push(`  → Exports présents`);
        }
      } else {
        const msg = `${path} manquant`;
        if (critical) {
          issues.push(`CRITICAL: ${msg}`);
          score -= 20;
        } else {
          issues.push(msg);
          score -= 5;
        }
      }
    });

    // Vérifier l'intégration dans monitoring-agent
    const monitoringPath = join(this.projectRoot, 'lib/agent/monitoring-agent.ts');
    if (existsSync(monitoringPath)) {
      const content = readFileSync(monitoringPath, 'utf-8');
      
      const linkupProviders = ['linkup', 'linkup-financial', 'linkup-complement'];
      linkupProviders.forEach(provider => {
        if (content.includes(`'${provider}':`)) {
          strengths.push(`Provider ${provider} intégré`);
        } else {
          issues.push(`Provider ${provider} NON intégré`);
          score -= 10;
        }
      });

      if (content.includes('LINKUP_INTELLIGENT_MONITORING') || 
          content.includes('LINKUP_UNIVERSAL_CONFIG')) {
        strengths.push('Configuration LinkUp exportée');
      } else {
        issues.push('Configuration LinkUp non exportée');
        score -= 5;
      }
    }

    // Vérifier la variable d'environnement
    const envPath = join(this.projectRoot, '.env');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      if (content.includes('LINKUP_API_KEY')) {
        strengths.push('LINKUP_API_KEY définie dans .env');
      } else {
        issues.push('LINKUP_API_KEY manquante dans .env');
        score -= 15;
      }
    }

    this.results.integration = { score: Math.max(0, score), issues, strengths };
    console.log(`  Score Integration: ${this.results.integration.score}/100\n`);
  }

  // ===== UTILITIES =====
  findFiles(dir, ext, fileList = []) {
    if (!existsSync(dir)) return fileList;

    const files = readdirSync(dir);
    files.forEach(file => {
      const filePath = join(dir, file);
      const stat = statSync(filePath);

      if (stat.isDirectory()) {
        if (!['node_modules', '.next', '.git'].includes(file)) {
          this.findFiles(filePath, ext, fileList);
        }
      } else if (file.endsWith(ext)) {
        fileList.push(filePath);
      }
    });

    return fileList;
  }

  findDirectories(dir) {
    if (!existsSync(dir)) return [];
    
    return readdirSync(dir).filter(f => {
      const fullPath = join(dir, f);
      return statSync(fullPath).isDirectory();
    });
  }

  // ===== GENERATE REPORT =====
  generateReport() {
    const overallScore = Math.round(
      (this.results.design.score * 0.20) +
      (this.results.ux.score * 0.20) +
      (this.results.providers.score * 0.25) +
      (this.results.architecture.score * 0.20) +
      (this.results.integration.score * 0.15)
    );

    const grade = overallScore >= 90 ? 'A' : 
                  overallScore >= 80 ? 'B' : 
                  overallScore >= 70 ? 'C' : 
                  overallScore >= 60 ? 'D' : 'F';

    const status = overallScore >= 85 ? 'EXCELLENT' :
                   overallScore >= 70 ? 'GOOD' :
                   overallScore >= 50 ? 'NEEDS_IMPROVEMENT' : 'CRITICAL';

    return {
      overallScore,
      grade,
      status,
      categories: this.results,
      summary: {
        totalIssues: Object.values(this.results).reduce((sum, cat) => sum + cat.issues.length, 0),
        totalStrengths: Object.values(this.results).reduce((sum, cat) => sum + cat.strengths.length, 0),
        criticalIssues: Object.values(this.results).reduce((sum, cat) => 
          sum + cat.issues.filter(i => i.includes('CRITICAL')).length, 0
        )
      }
    };
  }
}

// ===== EXECUTION =====
async function runValidation() {
  console.log('🔍 OpenClaw Integration Validator');
  console.log('==================================\n');

  const validator = new OpenClawIntegrationValidator();
  
  try {
    const report = await validator.validateAll();

    console.log('\n📊 OVERALL RESULTS');
    console.log('==================');
    console.log(`Score: ${report.overallScore}/100 (${report.grade})`);
    console.log(`Status: ${report.status}`);
    console.log(`Issues: ${report.summary.totalIssues} (${report.summary.criticalIssues} critical)`);
    console.log(`Strengths: ${report.summary.totalStrengths}\n`);

    console.log('📋 CATEGORY SCORES');
    console.log('==================');
    console.log(`🎨 Design System: ${report.categories.design.score}/100`);
    console.log(`🎯 UX Consistency: ${report.categories.ux.score}/100`);
    console.log(`🔌 Providers: ${report.categories.providers.score}/100`);
    console.log(`🏗️  Architecture: ${report.categories.architecture.score}/100`);
    console.log(`🚀 LinkUp Integration: ${report.categories.integration.score}/100\n`);

    // Afficher les issues critiques
    Object.entries(report.categories).forEach(([category, data]) => {
      const criticalIssues = data.issues.filter(i => i.includes('CRITICAL'));
      if (criticalIssues.length > 0) {
        console.log(`\n🔴 CRITICAL ISSUES - ${category.toUpperCase()}`);
        criticalIssues.forEach(issue => console.log(`  - ${issue}`));
      }
    });

    // Sauvegarder le rapport
    const fs = await import('fs');
    fs.writeFileSync(
      'OPENCLAW_INTEGRATION_VALIDATION_REPORT.json',
      JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Validation complete! Report saved to OPENCLAW_INTEGRATION_VALIDATION_REPORT.json');

    return report;

  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

runValidation();
