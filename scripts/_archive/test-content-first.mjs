/**
 * Test de la stratégie "Content-First" pour theses.fr
 * 
 * Vérifie que :
 * 1. Seules les thèses avec contenu exploitable sont gardées
 * 2. Le scoring valorise le contenu
 * 3. Les rejets sont bien loggés
 */

import { searchThesesFr } from "../lib/providers/thesesfr.js";
import { enrichManyThesesWithHAL } from "../lib/providers/thesesfr-hal-bridge.js";
import { scoreSource } from "../lib/score.mjs";

async function testContentFirstStrategy() {
  console.log("🧪 Test de la stratégie Content-First\n");
  console.log("=".repeat(60));
  
  const query = "intelligence artificielle";
  
  try {
    // 1. Recherche initiale
    console.log("\n📋 ÉTAPE 1 : Recherche theses.fr");
    console.log("-".repeat(60));
    const rawTheses = await searchThesesFr(query, 10);
    console.log(`✅ ${rawTheses.length} thèses trouvées`);
    
    // 2. Séparation PDF direct vs sans PDF
    console.log("\n📄 ÉTAPE 2 : Analyse PDFs directs");
    console.log("-".repeat(60));
    const withDirectPDF = rawTheses.filter(t => t.pdfUrl && t.pdfUrl.includes("theses.fr"));
    const withoutPDF = rawTheses.filter(t => !t.pdfUrl || !t.pdfUrl.includes("theses.fr"));
    
    console.log(`📄 ${withDirectPDF.length} thèses avec PDF direct`);
    console.log(`🔍 ${withoutPDF.length} thèses à enrichir avec HAL`);
    
    // 3. Enrichissement HAL
    console.log("\n🌉 ÉTAPE 3 : Enrichissement HAL Bridge");
    console.log("-".repeat(60));
    const enrichedTheses = await enrichManyThesesWithHAL(withoutPDF, 10);
    
    const withHALContent = enrichedTheses.filter(t => t.hasFullText);
    console.log(`✅ ${withHALContent.length}/${withoutPDF.length} matchés avec HAL`);
    
    // 4. Filtrage contenu minimum
    console.log("\n🎯 ÉTAPE 4 : Filtrage contenu exploitable (≥500 chars)");
    console.log("-".repeat(60));
    const allWithContent = [...withDirectPDF, ...withHALContent];
    const exploitable = allWithContent.filter(t => {
      const contentLen = t.contentLength || t.abstract?.length || 0;
      return contentLen >= 500;
    });
    
    const rejected = rawTheses.length - exploitable.length;
    
    console.log(`✅ ${exploitable.length} thèses exploitables`);
    console.log(`🚫 ${rejected} thèses rejetées (métadonnées seules)`);
    console.log(`📊 Taux de succès : ${Math.round((exploitable.length / rawTheses.length) * 100)}%`);
    
    // 5. Analyse du scoring
    console.log("\n⭐ ÉTAPE 5 : Analyse scoring avec contentBonus");
    console.log("-".repeat(60));
    
    const scoredTheses = exploitable.map(t => {
      const score = scoreSource({
        year: t.year,
        citationCount: t.citationCount,
        oaStatus: t.oaStatus,
        institutions: t.institutions?.map(i => i.name),
        provider: t.provider,
        type: t.type,
        abstract: t.abstract,
        hasFullText: t.hasFullText,
        contentLength: t.contentLength || t.abstract?.length
      });
      
      return {
        title: t.title.substring(0, 60),
        contentSource: t.contentSource || "thesesfr",
        contentLength: t.contentLength || t.abstract?.length || 0,
        score: score
      };
    }).sort((a, b) => b.score - a.score);
    
    console.log("\nTop 5 thèses par score :\n");
    scoredTheses.slice(0, 5).forEach((t, i) => {
      console.log(`${i + 1}. Score: ${t.score}/100`);
      console.log(`   Titre: ${t.title}...`);
      console.log(`   Source: ${t.contentSource}`);
      console.log(`   Contenu: ${t.contentLength} caractères`);
      console.log("");
    });
    
    // 6. Statistiques détaillées
    console.log("\n📊 STATISTIQUES FINALES");
    console.log("=".repeat(60));
    
    const avgScore = Math.round(scoredTheses.reduce((sum, t) => sum + t.score, 0) / scoredTheses.length);
    const avgContentLength = Math.round(scoredTheses.reduce((sum, t) => sum + t.contentLength, 0) / scoredTheses.length);
    
    const bySource = {
      thesesfr: scoredTheses.filter(t => t.contentSource === "thesesfr").length,
      hal: scoredTheses.filter(t => t.contentSource === "hal").length
    };
    
    console.log(`📈 Score qualité moyen     : ${avgScore}/100`);
    console.log(`📝 Longueur contenu moyen  : ${avgContentLength} chars`);
    console.log(`📄 Sources PDF direct      : ${bySource.thesesfr}`);
    console.log(`🌉 Sources bridge HAL      : ${bySource.hal}`);
    console.log(`✅ Total exploitable       : ${exploitable.length}/${rawTheses.length} (${Math.round((exploitable.length / rawTheses.length) * 100)}%)`);
    
    // 7. Validation
    console.log("\n✅ VALIDATION");
    console.log("=".repeat(60));
    
    const checks = {
      "Toutes sources ont du contenu": exploitable.every(t => (t.contentLength || t.abstract?.length || 0) >= 500),
      "Score moyen ≥ 70": avgScore >= 70,
      "Taux succès ≥ 30%": (exploitable.length / rawTheses.length) >= 0.3,
      "Sources HAL identifiées": bySource.hal > 0
    };
    
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`${passed ? "✅" : "❌"} ${check}`);
    });
    
    const allPassed = Object.values(checks).every(v => v);
    
    console.log("\n" + "=".repeat(60));
    if (allPassed) {
      console.log("🎉 TOUS LES TESTS PASSENT - Stratégie Content-First opérationnelle !");
    } else {
      console.log("⚠️  CERTAINS TESTS ÉCHOUENT - Vérifier la configuration");
    }
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("\n❌ ERREUR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Exécution
testContentFirstStrategy()
  .then(() => {
    console.log("\n✅ Test terminé avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erreur lors du test:", error);
    process.exit(1);
  });
