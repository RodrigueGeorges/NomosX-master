#!/usr/bin/env node
/**
 * TEST INSTITUTIONAL PROVIDERS V2
 * Teste les 21 providers avec vraies solutions
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test query
const QUERY = 'cybersecurity threats';

async function testProvider(name, searchFunction) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing: ${name.toUpperCase()}`);
  console.log('='.repeat(60));
  
  try {
    const start = Date.now();
    const results = await searchFunction(QUERY, 5);
    const duration = Date.now() - start;
    
    if (results && results.length > 0) {
      console.log(`✅ ${results.length} résultats en ${duration}ms`);
      console.log(`   • ${results[0].title?.substring(0, 60)}...`);
      console.log(`   • Provider: ${results[0].provider}`);
      console.log(`   • Type: ${results[0].documentType}`);
      return { name, success: true, count: results.length, duration };
    } else {
      console.log(`⚠️  0 résultats (${duration}ms)`);
      return { name, success: false, count: 0, duration };
    }
  } catch (error) {
    console.log(`❌ Erreur: ${error.message}`);
    return { name, success: false, error: error.message };
  }
}

async function testAll() {
  console.log('🚀 TEST INSTITUTIONAL PROVIDERS V2 - 21 PROVIDERS');
  console.log(`Query: "${QUERY}"\n`);
  
  const results = [];
  
  // ==========================================
  // 🔴 INTELLIGENCE & SÉCURITÉ (9)
  // ==========================================
  console.log('\n🔴 INTELLIGENCE & SÉCURITÉ\n');
  
  try {
    const { searchODNIViaGoogle } = await import('../lib/providers/institutional/v2/google-cse.ts');
    results.push(await testProvider('1. ODNI (Google CSE)', searchODNIViaGoogle));
  } catch (e) {
    console.log('⚠️  ODNI non disponible:', e.message);
  }
  
  try {
    const { searchCIAFOIAViaArchive } = await import('../lib/providers/institutional/v2/archive-org.ts');
    results.push(await testProvider('2. CIA FOIA (Archive.org)', searchCIAFOIAViaArchive));
  } catch (e) {
    console.log('⚠️  CIA FOIA non disponible:', e.message);
  }
  
  try {
    const { searchNSAViaGoogle } = await import('../lib/providers/institutional/v2/google-cse.ts');
    results.push(await testProvider('3. NSA (Google CSE)', searchNSAViaGoogle));
  } catch (e) {
    console.log('⚠️  NSA non disponible:', e.message);
  }
  
  try {
    const { searchNARA } = await import('../lib/providers/institutional/v2/nara-api.ts');
    results.push(await testProvider('4. NARA (Official API)', searchNARA));
  } catch (e) {
    console.log('⚠️  NARA non disponible:', e.message);
  }
  
  try {
    const { searchUKArchives } = await import('../lib/providers/institutional/v2/uk-archives-api.ts');
    results.push(await testProvider('5. UK Archives (Discovery API)', searchUKArchives));
  } catch (e) {
    console.log('⚠️  UK Archives non disponible:', e.message);
  }
  
  try {
    const { searchMinistereArmees } = await import('../lib/providers/institutional/v2/france-gov.ts');
    results.push(await testProvider('6. Ministère Armées (data.gouv)', searchMinistereArmees));
  } catch (e) {
    console.log('⚠️  Ministère Armées non disponible:', e.message);
  }
  
  try {
    const { searchSGDSN } = await import('../lib/providers/institutional/v2/france-gov.ts');
    results.push(await testProvider('7. SGDSN (data.gouv)', searchSGDSN));
  } catch (e) {
    console.log('⚠️  SGDSN non disponible:', e.message);
  }
  
  try {
    const { searchArchivesNationales } = await import('../lib/providers/institutional/v2/france-gov.ts');
    results.push(await testProvider('8. Archives FR (data.gouv)', searchArchivesNationales));
  } catch (e) {
    console.log('⚠️  Archives FR non disponible:', e.message);
  }
  
  // ==========================================
  // 🟠 GÉOPOLITIQUE & DÉFENSE (3)
  // ==========================================
  console.log('\n🟠 GÉOPOLITIQUE & DÉFENSE\n');
  
  try {
    const { searchNATOViaGoogle } = await import('../lib/providers/institutional/v2/google-cse.ts');
    results.push(await testProvider('9. NATO (Google CSE)', searchNATOViaGoogle));
  } catch (e) {
    console.log('⚠️  NATO non disponible:', e.message);
  }
  
  try {
    const { searchEEAS } = await import('../lib/providers/institutional/v2/eu-open-data.ts');
    results.push(await testProvider('10. EEAS (EU Open Data)', searchEEAS));
  } catch (e) {
    console.log('⚠️  EEAS non disponible:', e.message);
  }
  
  try {
    const { searchEDA } = await import('../lib/providers/institutional/v2/eu-open-data.ts');
    results.push(await testProvider('11. EDA (EU Open Data)', searchEDA));
  } catch (e) {
    console.log('⚠️  EDA non disponible:', e.message);
  }
  
  // ==========================================
  // 🟡 ÉCONOMIE & STABILITÉ (4)
  // ==========================================
  console.log('\n🟡 ÉCONOMIE & STABILITÉ\n');
  
  try {
    const { searchIMFeLibrary } = await import('../lib/providers/institutional/v2/imf-elibrary.ts');
    results.push(await testProvider('12. IMF (eLibrary)', searchIMFeLibrary));
  } catch (e) {
    console.log('⚠️  IMF non disponible:', e.message);
  }
  
  try {
    const { searchWorldBankAPI } = await import('../lib/providers/institutional/stable/worldbank-api.ts');
    results.push(await testProvider('13. World Bank (Official API)', searchWorldBankAPI));
  } catch (e) {
    console.log('⚠️  World Bank non disponible:', e.message);
  }
  
  try {
    const { searchOECDiLibrary } = await import('../lib/providers/institutional/v2/oecd-ilibrary.ts');
    results.push(await testProvider('14. OECD (iLibrary)', searchOECDiLibrary));
  } catch (e) {
    console.log('⚠️  OECD non disponible:', e.message);
  }
  
  try {
    const { searchBIS } = await import('../lib/providers/institutional/v2/bis-papers.ts');
    results.push(await testProvider('15. BIS (RSS + Papers)', searchBIS));
  } catch (e) {
    console.log('⚠️  BIS non disponible:', e.message);
  }
  
  // ==========================================
  // 🟢 GOUVERNANCE MONDIALE (3)
  // ==========================================
  console.log('\n🟢 GOUVERNANCE MONDIALE\n');
  
  try {
    const { searchUNDigitalLibrary } = await import('../lib/providers/institutional/v2/un-digital-library.ts');
    results.push(await testProvider('16. UN Digital Library (API)', searchUNDigitalLibrary));
  } catch (e) {
    console.log('⚠️  UN non disponible:', e.message);
  }
  
  try {
    const { searchUNDP } = await import('../lib/providers/institutional/v2/un-digital-library.ts');
    results.push(await testProvider('17. UNDP (UN API)', searchUNDP));
  } catch (e) {
    console.log('⚠️  UNDP non disponible:', e.message);
  }
  
  try {
    const { searchUNCTAD } = await import('../lib/providers/institutional/v2/un-digital-library.ts');
    results.push(await testProvider('18. UNCTAD (UN API)', searchUNCTAD));
  } catch (e) {
    console.log('⚠️  UNCTAD non disponible:', e.message);
  }
  
  // ==========================================
  // 🔵 TECH & CYBER (3)
  // ==========================================
  console.log('\n🔵 TECH & CYBER\n');
  
  try {
    const { searchNIST } = await import('../lib/providers/institutional/v2/nist-publications.ts');
    results.push(await testProvider('19. NIST (RSS + DB)', searchNIST));
  } catch (e) {
    console.log('⚠️  NIST non disponible:', e.message);
  }
  
  try {
    const { searchCISAAdvisories } = await import('../lib/providers/institutional/stable/cisa-advisories.ts');
    results.push(await testProvider('20. CISA (Official XML)', searchCISAAdvisories));
  } catch (e) {
    console.log('⚠️  CISA non disponible:', e.message);
  }
  
  try {
    const { searchENISAViaGoogle } = await import('../lib/providers/institutional/v2/google-cse.ts');
    results.push(await testProvider('21. ENISA (Google CSE)', searchENISAViaGoogle));
  } catch (e) {
    console.log('⚠️  ENISA non disponible:', e.message);
  }
  
  // Résumé
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success).length;
  const total = results.length;
  
  console.log(`\n✅ ${successful}/${total} providers fonctionnels`);
  
  if (successful > 0) {
    const avgDuration = results
      .filter(r => r.duration)
      .reduce((sum, r) => sum + r.duration, 0) / successful;
    
    console.log(`⚡ Temps moyen: ${Math.round(avgDuration)}ms`);
    console.log(`📚 Total sources: ${results.reduce((sum, r) => sum + (r.count || 0), 0)}`);
  }
  
  console.log('\n💡 Pour compiler TypeScript avant test:');
  console.log('   npm run build');
  console.log('   OU');
  console.log('   npx tsc\n');
  
  await prisma.$disconnect();
}

testAll().catch(console.error);
