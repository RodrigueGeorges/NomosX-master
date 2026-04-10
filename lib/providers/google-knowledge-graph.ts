/**
 * Google Knowledge Graph Provider for NomosX
 * 
 * Uses the Google Knowledge Graph Search API to:
 * - Identify and disambiguate entities (people, organizations, concepts)
 * - Enrich sources with structured entity data
 * - Validate institutional references
 * - Provide semantic context for the Knowledge Graph agent
 * 
 * API Docs: https://developers.google.com/knowledge-graph/reference/rest/v1
 * Rate limit: 100,000 requests/day (free tier)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface KGEntity {
  /** Machine ID (e.g., "kg:/m/0d6lp") */
  mid: string;
  /** Human-readable name */
  name: string;
  /** Entity types from schema.org (e.g., ["Person", "Thing"]) */
  types: string[];
  /** Short description */
  description: string;
  /** Detailed description with source */
  detailedDescription?: {
    articleBody: string;
    url: string;
    license: string;
  };
  /** Image URL if available */
  imageUrl?: string;
  /** Official website */
  url?: string;
  /** Relevance score from Google (0-1000+) */
  resultScore: number;
}

export interface KGSearchResult {
  entities: KGEntity[];
  totalResults: number;
  query: string;
  durationMs: number;
}

export interface KGEntityEnrichment {
  /** Original text that was enriched */
  originalText: string;
  /** Matched entities */
  entities: KGEntity[];
  /** Entity type classification */
  entityTypes: {
    people: KGEntity[];
    organizations: KGEntity[];
    concepts: KGEntity[];
    places: KGEntity[];
    other: KGEntity[];
  };
  /** Confidence in the enrichment (0-100) */
  confidence: number;
}

// ============================================================================
// API CLIENT
// ============================================================================

const KG_API_BASE = "https://kgsearch.googleapis.com/v1/entities:search";

/**
 * Search the Google Knowledge Graph for entities matching a query.
 * 
 * @param query - Search query (entity name, concept, etc.)
 * @param options - Search options
 * @returns Structured entity results
 */
export async function searchKnowledgeGraph(
  query: string,
  options: {
    limit?: number;
    types?: string[];
    languages?: string[];
  } = {}
): Promise<KGSearchResult> {
  const apiKey = process.env.GOOGLE_KNOWLEDGE_GRAPH_API_KEY;
  if (!apiKey) {
    console.warn("[GOOGLE-KG] No API key configured (GOOGLE_KNOWLEDGE_GRAPH_API_KEY)");
    return { entities: [], totalResults: 0, query, durationMs: 0 };
  }

  const startTime = Date.now();
  const limit = options.limit || 5;
  const languages = options.languages || ["en", "fr"];

  const params = new URLSearchParams({
    query,
    key: apiKey,
    limit: String(limit),
    indent: "false",
  });

  // Add language preferences
  for (const lang of languages) {
    params.append("languages", lang);
  }

  // Add type filters (schema.org types)
  if (options.types && options.types.length > 0) {
    for (const type of options.types) {
      params.append("types", type);
    }
  }

  try {
    const response = await fetch(`${KG_API_BASE}?${params.toString()}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[GOOGLE-KG] API error ${response.status}: ${errorText}`);
      return { entities: [], totalResults: 0, query, durationMs: Date.now() - startTime };
    }

    const data = await response.json();
    const entities = parseKGResponse(data);

    const durationMs = Date.now() - startTime;
    console.log(`[GOOGLE-KG] "${query}" → ${entities.length} entities (${durationMs}ms)`);

    return {
      entities,
      totalResults: entities.length,
      query,
      durationMs,
    };
  } catch (err: any) {
    console.error(`[GOOGLE-KG] Search failed for "${query}":`, err.message);
    return { entities: [], totalResults: 0, query, durationMs: Date.now() - startTime };
  }
}

/**
 * Enrich a text (title, abstract, author name) with Knowledge Graph entities.
 * Extracts key terms and resolves them to structured entities.
 */
export async function enrichWithKnowledgeGraph(
  text: string,
  options: {
    maxEntities?: number;
    focusTypes?: string[];
  } = {}
): Promise<KGEntityEnrichment> {
  const maxEntities = options.maxEntities || 10;

  // Extract key terms from text (simple NER-like extraction)
  const keyTerms = extractKeyTerms(text);

  if (keyTerms.length === 0) {
    return {
      originalText: text,
      entities: [],
      entityTypes: { people: [], organizations: [], concepts: [], places: [], other: [] },
      confidence: 0,
    };
  }

  // Search KG for each key term (parallel, capped)
  const searchPromises = keyTerms.slice(0, 5).map(term =>
    searchKnowledgeGraph(term, {
      limit: 2,
      types: options.focusTypes,
    })
  );

  const results = await Promise.allSettled(searchPromises);

  // Collect all entities, deduplicate by MID
  const seenMids = new Set<string>();
  const allEntities: KGEntity[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const entity of result.value.entities) {
        if (!seenMids.has(entity.mid)) {
          seenMids.add(entity.mid);
          allEntities.push(entity);
        }
      }
    }
  }

  // Classify entities by type
  const entityTypes = classifyEntities(allEntities);

  // Confidence based on match quality
  const avgScore = allEntities.length > 0
    ? allEntities.reduce((sum, e) => sum + e.resultScore, 0) / allEntities.length
    : 0;
  const confidence = Math.min(100, Math.round(avgScore / 10));

  return {
    originalText: text,
    entities: allEntities.slice(0, maxEntities),
    entityTypes,
    confidence,
  };
}

/**
 * Batch entity resolution for multiple texts (e.g., source titles).
 * Efficient: deduplicates queries across texts.
 */
export async function batchEnrichEntities(
  texts: string[],
  options: { maxPerText?: number } = {}
): Promise<KGEntityEnrichment[]> {
  const maxPerText = options.maxPerText || 5;

  // Extract all unique key terms across texts
  const termToTexts = new Map<string, number[]>();
  const textTerms: string[][] = [];

  for (let i = 0; i < texts.length; i++) {
    const terms = extractKeyTerms(texts[i]);
    textTerms.push(terms);
    for (const term of terms) {
      const existing = termToTexts.get(term) || [];
      existing.push(i);
      termToTexts.set(term, existing);
    }
  }

  // Search unique terms only (deduplicated)
  const uniqueTerms = Array.from(termToTexts.keys());
  console.log(`[GOOGLE-KG] Batch: ${texts.length} texts → ${uniqueTerms.length} unique terms`);

  const termResults = new Map<string, KGEntity[]>();

  // Process in batches of 10 to respect rate limits
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniqueTerms.length; i += BATCH_SIZE) {
    const batch = uniqueTerms.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(term => searchKnowledgeGraph(term, { limit: 2 }))
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        termResults.set(batch[j], (results[j] as PromiseFulfilledResult<KGSearchResult>).value.entities);
      }
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < uniqueTerms.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Build enrichments per text
  return texts.map((text, idx) => {
    const terms = textTerms[idx];
    const seenMids = new Set<string>();
    const entities: KGEntity[] = [];

    for (const term of terms) {
      const termEntities = termResults.get(term) || [];
      for (const entity of termEntities) {
        if (!seenMids.has(entity.mid)) {
          seenMids.add(entity.mid);
          entities.push(entity);
        }
      }
    }

    const entityTypes = classifyEntities(entities);
    const avgScore = entities.length > 0
      ? entities.reduce((sum, e) => sum + e.resultScore, 0) / entities.length
      : 0;

    return {
      originalText: text,
      entities: entities.slice(0, maxPerText),
      entityTypes,
      confidence: Math.min(100, Math.round(avgScore / 10)),
    };
  });
}

/**
 * Validate an institution/organization name against the Knowledge Graph.
 * Returns the canonical name and details if found.
 */
export async function validateInstitution(
  name: string
): Promise<{ valid: boolean; canonical?: string; entity?: KGEntity }> {
  const result = await searchKnowledgeGraph(name, {
    limit: 3,
    types: ["Organization", "Corporation", "EducationalOrganization", "GovernmentOrganization"],
  });

  if (result.entities.length === 0) {
    return { valid: false };
  }

  // Check if any entity closely matches the input name
  const nameLower = name.toLowerCase();
  const match = result.entities.find(e =>
    e.name.toLowerCase().includes(nameLower) ||
    nameLower.includes(e.name.toLowerCase()) ||
    levenshteinSimilarity(e.name.toLowerCase(), nameLower) > 0.7
  );

  if (match) {
    return { valid: true, canonical: match.name, entity: match };
  }

  // Return best match even if not exact
  return {
    valid: result.entities[0].resultScore > 100,
    canonical: result.entities[0].name,
    entity: result.entities[0],
  };
}

/**
 * Validate an author/person name against the Knowledge Graph.
 */
export async function validatePerson(
  name: string
): Promise<{ valid: boolean; canonical?: string; entity?: KGEntity }> {
  const result = await searchKnowledgeGraph(name, {
    limit: 3,
    types: ["Person"],
  });

  if (result.entities.length === 0) {
    return { valid: false };
  }

  const nameLower = name.toLowerCase();
  const match = result.entities.find(e =>
    levenshteinSimilarity(e.name.toLowerCase(), nameLower) > 0.6
  );

  return {
    valid: !!match || result.entities[0].resultScore > 200,
    canonical: match?.name || result.entities[0].name,
    entity: match || result.entities[0],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function parseKGResponse(data: any): KGEntity[] {
  if (!data?.itemListElement || !Array.isArray(data.itemListElement)) {
    return [];
  }

  return data.itemListElement
    .filter((item: any) => item?.result)
    .map((item: any) => {
      const r = item.result;
      return {
        mid: r["@id"] || "",
        name: r.name || "",
        types: r["@type"] || [],
        description: r.description || "",
        detailedDescription: r.detailedDescription
          ? {
              articleBody: r.detailedDescription.articleBody || "",
              url: r.detailedDescription.url || "",
              license: r.detailedDescription.license || "",
            }
          : undefined,
        imageUrl: r.image?.contentUrl || r.image?.url || undefined,
        url: r.url || undefined,
        resultScore: item.resultScore || 0,
      };
    });
}

function classifyEntities(entities: KGEntity[]): KGEntityEnrichment["entityTypes"] {
  const result: KGEntityEnrichment["entityTypes"] = {
    people: [],
    organizations: [],
    concepts: [],
    places: [],
    other: [],
  };

  for (const entity of entities) {
    const types = entity.types.map(t => t.toLowerCase());

    if (types.some(t => t.includes("person"))) {
      result.people.push(entity);
    } else if (types.some(t =>
      t.includes("organization") || t.includes("corporation") ||
      t.includes("educational") || t.includes("government")
    )) {
      result.organizations.push(entity);
    } else if (types.some(t =>
      t.includes("place") || t.includes("city") ||
      t.includes("country") || t.includes("administrative")
    )) {
      result.places.push(entity);
    } else if (types.some(t =>
      t.includes("event") || t.includes("creativework") ||
      t.includes("book") || t.includes("article")
    )) {
      result.concepts.push(entity);
    } else {
      result.other.push(entity);
    }
  }

  return result;
}

/**
 * Extract key terms from text for entity resolution.
 * Simple NER-like extraction using capitalization and patterns.
 */
function extractKeyTerms(text: string): string[] {
  // Remove HTML tags
  const clean = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const terms = new Set<string>();

  // 1. Capitalized multi-word phrases (likely proper nouns)
  const capitalizedPhrases = clean.match(/(?:[A-Z][a-zà-ÿ]+\s+){1,4}[A-Z][a-zà-ÿ]+/g) || [];
  for (const phrase of capitalizedPhrases) {
    if (phrase.length > 3 && !STOP_PHRASES.has(phrase.toLowerCase())) {
      terms.add(phrase.trim());
    }
  }

  // 2. Acronyms (2-6 uppercase letters)
  const acronyms = clean.match(/\b[A-Z]{2,6}\b/g) || [];
  for (const acr of acronyms) {
    if (!STOP_ACRONYMS.has(acr)) {
      terms.add(acr);
    }
  }

  // 3. Quoted terms
  const quoted = clean.match(/"([^"]{3,50})"/g) || [];
  for (const q of quoted) {
    terms.add(q.replace(/"/g, "").trim());
  }

  return Array.from(terms).slice(0, 10);
}

const STOP_PHRASES = new Set([
  "the", "this", "that", "these", "those", "which", "where", "when",
  "what", "how", "why", "research", "study", "analysis", "results",
  "methods", "conclusion", "introduction", "abstract", "figure",
  "table", "section", "chapter", "paper", "article", "review",
]);

const STOP_ACRONYMS = new Set([
  "THE", "AND", "FOR", "NOT", "BUT", "ALL", "CAN", "HAS", "HER",
  "WAS", "ONE", "OUR", "OUT", "ARE", "HIS", "HOW", "ITS", "MAY",
  "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "GET", "LET",
  "SAY", "SHE", "TOO", "USE", "PDF", "DOI", "URL", "HTML", "CSS",
]);

/**
 * Simple Levenshtein-based similarity (0-1).
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[a.length][b.length];
  return 1 - distance / maxLen;
}
