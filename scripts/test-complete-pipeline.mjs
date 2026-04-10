#!/usr/bin/env node
/**
 * TEST COMPLET - Pipeline E2E avec 21 providers institutionnels
 * 
 * Test une vraie requête du début à la fin :
 * 1. SCOUT (académiques + 21 institutionnels)
 * 2. INDEX (enrich)
 * 3. RANK (top sources)
 * 4. READER (extract claims)
 * 5. ANALYST (synthesize)
 * 6. EDITOR (render HTML)
 * 
 * Usage:
 *   node scripts/test-complete-pipeline.mjs
 *   node scripts/test-complete-pipeline.mjs "custom query"
 */

import pkg from '../generated/prisma-client/index.js';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

// Query from CLI or default
const QUERY = process.argv[2] || "What are the current cybersecurity threats to critical infrastructure?";

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║              🧪 TEST COMPLET - NOMOSX PIPELINE E2E                ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

console.log(`📝 Query: "${QUERY}"\n`);

/**
 * PHASE 1 : SCOUT (Collect sources)
 */
async function testScout() {
  console.log('🔎 PHASE 1 : SCOUT\n');
  console.log('─'.repeat(70));
  
  try {
    // Import scout
    const { scout } = await import('../lib/agent/pipeline-v2.ts');
    
    // Providers to test (mix academic + institutional)
    const providers = [
      // Academic (2 for speed)
      'openalex',
      'semanticscholar',
      
      // Institutional (top priorities)
      'cisa',
      'nist',
      'worldbank',
      'odni',
      'nato',
      'un'
    ];
    
    console.log(`Providers: ${providers.join(', ')}`);
    console.log(`Limit: 10 per provider\n`);
    
    const startTime = Date.now();
    
    const result = await scout(QUERY, providers, 10);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ SCOUT Results:');
    console.log(`   Found: ${result.found} sources`);
    console.log(`   Upserted: ${result.upserted} sources`);
    console.log(`   Duration: ${duration}s`);
    
    // Show breakdown by provider
    const sourcesByProvider = {};
    for (const id of result.sourceIds) {
      const provider = id.split(':')[0];
      sourcesByProvider[provider] = (sourcesByProvider[provider] || 0) + 1;
    }
    
    console.log('\n📊 Breakdown by provider:');
    for (const [provider, count] of Object.entries(sourcesByProvider)) {
      console.log(`   ${provider.padEnd(20)} : ${count} sources`);
    }
    
    return result.sourceIds;
    
  } catch (error) {
    console.error('❌ SCOUT failed:', error.message);
    console.log('\n💡 Make sure TypeScript is compiled: npm run build\n');
    throw error;
  }
}

/**
 * PHASE 2 : INDEX (Enrich sources)
 */
async function testIndex(sourceIds) {
  console.log('\n\n🔍 PHASE 2 : INDEX\n');
  console.log('─'.repeat(70));
  
  try {
    const { indexAgent } = await import('../lib/agent/index-agent.ts');
    
    console.log(`Sources to enrich: ${sourceIds.length}`);
    
    const startTime = Date.now();
    const result = await indexAgent(sourceIds);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ INDEX Results:');
    console.log(`   Enriched: ${result.enriched} sources`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log(`   Duration: ${duration}s`);
    
    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      result.errors.slice(0, 3).forEach(err => console.log(`   • ${err}`));
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ INDEX failed:', error.message);
    // Continue anyway (not critical)
    return { enriched: 0, errors: [error.message] };
  }
}

/**
 * PHASE 3 : RANK (Select top sources)
 */
async function testRank() {
  console.log('\n\n🏆 PHASE 3 : RANK\n');
  console.log('─'.repeat(70));
  
  try {
    const { rank } = await import('../lib/agent/pipeline-v2.ts');
    
    console.log('Ranking by quality (top 12)...');
    
    const startTime = Date.now();
    const topSources = await rank(QUERY, 12, 'quality');
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ RANK Results:');
    console.log(`   Top sources: ${topSources.length}`);
    console.log(`   Duration: ${duration}s`);
    
    // Show top 5
    console.log('\n🌟 Top 5 sources:');
    topSources.slice(0, 5).forEach((source, i) => {
      const title = source.title.substring(0, 60);
      const provider = source.provider.padEnd(15);
      const score = source.qualityScore;
      const type = source.documentType || source.type;
      
      console.log(`   ${i+1}. [${provider}] ${title}... (score: ${score}, type: ${type})`);
    });
    
    return topSources;
    
  } catch (error) {
    console.error('❌ RANK failed:', error.message);
    throw error;
  }
}

/**
 * PHASE 4 : READER (Extract claims)
 */
async function testReader(sources) {
  console.log('\n\n📖 PHASE 4 : READER\n');
  console.log('─'.repeat(70));
  
  try {
    const { readerAgent } = await import('../lib/agent/reader-agent.ts');
    
    console.log(`Reading ${sources.length} sources...`);
    
    const startTime = Date.now();
    const readings = await readerAgent(sources);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ READER Results:');
    console.log(`   Readings: ${readings.length}`);
    console.log(`   Duration: ${duration}s`);
    
    // Show sample
    const sampleReading = readings.find(r => r.claims.length > 0);
    if (sampleReading) {
      console.log('\n📄 Sample reading:');
      console.log(`   Claims: ${sampleReading.claims.length}`);
      console.log(`   Methods: ${sampleReading.methods.length}`);
      console.log(`   Confidence: ${sampleReading.confidence}`);
      
      if (sampleReading.claims[0]) {
        console.log(`\n   Example claim: "${sampleReading.claims[0].substring(0, 80)}..."`);
      }
    }
    
    return readings;
    
  } catch (error) {
    console.error('❌ READER failed:', error.message);
    // Continue anyway
    return [];
  }
}

/**
 * PHASE 5 : ANALYST (Synthesize)
 */
async function testAnalyst(sources, readings) {
  console.log('\n\n🧠 PHASE 5 : ANALYST\n');
  console.log('─'.repeat(70));
  
  try {
    const { analystAgent } = await import('../lib/agent/analyst-agent.ts');
    
    console.log('Synthesizing analysis...');
    
    const startTime = Date.now();
    const analysis = await analystAgent(QUERY, sources, readings);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ ANALYST Results:');
    console.log(`   Duration: ${duration}s`);
    console.log(`   Title: ${analysis.title}`);
    console.log(`   Summary length: ${analysis.summary?.length || 0} chars`);
    
    // Show summary
    if (analysis.summary) {
      console.log(`\n📝 Summary (first 200 chars):`);
      console.log(`   ${analysis.summary.substring(0, 200)}...`);
    }
    
    // Citation stats
    const citationCount = (analysis.summary?.match(/\[SRC-\d+\]/g) || []).length;
    console.log(`\n🔗 Citations: ${citationCount}`);
    
    return analysis;
    
  } catch (error) {
    console.error('❌ ANALYST failed:', error.message);
    throw error;
  }
}

/**
 * PHASE 6 : EDITOR (Render HTML)
 */
async function testEditor(analysis, sources) {
  console.log('\n\n🎨 PHASE 6 : EDITOR\n');
  console.log('─'.repeat(70));
  
  try {
    const { renderBriefHTML } = await import('../lib/agent/pipeline-v2.ts');
    
    console.log('Rendering HTML brief...');
    
    const startTime = Date.now();
    const html = renderBriefHTML(analysis, sources);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ EDITOR Results:');
    console.log(`   HTML length: ${html.length} chars`);
    console.log(`   Duration: ${duration}s`);
    
    return html;
    
  } catch (error) {
    console.error('❌ EDITOR failed:', error.message);
    throw error;
  }
}

/**
 * Save brief to database
 */
async function saveBrief(html, sources) {
  console.log('\n\n💾 SAVING BRIEF\n');
  console.log('─'.repeat(70));
  
  try {
    const brief = await prisma.brief.create({
      data: {
        question: QUERY,
        html,
        publicId: `test-${Date.now()}`,
        sources: sources.slice(0, 12).map(s => s.id)
      }
    });
    
    console.log('✅ Brief saved to database');
    console.log(`   ID: ${brief.id}`);
    console.log(`   Public URL: /brief/${brief.publicId}`);
    
    return brief;
    
  } catch (error) {
    console.error('❌ Failed to save brief:', error.message);
    return null;
  }
}

/**
 * Main test flow
 */
async function runCompleteTest() {
  const overallStart = Date.now();
  
  try {
    // Phase 1: Scout
    const sourceIds = await testScout();
    
    if (sourceIds.length === 0) {
      console.log('\n⚠️  No sources found, stopping test');
      return;
    }
    
    // Phase 2: Index
    await testIndex(sourceIds);
    
    // Phase 3: Rank
    const topSources = await testRank();
    
    if (topSources.length === 0) {
      console.log('\n⚠️  No ranked sources, stopping test');
      return;
    }
    
    // Phase 4: Reader
    const readings = await testReader(topSources);
    
    // Phase 5: Analyst
    const analysis = await testAnalyst(topSources, readings);
    
    // Phase 6: Editor
    const html = await testEditor(analysis, topSources);
    
    // Save
    const brief = await saveBrief(html, topSources);
    
    // Final summary
    const overallDuration = ((Date.now() - overallStart) / 1000).toFixed(2);
    
    console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                     ✅ TEST COMPLET RÉUSSI                        ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');
    
    console.log('📊 RÉSUMÉ FINAL\n');
    console.log(`   Query               : ${QUERY.substring(0, 50)}...`);
    console.log(`   Sources collectées  : ${sourceIds.length}`);
    console.log(`   Sources analysées   : ${topSources.length}`);
    console.log(`   Lectures            : ${readings.length}`);
    console.log(`   Brief HTML          : ${html.length} chars`);
    console.log(`   Brief ID            : ${brief?.id || 'N/A'}`);
    console.log(`   Durée totale        : ${overallDuration}s`);
    
    // Provider breakdown
    const providers = {};
    for (const source of topSources) {
      const type = source.issuerType || (source.provider.includes('alex') || source.provider.includes('scholar') ? 'academic' : 'institutional');
      providers[type] = (providers[type] || 0) + 1;
    }
    
    console.log('\n🎯 DIFFÉRENCIATION NOMOSX:');
    console.log(`   Academic sources    : ${providers.academic || 0}`);
    console.log(`   Institutional       : ${providers.institutional || providers.intelligence || providers.cyber || providers.economic || 0}`);
    
    if (providers.institutional || providers.intelligence || providers.cyber || providers.economic) {
      const instTotal = (providers.institutional || 0) + 
                       (providers.intelligence || 0) + 
                       (providers.cyber || 0) + 
                       (providers.economic || 0);
      console.log(`\n   🚀 ${instTotal} sources institutionnelles = UNIQUE vs competitors !`);
    }
    
    console.log('\n💡 NEXT STEPS:');
    console.log(`   1. View brief: http://localhost:3000/brief/${brief?.publicId || 'test-xxx'}`);
    console.log(`   2. Start monitoring: npm run monitoring`);
    console.log(`   3. Dashboard: npm run monitoring:dashboard\n`);
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run
runCompleteTest().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
