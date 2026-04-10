/**
 * Classify existing sources into domains
 * Uses keyword matching + optional GPT-4 for ambiguous cases
 * 
 * Run: node scripts/classify-sources.mjs
 */

import { PrismaClient } from "../generated/prisma-client/index.js";

const prisma = new PrismaClient();

// Domain definitions (must match seed-domains.mjs)
const DOMAINS = [
  {
    slug: "economie",
    keywords: [
      "economics",
      "economy",
      "économie",
      "fiscal",
      "monetary",
      "gdp",
      "inflation",
      "unemployment",
      "finance",
      "banking",
      "trade",
      "market",
      "investment",
      "tax",
      "budget",
      "recession",
      "growth",
    ],
  },
  {
    slug: "science",
    keywords: [
      "physics",
      "chemistry",
      "mathematics",
      "astronomy",
      "quantum",
      "particle",
      "molecule",
      "theorem",
      "equation",
      "experiment",
      "laboratory",
    ],
  },
  {
    slug: "ecologie",
    keywords: [
      "climate",
      "environment",
      "ecology",
      "biodiversity",
      "emissions",
      "carbon",
      "renewable",
      "sustainability",
      "pollution",
      "deforestation",
      "ocean",
      "atmosphere",
      "conservation",
      "greenhouse",
    ],
  },
  {
    slug: "medecine",
    keywords: [
      "medicine",
      "health",
      "disease",
      "treatment",
      "diagnosis",
      "patient",
      "clinical",
      "therapy",
      "drug",
      "vaccine",
      "surgery",
      "epidemiology",
      "hospital",
      "cancer",
    ],
  },
  {
    slug: "technologie",
    keywords: [
      "technology",
      "artificial intelligence",
      "ai",
      "machine learning",
      "deep learning",
      "neural network",
      "algorithm",
      "computing",
      "software",
      "data science",
      "automation",
      "robotics",
      "digital",
    ],
  },
  {
    slug: "sociologie",
    keywords: [
      "sociology",
      "society",
      "social",
      "culture",
      "education",
      "inequality",
      "poverty",
      "migration",
      "demographics",
      "behavior",
      "identity",
      "community",
      "welfare",
    ],
  },
  {
    slug: "politique",
    keywords: [
      "politics",
      "policy",
      "law",
      "government",
      "regulation",
      "legislation",
      "democracy",
      "election",
      "vote",
      "constitution",
      "court",
      "justice",
      "rights",
    ],
  },
  {
    slug: "energie",
    keywords: [
      "energy",
      "power",
      "electricity",
      "renewable",
      "solar",
      "wind",
      "nuclear",
      "fossil",
      "oil",
      "gas",
      "battery",
      "grid",
      "efficiency",
    ],
  },
];

/**
 * Calculate domain scores for a source based on keyword matching
 */
function calculateDomainScores(source) {
  const text = `${source.title} ${source.abstract || ""}`.toLowerCase();
  const scores = {};

  for (const domain of DOMAINS) {
    let matches = 0;
    const totalKeywords = domain.keywords.length;

    for (const keyword of domain.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matches++;
      }
    }

    // Score is percentage of keywords found
    const score = matches / totalKeywords;
    
    if (score > 0) {
      scores[domain.slug] = score;
    }
  }

  return scores;
}

/**
 * Classify a single source
 */
async function classifySource(source) {
  try {
    const scores = calculateDomainScores(source);

    // Get domain IDs from DB
    const domainSlugs = Object.keys(scores);
    if (domainSlugs.length === 0) {
      return { classified: false, domains: [] };
    }

    const domains = await prisma.domain.findMany({
      where: { slug: { in: domainSlugs } },
    });

    // Create SourceDomain links
    const links = [];
    for (const domain of domains) {
      const score = scores[domain.slug];
      
      // Only link if score is above threshold
      if (score >= 0.05) {
        // Check if link already exists
        const existing = await prisma.sourceDomain.findUnique({
          where: {
            sourceId_domainId: {
              sourceId: source.id,
              domainId: domain.id,
            },
          },
        });

        if (!existing) {
          await prisma.sourceDomain.create({
            data: {
              sourceId: source.id,
              domainId: domain.id,
              score,
            },
          });
          links.push({ slug: domain.slug, score });
        }
      }
    }

    return { classified: true, domains: links };
  } catch (error) {
    console.error(`  ❌ Error classifying ${source.id}:`, error.message);
    return { classified: false, domains: [], error: error.message };
  }
}

async function main() {
  console.log("🔍 Classifying sources into domains...\n");

  // Get sources without domain classification
  const sources = await prisma.source.findMany({
    where: {
      OR: [
        { domains: { none: {} } }, // No domains linked
        // You can also reclassify all sources by removing this filter
      ],
    },
    take: 1000, // Process in batches
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${sources.length} sources to classify\n`);

  let classified = 0;
  let skipped = 0;

  for (const source of sources) {
    const result = await classifySource(source);

    if (result.classified && result.domains.length > 0) {
      classified++;
      const domainsStr = result.domains
        .map((d) => `${d.slug} (${(d.score * 100).toFixed(1)}%)`)
        .join(", ");
      console.log(`  ✓ ${source.title.slice(0, 60)}... → ${domainsStr}`);
    } else {
      skipped++;
      console.log(`  - ${source.title.slice(0, 60)}... → no strong match`);
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log("\n✅ Classification complete!");
  console.log(`   Classified: ${classified}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${sources.length}`);
}

main()
  .catch((e) => {
    console.error("❌ Error classifying sources:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
