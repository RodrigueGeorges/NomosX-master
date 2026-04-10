#!/usr/bin/env node

/**
 * FINAL PRECISION FIX - Professional Error Resolution
 * 
 * Targeted fixes for remaining 23 errors with surgical precision
 */

const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'lib');

console.log('🎯 FINAL PRECISION FIX');
console.log('======================\n');

// Targeted error fixes
const precisionFixes = [
  {
    file: 'lib/agent/omega-verification.ts',
    line: 258,
    issue: "Variable 'issues' implicitly has an 'any[]' type",
    fix: "Add explicit type annotation: const issues: string[] = [];"
  },
  {
    file: 'lib/agent/omega-verification.ts',
    line: 279,
    issue: "Variable 'issues' implicitly has an 'any[]' type",
    fix: "Add explicit type annotation: const issues: string[] = [];"
  },
  {
    file: 'lib/agent/phd-researcher.ts',
    line: 100,
    issue: "Property 'finance' is missing in type",
    fix: "Add finance property to DOMAIN_EXPERTISE registry"
  },
  {
    file: 'lib/agent/phd-researcher.ts',
    lines: [886, 887, 909, 910],
    issue: "Argument of type 'string' is not assignable to parameter of type 'DomainExpertise'",
    fix: "Add type casting: as DomainExpertise"
  },
  {
    file: 'lib/agent/pipeline-v2.ts',
    lines: [1481, 1482],
    issue: "Property 'synthesis' and 'consensus' does not exist on type",
    fix: "Access properties through synthesis.synthesis and synthesis.consensus"
  },
  {
    file: 'lib/agent/reference-system/alpha-vertical-integration.ts',
    lines: [305, 306, 307, 308, 309],
    issue: "Object literal may only specify known properties, and 'required' does not exist",
    fix: "Remove 'required' property from VerificationLayer objects"
  },
  {
    file: 'lib/agent/reference-system/reference-publisher.ts',
    lines: [426, 427, 428, 429, 430],
    issue: "Object literal may only specify known properties, and 'required' does not exist",
    fix: "Remove 'required' property from VerificationLayer objects"
  },
  {
    file: 'lib/agent/researcher-ownership.ts',
    line: 651,
    issue: "Object literal may only specify known properties, and 'relevanceScore' does not exist",
    fix: "Remove relevanceScore property or add to ResearcherOwner interface"
  }
];

function applyPrecisionFixes() {
  console.log('🔧 APPLYING PRECISION FIXES\n');
  
  let fixedCount = 0;
  
  for (const fix of precisionFixes) {
    const filePath = path.join(__dirname, '..', fix.file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${fix.file}`);
      continue;
    }
    
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      
      if (fix.line) {
        // Line-specific fixes
        const lines = content.split('\n');
        const targetLine = lines[fix.line - 1];
        
        if (targetLine && targetLine.includes(fix.issue.split("'")[1])) {
          lines[fix.line - 1] = fix.fix;
          content = lines.join('\n');
          fixedCount++;
          console.log(`✅ Fixed line ${fix.line} in ${fix.file}`);
        }
      } else if (fix.lines) {
        // Multi-line fixes
        const lines = content.split('\n');
        let modified = false;
        
        for (const lineNum of fix.lines) {
          const targetLine = lines[lineNum - 1];
          if (targetLine && targetLine.includes(fix.issue.split("'")[1])) {
            lines[lineNum - 1] = fix.fix;
            modified = true;
          }
        }
        
        if (modified) {
          content = lines.join('\n');
          fixedCount++;
          console.log(`✅ Fixed ${fix.lines.length} lines in ${fix.file}`);
        }
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        console.log(`💾 Updated: ${fix.file}`);
      }
      
    } catch (error) {
      console.error(`❌ Error fixing ${fix.file}: ${error.message}`);
    }
  }
  
  return fixedCount;
}

function addMissingFinanceProperty() {
  console.log('\n🔧 ADDING MISSING FINANCE PROPERTY\n');
  
  const filePath = path.join(__dirname, '..', 'lib/agent', 'phd-researcher.ts');
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find the DOMAIN_EXPERTISE object
    const domainExpertiseMatch = content.match(/const DOMAIN_EXPERTISE\s*=\s*\{([^}]+)\}/s*;/);
    
    if (domainExpertiseMatch) {
      const domainExpertiseBlock = domainExpertiseMatch[1];
      
      // Add finance property if missing
      if (!domainExpertiseBlock.includes('finance:')) {
        const financeProperty = `
  finance: {
    name: 'Finance & Markets',
    systemPrompt: 'Expert analysis of financial markets, investment strategies, and economic indicators.'
  },`;
        
        const updatedBlock = domainExpertiseBlock.replace('}', financeProperty + '}');
        content = content.replace(domainExpertiseMatch[0], domainExpertiseMatch[0] + updatedBlock);
        
        fs.writeFileSync(filePath, content);
        console.log('✅ Added finance property to DOMAIN_EXPERTISE');
      }
    }
    
  } catch (error) {
    console.error(`❌ Error adding finance property: ${error.message}`);
  }
}

function fixPipelineV2SynthesisAccess() {
  console.log('\n🔧 FIXING PIPELINE-V2 SYNTHESIS ACCESS\n');
  
  const filePath = path.join(__dirname, '..', 'lib', 'agent', 'pipeline-v2.ts');
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Fix synthesis access
    content = content.replace(/synthesis\.consensus/g, 'synthesis.synthesis?.consensus || "No consensus available"');
    content = content.replace(/synthesis\.synthesis/g, 'synthesis.synthesis?.synthesis || "No synthesis available"');
    
    fs.writeFileSync(filePath, content);
    console.log('✅ Fixed synthesis property access in pipeline-v2.ts');
    
  } catch (error) {
    console.error(`❌ Error fixing pipeline-v2.ts: ${error.message}`);
  }
}

function removeRequiredFromVerificationLayers() {
  console.log('\n🔧 REMOVING 'required' FROM VERIFICATION LAYERS\n');
  
  const files = [
    'lib/agent/reference-system/alpha-vertical-integration.ts',
    'lib/agent/reference-system/reference-publisher.ts'
  ];
  
  for (const file of files) {
    const filePath = path.join(__dirname, '..', file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      continue;
    }
    
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Remove 'required' property from VerificationLayer objects
      content = content.replace(/,\s*required:\s*true\s*,/g, '');
      
      fs.writeFileSync(filePath, content);
      console.log(`✅ Removed 'required' property from ${file}`);
      
    } catch (error) {
      console.error(`❌ Error fixing ${file}: ${error.message}`);
    }
  }
}

function removeRelevanceScore() {
  console.log('\n🔧 REMOVING RELEVANCE SCORE\n');
  
  const filePath = path.join(__dirname, '..', 'lib', 'agent', 'researcher-ownership.ts');
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove relevanceScore from object literals
    content = content.replace(/,\s*relevanceScore:\s*\d+\s*,/g, '');
    
    fs.writeFileSync(filePath, content);
    console.log('✅ Removed relevanceScore from researcher-ownership.ts');
    
  } catch (error) {
    console.error(`❌ Error removing relevanceScore: ${error.message}`);
  }
}

function main() {
  console.log('🚀 STARTING FINAL PRECISION FIX\n');
  
  const results = {
    precisionFixes: applyPrecisionFixes(),
    financeProperty: addMissingFinanceProperty(),
    synthesisAccess: fixPipelineV2SynthesisAccess(),
    verificationLayers: removeRequiredFromVerificationLayers(),
    relevanceScore: removeRelevanceScore()
  };
  
  const totalFixed = Object.values(results).reduce((sum, count) => sum + count, 0);
  
  console.log('\n📊 PRECISION FIX SUMMARY');
  console.log('====================');
  console.log(`Precision fixes: ${results.precisionFixes}`);
  console.log(`Finance property: ${results.financeProperty ? 1 : 0}`);
  console.log(`Synthesis access: ${results.synthesisAccess ? 1 : 0}`);
  console.log(`Verification layers: ${results.verificationLayers ? 1 : 0}`);
  console.log(`Relevance score: ${results.relevanceScore ? 1 : 0}`);
  console.log(`Total fixes: ${totalFixed}`);
  
  console.log('\n🎯 NEXT STEPS');
  console.log('=============');
  console.log('1. Run TypeScript compilation to validate all fixes');
  console.log('2. Check for any remaining errors');
  console.log('3. Run build process');
  console.log('4. Test critical functionality');
  
  if (totalFixed > 15) {
    console.log('\n🎉 PRECISION FIX COMPLETE!');
    console.log('✅ Majority of remaining errors resolved');
  } else {
    console.log('\n⚠️  Some fixes may need manual attention');
  }
}

if (require.main === module) {
  main();
}

module.exports = { applyPrecisionFixes, addMissingFinanceProperty, fixPipelineV2SynthesisAccess, removeRequiredFromVerificationLayers, removeRelevanceScore };
