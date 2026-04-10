# NomosX - Architecture Complète et Flux de Décision

**Rapport Technique Détaillé - Janvier 2026**

---

## Table des Matières

1. [Vue d'Ensemble](#1-vue-densemble)
2. [Architecture des Agents](#2-architecture-des-agents)
3. [Flux de Décision](#3-flux-de-décision)
4. [Système de Scoring](#4-système-de-scoring)
5. [Pipeline de Génération](#5-pipeline-de-génération)
6. [Gestion des Sources](#6-gestion-des-sources)
7. [Problèmes Identifiés](#7-problèmes-identifiés)
8. [Stack Optimale Recommandée](#8-stack-optimale-recommandée)
9. [Format de Publication Optimal](#9-format-de-publication-optimal)

---

## 1. Vue d'Ensemble

### Architecture Actuelle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NomosX Think Tank                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐         │
│  │  SCOUT   │ → │  INDEX   │ → │   RANK   │ → │  READER  │         │
│  │(collecte)│   │(enrichit)│   │(trie)    │   │(extrait) │         │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘         │
│       │                                             │                │
│       ▼                                             ▼                │
│  ┌──────────┐                                 ┌──────────┐          │
│  │ Providers│                                 │ ANALYST  │          │
│  │  40+     │                                 │(synthèse)│          │
│  └──────────┘                                 └──────────┘          │
│                                                     │                │
│                                               ┌─────┴─────┐         │
│                                               │   GUARD   │         │
│                                               │(citations)│         │
│                                               └─────┬─────┘         │
│                                                     │                │
│                                               ┌─────┴─────┐         │
│                                               │  EDITOR   │         │
│                                               │  (HTML)   │         │
│                                               └─────┬─────┘         │
│                                                     │                │
│                                               ┌─────┴─────┐         │
│                                               │ PUBLISHER │         │
│                                               │   (DB)    │         │
│                                               └───────────┘         │
└─────────────────────────────────────────────────────────────────────┘
```

### Stack Technique Actuelle

| Composant | Technologie | Version |
|-----------|-------------|---------|
| **Runtime** | Node.js | v24.x |
| **Framework** | Next.js | 14.x |
| **Base de données** | PostgreSQL + Prisma | 5.22 |
| **LLM** | OpenAI GPT-4o / Anthropic Claude | API |
| **Cache** | Redis (optionnel) | - |
| **Langage** | TypeScript | 5.x |

---

## 2. Architecture des Agents

### 2.1 Rôles et Responsabilités

| Agent | Responsabilité | Input | Output | Déterminisme |
|-------|---------------|-------|--------|--------------|
| **SCOUT** | Collecte sources brutes | Query + Providers | sourceIds[] | Semi (APIs externes) |
| **INDEX** | Enrichit avec ROR/ORCID | sourceIds[] | enriched count | Semi (APIs externes) |
| **RANK** | Sélectionne top sources | Query + limit + mode | Source[] | ✅ Déterministe |
| **READER** | Extrait claims/methods | Sources[] | ReadingResult[] | Semi (LLM temp=0.1) |
| **ANALYST** | Synthèse stratégique | Question + Sources + Readings | AnalysisOutput | Semi (LLM temp=0.2) |
| **GUARD** | Valide citations [SRC-*] | JSON analysis + count | {ok, invalid[]} | ✅ Déterministe |
| **EDITOR** | Génère HTML | Analysis + Sources | HTML string | ✅ Déterministe |
| **PUBLISHER** | Sauvegarde en DB | Brief data | Brief record | ✅ Déterministe |

### 2.2 Gouvernance des Agents

```typescript
// Fichier: lib/governance/roles.ts

export const AgentRole = {
  SCOUT: "scout",       // write:sources
  INDEX: "index",       // write:enrichment
  RANK: "rank",         // read:sources
  READER: "reader",     // write:readings
  ANALYST: "analyst",   // write:analysis
  EDITOR: "editor",     // write:draft
  PUBLISHER: "publisher", // write:brief
  DIGEST: "digest",     // write:digest
  RADAR: "radar",       // write:radar
  MONITORING: "monitoring" // read:all
};
```

Chaque agent vérifie ses permissions via `assertPermission()` avant d'agir.

---

## 3. Flux de Décision

### 3.1 Comment un sujet est-il choisi ?

**Le système ne choisit PAS de sujet de façon aléatoire.** Il existe 3 modes :

#### Mode 1: Query Manuelle (Ad-hoc)
```bash
npx tsx scripts/test-complete-pipeline.mjs "Votre question ici"
```
- L'utilisateur définit explicitement la question
- Le pipeline s'exécute une fois

#### Mode 2: Topics (Surveillance Automatique)
```typescript
// Table Topic dans Prisma
model Topic {
  id          String   @id
  name        String   // "AI Regulation"
  query       String   // "artificial intelligence regulation EU"
  tags        String[] // ["ai", "policy", "europe"]
  active      Boolean  @default(true)
}
```
- Les Topics sont créés manuellement en DB
- Le système les surveille automatiquement
- Génère des Digests hebdomadaires

#### Mode 3: Monitoring Continu
```typescript
// Queries prédéfinies dans monitoring-agent.ts
const MONITORING_QUERIES = [
  { provider: 'worldbank', query: 'artificial intelligence policy' },
  { provider: 'cisa', query: 'cybersecurity threats' },
  { provider: 'nist', query: 'security vulnerabilities' },
  // ... 20+ autres
];
```
- Crawle les providers en continu
- Détecte les nouvelles publications
- Alimente la base de sources

### 3.2 Décisions Automatiques du Pipeline

```
                    ┌─────────────────┐
                    │  QUERY ENTRÉE   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     SCOUT       │
                    │ • Quels providers? ──────► Définis par config/query
                    │ • Combien par provider? ─► 20-50 par défaut
                    └────────┬────────┘
                             │ N sources brutes
                    ┌────────▼────────┐
                    │     INDEX       │
                    │ • Enrichir ROR/ORCID ───► Si DOI disponible
                    │ • Calculer noveltyScore ► Formule automatique
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │      RANK       │
                    │ • Mode quality ou novelty? ► quality par défaut
                    │ • Combien garder? ──────────► 12 sources
                    │ • Diversité providers? ─────► Oui (max 4/provider)
                    └────────┬────────┘
                             │ Top 12 sources
                    ┌────────▼────────┐
                    │     READER      │
                    │ • Abstracts suffisants? ──► Skip si < 300 chars
                    │ • Timeout par source ─────► 5 secondes max
                    │ • Fallback rule-based ────► Si LLM échoue
                    └────────┬────────┘
                             │ 12 readings
                    ┌────────▼────────┐
                    │    ANALYST      │
                    │ • Température LLM ────────► 0.2 (semi-déterministe)
                    │ • Format output ──────────► JSON structuré
                    │ • Citations obligatoires ─► [SRC-N] dans chaque section
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     GUARD       │
                    │ • Toutes citations valides? ► Sinon échec
                    │ • Au moins 1 citation? ─────► Sinon échec
                    └────────┬────────┘
                             │ Si OK
                    ┌────────▼────────┐
                    │     EDITOR      │
                    │ • Format HTML ────────────► Template fixe
                    │ • Sections rendues ───────► 10 sections
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   PUBLISHER     │
                    │ • Sauvegarder en DB ──────► Brief table
                    │ • Générer publicId ───────► Pour URL publique
                    └─────────────────┘
```

---

## 4. Système de Scoring

### 4.1 Quality Score (0-100)

```typescript
// Fichier: lib/score.ts

function scoreSource(input) {
  // RÉCENCE (max 42 points)
  const recency = Math.max(0, 42 - age * 6);
  
  // CITATIONS (max 34 points)
  const citeScore = Math.min(34, Math.log10(citations + 1) * 16);
  
  // OPEN ACCESS (14 points)
  const oaScore = isOA ? 14 : 0;
  
  // INSTITUTIONS AFFILIÉES (6 points)
  const instScore = institutions.length > 0 ? 6 : 0;
  
  // BONUS CONTENU (max 20 points)
  if (hasFullText) contentBonus = 20;
  else if (contentLen >= 2000) contentBonus = 18;
  else if (contentLen >= 1000) contentBonus = 12;
  
  // BONUS INSTITUTIONNEL (max 45 points)
  switch (issuerType) {
    case 'intelligence': institutionalBonus = 30; // CIA, NSA, ODNI
    case 'defense':      institutionalBonus = 25; // NATO, DoD
    case 'economic':     institutionalBonus = 25; // IMF, World Bank
    case 'cyber':        institutionalBonus = 22; // CISA, NIST
    case 'multilateral': institutionalBonus = 20; // UN, OECD
  }
  
  // Bonus déclassifié
  if (classification === 'declassified') institutionalBonus += 15;
  
  return Math.min(100, total);
}
```

### 4.2 Novelty Score (0-100)

```typescript
function scoreNovelty(input) {
  // RÉCENCE (max 50 points) - Publications récentes favorisées
  const recencyScore = Math.max(0, 50 - age * 10);
  
  // SOUS-CITATION (max 30 points) - Pas encore mainstream
  const novelCiteScore = citations < 5 ? 30 : Math.max(0, 30 - Math.log10(citations) * 10);
  
  // FRAÎCHEUR DB (max 20 points) - Juste ajouté au système
  const freshnessScore = daysInDB < 7 ? 20 : Math.max(0, 20 - daysInDB);
  
  return recencyScore + novelCiteScore + freshnessScore;
}
```

### 4.3 Matrice de Décision RANK

| Critère | Mode Quality | Mode Novelty |
|---------|-------------|--------------|
| Tri principal | qualityScore DESC | noveltyScore DESC |
| Diversité providers | Max 4/provider | Max 4/provider |
| Sources françaises | Minimum 2 garanties | Minimum 2 garanties |
| Limite | 12 sources | 12 sources |

---

## 5. Pipeline de Génération

### 5.1 Prompt ANALYST (Cœur de la Génération)

```typescript
const prompt = `You are NomosX Analyst V2 — Elite strategic intelligence analyst.

CONTEXT: You have access to ${sources.length} HIGH-QUALITY sources (avg quality: ${avgQuality}/100)

QUESTION TO ANALYZE:
"${question}"

CRITICAL RULES:
1. LEVERAGE the extracted claims/methods/results
2. EVERY claim MUST cite [SRC-N]
3. SYNTHESIZE across sources (don't just list)
4. Be SPECIFIC about methodology quality
5. HIGHLIGHT contradictions between sources
6. Assess STRENGTH of evidence
7. Provide ACTIONABLE implications

ENHANCED FORMAT (JSON):
{
  "title": "Precise, specific title",
  "summary": "3-4 sentences with confidence level + citations",
  "consensus": "What sources AGREE on + evidence quality",
  "disagreements": "Where sources CONFLICT + why",
  "debate": {
    "pro": "Evidence FOR with [SRC-*]",
    "con": "Evidence AGAINST with [SRC-*]",
    "synthesis": "How to reconcile"
  },
  "evidence": "CRITICAL ASSESSMENT: quality score, methods, limitations",
  "implications": "ACTIONABLE: immediate/medium/long-term actions",
  "risks": "WHAT COULD GO WRONG: methodological limits, biases",
  "open_questions": "RESEARCH GAPS: unanswered questions",
  "what_changes_mind": "FALSIFIABILITY: what would overturn this"
}`;
```

### 5.2 Template EDITOR (HTML)

```html
<article style="max-width: 800px; margin: 0 auto; font-family: system-ui;">
  <div class="meta">NomosX — The agentic think tank</div>
  
  <h1>{title}</h1>
  
  <h2>Executive Summary</h2>
  <p>{summary}</p>
  
  <h2>Consensus</h2>
  <p>{consensus}</p>
  
  <h2>Disagreements</h2>
  <p>{disagreements}</p>
  
  <h2>Debate</h2>
  <div class="debate">
    <h3 style="color: #5EEAD4;">Arguments For</h3>
    <p>{debate.pro}</p>
    <h3 style="color: #FB7185;">Arguments Against</h3>
    <p>{debate.con}</p>
    <h3>Synthesis</h3>
    <p>{debate.synthesis}</p>
  </div>
  
  <h2>Evidence Quality</h2>
  <p>{evidence}</p>
  
  <h2>Strategic Implications</h2>
  <p>{implications}</p>
  
  <h2>Risks & Limitations</h2>
  <p>{risks}</p>
  
  <h2>Open Questions</h2>
  <p>{open_questions}</p>
  
  <h2>What Would Change Our Mind</h2>
  <p>{what_changes_mind}</p>
  
  <h2>Sources</h2>
  <ol>{sources_list}</ol>
</article>
```

---

## 6. Gestion des Sources

### 6.1 Providers Actuels (40+)

#### Académiques (8)
| Provider | API | Fiabilité |
|----------|-----|-----------|
| OpenAlex | REST API | ✅ Stable |
| Crossref | REST API | ✅ Stable |
| Semantic Scholar | REST API | ✅ Stable |
| arXiv | REST API | ✅ Stable |
| HAL | REST API | ✅ Stable |
| PubMed | REST API | ✅ Stable |
| BASE | REST API | ⚠️ Variable |
| Theses.fr | REST API | ✅ Stable |

#### Institutionnels - Stables (5)
| Provider | Méthode | Fiabilité |
|----------|---------|-----------|
| World Bank | REST API | ✅ Stable |
| CISA | RSS/Advisory | ✅ Stable |
| NIST | NVD API | ✅ Stable |
| UK Archives | REST API | ✅ Stable |
| Archive.org | REST API | ✅ Stable |

#### Institutionnels - V2 (15+)
| Provider | Méthode | Fiabilité |
|----------|---------|-----------|
| ODNI | Google CSE | ⏸️ Bloqué (facturation) |
| NATO | Google CSE | ⏸️ Bloqué |
| IMF | RSS + Scraping | ⚠️ Variable |
| OECD | RSS | ⚠️ Variable |
| UN | ODS API | ⚠️ Variable |
| ... | | |

### 6.2 Schéma Source (Prisma)

```prisma
model Source {
  id              String   @id
  provider        String   // "openalex", "worldbank", etc.
  title           String
  abstract        String?
  year            Int?
  doi             String?
  url             String?
  pdfUrl          String?
  
  // Scoring
  qualityScore    Float?
  noveltyScore    Float?
  citationCount   Int?
  
  // Métadonnées institutionnelles
  issuerType      String?  // "intelligence", "defense", "economic"
  classification  String?  // "public", "declassified"
  documentType    String?  // "assessment", "report", "dataset"
  
  // Relations
  authors         SourceAuthor[]
  institutions    SourceInstitution[]
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## 7. Problèmes Identifiés

### 7.1 Problèmes Critiques

| Problème | Impact | Solution |
|----------|--------|----------|
| **Google CSE 403** | 20+ think tanks inaccessibles | Résoudre facturation ou alternative (SerpAPI) |
| **Brief court** | ~7000 chars, peu détaillé | Nouveau format "Full Report" |
| **Sources non-pertinentes** | CIA 1963 dans analyse AI | Filtrage par date/pertinence |
| **Pas de PDF parsing** | Abstracts courts seulement | Intégrer extraction PDF |

### 7.2 Problèmes Modérés

| Problème | Impact | Solution |
|----------|--------|----------|
| **Redis optionnel** | Cache désactivé par défaut | Documentation + Docker Compose |
| **TypeScript enum** | Node.js strip mode échoue | Utiliser `npx tsx` ou compiler |
| **Schéma Prisma** | Champs manquants (status) | Migration schéma |

### 7.3 Améliorations Suggérées

1. **Pertinence des sources** - Ajouter scoring sémantique (embeddings) pour filtrer sources hors-sujet
2. **Format adaptatif** - Brief court vs Report long selon complexité
3. **Visualisations** - Graphiques, timelines, comparaisons
4. **Multi-langue** - Support français natif
5. **Validation humaine** - Interface de review avant publication

---

## 8. Stack Optimale Recommandée

### 8.1 Stack Actuelle vs Optimale

| Composant | Actuel | Optimal | Raison |
|-----------|--------|---------|--------|
| **LLM** | GPT-4o | GPT-4o + Claude 3.5 Sonnet | Fallback + comparaison |
| **Embeddings** | ❌ Aucun | OpenAI text-embedding-3-large | Pertinence sémantique |
| **Vector DB** | ❌ Aucun | Pinecone ou pgvector | Recherche similaire |
| **PDF Parsing** | ❌ Aucun | PDF.js + GPT-4o-vision | Extraction contenu complet |
| **Cache** | Redis (optionnel) | Redis obligatoire | Performance critique |
| **Queue** | ❌ Aucun | BullMQ | Jobs async, retry, priorités |
| **Monitoring** | Sentry | Sentry + Prometheus + Grafana | Métriques détaillées |

### 8.2 Architecture Optimale Proposée

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NomosX v2 - Architecture Optimale                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                       INGESTION LAYER                        │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │   │
│  │  │ Academic │  │ Instit.  │  │  Think   │  │   RSS    │    │   │
│  │  │   APIs   │  │   APIs   │  │  Tanks   │  │  Feeds   │    │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │   │
│  │       └──────────────┴──────────────┴──────────────┘         │   │
│  │                           │                                   │   │
│  │                    ┌──────▼──────┐                           │   │
│  │                    │   SCOUT     │                           │   │
│  │                    │  + Redis    │                           │   │
│  │                    └──────┬──────┘                           │   │
│  └───────────────────────────┼──────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────┼──────────────────────────────────┐   │
│  │                    ENRICHMENT LAYER                           │   │
│  │                    ┌──────▼──────┐                           │   │
│  │                    │    INDEX    │                           │   │
│  │                    │ ROR + ORCID │                           │   │
│  │                    └──────┬──────┘                           │   │
│  │                           │                                   │   │
│  │  ┌────────────────────────┼────────────────────────┐         │   │
│  │  │                        │                        │         │   │
│  │  ▼                        ▼                        ▼         │   │
│  │ ┌──────────┐        ┌──────────┐           ┌──────────┐     │   │
│  │ │ PDF      │        │ Embedding│           │ Vector   │     │   │
│  │ │ Extract  │ ────── │ Generator│ ───────── │ Store    │     │   │
│  │ └──────────┘        └──────────┘           │(Pinecone)│     │   │
│  │                                            └──────────┘     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     ANALYSIS LAYER                            │   │
│  │                                                               │   │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐                 │   │
│  │  │   RANK   │ → │  READER  │ → │ ANALYST  │                 │   │
│  │  │ Semantic │   │ + PDF    │   │ GPT-4o + │                 │   │
│  │  │ + Score  │   │ parsing  │   │ Claude   │                 │   │
│  │  └──────────┘   └──────────┘   └──────────┘                 │   │
│  │                                      │                       │   │
│  │                               ┌──────▼──────┐               │   │
│  │                               │    GUARD    │               │   │
│  │                               │ + Fact-check│               │   │
│  │                               └──────┬──────┘               │   │
│  └───────────────────────────────────────┼──────────────────────┘   │
│                                          │                           │
│  ┌───────────────────────────────────────┼──────────────────────┐   │
│  │                      OUTPUT LAYER                             │   │
│  │                               ┌──────▼──────┐                │   │
│  │                               │   EDITOR    │                │   │
│  │                               │ Multi-format│                │   │
│  │                               └──────┬──────┘                │   │
│  │                                      │                       │   │
│  │       ┌──────────────────────────────┼───────────────────┐   │   │
│  │       ▼                ▼             ▼           ▼       │   │   │
│  │  ┌─────────┐     ┌─────────┐   ┌─────────┐  ┌─────────┐ │   │   │
│  │  │  Brief  │     │ Report  │   │  Digest │  │   API   │ │   │   │
│  │  │  (2 p)  │     │ (15 p)  │   │ (email) │  │  (JSON) │ │   │   │
│  │  └─────────┘     └─────────┘   └─────────┘  └─────────┘ │   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 Dépendances Recommandées

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.25.0",
    "@pinecone-database/pinecone": "^2.0.0",
    "@sentry/nextjs": "^8.0.0",
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.0",
    "openai": "^4.50.0",
    "pdf-parse": "^1.1.1",
    "prisma": "^5.22.0",
    "zod": "^3.23.0"
  }
}
```

---

## 9. Format de Publication Optimal

### 9.1 Formats Proposés

#### Format 1: Executive Brief (Actuel)
- **Longueur**: 2-3 pages (~7000 chars)
- **Audience**: C-level, décideurs pressés
- **Sections**: Summary, Consensus, Debate, Implications
- **Temps lecture**: 5-10 min

#### Format 2: Strategic Report (Nouveau)
- **Longueur**: 10-15 pages (~35000 chars)
- **Audience**: Analystes, équipes stratégie
- **Sections supplémentaires**:
  - Méthodologie détaillée
  - Analyse source par source
  - Tableaux comparatifs
  - Visualisations
  - Annexes techniques
- **Temps lecture**: 30-45 min

#### Format 3: Research Dossier (Premium)
- **Longueur**: 30-50 pages
- **Audience**: Chercheurs, due diligence
- **Contenu complet**:
  - Toutes les sources originales
  - Transcriptions PDF
  - Arbres de citations
  - Analyse chronologique
  - Données brutes exportables
- **Temps lecture**: 2-3 heures

### 9.2 Template Strategic Report Recommandé

```markdown
# [TITRE PRÉCIS]

**Classification**: Public | Internal | Confidential
**Date**: [DATE]
**Auteur**: NomosX Analyst Agent
**Confiance**: [HIGH/MEDIUM/LOW]
**Sources analysées**: [N] sources de [M] providers

---

## Table des Matières

1. Executive Summary
2. Contexte et Enjeux
3. Méthodologie
4. Analyse des Sources
5. Consensus Scientifique
6. Points de Désaccord
7. Débat Structuré
8. Qualité des Preuves
9. Implications Stratégiques
10. Risques et Limitations
11. Questions Ouvertes
12. Critères d'Invalidation
13. Recommandations
14. Annexes

---

## 1. Executive Summary

[3-4 paragraphes répondant directement à la question]
- Réponse principale avec niveau de confiance
- Evidence clé
- Implication actionnable majeure
- Principale incertitude

---

## 2. Contexte et Enjeux

### 2.1 Pourquoi cette question ?
[Explication du contexte stratégique]

### 2.2 Parties prenantes
[Qui est impacté par cette question]

### 2.3 Temporalité
[Horizon temporel de l'analyse]

---

## 3. Méthodologie

### 3.1 Sources utilisées

| # | Source | Provider | Type | Année | Quality |
|---|--------|----------|------|-------|---------|
| 1 | [Titre] | worldbank | Report | 2024 | 85/100 |
| 2 | [Titre] | nist | Advisory | 2024 | 78/100 |
| ... | | | | | |

### 3.2 Critères de sélection
- Score qualité minimum: 50/100
- Sources par provider: max 4
- Période couverte: 5 dernières années
- Langues: EN, FR

### 3.3 Limites méthodologiques
[Transparence sur les biais possibles]

---

## 4. Analyse des Sources

### Source 1: [Titre]
**Provider**: [provider] | **Année**: [year] | **Quality**: [score]/100

**Claims principales**:
1. [Claim 1]
2. [Claim 2]

**Méthodologie**: [Description]

**Résultats clés**: [Chiffres, données]

**Limitations**: [Ce que l'étude ne couvre pas]

---

[Répéter pour chaque source majeure]

---

## 5. Consensus Scientifique

### Ce sur quoi les sources s'accordent

| Affirmation | Sources | Force du consensus |
|-------------|---------|-------------------|
| [Claim 1] | SRC-1, SRC-3, SRC-7 | ⭐⭐⭐⭐⭐ Fort |
| [Claim 2] | SRC-2, SRC-5 | ⭐⭐⭐ Modéré |

### Analyse du consensus
[Paragraphes détaillant pourquoi ce consensus existe]

---

## 6. Points de Désaccord

### Contradictions identifiées

| Sujet | Position A | Position B | Explication |
|-------|------------|------------|-------------|
| [Topic] | SRC-1: [view] | SRC-4: [view] | [Why they differ] |

### Analyse des désaccords
[Exploration des raisons: méthodologie, population, période, biais]

---

## 7. Débat Structuré

### 7.1 Arguments POUR [Position X]

| Argument | Source | Force | Limite |
|----------|--------|-------|--------|
| [Arg 1] | SRC-1 | ⭐⭐⭐⭐ | [Caveat] |
| [Arg 2] | SRC-3 | ⭐⭐⭐ | [Caveat] |

[Développement narratif]

### 7.2 Arguments CONTRE [Position X]

| Argument | Source | Force | Limite |
|----------|--------|-------|--------|
| [Arg 1] | SRC-2 | ⭐⭐⭐ | [Caveat] |

[Développement narratif]

### 7.3 Synthèse

[Comment réconcilier les deux positions]
[Dans quelles conditions chaque position est valide]

---

## 8. Qualité des Preuves

### Score global: [X]/10

| Critère | Score | Commentaire |
|---------|-------|-------------|
| Méthodologies | 7/10 | [Detail] |
| Taille échantillons | 6/10 | [Detail] |
| Réplication | 5/10 | [Detail] |
| Biais publication | 6/10 | [Detail] |
| Récence | 8/10 | [Detail] |

### Niveau de confiance final: [HIGH/MEDIUM/LOW]

---

## 9. Implications Stratégiques

### Court terme (0-6 mois)
- [Action 1]
- [Action 2]

### Moyen terme (6-24 mois)
- [Action 1]
- [Action 2]

### Long terme (2-5 ans)
- [Action 1]
- [Action 2]

---

## 10. Risques et Limitations

### Risques méthodologiques
- [Risque 1]

### Risques de généralisation
- [Risque 1]

### Scénarios négatifs possibles
- [Scénario 1]

---

## 11. Questions Ouvertes

| Question | Importance | Recherche nécessaire |
|----------|-----------|---------------------|
| [Q1] | Critique | [Type d'étude] |
| [Q2] | Haute | [Type d'étude] |

---

## 12. Critères d'Invalidation

**Ce qui changerait notre conclusion**:

1. [Finding 1 that would overturn analysis]
2. [Finding 2]
3. [Finding 3]

**Seuil de révision**: [Quand re-analyser]

---

## 13. Recommandations

### Recommandation principale
[Action claire et actionnable]

### Recommandations secondaires
1. [Rec 1]
2. [Rec 2]
3. [Rec 3]

---

## 14. Annexes

### A. Liste complète des sources
[Bibliographie formatée]

### B. Données brutes
[Tableaux de données si applicable]

### C. Glossaire
[Définitions termes techniques]
```

---

## Conclusion

Le système NomosX actuel est fonctionnel mais peut être significativement amélioré:

1. **Court terme**: Format Report long, filtrage pertinence par date
2. **Moyen terme**: Embeddings + Vector DB pour recherche sémantique
3. **Long terme**: PDF parsing complet, fact-checking automatique

La stack recommandée ajoute ~$50-100/mois de coûts (Pinecone, Redis) mais améliore drastiquement la qualité des analyses.
