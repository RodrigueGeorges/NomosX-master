#!/usr/bin/env node
/**
 * 🛡️ OpenClaw Guardian - Système de Protection Robuste
 * 
 * Protège votre codebase contre les modifications OpenClaw problématiques
 * Workflow automatisé : Backup → Validation → Rollback si erreur
 * 
 * Usage:
 *   node scripts/openclaw-guardian.mjs pre    # Avant OpenClaw
 *   node scripts/openclaw-guardian.mjs post   # Après OpenClaw
 *   node scripts/openclaw-guardian.mjs status # État actuel
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GUARDIAN_DIR = path.join(process.cwd(), '.openclaw-guardian');
const STATE_FILE = path.join(GUARDIAN_DIR, 'state.json');
const BACKUP_REF = 'openclaw-backup';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(80));
  log(`🛡️  ${title}`, 'bright');
  console.log('='.repeat(80) + '\n');
}

function ensureGuardianDir() {
  if (!fs.existsSync(GUARDIAN_DIR)) {
    fs.mkdirSync(GUARDIAN_DIR, { recursive: true });
  }
}

function saveState(state) {
  ensureGuardianDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function clearState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

/**
 * PRE-CHECK: Avant toute modification OpenClaw
 */
function preCheck() {
  header('OpenClaw Guardian - PRE-CHECK');
  
  log('📋 Étape 1/5: Vérification de l\'état Git...', 'cyan');
  
  try {
    // Vérifier qu'on est dans un repo Git
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    
    // Vérifier qu'il n'y a pas de modifications non commitées
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      log('⚠️  ATTENTION: Vous avez des modifications non commitées!', 'yellow');
      log('   Recommandation: Commitez vos changements avant d\'utiliser OpenClaw', 'yellow');
      log('   Commande: git add -A && git commit -m "backup avant OpenClaw"', 'yellow');
      
      const answer = prompt('\n   Continuer quand même? (y/N): ');
      if (answer?.toLowerCase() !== 'y') {
        log('\n❌ Opération annulée par l\'utilisateur', 'red');
        process.exit(1);
      }
    } else {
      log('   ✅ Aucune modification non commitée', 'green');
    }
  } catch (err) {
    log('❌ Erreur: Ce n\'est pas un dépôt Git', 'red');
    process.exit(1);
  }
  
  log('\n📋 Étape 2/5: Création du point de sauvegarde...', 'cyan');
  
  try {
    // Créer une branche de backup
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupBranch = `${BACKUP_REF}-${timestamp}`;
    
    execSync(`git branch ${backupBranch}`, { stdio: 'ignore' });
    log(`   ✅ Branche de backup créée: ${backupBranch}`, 'green');
    
    // Sauvegarder l'état
    const state = {
      timestamp: new Date().toISOString(),
      currentBranch,
      backupBranch,
      lastCommit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
      filesCount: 0
    };
    
    saveState(state);
    
  } catch (err) {
    log(`❌ Erreur lors de la création du backup: ${err.message}`, 'red');
    process.exit(1);
  }
  
  log('\n📋 Étape 3/5: Scan initial du code...', 'cyan');
  
  try {
    // Compter les fichiers
    const files = execSync('git ls-files "*.ts" "*.tsx" "*.js" "*.jsx" "*.mjs"', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(f => f);
    
    const state = loadState();
    state.filesCount = files.length;
    saveState(state);
    
    log(`   ✅ ${files.length} fichiers source détectés`, 'green');
  } catch (err) {
    log(`⚠️  Impossible de compter les fichiers: ${err.message}`, 'yellow');
  }
  
  log('\n📋 Étape 4/5: Validation du build actuel...', 'cyan');
  
  try {
    // Vérifier que le build fonctionne
    log('   🔧 Test du build (cela peut prendre 1-2 minutes)...', 'cyan');
    execSync('npm run build', { stdio: 'ignore' });
    log('   ✅ Build actuel: OK', 'green');
  } catch (err) {
    log('   ⚠️  Le build actuel échoue déjà!', 'yellow');
    log('   Recommandation: Corrigez les erreurs avant d\'utiliser OpenClaw', 'yellow');
    
    const answer = prompt('\n   Continuer quand même? (y/N): ');
    if (answer?.toLowerCase() !== 'y') {
      log('\n❌ Opération annulée par l\'utilisateur', 'red');
      
      // Nettoyer le backup
      const state = loadState();
      if (state?.backupBranch) {
        try {
          execSync(`git branch -D ${state.backupBranch}`, { stdio: 'ignore' });
        } catch {}
      }
      clearState();
      process.exit(1);
    }
  }
  
  log('\n📋 Étape 5/5: Préparation terminée', 'cyan');
  
  const state = loadState();
  
  log('\n' + '='.repeat(80), 'green');
  log('✅ SYSTÈME DE PROTECTION ACTIVÉ', 'green');
  log('='.repeat(80), 'green');
  log(`\n📦 Point de sauvegarde: ${state.backupBranch}`, 'cyan');
  log(`📅 Timestamp: ${state.timestamp}`, 'cyan');
  log(`📁 Fichiers surveillés: ${state.filesCount}`, 'cyan');
  log(`\n🎯 Vous pouvez maintenant utiliser OpenClaw en toute sécurité`, 'bright');
  log(`\n⚠️  IMPORTANT: Après OpenClaw, exécutez:`, 'yellow');
  log(`   node scripts/openclaw-guardian.mjs post`, 'yellow');
  log('\n');
}

/**
 * POST-CHECK: Après modification OpenClaw
 */
async function postCheck() {
  header('OpenClaw Guardian - POST-CHECK');
  
  const state = loadState();
  if (!state) {
    log('❌ Aucun pre-check détecté!', 'red');
    log('   Vous devez exécuter "node scripts/openclaw-guardian.mjs pre" avant OpenClaw', 'red');
    process.exit(1);
  }
  
  log('📋 Étape 1/6: Détection des modifications...', 'cyan');
  
  try {
    const modifiedFiles = execSync('git status --porcelain', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(f => f);
    
    if (modifiedFiles.length === 0) {
      log('   ⚠️  Aucune modification détectée', 'yellow');
      log('   OpenClaw n\'a rien modifié ou les changements ont été commitées', 'yellow');
    } else {
      log(`   ✅ ${modifiedFiles.length} fichiers modifiés détectés`, 'green');
    }
  } catch (err) {
    log(`❌ Erreur lors de la détection: ${err.message}`, 'red');
  }
  
  log('\n📋 Étape 2/6: Validation syntaxique...', 'cyan');
  
  let syntaxErrors = 0;
  try {
    log('   🔍 Scan des erreurs de syntaxe...', 'cyan');
    const result = execSync('node scripts/comprehensive-build-check.mjs', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // Parser le résultat
    const match = result.match(/Critical errors: (\d+)/);
    if (match) {
      syntaxErrors = parseInt(match[1]);
      if (syntaxErrors === 0) {
        log('   ✅ Aucune erreur de syntaxe détectée', 'green');
      } else {
        log(`   ❌ ${syntaxErrors} erreurs critiques détectées!`, 'red');
      }
    }
  } catch (err) {
    // Le script retourne exit code 1 s'il y a des erreurs
    const output = err.stdout?.toString() || '';
    const match = output.match(/Critical errors: (\d+)/);
    if (match) {
      syntaxErrors = parseInt(match[1]);
      log(`   ❌ ${syntaxErrors} erreurs critiques détectées!`, 'red');
    }
  }
  
  log('\n📋 Étape 3/6: Test du build...', 'cyan');
  
  let buildSuccess = false;
  try {
    log('   🔧 Test du build (cela peut prendre 1-2 minutes)...', 'cyan');
    execSync('npm run build', { stdio: 'ignore' });
    log('   ✅ Build: OK', 'green');
    buildSuccess = true;
  } catch (err) {
    log('   ❌ Build: ÉCHEC', 'red');
  }
  
  log('\n📋 Étape 4/6: Analyse des résultats...', 'cyan');
  
  const hasErrors = syntaxErrors > 0 || !buildSuccess;
  
  if (hasErrors) {
    log('\n' + '='.repeat(80), 'red');
    log('⚠️  PROBLÈMES DÉTECTÉS APRÈS OPENCLAW', 'red');
    log('='.repeat(80), 'red');
    
    if (syntaxErrors > 0) {
      log(`\n❌ ${syntaxErrors} erreurs de syntaxe`, 'red');
    }
    if (!buildSuccess) {
      log(`\n❌ Le build échoue`, 'red');
    }
    
    log('\n🔧 OPTIONS DE CORRECTION:', 'yellow');
    log('   1. Correction automatique:', 'cyan');
    log('      node scripts/fix-all-build-errors.mjs', 'cyan');
    log('      node scripts/comprehensive-fix.mjs', 'cyan');
    log('\n   2. Rollback complet:', 'cyan');
    log('      node scripts/openclaw-guardian.mjs rollback', 'cyan');
    
    const answer = prompt('\n   Voulez-vous tenter une correction automatique? (Y/n): ');
    if (answer?.toLowerCase() !== 'n') {
      log('\n📋 Étape 5/6: Correction automatique...', 'cyan');
      
      try {
        log('   🔧 Exécution des scripts de correction...', 'cyan');
        execSync('node scripts/fix-all-build-errors.mjs', { stdio: 'inherit' });
        execSync('node scripts/comprehensive-fix.mjs', { stdio: 'inherit' });
        execSync('node scripts/clean-disabled-imports.mjs', { stdio: 'inherit' });
        
        log('\n   ✅ Corrections appliquées', 'green');
        log('   🔍 Nouvelle validation...', 'cyan');
        
        // Re-test
        try {
          execSync('npm run build', { stdio: 'ignore' });
          log('   ✅ Build: OK après correction', 'green');
          buildSuccess = true;
        } catch {
          log('   ❌ Build: Toujours en échec', 'red');
        }
      } catch (err) {
        log(`   ❌ Erreur lors de la correction: ${err.message}`, 'red');
      }
    }
  } else {
    log('\n' + '='.repeat(80), 'green');
    log('✅ VALIDATION RÉUSSIE', 'green');
    log('='.repeat(80), 'green');
    log('\n   Aucun problème détecté après OpenClaw', 'green');
  }
  
  log('\n📋 Étape 6/6: Finalisation...', 'cyan');
  
  if (buildSuccess) {
    log('\n🎯 RECOMMANDATIONS:', 'cyan');
    log('   1. Commitez les changements:', 'cyan');
    log('      git add -A', 'cyan');
    log('      git commit -m "fix: Corrections OpenClaw validées"', 'cyan');
    log('\n   2. Nettoyez le backup:', 'cyan');
    log('      node scripts/openclaw-guardian.mjs clean', 'cyan');
  } else {
    log('\n⚠️  Le build échoue toujours', 'yellow');
    log('   Options:', 'yellow');
    log('   1. Correction manuelle des erreurs restantes', 'yellow');
    log('   2. Rollback: node scripts/openclaw-guardian.mjs rollback', 'yellow');
  }
  
  log('\n');
}

/**
 * ROLLBACK: Annuler toutes les modifications OpenClaw
 */
function rollback() {
  header('OpenClaw Guardian - ROLLBACK');
  
  const state = loadState();
  if (!state) {
    log('❌ Aucun backup trouvé!', 'red');
    process.exit(1);
  }
  
  log('⚠️  ATTENTION: Cette action va annuler TOUTES les modifications', 'yellow');
  log(`   Retour au commit: ${state.lastCommit.substring(0, 8)}`, 'yellow');
  log(`   Branche de backup: ${state.backupBranch}`, 'yellow');
  
  const answer = prompt('\n   Confirmer le rollback? (yes/NO): ');
  if (answer !== 'yes') {
    log('\n❌ Rollback annulé', 'red');
    process.exit(1);
  }
  
  try {
    log('\n🔄 Rollback en cours...', 'cyan');
    
    // Reset hard au commit de backup
    execSync(`git reset --hard ${state.lastCommit}`, { stdio: 'inherit' });
    
    log('\n✅ Rollback terminé', 'green');
    log('   Toutes les modifications OpenClaw ont été annulées', 'green');
    
    // Nettoyer
    clearState();
    
  } catch (err) {
    log(`\n❌ Erreur lors du rollback: ${err.message}`, 'red');
    process.exit(1);
  }
}

/**
 * CLEAN: Nettoyer les backups
 */
function clean() {
  header('OpenClaw Guardian - CLEAN');
  
  const state = loadState();
  if (!state) {
    log('ℹ️  Aucun backup à nettoyer', 'cyan');
    return;
  }
  
  try {
    log('🧹 Nettoyage des backups...', 'cyan');
    
    // Supprimer la branche de backup
    if (state.backupBranch) {
      try {
        execSync(`git branch -D ${state.backupBranch}`, { stdio: 'ignore' });
        log(`   ✅ Branche ${state.backupBranch} supprimée`, 'green');
      } catch {
        log(`   ⚠️  Branche ${state.backupBranch} déjà supprimée`, 'yellow');
      }
    }
    
    // Supprimer l'état
    clearState();
    
    log('\n✅ Nettoyage terminé', 'green');
    
  } catch (err) {
    log(`\n❌ Erreur lors du nettoyage: ${err.message}`, 'red');
  }
}

/**
 * STATUS: Afficher l'état actuel
 */
function status() {
  header('OpenClaw Guardian - STATUS');
  
  const state = loadState();
  
  if (!state) {
    log('ℹ️  Aucune protection active', 'cyan');
    log('\n   Pour activer la protection:', 'cyan');
    log('   node scripts/openclaw-guardian.mjs pre', 'cyan');
    return;
  }
  
  log('🛡️  Protection active', 'green');
  log(`\n📅 Activée le: ${new Date(state.timestamp).toLocaleString('fr-FR')}`, 'cyan');
  log(`📦 Branche de backup: ${state.backupBranch}`, 'cyan');
  log(`🔖 Commit de référence: ${state.lastCommit.substring(0, 8)}`, 'cyan');
  log(`📁 Fichiers surveillés: ${state.filesCount}`, 'cyan');
  
  log('\n⚠️  N\'oubliez pas d\'exécuter le post-check après OpenClaw:', 'yellow');
  log('   node scripts/openclaw-guardian.mjs post', 'yellow');
  log('\n');
}

// Main
const command = process.argv[2];

switch (command) {
  case 'pre':
    preCheck();
    break;
  case 'post':
    postCheck();
    break;
  case 'rollback':
    rollback();
    break;
  case 'clean':
    clean();
    break;
  case 'status':
    status();
    break;
  default:
    log('🛡️  OpenClaw Guardian - Système de Protection Robuste\n', 'bright');
    log('Usage:', 'cyan');
    log('  node scripts/openclaw-guardian.mjs pre      # Avant OpenClaw', 'cyan');
    log('  node scripts/openclaw-guardian.mjs post     # Après OpenClaw', 'cyan');
    log('  node scripts/openclaw-guardian.mjs rollback # Annuler les modifications', 'cyan');
    log('  node scripts/openclaw-guardian.mjs clean    # Nettoyer les backups', 'cyan');
    log('  node scripts/openclaw-guardian.mjs status   # État actuel', 'cyan');
    log('\n');
    process.exit(1);
}
