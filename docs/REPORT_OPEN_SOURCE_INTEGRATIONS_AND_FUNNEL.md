# Rapport NomosX — Intégrations open source, recherche, fournisseurs de données et nomenclature du funnel de vente

Date : 2026-08-22  
Objet : recensement des composants open source / open data / recherche intégrés dans NomosX et proposition d'une nomenclature du funnel commerciale.

---

## 1. Sommaire executif

NomosX est un pipeline agentique de recherche et d'analyse stratégique. Il repose sur :

1. **Des librairies open source** (Node.js / Python) pour le runtime, la resilience, la base de données, le parsing, le monitoring, etc.
2. **Des modèles open source / ouvertement accessibles** (mDeBERTa NLI) pour la verification.
3. **Des fournisseurs de données ouverts** (OpenAlex, Crossref, arXiv, FRED, etc.) pour alimenter SCOUT.
4. **Des patterns / algorithmes / papiers de recherche** traduits en modules internes (ReAct, Reflexion, MASC, Self-RAG, CRAG, CoVe, LATS, HippoRAG, LightRAG, RAGAS, BERTrend, etc.).
5. **Des protocoles et standards ouverts** (MCP, OpenAPI, CEBM/GRADE, Crossref polite pool).

Ce rapport classe ces intégrations par couche, indique leur origine (projet, papier, API) et leur role dans NomosX. Il propose ensuite une nomenclature du funnel de vente, alignée sur les segments et les offres existantes.

---

## 2. Librairies open source du runtime et de l'infrastructure

| Composant | Origine / Projet open source | Role dans NomosX | Pour qui / dans quel flux |
|-----------|------------------------------|------------------|---------------------------|
| Next.js 16 + React 18 + TypeScript | Vercel / Meta | Frontend, App Router, API routes | UI publique, dashboard, routes `/api` |
| Tailwind CSS | Adam Wathan / Tailwind Labs | Design system | Composants marketing, dashboard, briefs |
| Prisma ORM | Prisma | Accès PostgreSQL | Persistance de sources, briefs, jobs, knowledge graph |
| PostgreSQL | PostgreSQL Global Development Group | Base de données principale | 250M+ sources OpenAlex, Knowledge Graph, métadonnées |
| Zod | Colin McDonnell | Validation de schémas | `lib/env.ts`, APIs, outputs JSON |
| Winston | winstonjs | Logging structuré | Traces d'agents, audit logs |
| ioredis | Lucas C. | Client Redis | Circuit breaker, cache, file de jobs |
| p-limit | Sindre Sorhus | Concurrency limiting global | `lib/agent/provider-queue.ts`, 30 appels simultanés max |
| cockatiel | Polly / Mike Heym | Resilience patterns (retry, bulkhead, circuit breaker) | `lib/agent/resilience.ts` |
| bullmq | Taskforce.sh | Redis-backed job queue | Worker asynchrone, priorisation des phases |
| rate-limiter-flexible | Animaxx | Token bucket / rate limiting | Limitation par provider (75+ fournisseurs) |
| @huggingface/transformers | Hugging Face | Chargement de modèles locaux | `lib/agent/nli-engine.ts` (mDeBERTa NLI) |
| pdf-parse | Mozilla PDF.js wrapper | Extraction de texte PDF | `lib/agent/reader-agent-v3.ts` |
| rss-parser | Robert Cooper | Parsing de flux RSS | `lib/providers/independent-media-provider.ts` |
| cheerio | Cheerio team | Scraping HTML côté serveur | Extraction de pages, resumes |
| @sparticuz/chromium + puppeteer-core | Chrome DevTools / Puppeteer | Rendu / extraction de pages dynamiques | Tests, previews, extraction paywall |
| axios | Matt Zabriskie | HTTP client legacy | Appels fournisseurs (progressivement migré) |
| resend | Resend | Emails transactionnels | Digests, newsletters, notifications |
| nodemailer | Andris Reinman | SMTP fallback | Envoi d'emails si Resend indisponible |
| stripe | Stripe | Paiements | Abonnements, facturation |
| recharts | Recharts group | Graphiques dashboard | Visualisations metrics, Witness, learning |
| @tanstack/react-query | Tanner Linsley | Cache / state serveur | UI dashboard, radar, briefs |
| @sentry/nextjs | Sentry | Observabilité / error tracking | Monitoring production |
| @radix-ui/react-* | WorkOS / Radix | Primitives UI accessibles | Dialog, dropdown, select, switch, tooltip, toast |
| @floating-ui/dom | Floating UI | Positionnement flottant | Tooltips, popovers |
| framer-motion | Framer | Animations | Transitions UI |
| lucide-react | Lucide | Icones | Iconographie cohérente |
| three + @react-three/fiber + @react-three/drei | Three.js / Poimandres | Visualisations 3D | Vue knowledge graph, radar 3D (optionnel) |
| exceljs | Guyonroche | Export Excel | `/api/articles/[id]/export/data` |
| jose | Filip Skokan | JWT / JWS / JWE | Authentification, tokens admin |
| bcryptjs | dcodeIO | Hash de mots de passe | Auth securisee |
| zustand | Poimandres | State management client | UI globale |

Source principale : `package.json`.

---

## 3. Modèles open source / locaux

| Composant | Origine | Role dans NomosX | Pour qui / dans quel flux |
|-----------|---------|------------------|---------------------------|
| mDeBERTa-v3-base-mnli-xli | Microsoft (Hugging Face) | NLI multilingue local (entailment / neutral / contradiction) | `lib/agent/nli-engine.ts`, verification sémantique claim-vs-source, 0 USD |
| OpenAI text-embedding-3-small | OpenAI (propriétaire, API) | Embeddings 1536 dimensions | `lib/agent/semantic-engine.ts`, recherche sémantique, hybrid search |
| Prometheus 2 / JudgeLM (local judge) | HuggingFace / Recherche LLM-as-judge | Evaluation de qualité d'outputs | `lib/agent/local-judge.ts`, rubriques de scoring, opt-in |

Note : mDeBERTa est le seul vrai modèle open source déployé localement dans NomosX. Les LLMs principaux (GPT-4o, Claude, DeepSeek, GLM, Kimi) sont appelés via API propriétaires.

---

## 4. Fournisseurs de données ouverts et APIs publiques

NomosX intègre 200+ providers, dont une majorité d'APIs ouvertes ou freemium. Les principales sont regroupées par domaine.

### 4.1 Academique / recherche

| Provider | Origine / Open data | Role dans NomosX | Pour qui |
|----------|---------------------|------------------|----------|
| OpenAlex | OurResearch (open, 250M+ works) | Source primaire de publications | Recherche académique, veille, radar |
| Crossref | Crossref (open with polite pool) | Verification DOI, metadata, existence | `lib/agent/sourcecheck.ts`, vérification de citations |
| PubMed | NCBI (open) | Biomedical literature | Santé, sciences du vivant |
| arXiv | arXiv.org (open) | Preprints STEM | Physique, mathématiques, informatique, AI |
| Semantic Scholar | Allen Institute for AI (API ouverte) | Citations, résumés, recommandations | Tous domaines |
| Europe PMC | EBI (open) | Biomedical / life sciences | Santé, Europe |
| CORE | CORE (open) | Accès aux full-text ouverts | Recherche, reader PDF |
| DOAJ | DOAJ (open) | Journaux open access | Découverte de sources libres |
| RePEc | RePEc (open) | Economie / finance | Economie, politique monétaire |
| SSRN | Elsevier (API limitée) | Working papers | Finance, droit, sciences sociales |
| DataCite | DataCite (open) | DOI de jeux de données | Données de recherche |
| Zenodo | CERN (open) | Dépôt de données et publications | Données ouvertes |
| Figshare | Figshare | Datasets et posters | Recherche, données |
| Dimensions | Dimensions (commercial avec API) | Analytics de recherche | Scientométrie, evaluation |
| Lens | Cambia (freemium) | Brevets + littérature | Brevets, innovation |

### 4.2 Données économiques, financières et institutionnelles

| Provider | Origine / Open data | Role dans NomosX | Pour qui |
|----------|---------------------|------------------|----------|
| FRED | Federal Reserve Bank of St. Louis (open) | Séries économiques US | Macro, policy |
| ECB | European Central Bank (open) | Séries macro euro | Europe, banque centrale |
| World Bank | World Bank (open) | Données de développement | Economie mondiale |
| Eurostat | Eurostat (open) | Statistiques européennes | Europe, secteurs |
| INSEE | INSEE (open) | Statistiques France | Economie française |
| OECD | OECD (open) | Données comparatives | Policy, gouvernance |

### 4.3 Actualités, médias et signaux faibles

| Provider | Origine / Open data | Role dans NomosX | Pour qui |
|----------|---------------------|------------------|----------|
| GDELT | GDELT Project (open, BigQuery) | Analyse de l'actualité mondiale | Radar, signaux faibles, crisis |
| RSS / OPML | Open web | Agrégation de flux média | Veille thématique |
| Federal Register | US Gov (open) | Réglementations US | Policy, legal |
| EUR-Lex | EU (open) | Législation européenne | Droit, institutions |

### 4.4 Sciences, environnement, energie

| Provider | Origine / Open data | Role dans NomosX | Pour qui |
|----------|---------------------|------------------|----------|
| USGS | US Geological Survey (open) | Sismicité, hazards | Risques naturels |
| NASA GISS | NASA (open) | Données climatiques | Climat, environnement |
| Open-Meteo | Open-Meteo (open) | Météo / climat | Environnement, agriculture |
| WHO | World Health Organization (open) | Santé publique | Epi, policy santé |
| NVD | NIST (open) | Vulnérabilités CVE | Cybersecurité |
| Energy Charts | Fraunhofer ISE (open) | Données énergétiques | Energie, transition |
| RTE France | RTE (open) | Données électricité France | Energie, réseau |
| Energi Data | Energi Data Service (open) | Données énergie Danemark | Energie, Nordics |

### 4.5 Sociaux et alternatifs

| Provider | Origine / Open data | Role dans NomosX | Pour qui |
|----------|---------------------|------------------|----------|
| Bluesky API | Bluesky (open) | Réseau social décentralisé | Sentiment, trends |
| HackerNews API | Y Combinator (open) | Tech discussions | Tech, startups |
| Reddit API | Reddit (freemium) | Communautés / signaux | Tendances, controverses |
| Altmetric | Altmetric (commercial) | Attention sociale sur publications | Scientométrie |
| Overton | Overton (commercial) | Citations dans la policy | Policy, impact |

### 4.6 Autres services et APIs intégrés

| Provider | Origine | Role dans NomosX | Pour qui |
|----------|---------|------------------|----------|
| Google CSE | Google (API payante) | Recherche web généraliste | Fallback, web search |
| Tavily | Tavily (API) | Recherche web enrichie | Web search, synthèse |
| Exa | Exa (API) | Recherche sémantique web | Recherche web sémantique |
| Linkup | Linkup SDK | Recherche temps réel | Actualités, breaking |
| Apitube | Apitube | Médias / news | Veille media |
| Wikidata | Wikimedia (open) | Entités, identifiants | Index, enrichment |
| ROR | Research Organization Registry (open) | Identifiants d'institutions | `lib/agent/index-agent.ts` |
| ORCID | ORCID Inc (open) | Identifiants de chercheurs | `lib/agent/researcher-identity.ts` |
| OpenAlex / Crossref polite pool | Polite pool convention | Débit augmenté pour emails connus | Resilience Crossref (10 req/s) |
| Unpaywall | OpenAlex/Unpaywall (open) | Accès full-text ouvert | Reader PDF |
| Wanfang | Wanfang (chinois) | Littérature chinoise | International, Asie |

Source principale : `AGENTS.md` (Provider Resilience Layer), `lib/providers/`.

---

## 5. Patterns, algorithmes et papiers de recherche intégrés

Cette section concerne les méthodes et architectures reproduites en interne, même si elles ne sont pas toujours des "projets open source" au sens strict (certains n'ont qu'un papier ou un pattern). Ils sont listés par couche.

### 5.1 Couche radar, detection de signaux et scoring

| Pattern / Module | Origine (recherche / projet) | Role dans NomosX | Pour qui |
|------------------|------------------------------|------------------|----------|
| Temporal Signal Trajectories | ACL 2026 — Navasartian | Classification emerging / bursting / stable / fading / new | `lib/agent/topic-radar.ts`, radar de signaux faibles |
| BERTrend Velocity Scoring | RTE-France 2024 | Delta scoring par vitesse de mention | Radar, boosting des topics émergents |
| Anticipatory Outliers | LREC 2026 — Zve et al. | Détection d'outliers qui deviennent narratifs | `lib/agent/topic-radar.ts`, signaux précoces |
| Domain-Aware Credibility (GroundCheck) | GroundCheck 2026 | Scoring de crédibilité par domaine (academic, news, gov, think-tank) | `lib/agent/sourcecheck.ts` |
| Neural Source Routing (RAGRoute) | RAGRoute 2025 | Sélection des 12 providers les plus pertinents | `lib/agent/pipeline-v2.ts`, SCOUT |
| Submodular Query Diversification (HERO) | HERO, LREC 2026 | Facility-location, sélection diverse de 5 requêtes | `lib/agent/pipeline-v2.ts` |

### 5.2 Couche LLM, routage et failover

| Pattern / Module | Origine (recherche / projet) | Role dans NomosX | Pour qui |
|------------------|------------------------------|------------------|----------|
| Capability-Aware LLM Failover (DVARA) | DVARA pattern | Filtrage de la chaîne de fallback par capability (tools, jsonMode) | `lib/llm/unified-llm.ts` |
| ReAct | Yao et al. (2022) | Boucle Thought-Action-Observation | `lib/agent/react-loop.ts` |
| Tool Calling standard | OpenAI / Anthropic | Appels d'outils multi-providers | `lib/llm/unified-llm.ts` |
| LLMCompiler | Kim et al. (2023) | Appels d'outils parallèles | `lib/agent/react-loop.ts` |
| COMPASS | Pattern de compression de contexte | Résumé des anciens résultats d'outils | `lib/agent/react-loop.ts` |
| ReflAct | Pattern de réinjection d'objectif | Rappel du but toutes les 3 étapes | `lib/agent/react-loop.ts` |
| Chain-of-Verification (CoVe) | Dhuliawala et al. (2023) | Plan → draft → verify → revise | `lib/agent/chain-verification.ts` |

### 5.3 Couche orchestration, planification et métacognition

| Pattern / Module | Origine (recherche / projet) | Role dans NomosX | Pour qui |
|------------------|------------------------------|------------------|----------|
| Witness (metacognitive observer) | Sakshi (bionicbutterfly13), MIDCA, HyperAgents | Observation, anomalies, interventions, cross-run learning | `lib/agent/witness/*` |
| Dynamic DAG Planner | D2Plan, COMPASS | Pipeline en graphe orienté acyclique replanifiable | `lib/agent/dag-planner.ts` |
| Meta-Controller | COMPASS + D2Plan | Orchestration pilotée par LLM | `lib/agent/meta-controller.ts` |
| Reflexion | Shinn et al., NeurIPS 2023 | Auto-correction par rétroaction | `lib/agent/self-correction.ts` |
| MASC | ACL 2026 | Self-correction multi-agent | `lib/agent/self-correction.ts` |
| Self-Discover | Zhou et al. (2024) | Composition d'une structure de raisonnement par requête | `lib/agent/self-discover.ts` |
| LATS (Language Agent Tree Search) | Hao et al. (2023) | MCTS pour raisonnement multi-hypothèses | `lib/agent/lats/` |
| ADAS | Automated Agent Design | Génération automatique de variants de prompts | `lib/agent/adas/` |
| Budget Forcing (s1-style) | s1, Muennighoff et al. (2025) | Test-time scaling via Wait tokens | `lib/agent/budget-forcing.ts` |

### 5.4 Couche retrieval, RAG et knowledge graph

| Pattern / Module | Origine (recherche / projet) | Role dans NomosX | Pour qui |
|------------------|------------------------------|------------------|----------|
| Hybrid Search (dense + sparse + RRF) | llmbestpractices 2026 | pgvector + full-text + Reciprocal Rank Fusion | `lib/agent/semantic-engine.ts` |
| HippoRAG 2 / LightRAG | IGPP / HKU / recherche open-source | Multi-hop KG + vector retrieval | `lib/agent/knowledge-graph-pagerank.ts`, `knowledge-graph.ts` |
| Citation Graph (Paper Circle) | Paper Circle, ACL 2026 | Découverte de papiers hubs et ponts | `lib/agent/citation-graph.ts` |
| STORM | Shao et al. (2024) | Génération de perspectives et de questions | `lib/agent/research-patterns.ts` |
| PaperQA2 | FutureHouse (open) | Traversal de citations, réponses Q&A scientifiques | `lib/agent/research-patterns.ts` |
| Self-RAG / CRAG | Asai et al. (2023) / Yan et al. (2024) | RAG adaptatif avec tokens de réflexion | `lib/agent/adaptive-rag.ts` |
| RAGAS | RAGAS open-source | Métriques RAG (faithfulness, relevancy, etc.) | `lib/agent/ragas-eval.ts` |

### 5.5 Couche verification, confiance et adversarial

| Pattern / Module | Origine (recherche / projet) | Role dans NomosX | Pour qui |
|------------------|------------------------------|------------------|----------|
| NLI Engine (mDeBERTa) | Microsoft, modèle open | Natural Language Inference pour grounding | `lib/agent/nli-engine.ts` |
| Source Check | aberaio / sourcecheck | Existence, retraction, présence du texte | `lib/agent/sourcecheck.ts` |
| Atomic Claim Decomposition | FactReasoner (IBM), VeriScore, HallDetect | Décomposition en claims atomiques décontextualisés | `lib/agent/atomic-claims.ts` |
| Conflict-Aware Reasoning | EvidentialRAG, CONFRAG, ConflictRAG 2026 | Détection de contradictions entre sources | `lib/agent/conflict-aware.ts` |
| Trust Score Calibration | reliability-eval, conf-cal, reliably | ECE, Brier, temperature scaling | `lib/agent/trust-calibration.ts` |
| Claim-Level Provenance Graph | ClaimKit, agent-grounding | Provenance et staleness par claim | `lib/agent/provenance-graph.ts` |
| Critic Agent / GAVEL | OpenReview 2026, GAVEL ACL 2026 | Vérification adversariale multi-étapes | `lib/agent/critic-agent.ts` |
| Cross-Model Consensus | arxiv 2026 | Jury de 3 LLMs indépendants | `lib/agent/cross-model-consensus.ts` |
| Reflective RAG | ACL 2026 Findings | Auto-évaluation par phase | `lib/agent/cross-model-consensus.ts` |
| Local Judge | Prometheus 2, JudgeLM | Evaluation open-source de qualité | `lib/agent/local-judge.ts` |
| Citation Verifier | OpenScholar | Passage-level citation grounding | `lib/agent/citation-verifier.ts` |
| Devil's Advocate | CIA Red Team, Kahneman pre-mortem | Challenge épistémique avant publication | `lib/agent/devils-advocate.ts` |

### 5.6 Couche scénarios, prevision et meta-analyse

| Pattern / Module | Origine (recherche / projet) | Role dans NomosX | Pour qui |
|------------------|------------------------------|------------------|----------|
| CANA | arxiv 2026 | Causal Analogical Reasoning | `lib/agent/scenario-engine.ts` |
| SCATTER | ACL 2026 | Génération d'hypothèses diverses | `lib/agent/scenario-engine.ts` |
| PROCLAIM | arxiv 2026 | Débat style tribunal | `lib/agent/scenario-engine.ts` |
| Agents-K1 | arxiv 2026 | Agent-native knowledge orchestration | `lib/agent/knowledge-infrastructure.ts` |
| TMAS | ICML 2026 | Experience Bank + Guideline Bank | `lib/agent/knowledge-infrastructure.ts` |
| IterResearch | ICLR 2026 | Compression de contexte 2048+ appels | `lib/agent/knowledge-infrastructure.ts` |
| UCB1 Bandit | EACL 2026 | Allocation de budget entre lenses | `lib/agent/intelligent-scout.ts` |
| Meta-Analysis Engine | Statistics / Cochrane | Cohen's d, forest plots, I², Egger's test | `lib/agent/meta-analysis-engine.ts` |
| Quant Bridge (FIGARO) | Eurostat FIGARO | Input-output tables, propagation d'choc | `lib/quant/`, `quant-service/` |

### 5.7 Protocoles et standards ouverts

| Standard / Protocole | Origine | Role dans NomosX | Pour qui |
|----------------------|---------|------------------|----------|
| MCP (Model Context Protocol) | Anthropic | Exposition / consommation d'outils | `lib/agent/mcp/` |
| OpenAPI | OpenAPI Initiative | Spec API | `openapi.yaml` |
| CEBM / GRADE | Oxford CEBM | Niveaux de preuve | `harvard-council-enhanced.ts`, evidence grading |
| ORCID / ROR | ORCID Inc / ROR | Identifiants persistent | Enrichissement des sources |

Source principale : `AGENTS.md` (toutes les sections), `lib/agent/*.ts`.

---

## 6. Nomenclature du funnel de vente

### 6.1 Principe

Le funnel NomosX traduit la promesse produit — "strategic intelligence, verified, instant" — en parcours d'achat. Chaque étape est nommée, mesurée et reliée à une offre, un contenu et un objectif de conversion.

### 6.2 Stages du funnel

| Niveau | Nom officiel | Definition | Job-to-be-done du prospect | Contenu / activation | KPI cible |
|--------|--------------|------------|----------------------------|----------------------|-----------|
| 1 | **Signal** | Le prospect découvre un problème lié à l'information / la désinformation / la lenteur décisionnelle | Comprendre qu'il a un besoin d'intelligence fiable | Blog, LinkedIn, Twitter/X, YouTube, PR, SEO, webinars | Trafic, impressions, followers |
| 2 | **Question** | Le prospect pose une question métier concrète | Tester si une réponse rapide et vérifiée est possible | Landing pages, démo video, ROI calculator | MQL (email, demo request) |
| 3 | **Brief** | Le prospect génère son premier brief gratuit / limité | Voir la qualité d'un output decision-ready | Free brief, essai gratuit, freemium | Sign-ups, activation (1er brief créé) |
| 4 | **Council** | Le prospect teste le multi-expert et le débat contradictoire | Evaluer la profondeur et la crédibilité | Council preview, debate sample, testimoniaux | PQL (Product Qualified Lead) |
| 5 | **Subscription** | Le prospect choisit un tier payant | Recevoir de l'intelligence en continu | Pricing page, sales call, PO | Conversion payante |
| 6 | **Expansion** | Le client augmente son usage (seats, volumes, API) | Etendre NomosX dans son organisation | API, Enterprise features, CSM | NRR, ARPU, expansion |
| 7 | **Advocacy** | Le client recommande et co-construit | Devenir référence et donneur de leçons | Case studies, referrals, feedback learning | NPS, referrals, pipeline |

### 6.3 Correspondance avec le parcours produit

| Funnel stage | Feature NomosX activee | Output attendu | Metric associee |
|--------------|------------------------|----------------|-----------------|
| Signal | — | Prise de conscience | Impressions, BR, share of voice |
| Question | Landing search, demo query | Première réponse en <60s | Taux de completion d'une question |
| Brief | Pipeline V3 (SCOUT → EDITOR) | Brief 10 sections, 12 sources | Taux d'activation (1er brief généré) |
| Council | Harvard Council V5, Devil's Advocate | Analyse multi-expert, débat | Taux d'upgrade à payant |
| Subscription | Studio / Enterprise full features | Accès illimité, API, support | Conversion, MRR |
| Expansion | API, custom PhDs, white-label, on-premise | Adoption organisationnelle | Expansion MRR, seats |
| Advocacy | Feedback learning, case studies | Témoignages, referrals | NPS, references |

### 6.4 Nomenclature des offres (product tiers)

| Offre | Cible | Prix indicatif | Positionnement | Contenu du package |
|-------|-------|----------------|----------------|--------------------|
| **NomosX Researcher** | Chercheurs, étudiants, consultants solo | 19 EUR/mois | Entrée de gamme, veille personnelle | 50 briefs/mois, 5 perspectives, basic citations, email support |
| **NomosX Studio** | Consultants, PME, directeurs innovation | 49 EUR/mois | Intelligence professionnelle | 200 briefs/mois, 22 perspectives, full verification, API, living docs, priority support |
| **NomosX Enterprise** | Grandes entreprises, gouvernements, think tanks | 199+ EUR/mois | Avantage stratégique complet | Illimité, custom experts, white-label, on-premise, SLA, CSM dédié |

### 6.5 Nomenclature des signaux de qualification (scoring lead)

| Categorie | Signal | Score + | Signification |
|-----------|--------|---------|---------------|
| **Fit** | Domaine cible (gov, consulting, enterprise, academic) | +30 | Alignement avec un segment prioritaire |
| **Need** | A posé une question strategique complexe | +25 | Besoin confirmé d'intelligence decisionnelle |
| **Engagement** | A généré 3+ briefs | +20 | Activation produit forte |
| **Authority** | Email corporate + domaine Fortune 500 / .gouv | +15 | Pouvoir de décision |
| **Urgency** | Question sur breaking news ou crise | +10 | Timeline courte |
| **Budget** | Visite page Enterprise / pricing | +10 | Intention d'achat haut de gamme |

### 6.6 Language funnel pour les équipes commerciales

| Terme | Definition | Usage |
|-------|------------|-------|
| **MQL (Marketing Qualified Lead)** | Prospect avec email + question + segment fit | CRM marketing |
| **PQL (Product Qualified Lead)** | Prospect ayant généré un brief et un council | Sales outbound |
| **SQL (Sales Qualified Lead)** | PQL avec budget et timeline confirmés | Pipeline commercial |
| **Opportunity** | SQL associé à un tier (Studio ou Enterprise) | Forecast |
| **Won** | Contrat signé | ARR/MRR |
| **Activated** | Utilisateur ayant généré un brief dans les 7 premiers jours | Customer Success |
| **Champion** | Utilisateur actif avec 3+ partages internes | Expansion / Advocacy |

### 6.7 Hypothèses de conversion et objectifs

| Etape | Taux cible | Action d'optimisation |
|-------|------------|----------------------|
| Visitor → MQL | 12% | SEO, contenus thought leadership, démo front page |
| MQL → PQL | 25% | Free first brief, onboarding guidé |
| PQL → SQL | 20% | Council demo, ROI calculator, sales touch |
| SQL → Won | 30% | Pilot Studio, references clients, proof of concept |
| Won → Expansion | 30% année 1 | API, modules Enterprise, formation |

Sources : `PRODUCT_VISION.md`, `docs/value-proposition.md`, `docs/marketing-specification.md`.

---

## 7. Recommandations

1. **Identifier clairement les composants open source dans la documentation commerciale** : cela renforce la crédibilité technique et la transparence.
2. **Distinguer "open source" de "recherche intégrée"** : certains patterns sont des reimplementations de papiers, pas des librairies. Cette nuance doit être claire dans les discours presse et investisseurs.
3. **Mettre le trust/verification au centre du funnel** : la couche NLI + SourceCheck + Critic est le differentiateur le plus fort; elle doit structurer les messages "Council" et "Enterprise".
4. **Aligner les offres sur les cas d'usage métier** : le Researcher doit être positionné comme "veille académique", le Studio comme "boite a outils du consultant", l'Enterprise comme "think tank interne".
5. **Créer une page "Intégrations & Sources" publique** : liste des 66+ providers, des modèles, des protocoles. Cela sert a la fois au SEO technique et a la confiance institutionnelle.

---

## 8. Références internes

- `package.json` : dépendances et librairies open source.
- `AGENTS.md` : architecture, agents, patterns de recherche, resilience, Witness.
- `README.md` : vision produit, stack technique, pipeline V5.
- `PRODUCT_VISION.md` : positionnement, segments, offres, roadmap.
- `docs/value-proposition.md` : propositions de valeur, cas d'usage, ROI.
- `docs/marketing-specification.md` : marque, canaux, pricing, KPIs.
- `lib/agent/*.ts` : implémentations des modules.
- `lib/providers/` : intégrations fournisseurs.
