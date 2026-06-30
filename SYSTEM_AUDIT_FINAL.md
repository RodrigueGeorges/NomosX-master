# NomosX — Audit Système Complet & Objectif
## Document de référence pour IA (Claude/GPT) — CTO, CPO, CEO, CMO, AI Engineer

> **Objectif** : Bilan objectif et complet de l'architecture NomosX pour permettre à toute IA de comprendre, corriger ou améliorer le système.
> **Méthodologie** : Analyse directe du code source. Fichiers clés lus : `lib/agent/pipeline-v2.ts`, `lib/agent/inquiry-orchestrator.ts`, `lib/agent/inquiry-pipeline.ts`, `lib/agent/think-tank-dispatcher.ts`, `lib/agent/editor-in-chief.ts`, `lib/agent/topic-radar.ts`, `lib/agent/orchestrator.ts`, `lib/agent/publication-gate.ts`, `lib/researchers.ts`, `lib/publication-formats.ts`, `lib/studiox-pricing.ts`, `lib/stripe.ts`, `app/api/studiox/route.ts`, `app/studio/page.tsx`, `app/pricing/page.tsx`, `middleware.ts`, `prisma/schema.prisma`, `lib/llm/unified-llm.ts`, `lib/foresight/*`, `lib/agent/simulation-agent.ts`, `lib/agent/foresight-swarm.ts`.
> **Dernière mise à jour** : 25 juin 2026

---

# Executive Summary

## Ce qu'est NomosX

NomosX est un **think tank agentic** autonome. Il détecte les signaux émergents, collecte des sources académiques et institutionnelles (100+ providers), les analyse via un conseil de 22 chercheurs virtuels (noms grecs), simule le futur via un swarm de 1 024 agents, et publie des briefs professionnels en HTML.

## Product mix réel

| Offre | Modèle | Prix | Déclencheur | Pipeline utilisé ? |
|---|---|---|---|---|
| **Reader** | Gratuit | Free | Publications auto-générées par le think tank | ✅ Oui (autonomous) |
| **Studio** | Pay-per-use | €9 – €299 | Utilisateur commande une analyse custom | ❌ **Non** (simple LLM) |

**⚠️ Point critique** : StudioX actuel ne déclenche **pas** le pipeline 16 steps. Il fait un appel LLM simple avec `gpt-4o` hardcodé. C'est un écart produit/technique majeur.

## Verdict d'audit

| Critère | Note | Commentaire |
|---|---|---|
| Architecture agentic | A | Pipeline 16 steps, orchestrateur adaptatif, mémoire d'apprentissage |
| Qualité académique | A | Harvard Council, Devil's Advocate, fact-checker, citation guard |
| Foresight Engine | B+ | Très avancé, mais déclenché seulement deep/strategic |
| Exécution produit | D | StudioX ne livre pas ce qu'il vend |
| Hygiène du code | C | Code mort, imports legacy, routes fantômes |
| Alignement business/tech | D | Pricing €299 sans livraison du format DOSSIER |

---

# Schéma d'Architecture Global

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  COUCHE 1 : CERVEAU AUTONOME (Think Tank Dispatcher)                        │
│  SENSE → DECIDE → DISPATCH → runAndPublishInquiry()                          │
│  Cron 2×/jour (breaking) + 2×/semaine (weekly) + editorial plan                │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────────────────┐
│  COUCHE 2 : ORCHESTRATION PUBLICATION (Inquiry Orchestrator)                  │
│  VALIDATE → RUN (inquiry-pipeline) → GATE → PERSIST                            │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────────────────┐
│  COUCHE 3 : PIPELINE V2 (16 steps) + FORESIGHT ENGINE                         │
│  SCOUT → INDEX → EMBED → DEDUP → RANK → DOMAIN → READER → ANALYST           │
│  → STRUCTURAL EDITOR → HARVARD COUNCIL → PhD DELIBERATION → EDITOR        │
│  → CITATION GUARD → CITATION VERIFIER → FACT-CHECKER → CRITICAL LOOP       │
│  → DEBATE + META-ANALYSIS (parallel) → DEVIL'S ADVOCATE → PUBLISHER → KG     │
│  + Foresight Swarm (optionnel, deep/strategic)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 1. Vision Produit & Positionnement

## Proposition de valeur

| Concurrent | Avantage NomosX |
|---|---|
| Brookings / RAND / France Stratégie | 100+ sources, 22 PhD virtuels, swarm simulation, publication continue |
| ChatGPT / Claude | Citations vérifiables [SRC-N], fact-checking, adversarial debate, publication gate |
| Bloomberg / Reuters | Analyse académique + institutionnelle + scénarios, pas seulement actualité |
| AlphaSense / Perplexity | Expertise académique intégrée, raisonnement multi-agent, mémoire d'apprentissage |

## Greek Protocol (identité de marque)

```
Doxa      → Elenchus      → Logos        → Nomos
(raw      (adversarial    (reasoned     (institutional
 belief)   test)           synthesis)    decision)
```

- **Doxa** = Topic Radar (détection des signaux bruts)
- **Elenchus** = Devil's Advocate + Debate (test adversarial)
- **Logos** = Harvard Council + Analyst (synthèse raisonnée)
- **Nomos** = Publication Gate (décision de publication)

Source : `components/brand/GreekProtocol.tsx`

---

# 2. Business Model Audit

## Pricing en production (StudioX)

Source : `lib/studiox-pricing.ts`

| Format | Prix | Pages | Sources | Profondeur | Livré ? |
|---|---|---|---|---|---|
| SUMMARY_BRIEF | €9 | 1-2 | 5+ | surface | ❌ chat simple |
| UPDATE_NOTE | €9 | 1-2 | 3+ | surface | ❌ chat simple |
| DATA_NOTE | €19 | 2-3 | dataset-led | standard | ❌ chat simple |
| POLICY_NOTE | €29 | 3-5 | 8+ | standard | ❌ chat simple |
| RESEARCH_BRIEF | €49 | 4-6 | 10+ | standard | ❌ chat simple |
| EXECUTIVE_BRIEF | €49 | 4-6 | 10+ | deep | ❌ chat simple |
| STRATEGIC_REPORT | €149 | 10-15 | 20+ | strategic | ❌ chat simple |
| DOSSIER | €299 | 30-50 | 50+ | strategic | ❌ **non implémenté** |

## ⚠️ Incohérence business model

`lib/stripe.ts` contient encore 4 plans legacy de subscription :
- `TRIAL` (Free)
- `ANALYST` (€9/mo — non utilisé)
- `RESEARCHER` (€19/mo — non utilisé)
- `STUDIO` (€49/mo — non utilisé)

**Analyse** : Le product mix est passé au **pay-per-use** (Reader + StudioX), mais le code Stripe et la base de données `Subscription` n'ont pas été nettoyés. Cela crée des risques de webhook, de routes mortes, et de confusion.

**Impact** : Moyen. Fonctionne en production mais entraîne dette technique et surface d'attaque.

---

# 3. Architecture Technique

## Stack

| Layer | Technologie | Fichier clé |
|---|---|---|
| Framework | Next.js 15 App Router | `next.config.mjs` |
| Langage | TypeScript 5.x | `tsconfig.json` |
| ORM | Prisma | `prisma/schema.prisma` |
| Base | PostgreSQL + pgvector | `prisma/schema.prisma` |
| Cache | Redis | `lib/agent/redis-simple.ts`, `lib/cache.ts` |
| LLM | DeepSeek (primary) + OpenAI + Anthropic | `lib/llm/unified-llm.ts` |
| Auth | JWT bcrypt custom | `lib/auth.ts` |
| Paiements | Stripe | `lib/stripe.ts` |
| Hébergement | Netlify | `netlify.toml` |
| UI | React + Tailwind + shadcn/ui | `components/ui/*` |

## Schéma de déploiement

```
                    Utilisateur
                         │
                         ▼
              ┌────────────────────┐
              │   Netlify CDN      │
              │   Next.js App      │
              └─────────┬──────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
   ┌─────────┐    ┌────────────┐   ┌──────────┐
   │  API    │    │  Netlify   │   │  Stripe  │
   │ Routes  │    │  Functions │   │  Webhook │
   └────┬────┘    │  (Cron)    │   └────┬─────┘
        │         └────────────┘        │
        │               │               │
        ▼               ▼               ▼
   ┌─────────┐    ┌────────────┐   ┌──────────┐
   │ Prisma  │    │    Redis   │   │ PostgreSQL│
   │ Client  │    │   Cache    │   │  + pgvector│
   └─────────┘    └────────────┘   └──────────┘
```

## Couche 1 : Think Tank Dispatcher

Source : `lib/agent/think-tank-dispatcher.ts`

```
runThinkTankCycle({ mode: "breaking" | "weekly" })
  ├─ breaking: collectBreakingItems()
  │     ├─ runTopicRadar()         [6 sweeps, 12min cache]
  │     ├─ editorialTriage()       [LLM, maxPubs=2, budget=$20]
  │     └─ breakingDecisionToItem() → dispatch depth=strategic
  │
  └─ weekly: collectWeeklyItems()
        ├─ planEditorialAgenda()   [auto-commission, max 3 slots]
        └─ signal fallback         [DB signals, priorityScore≥70]
```

**Cadence réelle** (from `getThinkTankStatus`) :
- Breaking : 2×/jour (06:00 & 18:00 UTC) via `cron-auto-scan`
- Weekly : dimanche 22:00 UTC + mercredi 12:00 UTC via `cron-generate-briefs`
- Editorial plan : dimanche avant generate-briefs

**Limites** :
- Weekly max = 3 publications par défaut
- Breaking max = 2 par run, budget $20
- Capacity par vertical = 3 par semaine (hardcodé dans `verticalHasCapacity`)

## Couche 2 : Inquiry Orchestrator

Source : `lib/agent/inquiry-orchestrator.ts`

```
runAndPublishInquiry(req)
  ├─ VALIDATE
  │     ├─ question length ≥ 10
  │     ├─ resolve vertical (active)
  │     └─ deduplication title (168h window)
  │
  ├─ RUN
  │     ├─ runInquiryPipeline()
  │     ├─ maybeRunSimulation()    [deep/strategic + ≥2 scenarios]
  │     └─ build Inquiry object
  │
  ├─ GATE
  │     ├─ evaluatePublicationGate()
  │     ├─ evaluatePublicationReadiness()
  │     └─ optional researcher sign-off
  │
  └─ PERSIST
        ├─ thinkTankPublication.create()
        ├─ brief.update() (if published)
        └─ persistForesightRun() (if simulation)
```

## Couche 3 : Pipeline V2 — 16 steps

Source : `lib/agent/pipeline-v2.ts` (lignes 1368-2225)

```
┌────────────────────────────────────────────────────────────────────────┐
│ 0. CONTEXT PRIMER                                                       │
│    └─ primeContext() : mémoire institutionnelle + tendances + gaps     │
├────────────────────────────────────────────────────────────────────────┤
│ 1. SCOUT                │ 2. INDEX            │ 3. EMBED               │
│    ├─ query enhancer    │    ├─ auteurs       │    ├─ vectors          │
│    ├─ 100+ providers    │    ├─ institutions  │    └─ batch            │
│    ├─ Redis cache       │    └─ ROR/ORCID     │                        │
│    ├─ dedup + enrich    │                     │                        │
│    └─ Orchestrator RE_SCOUT (strategic)                              │
├────────────────────────────────────────────────────────────────────────┤
│ 4. DEDUPLICATE          │ 5. RANK             │ 6. DOMAIN CLASS        │
│    ├─ DOI-based         │    ├─ quality/novelty│    ├─ topic-classifier  │
│    └─ title-based       │    ├─ recency       │    └─ confidence      │
│                         │    └─ diversity     │                        │
├────────────────────────────────────────────────────────────────────────┤
│ 7. READER V3            │ 8. ANALYST                                  │
│    ├─ claims/methods    │    ├─ brief: analyst-multipass (3 passes) │
│    ├─ results/limits     │    └─ strategic: strategicAnalystAgent     │
│    ├─ confidence        │         (10 sections, 16K tokens)            │
│    └─ PDF extraction     │                                            │
├────────────────────────────────────────────────────────────────────────┤
│ 9. STRUCTURAL EDITOR    │ 10. HARVARD COUNCIL   │ 11. PhD DELIBERATION  │
│    ├─ McKinsey pyramid  │    ├─ enhanced (22)  │    ├─ 2+ experts      │
│    └─ restructure si <70 │    ├─ legacy (9)     │    └─ consensus/conflict│
├────────────────────────────────────────────────────────────────────────┤
│ 12. CITATION GUARD      │ 13. EDITOR            │ 14. VERIFIER + FACT   │
│    ├─ [SRC-N] valid     │    ├─ professional HTML│   ├─ semantic check │
│    └─ count check       │    └─ strategic HTML  │   └─ numerical claims │
├────────────────────────────────────────────────────────────────────────┤
│ 15. CRITICAL LOOP V2    │ 16. DEVIL'S ADVOCATE  │ 17. PUBLISHER + KG    │
│    ├─ iterative review  │    ├─ final gate      │    ├─ brief.create()  │
│    └─ auto-revision      │    ├─ auto-revision   │    ├─ extract concepts │
│      (if improvement)     │    └─ benchmark       │    └─ source reputation│
├────────────────────────────────────────────────────────────────────────┤
│ 11+12. DEBATE + META-ANALYSIS (parallèle, deep/strategic)             │
└────────────────────────────────────────────────────────────────────────┘
```

### Budget guards

```
maxBudgetUsd = isStrategic ? 8.0 : 3.0   (défaut)
Timeout = 10 min (brief) / 15 min (strategic)
```

### Seeds sources

Si `seedSourceIds.length >= 8`, SCOUT est sauté. Utilisé par les signaux pré-détectés.

---

# 4. Agent Catalog — Spécifications Complètes

## 4.1 SCOUT

| | Valeur |
|---|---|
| Fichier | `lib/agent/pipeline-v2.ts` |
| Rôle | Collecte de sources |
| Providers | 100+ (type `Providers` = 70+ IDs supportés) |
| Cache | Redis 24h (`scout:${hash}`) |
| Output | `{ found, upserted, sourceIds, cached }` |
| Query enhancement | `lib/agent/query-enhancer.ts` |
| Reranking | Cohere (`lib/agent/cohere-reranker.ts`) |

**Détail du flow** :
1. Query enhancement → variations de requête
2. `Promise.allSettled` sur providers
3. Deduplication DOI + titre normalisé
4. Filtre de pertinence (`relevance-scorer.ts`)
5. Cohere reranking (top 100)
6. Enrichissement Unpaywall
7. Upsert batch

## 4.2 INDEX Agent

| | Valeur |
|---|---|
| Fichier | `lib/agent/index-agent.ts` |
| Rôle | Enrichissement auteurs, institutions, ROR/ORCID |
| Output | `{ enriched, errors }` |

## 4.3 RANK Agent V3

| | Valeur |
|---|---|
| Fichier | `lib/agent/enhanced-ranker.ts` |
| Rôle | Sélection diverse et pertinente |
| Default limit | 12 (brief) / 25 (strategic) |
| Scoring | quality + novelty + recency + diversity |
| Controls | maxPerProvider, maxPerYear, minProviderDiversity |

## 4.4 READER V3

| | Valeur |
|---|---|
| Fichier | `lib/agent/reader-agent-v3.ts` |
| Rôle | Extraction profonde par source |
| Max claims | 3 |
| Max methods | 3 |
| Max results | 3 |
| Max limitations | 2 |
| Confidence | high / medium / low |
| PDF | activé (`enablePdf: true`) |
| Concurrency | 5 |

## 4.5 ANALYST

### Mode brief : `lib/agent/analyst-multipass.ts`
- 3 passes : thematic → contradictions → synthesis
- Output : title, summary, consensus, disagreements, debate, evidence, implications, risks, open_questions, what_changes_mind

### Mode strategic : `lib/agent/strategic-analyst-agent.ts`
- 10 sections, 16K tokens output
- Executive summary, literature review, thematic analysis, debate, evidence, stakeholder matrix, scenarios, recommendations, roadmap, conclusion

## 4.6 HARVARD COUNCIL

### Enhanced (strategic) : `lib/agent/harvard-council-enhanced.ts`
- 22 PhD researchers (noms grecs)
- Sélection intelligente par domaine
- Hierarchical : domain leads → interdisciplinary synthesis
- CEBM + GRADE
- Recommandations : immediate, short-term, long-term, research

### Legacy (brief) : `lib/agent/review-board.ts`
- 9 experts + peer reviews
- CEBM evidence grading

## 4.7 DEVIL'S ADVOCATE

| | Valeur |
|---|---|
| Fichier | `lib/agent/devils-advocate.ts` |
| Rôle | Porte épistémique finale |
| Output | verdict, overallStrength, publishabilityScore, fatalChallenges, majorChallenges, vsInstitutionBenchmark |
| Auto-revision | Oui si fatalChallenges > 0 et strength < threshold |
| Benchmark | McKinsey, Brookings, RAND, France Stratégie |

## 4.8 ORCHESTRATOR

| | Valeur |
|---|---|
| Fichier | `lib/agent/orchestrator.ts` |
| Rôle | Contrôleur adaptatif du pipeline |
| Actions | PROCEED, RE_SCOUT, DEEPEN, RE_ANALYZE, DEBATE, PIVOT, ABORT |
| Checkpoints | AfterScout, AfterReader, AfterAnalyst, AfterCriticalLoop |
| Thresholds statiques | MIN_SOURCES=5, MIN_SOURCES_STRATEGIC=10, MIN_ABSTRACT_COVERAGE=0.6, MIN_AVG_QUALITY=55, MIN_PROVIDER_DIVERSITY=2/3, MIN_TRUST_SCORE=65, MIN_CITATION_COVERAGE=0.5, MAX_ITERATIONS=3 |
| Calibration | Depuis AgentMemory (≥3 runs nécessaires) |

---

# 5. Les 22 Chercheurs — Noms Grecs (données réelles)

**Fichier** : `lib/researchers.ts` (1072 lignes, `RESEARCHERS` array)

## CORE — 9 chercheurs (Tier 1)

| ID | Nom grec | Transcription | Titre | Institution | Domaine | Initiales |
|---|---|---|---|---|---|---|
| economics | **Οἰκονομία** | Dr. Oikonomia | Senior Economist | Harvard Kennedy School | Economics | ΟΟ |
| technology | **Τέχνη** | Dr. Techne | Computer Scientist | Stanford / DeepMind | Technology | ΤΤ |
| policy | **Πολιτεία** | Dr. Politeia | Political Scientist | Oxford / Brookings | Policy | ΠΠ |
| health | **Ὑγίεια** | Dr. Hygeia | Epidemiologist | Johns Hopkins / WHO | Health | ΗΗ |
| security | **Αἰγίς** | Dr. Aegis | Security Analyst | Georgetown / RAND | Security | ΑΑ |
| law | **Νόμος** | Dr. Nomos | Legal Scholar | Yale Law / ICJ | Law | ΝΝ |
| environment | **Γαία** | Dr. Gaia | Climate Scientist | ETH Zurich / IPCC | Environment | ΓΓ |
| quantitative | **Μέτρον** | Dr. Metron | Statistician | MIT / Nature Methods | Quantitative | ΜΜ |
| finance | **Χρηματιστικός** | Dr. Chrematistikos | Financial Economist | LSE / BlackRock | Finance & Markets | ΧΧ |

## ADVANCED — 6 chercheurs (Tier 2)

| ID | Nom grec | Transcription | Titre | Institution | Domaine | Initiales |
|---|---|---|---|---|---|---|
| social-sciences | **Κοινωνία** | Dr. Koinonia | Sociologist | UC Berkeley / Institute for Social Research | Social Sciences | ΚΚ |
| humanities | **Λόγος** | Dr. Logos | Philosopher | Sorbonne / Collège de France | Humanities | ΛΛ |
| energy-advanced | **Ἐνέργεια** | Dr. Energeia | Energy Engineer | Imperial College / IRENA | Energy Systems | ΕΕ |
| geopolitics | **Πόλις** | Dr. Polis | International Relations Expert | Geneva Graduate Institute / UN | Geopolitics | ΠΠ |
| cognitive-science | **Νόησις** | Dr. Noesis | Cognitive Neuroscientist | UCL / Max Planck | Cognitive Science | ΝΝ |
| digital-society | **Δίγι** | Dr. Digi | Digital Sociologist | MIT Media Lab / Oxford Internet Institute | Digital Society | ΔΔ |

## SPECIALIZED — 7 chercheurs (Tier 3)

| ID | Nom grec | Transcription | Titre | Institution | Domaine | Initiales |
|---|---|---|---|---|---|---|
| behavioral-economics | **Θυμός** | Dr. Thymos | Behavioral Economist | University of Chicago / NBER | Behavioral Economics | ΘΘ |
| urban-studies | **Ἄστυ** | Dr. Asty | Urban Planner | MIT / Lincoln Institute | Urban Studies | ΑΑ |
| development-economics | **Αὔξησις** | Dr. Auxesis | Development Economist | World Bank / Princeton | Development Economics | ΑΑ |
| computational-social-science | **Σύνταξις** | Dr. Syntaxis | Computational Social Scientist | Carnegie Mellon / Santa Fe Institute | Computational Social Science | ΣΣ |
| bioethics | **Βίος** | Dr. Bios | Bioethicist | Johns Hopkins / Hastings Center | Bioethics | ΒΒ |
| complexity-science | **Χάος** | Dr. Chaos | Complexity Scientist | Santa Fe Institute / Oxford | Complexity Science | ΧΧ |
| risk-analysis | **Κύβερνον** | Dr. Kyvernon | Risk Analyst | Wharton / Federal Reserve | Risk Analysis | ΚΚ |

**Total** : 9 + 6 + 7 = **22 chercheurs**

**Utilisation** :
- Pipeline (Harvard Council) pour générer des avis experts
- Frontend (`/researchers`) pour présenter l'équipe
- Topic Radar (`getTopicRadarQueries()`) pour orienter les recherches académiques
- Sélection de providers (`getDataSourcesForDomain()`)

**⚠️ Obsolète** : `getResearchersByTier(tier)` est encore basée sur un ancien modèle de subscription (`standard`/`premium`/`strategic`/`enterprise`). À nettoyer car le modèle est maintenant pay-per-use.

---

# 6. Formats de Publication (données réelles)

**Fichier** : `lib/publication-formats.ts`

| Type | Label | Family | Access | Pages | Source Depth | Description |
|---|---|---|---|---|---|---|
| SUMMARY_BRIEF | Signal Brief | **signals** | open | 1-2 | 5+ | Fast synthesis of a verified weak signal |
| UPDATE_NOTE | Update Note | **signals** | open | 1-2 | 3+ | Change log when new evidence modifies a position |
| DATA_NOTE | Data Note | **data** | open | 2-3 | dataset-led | Quantitative readout centered on datasets |
| POLICY_NOTE | Policy Memo | **memos** | open | 3-5 | 8+ | Options, trade-offs, recommendation, risks |
| RESEARCH_BRIEF | Research Brief | **briefs** | open | 4-6 | 10+ | Decision-ready synthesis with consensus |
| EXECUTIVE_BRIEF | Decision Brief | **briefs** | open | 4-6 | 10+ | Legacy executive briefs under new label |
| STRATEGIC_REPORT | Strategic Report | **reports** | open | 10-15 | 20+ | Deep analysis with scenarios, roadmap |
| DOSSIER | Research Dossier | **dossiers** | open | 30-50 | 50+ | Appendix-heavy evidence file |

**Families réelles** : `signals`, `data`, `memos`, `briefs`, `reports`, `dossiers`.

---

# 7. Foresight Engine — Swarm Simulation

## Architecture

```
runPipelineCore()
  │
  └─ maybeRunSimulation() ── si depth >= "deep" et ≥2 scénarios
        │
        ▼
   simulationAgent()
        │
        ├─ buildForesightGraph()     [GraphRAG]
        ├─ buildPersonaPanel()       [22-30 personas]
        ├─ spawnCrowd()              [384-1024 agents numériques]
        ├─ ticks de simulation:
        │   ├─ LLM persona speaks (every N ticks)
        │   ├─ propagateCrowd()      [influence sociale]
        │   ├─ runSocialTick()       [feed social dual-channel]
        │   └─ syncLeadersFromCrowd()
        ├─ runMonteCarloSimulation() [1500-3000 runs]
        ├─ computeSensitivityMatrix()
        └─ Red team challenge
```

## Configuration par profondeur

Source : `lib/agent/simulation-agent.ts:235-240`

| Depth | Ticks | MC Runs | Personas | Swarm | Seeds | Cost max | LLM every N | Bootstrap |
|---|---|---|---|---|---|---|---|---|
| surface | 0 | 0 | 0 | 0 | 0 | $0 | — | 0 |
| standard | 0 | 0 | 0 | 0 | 0 | $0 | — | 0 |
| deep | 16 | 1,500 | 22 | 384 | 2 | $2.80 | 3 | 180 |
| strategic | 24 | 3,000 | 30 | 1,024 | 3 | $5.50 | 2 | 300 |

## Runtime config

Source : `lib/foresight/config.ts`

```ts
NOMOSX_FORESIGHT_ENABLED: true (default)
NOMOSX_FORESIGHT_MAX_COST_USD: 5.50
NOMOSX_FORESIGHT_CHAT_RATE_LIMIT: 10/min
NOMOSX_FORESIGHT_MIN_SEED_SOURCES: 8
```

## Archetypes de personas (9)

`regulator`, `industry`, `academic`, `ngo`, `media`, `public`, `investor`, `labor`, `state`

Source : `lib/agent/simulation-agent.ts:262-276`

---

# 8. Orchestration & Funnel de Publication

## Funnel de publication

```
TopicRadar → EditorialTriage → DispatchItem
                                    │
                                    ▼
                           runAndPublishInquiry()
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              VALIDATE          RUN PIPELINE          GATE
                    │               │               │
                    ▼               ▼               ▼
              question OK     16 steps +        Gate decision
              vertical OK     foresight?         Devil's verdict
              dedup check                       trust score
                    │               │               │
                    └───────────────┴───────────────┘
                                    │
                                    ▼
                              PERSIST
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            brief.create()  publication.create()  foresightRun.create()
```

## Publication Gate — Seuils

Source : `lib/agent/publication-gate.ts:55-64` + `lib/publication-visibility.ts`

| Métrique | Seuil (strategic) | Seuil (brief) |
|---|---|---|
| minTrustScore | 75 | 65 |
| minQualityScore | 75 | 75 |
| minCitationCoverage | 72% | 50% |
| minSourceCount | 12 | 5 |
| maxFatalChallenges | 0 | 0 |
| minDevilsAdvocateScore | 70 | 70 |
| maxUncitedClaimRatio | 35% | 35% |
| minWordCount | 1200 | 400 |

**Décisions** : `publish`, `revise`, `hold`

---

# 9. Providers — 100+ Sources

## Type `Providers` supportés (70+ IDs)

Source : `lib/agent/pipeline-v2.ts:214-264`

| Catégorie | IDs principaux |
|---|---|
| Academic core | openalex, crossref, semanticscholar, arxiv, hal, pubmed, base, thesesfr |
| Academic extended | core, europepmc, doaj, ssrn, repec, nber, who-gho, semantic-scholar-graph |
| Intelligence | odni, cia-foia, nsa, uk-jic |
| Défense | nato, eeas, sgdsn, eda |
| Économie | imf, worldbank, oecd, bis, ecb, eurostat, fred, eib, oecd-direct |
| Cyber | nist, cisa, enisa |
| Multilatéral | un, undp, unctad |
| Énergie/Nucléaire | iaea, irena, cea |
| Santé | ema, inserm, ecdc, cochrane, cdc, nih, who-direct |
| Environnement | inrae, ademe |
| Français | ens, insee, shift-project, data-gouv, france-strategie, cnrs, legifrance, vie-publique, iddri, terra-nova |
| Tech research | allen-ai, max-planck, eth-zurich, inria |
| Droit | eur-lex |
| Think tanks européens | ecfr, swp, sipri, iai |
| News real-time | gdelt-news, newsapi, mediastack, thenewsapi, gnews, eventregistry |
| Policy Labs | lawzero, govai, iaps, caip, aipi, cset, ainow, datasociety, abundance, caidp, scsp, ifp, cdt, brookings, fai, cnas, rand, newamerica, aspen-digital, rstreet |
| Archives | nara, uk-archives, archives-fr |
| Web search | linkup |

**⚠️ Remarque** : `ALL_PROVIDERS` (ligne 267+) contient des IDs obsolètes/inutilisés (`nature`, `science`, `mckinsey`, `bcg`, `google-patents`, etc.) qui ne sont pas dans le type `Providers`.

**Gestion de la santé** : `provider-health-tracker.ts` — circuit breaker in-memory, non persisté.

**Sélection intelligente** : `smart-provider-selector.ts` (history-aware + domain-based).

---

# 10. LLM Configuration

## Routage (`lib/llm/unified-llm.ts`)

| Provider | Principal | Rapide |
|---|---|---|
| DeepSeek | `deepseek-v4-pro` | `deepseek-v4-flash` |
| OpenAI | `gpt-4o` | `gpt-4o-mini` |
| Anthropic | `claude-sonnet-4-6` | `claude-haiku-4-5-20251001` |

**Fournisseur par défaut** : `env.PRIMARY_LLM_PROVIDER` ou `deepseek`

**Circuit breaker** : 3 failures → 1 min cooldown (in-memory, par process)

**Retry** : 3 retries avec exponential backoff + jitter

## Mapping tâche → modèle

| Tâche | Modèle par défaut | Notes |
|---|---|---|
| Query Enhancement | deepseek-v4-flash | 0.1 temp, 500 tokens |
| Reader V3 | deepseek-v4-pro | 0.1 temp, 2000 tokens |
| Analyst brief | deepseek-v4-pro | 0.2 temp, 4000 tokens |
| Strategic Analyst | deepseek-v4-pro | 0.2 temp, 16000 tokens |
| Harvard Council | deepseek-v4-pro | 0.15 temp, 3000 tokens |
| Devil's Advocate | deepseek-v4-pro | 0.2 temp, 4000 tokens |
| Auto-revision | deepseek-v4-pro | 0.2 temp, 12000 tokens |
| Editor-in-Chief | deepseek-v4-flash | 0.15 temp, 800 tokens |
| Editorial Planner | deepseek-v4-flash | 0.15 temp, 2000 tokens |
| Foresight personas | deepseek-v4-flash | 0.3 temp, 500 tokens |
| **StudioX** | **gpt-4o hardcodé** | ⚠️ P0 — ne passe pas par le routeur |

## ⚠️ P0 — StudioX hardcode gpt-4o

`app/api/studiox/route.ts:161` et `:193` utilisent `model: 'gpt-4o'` directement. Pas de fallback, pas de routing DeepSeek, pas de cache.

---

# 11. Frontend

## Pages en production

| Route | Fichier | Auth | Usage |
|---|---|---|---|
| `/` | `app/page.tsx` | Public | Homepage avec FeaturedVerdict, InquiryCards, PipelineStrip, PolicyNetwork, StudioPreview |
| `/archives` | `app/archives/page.tsx` | Public | Liste des publications |
| `/inquiry/[slug]` | `app/inquiry/[slug]/page.tsx` | Public | Détail + ForesightPanel + PersonaChat |
| `/researchers` | `app/researchers/page.tsx` | Public | Page des 22 chercheurs grecs |
| `/studio` | `app/studio/page.tsx` | **Auth** | Interface StudioX (pay-per-use) |
| `/pricing` | `app/pricing/page.tsx` | Public | Pricing 2 tiers (Reader / Studio) |
| `/about` | `app/about/page.tsx` | Public | À propos |
| `/methodology` | `app/methodology/page.tsx` | Public | Méthodologie |
| `/s/[id]` | `app/s/[id]/page.tsx` | Public | Short URL |

## Redirects

- `/articles` → `/archives`
- `/publications` → `/archives`

## Middleware (`middleware.ts`)

**Routes protégées** : `/dashboard`, `/studio`, `/council`, `/admin`, `/library`

**⚠️ Anomalie** : Seul `/studio` a une page réelle. Les autres sont des routes fantômes protégées mais inexistantes.

**Sécurité** : CSRF strict, CSP, HSTS, X-Frame-Options, Permissions-Policy.

---

# 12. API Routes — Audit Production vs Code Mort

## API Routes en production (confirmées actives)

| Route | Méthode | Caller | Usage |
|---|---|---|---|
| `/api/public/briefs` | GET | Frontend archives | Archives paginées |
| `/api/public/publications/[id]` | GET | Frontend inquiry | Détail publication |
| `/api/public/stats` | GET | Homepage | Stats publiques |
| `/api/articles/[id]` | GET | Legacy | Article détail |
| `/api/inquiry/[id]/foresight` | GET | ForesightPanel | Bundle foresight |
| `/api/studiox` | POST | `app/studio/page.tsx` | Studio chat (LLM simple) |
| `/api/studiox/checkout` | POST | `app/studio/page.tsx` | Stripe checkout |
| `/api/studiox/order/[id]` | GET | `app/studio/page.tsx` | Statut commande |
| `/api/foresight/chat` | POST | PersonaChat | Chat persona |
| `/api/auth/*` | POST/GET | AuthModal | Auth JWT |
| `/api/newsletter/*` | POST | Footer | Newsletter subscribe |
| `/api/stripe` | POST | Stripe webhook | Webhook Stripe |
| `/api/health` | GET | Monitoring | Health check |
| `/api/cron/auto-scan` | POST | Cron Netlify | Breaking cycle |
| `/api/cron/generate-briefs` | POST | Cron Netlify | Weekly cycle |
| `/api/cron/editorial-plan` | POST | Cron Netlify | Plan éditorial |
| `/api/cron/*` | POST | Crons divers | Self-improve, macro-refresh, cadence-reset, newsletter |

## API Routes — CODE MORT (à supprimer ou vérifier)

| Route | Pourquoi morte |
|---|---|
| `/api/v3/analysis` | Ancien pipeline, aucun caller |
| `/api/studio/analyze` | Ancien Studio subscription, remplacé par `/api/studiox` |
| `/api/demo/generate` | Demo, aucun caller |
| `/api/chat/stream` | Chat streaming, aucun caller |
| `/api/runs` | Admin ingestion, aucun caller |
| `/api/ingestion` | Aucun caller |
| `/api/pipeline-runs` | Aucun caller |
| `/api/domains` | Aucun caller |
| `/api/editorial-gate/*` | Géré en interne par le pipeline |
| `/api/digests/*` | Aucun caller |
| `/api/topics/*` | Aucun caller |
| `/api/knowledge/*` | Géré en interne |
| `/api/formats/*` | Aucun caller |
| `/api/stats` | Remplacé par `/api/public/stats` |
| `/api/system` | Aucun caller |
| `/api/contact` | Aucun caller |
| `/api/user/*` | Aucun caller |
| `/api/admin/*` | Aucun caller |
| `/api/ready` | Aucun caller |
| `/api/test/pipeline` | Test only |
| `/api/subscription/*` | Ancien subscription model, obsolète |
| `/api/cron/trial-reminders` | Obsolète si plus de trial |
| `/api/webhooks/*` | Fusionné avec `/api/stripe` |
| `/api/search` | À vérifier |

---

# 13. Infrastructure & Déploiement

## Netlify (`netlify.toml`)

- Build command : `npm run build`
- Publish directory : `.next`
- Node version : 22.13.0
- Framework : Next.js

## Variables d'environnement critiques

- `DATABASE_URL` — PostgreSQL
- `JWT_SECRET` — Auth
- `ADMIN_KEY`, `CRON_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `REDIS_URL`
- `SENTRY_DSN`
- `NOMOSX_FORESIGHT_ENABLED`, `NOMOSX_FORESIGHT_MAX_COST_USD`
- `NOMOSX_WEEKLY_PUBLICATION_MAX`

## Schema Prisma — tables clés

Source : `prisma/schema.prisma`

| Table | Usage |
|---|---|
| `Brief` | HTML généré, sources, lineage |
| `ThinkTankPublication` | Publication publique avec status |
| `Source` | Sources académiques/institutionnelles |
| `Author`, `Institution` | Enrichissement |
| `SourceAuthor`, `SourceInstitution` | Liens |
| `User`, `Subscription` | Auth et ancien modèle subscription |
| `StudioXOrder` | Commandes pay-per-use |
| `PipelineRun` | Traces d'exécution pipeline |
| `Signal` | Signaux détectés |
| `Vertical` | Verticales éditoriales |
| `ForesightRun` | Simulations swarm |
| `Concept`, `ConceptRelation` | Knowledge graph |
| `AgentMemory`, `AgentLesson` | Apprentissage auto |
| `NewsletterSubscriber` | Newsletter |
| `Claim`, `EvidenceSpan`, `SourceChunk` | Audit claim-level |

---

# 14. Bilan d'Audit Objectif

## 14.1 Forces du système

1. **Pipeline sophistiqué** : 16 steps avec checks adversarial, fact-checking, citation guard — rarement vu dans un produit agentic.
2. **Architecture modulaire** : Chaque agent est isolé, lazy-loadé, avec gestion d'erreurs non-bloquante.
3. **Diversité des sources** : 100+ providers académiques, institutionnels, news.
4. **Mémoire d'apprentissage** : AgentMemory enregistre les performances et extrait des leçons.
5. **Foresight Engine** : Swarm 1 024 agents + Monte Carlo 3 000 runs + GraphRAG — différenciant fort.
6. **Branding cohérent** : Greek Protocol, chercheurs grecs, DA sombre (Palantir-like).
7. **Pay-per-use bien défini** : StudioX pricing clair (€9–€299).
8. **Sécurité** : CSP, CSRF, HSTS, rate limiting.

## 14.2 Faiblesses critiques (P0)

| # | Problème | Impact | Fichier | Preuve |
|---|---|---|---|---|
| 1 | **StudioX ne lance pas le pipeline 16 steps** — fait un simple appel LLM. | Écart produit/technique majeur. Les utilisateurs payant €149/€299 n'obtiennent pas ce qu'ils achètent. | `app/api/studiox/route.ts:161` | `model: 'gpt-4o'` + `streamLLM()` sans scout/rank/analyst |
| 2 | **StudioX hardcode `gpt-4o`** — pas de fallback, pas de routing unifié. | Coût élevé, dépendance OpenAI, pas de cohérence LLM. | `app/api/studiox/route.ts:161` | Pas d'appel à `callLLM()` |
| 3 | **DOSSIER format non implémenté** — fallback vers strategic. | Format à €299 non livré. | `lib/agent/pipeline-v2.ts:2342` | Console warn explicite |
| 4 | **Routes fantômes protégées** — `/dashboard`, `/council`, `/admin`, `/library` sans pages. | UX 404, confusion. | `middleware.ts:47` | Seul `/studio` existe dans `app/` |

## 14.3 Faiblesses importantes (P1)

| # | Problème | Impact | Fichier |
|---|---|---|---|
| 5 | **Code mort massif** — ~20 API routes, `StudioX.tsx` component, plans Stripe legacy. | Dette technique, build plus lent, confusion. | `app/api/*`, `lib/stripe.ts` |
| 6 | **Circuit breaker provider en mémoire** — pas persisté. | En multi-instance, l'état n'est pas partagé. | `lib/agent/provider-health-tracker.ts` |
| 7 | **Agent Memory calibration** — needs ≥3 runs, no domain-specific defaults. | Nouveaux domaines utilisent thresholds statiques. | `lib/agent/orchestrator.ts:106-119` |
| 8 | **Cache invalidation** — `invalidateScoutCache()` exists mais jamais appelée automatiquement. | Risque de données obsolètes. | `lib/agent/pipeline-v2.ts:67-85` |
| 9 | **Progression pipeline non streamée** — `emitProgress()` existe mais pas d'endpoint SSE pour Studio. | UX StudioX sans feedback temps réel. | `lib/agent/pipeline-progress.ts` |
| 10 | **Cohere reranking single point of failure** — si Cohere tombe, perte de qualité. | Pas de fallback embedding-based. | `lib/agent/cohere-reranker.ts` |
| 11 | **Foresight uniquement deep/strategic** — standard n'a pas de simulation légère. | Manque d'upsell naturel. | `lib/agent/inquiry-pipeline.ts:152` |
| 12 | **Trust score dépend du Critical Loop** — si le loop échoue, trust = null. | Le gate peut passer des publications faibles. | `lib/agent/pipeline-v2.ts:1953` |
| 13 | **Provider health tracker non persisté** | En multi-instance Netlify, circuit breaker inefficace. | `lib/agent/provider-health-tracker.ts` |

## 14.4 Risques business (P2)

| # | Risque | Explication |
|---|---|---|
| 14 | **Modèle subscription legacy encore présent** | Confond les utilisateurs et la maintenance. Routes `/api/subscription/*`, `STRIPE_PLANS` |
| 15 | **Pas de dashboard user** | `/dashboard` protégé mais inexistant. Manque d'expérience post-purchase. |
| 16 | **Pas de page `/council`** | Route protégée inexistante. Promesse produit non tenue. |
| 17 | **SEO** | Open Graph / JSON-LD à vérifier sur `/inquiry/[slug]` et `/s/[id]`. |

---

# 15. Recommandations par Rôle

## AI Engineer — Actions prioritaires

1. **P0 : Connecter StudioX au vrai pipeline**
   - Remplacer l'appel direct LLM dans `/api/studiox` par `runAndPublishInquiry()` ou `runPipeline()`.
   - Retourner l'ID de commande + le statut de progression.
   - Exemple de flow :
   ```
   /api/studiox/checkout → création order PENDING
   /api/studiox/run    → POST { orderId, question, formatType } → lance runAndPublishInquiry()
   /api/studiox/order/[id] → polling du statut (RUNNING → COMPLETED/FAILED)
   ```

2. **P0 : Utiliser le LLM unifié dans StudioX**
   - Remplacer `model: 'gpt-4o'` par `callLLM()` avec sélection DeepSeek par défaut.
   - Supprimer `streamLLM` direct si non nécessaire, ou l'ajouter au routeur unifié.

3. **P1 : Implement DOSSIER format**
   - Soit créer un vrai renderer 30-50 pages avec appendices,
   - Soit retirer le format de la grille de prix et du Studio.

4. **P1 : Persist provider health**
   - Migrer le circuit breaker de mémoire vers Redis ou DB.

5. **P1 : Fallback Cohere reranking**
   - Implémenter un fallback par embedding cosine similarity si Cohere échoue.

6. **P2 : SSE pipeline progress**
   - Ajouter `/api/pipeline/[id]/stream` pour le frontend Studio.

## CTO — Actions prioritaires

1. **P0 : Supprimer les routes fantômes du middleware**
   - Soit créer `/dashboard`, `/council`, `/admin`, `/library`.
   - Soit retirer ces routes de `middleware.ts`.

2. **P1 : Nettoyer le code mort**
   - Supprimer les ~20 API routes mortes listées en section 12.
   - Supprimer `components/StudioX.tsx` si non utilisé.
   - Supprimer `cron-trial-reminders` si trial obsolète.

3. **P1 : Nettoyer Stripe legacy**
   - Retirer `STRIPE_PLANS` legacy, garder uniquement le webhook `studiox_order`.
   - Supprimer `/api/subscription/*`.
   - Nettoyer le modèle `Subscription` si non utilisé.

4. **P1 : Database indexes**
   - Vérifier les indexes sur `ThinkTankPublication(status, publishedAt)` et `Signal(status, priorityScore, detectedAt)`.

5. **P2 : Dédupliquer les types de formats**
   - `EXECUTIVE_BRIEF` et `RESEARCH_BRIEF` sont tous deux à €49 et 4-6 pages. Fusionner ou différencier.

## CPO — Actions prioritaires

1. **P0 : Aligner l'offre StudioX avec la technique**
   - Si on vend un pipeline €149/€299, il faut le livrer. Sinon, ajuster le pricing/messaging.

2. **P1 : Créer le dashboard user**
   - Historique des commandes, publications suivies, crédits/restants.
   - URL `/dashboard` promise dans `middleware.ts` et `pricing/page.tsx:151`.

3. **P1 : Clarifier la différence Reader vs StudioX**
   - Reader = publications auto-générées (gratuites).
   - StudioX = commandes custom (payantes) avec pipeline complet.

4. **P2 : Ajouter un format "Simulation seule"**
   - Foresight est un différenciant. Proposer un format à ~€29 pour swarm simulation seule.

## CMO — Actions prioritaires

1. **P1 : SEO rich snippets**
   - Ajouter JSON-LD sur `/inquiry/[slug]` pour les articles de recherche.

2. **P1 : Open Graph**
   - Vérifier les meta tags sociaux pour `/s/[id]` et `/inquiry/[slug]`.

3. **P2 : Newsletter automation**
   - S'assurer que le cron newsletter pioche les publications de la semaine.

## CEO — Actions stratégiques

1. **P0 : Décider du sort de StudioX**
   - Soit on investit pour qu'il utilise le vrai pipeline (différenciant fort, justifie €149+).
   - Soit on le positionne comme "chat premium" (moins de valeur, prix à revoir).

2. **P1 : Métriques de product-market fit**
   - Ajouter le tracking de conversion Reader → StudioX, taux de republication, coût moyen par publication.

3. **P2 : API externe B2B**
   - Le code a une structure API riche. Considérer une API publique pour institutions.

---

# 16. Schéma de Décision : Que corriger en premier ?

```
                            ┌──────────────────┐
                            │  Démarrer audit  │
                            └────────┬─────────┘
                                     │
                                     ▼
              ┌────────────────────────────────────┐
              │  StudioX vend-il le vrai pipeline ?│
              │  (P0 #1)                           │
              └────────┬─────────────┬─────────────┘
                       │ OUI           │ NON
                       ▼               ▼
              ┌──────────────┐  ┌────────────────────┐
              │ Vérifier LLM   │  │ Connecter StudioX  │
              │ unifié (P0 #2) │  │ au pipeline 16 steps│
              └────────┬───────┘  └────────┬───────────┘
                       │                     │
                       ▼                     ▼
              ┌──────────────┐      ┌──────────────┐
              │  Supprimer    │      │ Implementer  │
              │  routes fantômes│      │  DOSSIER     │
              │  (P0 #4)      │      │  (P1 #3)     │
              └────────┬───────┘      └──────┬───────┘
                       │                     │
                       ▼                     ▼
              ┌──────────────────────────────┐
              │  Nettoyer code mort (P1 #5)  │
              │  + Stripe legacy (P1 #6)     │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  Améliorations P2 (SSE,     │
              │  calibration, fallback)      │
              └──────────────────────────────┘
```

---

# 17. Métriques Clés à Suivre

| Métrique | Où | Objectif |
|---|---|---|
| Coût moyen par publication | `PipelineRun.totalCostUsd` | <$3 brief, <$8 strategic |
| Taux de publication vs hold | `ThinkTankPublication.status` | >60% publish |
| Citation coverage | `citationGuard` + `verifyCitations` | >72% |
| Fact-check integrity | `factChecker` | >85% |
| Source diversity | `orchState.providerDiversity` | ≥3 providers |
| Trust score | `stats.criticalLoop.finalScore` | >65 brief, >70 strategic |
| Conversion Reader → StudioX | Analytics | À définir |
| Temps de pipeline | `PipelineRun.durationMs` | <10 min brief, <15 min strategic |
| Nombre de citations invalides | `citationGuard.invalid` | 0 |
| Fatal challenges | `devilsAdvocate.fatalChallenges` | 0 |

---

# 18. Glossaire

| Terme | Définition |
|---|---|
| **Doxa** | Croyance brute / intuition initiale (TopicRadar) |
| **Elenchus** | Test adversarial (Devil's Advocate) |
| **Logos** | Synthèse raisonnée (Harvard Council / Analyst) |
| **Nomos** | Décision institutionnelle (Publication Gate) |
| **Foresight** | Simulation multi-agent du futur |
| **Swarm** | Essaim de 384-1024 agents numériques |
| **CEBM** | Centre for Evidence-Based Medicine levels |
| **GRADE** | Grading of Recommendations Assessment, Development and Evaluation |
| **ORCID** | Open Researcher and Contributor ID |
| **ROR** | Research Organization Registry |
| **pgvector** | Extension PostgreSQL pour vecteurs |
| **SSE** | Server-Sent Events (streaming) |

---

# Annexe : Fichiers critiques à vérifier régulièrement

- `lib/agent/pipeline-v2.ts` — core pipeline
- `lib/agent/inquiry-orchestrator.ts` — publication funnel
- `lib/agent/think-tank-dispatcher.ts` — autonomous brain
- `lib/agent/topic-radar.ts` — signal detection
- `lib/agent/publication-gate.ts` — quality gate
- `lib/agent/orchestrator.ts` — adaptive thresholds
- `lib/researchers.ts` — expert profiles
- `lib/publication-formats.ts` — format catalog
- `lib/studiox-pricing.ts` — pricing
- `app/api/studiox/route.ts` — StudioX API (P0 issue)
- `app/studio/page.tsx` — Studio UI (P0 issue)
- `middleware.ts` — route protection
- `prisma/schema.prisma` — data model

---

*Document final — Audit objectif et complet du système NomosX, corrigé avec les noms de chercheurs grecs, les formats réels, les schémas d'architecture, et un bilan critique par rôle.*
