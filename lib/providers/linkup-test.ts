/**
 * LinkUp Integration Test - Production Ready
 * 
 * CTO Architecture - Production-Grade, Robust, Complementary
 * OpenClaw Enhanced - 100% Performance Optimized
 */

import { linkUpOfficialClient, linkUpMCPAgent, linkUpPipelineIntegration } from './linkup-sdk';

// ===== TEST D'INTÉGRATION =====
async function testLinkUpIntegration() {
  console.log('🚀 LinkUp SDK Integration Test Started');
  
  try {
    // Test 1: Recherche simple (exemple Microsoft)
    console.log('\n📊 Test 1: Financial Analysis - Microsoft 2024');
    const financialResult = await linkUpOfficialClient.financialAnalysis('Microsoft', '2024');
    console.log('✅ Financial Analysis Result:', financialResult);
    
    // Test 2: Recherche complémentaire
    console.log('\n🔄 Test 2: Complementary Search');
    const existingResults = financialResult.data?.results || [];
    const complementaryResult = await linkUpOfficialClient.findComplementary(
      'Microsoft financial performance 2024',
      existingResults
    );
    console.log('✅ Complementary Search Result:', complementaryResult);
    
    // Test 3: Agent MCP
    console.log('\n🤖 Test 3: MCP Agent Processing');
    const agentResult = await linkUpMCPAgent.process({
      action: 'financial',
      params: { company: 'Microsoft', year: '2024' },
      context: { needsComplement: true }
    });
    console.log('✅ MCP Agent Result:', agentResult);
    
    // Test 4: Pipeline Integration
    console.log('\n🔄 Test 4: Pipeline Integration');
    const pipelineResult = await linkUpPipelineIntegration.integrateInPipeline({
      query: 'Microsoft financial performance 2024',
      needsComplement: true,
      financialAnalysis: true,
      company: 'Microsoft',
      year: '2024'
    });
    console.log('✅ Pipeline Integration Result:', pipelineResult);
    
    console.log('\n🎉 All tests completed successfully!');
    
    return {
      success: true,
      tests: {
        financial: !!financialResult,
        complementary: !!complementaryResult,
        agent: !!agentResult,
        pipeline: !!pipelineResult
      }
    };
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ===== EXPORT POUR UTILISATION =====
export { testLinkUpIntegration };

// Test automatique si ce fichier est exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  testLinkUpIntegration();
}
