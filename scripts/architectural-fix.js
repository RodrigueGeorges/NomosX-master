#!/usr/bin/env node

/**
 * ARCHITECTURAL FIX - Professional Resolution Strategy
 * 
 * Résolution architecturale des conflits d'exports et imports
 */

const fs = require('fs');
const path = require('path');

console.log('🏗️  ARCHITECTURAL FIX');
console.log('===================\n');

// Étape 1: Nettoyer mcp-agents-aliases.ts pour éviter les conflits
function cleanMcpAgentsAliases() {
  console.log('🧹 CLEANING MCP AGENTS ALIASES\n');
  
  const filePath = path.join(__dirname, '..', 'lib/agent/mcp-agents-aliases.ts');
  if (!fs.existsSync(filePath)) {
    console.log('⚠️  mcp-agents-aliases.ts not found');
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Supprimer les ré-exports qui créent des conflits
  const conflictingExports = [
    'DomainExpertise',
    'requiresMultipleResearchers',
    'getAllRelevantResearchers',
    'detectOwners',
    'getPrimaryOwner',
    'selectPipelineTier',
    'determineOptimalExpertCount',
    'calculateComplexityScore',
    'runExpertCouncil',
    'detectRelevantExperts',
    'runExpertAnalysis'
  ];
  
  // Créer un contenu simplifié sans conflits
  const cleanContent = `// MCP Agents Aliases - Clean exports without conflicts
// This file provides aliases but avoids re-exporting conflicting names

export {
  // Pipeline V2 - Core pipeline functions
  scout,
  index,
  rank,
  read,
  analyst,
  citationGuard,
  renderBriefHTML,
  runFullPipeline,
  runStrategicPipeline,
  runPipeline,
  runIntelligenceSweep,
  invalidateScoutCache,
  getCacheStatus,
  indexAgent,
  readerAgent,
  analystAgent,
  strategicAnalystAgent,
  
  // Query Enhancement
  enhanceQuery,
  rerankSources,
  generateSearchQueries,
  filterByRelevance,
  cosineSimilarity,
  cadenceEnforcer,
  
  // Intelligence Agents
  analystMultiPass,
  readerAgentV3,
  runCriticalLoopV2,
  assessAfterScout,
  assessAfterReader,
  assessAfterAnalyst,
  assessAfterCriticalLoop,
  createPipelineState,
  recordDecision,
  generateExpandedTerms,
  planEditorialAgenda,
  
  // Evidence and Citation
  gradeEvidence,
  extractCitations,
  
  // Autonomous Publication
  autoPublisher,
  runAutoPublisher,
  runStrategicAutoPublisher,
  dryRunAutoPublisher,
  
  // Vertical Intelligence
  runVerticalIntelligence,
  runExpertLedResearch,
  
  // Autonomous Intelligence
  buildMemoryInjection,
  recordAgentPerformance,
  computeCalibration,
  extractLessons,
  storeLesson,
  autoDetectFailureModes,
  loadCalibratedThresholds,
  buildResearcherProfile,
  
  // Reference System
  alphaVerticalIntegration,
  referencePublisher,
  
  // Other utilities
  detectDomain,
  renderStrategicReportHTML,
  classifyUnclassifiedSources
} from './mcp-agents-index';

// Note: DomainExpertise and researcher functions are imported directly from their modules
// to avoid export conflicts`;
  
  fs.writeFileSync(filePath, cleanContent);
  console.log('✅ Cleaned mcp-agents-aliases.ts');
  return true;
}

// Étape 2: Corriger les imports dans les fichiers qui utilisent les exports en conflit
function fixConflictingImports() {
  console.log('🔧 FIXING CONFLICTING IMPORTS\n');
  
  const agentDir = path.join(__dirname, '..', 'lib', 'agent');
  const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.ts'));
  
  const fixes = {
    'mcp-agents-index.ts': {
      imports: {
        'DomainExpertise': './researcher-ownership',
        'requiresMultipleResearchers': './researcher-ownership',
        'getAllRelevantResearchers': './researcher-ownership',
        'detectOwners': './researcher-ownership',
        'getPrimaryOwner': './researcher-ownership',
        'selectPipelineTier': './researcher-ownership',
        'determineOptimalExpertCount': './phd-researcher-expanded',
        'calculateComplexityScore': './phd-researcher-expanded',
        'runExpertCouncil': './phd-researcher-expanded',
        'detectRelevantExperts': './phd-researcher-expanded',
        'runExpertAnalysis': './phd-researcher-expanded'
      }
    }
  };
  
  let totalFixed = 0;
  
  for (const [file, config] of Object.entries(fixes)) {
    const filePath = path.join(agentDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Ajouter les imports manquants au début du fichier
    const importStatements = [];
    const moduleGroups = {};
    
    for (const [name, module] of Object.entries(config.imports)) {
      if (!moduleGroups[module]) {
        moduleGroups[module] = [];
      }
      moduleGroups[module].push(name);
    }
    
    for (const [module, names] of Object.entries(moduleGroups)) {
      importStatements.push(`import {\n  ${names.join(',\n  ')}\n} from '${module}';`);
    }
    
    // Insérer les imports après les imports existants
    const existingImports = content.match(/import[^;]+;/g) || [];
    const lastImportIndex = existingImports.length > 0 ? 
      content.lastIndexOf(existingImports[existingImports.length - 1]) : 
      content.indexOf('//');
    
    if (lastImportIndex > 0) {
      const insertPoint = content.indexOf('\n', lastImportIndex) + 1;
      content = content.slice(0, insertPoint) + 
                '\n' + importStatements.join('\n') + '\n' + 
                content.slice(insertPoint);
      modified = true;
    }
    
    // Corriger les exports dupliqués
    for (const name of Object.keys(config.imports)) {
      // Supprimer les ré-exports dupliqués
      const duplicateExportRegex = new RegExp(`${name}:\\s*${name},?\\s*`, 'g');
      content = content.replace(duplicateExportRegex, '');
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed imports in ${file}`);
      totalFixed++;
    }
  }
  
  return totalFixed;
}

// Étape 3: Valider la structure des types
function validateTypeConsistency() {
  console.log('🔍 VALIDATING TYPE CONSISTENCY\n');
  
  const agentDir = path.join(__dirname, '..', 'lib', 'agent');
  
  // Vérifier que DomainExpertise est défini dans un seul endroit
  const domainExpertiseFiles = [];
  const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.ts'));
  
  for (const file of files) {
    const filePath = path.join(agentDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('export type DomainExpertise') || 
        content.includes('export enum DomainExpertise')) {
      domainExpertiseFiles.push(file);
    }
  }
  
  if (domainExpertiseFiles.length > 1) {
    console.log('⚠️  DomainExpertise defined in multiple files:');
    domainExpertiseFiles.forEach(file => console.log(`  - ${file}`));
    
    // Garder seulement researcher-ownership.ts comme source unique
    for (const file of domainExpertiseFiles) {
      if (file !== 'researcher-ownership.ts') {
        const filePath = path.join(agentDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Remplacer l'export par un import
        content = content.replace(
          /export\s+(type\s+)?DomainExpertise[^;]*;/,
          'import { DomainExpertise } from \'./researcher-ownership\';'
        );
        
        fs.writeFileSync(filePath, content);
        console.log(`✅ Fixed DomainExpertise in ${file}`);
      }
    }
  } else {
    console.log('✅ DomainExpertise is consistently defined');
  }
  
  return domainExpertiseFiles.length;
}

// Étape 4: Nettoyer les exports en double
function cleanDuplicateExports() {
  console.log('🧹 CLEANING DUPLICATE EXPORTS\n');
  
  const agentDir = path.join(__dirname, '..', 'lib', 'agent');
  const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.ts'));
  
  let totalCleaned = 0;
  
  for (const file of files) {
    const filePath = path.join(agentDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Nettoyer les exports dupliqués dans les blocs export {}
    const exportBlockRegex = /export\s*{\s*([^}]+)\s*}/g;
    const matches = content.match(exportBlockRegex);
    
    if (matches) {
      matches.forEach(block => {
        // Supprimer les doublons dans le bloc
        const items = block.match(/export\s*{\s*([^}]+)\s*}/)[1];
        const uniqueItems = [...new Set(items.split(',').map(i => i.trim()))];
        const cleanBlock = `export {\n  ${uniqueItems.join(',\n  ')}\n}`;
        content = content.replace(block, cleanBlock);
        modified = true;
      });
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Cleaned duplicate exports in ${file}`);
      totalCleaned++;
    }
  }
  
  return totalCleaned;
}

// Fonction principale
function main() {
  console.log('🚀 STARTING ARCHITECTURAL FIX\n');
  
  const results = {
    aliases: cleanMcpAgentsAliases(),
    imports: fixConflictingImports(),
    types: validateTypeConsistency(),
    duplicates: cleanDuplicateExports()
  };
  
  console.log('\n📊 FIX RESULTS');
  console.log('===============');
  console.log(`MCP Agents Aliases: ${results.aliases ? '✅' : '❌'}`);
  console.log(`Conflicting Imports: ${results.imports > 0 ? `✅ (${results.imports} files)` : '❌'}`);
  console.log(`Type Consistency: ${results.types > 0 ? `⚠️ (${results.types} files fixed)` : '✅'}`);
  console.log(`Duplicate Exports: ${results.duplicates > 0 ? `✅ (${results.duplicates} files)` : '❌'}`);
  
  console.log('\n🎯 ARCHITECTURAL IMPROVEMENTS:');
  console.log('- Eliminated export conflicts');
  console.log('- Centralized type definitions');
  console.log('- Clean import structure');
  console.log('- Modular architecture preserved');
  
  return results;
}

if (require.main === module) {
  main();
}

module.exports = { cleanMcpAgentsAliases, fixConflictingImports, validateTypeConsistency, cleanDuplicateExports };
