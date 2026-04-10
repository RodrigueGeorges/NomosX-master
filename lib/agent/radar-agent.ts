/**
 * RADAR Agent V2 - Signaux faibles structurés
 * 
 * AMÉLIORATIONS V2:
 * - Catégorisation signaux (breakthrough/emerging/cross-sector)
 * - Diversité sources (providers, années, géo)
 * - Quality filtering (min 70/100)
 * - Contexte enrichi avec metadata
 */

import { callLLM } from '../llm/unified-llm';
import { prisma } from '../db';

export interface RadarCard {
  title: string;
  signal: string;
  why_it_matters: string;
  sources: string[];
  confidence: "high" | "medium" | "low";
  category?: "breakthrough" | "emerging" | "cross-sector" | "methodological";
  impact?: "high" | "medium" | "low";
}

export async function generateRadarCards(limit = 5): Promise<RadarCard[]> {
  console.log(`[RADAR V2] Generating ${limit} radar cards...`);
  
  // Get recent high-novelty sources avec quality filtering
  const allSources = await prisma.source.findMany({
    where: {
      noveltyScore: { gte: 60 },
      qualityScore: { gte: 70 }, // V2: Quality filtering
    },
    take: 30, // Plus de sources pour diversité
    orderBy: [{ noveltyScore: "desc" }, { createdAt: "desc" }],
    include: {
      authors: { include: { author: true } },
      institutions: { include: { institution: true } },
    },
  });
  
  if (allSources.length === 0) {
    console.log(`[RADAR V2] No high-novelty sources (novelty ≥60, quality ≥70)`);
    return [];
  }
  
  console.log(`[RADAR V2] Found ${allSources.length} high-novelty sources`);
  
  // V2: Sélection diversifiée
  const selected = selectDiverseSignals(allSources, 15);
  
  console.log(`[RADAR V2] Selected ${selected.length} diverse sources`);
  logSignalDiversity(selected);
  
  // V2: Catégoriser les sources
  const categorized = categorizeSignals(selected);
  
  // Build enriched context
  const ctx = selected
    .map((s: any, i: number) => {
      const authors = s.authors?.map((sa: any) => sa.author?.name).filter(Boolean).slice(0, 3).join(", ") || "N/A";
      const institutions = s.institutions?.map((si: any) => si.institution?.name).filter(Boolean).slice(0, 2).join(", ") || "N/A";
      
      return `[SRC-${i + 1}] ${s.provider.toUpperCase()} | Quality: ${s.qualityScore}/100 | Novelty: ${s.noveltyScore}/100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${s.title}
Year: ${s.year || "N/A"}
Authors: ${authors}
Institutions: ${institutions}
Provider: ${s.provider}
Category: ${categorized.get(s.id) || "general"}

Abstract: ${(s.abstract || "").slice(0, 600)}...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    })
    .join("\n\n");
  
  const prompt = `You are NomosX Radar Agent V2 — Elite trend analyst for strategic foresight.

MISSION: Identify ${limit} HIGH-IMPACT weak signals from cutting-edge research.

CONTEXT: You have ${selected.length} high-quality, high-novelty sources (quality ≥70, novelty ≥60).

ANALYZED SOURCES:
${ctx}

YOUR TASK:
Identify ${limit} radar cards representing weak signals. Each signal should be:
- SPECIFIC: Not generic trends, but concrete emerging patterns
- ACTIONABLE: Clear implications for decision-makers
- EVIDENCE-BASED: Cite specific sources [SRC-N]
- CATEGORIZED: Assign to one of these categories:
  • "breakthrough": Revolutionary findings (novelty ≥80)
  • "emerging": New trends just appearing (recent, <5 citations)
  • "cross-sector": Patterns across multiple domains
  • "methodological": New research approaches or methods

CRITICAL RULES:
1. LEVERAGE source metadata (quality, novelty, institutions)
2. CITE sources explicitly [SRC-N]
3. ASSESS impact: high (transformative), medium (significant), low (niche)
4. Rate confidence: high (multiple sources), medium (single strong source), low (speculative)
5. Focus on "why it matters" for strategic decisions
6. Look for cross-cutting patterns, not individual papers

ENHANCED FORMAT:
Return JSON with "cards" array:
{
  "cards": [
    {
      "title": "Concise signal title (5-8 words)",
      "signal": "What we're seeing: specific observation with [SRC-*] citations (2-3 sentences)",
      "why_it_matters": "Strategic implications and potential impact (3-4 sentences with [SRC-*])",
      "sources": ["SRC-1", "SRC-3", "SRC-5"],
      "confidence": "high",
      "category": "breakthrough",
      "impact": "high"
    }
  ]
}

LANGUAGE: Write in FRENCH if any source is French (HAL/theses.fr), otherwise ENGLISH.

Be rigorous. Strategic foresight depends on this analysis.`;
  
  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 2000,
    });
    
    const parsed = JSON.parse(response.content || "{}");
    const cards = parsed.cards || parsed.signals || [];
    
    console.log(`[RADAR V2] ✅ Generated ${cards.length} radar cards`);
    
    // Log catégories
    const categories = cards.map((c: RadarCard) => c.category).filter(Boolean);
    console.log(`[RADAR V2] Categories: ${[...new Set(categories)].join(', ')}`);
    
    return cards.slice(0, limit);
  } catch (error: any) {
    console.error(`[RADAR V2] Generation failed: ${error.message}`);
    return [];
  }
}

/**
 * Sélectionne des sources diverses pour signaux
 */
function selectDiverseSignals(sources: any[], limit: number): any[] {
  const selected: any[] = [];
  const providerCounts = new Map<string, number>();
  const yearCounts = new Map<number, number>();
  
  // Trier par noveltyScore
  const sorted = sources.sort((a, b) => (b.noveltyScore || 0) - (a.noveltyScore || 0));
  
  for (const source of sorted) {
    if (selected.length >= limit) break;
    
    const providerCount = providerCounts.get(source.provider) || 0;
    const yearCount = yearCounts.get(source.year) || 0;
    
    // Max 3/provider, max 2/année pour diversité
    if (providerCount >= 3) continue;
    if (yearCount >= 2) continue;
    
    selected.push(source);
    providerCounts.set(source.provider, providerCount + 1);
    yearCounts.set(source.year, yearCount + 1);
  }
  
  return selected;
}

/**
 * Catégorise automatiquement les signaux
 */
function categorizeSignals(sources: any[]): Map<string, string> {
  const categories = new Map<string, string>();
  
  sources.forEach((s: any) => {
    if ((s.noveltyScore || 0) >= 80) {
      categories.set(s.id, "breakthrough");
    } else if (s.year === new Date().getFullYear() && (!s.citationCount || s.citationCount < 5)) {
      categories.set(s.id, "emerging");
    } else if (s.topics && s.topics.length >= 3) {
      categories.set(s.id, "cross-sector");
    } else {
      categories.set(s.id, "methodological");
    }
  });
  
  return categories;
}

/**
 * Log diversité des signaux
 */
function logSignalDiversity(sources: any[]): void {
  if (sources.length === 0) return;
  
  const providers = [...new Set(sources.map(s => s.provider))];
  const years = sources.map(s => s.year).filter(Boolean);
  const avgNovelty = Math.round(sources.reduce((sum, s) => sum + (s.noveltyScore || 0), 0) / sources.length);
  const avgQuality = Math.round(sources.reduce((sum, s) => sum + (s.qualityScore || 0), 0) / sources.length);
  
  console.log(`[RADAR V2] Signal diversity:`);
  console.log(`  • Providers: ${providers.length} (${providers.join(', ')})`);
  
  if (years.length > 0) {
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    console.log(`  • Year span: ${minYear}-${maxYear}`);
  }
  
  console.log(`  • Avg novelty: ${avgNovelty}/100`);
  console.log(`  • Avg quality: ${avgQuality}/100`);
}

export async function getMacroContext(): Promise<any[]> {
  // Get recent macro series
  const series = await prisma.macroSeries.findMany({
    take: 5,
    include: {
      points: {
        orderBy: { date: "desc" },
        take: 12,
      },
    },
  });
  
  return series.map((s) => ({
    provider: s.provider,
    code: s.code,
    name: s.name,
    unit: s.unit,
    points: s.points.map((p) => ({ date: p.date, value: p.value })),
  }));
}
