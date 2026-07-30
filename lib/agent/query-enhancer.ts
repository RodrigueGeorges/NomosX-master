/**
 * QUERY ENHANCER
 * 
 * Transforms user queries into optimized search queries for academic APIs.
 * 
 * Features:
 * - Multi-language support (auto-detect, translate to English)
 * - Query expansion (synonyms, related terms)
 * - Multi-query generation (different perspectives)
 * - Domain-specific optimization
 * 
 * @example
 * input: "quels sont les impacts de l'IA sur le travail dans les 30 prochaines années ?"
 * output: {
 *   original: "quels sont...",
 *   language: "fr",
 *   translated: "what are the impacts of AI on work in the next 30 years?",
 *   enhanced: "artificial intelligence employment impact future labor market automation",
 *   variations: [
 *     "AI job displacement automation workforce",
 *     "artificial intelligence future of work employment trends",
 *     "automation labor market AI impact jobs"
 *   ],
 *   keywords: ["AI", "employment", "automation", "labor market", "future of work"]
 * }
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

export interface EnhancedQuery {
  original: string;
  language: string;
  translated: string; // Always English for academic APIs
  enhanced: string; // Optimized single query
  variations: string[]; // Alternative formulations
  keywords: string[]; // Core topic keywords
  topics: string[]; // Academic domains/fields
}

/**
 * Detect language of query
 */
function detectLanguage(text: string): string {
  // Simple heuristic (can be improved with proper language detection library)
  const frenchWords = ["quels", "sont", "les", "de", "dans", "sur", "pour", "avec", "comment", "pourquoi", "quelle"];
  const words = text.toLowerCase().split(/\s+/);
  const frenchCount = words.filter(w => frenchWords.includes(w)).length;
  
  return frenchCount >= 2 ? "fr" : "en";
}

/**
 * Enhance query using GPT-4 for academic search optimization
 */
export async function enhanceQuery(query: string): Promise<EnhancedQuery> {
  const language = detectLanguage(query);
  
  const prompt = `You are an expert at optimizing search queries for academic research databases (OpenAlex, Semantic Scholar, Crossref).

USER QUERY:
"${query}"

LANGUAGE DETECTED: ${language}

YOUR TASK:
Transform this query into optimized search queries for academic APIs.

RETURN THIS EXACT JSON STRUCTURE:
{
  "translated": "English translation of the query (if not already English)",
  "enhanced": "Single optimized query with key academic terms (concise, keyword-rich)",
  "variations": [
    "Alternative query formulation 1",
    "Alternative query formulation 2",
    "Alternative query formulation 3"
  ],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "topics": ["academic_field1", "academic_field2", "academic_field3"]
}

RULES:
1. If query is in French, translate to English for academic APIs
2. Enhanced query should be concise, keyword-rich (not a full sentence)
3. Include synonyms and related terms in variations
4. Keywords should be core concepts (5-10 terms)
5. Topics should be broad academic fields (economics, computer science, sociology, etc.)
6. Focus on terms that would appear in academic paper titles/abstracts
7. CRITICAL: Maintain topic consistency - all variations must relate to the same core theme
8. AVOID drifting to unrelated topics (e.g., from AI employment to carbon taxation)
9. Ensure all keywords and variations are semantically related to the original query intent
10. CRITICAL: Preserve ALL geographic qualifiers (Europe, European, EU, France, Germany, Nordic, etc.) in the enhanced query AND at least 2 variations. If the query mentions "European", the enhanced query MUST include "European" or "Europe".
11. CRITICAL: Preserve domain-specific entities (AI, datacenter, grid, hyperscaler, etc.) — do not replace them with generic terms like "infrastructure".

EXAMPLES:

Input: "quels sont les impacts de l'IA sur le travail dans les 30 prochaines années ?"
Output:
{
  "translated": "what are the impacts of AI on work in the next 30 years?",
  "enhanced": "artificial intelligence employment impact future labor market automation workforce transformation",
  "variations": [
    "AI job displacement automation technological unemployment",
    "artificial intelligence future of work employment trends job creation",
    "machine learning labor market impact workforce automation skills"
  ],
  "keywords": ["artificial intelligence", "employment", "automation", "labor market", "future of work", "job displacement", "technological unemployment"],
  "topics": ["economics", "labor economics", "computer science", "sociology", "public policy"]
}

Input: "carbon tax effectiveness climate change"
Output:
{
  "translated": "carbon tax effectiveness climate change",
  "enhanced": "carbon pricing policy climate mitigation emissions reduction tax effectiveness",
  "variations": [
    "carbon tax environmental policy greenhouse gas emissions",
    "carbon pricing mechanism climate policy effectiveness economic impact",
    "emission trading carbon levy climate change mitigation"
  ],
  "keywords": ["carbon tax", "carbon pricing", "climate policy", "emissions reduction", "environmental economics"],
  "topics": ["environmental economics", "climate science", "public policy", "energy economics"]
}

Now process the user query.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 500,
      enableCache: true,
      task: 'query_enhancement',
    });

    const parsed = parseJson<any>(response.content || "{}") ?? {};

    // CRITICAL: Validate semantic consistency
    const validationResult = validateSemanticConsistency(query, parsed);
    if (!validationResult.isValid) {
      console.warn(`[QueryEnhancer] Semantic drift detected: ${validationResult.issue}`);
      // Fallback to simpler enhancement
      return createFallbackEnhancement(query, language);
    }

    return {
      original: query,
      language,
      translated: parsed.translated || query,
      enhanced: parsed.enhanced || query,
      variations: parsed.variations || [],
      keywords: parsed.keywords || [],
      topics: parsed.topics || [],
    };
  } catch (error: any) {
    console.error(`[QueryEnhancer] Failed: ${error.message}`);
    
    // Fallback: return original query
    return {
      original: query,
      language,
      translated: query,
      enhanced: query,
      variations: [],
      keywords: [],
      topics: [],
    };
  }
}

/**
 * Validate semantic consistency of enhanced query
 */
function validateSemanticConsistency(originalQuery: string, enhanced: any): { isValid: boolean; issue?: string } {
  const originalLower = originalQuery.toLowerCase();
  const enhancedLower = (enhanced.enhanced || '').toLowerCase();
  const variations = (enhanced.variations || []).map((v: string) => v.toLowerCase());
  
  // Topic domains for validation — use word-boundary matching to avoid false positives
  // (e.g. 'ai' matching inside 'regional', 'rain', 'maintain')
  const topicDomains: Record<string, string[]> = {
    'ai employment': ['artificial intelligence', '\bai\b', 'machine learning', 'employment', '\bjob', 'work', 'labor', 'workforce', 'unemployment'],
    'climate economics': ['carbon', 'climate', 'tax', 'pricing', 'emission', 'environmental', 'greenhouse'],
    'cybersecurity': ['security', 'cyber', 'vulnerability', '\bcve\b', 'threat', 'attack', 'breach'],
    'biotechnology': ['crispr', 'genetic', 'biotech', 'diagnostic', 'medical', 'health'],
    'quantum': ['quantum', 'computing', 'algorithm', 'physics', 'entanglement'],
    'energy grid': ['energy', 'electricity', 'grid', 'power', 'transmission', 'renewable', 'datacenter', 'data center', 'hyperscaler', '\bai\b', 'artificial intelligence', 'load', 'capacity', 'infrastructure'],
    'geopolitics': ['strait', 'hormuz', 'chokepoint', 'maritime', 'sanction', 'geopolitic', 'naval', 'blockade', 'territorial', 'sovereignty'],
    'trade': ['tariff', 'trade', 'export', 'import', 'commerce', 'wto', 'dumping'],
  };

  // Geographic entities that MUST be preserved in enhanced queries
  const geoEntities = ['europe', 'european', 'eu', 'france', 'germany', 'uk', 'britain', 'asia', 'china', 'india', 'africa', 'middle east', 'norway', 'nordic', 'iberia', 'spain', 'italy', 'poland'];
  const originalGeo = geoEntities.filter(g => originalLower.includes(g));
  if (originalGeo.length > 0) {
    const enhancedText = (enhancedLower + ' ' + variations.join(' ')).toLowerCase();
    const preservedGeo = originalGeo.filter(g => enhancedText.includes(g));
    if (preservedGeo.length < originalGeo.length) {
      const missing = originalGeo.filter(g => !preservedGeo.includes(g));
      return {
        isValid: false,
        issue: `Enhanced query dropped geographic qualifier(s): ${missing.join(', ')}`
      };
    }
  }
  
  // Detect original topic domain
  let originalDomain = '';
  for (const [domain, keywords] of Object.entries(topicDomains)) {
    if (keywords.some(kw => new RegExp(kw, 'i').test(originalLower))) {
      originalDomain = domain;
      break;
    }
  }
  
  if (!originalDomain) {
    return { isValid: true }; // Cannot determine domain
  }
  
  // Check if enhanced query stays in the same domain
  const domainKeywords = topicDomains[originalDomain];
  const enhancedInDomain = domainKeywords.some(kw => new RegExp(kw, 'i').test(enhancedLower));
  
  if (!enhancedInDomain) {
    return { 
      isValid: false, 
      issue: `Enhanced query drifted from ${originalDomain} domain` 
    };
  }
  
  // Check variations for consistency
  const consistentVariations = variations.every((variation: string) => 
    domainKeywords.some(kw => new RegExp(kw, 'i').test(variation))
  );
  
  if (!consistentVariations) {
    return { 
      isValid: false, 
      issue: `Some variations drifted from ${originalDomain} domain` 
    };
  }
  
  return { isValid: true };
}

/**
 * Create fallback enhancement when semantic validation fails
 */
function createFallbackEnhancement(query: string, language: string): EnhancedQuery {
  const simpleKeywords = query.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 5);
  
  return {
    original: query,
    language,
    translated: language === 'fr' ? query : query, // Simple translation fallback
    enhanced: simpleKeywords.join(' '),
    variations: [
      simpleKeywords.join(' '),
      `${simpleKeywords[0] || ''} ${simpleKeywords[1] || ''} ${simpleKeywords[2] || ''}`,
      `${simpleKeywords.slice(0, 3).join(' ')} study`
    ],
    keywords: simpleKeywords,
    topics: ['general'] // Conservative fallback
  };
}

/**
 * Generate search queries from enhanced query
 * Returns: primary query + variations for multi-query search
 */
export function generateSearchQueries(enhanced: EnhancedQuery): string[] {
  return [
    enhanced.enhanced, // Primary optimized query
    ...enhanced.variations.slice(0, 2), // Top 2 variations
  ];
}

/**
 * Quick enhance (synchronous, rule-based fallback)
 * Used when LLM call fails or for fast preprocessing
 */
export function quickEnhance(query: string): { enhanced: string; keywords: string[] } {
  // Remove question words and punctuation
  const cleaned = query
    .toLowerCase()
    .replace(/\b(what|how|why|when|where|is|are|was|were|the|of|on|in|to|and|or|a|an|qui|quoi|comment|pourquoi|quand|où|quels|sont|les|de|la|le|des|dans|sur|pour|avec|est|ce|que)\b/gi, "")
    .replace(/[?!.,;:]/g, "")
    .trim();
  
  // Extract keywords (words > 3 chars)
  const keywords = cleaned
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 10);
  
  return {
    enhanced: cleaned,
    keywords,
  };
}
