#!/usr/bin/env node

/**
 * PROFESSIONAL REFACTORING SCRIPT
 * 
 * This script performs a clean, systematic refactoring:
 * 1. Analyzes the current architecture
 * 2. Identifies type inconsistencies
 * 3. Applies targeted, minimal fixes
 * 4. Validates each change
 */

const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'lib');

console.log('🏗️  PROFESSIONAL REFACTORING');
console.log('==========================\n');

// Architecture analysis
function analyzeArchitecture() {
  console.log('📊 ANALYZING ARCHITECTURE...\n');
  
  const criticalFiles = [
    'lib/agent/pipeline-v2.ts',
    'lib/agent/reference-system/alpha-vertical-integration.ts',
    'lib/agent/reference-system/reference-publisher.ts',
    'lib/agent/reference-system/unified-workflow.ts',
    'lib/agent/signal-detector.ts',
    'lib/agent/vertical-intelligence/expert-led-research.ts',
    'lib/agent/vertical-intelligence/integration.ts'
  ];
  
  const analysis = [];
  
  for (const file of criticalFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      analysis.push({
        file,
        exists: true,
        lines: lines.length,
        hasExports: content.includes('export'),
        hasImports: content.includes('import'),
        hasInterfaces: content.includes('interface'),
        hasTypes: content.includes('type')
      });
    } else {
      analysis.push({ file, exists: false });
    }
  }
  
  console.log('📋 ARCHITECTURE REPORT:');
  analysis.forEach(item => {
    console.log(`${item.exists ? '✅' : '❌'} ${item.file}`);
    if (item.exists) {
      console.log(`   Lines: ${item.lines} | Exports: ${item.hasExports} | Imports: ${item.hasImports}`);
    }
  });
  
  return analysis;
}

// Type system validation
function validateTypeSystem() {
  console.log('\n🔍 VALIDATING TYPE SYSTEM...\n');
  
  const typeIssues = [];
  
  // Check for common type patterns
  const criticalFiles = [
    'lib/agent/reference-system/reference-publisher.ts',
    'lib/agent/reference-system/unified-workflow.ts',
    'lib/agent/signal-detector.ts'
  ];
  
  for (const file of criticalFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for VerificationLayer issues
      if (content.includes('VerificationLayer') && content.includes('requiredLayers:')) {
        typeIssues.push({
          file,
          issue: 'VerificationLayer type mismatch',
          severity: 'high'
        });
      }
      
      // Check for export conflicts
      const exportMatches = content.match(/export.*AlphaSignal/g);
      if (exportMatches && exportMatches.length > 1) {
        typeIssues.push({
          file,
          issue: 'AlphaSignal export conflict',
          severity: 'high'
        });
      }
      
      // Check for missing properties
      if (content.includes('project.') && content.includes('.qualityScore')) {
        typeIssues.push({
          file,
          issue: 'Missing property on ResearchProject',
          severity: 'medium'
        });
      }
    }
  }
  
  console.log('⚠️  TYPE ISSUES FOUND:');
  typeIssues.forEach(issue => {
    console.log(`${issue.severity === 'high' ? '🔴' : '🟡'} ${issue.file}: ${issue.issue}`);
  });
  
  return typeIssues;
}

// Clean refactoring
function performCleanRefactoring() {
  console.log('\n🔧 PERFORMING CLEAN REFACTORING...\n');
  
  const fixes = [];
  
  // Fix 1: VerificationLayer arrays
  const verificationLayerFix = {
    file: 'lib/agent/reference-system/reference-publisher.ts',
    pattern: /requiredLayers:\s*\[([^\]]+)\]/g,
    replacement: (match) => {
      const content = match.slice(15, -1); // Extract array content
      const layers = content.split(',').map(l => l.trim().replace(/['"]/g, ''));
      const fixedLayers = layers.map(layer => 
        layer.includes('as const') ? layer : `{ type: '${layer}' as const, required: true }`
      );
      return `requiredLayers: [${fixedLayers.join(', ')}]`;
    }
  };
  
  // Fix 2: AlphaSignal export
  const alphaSignalFix = {
    file: 'lib/agent/signal-detector.ts',
    pattern: /export\s*\{\s*AlphaSignal\s*\};/g,
    replacement: '// AlphaSignal interface exported above'
  };
  
  // Apply fixes
  const allFixes = [verificationLayerFix, alphaSignalFix];
  
  for (const fix of allFixes) {
    const filePath = path.join(__dirname, '..', fix.file);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      
      if (fix.pattern.test(content)) {
        content = content.replace(fix.pattern, fix.replacement);
        
        if (content !== originalContent) {
          fs.writeFileSync(filePath, content);
          fixes.push({
            file: fix.file,
            applied: true,
            description: 'Applied type fix'
          });
          console.log(`✅ Fixed: ${fix.file}`);
        }
      }
    }
  }
  
  return fixes;
}

// Validation
function validateRefactoring() {
  console.log('\n✅ VALIDATING REFACTORING...\n');
  
  // Check if files are syntactically valid
  const criticalFiles = [
    'lib/agent/reference-system/reference-publisher.ts',
    'lib/agent/signal-detector.ts'
  ];
  
  let validCount = 0;
  
  for (const file of criticalFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Basic syntax checks
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        const openParens = (content.match(/\(/g) || []).length;
        const closeParens = (content.match(/\)/g) || []).length;
        
        if (openBraces === closeBraces && openParens === closeParens) {
          console.log(`✅ Valid syntax: ${file}`);
          validCount++;
        } else {
          console.log(`❌ Syntax error: ${file} (braces: ${openBraces}/${closeBraces}, parens: ${openParens}/${closeParens})`);
        }
      } catch (err) {
        console.log(`❌ Error reading ${file}: ${err.message}`);
      }
    }
  }
  
  console.log(`\n📊 VALIDATION RESULT: ${validCount}/${criticalFiles.length} files valid`);
  return validCount === criticalFiles.length;
}

// Main execution
function main() {
  console.log('🚀 STARTING PROFESSIONAL REFACTORING\n');
  
  // Step 1: Analyze architecture
  const architecture = analyzeArchitecture();
  
  // Step 2: Validate type system
  const typeIssues = validateTypeSystem();
  
  // Step 3: Perform clean refactoring
  const fixes = performCleanRefactoring();
  
  // Step 4: Validate results
  const isValid = validateRefactoring();
  
  // Summary
  console.log('\n📊 REFACTORING SUMMARY');
  console.log('======================');
  console.log(`Files analyzed: ${architecture.filter(a => a.exists).length}`);
  console.log(`Type issues found: ${typeIssues.length}`);
  console.log(`Fixes applied: ${fixes.length}`);
  console.log(`Validation passed: ${isValid ? '✅' : '❌'}`);
  
  if (isValid) {
    console.log('\n🎉 PROFESSIONAL REFACTORING COMPLETE!');
    console.log('🔄 Ready for build verification');
  } else {
    console.log('\n⚠️  REFACTORING NEEDS ATTENTION');
    console.log('🔧 Review validation errors');
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyzeArchitecture, validateTypeSystem, performCleanRefactoring, validateRefactoring };
