/**
 * NomosX Institutional Think Tank - Vertical Definitions
 * 
 * Pre-configured verticals for the think tank
 */

import { VerticalConfig,PublicationType } from './types';

export interface VerticalDefinition {
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  icon: string;
  color: string;
  config: VerticalConfig;
}

export const VERTICALS: VerticalDefinition[] = [
  {
    slug: "eu-policy",
    name: "Politique Européenne",
    nameEn: "EU Policy",
    description: "Réglementation, directives et politiques de l'Union Européenne",
    icon: "🇪🇺",
    color: "#3B82F6", // blue-500
    config: {
      maxPublicationsPerWeek: 5,
      preferredLanguage: "fr",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 75,
        minNoveltyScore: 60,
        minImpactScore: 65,
        minSources: 5
      },
      cooldownHours: 24,
      updateBurst: {
        trigger: "EU_SUMMIT|COUNCIL_DECISION|DIRECTIVE_PUBLISHED",
        maxExtraPerDay: 2,
        durationHours: 48
      }
    }
  },
  {
    slug: "climate-industry",
    name: "Climat & Industrie",
    nameEn: "Climate & Industry",
    description: "Transition énergétique, décarbonation industrielle, CBAM",
    icon: "🌍",
    color: "#FFFFFF", // white accent
    config: {
      maxPublicationsPerWeek: 4,
      preferredLanguage: "en",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 75,
        minNoveltyScore: 65,
        minImpactScore: 60,
        minSources: 6
      },
      cooldownHours: 36,
      updateBurst: {
        trigger: "COP_EVENT|IPCC_REPORT|EU_GREEN_DEAL",
        maxExtraPerDay: 2,
        durationHours: 72
      }
    }
  },
  {
    slug: "ai-labor",
    name: "IA & Travail",
    nameEn: "AI & Labor",
    description: "Impact de l'IA sur l'emploi, automatisation, compétences futures",
    icon: "🤖",
    color: "#8B5CF6", // violet-500
    config: {
      maxPublicationsPerWeek: 4,
      preferredLanguage: "en",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 75,
        minNoveltyScore: 70,
        minImpactScore: 65,
        minSources: 5
      },
      cooldownHours: 36
    }
  },
  {
    slug: "geopolitics",
    name: "Géopolitique",
    nameEn: "Geopolitics",
    description: "Relations internationales, sécurité, diplomatie",
    icon: "🌐",
    color: "#EF4444", // red-500
    config: {
      maxPublicationsPerWeek: 3,
      preferredLanguage: "fr",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 80,
        minNoveltyScore: 60,
        minImpactScore: 70,
        minSources: 6
      },
      cooldownHours: 48,
      updateBurst: {
        trigger: "CRISIS_EVENT|SUMMIT|TREATY",
        maxExtraPerDay: 3,
        durationHours: 24
      }
    }
  },
  {
    slug: "finance-regulation",
    name: "Finance & Régulation",
    nameEn: "Finance & Regulation",
    description: "Marchés financiers, régulation bancaire, crypto-actifs",
    icon: "💹",
    color: "#F59E0B", // amber-500
    config: {
      maxPublicationsPerWeek: 3,
      preferredLanguage: "en",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 80,
        minNoveltyScore: 60,
        minImpactScore: 65,
        minSources: 5
      },
      cooldownHours: 48
    }
  },
  {
    slug: "health-bioethics",
    name: "Santé & Bioéthique",
    nameEn: "Health & Bioethics",
    description: "Santé publique, épidémiologie, éthique médicale et biotechnologies",
    icon: "🧬",
    color: "#10B981", // emerald-500
    config: {
      maxPublicationsPerWeek: 3,
      preferredLanguage: "fr",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 75,
        minNoveltyScore: 65,
        minImpactScore: 65,
        minSources: 6
      },
      cooldownHours: 36,
      updateBurst: {
        trigger: "HEALTH_EMERGENCY|CLINICAL_TRIAL|BIOETHICS_RULING",
        maxExtraPerDay: 2,
        durationHours: 48
      }
    }
  },
  {
    slug: "law-regulation",
    name: "Droit & Régulation",
    nameEn: "Law & Regulation",
    description: "Droit international, régulation sectorielle, contentieux stratégique",
    icon: "⚖️",
    color: "#6366F1", // indigo-500
    config: {
      maxPublicationsPerWeek: 3,
      preferredLanguage: "fr",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 78,
        minNoveltyScore: 60,
        minImpactScore: 65,
        minSources: 5
      },
      cooldownHours: 48
    }
  },
  {
    slug: "social-policy",
    name: "Politique Sociale",
    nameEn: "Social Policy",
    description: "Inégalités, démographie, éducation, migration et politiques sociales",
    icon: "🏛️",
    color: "#EC4899", // pink-500
    config: {
      maxPublicationsPerWeek: 3,
      preferredLanguage: "fr",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 75,
        minNoveltyScore: 60,
        minImpactScore: 60,
        minSources: 5
      },
      cooldownHours: 36
    }
  },
  {
    slug: "cognitive-behavioral",
    name: "Cognition & Comportement",
    nameEn: "Cognition & Behavior",
    description: "Sciences cognitives, psychologie, neurosciences et biais décisionnels",
    icon: "🧠",
    color: "#8B5CF6", // violet-500
    config: {
      maxPublicationsPerWeek: 2,
      preferredLanguage: "en",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 75,
        minNoveltyScore: 65,
        minImpactScore: 60,
        minSources: 5
      },
      cooldownHours: 48
    }
  },
  {
    slug: "development-global",
    name: "Développement & Monde",
    nameEn: "Development & Global Affairs",
    description: "Développement international, aide, systèmes alimentaires et études post-coloniales",
    icon: "🌱",
    color: "#22C55E", // green-500
    config: {
      maxPublicationsPerWeek: 3,
      preferredLanguage: "fr",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "DECISION_MEMO", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 75,
        minNoveltyScore: 60,
        minImpactScore: 65,
        minSources: 5
      },
      cooldownHours: 36,
      updateBurst: {
        trigger: "HUMANITARIAN_CRISIS|FOOD_SHOCK|DEBT_DEFAULT",
        maxExtraPerDay: 2,
        durationHours: 48
      }
    }
  },
  {
    slug: "complexity-quantitative",
    name: "Complexité & Quantitatif",
    nameEn: "Complexity & Quantitative",
    description: "Systèmes complexes, analyse de risques, données et méthodes quantitatives",
    icon: "📊",
    color: "#06B6D4", // cyan-500
    config: {
      maxPublicationsPerWeek: 2,
      preferredLanguage: "en",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 78,
        minNoveltyScore: 65,
        minImpactScore: 60,
        minSources: 6
      },
      cooldownHours: 48
    }
  },
  {
    slug: "humanities-ethics",
    name: "Humanités & Éthique",
    nameEn: "Humanities & Ethics",
    description: "Philosophie, épistémologie, histoire, anthropologie et éthique des technologies",
    icon: "📜",
    color: "#A855F7", // purple-500
    config: {
      maxPublicationsPerWeek: 2,
      preferredLanguage: "fr",
      allowedTypes: ["ARTICLE", "SUMMARY_BRIEF", "STRATEGIC_REPORT"] as PublicationType[],
      thresholds: {
        minTrustScore: 75,
        minNoveltyScore: 65,
        minImpactScore: 60,
        minSources: 5
      },
      cooldownHours: 48
    }
  }
];

/**
 * Slug bridge between the researcher-routing vocabulary
 * (VERTICAL_RESEARCHER_MAP in lib/agent/researcher-ownership.ts) and the
 * publication verticals stored in the DB. Topic classification emits
 * researcher slugs; the Vertical table uses editorial slugs. Without this
 * map every non-matching slug fell through to an arbitrary `findFirst`
 * vertical — which is why 100% of publications landed in eu-policy and
 * geopolitics while climate-industry, ai-labor and finance-regulation
 * stayed empty.
 */
export const VERTICAL_SLUG_ALIASES: Record<string, string> = {
  "climate-energy": "climate-industry",
  "macro-finance": "finance-regulation",
  "tech-innovation": "ai-labor",
};

/** Resolve a researcher/classification slug to the DB vertical slug. */
export function resolveDbVerticalSlug(slug: string | undefined | null): string | undefined {
  if (!slug) return undefined;
  return VERTICAL_SLUG_ALIASES[slug] ?? slug;
}

export function getVerticalBySlug(slug: string): VerticalDefinition | undefined {
  return VERTICALS.find(v => v.slug === slug);
}

export function getVerticalConfig(slug: string): VerticalConfig | undefined {
  return getVerticalBySlug(slug)?.config;
}
