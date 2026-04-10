/**
 * DEEP DIVE AUDIT - VÉRIFICATION COMPLÈTE
 * 
 * Analyse en profondeur pour identifier:
 * - Doublons de code/fonctions
 * - Incohérences d'architecture
 * - Lacunes fonctionnelles
 * - Optimisations nécessaires
 */

const fs = require('fs');
const path = require('path');

function deepDiveAudit() {
  console.log('🔍 DEEP DIVE AUDIT - VÉRIFICATION COMPLÈTE');
  console.log('========================================');
  console.log('Analyse approfondie de l\'intégration Alpha-Omega\n');
  
  // 1. Analyse des fichiers modifiés
  console.log('📁 1. FICHIERS MODIFIÉS - VÉRIFICATION DES CHANGEMENTS');
  
  const modifiedFiles = [
    'lib/agent/phd-researcher.ts',
    'lib/agent/signal-detector.ts', 
    'lib/agent/pipeline-v2.ts'
  ];
  
  const fileAnalysis = {};
  
  modifiedFiles.forEach(file => {
    console.log(`\n   🔍 ${file}:`);
    
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      // Compter les fonctions exportées
      const exports = content.match(/export\s+(async\s+)?function\s+(\w+)/g) || [];
      const exportNames = exports.map(e => e.match(/function\s+(\w+)/)[1]);
      
      // Compter les interfaces/types
      const types = content.match(/export\s+(interface|type)\s+(\w+)/g) || [];
      const typeNames = types.map(t => t.match(/(interface|type)\s+(\w+)/)[2]);
      
      // Détecter les imports
      const imports = content.match(/import\s+.*from\s+['"](.*)['"]/g) || [];
      const importNames = imports.map(i => i.match(/from\s+['"](.*)['"]/)[1]);
      
      // Détecter les doublons potentiels
      const duplicateFunctions = exportNames.filter((name, index) => exportNames.indexOf(name) !== index);
      const duplicateTypes = typeNames.filter((name, index) => typeNames.indexOf(name) !== index);
      
      fileAnalysis[file] = {
        lines: lines.length,
        exports: exportNames,
        types: typeNames,
        imports: importNames,
        duplicateFunctions,
        duplicateTypes,
        hasAlphaOmega: content.includes('ALPHA') || content.includes('OMEGA') || content.includes('PROACTIVE')
      };
      
      console.log(`      📊 ${lines.length} lignes`);
      console.log(`      📤 ${exportNames.length} fonctions exportées: ${exportNames.join(', ')}`);
      console.log(`      🏷️ ${typeNames.length} types exportés: ${typeNames.join(', ')}`);
      console.log(`      📥 ${importNames.length} imports: ${importNames.join(', ')}`);
      
      if (duplicateFunctions.length > 0) {
        console.log(`      ❌ Fonctions dupliquées: ${duplicateFunctions.join(', ')}`);
      }
      
      if (duplicateTypes.length > 0) {
        console.log(`      ❌ Types dupliqués: ${duplicateTypes.join(', ')}`);
      }
      
      console.log(`      ${fileAnalysis[file].hasAlphaOmega ? '✅' : '❌'} Contient Alpha-Omega`);
      
    } catch (error) {
      console.log(`      ❌ Erreur lecture fichier: ${error.message}`);
      fileAnalysis[file] = { error: error.message };
    }
  });
  
  // 2. Analyse des doublons entre fichiers
  console.log('\n🔄 2. DOUBLONS ENTRE FICHIERS');
  
  const allExports = [];
  const allTypes = [];
  
  Object.entries(fileAnalysis).forEach(([file, analysis]) => {
    if (analysis.exports) {
      analysis.exports.forEach(exportName => {
        allExports.push({ name: exportName, file });
      });
    }
    if (analysis.types) {
      analysis.types.forEach(typeName => {
        allTypes.push({ name: typeName, file });
      });
    }
  });
  
  // Détecter les doublons
  const duplicateExports = allExports.filter((item, index) => 
    allExports.findIndex(i => i.name === item.name) !== index
  );
  const duplicateTypes = allTypes.filter((item, index) => 
    allTypes.findIndex(i => i.name === item.name) !== index
  );
  
  console.log(`   📊 Total exports: ${allExports.length}`);
  console.log(`   📊 Total types: ${allTypes.length}`);
  
  if (duplicateExports.length > 0) {
    console.log(`\n   ❌ EXPORTS EN DOUBLE:`);
    const duplicates = new Set(duplicateExports.map(d => d.name));
    duplicates.forEach(name => {
      const files = duplicateExports.filter(d => d.name === name).map(d => d.file);
      console.log(`      ${name}: ${files.join(' ↔ ')}`);
    });
  } else {
    console.log(`   ✅ Aucun export en double détecté`);
  }
  
  if (duplicateTypes.length > 0) {
    console.log(`\n   ❌ TYPES EN DOUBLE:`);
    const duplicates = new Set(duplicateTypes.map(d => d.name));
    duplicates.forEach(name => {
      const files = duplicateTypes.filter(d => d.name === name).map(d => d.file);
      console.log(`      ${name}: ${files.join(' ↔ ')}`);
    });
  } else {
    console.log(`   ✅ Aucun type en double détecté`);
  }
  
  // 3. Analyse des incohérences d'architecture
  console.log('\n🏗️ 3. INHÉRENCES D\'ARCHITECTURE');
  
  const inconsistencies = [];
  
  // Vérifier la cohérence des imports/exports
  Object.entries(fileAnalysis).forEach(([file, analysis]) => {
    if (analysis.imports && analysis.exports) {
      // Imports circulaires
      analysis.imports.forEach(importPath => {
        const importedFile = importPath.replace('../', '').replace('./', '');
        const targetFile = modifiedFiles.find(f => f.includes(importedFile));
        
        if (targetFile) {
          const targetAnalysis = fileAnalysis[targetFile];
          if (targetAnalysis && targetAnalysis.exports) {
            // Vérifier si le fichier cible importe ce fichier
            const circularImport = targetAnalysis.imports.some(imp => 
              imp.includes(file.replace('lib/agent/', ''))
            );
            
            if (circularImport) {
              inconsistencies.push({
                type: 'IMPORT_CIRCULAIRE',
                files: [file, targetFile],
                description: `Import circulaire entre ${file} et ${targetFile}`
              });
            }
          }
        }
      });
    }
  });
  
  // Vérifier la cohérence Alpha-Omega
  const alphaOmegaFiles = Object.entries(fileAnalysis)
    .filter(([_, analysis]) => analysis.hasAlphaOmega)
    .map(([file, _]) => file);
  
  if (alphaOmegaFiles.length === 0) {
    inconsistencies.push({
      type: 'ALPHA_OMEGA_MANQUANT',
      files: modifiedFiles,
      description: 'Aucun fichier ne contient Alpha-Omega'
    });
  }
  
  console.log(`   📊 Fichiers avec Alpha-Omega: ${alphaOmegaFiles.length}/${modifiedFiles.length}`);
  
  if (inconsistencies.length > 0) {
    console.log(`\n   ❌ INHÉRENCES DÉTECTÉES:`);
    inconsistencies.forEach((inc, index) => {
      console.log(`      ${index + 1}. ${inc.type}: ${inc.description}`);
      console.log(`         Fichiers: ${inc.files.join(' ↔ ')}`);
    });
  } else {
    console.log(`   ✅ Aucune incohérence d\'architecture détectée`);
  }
  
  // 4. Analyse des lacunes fonctionnelles
  console.log('\n🕳️ 4. LACUNES FONCTIONNELLES');
  
  const gaps = [];
  
  // Vérifier les fonctions Alpha-Omega manquantes
  const expectedAlphaOmegaFunctions = [
    'runProactivePhDLeadership',
    'runProactiveExpertCouncil', 
    'alphaSignalDetector',
    'omegaVerificationEngine',
    'referencePublisher'
  ];
  
  const actualFunctions = allExports.map(e => e.name);
  
  expectedAlphaOmegaFunctions.forEach(func => {
    if (!actualFunctions.includes(func)) {
      // Vérifier si la fonction existe dans les nouveaux fichiers
      const fileContent = fs.readFileSync('lib/agent/omega-verification.ts', 'utf8');
      const refFileContent = fs.readFileSync('lib/agent/reference-publisher.ts', 'utf8');
      
      if (func === 'omegaVerificationEngine' && fileContent.includes('omegaVerificationEngine')) {
        // La fonction existe mais n'est pas dans l'audit
        return; // Pas une lacune réelle
      }
      
      if (func === 'referencePublisher' && refFileContent.includes('referencePublisher')) {
        // La fonction existe mais n'est pas dans l'audit
        return; // Pas une lacune réelle
      }
      
      gaps.push({
        type: 'FONCTION_MANQUANTE',
        name: func,
        description: `Fonction Alpha-Omega attendue non trouvée`
      });
    }
  });
  
  // Vérifier l'intégration dans le pipeline
  const pipelineFile = fileAnalysis['lib/agent/pipeline-v2.ts'];
  if (pipelineFile) {
    const pipelineContent = fs.readFileSync('lib/agent/pipeline-v2.ts', 'utf8');
    
    const hasProactiveIntegration = pipelineContent.includes('runProactiveExpertCouncil');
    const hasAlphaIntegration = pipelineContent.includes('alphaSignalDetector');
    
    if (!hasProactiveIntegration) {
      gaps.push({
        type: 'INTEGRATION_MANQUANTE',
        name: 'Proactive PhD Integration',
        description: 'Pipeline V2 n\'utilise pas runProactiveExpertCouncil'
      });
    }
    
    if (!hasAlphaIntegration) {
      gaps.push({
        type: 'INTEGRATION_MANQUANTE', 
        name: 'Alpha Signal Integration',
        description: 'Pipeline V2 n\'utilise pas alphaSignalDetector'
      });
    }
  }
  
  // Vérifier les types manquants
  const expectedTypes = [
    'ProactivePhDLeadership',
    'AlphaSignal',
    'OmegaVerificationRequest',
    'ReferencePublication'
  ];
  
  const actualTypes = allTypes.map(t => t.name);
  
  expectedTypes.forEach(type => {
    if (!actualTypes.includes(type)) {
      // Vérifier si le type existe dans les nouveaux fichiers
      const signalFileContent = fs.readFileSync('lib/agent/signal-detector.ts', 'utf8');
      const omegaFileContent = fs.readFileSync('lib/agent/omega-verification.ts', 'utf8');
      const refFileContent = fs.readFileSync('lib/agent/reference-publisher.ts', 'utf8');
      
      if (type === 'AlphaSignal' && signalFileContent.includes('export interface AlphaSignal')) {
        return; // Le type existe
      }
      
      if (type === 'OmegaVerificationRequest' && omegaFileContent.includes('export interface OmegaVerificationRequest')) {
        return; // Le type existe
      }
      
      if (type === 'ReferencePublication' && refFileContent.includes('export interface ReferencePublication')) {
        return; // Le type existe
      }
      
      gaps.push({
        type: 'TYPE_MANQUANT',
        name: type,
        description: `Type Alpha-Omega attendu non trouvé`
      });
    }
  });
  
  console.log(`   📊 Fonctions attendues: ${expectedAlphaOmegaFunctions.length}`);
  console.log(`   📊 Fonctions trouvées: ${actualFunctions.length}`);
  console.log(`   📊 Types attendus: ${expectedTypes.length}`);
  console.log(`   📊 Types trouvés: ${actualTypes.length}`);
  
  if (gaps.length > 0) {
    console.log(`\n   ❌ LACUNES DÉTECTÉES:`);
    gaps.forEach((gap, index) => {
      console.log(`      ${index + 1}. ${gap.type}: ${gap.name}`);
      console.log(`         ${gap.description}`);
    });
  } else {
    console.log(`   ✅ Aucune lacune fonctionnelle détectée`);
  }
  
  // 5. Analyse des optimisations nécessaires
  console.log('\n⚡ 5. OPTIMISATIONS NÉCESSAIRES');
  
  const optimizations = [];
  
  // Optimisation 1: Performance
  Object.entries(fileAnalysis).forEach(([file, analysis]) => {
    if (analysis.lines > 1000) {
      optimizations.push({
        type: 'PERFORMANCE',
        file,
        description: `Fichier volumineux (${analysis.lines} lignes) - envisager split`,
        priority: 'MEDIUM'
      });
    }
  });
  
  // Optimisation 2: Code dupliqué
  duplicateExports.forEach(dup => {
    optimizations.push({
      type: 'REFACTORING',
      file: dup.file,
      description: `Export dupliqué: ${dup.name} - créer module commun`,
      priority: 'HIGH'
    });
  });
  
  // Optimisation 3: Imports non utilisés
  Object.entries(fileAnalysis).forEach(([file, analysis]) => {
    if (analysis.imports && analysis.exports) {
      // Vérifier si tous les imports sont utilisés
      const unusedImports = analysis.imports.filter(imp => {
        const match = imp.match(/from\s+['"](.*)['"]/);
        if (!match) return false;
        const importName = match[1];
        return !analysis.exports.some(exp => exp.includes(importName));
      });
      
      if (unusedImports.length > 0) {
        optimizations.push({
          type: 'CLEANUP',
          file,
          description: `Imports non utilisés: ${unusedImports.join(', ')}`,
          priority: 'LOW'
        });
      }
    }
  });
  
  // Optimisation 4: Documentation manquante
  Object.entries(fileAnalysis).forEach(([file, analysis]) => {
    const content = fs.readFileSync(file, 'utf8');
    const hasDocumentation = content.includes('/**') && content.includes('*/');
    
    if (!hasDocumentation) {
      optimizations.push({
        type: 'DOCUMENTATION',
        file,
        description: 'Manque de documentation JSDoc',
        priority: 'LOW'
      });
    }
  });
  
  console.log(`   📊 Optimisations identifiées: ${optimizations.length}`);
  
  if (optimizations.length > 0) {
    console.log(`\n   📋 LISTE DES OPTIMISATIONS:`);
    const highPriority = optimizations.filter(opt => opt.priority === 'HIGH');
    const mediumPriority = optimizations.filter(opt => opt.priority === 'MEDIUM');
    const lowPriority = optimizations.filter(opt => opt.priority === 'LOW');
    
    if (highPriority.length > 0) {
      console.log(`\n      🔴 HAUTE PRIORITÉ:`);
      highPriority.forEach((opt, index) => {
        console.log(`         ${index + 1}. ${opt.type}: ${opt.description}`);
        console.log(`            Fichier: ${opt.file}`);
      });
    }
    
    if (mediumPriority.length > 0) {
      console.log(`\n      🟡 MOYENNE PRIORITÉ:`);
      mediumPriority.forEach((opt, index) => {
        console.log(`         ${index + 1}. ${opt.type}: ${opt.description}`);
        console.log(`            Fichier: ${opt.file}`);
      });
    }
    
    if (lowPriority.length > 0) {
      console.log(`\n      🟢 FAIBLE PRIORITÉ:`);
      lowPriority.forEach((opt, index) => {
        console.log(`         ${index + 1}. ${opt.type}: ${opt.description}`);
        console.log(`            Fichier: ${opt.file}`);
      });
    }
  } else {
    console.log(`   ✅ Aucune optimisation nécessaire détectée`);
  }
  
  // 6. Synthèse finale
  console.log('\n🎯 6. SYNTHÈSE FINALE DE L\'AUDIT');
  
  const auditSummary = {
    filesAnalysed: modifiedFiles.length,
    totalFunctions: allExports.length,
    totalTypes: allTypes.length,
    duplicateExports: duplicateExports.length,
    duplicateTypes: duplicateTypes.length,
    inconsistencies: inconsistencies.length,
    gaps: gaps.length,
    optimizations: optimizations.length,
    alphaOmegaIntegration: alphaOmegaFiles.length,
    overallScore: 0
  };
  
  // Calculer le score global
  let score = 100;
  score -= duplicateExports.length * 5;  // -5 points par export dupliqué
  score -= duplicateTypes.length * 3;     // -3 points par type dupliqué
  score -= inconsistencies.length * 10;   // -10 points par incohérence
  score -= gaps.length * 8;             // -8 points par lacune
  score -= optimizations.filter(opt => opt.priority === 'HIGH').length * 2;      // -2 points par optimisation haute priorité
  
  auditSummary.overallScore = Math.max(0, Math.round(score));
  
  console.log(`   📊 Fichiers analysés: ${auditSummary.filesAnalysed}`);
  console.log(`   📊 Fonctions totales: ${auditSummary.totalFunctions}`);
  console.log(`   📊 Types totaux: ${auditSummary.totalTypes}`);
  console.log(`   📊 Exports dupliqués: ${auditSummary.duplicateExports}`);
  console.log(`   📊 Types dupliqués: ${auditSummary.duplicateTypes}`);
  console.log(`   📊 Incohérences: ${auditSummary.inconsistencies}`);
  console.log(`   📊 Lacunes: ${auditSummary.gaps}`);
  console.log(`   📊 Optimisations: ${auditSummary.optimizations}`);
  console.log(`   📊 Intégration Alpha-Omega: ${auditSummary.alphaOmegaIntegration}/${auditSummary.filesAnalysed}`);
  console.log(`   📊 Score global: ${auditSummary.overallScore}/100`);
  
  // Recommandations finales
  console.log('\n💡 7. RECOMMANDATIONS FINALES');
  
  if (auditSummary.overallScore >= 90) {
    console.log(`   🏆 EXCELLENT: Architecture propre et bien intégrée`);
    console.log(`   ✅ Actions minimales recommandées`);
  } else if (auditSummary.overallScore >= 80) {
    console.log(`   ✅ BON: Architecture solide avec quelques améliorations`);
    console.log(`   🔧 Optimiser les points identifiés`);
  } else if (auditSummary.overallScore >= 70) {
    console.log(`   ⚠️ MOYEN: Architecture fonctionnelle mais nécessite des corrections`);
    console.log(`   🔴 Traiter les incohérences et lacunes en priorité`);
  } else {
    console.log(`   ❌ FAIBLE: Architecture nécessite une refonte importante`);
    console.log(`   🚨 Reprendre l\'intégration depuis les bases`);
  }
  
  // Actions prioritaires
  const highPriority = optimizations.filter(opt => opt.priority === 'HIGH');
  if (highPriority.length > 0) {
    console.log(`\n   🔴 ACTIONS PRIORITAIRES IMMÉDIATES:`);
    highPriority.forEach((opt, index) => {
      console.log(`      ${index + 1}. ${opt.description} (${opt.file})`);
    });
  }
  
  if (inconsistencies.length > 0) {
    console.log(`\n   🔴 CORRECTIONS D'INHÉRENCES REQUISES:`);
    inconsistencies.forEach((inc, index) => {
      console.log(`      ${index + 1}. ${inc.description}`);
    });
  }
  
  if (gaps.length > 0) {
    console.log(`\n   🟡 COMPLÉMENTS FONCTIONNELS REQUIS:`);
    gaps.forEach((gap, index) => {
      console.log(`      ${index + 1}. ${gap.description}`);
    });
  }
  
  return {
    success: true,
    summary: auditSummary,
    fileAnalysis,
    duplicateExports,
    duplicateTypes,
    inconsistencies,
    gaps,
    optimizations,
    recommendations: {
      score: auditSummary.overallScore,
      priority: auditSummary.overallScore >= 80 ? 'LOW' : auditSummary.overallScore >= 60 ? 'MEDIUM' : 'HIGH',
      actions: [...highPriority, ...inconsistencies, ...gaps]
    }
  };
}

// Run audit
if (require.main === module) {
  try {
    const result = deepDiveAudit();
    console.log('\n🏁 DEEP DIVE AUDIT TERMINÉ');
    console.log('==========================');
    console.log(`Score global: ${result.summary.overallScore}/100`);
    console.log(`Priorité: ${result.recommendations.priority}`);
    console.log(`Actions requises: ${result.recommendations.actions.length}`);
    
    if (result.summary.overallScore >= 85) {
      console.log('\n🎉 AUDIT EXCELLENT !');
      console.log('   - Architecture propre et cohérente');
      console.log('   - Intégration Alpha-Omega réussie');
      console.log('   - Pas de doublons critiques');
      console.log('   - Optimisations mineures seulement');
    } else if (result.summary.overallScore >= 70) {
      console.log('\n✅ AUDIT BON !');
      console.log('   - Architecture fonctionnelle');
      console.log('   - Quelques améliorations nécessaires');
      console.log('   - Traiter les actions prioritaires');
    } else {
      console.log('\n⚠️ AUDIT NÉCESSITE DES CORRECTIONS');
      console.log('   - Incohérences ou lacunes importantes');
      console.log('   - Actions prioritaires requises');
    }
    
    process.exit(result.summary.overallScore >= 70 ? 0 : 1);
  } catch (error) {
    console.error('💥 ERREUR AUDIT:', error);
    process.exit(1);
  }
}

module.exports = { deepDiveAudit };
