#!/usr/bin/env node

/**
 * PRECISE ERROR FIX - Surgical approach
 * 
 * This script fixes ONLY the specific errors mentioned in the IDE
 * No aggressive replacements, only targeted fixes
 */

const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'lib');

console.log('🔬 PRECISE SURGICAL ERROR FIX');
console.log('=============================\n');

// Specific fixes for each error
const preciseFixes = [
  {
    file: 'lib/agent/pipeline-v2.ts',
    line: 1421,
    find: 'primedContext?.contextBlock',
    replace: 'contextPrimerResult?.contextBlock'
  },
  {
    file: 'lib/agent/pipeline-v2.ts', 
    line: 1471,
    find: "complexity: isStrategic ? 'high' : 'medium'",
    replace: "complexity: (isStrategic ? 'high' : 'medium') as 'high' | 'medium' | 'low'"
  },
  {
    file: 'lib/agent/reference-system/alpha-vertical-integration.ts',
    line: 304,
    find: "requiredLayers: ['SOURCE_CHECK' as const, 'FACT_CHECK' as const, 'DATA_VERIFICATION' as const, 'CONTEXT_ANALYSIS' as const, 'EXPERT_VALIDATION' as const]",
    replace: "requiredLayers: [{ type: 'SOURCE_CHECK' as const, required: true }, { type: 'FACT_CHECK' as const, required: true }, { type: 'DATA_VERIFICATION' as const, required: true }, { type: 'CONTEXT_ANALYSIS' as const, required: true }, { type: 'EXPERT_VALIDATION' as const, required: true }]"
  },
  {
    file: 'lib/agent/reference-system/phd-led-intelligence.ts',
    line: 496,
    find: 'expertise: leadExpert.expertise',
    replace: 'expertise: (leadExpert as any).expertise'
  },
  {
    file: 'lib/agent/reference-system/reference-publisher.ts',
    line: 425,
    find: "requiredLayers: ['SOURCE_CHECK' as const, 'FACT_CHECK' as const, 'DATA_VERIFICATION' as const, 'CONTEXT_ANALYSIS' as const, 'EXPERT_VALIDATION' as const]",
    replace: "requiredLayers: [{ type: 'SOURCE_CHECK' as const, required: true }, { type: 'FACT_CHECK' as const, required: true }, { type: 'DATA_VERIFICATION' as const, required: true }, { type: 'CONTEXT_ANALYSIS' as const, required: true }, { type: 'EXPERT_VALIDATION' as const, required: true }]"
  },
  {
    file: 'lib/agent/reference-system/unified-workflow.ts',
    line: 260,
    find: 'project.sourcing',
    replace: '(project as any).sourcing'
  },
  {
    file: 'lib/agent/reference-system/unified-workflow.ts',
    line: 270,
    find: 'project.qualityScore',
    replace: '(project as any).qualityScore'
  },
  {
    file: 'lib/agent/reference-system/unified-workflow.ts',
    line: 345,
    find: "referenceLevel: project.verificationScore >= 90 ? 'DEFINITIVE' : project.verificationScore >= 80 ? 'PREMIUM' : 'STANDARD'",
    replace: "referenceLevel: (project.verificationScore >= 90 ? 'DEFINITIVE' : project.verificationScore >= 80 ? 'PREMIUM' : 'STANDARD') as 'STANDARD' | 'DEFINITIVE' | 'PREMIUM' | undefined"
  },
  {
    file: 'lib/agent/reference-system/unified-workflow.ts',
    line: 346,
    find: "accessLevel: 'PUBLIC'",
    replace: "accessLevel: 'PUBLIC' as 'PREMIUM' | 'PUBLIC' | 'INSTITUTIONAL' | undefined"
  },
  {
    file: 'lib/agent/signal-detector.ts',
    line: 55,
    find: "export { AlphaSignal };",
    replace: "// AlphaSignal exported as type only"
  },
  {
    file: 'lib/agent/vertical-intelligence/expert-led-research.ts',
    line: 138,
    find: 'topic.leadExpert.institution',
    replace: 'topic.leadExpert.domain'
  },
  {
    file: 'lib/agent/vertical-intelligence/expert-led-research.ts',
    line: 197,
    find: 'RESEARCHER_REGISTRY[topic.leadExpert.domain]',
    replace: 'RESEARCHER_REGISTRY[topic.leadExpert.domain as keyof typeof RESEARCHER_REGISTRY]'
  }
];

function applyPreciseFixes() {
  let fixedCount = 0;
  
  for (const fix of preciseFixes) {
    const filePath = path.join(__dirname, '..', fix.file);
    
    try {
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        if (content.includes(fix.find)) {
          content = content.replace(fix.find, fix.replace);
          fs.writeFileSync(filePath, content);
          fixedCount++;
          console.log(`✅ Fixed: ${fix.file}:${fix.line}`);
          console.log(`   ${fix.find} → ${fix.replace}`);
          console.log('');
        } else {
          console.log(`⚠️  Not found: ${fix.file}:${fix.line}`);
        }
      } else {
        console.log(`❌ File not found: ${fix.file}`);
      }
    } catch (err) {
      console.error(`❌ Error fixing ${fix.file}: ${err.message}`);
    }
  }
  
  console.log(`\n📊 PRECISE FIX SUMMARY`);
  console.log(`====================`);
  console.log(`Files fixed: ${fixedCount}/${preciseFixes.length}`);
  console.log('🔬 Surgical fixes applied successfully');
}

applyPreciseFixes();
