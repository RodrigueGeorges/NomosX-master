#!/usr/bin/env node
/**
 * 🔍 OpenClaw Analysis - Diagnostic "exports is not defined in ES module scope"
 * 
 * Analyse ultra-précise pour identifier la root cause exacte
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

console.log('\n' + '='.repeat(80));
log('🔍 OpenClaw Analysis - Diagnostic "exports is not defined"', 'bright');
console.log('='.repeat(80) + '\n');

const findings = {
  criticalIssues: [],
  suspiciousFiles: [],
  moduleConflicts: [],
  recommendations: []
};

/**
 * Analyse 1: Fichiers avec module.exports ou exports.
 */
function analyzeCommonJSUsage() {
  log('📋 Analyse 1: Recherche de CommonJS dans le codebase...', 'cyan');
  
  const patterns = [
    { regex: /\bmodule\.exports\b/, name: 'module.exports' },
    { regex: /\bexports\.\w+\s*=/, name: 'exports.property =' },
    { regex: /^exports\s*=/, name: 'exports =' }
  ];
  
  function scanDir(dir, depth = 0) {
    if (depth > 6) return;
    
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          if (!item.name.startsWith('.') && item.name !== 'node_modules') {
            scanDir(fullPath, depth + 1);
          }
        } else if (/\.(js|mjs|ts|tsx)$/.test(item.name)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const relativePath = path.relative(process.cwd(), fullPath);
            
            for (const { regex, name } of patterns) {
              if (regex.test(content)) {
                const ext = path.extname(fullPath);
                const severity = ext === '.mjs' ? 'CRITICAL' : 'HIGH';
                
                findings.criticalIssues.push({
                  severity,
                  file: relativePath,
                  issue: `Utilise ${name} dans un fichier ${ext}`,
                  pattern: name
                });
                
                log(`  ${severity === 'CRITICAL' ? '🔴' : '🟠'} ${relativePath}`, 'red');
                log(`     → Utilise: ${name}`, 'yellow');
                
                // Afficher les lignes problématiques
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                  if (regex.test(line)) {
                    log(`     Ligne ${idx + 1}: ${line.trim().substring(0, 60)}`, 'yellow');
                  }
                });
              }
            }
          } catch (err) {
            // Ignorer erreurs de lecture
          }
        }
      }
    } catch (err) {
      // Ignorer erreurs de scan
    }
  }
  
  scanDir(process.cwd());
  
  if (findings.criticalIssues.length === 0) {
    log('  ✅ Aucun usage de CommonJS détecté', 'green');
  } else {
    log(`\n  ❌ ${findings.criticalIssues.length} fichiers avec CommonJS trouvés`, 'red');
  }
}

/**
 * Analyse 2: Configuration package.json
 */
function analyzePackageJsonType() {
  log('\n📋 Analyse 2: Configuration package.json...', 'cyan');
  
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  
  if (pkg.type === 'module') {
    log('  ✅ type: "module" défini → Tous les .js sont ES modules', 'green');
  } else {
    log('  ⚠️  type: "module" NON défini', 'yellow');
    log('     → Fichiers .js = CommonJS par défaut', 'yellow');
    log('     → Fichiers .mjs = ES modules', 'yellow');
    
    findings.recommendations.push({
      priority: 'MEDIUM',
      action: 'Ajouter "type": "module" dans package.json',
      reason: 'Uniformiser tous les fichiers en ES modules'
    });
  }
}

/**
 * Analyse 3: Fichiers mixant import et require
 */
function analyzeMixedSyntax() {
  log('\n📋 Analyse 3: Détection de syntaxe mixte...', 'cyan');
  
  function scanDir(dir, depth = 0) {
    if (depth > 6) return;
    
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          if (!item.name.startsWith('.') && item.name !== 'node_modules') {
            scanDir(fullPath, depth + 1);
          }
        } else if (/\.(js|mjs|ts|tsx)$/.test(item.name)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const relativePath = path.relative(process.cwd(), fullPath);
            
            const hasImport = /^import\s+/m.test(content);
            const hasRequire = /\brequire\s*\(/m.test(content);
            const hasExport = /^export\s+/m.test(content);
            const hasModuleExports = /\bmodule\.exports\b/.test(content);
            
            if ((hasImport && hasRequire) || (hasExport && hasModuleExports)) {
              findings.moduleConflicts.push({
                file: relativePath,
                hasImport,
                hasRequire,
                hasExport,
                hasModuleExports
              });
              
              log(`  ⚠️  ${relativePath}`, 'yellow');
              const syntax = [];
              if (hasImport) syntax.push('import');
              if (hasRequire) syntax.push('require');
              if (hasExport) syntax.push('export');
              if (hasModuleExports) syntax.push('module.exports');
              log(`     → Mélange: ${syntax.join(' + ')}`, 'yellow');
            }
          } catch (err) {
            // Ignorer
          }
        }
      }
    } catch (err) {
      // Ignorer
    }
  }
  
  scanDir(process.cwd());
  
  if (findings.moduleConflicts.length === 0) {
    log('  ✅ Aucun mélange de syntaxe détecté', 'green');
  } else {
    log(`\n  ⚠️  ${findings.moduleConflicts.length} fichiers avec syntaxe mixte`, 'yellow');
  }
}

/**
 * Analyse 4: Configuration Next.js
 */
function analyzeNextConfig() {
  log('\n📋 Analyse 4: Configuration Next.js...', 'cyan');
  
  const configPath = path.join(process.cwd(), 'next.config.mjs');
  
  if (!fs.existsSync(configPath)) {
    log('  ❌ next.config.mjs NOT FOUND', 'red');
    findings.criticalIssues.push({
      severity: 'CRITICAL',
      file: 'next.config.mjs',
      issue: 'Fichier de configuration manquant'
    });
    return;
  }
  
  const content = fs.readFileSync(configPath, 'utf8');
  
  if (/export\s+default/.test(content)) {
    log('  ✅ Utilise export default (ES module)', 'green');
  } else {
    log('  ❌ N\'utilise PAS export default', 'red');
  }
  
  if (content.includes("output: 'export'")) {
    log('  ❌ PROBLÈME: output: "export" détecté', 'red');
    findings.criticalIssues.push({
      severity: 'CRITICAL',
      file: 'next.config.mjs',
      issue: 'output: "export" incompatible avec API routes',
      fix: 'Supprimer cette ligne'
    });
  } else {
    log('  ✅ Pas de output: "export"', 'green');
  }
}

/**
 * Analyse 5: Fichiers renommés
 */
function analyzeRenamedFiles() {
  log('\n📋 Analyse 5: Fichiers renommés .js → .mjs...', 'cyan');
  
  const renamedFiles = [
    { old: 'lib/db.js', new: 'lib/db.mjs' },
    { old: 'lib/score.js', new: 'lib/score.mjs' },
    { old: 'lib/providers/extended-registry.js', new: 'lib/providers/extended-registry.mjs' },
    { old: 'lib/providers/final-complete-registry.js', new: 'lib/providers/final-complete-registry.mjs' }
  ];
  
  for (const { old: oldPath, new: newPath } of renamedFiles) {
    const oldExists = fs.existsSync(path.join(process.cwd(), oldPath));
    const newExists = fs.existsSync(path.join(process.cwd(), newPath));
    
    if (oldExists && newExists) {
      log(`  ⚠️  DOUBLON: ${oldPath} ET ${newPath} existent`, 'yellow');
      findings.suspiciousFiles.push({
        issue: 'Fichier doublon',
        files: [oldPath, newPath],
        fix: `Supprimer ${oldPath}`
      });
    } else if (oldExists) {
      log(`  ⚠️  ${oldPath} existe encore`, 'yellow');
    } else if (newExists) {
      log(`  ✅ ${newPath} existe`, 'green');
    } else {
      log(`  ❌ NI ${oldPath} NI ${newPath}`, 'red');
    }
  }
}

/**
 * Rapport final
 */
function generateReport() {
  console.log('\n' + '='.repeat(80));
  log('📊 RAPPORT FINAL', 'bright');
  console.log('='.repeat(80) + '\n');
  
  const totalIssues = findings.criticalIssues.length + 
                      findings.moduleConflicts.length + 
                      findings.suspiciousFiles.length;
  
  if (totalIssues === 0) {
    log('✨ AUCUN PROBLÈME DÉTECTÉ !', 'green');
    log('\n💡 L\'erreur "exports is not defined" vient probablement:', 'cyan');
    log('   1. D\'une dépendance externe (node_modules)', 'cyan');
    log('   2. D\'un problème de cache Next.js', 'cyan');
    log('\n🔧 Solutions à essayer:', 'yellow');
    log('   1. rm -rf .next && npm run build', 'yellow');
    log('   2. rm -rf node_modules && npm install && npm run build', 'yellow');
    return;
  }
  
  if (findings.criticalIssues.length > 0) {
    log(`🔴 PROBLÈMES CRITIQUES (${findings.criticalIssues.length}):`, 'red');
    findings.criticalIssues.forEach(issue => {
      log(`\n   📁 ${issue.file}`, 'red');
      log(`   ⚠️  ${issue.issue}`, 'yellow');
      if (issue.fix) {
        log(`   ✅ Solution: ${issue.fix}`, 'green');
      }
    });
  }
  
  if (findings.moduleConflicts.length > 0) {
    log(`\n🟡 CONFLITS DE MODULES (${findings.moduleConflicts.length}):`, 'yellow');
    findings.moduleConflicts.slice(0, 10).forEach(conflict => {
      log(`   - ${conflict.file}`, 'yellow');
    });
  }
  
  if (findings.suspiciousFiles.length > 0) {
    log(`\n⚠️  FICHIERS SUSPECTS (${findings.suspiciousFiles.length}):`, 'yellow');
    findings.suspiciousFiles.forEach(suspect => {
      log(`   ${suspect.issue}:`, 'yellow');
      suspect.files.forEach(f => log(`     - ${f}`, 'yellow'));
      if (suspect.fix) {
        log(`   ✅ ${suspect.fix}`, 'green');
      }
    });
  }
  
  if (findings.recommendations.length > 0) {
    log(`\n💡 RECOMMANDATIONS:`, 'cyan');
    findings.recommendations.forEach(rec => {
      log(`   [${rec.priority}] ${rec.action}`, 'cyan');
      log(`   → ${rec.reason}`, 'cyan');
    });
  }
  
  // Sauvegarder le rapport
  const reportPath = path.join(process.cwd(), 'scripts/openclaw-analysis-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));
  log(`\n💾 Rapport détaillé: scripts/openclaw-analysis-report.json`, 'cyan');
}

// Exécution
try {
  analyzeCommonJSUsage();
  analyzePackageJsonType();
  analyzeMixedSyntax();
  analyzeNextConfig();
  analyzeRenamedFiles();
  generateReport();
} catch (err) {
  log(`\n❌ Erreur fatale: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
}
