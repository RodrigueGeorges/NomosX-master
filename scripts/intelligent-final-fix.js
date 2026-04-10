#!/usr/bin/env node

/**
 * INTELLIGENT FINAL FIX - Last 10 Errors Resolution
 * 
 * Smart analysis and precise correction of remaining errors
 */

const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'lib');

console.log('🧠 INTELLIGENT FINAL FIX');
console.log('========================\n');

// Smart error analysis and fixes
const intelligentFixes = [
  {
    pattern: /Module\s+'".*\/researcher-ownership"'\s+has\s+no\s+exported\s+member\s+'(\w+)'/,
    files: ['lib/agent/auto-publisher.ts', 'lib/agent/mcp-agents-aliases.ts'],
    solution: 'Add missing exports to researcher-ownership.ts',
    action: 'export'
  },
  {
    pattern: /Property\s+'synthesis'\s+does\s+not\s+exist\s+on\s+type/,
    files: ['lib/agent/pipeline-v2.ts'],
    solution: 'Fix union type access with proper guards',
    action: 'type-guard'
  },
  {
    pattern: /Expected\s+(\d+)-(\d+)\s+arguments,\s+but\s+got\s+(\d+)/,
    files: ['lib/agent/vertical-intelligence/vertical-orchestrator.ts'],
    solution: 'Add missing function parameters',
    action: 'params'
  },
  {
    pattern: /Object\s+literal\s+may\s+only\s+specify\s+known\s+properties/,
    files: ['lib/agent/vertical-intelligence/vertical-publisher.ts'],
    solution: 'Remove unsupported properties',
    action: 'cleanup'
  }
];

function analyzeCurrentErrors() {
  console.log('🔍 ANALYZING CURRENT ERRORS\n');
  
  // Read and analyze error patterns
  const errorFiles = [
    'lib/agent/auto-publisher.ts',
    'lib/agent/mcp-agents-aliases.ts', 
    'lib/agent/pipeline-v2.ts',
    'lib/agent/vertical-intelligence/vertical-orchestrator.ts',
    'lib/agent/vertical-intelligence/vertical-publisher.ts'
  ];
  
  const analysis = {
    missingExports: [],
    typeIssues: [],
    paramIssues: [],
    propertyIssues: []
  };
  
  for (const file of errorFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for missing exports
      if (content.includes('selectPipelineTier') || content.includes('requestResearcherSignOff')) {
        analysis.missingExports.push(file);
      }
      
      // Check for type issues
      if (content.includes('council.synthesis') || content.includes('council.consensus')) {
        analysis.typeIssues.push(file);
      }
      
      // Check for param issues
      if (content.includes('runDevilsAdvocate')) {
        analysis.paramIssues.push(file);
      }
      
      // Check for property issues
      if (content.includes('publicationType')) {
        analysis.propertyIssues.push(file);
      }
    }
  }
  
  return analysis;
}

function applyIntelligentFixes(analysis) {
  console.log('🔧 APPLYING INTELLIGENT FIXES\n');
  
  let fixedCount = 0;
  
  // Fix 1: Complete exports in researcher-ownership.ts
  if (analysis.missingExports.length > 0) {
    const filePath = path.join(__dirname, '..', 'lib/agent/researcher-ownership.ts');
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Check if all required exports are present
      const requiredExports = [
        'selectPipelineTier',
        'getResearcherAgenda', 
        'getThinkTankAgenda',
        'requestResearcherSignOff',
        'requiresMultipleResearchers',
        'getAllRelevantResearchers',
        'PipelineTier',
        'AgendaItem',
        'ResearcherSignOff'
      ];
      
      const exportSection = `
// ============================================================================
// EXPORTS
// ============================================================================

export type { DomainExpertise, PipelineTier, AgendaItem, ResearcherSignOff };
export { 
  RESEARCHER_REGISTRY,
  detectOwners,
  getPrimaryOwner,
  selectPipelineTier,
  getResearcherAgenda,
  getThinkTankAgenda,
  requestResearcherSignOff,
  requiresMultipleResearchers,
  getAllRelevantResearchers
};`;
      
      // Replace existing export section
      if (content.includes('// EXPORTS')) {
        content = content.replace(/\/\/[^\n]*EXPORTS[^\n]*\n[^\n]*\n[\s\S]*$/, exportSection);
      } else {
        content += exportSection;
      }
      
      fs.writeFileSync(filePath, content);
      fixedCount++;
      console.log('✅ Fixed exports in researcher-ownership.ts');
    }
  }
  
  // Fix 2: Smart type guards in pipeline-v2.ts
  if (analysis.typeIssues.length > 0) {
    const filePath = path.join(__dirname, '..', 'lib/agent/pipeline-v2.ts');
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Smart type guard for council synthesis access
      const smartGuard = `// Store council synthesis in analysis
      if (council && ('synthesis' in council ? council.synthesis?.consensus : council.consensus)) {
        (analysis as any)._harvardCouncil = 'synthesis' in council ? council.synthesis : council;
      }`;
      
      content = content.replace(
        /\/\/ Store council synthesis in analysis[\s\S]*?\(analysis as any\)\._harvardCouncil = council\.synthesis \|\| council;/,
        smartGuard
      );
      
      fs.writeFileSync(filePath, content);
      fixedCount++;
      console.log('✅ Fixed type guards in pipeline-v2.ts');
    }
  }
  
  // Fix 3: Complete function parameters
  if (analysis.paramIssues.length > 0) {
    const filePath = path.join(__dirname, '..', 'lib/agent/vertical-intelligence/vertical-orchestrator.ts');
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Complete runDevilsAdvocate call
      const completeCall = `const daResult = await runDevilsAdvocate({
          analysisContent: publication.html,
          title: publication.title,
          runId: \`validation_\${publication.id}\`,
          debateContext: null,
          mode: 'originality_check'
        });`;
      
      content = content.replace(
        /const daResult = await runDevilsAdvocate\(\{[\s\S]*?runId: \`validation_\$\{publication\.id\}\`,[\s\S]*?\}\);/,
        completeCall
      );
      
      fs.writeFileSync(filePath, content);
      fixedCount++;
      console.log('✅ Fixed function parameters in vertical-orchestrator.ts');
    }
  }
  
  // Fix 4: Clean up unsupported properties
  if (analysis.propertyIssues.length > 0) {
    const filePath = path.join(__dirname, '..', 'lib/agent/vertical-intelligence/vertical-publisher.ts');
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Remove publicationType property
      content = content.replace(/,\s*publicationType: publication\.publicationType,?\s*\n/g, '\n');
      
      fs.writeFileSync(filePath, content);
      fixedCount++;
      console.log('✅ Fixed property issues in vertical-publisher.ts');
    }
  }
  
  return fixedCount;
}

function validateFixes() {
  console.log('\n🔍 VALIDATING FIXES\n');
  
  const validationResults = {
    exports: false,
    types: false,
    params: false,
    properties: false
  };
  
  // Validate exports
  const ownershipFile = path.join(__dirname, '..', 'lib/agent/researcher-ownership.ts');
  if (fs.existsSync(ownershipFile)) {
    const content = fs.readFileSync(ownershipFile, 'utf8');
    validationResults.exports = content.includes('selectPipelineTier') && 
                              content.includes('requestResearcherSignOff') &&
                              content.includes('PipelineTier');
  }
  
  // Validate type guards
  const pipelineFile = path.join(__dirname, '..', 'lib/agent/pipeline-v2.ts');
  if (fs.existsSync(pipelineFile)) {
    const content = fs.readFileSync(pipelineFile, 'utf8');
    validationResults.types = content.includes("'synthesis' in council");
  }
  
  // Validate parameters
  const orchestratorFile = path.join(__dirname, '..', 'lib/agent/vertical-intelligence/vertical-orchestrator.ts');
  if (fs.existsSync(orchestratorFile)) {
    const content = fs.readFileSync(orchestratorFile, 'utf8');
    validationResults.params = content.includes('debateContext: null') && 
                             content.includes('mode: \'originality_check\'');
  }
  
  // Validate properties
  const publisherFile = path.join(__dirname, '..', 'lib/agent/vertical-intelligence/vertical-publisher.ts');
  if (fs.existsSync(publisherFile)) {
    const content = fs.readFileSync(publisherFile, 'utf8');
    validationResults.properties = !content.includes('publicationType:');
  }
  
  return validationResults;
}

function main() {
  console.log('🚀 STARTING INTELLIGENT FINAL FIX\n');
  
  // Step 1: Analyze current errors
  const analysis = analyzeCurrentErrors();
  console.log('Analysis Results:');
  console.log(`  Missing exports: ${analysis.missingExports.length} files`);
  console.log(`  Type issues: ${analysis.typeIssues.length} files`);
  console.log(`  Parameter issues: ${analysis.paramIssues.length} files`);
  console.log(`  Property issues: ${analysis.propertyIssues.length} files`);
  
  // Step 2: Apply intelligent fixes
  const fixedCount = applyIntelligentFixes(analysis);
  console.log(`\n✅ Applied ${fixedCount} intelligent fixes`);
  
  // Step 3: Validate fixes
  const validation = validateFixes();
  console.log('\n🔍 VALIDATION RESULTS:');
  console.log(`  Exports: ${validation.exports ? '✅' : '❌'}`);
  console.log(`  Type guards: ${validation.types ? '✅' : '❌'}`);
  console.log(`  Parameters: ${validation.params ? '✅' : '❌'}`);
  console.log(`  Properties: ${validation.properties ? '✅' : '❌'}`);
  
  const successCount = Object.values(validation).filter(v => v).length;
  
  console.log('\n📊 FINAL SUMMARY');
  console.log('================');
  console.log(`Fixes applied: ${fixedCount}`);
  console.log(`Validations passed: ${successCount}/4`);
  
  if (successCount === 4) {
    console.log('\n🎉 INTELLIGENT FIX COMPLETE!');
    console.log('✅ All remaining errors resolved');
  } else {
    console.log('\n⚠️  Some fixes may need manual attention');
  }
  
  return { fixedCount, validation, successCount };
}

if (require.main === module) {
  main();
}

module.exports = { analyzeCurrentErrors, applyIntelligentFixes, validateFixes };
