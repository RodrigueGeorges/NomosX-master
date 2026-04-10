/**
 * NomosX Think Tank - Seed Verticals
 * 
 * Run with: npx tsx prisma/seed-verticals.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Inline verticals to avoid ESM import issues
const VERTICALS = [
  {
    slug: "climate-energy",
    name: "Climat & Énergie",
    nameEn: "Climate & Energy",
    description: "Transition énergétique, politique climatique, marchés carbone",
    icon: "🌍",
    color: "#10B981",
    researchers: ["environment", "energy-advanced"],
    searchQueries: [
      "climate change policy carbon pricing emissions reduction",
      "renewable energy transition solar wind nuclear hydrogen",
      "biodiversity conservation ecosystem environmental impact"
    ],
    config: {
      maxPublicationsPerWeek: 3,
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "DATA_NOTE"],
      thresholds: { minNovelty: 65, minImpact: 60, minConfidence: 70 },
      cooldownHours: 48,
      updateBurstAllowed: true
    }
  },
  {
    slug: "macro-finance",
    name: "Macro & Finance",
    nameEn: "Macro & Finance", 
    description: "Politique monétaire, marchés financiers, conjoncture",
    icon: "📊",
    color: "#3B82F6",
    researchers: ["economics", "finance", "risk-analysis"],
    searchQueries: [
      "monetary policy inflation interest rates central bank",
      "financial markets systemic risk banking regulation fintech",
      "macroeconomic policy fiscal stimulus economic growth recession"
    ],
    config: {
      maxPublicationsPerWeek: 4,
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "DATA_NOTE", "POLICY_NOTE"],
      thresholds: { minNovelty: 60, minImpact: 65, minConfidence: 75 },
      cooldownHours: 24,
      updateBurstAllowed: true
    }
  },
  {
    slug: "geopolitics",
    name: "Géopolitique & Sécurité",
    nameEn: "Geopolitics & Security",
    description: "Relations internationales, sécurité, défense, conflits",
    icon: "🌐",
    color: "#8B5CF6",
    researchers: ["geopolitics", "security"],
    searchQueries: [
      "international relations geopolitical conflict diplomacy",
      "defense security military strategy cyber warfare",
      "sanctions trade war NATO alliance deterrence"
    ],
    config: {
      maxPublicationsPerWeek: 3,
      allowedTypes: ["RESEARCH_BRIEF", "POLICY_NOTE", "DOSSIER"],
      thresholds: { minNovelty: 70, minImpact: 70, minConfidence: 65 },
      cooldownHours: 48,
      updateBurstAllowed: true
    }
  },
  {
    slug: "tech-innovation",
    name: "Tech & Innovation",
    nameEn: "Tech & Innovation",
    description: "IA, numérique, cybersécurité, plateformes",
    icon: "🚀",
    color: "#F59E0B",
    researchers: ["technology", "digital-society", "computational-social-science"],
    searchQueries: [
      "artificial intelligence machine learning deep learning LLM",
      "cybersecurity digital transformation platform economy",
      "AI regulation governance ethics safety alignment"
    ],
    config: {
      maxPublicationsPerWeek: 3,
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "DATA_NOTE"],
      thresholds: { minNovelty: 75, minImpact: 60, minConfidence: 70 },
      cooldownHours: 48,
      updateBurstAllowed: true
    }
  },
  {
    slug: "social-policy",
    name: "Politique Sociale",
    nameEn: "Social Policy",
    description: "Emploi, éducation, inégalités, migration",
    icon: "🏛️",
    color: "#EC4899",
    researchers: ["policy", "social-sciences", "behavioral-economics"],
    searchQueries: [
      "social policy inequality poverty welfare public services",
      "labor market employment education workforce",
      "migration immigration social mobility demographic change"
    ],
    config: {
      maxPublicationsPerWeek: 2,
      allowedTypes: ["RESEARCH_BRIEF", "POLICY_NOTE"],
      thresholds: { minNovelty: 60, minImpact: 70, minConfidence: 75 },
      cooldownHours: 72,
      updateBurstAllowed: false
    }
  },
  {
    slug: "health-bioethics",
    name: "Santé & Bioéthique",
    nameEn: "Health & Bioethics",
    description: "Santé publique, épidémiologie, éthique médicale, biotechnologies",
    icon: "🏥",
    color: "#EF4444",
    researchers: ["health", "bioethics"],
    searchQueries: [
      "public health epidemiology pandemic disease prevention",
      "healthcare systems clinical research medical innovation",
      "bioethics genetic engineering biotechnology medical ethics"
    ],
    config: {
      maxPublicationsPerWeek: 2,
      allowedTypes: ["RESEARCH_BRIEF", "UPDATE_NOTE", "POLICY_NOTE"],
      thresholds: { minNovelty: 65, minImpact: 70, minConfidence: 75 },
      cooldownHours: 48,
      updateBurstAllowed: true
    }
  },
  {
    slug: "law-regulation",
    name: "Droit & Régulation",
    nameEn: "Law & Regulation",
    description: "Cadres juridiques, conformité, droit international, régulation numérique",
    icon: "⚖️",
    color: "#6366F1",
    researchers: ["law"],
    searchQueries: [
      "legal regulation compliance international law",
      "data protection GDPR AI Act digital regulation",
      "antitrust competition law trade law regulatory reform"
    ],
    config: {
      maxPublicationsPerWeek: 2,
      allowedTypes: ["RESEARCH_BRIEF", "POLICY_NOTE", "DOSSIER"],
      thresholds: { minNovelty: 60, minImpact: 65, minConfidence: 75 },
      cooldownHours: 72,
      updateBurstAllowed: false
    }
  },
  {
    slug: "cognitive-behavioral",
    name: "Sciences Cognitives & Comportementales",
    nameEn: "Cognitive & Behavioral Sciences",
    description: "Psychologie cognitive, économie comportementale, neurosciences",
    icon: "🧠",
    color: "#14B8A6",
    researchers: ["cognitive-science", "behavioral-economics"],
    searchQueries: [
      "cognitive science decision making behavioral economics",
      "neuroscience psychology cognitive bias heuristics",
      "nudge choice architecture consumer behavior"
    ],
    config: {
      maxPublicationsPerWeek: 1,
      allowedTypes: ["RESEARCH_BRIEF", "STRATEGIC_REPORT"],
      thresholds: { minNovelty: 70, minImpact: 60, minConfidence: 75 },
      cooldownHours: 168,
      updateBurstAllowed: false
    }
  },
  {
    slug: "development-global",
    name: "Développement & Sud Global",
    nameEn: "Development & Global South",
    description: "Économie du développement, aide internationale, urbanisation, ODD",
    icon: "🌏",
    color: "#F97316",
    researchers: ["development-economics", "urban-studies"],
    searchQueries: [
      "development economics poverty alleviation emerging markets",
      "foreign aid microfinance institutional economics",
      "urbanization smart cities infrastructure sustainable development goals"
    ],
    config: {
      maxPublicationsPerWeek: 2,
      allowedTypes: ["RESEARCH_BRIEF", "POLICY_NOTE", "DOSSIER"],
      thresholds: { minNovelty: 65, minImpact: 65, minConfidence: 70 },
      cooldownHours: 72,
      updateBurstAllowed: false
    }
  },
  {
    slug: "complexity-quantitative",
    name: "Systèmes Complexes & Quantitatif",
    nameEn: "Complex Systems & Quantitative",
    description: "Systèmes complexes, méthodes quantitatives, analyse de risque, modélisation",
    icon: "📐",
    color: "#8B5CF6",
    researchers: ["complexity-science", "quantitative", "risk-analysis"],
    searchQueries: [
      "complex systems emergence network theory agent-based modeling",
      "quantitative methods causal inference statistical analysis",
      "systemic risk tail risk scenario planning stress testing"
    ],
    config: {
      maxPublicationsPerWeek: 1,
      allowedTypes: ["RESEARCH_BRIEF", "STRATEGIC_REPORT"],
      thresholds: { minNovelty: 75, minImpact: 60, minConfidence: 80 },
      cooldownHours: 168,
      updateBurstAllowed: false
    }
  },
  {
    slug: "humanities-ethics",
    name: "Humanités & Éthique",
    nameEn: "Humanities & Ethics",
    description: "Philosophie, éthique appliquée, histoire, théorie politique, médias",
    icon: "📚",
    color: "#A855F7",
    researchers: ["humanities"],
    searchQueries: [
      "philosophy ethics political theory democracy",
      "history intellectual cultural studies critical theory",
      "media studies disinformation public discourse free speech"
    ],
    config: {
      maxPublicationsPerWeek: 1,
      allowedTypes: ["RESEARCH_BRIEF", "STRATEGIC_REPORT"],
      thresholds: { minNovelty: 65, minImpact: 55, minConfidence: 70 },
      cooldownHours: 168,
      updateBurstAllowed: false
    }
  }
];

async function main() {
  console.log("🌱 Seeding verticals...");

  for (const vertical of VERTICALS) {
    const existing = await prisma.vertical.findUnique({
      where: { slug: vertical.slug }
    });

    const fullConfig = {
      ...vertical.config,
      researchers: vertical.researchers,
      searchQueries: vertical.searchQueries,
    };

    if (existing) {
      console.log(`  ⏭️  ${vertical.name} already exists, updating...`);
      await prisma.vertical.update({
        where: { slug: vertical.slug },
        data: {
          name: vertical.name,
          nameEn: vertical.nameEn,
          description: vertical.description,
          icon: vertical.icon,
          color: vertical.color,
          config: fullConfig as any,
          isActive: true
        }
      });
    } else {
      console.log(`  ✅ Creating ${vertical.name}...`);
      await prisma.vertical.create({
        data: {
          slug: vertical.slug,
          name: vertical.name,
          nameEn: vertical.nameEn,
          description: vertical.description,
          icon: vertical.icon,
          color: vertical.color,
          config: fullConfig as any,
          isActive: true
        }
      });
    }
  }

  // Deactivate orphan verticals not in our registry
  const validSlugs = VERTICALS.map(v => v.slug);
  const orphans = await prisma.vertical.updateMany({
    where: { slug: { notIn: validSlugs } },
    data: { isActive: false }
  });
  if (orphans.count > 0) {
    console.log(`  🧹 Deactivated ${orphans.count} orphan vertical(s)`);
  }

  console.log(`\n✅ Seeded ${VERTICALS.length} verticals`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
