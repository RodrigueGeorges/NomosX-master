/**
 * TEST PUBLICATION HEBDOMADAIRE - Weekly publication flow
 * Test du système de publication automatique
 */

import { prisma } from '../lib/db.mjs';
import { generateWeeklyBrief } from '../lib/agents/weekly-brief-agent.js';
import { publishNewsletter } from '../lib/newsletter/publisher.js';

async function testPublicationHebdo() {
  console.log('📰 TEST PUBLICATION HEBDOMADAIRE - Weekly Publication Flow\n');
  
  try {
    const startTime = Date.now();
    
    // Étape 1: Récupérer les signaux récents
    console.log('📊 Récupération des signaux récents...');
    
    const recentSignals = await prisma.signal.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 derniers jours
        }
      },
      orderBy: {
        noveltyScore: 'desc'
      },
      take: 15,
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        noveltyScore: true,
        qualityScore: true,
        tags: true,
        createdAt: true,
        source: {
          select: {
            title: true,
            provider: true,
            url: true
          }
        }
      }
    });
    
    console.log(`🚨 Signaux trouvés: ${recentSignals.length}`);
    
    if (recentSignals.length === 0) {
      console.log('⚠️  Aucun signal récent - Création de signaux de test...');
      
      // Créer quelques signaux de test
      const testSignals = await createTestSignals();
      console.log(`✅ Signaux de test créés: ${testSignals.length}`);
      
      // Récupérer les signaux de test
      const testSignalsFromDB = await prisma.signal.findMany({
        where: {
          title: {
            contains: '[TEST]'
          }
        },
        take: 10
      });
      
      recentSignals.push(...testSignalsFromDB);
    }
    
    console.log(`📊 Signaux à publier: ${recentSignals.length}`);
    
    // Étape 2: Générer le brief hebdomadaire
    console.log('\n📝 Génération du brief hebdomadaire...');
    
    const weeklyBrief = await generateWeeklyBrief(recentSignals, {
      format: 'html',
      style: 'professional',
      maxSignals: 10,
      includeAnalysis: true,
      includeRecommendations: true
    });
    
    console.log('✅ Brief généré avec succès');
    console.log(`📄 Longueur: ${weeklyBrief.content?.length || 0} caractères`);
    console.log(`📊 Signaux inclus: ${weeklyBrief.signalsIncluded || 0}`);
    
    // Étape 3: Tester la publication newsletter
    console.log('\n📧 Test publication newsletter...');
    
    const newsletterResult = await publishNewsletter({
      title: weeklyBrief.title || 'Brief Hebdomadaire de Test',
      content: weeklyBrief.content || 'Contenu de test',
      recipients: ['test@example.com'], // Email de test
      format: 'html',
      testMode: true // Mode test pour ne pas envoyer réellement
    });
    
    const duration = Date.now() - startTime;
    
    console.log('\n📈 RÉSULTATS PUBLICATION:');
    console.log(`  ⏱️  Durée totale: ${Math.round(duration / 1000)}s`);
    console.log(`  📰 Brief généré: ${weeklyBrief.content ? '✅' : '❌'}`);
    console.log(`  📧 Newsletter: ${newsletterResult.success ? '✅' : '❌'}`);
    console.log(`  📊 Signaux traités: ${recentSignals.length}`);
    console.log(`  📄 Contenu généré: ${weeklyBrief.content?.length || 0} chars`);
    
    // Afficher un aperçu du contenu
    if (weeklyBrief.content) {
      console.log('\n📝 APERÇU CONTENU:');
      const preview = weeklyBrief.content.substring(0, 300);
      console.log(`  ${preview}...`);
    }
    
    // Vérification du flow
    console.log('\n🔍 VÉRIFICATION FLOW PUBLICATION:');
    const flowChecks = {
      'Signal retrieval': recentSignals.length > 0,
      'Brief generation': !!weeklyBrief.content,
      'Content formatting': weeklyBrief.content?.length > 100,
      'Newsletter preparation': newsletterResult.success,
      'Test mode compliance': newsletterResult.testMode,
      'Performance': duration < 60000 // < 60s
    };
    
    Object.entries(flowChecks).forEach(([component, status]) => {
      console.log(`  ${status ? '✅' : '❌'} ${component}: ${status ? 'OK' : 'PROBLÈME'}`);
    });
    
    // Analyse de la publication
    if (newsletterResult.success) {
      console.log('\n📊 ANALYSE PUBLICATION:');
      console.log(`  📧 Destinataires: ${newsletterResult.recipients || 1}`);
      console.log(`  📄 Format: ${newsletterResult.format || 'html'}`);
      console.log(`  📅 Date: ${new Date().toLocaleDateString()}`);
      console.log(`  🎯 Style: ${weeklyBrief.style || 'professional'}`);
    }
    
    // Score global
    const passedChecks = Object.values(flowChecks).filter(Boolean).length;
    const totalChecks = Object.keys(flowChecks).length;
    const score = Math.round((passedChecks / totalChecks) * 100);
    
    console.log(`\n🎯 SCORE GLOBAL PUBLICATION: ${score}%`);
    
    if (score >= 80) {
      console.log('🎉 PUBLICATION HEBDOMADAIRE: OPÉRATIONNELLE');
    } else if (score >= 60) {
      console.log('⚠️  PUBLICATION HEBDOMADAIRE: PARTIELLEMENT OPÉRATIONNELLE');
    } else {
      console.log('❌ PUBLICATION HEBDOMADAIRE: PROBLÉMATIQUE');
    }
    
    return {
      success: score >= 60,
      score,
      weeklyBrief,
      newsletterResult,
      signalsProcessed: recentSignals.length,
      duration,
      flowChecks
    };
    
  } catch (error: any) {
    console.error('❌ ERREUR CRITIQUE:', error.message);
    return {
      success: false,
      error: error.message,
      score: 0
    };
  }
}

async function createTestSignals() {
  const testSignals = [
    {
      id: 'test-signal-pub-1',
      title: '[TEST] AI breakthrough in drug discovery',
      description: 'New machine learning model accelerates drug discovery process by 10x',
      type: 'technology',
      noveltyScore: 95,
      qualityScore: 88,
      tags: ['ai', 'healthcare', 'innovation'],
      sourceId: 'test-source-1'
    },
    {
      id: 'test-signal-pub-2',
      title: '[TEST] Climate policy impact on renewable energy',
      description: 'New climate policies show significant impact on renewable energy adoption',
      type: 'policy',
      noveltyScore: 82,
      qualityScore: 85,
      tags: ['climate', 'policy', 'energy'],
      sourceId: 'test-source-2'
    },
    {
      id: 'test-signal-pub-3',
      title: '[TEST] Economic indicators suggest market shift',
      description: 'Latest economic data indicates potential shift in market dynamics',
      type: 'economics',
      noveltyScore: 78,
      qualityScore: 80,
      tags: ['economics', 'market', 'indicators'],
      sourceId: 'test-source-3'
    }
  ];
  
  // Insérer les signaux de test
  for (const signal of testSignals) {
    await prisma.signal.upsert({
      where: { id: signal.id },
      update: signal,
      create: {
        ...signal,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }
  
  return testSignals;
}

// Exécuter le test
testPublicationHebdo()
  .then(result => {
    console.log('\n✅ Test terminé');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Test échoué:', error);
    process.exit(1);
  });
