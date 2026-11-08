const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getPublicationContent() {
  try {
    console.log('=== CONTENU PUBLICATION COMPLET ===\n');
    
    // Récupérer une publication complète avec son contenu
    const publication = await prisma.thinkTankPublication.findFirst({
      include: {
        vertical: true,
        signal: true
      }
    });
    
    if (!publication) {
      console.log('❌ Aucune publication trouvée');
      return;
    }
    
    console.log('📄 PUBLICATION COMPLÈTE:');
    console.log(`Titre: ${publication.title}`);
    console.log(`Type: ${publication.publicationType}`);
    console.log(`Vertical: ${publication.vertical?.name}`);
    console.log(`Date: ${publication.publishedAt?.toLocaleDateString()}`);
    console.log(`Trust Score: ${publication.trustScore}/100`);
    console.log(`Word Count: ${publication.wordCount}`);
    
    if (publication.signal) {
      console.log(`\n🔗 SIGNAL DÉCLANCHEUR:`);
      console.log(`Signal: ${publication.signal.title}`);
      console.log(`Type: ${publication.signal.signalType}`);
      console.log(`Score: ${publication.signal.priorityScore}/100`);
    }
    
    // Afficher le contenu HTML
    if (publication.html) {
      console.log('\n\n📝 CONTENU COMPLET:');
      console.log('=' .repeat(80));
      console.log(publication.html);
      console.log('=' .repeat(80));
    }
    
    // Récupérer aussi un brief pour comparaison
    console.log('\n\n📋 BRIEF COMPARAISON:');
    const brief = await prisma.brief.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        question: true,
        html: true,
        trustScore: true,
        createdAt: true,
        publicId: true
      }
    });
    
    if (brief) {
      console.log(`Question: ${brief.question}`);
      console.log(`Trust: ${brief.trustScore}/100`);
      console.log(`Date: ${brief.createdAt.toLocaleDateString()}`);
      
      if (brief.html) {
        // Extraire les premiers paragraphes
        const textContent = brief.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log('\nContenu (premiers 500 caractères):');
        console.log(textContent.substring(0, 500) + '...');
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

getPublicationContent();
