#!/usr/bin/env node

/**
 * EXPORTS VALIDATION SCRIPT
 * 
 * Validates that all required exports are present in researcher-ownership.ts
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 VALIDATING EXPORTS');
console.log('====================\n');

const researcherOwnershipPath = path.join(__dirname, '..', 'lib/agent/researcher-ownership.ts');

if (!fs.existsSync(researcherOwnershipPath)) {
  console.error('❌ researcher-ownership.ts not found');
  process.exit(1);
}

const content = fs.readFileSync(researcherOwnershipPath, 'utf8');

// Required exports
const requiredExports = {
  types: ['DomainExpertise', 'PipelineTier', 'AgendaItem', 'ResearcherSignOff'],
  functions: [
    'RESEARCHER_REGISTRY',
    'detectOwners',
    'getPrimaryOwner',
    'selectPipelineTier',
    'getResearcherAgenda',
    'getThinkTankAgenda',
    'requestResearcherSignOff',
    'requiresMultipleResearchers',
    'getAllRelevantResearchers'
  ]
};

console.log('📋 CHECKING TYPE EXPORTS:');
let allTypesPresent = true;
for (const type of requiredExports.types) {
  const present = content.includes(`export type { ${type } }`) || 
                 content.includes(`export type { ${type}`);
  console.log(`  ${type}: ${present ? '✅' : '❌'}`);
  if (!present) allTypesPresent = false;
}

console.log('\n📋 CHECKING FUNCTION EXPORTS:');
let allFunctionsPresent = true;
for (const func of requiredExports.functions) {
  const present = content.includes(func);
  console.log(`  ${func}: ${present ? '✅' : '❌'}`);
  if (!present) allFunctionsPresent = false;
}

console.log('\n📊 VALIDATION RESULTS:');
console.log(`  Types: ${allTypesPresent ? '✅ All present' : '❌ Missing types'}`);
console.log(`  Functions: ${allFunctionsPresent ? '✅ All present' : '❌ Missing functions'}`);

if (allTypesPresent && allFunctionsPresent) {
  console.log('\n🎉 ALL EXPORTS VALIDATED!');
  console.log('✅ researcher-ownership.ts exports are complete');
} else {
  console.log('\n⚠️  EXPORTS VALIDATION FAILED');
  console.log('❌ Some required exports are missing');
  
  // Show what's missing
  console.log('\n🔧 MISSING EXPORTS:');
  if (!allTypesPresent) {
    for (const type of requiredExports.types) {
      if (!content.includes(`export type { ${type } }`) && !content.includes(`export type { ${type}`)) {
        console.log(`  - Type: ${type}`);
      }
    }
  }
  if (!allFunctionsPresent) {
    for (const func of requiredExports.functions) {
      if (!content.includes(func)) {
        console.log(`  - Function: ${func}`);
      }
    }
  }
}

// Check if the file has proper structure
console.log('\n📋 FILE STRUCTURE CHECK:');
const hasExportSection = content.includes('// EXPORTS');
const hasTypeExports = content.includes('export type {');
const hasFunctionExports = content.includes('export {');

console.log(`  Export section: ${hasExportSection ? '✅' : '❌'}`);
console.log(`  Type exports: ${hasTypeExports ? '✅' : '❌'}`);
console.log(`  Function exports: ${hasFunctionExports ? '✅' : '❌'}`);

// Show the actual export section
const exportSectionMatch = content.match(/\/\/ EXPORTS[\s\S]*$/);
if (exportSectionMatch) {
  console.log('\n📄 CURRENT EXPORT SECTION:');
  console.log(exportSectionMatch[0]);
}

process.exit(allTypesPresent && allFunctionsPresent ? 0 : 1);
