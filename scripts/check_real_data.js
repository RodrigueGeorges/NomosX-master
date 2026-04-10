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
    
    // 3. Vérifier les briefs
    console.log('\n\n📋 BRIEFS RÉCENTS:');
    const briefs = await prisma.brief.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        question: true,
        wordCount: true,
        createdAt: true,
        sources: { take: 3 }
      }
    });
    
    if (briefs.length === 0) {
      console.log('❌ Aucun brief généré');
    } else {
      briefs.forEach((brief, i) => {
        console.log(`\n${i+1}. ${brief.question}`);
        console.log(`   Words: ${brief.wordCount}`);
        console.log(`   Sources: ${brief.sources.length}`);
        console.log(`   Date: ${brief.createdAt.toLocaleDateString()}`);
      });
    }
    
    // 4. Statistiques globales
    console.log('\n\n📈 STATISTIQUES GLOBALES:');
    const signalStats = await prisma.signal.groupBy({
      by: ['signalType', 'status'],
      _count: { id: true }
    });
    
    console.log('Signaux par type:');
    signalStats.forEach(stat => {
      console.log(`  ${stat.signalType}: ${stat._count.id} (${stat.status})`);
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkRealData();
