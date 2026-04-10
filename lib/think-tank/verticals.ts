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
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "POLICY_NOTE", "DOSSIER"] as PublicationType[],
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
    color: "#10B981", // emerald-500
    config: {
      maxPublicationsPerWeek: 4,
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "DATA_NOTE", "DOSSIER"] as PublicationType[],
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
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "DATA_NOTE"] as PublicationType[],
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
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "POLICY_NOTE"] as PublicationType[],
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
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "DATA_NOTE", "POLICY_NOTE"] as PublicationType[],
      thresholds: {
        minTrustScore: 80,
        minNoveltyScore: 60,
        minImpactScore: 65,
        minSources: 5
      },
      cooldownHours: 48
    }
  }
];

export function getVerticalBySlug(slug: string): VerticalDefinition | undefined {
  return VERTICALS.find(v => v.slug === slug);
}

export function getVerticalConfig(slug: string): VerticalConfig | undefined {
  return getVerticalBySlug(slug)?.config;
}
