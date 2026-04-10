/**
 * 🔍 AUDIT COMPLET DE TOUS LES PROVIDERS
 * Test exhaustif des 8 providers académiques
 */

import "dotenv/config";
import { searchOpenAlex } from "../lib/providers/openalex";
import { searchThesesFr } from "../lib/providers/thesesfr";
import { searchCrossref } from "../lib/providers/crossref";
import { searchSemanticScholar } from "../lib/providers/semanticscholar";
import { searchArxiv } from "../lib/providers/arxiv";
import { searchHAL } from "../lib/providers/hal";
import { searchPubMed } from "../lib/providers/pubmed";
import { searchBASE } from "../lib/providers/base";

interface ProviderStats {
  name: string;
  emoji: string;
  status: "✅ OK" | "⚠️ PARTIAL" | "❌ FAILED";
  resultsCount: number;
  avgQuality: number;
  withAbstract: number;
  withDOI: number;
  withPDF: number;
  withAuthors: number;
  executionTime: number;
  error?: string;
}

async function testProvider(
  name: string,
  emoji: string,
  searchFn: (query: string, limit: number) => Promise<any[]>,
  query: string,
  limit: number
): Promise<ProviderStats> {
  const startTime = Date.now();
  
  try {
    console.log(`   Testing ${name}...`);
    const results = await searchFn(query, limit);
    const executionTime = Date.now() - startTime;
    
    if (results.length === 0) {
      return {
        name,
        emoji,
        status: "⚠️ PARTIAL",
        resultsCount: 0,
        avgQuality: 0,
        withAbstract: 0,
        withDOI: 0,
        withPDF: 0,
        withAuthors: 0,
        executionTime,
        error: "No results returned"
      };
    }
    
    const withAbstract = results.filter(r => r.abstract && r.abstract.length > 100).length;
    const withDOI = results.filter(r => r.doi).length;
    const withPDF = results.filter(r => r.pdfUrl).length;
    const withAuthors = results.filter(r => r.authors && r.authors.length > 0).length;
    const avgQuality = results.reduce((sum, r) => sum + (r.citationCount || 0), 0) / results.length;
    
    // Critères de qualité : 40% doivent avoir un abstract ET des auteurs
    const qualityScore = (withAbstract + withAuthors) / (results.length * 2);
    const status = qualityScore >= 0.4 ? "✅ OK" : "⚠️ PARTIAL";
    
    return {
      name,
      emoji,
      status,
      resultsCount: results.length,
      avgQuality: Math.round(avgQuality),
      withAbstract,
      withDOI,
      withPDF,
      withAuthors,
      executionTime
    };
  } catch (error) {
    return {
      name,
      emoji,
      status: "❌ FAILED",
      resultsCount: 0,
      avgQuality: 0,
      withAbstract: 0,
      withDOI: 0,
      withPDF: 0,
      withAuthors: 0,
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function auditAllProviders() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════════════════════╗");
  console.log("║           🔍 AUDIT COMPLET DES PROVIDERS ACADÉMIQUES - NomosX             ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════╝");
  
  const query = "climate change economic impact";
  const limit = 15;
  
  console.log(`\n📊 Requête de test: "${query}"`);
  console.log(`📊 Objectif: ${limit} résultats par provider\n`);
  
  console.log("─".repeat(80));
  console.log("🧪 PHASE 1: Test des providers individuels\n");
  
  const providers: ProviderStats[] = [];
  
  // Test de chaque provider
  providers.push(await testProvider("OpenAlex", "🌍", searchOpenAlex, query, limit));
  providers.push(await testProvider("Crossref", "📚", searchCrossref, query, limit));
  providers.push(await testProvider("Semantic Scholar", "🧠", searchSemanticScholar, query, limit));
  providers.push(await testProvider("arXiv", "📄", searchArxiv, query, limit));
  providers.push(await testProvider("HAL", "🇫🇷", searchHAL, query, limit));
  providers.push(await testProvider("PubMed", "🏥", searchPubMed, query, limit));
  providers.push(await testProvider("BASE", "🔎", searchBASE, query, limit));
  providers.push(await testProvider("Theses.fr", "🎓", searchThesesFr, query, Math.min(5, limit)));
  
  // Affichage des résultats détaillés
  console.log("\n" + "─".repeat(80));
  console.log("📈 PHASE 2: Résultats détaillés par provider\n");
  
  providers.forEach(p => {
    console.log(`${p.emoji} ${p.status} ${p.name}`);
    console.log(`   └─ Résultats: ${p.resultsCount}/${limit}`);
    console.log(`   └─ Abstracts: ${p.withAbstract}/${p.resultsCount} (${Math.round(p.withAbstract/Math.max(p.resultsCount,1)*100)}%)`);
    console.log(`   └─ DOIs: ${p.withDOI}/${p.resultsCount} (${Math.round(p.withDOI/Math.max(p.resultsCount,1)*100)}%)`);
    console.log(`   └─ PDFs: ${p.withPDF}/${p.resultsCount} (${Math.round(p.withPDF/Math.max(p.resultsCount,1)*100)}%)`);
    console.log(`   └─ Auteurs: ${p.withAuthors}/${p.resultsCount} (${Math.round(p.withAuthors/Math.max(p.resultsCount,1)*100)}%)`);
    console.log(`   └─ Citations moy.: ${p.avgQuality}`);
    console.log(`   └─ Temps: ${p.executionTime}ms`);
    if (p.error) console.log(`   └─ ⚠️  ${p.error}`);
    console.log();
  });
  
  // Statistiques globales
  console.log("─".repeat(80));
  console.log("📊 PHASE 3: Statistiques d'agrégation globales\n");
  
  const totalResults = providers.reduce((sum, p) => sum + p.resultsCount, 0);
  const totalWithAbstract = providers.reduce((sum, p) => sum + p.withAbstract, 0);
  const totalWithDOI = providers.reduce((sum, p) => sum + p.withDOI, 0);
  const totalWithPDF = providers.reduce((sum, p) => sum + p.withPDF, 0);
  const totalWithAuthors = providers.reduce((sum, p) => sum + p.withAuthors, 0);
  const avgTime = providers.reduce((sum, p) => sum + p.executionTime, 0) / providers.length;
  
  const okProviders = providers.filter(p => p.status === "✅ OK");
  const partialProviders = providers.filter(p => p.status === "⚠️ PARTIAL");
  const failedProviders = providers.filter(p => p.status === "❌ FAILED");
  
  console.log(`Total de sources agrégées: ${totalResults}`);
  console.log(`Sources avec abstract: ${totalWithAbstract} (${Math.round(totalWithAbstract/Math.max(totalResults,1)*100)}%)`);
  console.log(`Sources avec DOI: ${totalWithDOI} (${Math.round(totalWithDOI/Math.max(totalResults,1)*100)}%)`);
  console.log(`Sources avec PDF: ${totalWithPDF} (${Math.round(totalWithPDF/Math.max(totalResults,1)*100)}%)`);
  console.log(`Sources avec auteurs: ${totalWithAuthors} (${Math.round(totalWithAuthors/Math.max(totalResults,1)*100)}%)`);
  console.log(`Temps moyen par provider: ${Math.round(avgTime)}ms`);
  
  console.log(`\n📊 Providers fonctionnels: ${okProviders.length}/8`);
  console.log(`📊 Providers partiels: ${partialProviders.length}/8`);
  console.log(`📊 Providers en échec: ${failedProviders.length}/8`);
  
  // Score de santé global
  const healthScore = (okProviders.length * 100 + partialProviders.length * 50) / 8;
  console.log(`\n🏥 SCORE DE SANTÉ DU SYSTÈME: ${Math.round(healthScore)}%`);
  
  if (healthScore >= 80) {
    console.log("✅ EXCELLENT - Système de production de classe mondiale");
  } else if (healthScore >= 60) {
    console.log("✅ BON - Système prêt pour la production");
  } else if (healthScore >= 40) {
    console.log("⚠️  MOYEN - Améliorations recommandées");
  } else {
    console.log("❌ CRITIQUE - Action immédiate requise");
  }
  
  // Classement des providers par qualité
  console.log("\n" + "─".repeat(80));
  console.log("🏆 PHASE 4: Classement des providers par qualité\n");
  
  const rankedProviders = [...providers]
    .filter(p => p.resultsCount > 0)
    .sort((a, b) => {
      const scoreA = (a.withAbstract + a.withDOI + a.withPDF + a.withAuthors) / Math.max(a.resultsCount, 1);
      const scoreB = (b.withAbstract + b.withDOI + b.withPDF + b.withAuthors) / Math.max(b.resultsCount, 1);
      return scoreB - scoreA;
    });
  
  rankedProviders.forEach((p, idx) => {
    const qualityScore = Math.round(
      ((p.withAbstract + p.withDOI + p.withPDF + p.withAuthors) / Math.max(p.resultsCount, 1)) * 25
    );
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
    console.log(`${medal} ${p.emoji} ${p.name} - Score: ${qualityScore}%`);
  });
  
  // Recommandations stratégiques
  console.log("\n" + "─".repeat(80));
  console.log("💡 PHASE 5: Recommandations stratégiques CTO\n");
  
  const recommendations: string[] = [];
  
  if (failedProviders.length > 0) {
    recommendations.push(`🔴 CRITIQUE: ${failedProviders.length} provider(s) en échec → ${failedProviders.map(p => p.name).join(", ")}`);
  }
  
  if (okProviders.length >= 5) {
    recommendations.push(`🟢 EXCELLENT: ${okProviders.length} providers fonctionnels → Couverture multi-sources solide`);
  }
  
  if (totalResults >= 80) {
    recommendations.push(`🟢 EXCELLENT: ${totalResults} sources agrégées → Volume suffisant pour analyses robustes`);
  } else if (totalResults >= 50) {
    recommendations.push(`🟡 BON: ${totalResults} sources agrégées → Volume acceptable`);
  } else {
    recommendations.push(`🔴 FAIBLE: ${totalResults} sources agrégées → Augmenter limite par provider`);
  }
  
  if (totalWithAbstract / Math.max(totalResults, 1) >= 0.7) {
    recommendations.push(`🟢 EXCELLENT: ${Math.round(totalWithAbstract/Math.max(totalResults,1)*100)}% avec abstracts → Qualité d'analyse optimale`);
  } else if (totalWithAbstract / Math.max(totalResults, 1) >= 0.5) {
    recommendations.push(`🟡 BON: ${Math.round(totalWithAbstract/Math.max(totalResults,1)*100)}% avec abstracts → Acceptable`);
  } else {
    recommendations.push(`🔴 FAIBLE: ${Math.round(totalWithAbstract/Math.max(totalResults,1)*100)}% avec abstracts → Prioriser providers avec abstracts`);
  }
  
  if (totalWithPDF / Math.max(totalResults, 1) >= 0.4) {
    recommendations.push(`🟢 EXCELLENT: ${Math.round(totalWithPDF/Math.max(totalResults,1)*100)}% avec PDFs → Open Access élevé`);
  } else {
    recommendations.push(`🟡 MOYEN: ${Math.round(totalWithPDF/Math.max(totalResults,1)*100)}% avec PDFs → Renforcer enrichissement Unpaywall`);
  }
  
  if (avgTime <= 2000) {
    recommendations.push(`🟢 EXCELLENT: ${Math.round(avgTime)}ms en moyenne → Performance optimale`);
  } else if (avgTime <= 5000) {
    recommendations.push(`🟡 BON: ${Math.round(avgTime)}ms en moyenne → Performance acceptable`);
  } else {
    recommendations.push(`🔴 LENT: ${Math.round(avgTime)}ms en moyenne → Optimiser requêtes parallèles`);
  }
  
  recommendations.forEach(r => console.log(r));
  
  // Configuration recommandée
  console.log("\n" + "─".repeat(80));
  console.log("⚙️  PHASE 6: Configuration recommandée pour production\n");
  
  const bestProviders = okProviders.map(p => p.name.toLowerCase().replace(/\s+/g, ""));
  const recommendedConfig = [
    ...bestProviders,
    ...partialProviders.slice(0, 2).map(p => p.name.toLowerCase().replace(/\s+/g, ""))
  ];
  
  console.log("Providers recommandés (par ordre de priorité):");
  recommendedConfig.forEach((p, idx) => {
    const provider = providers.find(pr => pr.name.toLowerCase().replace(/\s+/g, "") === p);
    console.log(`  ${idx + 1}. ${provider?.emoji} ${provider?.name}`);
  });
  
  console.log("\n" + "═".repeat(80));
  console.log("                      ✅ AUDIT TERMINÉ AVEC SUCCÈS");
  console.log("═".repeat(80) + "\n");
}

auditAllProviders().catch(console.error);
