const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkRealData() {
  try {
    console.log('=== VÉRIFICATION DONNÉES RÉELLES ===\n');
    
    // 1. Vérifier les signaux récents
    console.log('📊 SIGNAUX DÉTECTÉS RÉCEMMENT:');
    const signals = await prisma.signal.findMany({
      where: { status: 'NEW' },
      orderBy: { detectedAt: 'desc' },
      take: 5,
      include: { vertical: true }
    });
    
    if (signals.length === 0) {
      console.log('❌ Aucun signal détecté');
    } else {
      signals.forEach((signal, i) => {
        console.log(`\n${i+1}. ${signal.title}`);
        console.log(`   Type: ${signal.signalType}`);
        console.log(`   Vertical: ${signal.vertical?.name}`);
        console.log(`   Score: ${signal.priorityScore}/100`);
        console.log(`   Date: ${signal.detectedAt.toLocaleDateString()}`);
        console.log(`   Résumé: ${signal.summary.substring(0, 150)}...`);
      });
    }
    
    // 2. Vérifier les publications récentes
    console.log('\n\n📄 PUBLICATIONS RÉCENTES:');
    const publications = await prisma.thinkTankPublication.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 3,
      include: { vertical: true }
    });
    
    if (publications.length === 0) {
      console.log('❌ Aucune publication générée');
    } else {
      publications.forEach((pub, i) => {
        console.log(`\n${i+1}. ${pub.title}`);
        console.log(`   Type: ${pub.publicationType}`);
        console.log(`   Vertical: ${pub.vertical?.name}`);
        console.log(`   Date: ${pub.publishedAt?.toLocaleDateString()}`);
        console.log(`   Trust Score: ${pub.trustScore}/100`);
        console.log(`   Word Count: ${pub.wordCount}`);
      });
    }
    
    // 3. Vérifier les briefs (corrigé)
    console.log('\n\n📋 BRIEFS RÉCENTS:');
    const briefs = await prisma.brief.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        question: true,
        html: true,
        createdAt: true,
        trustScore: true,
        publicId: true,
        publishedAt: true
      }
    });
    
    if (briefs.length === 0) {
      console.log('❌ Aucun brief généré');
    } else {
      briefs.forEach((brief, i) => {
        const wordCount = brief.html ? brief.html.replace(/<[^>]*>/g, ' ').split(' ').length : 0;
        console.log(`\n${i+1}. ${brief.question}`);
        console.log(`   Words: ${wordCount}`);
        console.log(`   Trust: ${brief.trustScore}/100`);
        console.log(`   Date: ${brief.createdAt.toLocaleDateString()}`);
        console.log(`   Public ID: ${brief.publicId}`);
      });
    }
    
    // 4. Sources récentes pour voir le sourcing
    console.log('\n\n🔍 SOURCES RÉCENTES:');
    const sources = await prisma.source.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        title: true,
        provider: true,
        qualityScore: true,
        noveltyScore: true,
        citationCount: true,
        createdAt: true
      }
    });
    
    if (sources.length === 0) {
      console.log('❌ Aucune source récente');
    } else {
      sources.forEach((source, i) => {
        console.log(`\n${i+1}. ${source.title.substring(0, 80)}...`);
        console.log(`   Provider: ${source.provider}`);
        console.log(`   Quality: ${source.qualityScore}/100`);
        console.log(`   Novelty: ${source.noveltyScore}/100`);
        console.log(`   Citations: ${source.citationCount}`);
        console.log(`   Date: ${source.createdAt.toLocaleDateString()}`);
      });
    }
    
    // 5. Exemple complet d'un signal et ses sources
    console.log('\n\n🔬 EXEMPLE COMPLET - SIGNAL + SOURCES:');
    if (signals.length > 0) {
      const firstSignal = signals[0];
      console.log(`\nSIGNAL: ${firstSignal.title}`);
      console.log(`Type: ${firstSignal.signalType}`);
      console.log(`Vertical: ${firstSignal.vertical?.name}`);
      console.log(`Score: ${firstSignal.priorityScore}/100`);
      
      // Récupérer les sources de ce signal
      const signalSources = await prisma.source.findMany({
        where: { id: { in: firstSignal.sourceIds } },
        take: 3,
        select: {
          title: true,
          provider: true,
          abstract: true,
          qualityScore: true,
          noveltyScore: true
        }
      });
      
      console.log('\nSOURCES ASSOCIÉES:');
      signalSources.forEach((source, i) => {
        console.log(`\n${i+1}. ${source.title}`);
        console.log(`   Provider: ${source.provider}`);
        console.log(`   Quality: ${source.qualityScore}/100`);
        console.log(`   Abstract: ${source.abstract?.substring(0, 200)}...`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkRealData();
