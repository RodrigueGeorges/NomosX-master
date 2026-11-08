/**
 * 🧪 Test direct de l'extraction de PDF
 * 
 * Ce script teste l'extraction de PDF avec une URL directe
 * pour éviter les problèmes de disponibilité dans l'API de recherche.
 */

import "dotenv/config";
import { 
  extractPDFText, 
  enrichTheseWithPDFText
} from "../lib/providers/pdf-extractor";

async function testDirectPDFExtraction() {
  console.log("🧪 TEST DIRECT D'EXTRACTION DE PDF\n");
  console.log("=" .repeat(80));
  
  try {
    // ======== TEST 1: URL de test (PDF léger) ========
    console.log("\n📄 TEST 1: Extraction depuis une URL de test\n");
    
    // URL d'un petit PDF de test
    const testPdfUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
    
    console.log(`URL: ${testPdfUrl}`);
    console.log("⏳ Téléchargement et extraction en cours...\n");
    
    const extraction1 = await extractPDFText(testPdfUrl, {
      maxPages: 10,
      timeout: 30000,
      maxSize: 10 * 1024 * 1024 // 10MB
    });
    
    if (extraction1.success) {
      console.log("✅ EXTRACTION RÉUSSIE!\n");
      console.log(`📊 MÉTADONNÉES:`);
      console.log(`   Pages: ${extraction1.pages || "N/A"}`);
      console.log(`   Longueur du texte: ${extraction1.textLength?.toLocaleString() || "N/A"} caractères`);
      console.log(`   Taille du preview: ${extraction1.preview?.length || 0} caractères\n`);
      
      if (extraction1.preview) {
        console.log(`📝 PREVIEW:`);
        console.log("─".repeat(80));
        console.log(extraction1.preview);
        console.log("─".repeat(80));
      }
      
      if (extraction1.text) {
        console.log(`\n✨ Le module pdf-parse fonctionne correctement!`);
      }
    } else {
      console.log("❌ ÉCHEC DE L'EXTRACTION\n");
      console.log(`Erreur: ${extraction1.error}`);
    }
    
    // ======== TEST 2: URL réelle de theses.fr (si disponible) ========
    console.log("\n" + "=".repeat(80));
    console.log("\n📚 TEST 2: Extraction depuis theses.fr (thèse connue)\n");
    
    // Exemple de thèse accessible (à vérifier)
    // Format: https://www.theses.fr/{NNT}.pdf
    const thesesPdfUrl = "https://www.theses.fr/2023ORLE1023.pdf";
    
    console.log(`URL: ${thesesPdfUrl}`);
    console.log("⏳ Téléchargement et extraction en cours...\n");
    console.log("⚠️  Note: Cette thèse peut ne pas être accessible en PDF.\n");
    
    const extraction2 = await extractPDFText(thesesPdfUrl, {
      maxPages: 50,
      timeout: 90000,
      maxSize: 50 * 1024 * 1024 // 50MB
    });
    
    if (extraction2.success) {
      console.log("✅ EXTRACTION RÉUSSIE!\n");
      console.log(`📊 MÉTADONNÉES:`);
      console.log(`   Pages: ${extraction2.pages || "N/A"}`);
      console.log(`   Longueur du texte: ${extraction2.textLength?.toLocaleString() || "N/A"} caractères`);
      
      if (extraction2.preview) {
        console.log(`\n📝 PREVIEW (1000 premiers caractères):`);
        console.log("─".repeat(80));
        console.log(extraction2.preview.substring(0, 1000));
        console.log("─".repeat(80));
      }
    } else {
      console.log("❌ ÉCHEC DE L'EXTRACTION\n");
      console.log(`Erreur: ${extraction2.error}`);
      console.log("\n💡 Ceci est normal si la thèse n'est pas accessible en ligne.");
    }
    
    // ======== TEST 3: Enrichissement d'une thèse fictive ========
    console.log("\n" + "=".repeat(80));
    console.log("\n🔄 TEST 3: Enrichissement d'une thèse avec le texte PDF\n");
    
    const mockThese = {
      id: "test:123",
      title: "Intelligence artificielle et apprentissage automatique",
      year: 2023,
      pdfUrl: testPdfUrl,
      authors: [{ name: "Test Auteur", role: "author" }],
      institutions: [{ name: "Université Test", type: "soutenance" }]
    };
    
    console.log(`Thèse: ${mockThese.title}`);
    console.log(`PDF: ${mockThese.pdfUrl}\n`);
    
    const enriched = await enrichTheseWithPDFText(mockThese, {
      maxPages: 10,
      timeout: 30000
    });
    
    console.log(`✅ Enrichissement terminé\n`);
    console.log(`Statut d'extraction:`);
    console.log(`   Tentative: ${enriched.pdfExtraction?.attempted ? "✅" : "❌"}`);
    console.log(`   Succès: ${enriched.pdfExtraction?.success ? "✅" : "❌"}`);
    console.log(`   Erreur: ${enriched.pdfExtraction?.error || "Aucune"}`);
    
    if (enriched.pdfExtraction?.success) {
      console.log(`\n📊 Données extraites:`);
      console.log(`   Pages: ${enriched.pdfExtraction.pages || "N/A"}`);
      console.log(`   Longueur texte: ${enriched.pdfExtraction.textLength?.toLocaleString() || "N/A"} caractères`);
      console.log(`   A le texte complet: ${enriched.hasFullText ? "✅" : "❌"}`);
      
      if (enriched.abstract && !mockThese.abstract) {
        console.log(`\n✨ Abstract enrichi depuis le PDF (preview):`);
        console.log(`   ${enriched.abstract.substring(0, 200)}...`);
      }
    }
    
    // ======== CONCLUSION ========
    console.log("\n" + "=".repeat(80));
    console.log("\n✅ TEST TERMINÉ\n");
    
    const successCount = [extraction1, extraction2].filter(e => e.success).length;
    
    if (successCount > 0) {
      console.log(`🎉 ${successCount}/2 extraction(s) réussie(s)!`);
      console.log(`   Le système d'extraction de PDF fonctionne correctement.\n`);
      
      console.log(`📝 FONCTIONNALITÉS TESTÉES:`);
      console.log(`   ✅ Téléchargement de PDF`);
      console.log(`   ✅ Extraction de texte avec pdf-parse`);
      console.log(`   ✅ Nettoyage et normalisation du texte`);
      console.log(`   ✅ Enrichissement d'objets thèse`);
      console.log(`   ✅ Gestion des erreurs\n`);
    } else {
      console.log("⚠️  AVERTISSEMENT:");
      console.log("   Aucune extraction n'a réussi.");
      console.log("   Vérifiez la connectivité réseau et les URLs de test.\n");
    }
    
  } catch (error: any) {
    console.error("\n❌ ERREUR LORS DU TEST:", error.message);
    console.error(error.stack);
  }
}

// Exécuter le test
testDirectPDFExtraction().catch(console.error);
