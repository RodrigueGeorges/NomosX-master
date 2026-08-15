/**
 * NomosX Institutional Think Tank — Publication Templates
 *
 * 4 canonical templates aligned 1:1 with Inquiry depths and Engine formats:
 *   SUMMARY_BRIEF    → surface depth   — 200-400 words, 2+ sources
 *   DECISION_MEMO    → standard depth  — 800-1,500 words, 8+ sources
 *   ARTICLE          → deep depth      — 3,000-5,000 words, 15+ sources
 *   STRATEGIC_REPORT → strategic depth — 5,000-10,000 words, 20+ sources
 *
 * Legacy types (RESEARCH_BRIEF, EXECUTIVE_BRIEF, etc.) are resolved to
 * canonical templates via FORMAT_MAPPING in getTemplate().
 */

import { PublicationTemplate, ClaimType, FORBIDDEN_PHRASES } from './types';
import { FORMAT_MAPPING } from './types';

export const PUBLICATION_TEMPLATES: Record<string, PublicationTemplate> = {

  // ── 1. SIGNAL BRIEF (surface depth) ──────────────────────────────────────

  SUMMARY_BRIEF: {
    type: "SUMMARY_BRIEF",
    sections: [
      {
        id: "key_finding",
        title: "Constat Principal",
        required: true,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "so_what",
        title: "Pourquoi Cela Compte",
        required: true,
        minWords: 75,
        maxWords: 150,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "what_to_watch",
        title: "À Surveiller",
        required: true,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["SCENARIO"] as ClaimType[]
      }
    ],
    totalMinWords: 200,
    totalMaxWords: 400,
    minSources: 2,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  // ── 2. DECISION MEMO (standard depth) ────────────────────────────────────
  // Structured decision brief for policy makers and executives.
  // Replaces legacy RESEARCH_BRIEF, EXECUTIVE_BRIEF, POLICY_NOTE.

  DECISION_MEMO: {
    type: "DECISION_MEMO",
    sections: [
      {
        id: "decision_context",
        title: "Contexte de la Décision",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "key_evidence",
        title: "Preuves Clés",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "options_assessment",
        title: "Évaluation des Options",
        required: true,
        minWords: 150,
        maxWords: 300,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "recommendation",
        title: "Recommandation",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["INTERPRETATION", "OPINION"] as ClaimType[]
      },
      {
        id: "risks_what_changes_mind",
        title: "Risques & Ce Qui Changerait Notre Avis",
        required: true,
        minWords: 75,
        maxWords: 150,
        claimTypes: ["SCENARIO"] as ClaimType[]
      }
    ],
    totalMinWords: 800,
    totalMaxWords: 1500,
    minSources: 8,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  // ── 3. ARTICLE (deep depth) ──────────────────────────────────────────────

  ARTICLE: {
    type: "ARTICLE",
    sections: [
      {
        id: "introduction",
        title: "Introduction",
        required: true,
        minWords: 300,
        maxWords: 600,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "context_background",
        title: "Contexte & Enjeux",
        required: true,
        minWords: 400,
        maxWords: 800,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "evidence_analysis",
        title: "Analyse des Preuves",
        required: true,
        minWords: 600,
        maxWords: 1200,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "debate_perspectives",
        title: "Débat & Perspectives",
        required: true,
        minWords: 400,
        maxWords: 800,
        claimTypes: ["INTERPRETATION", "SCENARIO"] as ClaimType[]
      },
      {
        id: "implications",
        title: "Implications & Recommandations",
        required: true,
        minWords: 400,
        maxWords: 800,
        claimTypes: ["INTERPRETATION", "OPINION"] as ClaimType[]
      },
      {
        id: "conclusion",
        title: "Conclusion",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["INTERPRETATION"] as ClaimType[]
      }
    ],
    totalMinWords: 3000,
    totalMaxWords: 5000,
    minSources: 15,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  // ── 4. STRATEGIC REPORT (strategic depth) ────────────────────────────────

  STRATEGIC_REPORT: {
    type: "STRATEGIC_REPORT",
    sections: [
      {
        id: "executive_summary",
        title: "Résumé Exécutif",
        required: true,
        minWords: 500,
        maxWords: 1000,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "context_background",
        title: "Contexte & Historique",
        required: true,
        minWords: 600,
        maxWords: 1200,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "evidence_synthesis",
        title: "Synthèse des Preuves",
        required: true,
        minWords: 800,
        maxWords: 1600,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "methodology_assessment",
        title: "Évaluation Méthodologique",
        required: true,
        minWords: 400,
        maxWords: 800,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "stakeholder_positions",
        title: "Positions des Parties Prenantes",
        required: true,
        minWords: 400,
        maxWords: 800,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "scenarios",
        title: "Scénarios Stratégiques",
        required: true,
        minWords: 500,
        maxWords: 1000,
        claimTypes: ["SCENARIO"] as ClaimType[]
      },
      {
        id: "strategic_recommendations",
        title: "Recommandations Stratégiques",
        required: true,
        minWords: 400,
        maxWords: 800,
        claimTypes: ["INTERPRETATION", "OPINION"] as ClaimType[]
      },
      {
        id: "implementation_roadmap",
        title: "Feuille de Route",
        required: true,
        minWords: 300,
        maxWords: 600,
        claimTypes: ["INTERPRETATION"] as ClaimType[]
      },
      {
        id: "limitations",
        title: "Limites de l'Analyse",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      }
    ],
    totalMinWords: 5000,
    totalMaxWords: 10000,
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
