/**
 * 🔍 AUDIT COMPLET DES PROVIDERS
 * Test de tous les providers académiques + pipeline complet
 */

import "dotenv/config";
import { searchOpenAlex } from "../lib/providers/openalex";
import { searchThesesFr } from "../lib/providers/thesesfr";
import { searchCrossref } from "../lib/providers/crossref";
import { searchSemanticScholar } from "../lib/providers/semanticscholar";

interface ProviderStats {
  name: string;
  status: "✅ OK" | "⚠️ PARTIAL" | "❌ FAILED";
  resultsCount: number;
  avgQuality: number;
  withAbstract: number;
  withDOI: number;
  withPDF: number;
  executionTime: number;
  error?: string;
}

async function testProvider(
  name: string,
  searchFn: (query: string, limit: number) => Promise<any[]>,
  query: string,
  limit: number
): Promise<ProviderStats> {
  const startTime = Date.now();
  
  try {
    const results = await searchFn(query, limit);
    const executionTime = Date.now() - startTime;
    
    if (results.length === 0) {
      return {
        name,
        status: "⚠️ PARTIAL",
        resultsCount: 0,
        avgQuality: 0,
        withAbstract: 0,
        withDOI: 0,
        withPDF: 0,
        executionTime,
        error: "No results returned"
      };
    }
    
    const withAbstract = results.filter(r => r.abstract && r.abstract.length > 100).length;
    const withDOI = results.filter(r => r.doi).length;
    const withPDF = results.filter(r => r.pdfUrl).length;
    const avgQuality = results.reduce((sum, r) => sum + (r.citationCount || 0), 0) / results.length;
    
    const qualityThreshold = 0.5; // 50% doivent avoir un abstract
    const status = (withAbstract / results.length) >= qualityThreshold ? "✅ OK" : "⚠️ PARTIAL";
    
    return {
      name,
      status,
      resultsCount: results.length,
      avgQuality: Math.round(avgQuality),
      withAbstract,
      withDOI,
      withPDF,
      executionTime
    };
  } catch (error) {
    return {
      name,
      status: "❌ FAILED",
      resultsCount: 0,
      avgQuality: 0,
      withAbstract: 0,
      withDOI: 0,
      withPDF: 0,
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function auditProviders() {
  console.log("🔍 AUDIT COMPLET DES PROVIDERS ACADÉMIQUES\n");
  console.log("=" .repeat(80));
  
  const query = "carbon tax policy effectiveness";
  const limit = 10;
  
  console.log(`\n📊 Query: "${query}"`);
  console.log(`📊 Limite: ${limit} résultats par provider\n`);
  
  // Test de chaque provider
  const providers: ProviderStats[] = [];
  
  console.log("🧪 Test 1/4: OpenAlex...");
  providers.push(await testProvider("OpenAlex", searchOpenAlex, query, limit));
  
  console.log("🧪 Test 2/4: Crossref...");
  providers.push(await testProvider("Crossref", searchCrossref, query, limit));
  
  console.log("🧪 Test 3/4: Semantic Scholar...");
  providers.push(await testProvider("Semantic Scholar", searchSemanticScholar, query, limit));
  
  console.log("🧪 Test 4/4: Theses.fr...");
  providers.push(await testProvider("Theses.fr", searchThesesFr, query, Math.min(5, limit)));
  
  // Affichage des résultats
  console.log("\n" + "=".repeat(80));
  console.log("📈 RÉSULTATS DE L'AUDIT\n");
  
  providers.forEach(p => {
    console.log(`\n${p.status} ${p.name}`);
    console.log(`   Résultats: ${p.resultsCount}`);
    console.log(`   Avec abstract: ${p.withAbstract}/${p.resultsCount} (${Math.round(p.withAbstract/Math.max(p.resultsCount,1)*100)}%)`);
    console.log(`   Avec DOI: ${p.withDOI}/${p.resultsCount} (${Math.round(p.withDOI/Math.max(p.resultsCount,1)*100)}%)`);
    console.log(`   Avec PDF: ${p.withPDF}/${p.resultsCount} (${Math.round(p.withPDF/Math.max(p.resultsCount,1)*100)}%)`);
    console.log(`   Citations moyennes: ${p.avgQuality}`);
    console.log(`   Temps d'exécution: ${p.executionTime}ms`);
    if (p.error) console.log(`   ⚠️  Erreur: ${p.error}`);
  });
  
  // Statistiques globales
  console.log("\n" + "=".repeat(80));
  console.log("📊 STATISTIQUES GLOBALES\n");
  
  const totalResults = providers.reduce((sum, p) => sum + p.resultsCount, 0);
  const totalWithAbstract = providers.reduce((sum, p) => sum + p.withAbstract, 0);
  const totalWithDOI = providers.reduce((sum, p) => sum + p.withDOI, 0);
  const totalWithPDF = providers.reduce((sum, p) => sum + p.withPDF, 0);
  const avgTime = providers.reduce((sum, p) => sum + p.executionTime, 0) / providers.length;
  
  const okProviders = providers.filter(p => p.status === "✅ OK").length;
  const partialProviders = providers.filter(p => p.status === "⚠️ PARTIAL").length;
  const failedProviders = providers.filter(p => p.status === "❌ FAILED").length;
  
  console.log(`Total de sources trouvées: ${totalResults}`);
  console.log(`Sources avec abstract: ${totalWithAbstract} (${Math.round(totalWithAbstract/Math.max(totalResults,1)*100)}%)`);
  console.log(`Sources avec DOI: ${totalWithDOI} (${Math.round(totalWithDOI/Math.max(totalResults,1)*100)}%)`);
  console.log(`Sources avec PDF: ${totalWithPDF} (${Math.round(totalWithPDF/Math.max(totalResults,1)*100)}%)`);
  console.log(`Temps moyen par provider: ${Math.round(avgTime)}ms`);
  
  console.log(`\nProviders fonctionnels: ${okProviders}/4`);
  console.log(`Providers partiels: ${partialProviders}/4`);
  console.log(`Providers en échec: ${failedProviders}/4`);
  
  // Score de santé global
  const healthScore = (okProviders * 100 + partialProviders * 50) / 4;
  console.log(`\n🏥 Score de santé du système: ${Math.round(healthScore)}%`);
  
  if (healthScore >= 75) {
    console.log("✅ Système en bonne santé - Prêt pour la production");
  } else if (healthScore >= 50) {
    console.log("⚠️  Système partiellement fonctionnel - Amélioration recommandée");
  } else {
    console.log("❌ Système dégradé - Action immédiate requise");
  }
  
  // Recommandations
  console.log("\n" + "=".repeat(80));
  console.log("💡 RECOMMANDATIONS\n");
  
  const recommendations: string[] = [];
  
  if (failedProviders > 0) {
    recommendations.push(`⚠️  ${failedProviders} provider(s) en échec - Vérifier les clés API et la connectivité`);
  }
  
  if (totalWithAbstract / Math.max(totalResults, 1) < 0.6) {
    recommendations.push("📝 Taux d'abstracts faible (<60%) - Considérer des providers supplémentaires");
  }
  
  if (totalWithPDF / Math.max(totalResults, 1) < 0.3) {
    recommendations.push("📄 Peu de PDFs disponibles - Intégrer Unpaywall plus systématiquement");
  }
  
  if (avgTime > 5000) {
    recommendations.push("⚡ Temps de réponse élevé (>5s) - Optimiser les requêtes parallèles");
  }
  
  if (totalResults < limit * 2) {
    recommendations.push("📊 Peu de résultats agrégés - Élargir la couverture avec plus de providers");
  }
  
  if (recommendations.length === 0) {
    console.log("✅ Aucune amélioration critique détectée");
    console.log("✅ Le système agrège efficacement les données de multiples sources");
    console.log("✅ La qualité des métadonnées est satisfaisante");
  } else {
    recommendations.forEach(r => console.log(r));
  }
  
  console.log("\n" + "=".repeat(80));
}

auditProviders().catch(console.error);
