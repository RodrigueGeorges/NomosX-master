/**
 * NomosX Institutional Think Tank - Publication Templates
 * 
 * Defines structure and constraints for each publication type
 */

import { PublicationTemplate,ClaimType,FORBIDDEN_PHRASES } from './types';

export const PUBLICATION_TEMPLATES: Record<string, PublicationTemplate> = {

  // ── PRIMARY 3-TIER FORMATS ──────────────────────────────────────────────────

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

  EXECUTIVE_BRIEF: {
    type: "EXECUTIVE_BRIEF",
    sections: [
      {
        id: "executive_summary",
        title: "Synthèse Exécutive",
        required: true,
        minWords: 75,
        maxWords: 150,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "evidence_base",
        title: "Base de Preuves",
        required: true,
        minWords: 150,
        maxWords: 300,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "strategic_implications",
        title: "Implications Stratégiques",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["INTERPRETATION", "SCENARIO"] as ClaimType[]
      },
      {
        id: "decision_points",
        title: "Points de Décision",
        required: true,
        minWords: 75,
        maxWords: 150,
        claimTypes: ["INTERPRETATION"] as ClaimType[]
      },
      {
        id: "limitations",
        title: "Limites & Incertitudes",
        required: true,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      }
    ],
    totalMinWords: 500,
    totalMaxWords: 1000,
    minSources: 4,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

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
  },

  // ── LEGACY FORMATS (backward compatibility) ─────────────────────────────────

  RESEARCH_BRIEF: {
    type: "RESEARCH_BRIEF",
    sections: [
      {
        id: "key_finding",
        title: "Constat Principal",
        required: true,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "evidence_base",
        title: "Base de Preuves",
        required: true,
        minWords: 150,
        maxWords: 300,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "methodology_assessment",
        title: "Évaluation Méthodologique",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "implications",
        title: "Implications",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["INTERPRETATION", "SCENARIO"] as ClaimType[]
      },
      {
        id: "limitations",
        title: "Limites & Incertitudes",
        required: true,
        minWords: 75,
        maxWords: 150,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "what_changes_mind",
        title: "Ce Qui Changerait Notre Avis",
        required: true,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["SCENARIO"] as ClaimType[]
      }
    ],
    totalMinWords: 800,
    totalMaxWords: 1500,
    minSources: 5,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  UPDATE_NOTE: {
    type: "UPDATE_NOTE",
    sections: [
      {
        id: "what_changed",
        title: "Ce Qui a Changé",
        required: true,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "new_evidence",
        title: "Nouvelle Évidence",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "updated_assessment",
        title: "Évaluation Mise à Jour",
        required: true,
        minWords: 75,
        maxWords: 150,
        claimTypes: ["INTERPRETATION"] as ClaimType[]
      },
      {
        id: "action_items",
        title: "Actions Recommandées",
        required: false,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["INTERPRETATION", "SCENARIO"] as ClaimType[]
      }
    ],
    totalMinWords: 300,
    totalMaxWords: 600,
    minSources: 2,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  DATA_NOTE: {
    type: "DATA_NOTE",
    sections: [
      {
        id: "data_summary",
        title: "Résumé des Données",
        required: true,
        minWords: 75,
        maxWords: 150,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "key_figures",
        title: "Chiffres Clés",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "trend_analysis",
        title: "Analyse des Tendances",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "methodology_note",
        title: "Note Méthodologique",
        required: true,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["FACT"] as ClaimType[]
      }
    ],
    totalMinWords: 400,
    totalMaxWords: 800,
    minSources: 1,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  POLICY_NOTE: {
    type: "POLICY_NOTE",
    sections: [
      {
        id: "policy_summary",
        title: "Résumé de la Politique",
        required: true,
        minWords: 75,
        maxWords: 150,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "key_provisions",
        title: "Dispositions Clés",
        required: true,
        minWords: 150,
        maxWords: 300,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "impact_assessment",
        title: "Évaluation d'Impact",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["FACT", "INTERPRETATION", "SCENARIO"] as ClaimType[]
      },
      {
        id: "timeline",
        title: "Calendrier",
        required: true,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "action_required",
        title: "Actions Requises",
        required: false,
        minWords: 50,
        maxWords: 100,
        claimTypes: ["INTERPRETATION"] as ClaimType[]
      }
    ],
    totalMinWords: 500,
    totalMaxWords: 1000,
    minSources: 2,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  },

  DOSSIER: {
    type: "DOSSIER",
    sections: [
      {
        id: "executive_summary",
        title: "Résumé Exécutif",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "background",
        title: "Contexte",
        required: true,
        minWords: 300,
        maxWords: 600,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "evidence_synthesis",
        title: "Synthèse des Preuves",
        required: true,
        minWords: 500,
        maxWords: 1000,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      },
      {
        id: "stakeholder_positions",
        title: "Positions des Parties Prenantes",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["FACT"] as ClaimType[]
      },
      {
        id: "scenarios",
        title: "Scénarios",
        required: true,
        minWords: 300,
        maxWords: 600,
        claimTypes: ["SCENARIO"] as ClaimType[]
      },
      {
        id: "recommendations",
        title: "Recommandations",
        required: true,
        minWords: 200,
        maxWords: 400,
        claimTypes: ["INTERPRETATION", "OPINION"] as ClaimType[]
      },
      {
        id: "limitations",
        title: "Limites de l'Analyse",
        required: true,
        minWords: 100,
        maxWords: 200,
        claimTypes: ["FACT", "INTERPRETATION"] as ClaimType[]
      }
    ],
    totalMinWords: 2500,
    totalMaxWords: 5000,
    minSources: 15,
    forbiddenPhrases: [...FORBIDDEN_PHRASES]
  }
};

export function getTemplate(type: string): PublicationTemplate | undefined {
  return PUBLICATION_TEMPLATES[type];
}
