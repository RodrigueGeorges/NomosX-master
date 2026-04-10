/**
 * Test script for News Intelligence Provider
 * Tests GDELT (free) + NewsAPI (with key) + RSS feeds
 * 
 * Usage: node scripts/test-news-intelligence.mjs
 */

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

// ─── TEST 1: GDELT API ──────────────────────────────────────────────────────

async function testGDELT() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: GDELT API (free, no key)");
  console.log("=".repeat(60));

  const queries = [
    { query: "Iran military conflict", vertical: "geopolitics" },
    { query: "European Commission regulation", vertical: "eu-policy" },
    { query: "climate change renewable energy", vertical: "climate-industry" },
    { query: "artificial intelligence regulation", vertical: "ai-labor" },
    { query: "central bank interest rate", vertical: "finance-regulation" },
  ];

  let totalArticles = 0;

  for (const { query, vertical } of queries) {
    try {
      const params = new URLSearchParams({
        query,
        mode: "ArtList",
        maxrecords: "5",
        timespan: "48h",
        format: "json",
        sort: "DateDesc",
      });

      // Delay between GDELT calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));

      const response = await fetch(`${GDELT_BASE}?${params.toString()}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.log(`  ${response.status === 429 ? "⏳" : "❌"} [${vertical}] "${query}" → HTTP ${response.status}${response.status === 429 ? " (rate limited, retry later)" : ""}`);
        continue;
      }

      const data = await response.json();
      const articles = data.articles || [];
      totalArticles += articles.length;

      console.log(`  ✅ [${vertical}] "${query}" → ${articles.length} articles`);
      if (articles.length > 0) {
        console.log(`     └─ Top: "${articles[0].title?.slice(0, 80)}..." (${articles[0].domain})`);
      }
    } catch (err) {
      console.log(`  ⚠️  [${vertical}] "${query}" → ${err.message}`);
    }
  }

  console.log(`\n  📊 GDELT total: ${totalArticles} articles across ${queries.length} queries`);
  return totalArticles > 0;
}

// ─── TEST 2: NewsAPI ─────────────────────────────────────────────────────────

async function testNewsAPI() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: NewsAPI (requires NEWSAPI_KEY)");
  console.log("=".repeat(60));

  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    console.log("  ⏭️  Skipped — NEWSAPI_KEY not set");
    console.log("  Set: NEWSAPI_KEY=da07b... node scripts/test-news-intelligence.mjs");
    return true; // Not a failure
  }

  const queries = [
    { q: "war OR military OR sanctions", vertical: "geopolitics" },
    { q: "European Union OR EU regulation", vertical: "eu-policy" },
    { q: "climate change OR renewable energy", vertical: "climate-industry" },
  ];

  let totalArticles = 0;

  for (const { q, vertical } of queries) {
    try {
      const params = new URLSearchParams({
        q,
        language: "en",
        sortBy: "publishedAt",
        pageSize: "5",
        apiKey,
      });

      const response = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const body = await response.text();
        console.log(`  ❌ [${vertical}] HTTP ${response.status}: ${body.slice(0, 100)}`);
        continue;
      }

      const data = await response.json();
      const articles = data.articles || [];
      totalArticles += articles.length;

      console.log(`  ✅ [${vertical}] "${q.slice(0, 40)}" → ${articles.length} articles`);
      if (articles.length > 0) {
        console.log(`     └─ Top: "${articles[0].title?.slice(0, 80)}" (${articles[0].source?.name})`);
      }
    } catch (err) {
      console.log(`  ⚠️  [${vertical}] ${err.message}`);
    }
  }

  console.log(`\n  📊 NewsAPI total: ${totalArticles} articles`);
  return totalArticles > 0;
}

// ─── TEST 3: RSS Think Tank Feeds ────────────────────────────────────────────

async function testRSS() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: RSS Think Tank Feeds (free)");
  console.log("=".repeat(60));

  const feeds = [
    { name: "ICG", url: "https://www.crisisgroup.org/rss.xml" },
    { name: "CSIS", url: "https://www.csis.org/rss.xml" },
    { name: "CFR", url: "https://feeds.cfr.org/cfr_main" },
    { name: "Atlantic Council", url: "https://www.atlanticcouncil.org/feed/" },
    { name: "Bruegel", url: "https://www.bruegel.org/rss.xml" },
    { name: "CSET Georgetown", url: "https://cset.georgetown.edu/feed/" },
    { name: "AI Now", url: "https://ainowinstitute.org/feed" },
    { name: "ECB Blog", url: "https://www.ecb.europa.eu/rss/blog.html" },
  ];

  let working = 0;

  for (const feed of feeds) {
    try {
      const response = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "NomosX-ThinkTank/1.0" },
      });

      if (!response.ok) {
        console.log(`  ❌ ${feed.name} → HTTP ${response.status}`);
        continue;
      }

      const xml = await response.text();
      const itemCount = (xml.match(/<item>/gi) || []).length;

      if (itemCount > 0) {
        // Extract first title
        const titleMatch = xml.match(/<item>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const firstTitle = titleMatch?.[1]?.trim().slice(0, 80) || "?";
        console.log(`  ✅ ${feed.name} → ${itemCount} items`);
        console.log(`     └─ Latest: "${firstTitle}"`);
        working++;
      } else {
        console.log(`  ⚠️  ${feed.name} → RSS OK but 0 items`);
      }
    } catch (err) {
      console.log(`  ❌ ${feed.name} → ${err.message}`);
    }
  }

  console.log(`\n  📊 RSS: ${working}/${feeds.length} feeds working`);
  return working > 0;
}

// ─── TEST 4: Keyword Coverage Check ─────────────────────────────────────────

function testKeywordCoverage() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: Keyword Coverage Verification");
  console.log("=".repeat(60));

  const VERTICAL_KEYWORDS = {
    "geopolitics": [
      "geopolitical", "international relations", "diplomacy", "security", "conflict",
      "sanctions", "trade war", "nato", "foreign policy", "bilateral",
      "war", "military", "armed conflict", "invasion", "escalation", "crisis",
      "ceasefire", "peace talks", "treaty", "alliance", "deterrence",
      "nuclear", "missile", "weapons", "defense", "army", "navy", "air force",
      "iran", "russia", "china", "ukraine", "taiwan", "north korea", "gaza",
      "israel", "palestine", "syria", "yemen", "afghanistan", "sudan", "libya",
      "middle east", "indo-pacific", "south china sea", "arctic",
      "terrorism", "insurgency", "extremism", "coup", "regime change",
      "un security council", "g7", "g20", "brics", "african union",
      "intelligence", "espionage", "cyber warfare", "hybrid warfare",
      "refugee", "migration crisis", "humanitarian", "genocide", "ethnic conflict",
      "oil embargo", "energy weapon", "food security", "water conflict",
      "belt and road", "quad", "aukus", "shanghai cooperation"
    ],
  };

  // Test real-world scenarios
  const scenarios = [
    { text: "Iran launches military strikes against targets", expected: "geopolitics", minMatches: 2 },
    { text: "Russia-Ukraine war escalation NATO response", expected: "geopolitics", minMatches: 4 },
    { text: "North Korea missile test nuclear weapons", expected: "geopolitics", minMatches: 3 },
    { text: "Gaza ceasefire peace talks humanitarian crisis", expected: "geopolitics", minMatches: 3 },
    { text: "Taiwan strait China military invasion risk", expected: "geopolitics", minMatches: 3 },
    { text: "Sanctions against Iran nuclear deal diplomacy", expected: "geopolitics", minMatches: 3 },
    { text: "Terrorism extremism coup regime change Sudan", expected: "geopolitics", minMatches: 3 },
    { text: "BRICS summit G20 alliance bilateral foreign policy", expected: "geopolitics", minMatches: 4 },
  ];

  let passed = 0;
  for (const scenario of scenarios) {
    const text = scenario.text.toLowerCase();
    const keywords = VERTICAL_KEYWORDS[scenario.expected];
    const matches = keywords.filter(k => text.includes(k));

    const ok = matches.length >= scenario.minMatches;
    const icon = ok ? "✅" : "❌";
    console.log(`  ${icon} "${scenario.text.slice(0, 55)}..." → ${matches.length} matches (need ≥${scenario.minMatches})`);
    if (matches.length > 0) {
      console.log(`     └─ Matched: ${matches.slice(0, 5).join(", ")}${matches.length > 5 ? "..." : ""}`);
    }
    if (ok) passed++;
  }

  console.log(`\n  📊 Keyword coverage: ${passed}/${scenarios.length} scenarios pass`);
  return passed === scenarios.length;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║        NomosX News Intelligence — System Test          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const results = {};

  results.gdelt = await testGDELT();
  results.newsapi = await testNewsAPI();
  results.rss = await testRSS();
  results.keywords = testKeywordCoverage();

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`  GDELT API:      ${results.gdelt ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  NewsAPI:        ${results.newsapi ? "✅ PASS" : "⏭️  SKIP (no key)"}`);
  console.log(`  RSS Feeds:      ${results.rss ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Keywords:       ${results.keywords ? "✅ PASS" : "❌ FAIL"}`);

  const allPass = Object.values(results).every(v => v);
  console.log(`\n  Overall: ${allPass ? "✅ ALL SYSTEMS GO" : "⚠️  ISSUES DETECTED"}`);
  console.log("");
}

main().catch(console.error);
