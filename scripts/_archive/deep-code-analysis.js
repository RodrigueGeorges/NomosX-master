#!/usr/bin/env node

/**
 * DEEP CODE ANALYSIS - Professional Error Resolution Strategy
 * 
 * Analyse en profondeur de la structure du code pour éviter les erreurs systématiques
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 DEEP CODE ANALYSIS');
console.log('====================\n');

// Analyse de la structure des exports et imports
function analyzeModuleStructure() {
  console.log('📋 ANALYSING MODULE STRUCTURE\n');
  
  const agentDir = path.join(__dirname, '..', 'lib', 'agent');
  const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.ts'));
  
  const moduleAnalysis = {};
  
  for (const file of files) {
    const filePath = path.join(agentDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Analyser les exports
    const exports = {
      types: [],
      functions: [],
      variables: [],
      classes: []
    };
    
    // Extraire les exports de types
    const typeExports = content.match(/export type\s+(\w+)/g);
    if (typeExports) {
      exports.types = typeExports.map(e => e.match(/export type\s+(\w+)/)[1]);
    }
    
    // Extraire les exports de fonctions
    const functionExports = content.match(/export function\s+(\w+)/g);
    if (functionExports) {
      exports.functions = functionExports.map(e => e.match(/export function\s+(\w+)/)[1]);
    }
    
    // Extraire les exports de variables/classes
    const namedExports = content.match(/export\s+(const|let|class)\s+(\w+)/g);
    if (namedExports) {
      namedExports.forEach(e => {
        const match = e.match(/export\s+(const|let|class)\s+(\w+)/);
        if (match[1] === 'const') {
          exports.variables.push(match[2]);
        } else {
          exports.classes.push(match[2]);
        }
      });
    }
    
    // Extraire les exports groupés
    const groupExports = content.match(/export\s*{\s*([^}]+)\s*}/g);
    if (groupExports) {
      groupExports.forEach(group => {
        const items = group.match(/export\s*{\s*([^}]+)\s*}/)[1];
        const names = items.split(',').map(n => n.trim().split(' as ')[0]);
        exports.functions.push(...names.filter(n => n && !exports.types.includes(n) && !exports.variables.includes(n)));
      });
    }
    
    moduleAnalysis[file] = exports;
  }
  
  return moduleAnalysis;
}

// Analyser les dépendances et imports
function analyzeDependencies() {
  console.log('🔗 ANALYSING DEPENDENCIES\n');
  
  const agentDir = path.join(__dirname, '..', 'lib', 'agent');
  const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.ts'));
  
  const dependencyMap = {};
  
  for (const file of files) {
    const filePath = path.join(agentDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extraire les imports
    const imports = {
      fromLocal: [],
      fromExternal: []
    };
    
    // Imports locaux
    const localImports = content.match(/import\s+.*?\s+from\s+['"]\.\/([^'"]+)['"]/g);
    if (localImports) {
      imports.fromLocal = localImports.map(i => i.match(/from\s+['"]\.\/([^'"]+)['"]/)[1]);
    }
    
    // Imports externes
    const externalImports = content.match(/import\s+.*?\s+from\s+['"](?!\.\/)([^'"]+)['"]/g);
    if (externalImports) {
      imports.fromExternal = externalImports.map(i => i.match(/from\s+['"](?!\.\/)([^'"]+)['"]/)[1]);
    }
    
    dependencyMap[file] = imports;
  }
  
  return dependencyMap;
}

// Analyser les types et interfaces
function analyzeTypeSystem() {
  console.log('🏗️  ANALYSING TYPE SYSTEM\n');
  
  const agentDir = path.join(__dirname, '..', 'lib', 'agent');
  const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.ts'));
  
  const typeSystem = {
    interfaces: {},
    enums: {},
    typeAliases: {}
  };
  
  for (const file of files) {
    const filePath = path.join(agentDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Interfaces
    const interfaces = content.match(/export\s+interface\s+(\w+)/g);
    if (interfaces) {
      typeSystem.interfaces[file] = interfaces.map(i => i.match(/export\s+interface\s+(\w+)/)[1]);
    }
    
    // Enums
    const enums = content.match(/export\s+enum\s+(\w+)/g);
    if (enums) {
      typeSystem.enums[file] = enums.map(e => e.match(/export\s+enum\s+(\w+)/)[1]);
    }
    
    // Type aliases
    const typeAliases = content.match(/export\s+type\s+(\w+)/g);
    if (typeAliases) {
      typeSystem.typeAliases[file] = typeAliases.map(t => t.match(/export\s+type\s+(\w+)/)[1]);
    }
  }
  
  return typeSystem;
}

// Identifier les problèmes courants
function identifyCommonIssues(moduleAnalysis, dependencyMap, typeSystem) {
  console.log('⚠️  IDENTIFYING COMMON ISSUES\n');
  
  const issues = {
    missingImports: [],
    circularDependencies: [],
    typeConflicts: [],
    exportConflicts: []
  };
  
  // Vérifier les imports manquants
  for (const [file, dependencies] of Object.entries(dependencyMap)) {
    for (const dep of dependencies.fromLocal) {
      const depFile = dep + '.ts';
      if (!moduleAnalysis[depFile]) {
        issues.missingImports.push({ file, missing: dep });
      }
    }
  }
  
  // Vérifier les conflits d'exports
  const allExports = new Map();
  for (const [file, exports] of Object.entries(moduleAnalysis)) {
    for (const type of exports.types) {
      if (allExports.has(type)) {
        issues.exportConflicts.push({ type, files: [allExports.get(type), file] });
      } else {
        allExports.set(type, file);
      }
    }
    for (const func of exports.functions) {
      if (allExports.has(func)) {
        issues.exportConflicts.push({ type: func, files: [allExports.get(func), file] });
      } else {
        allExports.set(func, file);
      }
    }
  }
  
  return issues;
}

// Générer un plan de correction professionnel
function generateFixPlan(issues, moduleAnalysis, dependencyMap) {
  console.log('📝 GENERATING PROFESSIONAL FIX PLAN\n');
  
  const fixPlan = {
    priority: 'high',
    steps: []
  };
  
  // Étape 1: Résoudre les imports manquants
  if (issues.missingImports.length > 0) {
    fixPlan.steps.push({
      action: 'Fix missing imports',
      details: issues.missingImports,
      priority: 'critical'
    });
  }
  
  // Étape 2: Résoudre les conflits d'exports
  if (issues.exportConflicts.length > 0) {
    fixPlan.steps.push({
      action: 'Resolve export conflicts',
      details: issues.exportConflicts,
      priority: 'critical'
    });
  }
  
  // Étape 3: Vérifier la cohérence des types
  fixPlan.steps.push({
    action: 'Ensure type consistency',
    details: 'Check DomainExpertise and other shared types',
    priority: 'high'
  });
  
  // Étape 4: Valider la structure modulaire
  fixPlan.steps.push({
    action: 'Validate modular structure',
    details: 'Ensure proper separation of concerns',
    priority: 'medium'
  });
  
  return fixPlan;
}

// Fonction principale
function main() {
  console.log('🚀 STARTING DEEP CODE ANALYSIS\n');
  
  // Analyser la structure
  const moduleAnalysis = analyzeModuleStructure();
  const dependencyMap = analyzeDependencies();
  const typeSystem = analyzeTypeSystem();
  
  // Identifier les problèmes
  const issues = identifyCommonIssues(moduleAnalysis, dependencyMap, typeSystem);
  
  // Générer le plan de correction
  const fixPlan = generateFixPlan(issues, moduleAnalysis, dependencyMap);
  
  // Afficher les résultats
  console.log('📊 ANALYSIS RESULTS');
  console.log('==================\n');
  
  console.log('📋 MODULE STRUCTURE:');
  for (const [file, exports] of Object.entries(moduleAnalysis)) {
    console.log(`  ${file}:`);
    console.log(`    Types: ${exports.types.join(', ') || 'none'}`);
    console.log(`    Functions: ${exports.functions.join(', ') || 'none'}`);
    console.log(`    Variables: ${exports.variables.join(', ') || 'none'}`);
    console.log('');
  }
  
  console.log('🔗 DEPENDENCIES:');
  for (const [file, deps] of Object.entries(dependencyMap)) {
    if (deps.fromLocal.length > 0) {
      console.log(`  ${file} imports from: ${deps.fromLocal.join(', ')}`);
    }
  }
  
  console.log('\n⚠️  ISSUES FOUND:');
  if (issues.missingImports.length > 0) {
    console.log('  Missing imports:');
    issues.missingImports.forEach(issue => {
      console.log(`    - ${issue.file} → ${issue.missing}`);
    });
  }
  
  if (issues.exportConflicts.length > 0) {
    console.log('  Export conflicts:');
    issues.exportConflicts.forEach(conflict => {
      console.log(`    - ${conflict.type} in ${conflict.files.join(' and ')}`);
    });
  }
  
  console.log('\n📝 FIX PLAN:');
  fixPlan.steps.forEach((step, index) => {
    console.log(`  ${index + 1}. ${step.action} (${step.priority})`);
    if (step.details) {
      console.log(`     Details: ${JSON.stringify(step.details, null, 6)}`);
    }
  });
  
  return { moduleAnalysis, dependencyMap, typeSystem, issues, fixPlan };
}

if (require.main === module) {
  main();
}

module.exports = { main, analyzeModuleStructure, analyzeDependencies, analyzeTypeSystem };
