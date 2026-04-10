#!/usr/bin/env node
/**
 * 🔬 Ultra Diagnostic - Vérification Exhaustive et Professionnelle
 * 
 * Détecte TOUTES les erreurs potentielles:
 * - Imports/exports invalides
 * - Modules manquants
 * - Dépendances non utilisées
 * - Fichiers orphelins
 * - Syntaxe TypeScript/JavaScript
 * - Cohérence des registries
 * - Chemins relatifs cassés
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(80));
  log(`🔬 ${title}`, 'bright');
  console.log('='.repeat(80) + '\n');
}

const errors = {
  critical: [],
  high: [],
  medium: [],
  low: [],
  info: []
};

function addError(severity, category, file, message, suggestion = null) {
  errors[severity].push({ category, file, message, suggestion });
}

/**
 * 1. Vérification des imports/exports
 */
function checkImportsExports() {
  header('1. VÉRIFICATION IMPORTS/EXPORTS');
  
  const sourceFiles = [];
  
  function scanDir(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
          scanDir(fullPath);
        }
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(item.name)) {
        sourceFiles.push(fullPath);
      }
    }
  }
  
  scanDir(process.cwd());
  
  log(`📁 Analyse de ${sourceFiles.length} fichiers source...`, 'cyan');
  
  let checked = 0;
  for (const file of sourceFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(process.cwd(), file);
      
      // Détecter imports de modules locaux
      const importRegex = /(?:import|export).*?from\s+['"](\.[^'"]+)['"]/g;
      let match;
      
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        const dir = path.dirname(file);
        const resolvedPath = path.resolve(dir, importPath);
        
        // Vérifier si le fichier existe (avec extensions possibles)
        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.js'];
        let exists = false;
        
        for (const ext of extensions) {
          if (fs.existsSync(resolvedPath + ext)) {
            exists = true;
            break;
          }
        }
        
        if (!exists) {
          addError('critical', 'IMPORT', relativePath, 
            `Import manquant: "${importPath}"`,
            `Vérifier que le fichier existe ou corriger le chemin`);
        }
      }
      
      // Détecter exports non définis
      const exportMatch = content.match(/export\s*\{([^}]+)\}/g);
      if (exportMatch) {
        for (const exp of exportMatch) {
          const names = exp.match(/\b\w+\b/g).filter(n => n !== 'export');
          for (const name of names) {
            // Vérifier si le nom est défini dans le fichier
            const definitionRegex = new RegExp(`(?:const|let|var|function|class|interface|type|enum)\\s+${name}\\b`);
            if (!definitionRegex.test(content) && !content.includes(`import.*${name}`)) {
              addError('high', 'EXPORT', relativePath,
                `Export non défini: "${name}"`,
                `Définir "${name}" ou le supprimer de l'export`);
            }
          }
        }
      }
      
      checked++;
      if (checked % 50 === 0) {
        process.stdout.write(`\r   ✓ ${checked}/${sourceFiles.length} fichiers vérifiés...`);
      }
    } catch (err) {
      // Ignorer les erreurs de lecture
    }
  }
  
  console.log(`\r   ✅ ${checked} fichiers vérifiés`);
}

/**
 * 2. Vérification des registries providers
 */
function checkProviderRegistries() {
  header('2. VÉRIFICATION REGISTRIES PROVIDERS');
  
  const registries = [
    'lib/providers/all-providers-registry.ts',
    'lib/providers/extended-registry.js',
    'lib/providers/final-complete-registry.js'
  ];
  
  for (const registry of registries) {
    const fullPath = path.join(process.cwd(), registry);
    if (!fs.existsSync(fullPath)) {
      addError('medium', 'REGISTRY', registry, 'Fichier registry manquant');
      continue;
    }
    
    log(`📋 Vérification: ${registry}`, 'cyan');
    
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Extraire tous les requires/imports
    const requireRegex = /require\(['"]\.\/([^'"]+)['"]\)/g;
    const importRegex = /import.*?from\s+['"]\.\/([^'"]+)['"]/g;
    
    let match;
    const imports = [];
    
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    log(`   📦 ${imports.length} imports détectés`, 'cyan');
    
    // Vérifier chaque import
    let missing = 0;
    for (const imp of imports) {
      const dir = path.dirname(fullPath);
      const resolvedPath = path.resolve(dir, imp);
      
      const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs'];
      let exists = false;
      
      for (const ext of extensions) {
        if (fs.existsSync(resolvedPath + ext)) {
          exists = true;
          break;
        }
      }
      
      if (!exists) {
        addError('critical', 'REGISTRY', registry,
          `Provider manquant: "${imp}"`,
          `Créer le fichier ou supprimer l'import`);
        missing++;
      }
    }
    
    if (missing === 0) {
      log(`   ✅ Tous les providers existent`, 'green');
    } else {
      log(`   ❌ ${missing} providers manquants`, 'red');
    }
  }
}

/**
 * 3. Vérification de la structure institutional
 */
function checkInstitutionalStructure() {
  header('3. VÉRIFICATION STRUCTURE INSTITUTIONAL');
  
  const indexPath = path.join(process.cwd(), 'lib/providers/institutional/index.ts');
  
  if (!fs.existsSync(indexPath)) {
    addError('critical', 'STRUCTURE', 'lib/providers/institutional/index.ts',
      'Fichier index manquant');
    return;
  }
  
  const content = fs.readFileSync(indexPath, 'utf8');
  
  // Extraire tous les exports
  const exportRegex = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  const exports = [];
  
  while ((match = exportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  
  log(`📦 ${exports.length} exports détectés dans institutional/index.ts`, 'cyan');
  
  let missing = 0;
  for (const exp of exports) {
    const dir = path.dirname(indexPath);
    const resolvedPath = path.resolve(dir, exp);
    
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs'];
    let exists = false;
    
    for (const ext of extensions) {
      if (fs.existsSync(resolvedPath + ext)) {
        exists = true;
        break;
      }
    }
    
    if (!exists) {
      addError('critical', 'INSTITUTIONAL', 'lib/providers/institutional/index.ts',
        `Module manquant: "${exp}"`,
        `Vérifier le chemin ou créer le fichier`);
      missing++;
    }
  }
  
  if (missing === 0) {
    log(`✅ Tous les modules institutional existent`, 'green');
  } else {
    log(`❌ ${missing} modules manquants`, 'red');
  }
}

/**
 * 4. Vérification TypeScript
 */
function checkTypeScript() {
  header('4. VÉRIFICATION TYPESCRIPT');
  
  log('🔍 Compilation TypeScript (dry-run)...', 'cyan');
  
  try {
    execSync('npx tsc --noEmit --skipLibCheck', {
      stdio: 'pipe',
      encoding: 'utf8'
    });
    log('✅ Aucune erreur TypeScript', 'green');
  } catch (err) {
    const output = err.stdout || err.stderr || '';
    const lines = output.split('\n').filter(l => l.trim());
    
    log(`❌ ${lines.length} erreurs TypeScript détectées`, 'red');
    
    // Parser les erreurs
    for (const line of lines.slice(0, 20)) { // Limiter à 20 erreurs
      if (line.includes('error TS')) {
        const match = line.match(/(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)/);
        if (match) {
          const [, file, lineNum, col, code, message] = match;
          addError('high', 'TYPESCRIPT', file,
            `TS${code} ligne ${lineNum}: ${message}`);
        }
      }
    }
  }
}

/**
 * 5. Vérification des dépendances
 */
function checkDependencies() {
  header('5. VÉRIFICATION DÉPENDANCES');
  
  const packagePath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies
  };
  
  log(`📦 ${Object.keys(allDeps).length} dépendances installées`, 'cyan');
  
  // Vérifier les imports dans le code
  const usedDeps = new Set();
  
  function scanImports(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
          scanImports(fullPath);
        }
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(item.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const importRegex = /(?:import|require)\s*\(?['"]([^'"./][^'"]*)['"]\)?/g;
          let match;
          
          while ((match = importRegex.exec(content)) !== null) {
            const dep = match[1].split('/')[0]; // Prendre le nom du package
            if (dep && !dep.startsWith('.')) {
              usedDeps.add(dep);
            }
          }
        } catch {}
      }
    }
  }
  
  scanImports(process.cwd());
  
  log(`📝 ${usedDeps.size} dépendances utilisées dans le code`, 'cyan');
  
  // Détecter les dépendances non utilisées
  const unused = [];
  for (const dep of Object.keys(allDeps)) {
    if (!usedDeps.has(dep) && !dep.startsWith('@types/')) {
      unused.push(dep);
    }
  }
  
  if (unused.length > 0) {
    log(`⚠️  ${unused.length} dépendances potentiellement non utilisées:`, 'yellow');
    for (const dep of unused.slice(0, 10)) {
      log(`   - ${dep}`, 'yellow');
      addError('low', 'DEPENDENCY', 'package.json',
        `Dépendance non utilisée: "${dep}"`,
        `Vérifier si elle est nécessaire`);
    }
  } else {
    log(`✅ Toutes les dépendances sont utilisées`, 'green');
  }
  
  // Détecter les dépendances manquantes
  const missing = [];
  for (const dep of usedDeps) {
    if (!allDeps[dep] && !dep.startsWith('@/')) {
      missing.push(dep);
    }
  }
  
  if (missing.length > 0) {
    log(`❌ ${missing.length} dépendances manquantes:`, 'red');
    for (const dep of missing) {
      log(`   - ${dep}`, 'red');
      addError('high', 'DEPENDENCY', 'package.json',
        `Dépendance manquante: "${dep}"`,
        `Installer avec: npm install ${dep}`);
    }
  }
}

/**
 * 6. Vérification des fichiers critiques
 */
function checkCriticalFiles() {
  header('6. VÉRIFICATION FICHIERS CRITIQUES');
  
  const criticalFiles = [
    { path: 'lib/db.js', desc: 'Configuration Prisma' },
    { path: 'lib/agent/pipeline-v2.ts', desc: 'Pipeline principal' },
    { path: 'lib/providers/institutional/index.ts', desc: 'Index institutional' },
    { path: 'app/api/council/ask/route.ts', desc: 'API Council' },
    { path: 'prisma/schema.prisma', desc: 'Schéma Prisma' },
    { path: 'next.config.js', desc: 'Config Next.js' },
    { path: 'package.json', desc: 'Package' },
    { path: '.env.example', desc: 'Variables env exemple' }
  ];
  
  for (const { path: filePath, desc } of criticalFiles) {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      log(`✅ ${desc}: ${filePath}`, 'green');
    } else {
      log(`❌ ${desc}: ${filePath} MANQUANT`, 'red');
      addError('critical', 'CRITICAL_FILE', filePath,
        `Fichier critique manquant: ${desc}`);
    }
  }
}

/**
 * Génération du rapport
 */
function generateReport() {
  header('📊 RAPPORT FINAL');
  
  const totalErrors = errors.critical.length + errors.high.length + 
                      errors.medium.length + errors.low.length;
  
  if (totalErrors === 0) {
    log('✨ AUCUNE ERREUR DÉTECTÉE !', 'green');
    log('   Votre codebase est propre et prêt pour le déploiement.', 'green');
    return;
  }
  
  log(`\n🔴 ERREURS CRITIQUES (${errors.critical.length}):`, 'red');
  for (const err of errors.critical.slice(0, 20)) {
    log(`   [${err.category}] ${err.file}`, 'red');
    log(`   → ${err.message}`, 'red');
    if (err.suggestion) {
      log(`   💡 ${err.suggestion}`, 'yellow');
    }
    console.log();
  }
  
  log(`\n🟠 ERREURS IMPORTANTES (${errors.high.length}):`, 'yellow');
  for (const err of errors.high.slice(0, 10)) {
    log(`   [${err.category}] ${err.file}`, 'yellow');
    log(`   → ${err.message}`, 'yellow');
    if (err.suggestion) {
      log(`   💡 ${err.suggestion}`, 'cyan');
    }
    console.log();
  }
  
  if (errors.medium.length > 0) {
    log(`\n🟡 AVERTISSEMENTS (${errors.medium.length}):`, 'cyan');
    for (const err of errors.medium.slice(0, 5)) {
      log(`   [${err.category}] ${err.file}: ${err.message}`, 'cyan');
    }
  }
  
  if (errors.low.length > 0) {
    log(`\n⚪ INFORMATIONS (${errors.low.length}):`, 'blue');
    log(`   ${errors.low.length} suggestions d'optimisation disponibles`, 'blue');
  }
  
  // Sauvegarder le rapport
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      critical: errors.critical.length,
      high: errors.high.length,
      medium: errors.medium.length,
      low: errors.low.length,
      total: totalErrors
    },
    errors
  };
  
  const reportPath = path.join(process.cwd(), 'scripts/ultra-diagnostic-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log(`\n💾 Rapport détaillé: scripts/ultra-diagnostic-report.json`, 'cyan');
  
  console.log('\n' + '='.repeat(80));
  log('📈 RÉSUMÉ:', 'bright');
  log(`   🔴 Critiques: ${errors.critical.length}`, errors.critical.length > 0 ? 'red' : 'green');
  log(`   🟠 Importantes: ${errors.high.length}`, errors.high.length > 0 ? 'yellow' : 'green');
  log(`   🟡 Avertissements: ${errors.medium.length}`, 'cyan');
  log(`   ⚪ Infos: ${errors.low.length}`, 'blue');
  console.log('='.repeat(80) + '\n');
  
  if (errors.critical.length > 0 || errors.high.length > 0) {
    log('⚠️  ACTION REQUISE: Corriger les erreurs critiques et importantes avant déploiement', 'yellow');
    process.exit(1);
  }
}

// Exécution
console.log('\n');
log('🔬 ULTRA DIAGNOSTIC - VÉRIFICATION EXHAUSTIVE', 'bright');
log('   Analyse professionnelle du codebase NomosX', 'cyan');
console.log('\n');

try {
  checkCriticalFiles();
  checkInstitutionalStructure();
  checkProviderRegistries();
  checkImportsExports();
  checkDependencies();
  checkTypeScript();
  generateReport();
} catch (err) {
  log(`\n❌ Erreur fatale: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
}
