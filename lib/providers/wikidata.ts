/**
 * Wikidata Provider for NomosX
 *
 * Replaces Google Knowledge Graph (cost elimination).
 * Uses the Wikidata API (free, no API key) to:
 * - Identify and disambiguate entities (people, organizations, concepts)
 * - Enrich sources with structured entity data
 * - Validate institutional and person references
 *
 * API Docs: https://www.wikidata.org/w/api.php
 * Rate limit: none enforced, but be respectful (we cap concurrency)
 */

import { fetchFromProvider } from '../http-client';

// ============================================================================
// TYPES (same interface as google-knowledge-graph.ts for drop-in replacement)
// ============================================================================

export interface KGEntity {
  /** Wikidata QID (e.g., "Q42") used as machine ID */
  mid: string;
  /** Human-readable name */
  name: string;
  /** Entity types from schema.org / Wikidata (e.g., ["Person", "Thing"]) */
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
  /** Relevance score (0-1000+, normalised from Wikidata ranking) */
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

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "NomosX/1.0 (https://nomosx.com; contact@nomosx.com)";

/**
 * Search Wikidata for entities matching a query.
 */
export async function searchKnowledgeGraph(
  query: string,
  options: {
    limit?: number;
    types?: string[];
    languages?: string[];
  } = {}
): Promise<KGSearchResult> {
  const startTime = Date.now();
  const limit = Math.min(options.limit || 5, 10);
  const lang = (options.languages || ["en"])[0];

  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language: lang,
    uselang: lang,
    type: "item",
    limit: String(limit),
    format: "json",
    origin: "*",
  });

  try {
    const data: any = await fetchFromProvider('wikidata', `${WIKIDATA_API}?${params.toString()}`, { timeout: 10000, retries: 2, headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (!data) {
      console.error(`[WIKIDATA] API request failed`);
      return { entities: [], totalResults: 0, query, durationMs: Date.now() - startTime };
    }
    const rawResults: any[] = data.search || [];

    // Fetch detailed descriptions for top results (cap at 3 to save time)
    const topIds = rawResults.slice(0, 3).map((r: any) => r.id);
    const detailMap = await fetchEntityDetails(topIds, lang);

    const entities: KGEntity[] = rawResults.map((r: any, idx: number) => {
      const detail = detailMap.get(r.id);
      const types = inferTypes(r, detail);
      return {
        mid: r.id,
        name: r.label || r.id,
        types,
        description: r.description || detail?.description || "",
        detailedDescription: detail?.wikipedia
          ? {
              articleBody: detail.wikipedia.extract || "",
              url: detail.wikipedia.url || "",
              license: "CC BY-SA 3.0",
            }
          : undefined,
        imageUrl: detail?.imageUrl,
        url: detail?.officialUrl,
        resultScore: Math.max(0, (rawResults.length - idx) * 100),
      };
    });

    // Filter by type if requested
    const filtered =
      options.types && options.types.length > 0
        ? entities.filter((e) =>
            options.types!.some((t) =>
              e.types.some((et) => et.toLowerCase().includes(t.toLowerCase()))
            )
          )
        : entities;

    const durationMs = Date.now() - startTime;
    console.log(`[WIKIDATA] "${query}" → ${filtered.length} entities (${durationMs}ms)`);

    return { entities: filtered, totalResults: filtered.length, query, durationMs };
  } catch (err: any) {
    console.error(`[WIKIDATA] Search failed for "${query}":`, err.message);
    return { entities: [], totalResults: 0, query, durationMs: Date.now() - startTime };
  }
}

/**
 * Enrich a text (title, abstract, author name) with Wikidata entities.
 */
export async function enrichWithKnowledgeGraph(
  text: string,
  options: {
    maxEntities?: number;
    focusTypes?: string[];
  } = {}
): Promise<KGEntityEnrichment> {
  const maxEntities = options.maxEntities || 10;

  const keyTerms = extractKeyTerms(text);

  if (keyTerms.length === 0) {
    return {
      originalText: text,
      entities: [],
      entityTypes: { people: [], organizations: [], concepts: [], places: [], other: [] },
      confidence: 0,
    };
  }

  // Search Wikidata for each key term (parallel, capped at 5 terms)
  const searchPromises = keyTerms.slice(0, 5).map((term) =>
    searchKnowledgeGraph(term, {
      limit: 2,
      types: options.focusTypes,
    })
  );

  const results = await Promise.allSettled(searchPromises);

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

  const entityTypes = classifyEntities(allEntities);

  const avgScore =
    allEntities.length > 0
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
 */
export async function batchEnrichEntities(
  texts: string[],
  options: { maxPerText?: number } = {}
): Promise<KGEntityEnrichment[]> {
  const maxPerText = options.maxPerText || 5;

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

  const uniqueTerms = Array.from(termToTexts.keys());
  console.log(`[WIKIDATA] Batch: ${texts.length} texts → ${uniqueTerms.length} unique terms`);

  const termResults = new Map<string, KGEntity[]>();

  const BATCH_SIZE = 8; // Slightly lower than Google to respect Wikidata
  for (let i = 0; i < uniqueTerms.length; i += BATCH_SIZE) {
    const batch = uniqueTerms.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((term) => searchKnowledgeGraph(term, { limit: 2 }))
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        termResults.set(
          batch[j],
          (results[j] as PromiseFulfilledResult<KGSearchResult>).value.entities
        );
      }
    }

    if (i + BATCH_SIZE < uniqueTerms.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

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
    const avgScore =
      entities.length > 0
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
 * Validate an institution/organization name against Wikidata.
 */
export async function validateInstitution(
  name: string
): Promise<{ valid: boolean; canonical?: string; entity?: KGEntity }> {
  const result = await searchKnowledgeGraph(name, {
    limit: 3,
    types: ["Organization", "Corporation", "EducationalOrganization", "GovernmentOrganization"],
  });

  if (result.entities.length === 0) {
    // Fallback: search without type filter (Wikidata type inference is imperfect)
    const fallback = await searchKnowledgeGraph(name, { limit: 3 });
    if (fallback.entities.length === 0) return { valid: false };
    result.entities.push(...fallback.entities);
  }

  const nameLower = name.toLowerCase();
  const match = result.entities.find(
    (e) =>
      e.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(e.name.toLowerCase()) ||
      levenshteinSimilarity(e.name.toLowerCase(), nameLower) > 0.7
  );

  if (match) {
    return { valid: true, canonical: match.name, entity: match };
  }

  return {
    valid: result.entities[0].resultScore > 100,
    canonical: result.entities[0].name,
    entity: result.entities[0],
  };
}

/**
 * Validate an author/person name against Wikidata.
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
  const match = result.entities.find(
    (e) => levenshteinSimilarity(e.name.toLowerCase(), nameLower) > 0.6
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

/**
 * Fetch detailed info for Wikidata QIDs (labels, descriptions, sitelinks).
 */
async function fetchEntityDetails(
  ids: string[],
  lang: string
): Promise<Map<string, { description: string; imageUrl?: string; officialUrl?: string; wikipedia?: { extract: string; url: string } }>> {
  const result = new Map<string, any>();
  if (ids.length === 0) return result;

  try {
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: ids.join("|"),
      props: "descriptions|claims|sitelinks",
      languages: lang,
      sitefilter: `${lang}wiki`,
      format: "json",
      origin: "*",
    });

    const data: any = await fetchFromProvider('wikidata', `${WIKIDATA_API}?${params.toString()}`, { timeout: 8000, retries: 2, headers: { 'User-Agent': USER_AGENT } });
    if (!data) return result;

    for (const id of ids) {
      const entity = data.entities?.[id];
      if (!entity) continue;

      const description = entity.descriptions?.[lang]?.value || "";
      const officialUrl =
        entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value || undefined;

      // Image from P18 (image claim)
      const imageFile = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value?.value;
      const imageUrl = imageFile
        ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFile)}`
        : undefined;

      // Wikipedia sitelink
      const sitelink = entity.sitelinks?.[`${lang}wiki`];
      let wikipedia: { extract: string; url: string } | undefined;
      if (sitelink?.title) {
        wikipedia = {
          extract: "",
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(sitelink.title)}`,
        };
      }

      result.set(id, { description, imageUrl, officialUrl, wikipedia });
    }
  } catch {
    // Details are optional enrichment — don't fail
  }

  return result;
}

/**
 * Infer schema.org-style types from Wikidata entity data.
 * Wikidata doesn't expose types directly in search results; we infer from description keywords.
 */
function inferTypes(searchResult: any, detail: any): string[] {
  const desc = (
    (searchResult.description || detail?.description || "") +
    " " +
    (searchResult.label || "")
  ).toLowerCase();

  const types: string[] = ["Thing"];

  if (
    desc.includes("human") ||
    desc.includes("person") ||
    desc.includes("researcher") ||
    desc.includes("scientist") ||
    desc.includes("politician") ||
    desc.includes("author") ||
    desc.includes("economist") ||
    desc.includes("philosopher")
  ) {
    types.push("Person");
  }

  if (
    desc.includes("university") ||
    desc.includes("college") ||
    desc.includes("school") ||
    desc.includes("institute") ||
    desc.includes("academy")
  ) {
    types.push("EducationalOrganization", "Organization");
  }

  if (
    desc.includes("company") ||
    desc.includes("corporation") ||
    desc.includes("enterprise") ||
    desc.includes("firm") ||
    desc.includes("startup")
  ) {
    types.push("Corporation", "Organization");
  }

  if (
    desc.includes("government") ||
    desc.includes("ministry") ||
    desc.includes("agency") ||
    desc.includes("department") ||
    desc.includes("commission")
  ) {
    types.push("GovernmentOrganization", "Organization");
  }

  if (
    desc.includes("think tank") ||
    desc.includes("foundation") ||
    desc.includes("ngo") ||
    desc.includes("association") ||
    desc.includes("nonprofit") ||
    desc.includes("non-profit")
  ) {
    types.push("Organization");
  }

  if (
    desc.includes("country") ||
    desc.includes("city") ||
    desc.includes("state") ||
    desc.includes("region") ||
    desc.includes("municipality")
  ) {
    types.push("Place");
  }

  if (
    desc.includes("concept") ||
    desc.includes("theory") ||
    desc.includes("policy") ||
    desc.includes("methodology") ||
    desc.includes("framework")
  ) {
    types.push("Concept");
  }

  return [...new Set(types)];
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
    const types = entity.types.map((t) => t.toLowerCase());

    if (types.includes("person")) {
      result.people.push(entity);
    } else if (
      types.some(
        (t) =>
          t.includes("organization") ||
          t.includes("corporation") ||
          t.includes("educational") ||
          t.includes("government")
      )
    ) {
      result.organizations.push(entity);
    } else if (
      types.some(
        (t) =>
          t.includes("place") ||
          t.includes("city") ||
          t.includes("country") ||
          t.includes("administrative")
      )
    ) {
      result.places.push(entity);
    } else if (types.includes("concept")) {
      result.concepts.push(entity);
    } else {
      result.other.push(entity);
    }
  }

  return result;
}

/**
 * Extract key terms from text for entity resolution.
 */
function extractKeyTerms(text: string): string[] {
  const clean = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const terms = new Set<string>();

  const capitalizedPhrases =
    clean.match(/(?:[A-Z][a-zà-ÿ]+\s+){1,4}[A-Z][a-zà-ÿ]+/g) || [];
  for (const phrase of capitalizedPhrases) {
    if (phrase.length > 3 && !STOP_PHRASES.has(phrase.toLowerCase())) {
      terms.add(phrase.trim());
    }
  }

  const acronyms = clean.match(/\b[A-Z]{2,6}\b/g) || [];
  for (const acr of acronyms) {
    if (!STOP_ACRONYMS.has(acr)) {
      terms.add(acr);
    }
  }

  const quoted = clean.match(/"([^"]{3,50})"/g) || [];
  for (const q of quoted) {
    terms.add(q.replace(/"/g, "").trim());
  }

  return Array.from(terms).slice(0, 10);
}

const STOP_PHRASES = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "which",
  "where",
  "when",
  "what",
  "how",
  "why",
  "research",
  "study",
  "analysis",
  "results",
  "methods",
  "conclusion",
  "introduction",
  "abstract",
  "figure",
  "table",
  "section",
  "chapter",
  "paper",
  "article",
  "review",
]);

const STOP_ACRONYMS = new Set([
  "THE",
  "AND",
  "FOR",
  "NOT",
  "BUT",
  "ALL",
  "CAN",
  "HAS",
  "HER",
  "WAS",
  "ONE",
  "OUR",
  "OUT",
  "ARE",
  "HIS",
  "HOW",
  "ITS",
  "MAY",
  "NEW",
  "NOW",
  "OLD",
  "SEE",
  "WAY",
  "WHO",
  "DID",
  "GET",
  "LET",
  "SAY",
  "SHE",
  "TOO",
  "USE",
  "PDF",
  "DOI",
  "URL",
  "HTML",
  "CSS",
]);

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
