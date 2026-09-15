# NomosX — Audit Système Complet V2
## Document de référence pour IA (Claude/GPT) — CTO, CPO, CEO, CMO, AI Engineer

> **Objectif** : Bilan objectif et complet de l'architecture NomosX pour permettre à toute IA de comprendre, corriger ou améliorer le système.
> **Méthodologie** : Analyse directe du code source (Next.js + Prisma + agents). Fichiers clés lus : `lib/researchers.ts`, `lib/publication-formats.ts`, `lib/agent/pipeline-v2.ts`, `lib/agent/think-tank-dispatcher.ts`, `lib/agent/orchestrator.ts`, `lib/agent/editorial-planner.ts`, `lib/studiox-pricing.ts`, `lib/stripe.ts`, `app/page.tsx`, `components/brand/GreekProtocol.tsx`.
> **Dernière mise à jour** : 25 juin 2026

---

# Executive Summary

## Ce qu'est NomosX

NomosX est un **think tank agentic** entièrement autonome. Il détecte les signaux émergents, rassemble des sources académiques et institutionnelles, les analyse avec un conseil de 22 chercheurs virtuels (noms grecs), simule le futur via un swarm de 1 024 agents, et publie des briefs professionnels en HTML.

## Architecture en 3 couches

```
┌─────────────────────────────────────────────────────────────────────┐
│  COUCHE 1 : CERVEAU AUTONOME (Think Tank Dispatcher)                 │
│  SENSE → DECIDE → DISPATCH → PUBLISH                                │
│  Cron 2×/jour (breaking) + 2×/semaine (weekly)                      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│  COUCHE 2 : ORCHESTRATION PUBLICATION (Inquiry Orchestrator)          │
│  VALIDATE → RUN PIPELINE → GATE → PERSIST                             │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│  COUCHE 3 : PIPELINE V2 (16 steps) + FORESIGHT ENGINE                 │
│  SCOUT → INDEX → EMBED → DEDUP → RANK → DOMAIN → READER → ANALYST   │
│  → STRUCTURAL EDITOR → HARVARD COUNCIL → PhD DELIBERATION → EDITOR  │
│  → GUARD → VERIFIER → FACT-CHECKER → CRITICAL LOOP → DEBATE/META    │
│  → DEVIL'S ADVOCATE → PUBLISHER → KNOWLEDGE GRAPH                     │
│  + Foresight Swarm (optionnel, deep/strategic)                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Product mix (réel)

| Offre | Modèle | Prix | Déclencheur |
|---|---|---|---|
| **Reader** | Gratuit | Free | Publications auto-générées par le think tank |
| **StudioX** | Pay-per-use | €9 – €299 | Utilisateur commande une analyse custom |

**⚠️ Point critique** : StudioX actuel (`/api/studiox`) ne déclenche **pas** le pipeline 16 steps. Il fait un simple appel LLM. C'est un écart produit/technique majeur.

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

Le système s'articule autour du **Socratic Protocol** (`components/brand/GreekProtocol.tsx`) :

```
Doxa      → Elenchus      → Logos        → Nomos
(raw      (adversarial    (reasoned    (institutional
 belief)   test)           synthesis)   decision)
```

Cela se reflète dans les noms des chercheurs (grecs) et dans la structure du pipeline : Doxa = TopicRadar, Elenchus = Devil's Advocate, Logos = Harvard Council, Nomos = Publication Gate.

---

# 2. Business Model Audit

## Pricing en production

| Format | Prix | Pages | Sources | Profondeur |
|---|---|---|---|---|
| SUMMARY_BRIEF | €9 | 1-2 | 5+ | surface |
| UPDATE_NOTE | €9 | 1-2 | 3+ | surface |
| DATA_NOTE | €19 | 2-3 | dataset-led | standard |
| POLICY_NOTE | €29 | 3-5 | 8+ | standard |
| RESEARCH_BRIEF | €49 | 4-6 | 10+ | standard |
| EXECUTIVE_BRIEF | €49 | 4-6 | 10+ | deep |
| STRATEGIC_REPORT | €149 | 10-15 | 20+ | strategic |
| DOSSIER | €299 | 30-50 | 50+ | strategic |

Source : `lib/studiox-pricing.ts` (15 lignes).

## ⚠️ Incohérence business model

`lib/stripe.ts` contient encore 4 plans legacy de subscription :
- `TRIAL` (Free)
- `ANALYST`
- `RESEARCHER` (€19/mo)
- `STUDIO` (€49/mo)

**Analyse** : Le product mix est passé au **pay-per-use** (Reader + StudioX), mais le code Stripe n'a pas été nettoyé. Cela crée des risques de webhook, de routes mortes, et de confusion.

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
| Cache | Redis | `lib/agent/redis-simple.ts` |
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

```
runThinkTankCycle({ mode: "breaking" | "weekly" })
  ├─ breaking: collectBreakingItems()
  │     ├─ runTopicRadar()         [6 sweeps]
  │     ├─ editorialTriage()         [LLM triage]
  │     └─ breakingDecisionToItem() → dispatch
  │
  └─ weekly: collectWeeklyItems()
        ├─ planEditorialAgenda()   [auto-commission]
        └─ signal fallback         [DB signals]
```

## Couche 2 : Inquiry Orchestrator

```
runAndPublishInquiry(item)
  ├─ VALIDATE
  │     ├─ check question length
  │     ├─ resolve vertical + capacity
  │     └─ deduplication check
  │
  ├─ RUN
  │     ├─ runInquiryPipeline()
  │     ├─ maybeRunSimulation()    [if deep/strategic]
  │     └─ build Inquiry object
  │
  ├─ GATE
  │     ├─ evaluatePublicationGate()
  │     ├─ assessReadiness()
  │     └─ researcher sign-off (if required)
  │
  └─ PERSIST
        ├─ thinkTankPublication.create()
        ├─ brief link
        └─ foresight run link
```

## Couche 3 : Pipeline V2 — 16 steps

```
┌────────────────────────────────────────────────────────────────────┐
│ 0. CONTEXT PRIMER                                                 │
│    └─ primeContext() : mémoire institutionnelle + tendances       │
├────────────────────────────────────────────────────────────────────┤
│ 1. SCOUT                                                           │
│    ├─ Query enhancement (LLM)                                     │
│    ├─ 100+ providers en parallèle                                 │
│    ├─ Cache Redis (24h)                                           │
│    ├─ Deduplication + Unpaywall                                   │
│    └─ Upsert batch DB                                             │
├────────────────────────────────────────────────────────────────────┤
│ 2. INDEX            │ 3. EMBED            │ 4. DEDUPLICATE        │
│ 5. RANK             │ 6. DOMAIN CLASS     │                       │
│ 7. READER V3        │ 8. ANALYST          │ 9. STRUCTURAL EDITOR  │
│ 10. HARVARD COUNCIL │ 11. PhD DELIBERATION│                       │
│ 12. CITATION GUARD  │ 13. EDITOR          │ 14. VERIFIER + FACT   │
│ 15. CRITICAL LOOP   │ 16. DEVIL'S ADVOCATE│ 17. PUBLISHER + KG    │
│   + DEBATE/META (parallel)                                        │
└────────────────────────────────────────────────────────────────────┘
```

---

# 4. Agent Catalog — Specs Complètes

## 4.1 SCOUT

| | Valeur |
|---|---|
| Fichier | `lib/agent/pipeline-v2.ts` |
| Rôle | Collecte de sources |
| Providers | 100+ |
| Cache | Redis 24h |
| Output | `{ found, upserted, sourceIds, cached }` |
| Coût | ~$0.01–$0.10 par run |

**Détail du flow** :
1. Query enhancement → variations de requête
2. `Promise.allSettled` sur providers (news + academic + institutional)
3. Deduplication DOI + titre normalisé
4. Filtre de pertinence (0.15 threshold)
5. Cohere reranking (top 100)
6. Enrichissement Unpaywall
7. Upsert batch (20/batch)

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
| Rôle | Sélection diverse et pertinente des sources |
| Default limit | 12 |
| Scoring | quality×0.4 + novelty×0.4 + recency×0.1 + diversity×0.1 |
| Controls | maxPerProvider=4, maxPerYear=3, minProviderDiversity=3 |
| Garantie | sources françaises (hal, thesesfr) |

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
| PDF | activé (enablePdf: true) |
| Concurrency | 5 (strategic) |

## 4.5 ANALYST

### Mode brief : `analyst-multipass.ts`
- 3 passes : thematic → contradictions → synthesis
- Output : title, summary, consensus, disagreements, debate, evidence, implications, risks, open_questions, what_changes_mind

### Mode strategic : `strategic-analyst-agent.ts`
- 10 sections, 16K tokens output
- Executive summary, literature review, thematic analysis, debate, evidence, stakeholder matrix, scenarios, recommendations, roadmap, conclusion

## 4.6 HARVARD COUNCIL

### Enhanced (strategic) : `harvard-council-enhanced.ts`
- 22 PhD researchers (noms grecs)
- Sélection intelligente par domaine
- Hierarchical : domain leads → interdisciplinary synthesis
- CEBM + GRADE
- Recommandations : immediate, short-term, long-term, research

### Legacy (brief) : `review-board.ts`
- 9 experts + peer reviews
- CEBM evidence grading

## 4.7 DEVIL'S ADVOCATE

| | Valeur |
|---|---|
| Fichier | `lib/agent/devils-advocate.ts` |
| Rôle | Porte épistémique finale |
| Output | verdict, overallStrength, publishabilityScore, fatalChallenges, majorChallenges, vsInstitutionBenchmark |
| Auto-revision | Oui si fatalChallenges > 0 |
| Benchmark | McKinsey, Brookings, RAND, France Stratégie |

## 4.8 ORCHESTRATOR

| | Valeur |
|---|---|
| Fichier | `lib/agent/orchestrator.ts` |
| Rôle | Contrôleur adaptatif du pipeline |
| Actions | PROCEED, RE_SCOUT, DEEPEN, RE_ANALYZE, DEBATE, PIVOT, ABORT |
| Checkpoints | AfterScout, AfterReader, AfterAnalyst, AfterCriticalLoop |

---

# 5. Les 22 Chercheurs — Noms Grecs (Source réelle)

**Fichier** : `lib/researchers.ts` (1072 lignes)

## CORE — 9 chercheurs (Tier 1)

| ID | Nom grec | Transcription | Titre | Institution | Domaine |
|---|---|---|---|---|---|
| economics | **Οἰκονομία** | Dr. Oikonomia | Senior Economist | Harvard Kennedy School | Economics |
| technology | **Τέχνη** | Dr. Techne | Computer Scientist | Stanford / DeepMind | Technology |
| policy | **Πολιτεία** | Dr. Politeia | Political Scientist | Oxford / Brookings | Policy |
| health | **Ὑγίεια** | Dr. Hygeia | Epidemiologist | Johns Hopkins / WHO | Health |
| security | **Αἰγίς** | Dr. Aegis | Security Analyst | Georgetown / RAND | Security |
| law | **Νόμος** | Dr. Nomos | Legal Scholar | Yale Law / ICJ | Law |
| environment | **Γαία** | Dr. Gaia | Climate Scientist | ETH Zurich / IPCC | Environment |
| quantitative | **Μέτρον** | Dr. Metron | Statistician | MIT / Nature Methods | Quantitative |
| finance | **Χρηματιστικός** | Dr. Chrematistikos | Financial Economist | LSE / BlackRock | Finance & Markets |

## ADVANCED — 6 chercheurs (Tier 2)

| ID | Nom grec | Transcription | Titre | Institution | Domaine |
|---|---|---|---|---|---|
| social-sciences | **Κοινωνία** | Dr. Koinonia | Sociologist | UC Berkeley / Institute for Social Research | Social Sciences |
| humanities | **Λόγος** | Dr. Logos | Philosopher | Sorbonne / Collège de France | Humanities |
| energy-advanced | **Ἐνέργεια** | Dr. Energeia | Energy Engineer | Imperial College / IRENA | Energy Systems |
| geopolitics | **Πόλις** | Dr. Polis | International Relations Expert | Geneva Graduate Institute / UN | Geopolitics |
| cognitive-science | **Νόησις** | Dr. Noesis | Cognitive Neuroscientist | UCL / Max Planck | Cognitive Science |
| digital-society | **Δίγι** | Dr. Digi | Digital Sociologist | MIT Media Lab / Oxford Internet Institute | Digital Society |

## SPECIALIZED — 7 chercheurs (Tier 3)

| ID | Nom grec | Transcription | Titre | Institution | Domaine |
|---|---|---|---|---|---|
| behavioral-economics | **Θυμός** | Dr. Thymos | Behavioral Economist | University of Chicago / NBER | Behavioral Economics |
| urban-studies | **Ἄστυ** | Dr. Asty | Urban Planner | MIT / Lincoln Institute | Urban Studies |
| development-economics | **Αὔξησις** | Dr. Auxesis | Development Economist | World Bank / Princeton | Development Economics |
| computational-social-science | **Σύνταξις** | Dr. Syntaxis | Computational Social Scientist | Carnegie Mellon / Santa Fe Institute | Computational Social Science |
| bioethics | **Βίος** | Dr. Bios | Bioethicist | Johns Hopkins / Hastings Center | Bioethics |
| complexity-science | **Χάος** | Dr. Chaos | Complexity Scientist | Santa Fe Institute / Oxford | Complexity Science |
| risk-analysis | **Κύβερνον** | Dr. Kyvernon | Risk Analyst | Wharton / Federal Reserve | Risk Analysis |

**Total** : 9 + 6 + 7 = **22 chercheurs**

**Utilisation** : Les chercheurs servent à la fois :
- Dans le pipeline (Harvard Council) pour générer des avis experts
- Dans le frontend (page `/researchers`) pour présenter l'équipe
- Dans le Topic Radar (`getTopicRadarQueries()`) pour orienter les recherches académiques
- Dans la sélection de providers (`getDataSourcesForDomain()`)

## ⚠️ Obsolète

`getResearchersByTier(tier)` est encore basée sur un ancien modèle de subscription (`standard`/`premium`/`strategic`/`enterprise`). À nettoyer car le modèle est maintenant pay-per-use.

---

# 6. Formats de Publication (réels)

**Fichier** : `lib/publication-formats.ts`

| Type | Label | Family | Pages | Source Depth | Description |
|---|---|---|---|---|---|
| SUMMARY_BRIEF | Signal Brief | **signals** | 1-2 | 5+ | Fast synthesis of a verified weak signal |
| UPDATE_NOTE | Update Note | **signals** | 1-2 | 3+ | Change log when new evidence modifies a position |
| DATA_NOTE | Data Note | **data** | 2-3 | dataset-led | Quantitative readout centered on datasets |
| POLICY_NOTE | Policy Memo | **memos** | 3-5 | 8+ | Options, trade-offs, recommendation, risks |
| RESEARCH_BRIEF | Research Brief | **briefs** | 4-6 | 10+ | Decision-ready synthesis with consensus |
| EXECUTIVE_BRIEF | Decision Brief | **briefs** | 4-6 | 10+ | Legacy executive briefs under new label |
| STRATEGIC_REPORT | Strategic Report | **reports** | 10-15 | 20+ | Deep analysis with scenarios, roadmap |
| DOSSIER | Research Dossier | **dossiers** | 30-50 | 50+ | Appendix-heavy evidence file |

**Access** : `Open` pour tous les formats (côté code). En pratique : gratuits quand publiés par les crons, payants quand commandés via StudioX.

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

| Depth | Ticks | MC Runs | Personas | Swarm | Seeds | Cost max | LLM every N | Bootstrap |
|---|---|---|---|---|---|---|---|---|
| surface | 0 | 0 | 0 | 0 | 0 | $0 | — | 0 |
| standard | 0 | 0 | 0 | 0 | 0 | $0 | — | 0 |
| deep | 16 | 1,500 | 22 | 384 | 2 | $2.80 | 3 | 180 |
| strategic | 24 | 3,000 | 30 | 1,024 | 3 | $5.50 | 2 | 300 |

## Archetypes de personas (9)

`regulator`, `industry`, `academic`, `ngo`, `media`, `public`, `investor`, `labor`, `state`

---

# 8. Orchestration & Funnel de Publication

## Calendrier des crons (UTC)

| Heure | Cron | Fonction |
|---|---|---|
| 00:00 | cadence-reset | Reset daily counters |
| 03:00 | self-improve | Agent memory learning |
| 05:00 | macro-refresh | Macro data refresh |
| 06:00 | auto-scan | Breaking detection (matin) |
| 08:00 (Lundi) | newsletter | Send newsletter |
| 12:00 (Mercredi) | generate-briefs-midweek | Weekly midweek |
| 18:00 | auto-scan | Breaking detection (soir) |
| 20:00 (Dimanche) | editorial-plan | Plan weekly agenda |
| 22:00 (Dimanche) | generate-briefs | Weekly brief generation |

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

| Métrique | Seuil (strategic) | Seuil (brief) |
|---|---|---|
| minTrustScore | 75 | 65 |
| minQualityScore | 75 | 75 |
| minCitationCoverage | 72% | 50% |
| minSourceCount | 12 | 5 |
| maxFatalChallenges | 0 | 0 |
| minDevilsAdvocateScore | 70 | 70 |
| maxUncitedClaimRatio | 35% | 35% |

**Décisions** : `publish`, `revise`, `hold`

---

# 9. Providers — 100+ Sources

## Catégories

| Catégorie | Nombre approximatif | Exemples |
|---|---|---|
| Academic Core | 12 | openalex, crossref, semanticscholar, pubmed, arxiv, hal, core, europepmc, doaj, ssrn, repec, nber |
| News & Real-time | 6 | gdelt-news, newsapi, mediastack, thenewsapi, gnews, eventregistry |
| Think Tanks & Policy Labs | 20+ | brookings, rand, cset, ainow, cset, caidp, scsp, ifp, cdt, cnas, newamerica, aspen-digital, rstreet, lawzero, govai, iaps, caip, aipi, fai, abundance |
| Institutional — Economy | 8 | imf, worldbank, oecd, bis, ecb, eurostat, fred, eib |
| Institutional — Defense/Security | 8 | nato, eeas, sgdsn, eda, odni, cia-foia, nsa, uk-jic |
| Institutional — Multilateral | 6 | un, undp, unctad, wto, ilo, who |
| Institutional — Health | 7 | who, cdc, nih, ema, inserm, ecdc, cochrane |
| Institutional — French | 8 | ens, insee, shift-project, data-gouv, france-strategie, cnrs, legifrance, vie-publique |
| Institutional — Environment/Energy | 5 | iaea, irena, cea, inrae, ademe |
| Institutional — Tech Research | 5 | allen-ai, max-planck, eth-zurich, inria, cern |
| Archives | 3 | nara, uk-archives, archives-fr |
| Web Search | 1 | linkup |

**Gestion de la santé des providers** : `provider-health-tracker.ts` (circuit breaker in-memory, non persisté).

**Sélection intelligente** : `smart-provider-selector.ts` (history-aware + domain-based).

---

# 10. LLM Configuration

## Routage (`lib/llm/unified-llm.ts`)

| Provider | Principal | Rapide |
|---|---|---|
| DeepSeek | deepseek-v4-pro | deepseek-v4-flash |
| OpenAI | gpt-4o | gpt-4o-mini |
| Anthropic | claude-sonnet-4-6 | claude-haiku-4-5 |

## Mapping tâche → modèle

| Tâche | Modèle | Temp | Max tokens |
|---|---|---|---|
| Query Enhancement | deepseek-v4-flash | 0.1 | 500 |
| Reader V3 | deepseek-v4-pro | 0.1 | 2000 |
| Analyst brief | deepseek-v4-pro | 0.2 | 4000 |
| Strategic Analyst | deepseek-v4-pro | 0.2 | 16000 |
| Harvard Council | deepseek-v4-pro | 0.15 | 3000 |
| Devil's Advocate | deepseek-v4-pro | 0.2 | 4000 |
| Auto-revision | deepseek-v4-pro | 0.2 | 12000 |
| Editor-in-Chief | deepseek-v4-flash | 0.15 | 800 |
| Editorial Planner | deepseek-v4-flash | 0.15 | 2000 |
| Foresight personas | deepseek-v4-flash | 0.3 | 500 |
| StudioX | **gpt-4o** (hardcodé) | 0.3 | 4000 |

## ⚠️ P0 — StudioX hardcode gpt-4o

`app/api/studiox/route.ts` utilise `model: 'gpt-4o'` directement. Il ne passe pas par le routeur unifié. Cela empêche le fallback DeepSeek et augmente les coûts.

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
| `/pricing` | `app/pricing/page.tsx` | Public | Pricing 2 tiers |
| `/about` | `app/about/page.tsx` | Public | À propos |
| `/methodology` | `app/methodology/page.tsx` | Public | Méthodologie |
| `/privacy`, `/terms` | — | Public | Légal |
| `/s/[id]` | `app/s/[id]/page.tsx` | Public | Short URL |

## Redirects

- `/articles` → `/archives`
- `/publications` → `/archives`

## Middleware (`middleware.ts`)

**Routes protégées** : `/dashboard`, `/studio`, `/council`, `/admin`, `/library`

**⚠️ Anomalie** : Seul `/studio` a une page réelle. Les autres sont des routes fantômes protégées mais inexistantes.

---

# 12. API Routes — Audit Production vs Code Mort

## API Routes en production (confirmées)

| Route | Méthode | Usage |
|---|---|---|
| `/api/public/briefs` | GET | Archives paginées |
| `/api/public/publications/[id]` | GET | Détail publication |
| `/api/public/stats` | GET | Stats publiques |
| `/api/articles/[id]` | GET | Article détail |
| `/api/inquiry/[id]/foresight` | GET | Foresight bundle |
| `/api/studiox` | POST | Studio commission (LLM simple) |
| `/api/studiox/checkout` | POST | Stripe checkout |
| `/api/studiox/order/[id]` | GET | Statut commande |
| `/api/foresight/chat` | POST | Chat persona |
| `/api/auth/*` | POST/GET | Auth JWT |
| `/api/newsletter/*` | POST | Newsletter subscribe |
| `/api/stripe` | POST | Webhook Stripe |
| `/api/health` | GET | Health check |
| `/api/cron/*` | POST | Crons Netlify |

## API Routes — CODE MORT (à supprimer)

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

## Schema Prisma — tables clés

| Table | Usage |
|---|---|
| `Brief` | HTML généré, sources, lineage |
| `ThinkTankPublication` | Publication publique avec status |
| `Source` | Sources académiques/institutionnelles |
| `Author`, `Institution` | Enrichissement |
| `User`, `Subscription` | Auth et ancien modèle subscription |
| `StudioXOrder` | Commandes pay-per-use |
| `PipelineRun` | Traces d'exécution pipeline |
| `Signal` | Signaux détectés |
| `Vertical` | Verticales éditoriales |
| `ForesightRun` | Simulations swarm |
| `Concept`, `ConceptRelation` | Knowledge graph |
| `AgentMemory`, `AgentLesson` | Apprentissage auto |
| `NewsletterSubscriber` | Newsletter |

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

## 14.2 Faiblesses critiques (P0)

| # | Problème | Impact | Fichier |
|---|---|---|---|
| 1 | **StudioX ne lance pas le pipeline 16 steps** — fait un simple appel LLM. | Écart produit/technique majeur. Les utilisateurs payant €149/€299 n'obtiennent pas ce qu'ils achètent. | `app/api/studiox/route.ts` |
| 2 | **StudioX hardcode `gpt-4o`** — pas de fallback, pas de routing unifié. | Coût élevé, dépendance OpenAI, pas de cohérence LLM. | `app/api/studiox/route.ts:161` |
| 3 | **DOSSIER format non implémenté** — fallback vers strategic. | Format à €299 non livré. | `lib/agent/pipeline-v2.ts:2342` |
| 4 | **Routes fantômes protégées** — `/dashboard`, `/council`, `/admin`, `/library` sans pages. | UX 404, confusion. | `middleware.ts` |

## 14.3 Faiblesses importantes (P1)

| # | Problème | Impact | Fichier |
|---|---|---|---|
| 5 | **Code mort massif** — ~20 API routes, `StudioX.tsx` component, plans Stripe legacy. | Dette technique, build plus lent, confusion. | `app/api/*`, `components/StudioX.tsx`, `lib/stripe.ts` |
| 6 | **Circuit breaker provider en mémoire** — pas persisté. | En multi-instance, l'état n'est pas partagé. | `lib/agent/provider-health-tracker.ts` |
| 7 | **Agent Memory calibration** — needs ≥3 runs, no domain-specific defaults. | Nouveaux domaines utilisent thresholds statiques. | `lib/agent/orchestrator.ts` |
| 8 | **Cache invalidation** — `invalidateScoutCache()` exists mais jamais appelée automatiquement. | Risque de données obsolètes. | `lib/agent/pipeline-v2.ts` |
| 9 | **Progression pipeline non streamée** — `emitProgress()` existe mais pas de endpoint SSE. | UX StudioX sans feedback temps réel. | `lib/agent/pipeline-progress.ts` |
| 10 | **Cohere reranking single point of failure** — si Cohere tombe, perte de qualité. | Pas de fallback embedding-based. | `lib/agent/cohere-reranker.ts` |

## 14.4 Risques produit (P1-P2)

| # | Risque | Explication |
|---|---|---|
| 11 | **Foresight uniquement pour deep/strategic** — standard n'a pas de simulation légère. | Manque d'upsell naturel. |
| 12 | **Meta-analysis échoue sur sujets qualitatifs** — pas de dégradation contrôlée. | Risque d'erreur non-bloquante mais bruitée. |
| 13 | **Publication Gate thresholds statiques** — non calibrés par domaine. | Trop strict ou trop laxiste selon les sujets. |
| 14 | **Trust score vient du Critical Loop** — si le loop échoue, trust = null. | Le gate peut passer des publications faibles. |

## 14.5 Risques business (P2)

| # | Risque | Explication |
|---|---|---|
| 15 | **Modèle subscription legacy encore présent** — confond les utilisateurs et la maintenance. | Routes `/api/subscription/*`, `STRIPE_PLANS` |
| 16 | **Page `/pricing` peut ne pas refléter le nouveau modèle** — à vérifier. | `app/pricing/page.tsx` |
| 17 | **Pas de dashboard user** — `/dashboard` protégé mais inexistant. | Manque d'expérience post-purchase. |

---

# 15. Recommandations par Rôle

## AI Engineer — Actions prioritaires

1. **P0 : Connecter StudioX au vrai pipeline**
   - Remplacer l'appel direct LLM dans `/api/studiox` par `runAndPublishInquiry()` ou `runPipeline()`.
   - Retourner l'ID de commande + le statut de progression.

2. **P0 : Utiliser le LLM unifié dans StudioX**
   - Remplacer `model: 'gpt-4o'` par `callLLM()` avec sélection DeepSeek par défaut.

3. **P1 : Implement DOSSIER format**
   - Soit créer un vrai renderer 30-50 pages, soit retirer le format de la grille de prix.

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
   - Supprimer les ~20 API routes mortes.
   - Supprimer `components/StudioX.tsx` si non utilisé.
   - Supprimer `cron-trial-reminders` si trial obsolète.

3. **P1 : Nettoyer Stripe legacy**
   - Retirer `STRIPE_PLANS` legacy, garder uniquement le webhook `studiox_order`.
   - Supprimer `/api/subscription/*`.

4. **P1 : Database indexes**
   - Vérifier les indexes sur `ThinkTankPublication(status, publishedAt)` et `Signal(status, priorityScore, detectedAt)`.

## CPO — Actions prioritaires

1. **P0 : Aligner l'offre StudioX avec la technique**
   - Si on vend un pipeline €149/€299, il faut le livrer. Sinon, ajuster le pricing/messaging.

2. **P1 : Créer le dashboard user**
   - Historique des commandes, publications suivies, crédits/restants.

3. **P1 : Clarifier la différence Reader vs StudioX**
   - Reader = publications auto-générées (gratuites).
   - StudioX = commandes custom (payantes).

## CMO — Actions prioritaires

1. **P1 : SEO rich snippets**
   - Ajouter JSON-LD sur `/inquiry/[slug]` pour les articles de recherche.

2. **P1 : Open Graph**
   - Vérifier les meta tags sociaux pour `/s/[id]` et `/inquiry/[slug]`.

3. **P2 : Newsletter automation**
   - S'assurer que le cron newsletter pioche les publications de la semaine.

## CEO — Actions stratégiques

1. **P0 : Décider du sort de StudioX**
   - Soit on investit pour qu'il utilise le vrai pipeline (différenciant fort).
   - Soit on le positionne comme "chat premium" (moins de valeur, prix à revoir).

2. **P1 : Métriques de product-market fit**
   - Ajouter le tracking de conversion Reader → StudioX, taux de republication, coût moyen par publication.

3. **P2 : API externe**
   - Le code a une structure API riche. Considérer une API publique B2B.

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

---

*Document V2 — Audit objectif et complet du système NomosX, corrigé avec les noms de chercheurs grecs, les formats réels, et un bilan critique par rôle.*
