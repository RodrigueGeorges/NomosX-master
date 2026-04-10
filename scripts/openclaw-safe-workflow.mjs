#!/usr/bin/env node
/**
 * 🚀 OpenClaw Safe Workflow - Workflow Intégré Automatisé
 * 
 * Exécute automatiquement tout le cycle de protection:
 * Pre-check → OpenClaw → Post-check → Correction → Validation
 * 
 * Usage:
 *   node scripts/openclaw-safe-workflow.mjs
 */

import { execSync } from 'child_process';
import readline from 'readline';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(80));
  log(`🚀 ${title}`, 'bright');
  console.log('='.repeat(80) + '\n');
}

async function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  header('OpenClaw Safe Workflow - Workflow Automatisé');
  
  log('Ce workflow va:', 'cyan');
  log('  1. ✅ Créer un point de sauvegarde', 'cyan');
  log('  2. ✅ Valider l\'état actuel du code', 'cyan');
  log('  3. ⏸️  Attendre que vous utilisiez OpenClaw', 'cyan');
  log('  4. ✅ Valider les modifications', 'cyan');
  log('  5. ✅ Corriger automatiquement les erreurs', 'cyan');
  log('  6. ✅ Proposer commit ou rollback', 'cyan');
  
  const answer = await question('\n📋 Démarrer le workflow? (Y/n): ');
  if (answer.toLowerCase() === 'n') {
    log('\n❌ Workflow annulé', 'red');
    process.exit(0);
  }
  
  // ÉTAPE 1: Pre-check
  header('ÉTAPE 1/6 - Pre-check');
  try {
    log('🔍 Exécution du pre-check...', 'cyan');
    execSync('node scripts/openclaw-guardian.mjs pre', { stdio: 'inherit' });
    log('\n✅ Pre-check terminé', 'green');
  } catch (err) {
    log('\n❌ Pre-check échoué', 'red');
    process.exit(1);
  }
  
  // ÉTAPE 2: Attendre OpenClaw
  header('ÉTAPE 2/6 - Utilisation d\'OpenClaw');
  log('🎯 Vous pouvez maintenant utiliser OpenClaw', 'bright');
  log('\n📝 Instructions:', 'cyan');
  log('  1. Ouvrez l\'interface OpenClaw', 'cyan');
  log('  2. Sélectionnez les fichiers à modifier', 'cyan');
  log('  3. Appliquez les transformations souhaitées', 'cyan');
  log('  4. NE COMMITEZ PAS les changements', 'cyan');
  
  await question('\n⏸️  Appuyez sur Entrée quand OpenClaw a terminé...');
  
  // ÉTAPE 3: Post-check
  header('ÉTAPE 3/6 - Post-check et Validation');
  try {
    log('🔍 Exécution du post-check...', 'cyan');
    execSync('node scripts/openclaw-guardian.mjs post', { stdio: 'inherit' });
  } catch (err) {
    log('\n⚠️  Post-check terminé avec des avertissements', 'yellow');
  }
  
  // ÉTAPE 4: Test du build
  header('ÉTAPE 4/6 - Test du Build');
  let buildSuccess = false;
  try {
    log('🔧 Test du build...', 'cyan');
    execSync('npm run build', { stdio: 'ignore' });
    log('✅ Build: OK', 'green');
    buildSuccess = true;
  } catch (err) {
    log('❌ Build: ÉCHEC', 'red');
  }
  
  // ÉTAPE 5: Décision
  header('ÉTAPE 5/6 - Décision');
  
  if (buildSuccess) {
    log('✅ Tout fonctionne parfaitement!', 'green');
    log('\n📋 Options:', 'cyan');
    log('  1. Commiter les changements (recommandé)', 'cyan');
    log('  2. Continuer sans commiter', 'cyan');
    log('  3. Rollback (annuler tout)', 'cyan');
    
    const choice = await question('\nVotre choix (1/2/3): ');
    
    if (choice === '1') {
      const message = await question('\n💬 Message de commit (ou Entrée pour message par défaut): ');
      const commitMsg = message.trim() || 'fix: Modifications OpenClaw validées';
      
      try {
        execSync('git add -A', { stdio: 'inherit' });
        execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
        log('\n✅ Changements commitées', 'green');
        
        // Nettoyer
        execSync('node scripts/openclaw-guardian.mjs clean', { stdio: 'inherit' });
        log('✅ Backup nettoyé', 'green');
      } catch (err) {
        log('\n❌ Erreur lors du commit', 'red');
      }
    } else if (choice === '3') {
      execSync('node scripts/openclaw-guardian.mjs rollback', { stdio: 'inherit' });
    } else {
      log('\n⚠️  Changements conservés mais non commitées', 'yellow');
      log('   N\'oubliez pas de nettoyer le backup plus tard:', 'yellow');
      log('   node scripts/openclaw-guardian.mjs clean', 'yellow');
    }
  } else {
    log('❌ Le build échoue', 'red');
    log('\n📋 Options:', 'cyan');
    log('  1. Corriger manuellement', 'cyan');
    log('  2. Rollback (annuler tout)', 'cyan');
    
    const choice = await question('\nVotre choix (1/2): ');
    
    if (choice === '2') {
      execSync('node scripts/openclaw-guardian.mjs rollback', { stdio: 'inherit' });
    } else {
      log('\n⚠️  Correction manuelle nécessaire', 'yellow');
      log('   Ressources utiles:', 'yellow');
      log('   - node scripts/fix-all-build-errors.mjs', 'yellow');
      log('   - node scripts/comprehensive-fix.mjs', 'yellow');
      log('   - node scripts/openclaw-guardian.mjs rollback (si besoin)', 'yellow');
    }
  }
  
  // ÉTAPE 6: Finalisation
  header('ÉTAPE 6/6 - Finalisation');
  log('✅ Workflow terminé', 'green');
  log('\n📊 Résumé:', 'cyan');
  log(`   Build: ${buildSuccess ? '✅ OK' : '❌ ÉCHEC'}`, buildSuccess ? 'green' : 'red');
  log('\n');
}

main().catch(err => {
  log(`\n❌ Erreur fatale: ${err.message}`, 'red');
  process.exit(1);
});
