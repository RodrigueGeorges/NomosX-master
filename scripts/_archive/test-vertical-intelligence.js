/**
 * Test script for Vertical Intelligence System
 * 
 * This script tests the complete vertical intelligence workflow:
 * 1. Topic discovery
 * 2. Research project initiation
 * 3. Expert analysis
 * 4. Publication generation
 */

const { runVerticalPublisher } = require('../lib/agent/vertical-integration');

async function testVerticalIntelligence() {
  console.log('=== TESTING VERTICAL INTELLIGENCE SYSTEM ===\n');
  
  try {
    // Test single vertical first
    console.log('🧪 Testing single vertical: climate-industry');
    const singleResult = await runVerticalPublisher({
      verticalSlugs: ['climate-industry'],
      maxCostPerRun: 25,
      dryRun: false,
      runMode: 'single'
    });
    
    console.log('✅ Single vertical test results:');
    console.log(`  Publications: ${singleResult.totalPublications}`);
    console.log(`  Cost: $${singleResult.totalCostUsd.toFixed(2)}`);
    console.log(`  Duration: ${singleResult.totalDurationMs}ms`);
    console.log(`  Innovation Score: ${singleResult.summary.averageInnovationScore}`);
    console.log(`  Originality Score: ${singleResult.summary.averageOriginalityScore}`);
    
    if (singleResult.verticalResults.length > 0) {
      const vr = singleResult.verticalResults[0];
      console.log(`\n📊 Vertical details:`);
      console.log(`  Topics discovered: ${vr.topicsDiscovered}`);
      console.log(`  Projects initiated: ${vr.projectsInitiated}`);
      console.log(`  Projects completed: ${vr.projectsCompleted}`);
      console.log(`  Errors: ${vr.errors.length}`);
      console.log(`  Warnings: ${vr.warnings.length}`);
      
      if (vr.innovativeTopics.length > 0) {
        console.log(`\n🎯 Innovative topics:`);
        vr.innovativeTopics.forEach((topic, i) => {
          console.log(`  ${i+1}. ${topic.title}`);
          console.log(`     Innovation: ${topic.innovationType}`);
          console.log(`     Score: ${topic.priorityScore}/100`);
          console.log(`     Lead Expert: ${topic.leadExpert.name}`);
        });
      }
    }
    
    // Test hybrid mode
    console.log('\n\n🧪 Testing hybrid mode (vertical + auto-publisher)');
    const { runHybridPublisher } = require('../lib/agent/vertical-integration');
    
    const hybridResult = await runHybridPublisher({
      enableVerticalIntelligence: true,
      priorityMode: 'vertical-first',
      enableFallback: true,
      maxCostUsd: 30,
      verticalIntelligenceVerticals: ['ai-labor']
    });
    
    console.log('✅ Hybrid mode test results:');
    console.log(`  Total Publications: ${hybridResult.published}`);
    console.log(`  Cost: $${hybridResult.totalCostUsd.toFixed(2)}`);
    console.log(`  Duration: ${hybridResult.totalDurationMs}ms`);
    
    if (hybridResult.verticalResults) {
      console.log(`\n📈 Performance comparison:`);
      console.log(`  Vertical Intelligence:`);
      console.log(`    Publications: ${hybridResult.performanceComparison.verticalIntelligence.publications}`);
      console.log(`    Innovation Score: ${hybridResult.performanceComparison.verticalIntelligence.averageInnovationScore}`);
      console.log(`    Cost/Publication: $${hybridResult.performanceComparison.verticalIntelligence.costPerPublication.toFixed(2)}`);
      
      console.log(`  Auto-Publisher:`);
      console.log(`    Publications: ${hybridResult.performanceComparison.autoPublisher.publications}`);
      console.log(`    Trust Score: ${hybridResult.performanceComparison.autoPublisher.averageTrustScore.toFixed(1)}`);
      console.log(`    Cost/Publication: $${hybridResult.performanceComparison.autoPublisher.costPerPublication.toFixed(2)}`);
    }
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testVerticalIntelligence();
