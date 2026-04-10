/**
 * 🧪 Test du script d'extraction de PDF pour les thèses
 * 
 * Ce script teste:
 * 1. La recherche de thèses avec PDF disponibles
 * 2. Le téléchargement et l'extraction de texte depuis les PDFs
 * 3. Les statistiques d'extraction
 */

import "dotenv/config";
import { searchThesesFr } from "../lib/providers/thesesfr";
import { 
  extractPDFText, 
  enrichTheseWithPDFText, 
  extractManyPDFs,
  getPDFExtractionStats 
} from "../lib/providers/pdf-extractor";

async function testPDFExtraction() {
  console.log("🧪 TEST DU SCRIPT D'EXTRACTION DE PDF\n");
  console.log("=" .repeat(80));
  
  try {
    // ======== ÉTAPE 1: Rechercher des thèses avec PDF ========
    console.log("\n📚 ÉTAPE 1: Recherche de thèses avec PDF disponibles...\n");
    
    const query = "intelligence artificielle";
    const results = await searchThesesFr(query, 10);
    
    console.log(`✅ ${results.length} thèses trouvées`);
    
    // Filtrer les thèses avec PDF disponible
    const withPDF = results.filter(r => r.pdfUrl);
    console.log(`📄 ${withPDF.length} thèses avec PDF disponible\n`);
    
    if (withPDF.length === 0) {
      console.log("❌ Aucune thèse avec PDF disponible trouvée");
      return;
    }
    
    // Afficher les thèses trouvées
    withPDF.forEach((these, idx) => {
      console.log(`${idx + 1}. ${these.title.substring(0, 60)}...`);
      console.log(`   NNT: ${these.extra?.nnt || "N/A"}`);
      console.log(`   PDF: ${these.pdfUrl}`);
      console.log(`   Année: ${these.year || "N/A"}\n`);
    });
    
    // ======== ÉTAPE 2: Test d'extraction sur UNE thèse ========
    console.log("=" .repeat(80));
    console.log("\n📄 ÉTAPE 2: Test d'extraction sur une thèse\n");
    
    const testThese = withPDF[0];
    console.log(`Thèse sélectionnée: ${testThese.title.substring(0, 80)}...`);
    console.log(`PDF URL: ${testThese.pdfUrl}\n`);
    
    console.log("⏳ Téléchargement et extraction en cours...\n");
    
    const extraction = await extractPDFText(testThese.pdfUrl!, {
      maxPages: 50, // Limiter à 50 pages pour le test
      timeout: 60000, // 60 secondes
      maxSize: 50 * 1024 * 1024 // 50MB
    });
    
    if (extraction.success) {
      console.log("✅ EXTRACTION RÉUSSIE!\n");
      console.log(`📊 MÉTADONNÉES:`);
      console.log(`   Pages: ${extraction.pages || "N/A"}`);
      console.log(`   Longueur du texte: ${extraction.textLength?.toLocaleString() || "N/A"} caractères`);
      console.log(`   Taille du preview: ${extraction.preview?.length || 0} caractères\n`);
      
      if (extraction.preview) {
        console.log(`📝 PREVIEW (500 premiers caractères):`);
        console.log("─".repeat(80));
        console.log(extraction.preview.substring(0, 500));
        console.log("─".repeat(80));
      }
      
      if (extraction.text && extraction.text.length === 0) {
        console.log("\n⚠️  Note: Le texte est vide. La bibliothèque pdf-parse est peut-être manquante.");
        console.log("   Pour installer: npm install pdf-parse");
      }
    } else {
      console.log("❌ ÉCHEC DE L'EXTRACTION\n");
      console.log(`Erreur: ${extraction.error}`);
    }
    
    // ======== ÉTAPE 3: Enrichissement d'une thèse avec le texte PDF ========
    console.log("\n" + "=".repeat(80));
    console.log("\n🔄 ÉTAPE 3: Enrichissement d'une thèse avec le texte PDF\n");
    
    const enriched = await enrichTheseWithPDFText(testThese, {
      maxPages: 50,
      timeout: 60000
    });
    
    console.log(`Thèse enrichie: ${enriched.title.substring(0, 60)}...`);
    console.log(`\nStatut d'extraction:`);
    console.log(`   Tentative: ${enriched.pdfExtraction?.attempted ? "✅" : "❌"}`);
    console.log(`   Succès: ${enriched.pdfExtraction?.success ? "✅" : "❌"}`);
    console.log(`   Erreur: ${enriched.pdfExtraction?.error || "Aucune"}`);
    
    if (enriched.pdfExtraction?.success) {
      console.log(`\nDonnées extraites:`);
      console.log(`   Pages: ${enriched.pdfExtraction.pages || "N/A"}`);
      console.log(`   Longueur texte: ${enriched.pdfExtraction.textLength?.toLocaleString() || "N/A"} caractères`);
      console.log(`   A le texte complet: ${enriched.hasFullText ? "✅" : "❌"}`);
      
      if (enriched.abstract && !testThese.abstract) {
        console.log(`\n✨ Abstract enrichi depuis le PDF (preview):`);
        console.log(`   ${enriched.abstract.substring(0, 200)}...`);
      }
    }
    
    // ======== ÉTAPE 4: Extraction en lot (3 thèses) ========
    console.log("\n" + "=".repeat(80));
    console.log("\n📦 ÉTAPE 4: Extraction en lot (3 thèses max)\n");
    
    const batchSize = Math.min(3, withPDF.length);
    const batchTheses = withPDF.slice(0, batchSize);
    
    console.log(`Traitement de ${batchSize} thèses en parallèle...\n`);
    
    const enrichedBatch = await extractManyPDFs(batchTheses, {
      maxPages: 30, // Limiter pour le test
      timeout: 45000
    }, 2); // Concurrence de 2
    
    // ======== ÉTAPE 5: Statistiques ========
    console.log("\n" + "=".repeat(80));
    console.log("\n📊 ÉTAPE 5: STATISTIQUES D'EXTRACTION\n");
    
    const stats = getPDFExtractionStats(enrichedBatch);
    
    console.log(`📈 Résultats globaux:`);
    console.log(`   Total de thèses: ${stats.total}`);
    console.log(`   Extractions tentées: ${stats.attempted}`);
    console.log(`   Réussies: ${stats.successful}`);
    console.log(`   Échouées: ${stats.failed}`);
    console.log(`   Taux de réussite: ${(stats.successRate * 100).toFixed(1)}%`);
    console.log(`\n📄 Données extraites:`);
    console.log(`   Total de pages: ${stats.totalPages}`);
    console.log(`   Total de caractères: ${stats.totalTextLength.toLocaleString()}`);
    console.log(`   Moyenne par thèse: ${Math.round(stats.avgTextLength).toLocaleString()} caractères`);
    
    // Détails par thèse
    console.log(`\n📋 Détails par thèse:`);
    enrichedBatch.forEach((these, idx) => {
      const status = these.pdfExtraction?.success ? "✅" : "❌";
      const pages = these.pdfExtraction?.pages || 0;
      const textLen = these.pdfExtraction?.textLength || 0;
      const error = these.pdfExtraction?.error || "";
      
      console.log(`\n${idx + 1}. ${status} ${these.title.substring(0, 50)}...`);
      if (these.pdfExtraction?.success) {
        console.log(`   Pages: ${pages}, Texte: ${textLen.toLocaleString()} caractères`);
      } else {
        console.log(`   Erreur: ${error}`);
      }
    });
    
    // ======== CONCLUSION ========
    console.log("\n" + "=".repeat(80));
    console.log("\n✅ TEST TERMINÉ\n");
    
    if (stats.successful === 0) {
      console.log("⚠️  AVERTISSEMENT:");
      console.log("   Aucune extraction n'a réussi.");
      console.log("   Vérifiez que la bibliothèque pdf-parse est installée:");
      console.log("   → npm install pdf-parse\n");
    } else {
      console.log(`🎉 ${stats.successful} extraction(s) réussie(s)!`);
      console.log(`   Le système d'extraction de PDF fonctionne correctement.\n`);
    }
    
  } catch (error: any) {
    console.error("\n❌ ERREUR LORS DU TEST:", error.message);
    console.error(error.stack);
  }
}

// Exécuter le test
testPDFExtraction().catch(console.error);
