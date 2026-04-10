/**
 * Domaines prédéfinis pour la classification des sources
 */

import { Wallet,Microscope,Leaf,Stethoscope,Cpu,Users,Scale,Zap,type LucideIcon, } from 'lucide-react';

export type Domain = {
  slug: string;
  name: string;
  nameEn: string;
  icon: LucideIcon;
  color: string;
  description: string;
  keywords: string[];
  jelCodes?: string[];
};

export const PREDEFINED_DOMAINS: Domain[] = [
  {
    slug: "economie",
    name: "Économie",
    nameEn: "Economics",
    icon: Wallet,
    color: "#4C6EF5",
    description: "Économie, finance, politique fiscale et monétaire",
    keywords: [
      "economics",
      "economy",
      "économie",
      "fiscal",
      "monetary",
      "gdp",
      "inflation",
      "unemployment",
      "finance",
      "banking",
      "trade",
      "market",
      "investment",
      "tax",
      "budget",
      "recession",
      "growth",
    ],
    jelCodes: ["E", "F", "G", "H"],
  },
  {
    slug: "science",
    name: "Sciences",
    nameEn: "Sciences",
    icon: Microscope,
    color: "#A78BFA",
    description: "Physique, chimie, mathématiques, astronomie",
    keywords: [
      "physics",
      "chemistry",
      "mathematics",
      "astronomy",
      "physique",
      "chimie",
      "mathématiques",
      "astronomie",
      "quantum",
      "particle",
      "molecule",
      "theorem",
      "equation",
      "experiment",
      "laboratory",
    ],
    jelCodes: [],
  },
  {
    slug: "ecologie",
    name: "Écologie & Climat",
    nameEn: "Ecology & Climate",
    icon: Leaf,
    color: "#5EEAD4",
    description: "Environnement, climat, biodiversité, développement durable",
    keywords: [
      "climate",
      "environment",
      "ecology",
      "écologie",
      "biodiversity",
      "emissions",
      "carbon",
      "renewable",
      "sustainability",
      "pollution",
      "deforestation",
      "ocean",
      "atmosphere",
      "conservation",
      "greenhouse",
    ],
    jelCodes: ["Q"],
  },
  {
    slug: "medecine",
    name: "Médecine & Santé",
    nameEn: "Medicine & Health",
    icon: Stethoscope,
    color: "#FB7185",
    description: "Santé, maladies, traitements, recherche médicale",
    keywords: [
      "medicine",
      "health",
      "médecine",
      "santé",
      "disease",
      "treatment",
      "diagnosis",
      "patient",
      "clinical",
      "therapy",
      "drug",
      "vaccine",
      "surgery",
      "epidemiology",
      "hospital",
      "cancer",
    ],
    jelCodes: ["I"],
  },
  {
    slug: "technologie",
    name: "Technologie & IA",
    nameEn: "Technology & AI",
    icon: Cpu,
    color: "#FCD34D",
    description: "Intelligence artificielle, informatique, innovation technologique",
    keywords: [
      "technology",
      "artificial intelligence",
      "ai",
      "machine learning",
      "deep learning",
      "neural network",
      "algorithm",
      "computing",
      "software",
      "data science",
      "automation",
      "robotics",
      "digital",
    ],
    jelCodes: [],
  },
  {
    slug: "sociologie",
    name: "Sociologie & Société",
    nameEn: "Sociology & Society",
    icon: Users,
    color: "#F97316",
    description: "Société, éducation, inégalités, démographie",
    keywords: [
      "sociology",
      "society",
      "sociologie",
      "social",
      "culture",
      "education",
      "inequality",
      "poverty",
      "migration",
      "demographics",
      "behavior",
      "identity",
      "community",
      "welfare",
    ],
    jelCodes: ["J", "Z"],
  },
  {
    slug: "politique",
    name: "Politique & Droit",
    nameEn: "Politics & Law",
    icon: Scale,
    color: "#8B5CF6",
    description: "Politique publique, législation, gouvernance",
    keywords: [
      "politics",
      "policy",
      "law",
      "politique",
      "droit",
      "government",
      "regulation",
      "legislation",
      "democracy",
      "election",
      "vote",
      "constitution",
      "court",
      "justice",
      "rights",
    ],
    jelCodes: ["K"],
  },
  {
    slug: "energie",
    name: "Énergie",
    nameEn: "Energy",
    icon: Zap,
    color: "#FBBF24",
    description: "Énergie renouvelable, fossile, nucléaire",
    keywords: [
      "energy",
      "énergie",
      "power",
      "electricity",
      "renewable",
      "solar",
      "wind",
      "nuclear",
      "fossil",
      "oil",
      "gas",
      "battery",
      "grid",
      "efficiency",
    ],
    jelCodes: ["Q4"],
  },
];

/**
 * Trouve un domaine par slug
 */
export function getDomainBySlug(slug: string): Domain | undefined {
  return PREDEFINED_DOMAINS.find((d) => d.slug === slug);
}

/**
 * Trouve plusieurs domaines par slugs
 */
export function getDomainsBySlugs(slugs: string[]): Domain[] {
  return slugs
    .map((slug) => getDomainBySlug(slug))
    .filter((d): d is Domain => d !== undefined);
}
