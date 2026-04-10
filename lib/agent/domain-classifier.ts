/**
 * Domain Classification Agent
 * 
 * Classifie automatiquement les sources dans un ou plusieurs domaines
 * basé sur title, abstract, topics et JEL codes
 */

import { prisma } from '@/lib/db';

/**
 * Classifie une source unique dans des domaines
 */
export async function classifySourceDomains(sourceId: string): Promise<{
  sourceId: string;
  domains: Array<{ slug: string; score: number }>;
}> {
  // Fetch source
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: {
      title: true,
      abstract: true,
      topics: true,
      jelCodes: true,
    },
  });

  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  // Fetch all active domains
  const domains = await prisma.domain.findMany({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      keywords: true,
      jelCodes: true,
    },
  });

  // Combine all text for analysis
  const text = [
    source.title,
    source.abstract || "",
    source.topics.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  const matches: Array<{ domainId: string; slug: string; score: number }> = [];

  // Score each domain
  for (const domain of domains) {
    let score = 0;
    let keywordMatches = 0;

    // Check keywords
    for (const keyword of domain.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        keywordMatches++;
        score += 1;
      }
    }

    // Check JEL codes (strong signal for economics)
    if (domain.jelCodes.length > 0 && source.jelCodes.length > 0) {
      for (const jelCode of source.jelCodes) {
        const jelPrefix = jelCode.charAt(0);
        if (domain.jelCodes.includes(jelPrefix)) {
          score += 10; // JEL codes = high confidence
        }
      }
    }

    // Normalize score (0-1)
    // We consider a domain relevant if it has at least 3 keyword matches
    // Or if it has a JEL code match
    const maxPossibleScore = domain.keywords.length + (domain.jelCodes.length > 0 ? 10 : 0);
    const normalizedScore = Math.min(score / Math.max(maxPossibleScore * 0.15, 1), 1);

    // Threshold: keep only domains with score > 0.15 (at least some relevance)
    if (normalizedScore > 0.15) {
      matches.push({
        domainId: domain.id,
        slug: domain.slug,
        score: normalizedScore,
      });
    }
  }

  // Create SourceDomain links
  for (const match of matches) {
    await prisma.sourceDomain.upsert({
      where: {
        sourceId_domainId: {
          sourceId,
          domainId: match.domainId,
        },
      },
      create: {
        sourceId,
        domainId: match.domainId,
        score: match.score,
      },
      update: {
        score: match.score,
      },
    });
  }

  return {
    sourceId,
    domains: matches.map((m) => ({ slug: m.slug, score: m.score })),
  };
}

/**
 * Classifie un batch de sources
 */
export async function classifyBatchSources(
  sourceIds: string[]
): Promise<{
  success: number;
  failed: number;
  errors: Array<{ sourceId: string; error: string }>;
}> {
  const results = await Promise.allSettled(
    sourceIds.map((id) => classifySourceDomains(id))
  );

  const errors: Array<{ sourceId: string; error: string }> = [];

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      errors.push({
        sourceId: sourceIds[index],
        error: result.reason?.message || "Unknown error",
      });
    }
  });

  return {
    success: results.filter((r) => r.status === "fulfilled").length,
    failed: errors.length,
    errors,
  };
}

/**
 * Classifie toutes les sources qui n'ont pas encore de domaines
 */
export async function classifyUnclassifiedSources(
  limit = 100
): Promise<{
  classified: number;
  failed: number;
}> {
  // Find sources without domain assignments
  const unclassifiedSources = await prisma.source.findMany({
    where: {
      domains: {
        none: {},
      },
    },
    take: limit,
    select: {
      id: true,
    },
  });

  if (unclassifiedSources.length === 0) {
    return { classified: 0, failed: 0 };
  }

  const sourceIds = unclassifiedSources.map((s) => s.id);
  const result = await classifyBatchSources(sourceIds);

  return {
    classified: result.success,
    failed: result.failed,
  };
}
