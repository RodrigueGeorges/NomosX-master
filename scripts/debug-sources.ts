/**
 * Debug script to see raw sources from OpenAlex
 */

import "dotenv/config";
import { searchOpenAlex } from "../lib/providers/openalex";
import { enhanceQuery } from "../lib/agent/query-enhancer";
import { scoreRelevance } from "../lib/agent/relevance-scorer";

async function main() {
  console.log("🔍 Debugging OpenAlex sources...\n");

  // Enhance query
  const enhanced = await enhanceQuery("artificial intelligence impact on employment");
  console.log("Enhanced query:");
  console.log("  Enhanced:", enhanced.enhanced);
  console.log("  Keywords:", enhanced.keywords);
  console.log("  Topics:", enhanced.topics);

  // Search OpenAlex
  console.log("\n📚 Fetching sources from OpenAlex...");
  const sources = await searchOpenAlex("artificial intelligence employment impact", 5);
  
  console.log(`\nFound ${sources.length} sources\n`);

  // Inspect first 3 sources
  sources.slice(0, 3).forEach((source, idx) => {
    console.log(`\n--- SOURCE ${idx + 1} ---`);
    console.log(`Title: ${source.title}`);
    console.log(`Abstract: ${source.abstract ? source.abstract.slice(0, 150) + "..." : "N/A"}`);
    console.log(`Topics: ${source.topics?.join(", ") || "N/A"}`);
    console.log(`Year: ${source.year || "N/A"}`);
    console.log(`Citations: ${source.citationCount || 0}`);
    
    // Score this source
    const score = scoreRelevance(
      {
        title: source.title,
        abstract: source.abstract,
        topics: source.topics,
        year: source.year,
        citationCount: source.citationCount,
      },
      enhanced
    );
    
    console.log(`\nRelevance Score: ${(score.overall * 100).toFixed(1)}%`);
    console.log(`  Topic Overlap: ${(score.topicOverlap * 100).toFixed(1)}%`);
    console.log(`  Field Match: ${(score.fieldMatch * 100).toFixed(1)}%`);
    console.log(`  Semantic Similarity: ${(score.semanticSimilarity * 100).toFixed(1)}%`);
    console.log(`  Temporal Relevance: ${(score.temporalRelevance * 100).toFixed(1)}%`);
  });
}

main().catch(console.error);
