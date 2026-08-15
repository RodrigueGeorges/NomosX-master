/**
 * NomosX Institutional Think Tank — Publication Templates
 *
 * 4 canonical templates aligned 1:1 with Inquiry depths and Engine formats.
 * Word counts benchmarked against top think tanks:
 *
 *   SUMMARY_BRIEF    → surface depth   — 500-1,200 words, 5+ sources
 *     Benchmark: Carsey fact sheet (900-1000w), FAO policy brief (700w), World Bank short brief (1500w)
 *
 *   DECISION_MEMO    → standard depth  — 1,200-2,500 words, 8+ sources
 *     Benchmark: GNSI Decision Brief (2400w), WHO policy brief (1000-3000w), National Academies (1500-2000w), ERF (2000-2500w)
 *
 *   ARTICLE          → deep depth      — 3,000-6,000 words, 15+ sources
 *     Benchmark: Carsey issue brief (1800-4000w), McKinsey Quarterly article (3000-8000w)
 *
 *   STRATEGIC_REPORT → strategic depth — 8,000-20,000 words, 20+ sources
 *     Benchmark: McKinsey white paper (8000-20000w), France Stratégie rapport (15000-40000w)
 *
 * Legacy types (RESEARCH_BRIEF, EXECUTIVE_BRIEF, etc.) are resolved to
 * canonical templates via FORMAT_MAPPING in getTemplate().
 */

import { PublicationTemplate, ClaimType, FORBIDDEN_PHRASES } from './types';
import { FORMAT_MAPPING } from './types';

export const PUBLICATION_TEMPLATES: Record<string, PublicationTemplate> = {

  // ── 1. SIGNAL BRIEF (surface depth) — ALERT: "Something important just happened" ──

  SUMMARY_BRIEF: {
    type: "SUMMARY_BRIEF",
    sections: [
      {
        id: "key_finding",
        title: "Constat Principal",
        required: true,
        minWords: 150,
        maxWords: 300,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "so_what",
        title: "Pourquoi Cela Compte",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "what_to_watch",
        title: "À Surveiller",
        required: true,
        minWords: 150,
        maxWords: 300,
        claimTypes: ["SCENARIO"] as ClaimType[]
      },
      {
        id: "evidence_quality",
        title: "Qualité des Preuves",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      }
    ],
    totalMinWords: 500,
    totalMaxWords: 1200,
    minSources: 5,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  // ── 2. DECISION MEMO (standard depth) — ACTION: "A decision is pending" ──
  // Structured decision brief for policy makers and executives.
  // Replaces legacy RESEARCH_BRIEF, EXECUTIVE_BRIEF, POLICY_NOTE.

  DECISION_MEMO: {
    type: "DECISION_MEMO",
    sections: [
      {
        id: "decision_context",
        title: "Contexte de la Décision",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "key_evidence",
        title: "Preuves Clés",
        required: true,
        minWords: 400,
        maxWords: 700,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "options_assessment",
        title: "Évaluation des Options",
        required: true,
        minWords: 300,
        maxWords: 600,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "recommendation",
        title: "Recommandation",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["INTERPRETATION", "OPINION"] as ClaimType[]
      },
      {
        id: "risks_what_changes_mind",
        title: "Risques & Ce Qui Changerait Notre Avis",
        required: true,
        minWords: 150,
        maxWords: 400,
        claimTypes: ["SCENARIO"] as ClaimType[]
      }
    ],
    totalMinWords: 1200,
    totalMaxWords: 2500,
    minSources: 8,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  // ── 3. ARTICLE (deep depth) — ANALYSIS: "This needs to be understood" ──

  ARTICLE: {
    type: "ARTICLE",
    sections: [
      {
        id: "introduction",
        title: "Introduction",
        required: true,
        minWords: 400,
        maxWords: 800,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "context_background",
        title: "Contexte & Enjeux",
        required: true,
        minWords: 600,
        maxWords: 1000,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "evidence_analysis",
        title: "Analyse des Preuves",
        required: true,
        minWords: 1000,
        maxWords: 1800,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "debate_perspectives",
        title: "Débat & Perspectives",
        required: true,
        minWords: 500,
        maxWords: 1000,
        claimTypes: ["INTERPRETATION", "SCENARIO"] as ClaimType[]
      },
      {
        id: "implications",
        title: "Implications & Recommandations",
        required: true,
        minWords: 500,
        maxWords: 1000,
        claimTypes: ["INTERPRETATION", "OPINION"] as ClaimType[]
      },
      {
        id: "conclusion",
        title: "Conclusion",
        required: true,
        minWords: 300,
        maxWords: 600,
        claimTypes: ["INTERPRETATION"] as ClaimType[]
      }
    ],
    totalMinWords: 3000,
    totalMaxWords: 6000,
    minSources: 15,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  // ── 4. STRATEGIC REPORT (strategic depth) — STRATEGY: "A structural shift is underway" ──

  STRATEGIC_REPORT: {
    type: "STRATEGIC_REPORT",
    sections: [
      {
        id: "executive_summary",
        title: "Résumé Exécutif",
        required: true,
        minWords: 800,
        maxWords: 1500,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "context_background",
        title: "Contexte & Historique",
        required: true,
        minWords: 1000,
        maxWords: 2000,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "evidence_synthesis",
        title: "Synthèse des Preuves",
        required: true,
        minWords: 1500,
        maxWords: 3000,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "methodology_assessment",
        title: "Évaluation Méthodologique",
        required: true,
        minWords: 600,
        maxWords: 1200,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "stakeholder_positions",
        title: "Positions des Parties Prenantes",
        required: true,
        minWords: 800,
        maxWords: 1500,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "scenarios",
        title: "Scénarios Stratégiques",
        required: true,
        minWords: 1000,
        maxWords: 2000,
        claimTypes: ["SCENARIO"] as ClaimType[]
      },
      {
        id: "strategic_recommendations",
        title: "Recommandations Stratégiques",
        required: true,
        minWords: 800,
        maxWords: 1500,
        claimTypes: ["INTERPRETATION", "OPINION"] as ClaimType[]
      },
      {
        id: "implementation_roadmap",
        title: "Feuille de Route",
        required: true,
        minWords: 600,
        maxWords: 1200,
        claimTypes: ["INTERPRETATION"] as ClaimType[]
      },
      {
        id: "limitations",
        title: "Limites de l'Analyse",
        required: true,
        minWords: 400,
        maxWords: 800,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      }
    ],
    totalMinWords: 8000,
    totalMaxWords: 20000,
    minSources: 20,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  }
};

/**
 * Get the template for a publication type.
 * Legacy types are automatically resolved to their canonical template
 * via FORMAT_MAPPING (e.g. RESEARCH_BRIEF → DECISION_MEMO).
 */
export function getTemplate(type: string): PublicationTemplate | undefined {
  // Direct hit on canonical template
  if (PUBLICATION_TEMPLATES[type]) {
    return PUBLICATION_TEMPLATES[type];
  }
  // Resolve legacy type → canonical type
  const canonical = FORMAT_MAPPING[type];
  if (canonical && PUBLICATION_TEMPLATES[canonical]) {
    return PUBLICATION_TEMPLATES[canonical];
  }
  return undefined;
}
