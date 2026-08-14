/**
 * NomosX Signal Detector Agent
 * 
 * Detects meaningful signals from newly ingested sources
 * Part of the Institutional Think Tank pipeline
 */

import { prisma } from '@/lib/db';
import { SignalType,SignalScores,SIGNAL_THRESHOLDS } from '@/lib/think-tank/types';
import { VERTICALS } from '@/lib/think-tank/verticals';
import { callLLM } from '@/lib/llm/unified-llm';
import { parseJson } from './json-utils';
import { classifyVerticalUnified } from './topic-classifier';

// ============================================================================
// TYPES
// ============================================================================

interface SignalDetectorInput {
  sourceIds: string[];
  verticalSlug?: string; // Optional: filter to specific vertical
}

interface DetectedSignal {
  verticalId: string;
  signalType: SignalType;
  title: string;
  summary: string;
  scores: SignalScores;
  priorityScore: number;
  sourceIds: string[];
}

export interface SignalDetectorOutput {
  detected: number;
  byType: Partial<Record<SignalType, number>>;
  signals: DetectedSignal[];
}

// ============================================================================
// SIGNAL TYPE DETECTION
// ============================================================================

const INSTITUTIONAL_PROVIDERS = ["imf", "worldbank", "oecd", "eurostat", "bis", "ecb"];
const POLICY_PROVIDERS = ["eeas", "un", "nato", "eu_commission", "legifrance"];

/**
 * P0 FIX: LLM-based signal classification
 * More intelligent than keyword matching
 */
async function detectSignalTypeLLM(source: any): Promise<SignalType> {
  const provider = source.provider?.toLowerCase() || "";
  
  // Fast path for known institutional providers
  if (INSTITUTIONAL_PROVIDERS.includes(provider)) {
    return "DATA_RELEASE";
  }
  if (POLICY_PROVIDERS.includes(provider)) {
    return "POLICY_CHANGE";
  }
  
  // LLM classification for ambiguous cases
  const abstract = (source.abstract || "").slice(0, 1000);
  if (!abstract || abstract.length < 100) {
    return "NEW_EVIDENCE"; // Default for short abstracts
  }
  
  try {
    const response = await callLLM({
      messages: [{
        role: "user",
        content: `Classify this research into ONE signal type AND assess its second-order implications.

Title: ${source.title}
Abstract: ${abstract}
Year: ${source.year || "N/A"}
Novelty Score: ${source.noveltyScore || "N/A"}/100

Signal Types:
- NEW_EVIDENCE: New research findings on existing topic
- DATA_RELEASE: New dataset, statistics, or quantitative data
- POLICY_CHANGE: Regulatory, legal, or policy developments
- METHODOLOGY_SHIFT: Novel research method or paradigm change
- CONTRADICTION: Findings that contradict established consensus
- TREND_BREAK: Significant shift from historical patterns

Return JSON: {
  "signalType": "TYPE",
  "confidence": 0-100,
  "reason": "brief explanation",
  "secondOrderEffects": ["1-3 implications of this signal — what does this enable/prevent that then enables/prevents something else?"],
  "crossDomainImpact": ["0-3 other domains this signal could affect (e.g., an AI policy change could affect economics, ethics, labor)"],
  "contrarianPotential": 0-100
}

The contrarianPotential score (0-100) indicates how much this signal challenges the mainstream consensus. A high score means this finding, if confirmed, would significantly revise the dominant view.`
      }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 500,
      enableCache: true,
      task: 'topic_classification',
    });
    
    const result = parseJson<any>(response.content);
    if (!result) return detectSignalTypeFallback(source);
    const validTypes: SignalType[] = ["NEW_EVIDENCE", "DATA_RELEASE", "POLICY_CHANGE", "METHODOLOGY_SHIFT", "CONTRADICTION", "TREND_BREAK"];
    
    if (validTypes.includes(result.signalType) && result.confidence >= 60) {
      console.log(`[SIGNAL_DETECTOR] LLM classified as ${result.signalType} (${result.confidence}%): ${result.reason}`);
      // Store enriched metadata on the source object for downstream use
      if (source && typeof source === 'object') {
        (source as any)._signalMetadata = {
          secondOrderEffects: Array.isArray(result.secondOrderEffects) ? result.secondOrderEffects.slice(0, 3) : [],
          crossDomainImpact: Array.isArray(result.crossDomainImpact) ? result.crossDomainImpact.slice(0, 3) : [],
          contrarianPotential: typeof result.contrarianPotential === 'number' ? Math.max(0, Math.min(100, result.contrarianPotential)) : 0,
        };
      }
      return result.signalType;
    }
  } catch (error) {
    console.warn(`[SIGNAL_DETECTOR] LLM classification failed, using fallback:`, error);
  }
  
  // Fallback to rule-based for errors
  return detectSignalTypeFallback(source);
}

/**
 * Fallback rule-based classification (original logic)
 */
function detectSignalTypeFallback(source: any): SignalType {
  const abstract = (source.abstract || "").toLowerCase();
  const methodKeywords = ["novel method", "new approach", "innovative technique", "breakthrough", "first study"];
  
  if ((source.noveltyScore || 0) >= 80 && methodKeywords.some(k => abstract.includes(k))) {
    return "METHODOLOGY_SHIFT";
  }
  
  return "NEW_EVIDENCE";
}

// Legacy sync function for backward compatibility
function detectSignalType(source: any): SignalType {
  return detectSignalTypeFallback(source);
}

// ============================================================================
// VERTICAL CLASSIFICATION
// ============================================================================

const VERTICAL_KEYWORDS: Record<string, string[]> = {
  // Slugs MUST match DB vertical slugs exactly
  "climate-energy": [
    "climate change", "carbon", "emissions", "decarbonization", "renewable energy",
    "sustainability", "net zero", "green transition", "ipcc", "cop", "carbon tax",
    "global warming", "fossil fuel", "energy transition", "solar energy", "wind power",
    "nuclear energy", "hydrogen", "battery", "electric vehicle", "deforestation",
    "biodiversity", "methane", "sea level", "drought", "wildfire", "flood",
    "extreme weather", "pollution", "carbon capture", "circular economy",
    "oil price", "opec", "energy crisis", "natural gas", "lithium",
    "critical minerals", "rare earth", "climate adaptation", "green bond",
    "energy storage", "smart grid", "grid reliability", "energy efficiency",
    "geothermal", "energy security", "power generation", "energy infrastructure"
  ],
  "macro-finance": [
    "financial regulation", "banking", "monetary policy", "central bank", "fintech",
    "cryptocurrency", "basel", "mifid", "capital markets", "systemic risk",
    "interest rate", "inflation", "recession", "gdp", "debt crisis",
    "sovereign debt", "bond market", "stock market", "market crash",
    "federal reserve", "ecb", "bank of england", "imf", "world bank",
    "stablecoin", "cbdc", "defi", "blockchain", "digital euro",
    "bank failure", "credit crunch", "liquidity", "hedge fund",
    "private equity", "ipo", "spac", "esg investing", "green finance",
    "money laundering", "aml", "kyc", "tax evasion", "offshore finance",
    "trade finance", "supply chain finance", "insurance regulation",
    "macroeconomics", "fiscal policy", "economic growth", "unemployment",
    "trade deficit", "currency", "exchange rate", "portfolio", "asset pricing"
  ],
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
  "tech-innovation": [
    "artificial intelligence", "machine learning", "automation", "job displacement",
    "future of work", "ai ethics", "algorithmic", "workforce", "employment impact",
    "deep learning", "neural network", "large language model", "generative ai",
    "chatgpt", "openai", "anthropic", "google ai", "ai regulation",
    "ai safety", "ai alignment", "agi", "autonomous system", "robotics",
    "gig economy", "remote work", "digital skills", "reskilling", "upskilling",
    "ai bias", "algorithmic fairness", "ai governance", "compute", "ai chip",
    "semiconductor", "nvidia", "ai arms race", "deepfake", "synthetic media",
    "quantum computing", "blockchain", "cybersecurity", "cloud computing",
    "digital transformation", "innovation", "startup", "venture capital",
    "platform economy", "social media", "digital rights", "privacy",
    "surveillance", "data governance", "open source", "software"
  ],
  "social-policy": [
    "social policy", "welfare", "inequality", "poverty", "education",
    "employment", "labor market", "social protection", "minimum wage",
    "universal basic income", "child care", "pension", "retirement",
    "social mobility", "social justice", "discrimination", "diversity",
    "inclusion", "gender equality", "migration", "immigration",
    "housing policy", "affordable housing", "homelessness", "urban planning",
    "public services", "social work", "community development",
    "demographics", "aging population", "youth unemployment",
    "disability", "mental health", "substance abuse", "criminal justice"
  ],
  "health-bioethics": [
    "epidemiology", "public health", "disease", "pandemic", "vaccination",
    "healthcare", "medicine", "clinical trials", "biostatistics",
    "health policy", "global health", "preventive medicine", "outbreak",
    "mortality", "morbidity", "health systems", "health economics",
    "medical research", "population health", "bioethics", "medical ethics",
    "genetics", "genomics", "biotechnology", "pharmaceutical",
    "drug development", "clinical research", "hospital", "nursing",
    "mental health", "obesity", "cancer", "diabetes", "infectious disease",
    "antimicrobial resistance", "who", "cdc", "health equity",
    "telemedicine", "digital health", "precision medicine", "neuroscience"
  ],
  "law-regulation": [
    "law", "legal", "regulation", "legislation", "jurisprudence",
    "constitutional law", "administrative law", "international law",
    "compliance", "judicial review", "legal precedent", "regulatory policy",
    "rule of law", "legal reform", "human rights", "civil liberties",
    "data protection", "gdpr", "intellectual property", "patent",
    "antitrust", "competition law", "trade law", "tax law",
    "criminal law", "environmental law", "labor law", "corporate law",
    "eu regulation", "directive", "european commission", "ai act",
    "digital services act", "dsa", "dma", "legal technology",
    "arbitration", "mediation", "sanctions law", "compliance framework"
  ],
  "cognitive-behavioral": [
    "cognitive", "psychology", "neuroscience", "decision making", "behavior",
    "cognition", "brain", "perception", "attention", "memory", "learning",
    "cognitive bias", "neuroeconomics", "behavioral science",
    "behavioral economics", "nudge", "prospect theory", "heuristics",
    "choice architecture", "consumer behavior", "experimental economics",
    "risk preferences", "time preferences", "social preferences",
    "cognitive psychology", "developmental psychology", "social psychology",
    "human factors", "ergonomics", "human-computer interaction"
  ],
  "development-global": [
    "development", "poverty", "emerging markets", "foreign aid", "microfinance",
    "institutional economics", "human capital", "agricultural economics",
    "south-south cooperation", "economic growth", "low income", "middle income",
    "structural transformation", "capability approach", "aid effectiveness",
    "global south", "food security", "land reform", "demographic dividend",
    "undp", "world bank", "oecd development", "sustainable development goals",
    "sdg", "climate finance", "green climate fund", "infrastructure development",
    "urbanization", "city", "metropolitan", "smart cities", "urban resilience"
  ],
  "complexity-quantitative": [
    "complexity", "complex systems", "emergence", "nonlinear", "chaos",
    "network theory", "agent-based modeling", "self-organization",
    "system dynamics", "complex networks", "scaling laws", "phase transitions",
    "complex adaptive systems", "systems thinking", "statistics",
    "quantitative methods", "causal inference", "experimental design",
    "bayesian", "monte carlo", "simulation", "predictive modeling",
    "risk analysis", "systemic risk", "tail risk", "stress testing",
    "scenario planning", "uncertainty modeling", "resilience",
    "computational social science", "network analysis", "big data"
  ],
  "humanities-ethics": [
    "humanities", "philosophy", "ethics", "history", "literature",
    "cultural studies", "critical theory", "historical analysis",
    "moral philosophy", "applied ethics", "political philosophy",
    "cultural heritage", "digital humanities", "intellectual history",
    "democracy", "political theory", "citizenship", "civil society",
    "media studies", "journalism", "communication", "public discourse",
    "disinformation", "misinformation", "propaganda", "free speech"
  ]
};

function classifyVertical(source: any): string | null {
  const text = `${source.title || ""} ${source.abstract || ""}`.toLowerCase();
  
  let bestMatch: string | null = null;
  let bestScore = 0;
  
  for (const [slug, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    const score = keywords.filter(k => text.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = slug;
    }
  }
  
  // Require at least 2 keyword matches
  return bestScore >= 2 ? bestMatch : null;
}

// ============================================================================
// SIGNAL SCORING
// ============================================================================

function computeSignalScores(sources: any[]): SignalScores {
  const avgNovelty = sources.reduce((sum, s) => sum + (s.noveltyScore || 0), 0) / sources.length;
  const avgQuality = sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / sources.length;
  const avgCitations = sources.reduce((sum, s) => sum + (s.citationCount || 0), 0) / sources.length;
  
  // Novelty Score (0-100)
  const noveltyScore = Math.round(avgNovelty);
  
  // Impact Score (0-100)
  const citationWeight = Math.min(avgCitations / 100, 1) * 30;
  const institutionalWeight = sources.some(s => INSTITUTIONAL_PROVIDERS.includes(s.provider?.toLowerCase())) ? 25 : 0;
  const qualityWeight = avgQuality * 0.3;
  const impactScore = Math.round(Math.min(citationWeight + institutionalWeight + qualityWeight + 15, 100));
  
  // Confidence Score (0-100)
  const sourceCountBonus = Math.min(sources.length * 5, 25);
  const confidenceScore = Math.round(Math.min(avgQuality * 0.5 + sourceCountBonus + 25, 100));
  
  // Urgency Score (0-100)
  const now = new Date();
  const recentSources = sources.filter(s => {
    const created = new Date(s.createdAt);
    const daysDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 7;
  });
  const recencyRatio = recentSources.length / sources.length;
  const urgencyScore = Math.round(recencyRatio * 60 + 20);
  
  return { noveltyScore, impactScore, confidenceScore, urgencyScore };
}

function computePriorityScore(scores: SignalScores): number {
  return Math.round(
    scores.noveltyScore * 0.25 +
    scores.impactScore * 0.30 +
    scores.confidenceScore * 0.30 +
    scores.urgencyScore * 0.15
  );
}

// ============================================================================
// MAIN DETECTOR
// ============================================================================

export async function signalDetector(input: SignalDetectorInput): Promise<SignalDetectorOutput> {
  console.log(`[SIGNAL_DETECTOR] Processing ${input.sourceIds.length} sources...`);
  
  // Fetch sources with quality threshold
  const sources = await prisma.source.findMany({
    where: {
      id: { in: input.sourceIds },
      qualityScore: { gte: 70 },
      noveltyScore: { gte: 50 }
    },
    include: {
      authors: { include: { author: true } },
      institutions: { include: { institution: true } }
    }
  });
  
  if (sources.length === 0) {
    console.log(`[SIGNAL_DETECTOR] No qualifying sources (quality ≥70, novelty ≥50)`);
    return { detected: 0, byType: {}, signals: [] };
  }
  
  console.log(`[SIGNAL_DETECTOR] ${sources.length} sources qualify for signal detection`);
  
  // Get existing verticals from DB
  const verticals = await prisma.vertical.findMany({
    where: { isActive: true }
  });
  
  const verticalMap = new Map(verticals.map(v => [v.slug, v.id]));
  
  // Group sources by vertical
  const sourcesByVertical = new Map<string, any[]>();
  
  for (const source of sources) {
    const verticalSlug = classifyVerticalUnified({ title: source.title ?? undefined, abstract: source.abstract ?? undefined }) || classifyVertical(source) || undefined;
    if (!verticalSlug) continue;
    
    // Filter by specific vertical if requested
    if (input.verticalSlug && verticalSlug !== input.verticalSlug) continue;
    
    if (!sourcesByVertical.has(verticalSlug)) {
      sourcesByVertical.set(verticalSlug, []);
    }
    sourcesByVertical.get(verticalSlug)!.push(source);
  }
  
  // Detect signals for each vertical
  const detectedSignals: DetectedSignal[] = [];
  const byType: Partial<Record<SignalType, number>> = {};
  
  for (const [verticalSlug, verticalSources] of sourcesByVertical) {
    const verticalIdFromMap = verticalMap.get(verticalSlug);
    if (!verticalIdFromMap) {
      console.log(`[SIGNAL_DETECTOR] Vertical ${verticalSlug} not found in DB, skipping`);
      continue;
    }
    const verticalId: string = verticalIdFromMap;
    
    // Group by signal type
    const sourcesByType = new Map<SignalType, any[]>();
    for (const source of verticalSources) {
      const signalType = await detectSignalTypeLLM(source);
      if (!sourcesByType.has(signalType)) {
        sourcesByType.set(signalType, []);
      }
      sourcesByType.get(signalType)!.push(source);
    }
    
    // Create signal for each type with enough sources
    for (const [signalType, typeSources] of sourcesByType) {
      // Require at least 1 source for signals
      if (typeSources.length === 0) continue;
      
      const scores = computeSignalScores(typeSources);
      const priorityScore = computePriorityScore(scores);
      
      // Skip low priority signals
      if (priorityScore < SIGNAL_THRESHOLDS.MIN_PRIORITY_FOR_CONSIDERATION) {
        console.log(`[SIGNAL_DETECTOR] Skipping ${signalType} signal (priority ${priorityScore} < ${SIGNAL_THRESHOLDS.MIN_PRIORITY_FOR_CONSIDERATION})`);
        continue;
      }
      
      // Generate title and summary from top source
      const topSource = typeSources.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))[0];
      const title = generateSignalTitle(signalType, topSource, verticalSlug);
      const summary = generateSignalSummary(signalType, typeSources);
      
      detectedSignals.push({
        verticalId,
        signalType,
        title,
        summary,
        scores,
        priorityScore,
        sourceIds: typeSources.map(s => s.id)
      });
      
      byType[signalType] = (byType[signalType] || 0) + 1;
    }
  }
  
  console.log(`[SIGNAL_DETECTOR] Detected ${detectedSignals.length} signals`);
  
  // Store signals in database
  for (const signal of detectedSignals) {
    await prisma.signal.create({
      data: {
        verticalId: signal.verticalId,
        signalType: signal.signalType,
        title: signal.title,
        summary: signal.summary,
        noveltyScore: signal.scores.noveltyScore,
        impactScore: signal.scores.impactScore,
        confidenceScore: signal.scores.confidenceScore,
        urgencyScore: signal.scores.urgencyScore,
        priorityScore: signal.priorityScore,
        sourceIds: signal.sourceIds,
        status: "NEW",
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
      }
    });
  }
  
  return {
    detected: detectedSignals.length,
    byType,
    signals: detectedSignals
  };
}

// ============================================================================
// NEWS SIGNAL PROCESSING (live events from news providers)
// ============================================================================

export interface NewsSignalInput {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  provider: string;
  publishedAt: Date;
  categories: string[];
  relevanceScore: number;
  urgency: "critical" | "high" | "medium" | "low";
}

/**
 * Process live news signals and store as DB signals.
 * Unlike academic sources, news signals don't go through Source table.
 * They feed directly into the signal pipeline for editorial planning.
 */
export async function processNewsSignals(
  newsSignals: NewsSignalInput[]
): Promise<{ detected: number; byVertical: Record<string, number> }> {
  if (newsSignals.length === 0) return { detected: 0, byVertical: {} };

  console.log(`[SIGNAL_DETECTOR/NEWS] Processing ${newsSignals.length} news signals...`);

  // Get active verticals from DB
  const verticals = await prisma.vertical.findMany({
    where: { isActive: true },
  });
  const verticalMap = new Map(verticals.map(v => [v.slug, v.id]));

  let detected = 0;
  const byVertical: Record<string, number> = {};

  for (const news of newsSignals) {
    // Classify vertical from title + summary
    const text = `${news.title} ${news.summary}`.toLowerCase();
    let bestVertical: string | null = null;
    let bestScore = 0;

    for (const [slug, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
      const score = keywords.filter(k => text.includes(k)).length;
      if (score > bestScore) {
        bestScore = score;
        bestVertical = slug;
      }
    }

    // News signals only need 1 keyword match (shorter text than academic papers)
    if (bestScore < 1 || !bestVertical) continue;

    const verticalId = verticalMap.get(bestVertical);
    if (!verticalId) continue;

    // Map urgency to scores
    const urgencyMap = { critical: 95, high: 80, medium: 65, low: 50 };
    const urgencyScore = urgencyMap[news.urgency] || 65;

    // Compute scores for news signals
    const noveltyScore = Math.min(news.relevanceScore + 10, 100);
    const impactScore = Math.round(urgencyScore * 0.7 + news.relevanceScore * 0.3);
    const confidenceScore = Math.round(news.relevanceScore * 0.6 + 30);
    const priorityScore = Math.round(
      noveltyScore * 0.20 +
      impactScore * 0.35 +
      confidenceScore * 0.15 +
      urgencyScore * 0.30
    );

    // Skip low priority
    if (priorityScore < SIGNAL_THRESHOLDS.MIN_PRIORITY_FOR_CONSIDERATION) continue;

    // Check for duplicate (same title within 48h)
    const existing = await prisma.signal.findFirst({
      where: {
        title: { contains: news.title.slice(0, 50) },
        detectedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
    });
    if (existing) continue;

    // Determine signal type from news content
    const signalType = classifyNewsSignalType(text);

    await prisma.signal.create({
      data: {
        verticalId,
        signalType,
        title: `[LIVE] ${truncate(news.title, 70)}`,
        summary: `${news.source} (${news.provider}) — ${truncate(news.summary, 400)}. URL: ${news.url}`,
        noveltyScore,
        impactScore,
        confidenceScore,
        urgencyScore,
        priorityScore,
        sourceIds: [news.id],
        status: "NEW",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days (shorter for news)
      },
    });

    detected++;
    byVertical[bestVertical] = (byVertical[bestVertical] || 0) + 1;
  }

  console.log(`[SIGNAL_DETECTOR/NEWS] ✅ ${detected} news signals stored (${Object.entries(byVertical).map(([k, v]) => `${k}:${v}`).join(", ")})`);
  return { detected, byVertical };
}

function classifyNewsSignalType(text: string): SignalType {
  if (/war|military|attack|invasion|strike|bombing|killed|casualties/i.test(text)) return "POLICY_CHANGE";
  if (/data|report|statistics|survey|index|gdp|inflation/i.test(text)) return "DATA_RELEASE";
  if (/contradicts|disputes|challenges|reverses|overturns/i.test(text)) return "CONTRADICTION";
  if (/trend|surge|spike|record|unprecedented|shift/i.test(text)) return "TREND_BREAK";
  if (/regulation|law|policy|directive|act|bill|ruling/i.test(text)) return "POLICY_CHANGE";
  if (/study|research|findings|evidence|discovered/i.test(text)) return "NEW_EVIDENCE";
  return "NEW_EVIDENCE";
}

// ============================================================================
// HELPERS
// ============================================================================

function generateSignalTitle(signalType: SignalType, topSource: any, verticalSlug: string): string {
  const verticalName = VERTICALS.find(v => v.slug === verticalSlug)?.name || verticalSlug;
  
  switch (signalType) {
    case "NEW_EVIDENCE":
      return `New Evidence: ${truncate(topSource.title, 60)}`;
    case "DATA_RELEASE":
      return `Data Release: ${topSource.provider?.toUpperCase()} - ${truncate(topSource.title, 50)}`;
    case "POLICY_CHANGE":
      return `Policy Change: ${truncate(topSource.title, 60)}`;
    case "METHODOLOGY_SHIFT":
      return `Methodology Shift: ${truncate(topSource.title, 60)}`;
    case "CONTRADICTION":
      return `Contradiction Detected - ${verticalName}`;
    case "TREND_BREAK":
      return `Trend Break - ${verticalName}`;
    default:
      return truncate(topSource.title, 80);
  }
}

function generateSignalSummary(signalType: SignalType, sources: any[]): string {
  const sourceCount = sources.length;
  const avgQuality = Math.round(sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / sourceCount);
  const topSource = sources[0];
  
  const abstract = topSource.abstract || "";
  const preview = truncate(abstract, 300);
  
  return `${sourceCount} source(s) detected (avg quality: ${avgQuality}/100). ${preview}`;
}

function truncate(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
