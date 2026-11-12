# NomosX — Document de passation CTO / Head of AI Engineering

**Date :** 2026-11-12
**Périmètre :** revue exhaustive du projet — architecture, agents, modèles, infrastructure, produit, état actuel, dette et priorités.
**Audience :** équipes techniques qui prennent le relais.

---

## 1. Vision et intention produit

NomosX est une **plateforme de recherche et de publication autonome** — un "think tank algorithmique". Elle n'est pas un générateur de contenu : c'est un système qui

1. **détecte** des signaux dans le monde (GDELT, RSS, APIs académiques, sources institutionnelles, signaux internes DB),
2. **décide** quelles questions méritent une investigation (triage éditorial + agenda de recherche),
3. **délègue** à un pipeline multi-agents qui produit une analyse **evidence-bounded** : chaque claim est rattaché à des passages de sources, chaque inférence est stress-testée, et la publication n'a lieu que si des gates déterministes + adversariaux le permettent.

La doctrine centrale, non négociable :

- **Fail closed.** Mieux vaut ne rien publier qu'une analyse non supportée.
- **Evidence-first.** Une thèse ne lie que sur des documents distincts, dans le scope, réellement cités — jamais sur du plausible.
- **Déterminisme rejouable.** Record/replay des inputs non-LLM et des appels LLM (cassettes) pour auditer et reproduire chaque run.
- **Amélioration monotone.** La mémoire institutionnelle (experience bank, prédictions→calibration, objections DA→stress tests) doit faire monter la qualité à chaque cycle, pas régresser.

### Produits exposés

| Surface | Description |
|---|---|
| Site public (Next.js 16, App Router, i18n 24 locales) | Articles, archives, desk par domaine, chercheurs, track-record, prédictions, methodology, moat, pricing |
| **StudioX** | Produit payant (Stripe) : analyses sur commande, pipeline async (`studiox-run-pipeline-background`, drain cron 5 min) |
| **Foresight** | Moteur de prévision (Delphi, personas, graph, social) avec chat public `/api/foresight/chat` |
| **Witness** | Boucle cognitive / meta-loop d'auto-observation (`lib/agent/witness`) |
| **Prédictions** | Enregistrement, tracking, audit, calibration Brier → réinjectée dans les prompts |
| **Newsletter** | Éditions hebdomadaires, subscribe/confirm/unsubscribe (cron lundi 8h) |
| **Knowledge graph** | Concepts, relations, PageRank, visualisation publique |
| Auth/comptes | register/login/JWT, quotas (`UserQuota`), subscriptions Stripe |

---

## 2. Architecture globale

```
SIGNALS                    DECIDE                        DELEGATE / PRODUCE
─────────                  ──────                        ─────────────────
topic-radar (14 verticales)→ signal-detector             → think-tank-dispatcher
  GDELT / RSS / academic     editor-in-chief (triage LLM)   → inquiry-orchestrator
  policy / institutional     research-agenda (couverture)    → inquiry-pipeline
  DB signals                 run-plan (budget/temps)          → analyst-multipass (P1/P2/P3)
                                                        → evidence contracts, DA, gates
                                                        → publication-gate → persistence
```

### Orchestration — Detect → Decide → Delegate

- **`lib/agent/topic-radar.ts`** — sweeps multi-sources, 14 verticales déclarées. ⚠️ Historique : skew massif `eu-policy` (~99.95 % des signaux) — voir §10.
- **`lib/agent/signal-detector.ts`** — qualifie les signaux entrants.
- **`lib/agent/editor-in-chief.ts`** — triage LLM des candidats ; reçoit le bloc agenda (domaines sous-couverts + questions flagship).
- **`lib/agent/research-agenda.ts`** *(ajout récent)* — couverture publications 30 j / verticale, déficits vs part égale, flagship questions, prompt block + boost priorité borné (25 pts) + swap déterministe. Fail-open sur erreur DB.
- **`lib/agent/run-plan.ts`** — gouvernance up-front : budget lanes, réserves de temps, nombre de re-analyses.
- **`lib/agent/think-tank-dispatcher.ts`** — sélection finale, préflight evidence, modes weekly/breaking, phases observables persistées.
- **`lib/agent/cadence-enforcer.ts`** — quotas hebdo (`CadenceCounter`), reset quotidien.
- **`lib/worker/think-tank-queue.ts`** — enqueue `THINK_TANK_CYCLE` (job PG) ; chemin Temporal opt-in derrière `webpackIgnore`.

### Exécution pipeline — `inquiry-orchestrator.ts` / `inquiry-pipeline.ts` / `pipeline-v2.ts`

Pipeline en étapes persistées (`PipelineRun.steps`), avec checkpoints et reprise :

1. **Init** (`pipeline-steps/pipeline-init.ts`) — question, profondeur, corpus.
2. **Scout/Reader** (`reader-agent-v3.ts`, `intelligent-scout.ts`, `adaptive-rag.ts`, `enhanced-ranker.ts`, `cohere-reranker.ts`) — collecte sources (OpenAlex, Crossref, Semantic Scholar, CORE, Unpaywall, Eurostat/ECB/INSEE, GDELT, RSS, Apitube, Linkup, Tavily, Exa…), ranking, dédup (DOI/URL/titre), screening de pertinence.
3. **Thesis binding** (`hypothesis-engine.ts`, `sara-compression.ts`, `thesis-*`) — la thèse ne lie que sur ≥2 documents distincts, in-range, support complet ; évaluation unavailable → stop avant tout spend analyst.
4. **Analyst multi-pass** (`analyst-multipass.ts`) — P1 friction mapping, revue scope/causalité pré-draft, P2 stress test adversarial (injecte les **objections DA historiques** — voir §7), P3 synthèse ; dégradation gracieuse bornée par `REPAIR_TAIL_RESERVE_MS`.
5. **Domain expert lens** (`domain-expert.ts`, `lenses/`) — passe bornée par réserve de réparation.
6. **Pre-draft review** (`pre-draft-review.ts`) + **outline critic early** — réparation scope/causalité avant rédaction complète.
7. **Pre-critic gates** (`pre-critic-gates.ts`), **critic block** (`critic-block.ts`, `critic-agent.ts`, `critic-panel.ts`, `elenchus`) — groundedness, unsupported/unverifiable claims.
8. **Post-critic enrichment** : gap-fill (`gap-filler.ts`, `retrieval-gapfill.ts`), NLI claim→passage (`nli-engine.ts`, `nli-verifier.ts`, `claim-passage-contract.ts`), citation repair/vérification.
9. **Devil's Advocate** (`devils-advocate.ts`) — fatal/major/moderate/minor ; `publishabilityScore = 100 − fatal×20 − major×8 − minor×2`, seuil gate 40. Ses objections fatales sont **banquées** dans l'experience bank et **réinjectées dans P2** au run suivant.
10. **Scenario/forecast** (`scenario-engine.ts`, `scenario-architect.ts`, `editorial-scenarios.ts`, `foresight-*`) — scénario central requis.
11. **Rendering** (`position-first-renderer.ts`, `brief-html-extract.ts`, `chart-generator.ts`, `svg-charts.ts`, `hero-image.ts`) — HTML publication, charts, hero.
12. **Quality loop + trust** (`quality-loop.ts`, `pipeline-steps/trust-score.ts`, `evaluators-trust.ts`) — `computeTrustScore` = site unique d'arithmétique ; vetoes/caps préservés (retraction 50, criticPanel 55, editorial floor 60, critic-reject 50, grounding<10 veto).
13. **Gate** (`publication-gate.ts`, `gate-diagnosis.ts`, `revision-controller.ts`) — checks durs : trust≥65, quality≥70, DA≥40, citations, word count, scénarios, adherence, contradictions.
14. **Persistence tail** (`persistence-tail.ts`) — écrit `ThinkTankPublication`, `ThinkTankPublicationRun`, `PipelineRun`, calibration, experience extraction **post-gate**.

### Modules agents notables (lib/agent — 208 fichiers)

Par fonction :

- **Orchestration** : `orchestrator.ts`, `conductor-orchestrator.ts`, `graph-of-agents.ts`, `adaptive-topology.ts`, `inquiry-funnel-utils.ts`
- **Recherche** : `topic-radar`, `signal-detector`, `intelligent-scout`, `adaptive-rag`, `query-enhancer`, `retrieval-gapfill`, `gap-filler`, `deep-planner`, `research-protocol`, `meta-analysis-engine`
- **Preuve/vérité** : `evidence-bank/ledger/registry/partition/tiering/graph-gaps/independence`, `claim-grounding`, `atomic-claims`, `fact-checker`, `fact-repair`, `citation-*`, `nli-*`, `symbolic-verifier`, `safe-verifier`, `rav-verifier`, `ufo-factcheck`, `sourcecheck`, `retraction-watch`, `provenance-graph`, `contradiction-detector`, `conflict-aware`, `chain-verification`, `chain-probability`
- **Adversarial/qualité** : `devils-advocate`, `critic-*`, `peer-reviewer`, `judge-arena`, `local-judge`, `style-judge`, `outline-critic`, `pre-draft-review`, `self-correct*`, `revision-*`, `analyst-multipass`, `pruning-gates`, `hall-detect`, `novlangue-detector`, `originality-check`, `bias-detector`, `cross-model-consensus`
- **Rédaction** : `editor-agent`, `editorial-arbiter`, `copy-editor`, `structural-editor`, `revision-editor`, `nomos-voice`, `position-first-*`, `strategic-report-renderer`, `pdf-export`, `translation-service`
- **Scénarios/prévision** : `scenario-*`, `foresight-*`, `prediction-*` (registration/tracker/watch/auditor/markets), `delphi`, `simulation-agent`, `policy-stress-tester`, `world-model/`
- **Mémoire/apprentissage** : `agent-memory`, `episodic-memory`, `synapse-memory`, `temporal-memory`, `memory-consolidation`, `knowledge-infrastructure` (experience bank), `lesson-verifier`, `self-evolver`, `skill-bank`, `playbook`, `phd-researcher`, `researcher-identity`, `researcher-kb/`, `track-record`
- **Économie/coûts** : `budget-manager`, `publication-reserve`, `cost` lanes dans `run-plan`, `provider-queue`, `provider-health-tracker`, `smart-provider-selector`, `resilience`
- **Cognition avancée (expérimental)** : `moa/` (mixture-of-agents), `prm/` (process reward model), `self-play/`, `witness/` (cognitive-cycle, meta-loop, seams), `prompt-optimizer/`, `canon/` (corpus par discipline), `gmpo-optimizer`, `leap-aggregation`, `sara-compression`, `ts-setrank`
- **Divers** : `casting-agent`, `domain-classifier`, `domain-expert`, `author-innovator-detector`, `source-reputation-agent`, `quant-agent`, `primary-data-synthesizer`, `realtime-data-hub`, `macro-refresh`, `radar-innovations`, `trend-analyzer`, `cross-source-signals`, `perspective-questions`, `round-table`, `debate-agent`, `schools-of-thought`, `policy-council`, `enrichment-reasoner`, `dpp-synthesis`, `nestbrowse`, `human-feedback`, `process-audit`, `output-guard`, `style-gates`, `style-orchestrator`, `sanity` via `json-utils`

---

## 3. Couche LLM — `lib/llm/unified-llm.ts`

### Providers (7 familles)

`deepseek` · `glm` (z.ai) · `openai` · `anthropic` · `kimi` (Moonshot) · `google` (Gemini) · `freepool` (groq/nvidia — filet gratuit, dormant sans clé)

### Mécanismes

- **Routage par tâche** : `TASK_ASSIGNMENT` mappe chaque tâche (classification, extraction, citation, analysis, strategic_analysis, critique, rewrite, studiox…) à un provider/modèle ; alias legacy gérés.
- **Fallback cross-family** : ordre primaire DeepSeek ↔ Kimi ; `oppositeProvider` pour bascule de famille ; `SUSPENDED_PROVIDERS` pour exclure un provider en échec.
- **Time-out par provider** (`PROVIDER_DEFAULT_TIMEOUT_MS` / `MIN_TIMEOUT_MS`), health tracking (`provider-health-tracker.ts`), circuit suspend.
- CASSETTE record/replay (`cassette.ts`) — `NOMOSX_LLM_MODE=record|replay`, run tokens `NOMOSX_CASSETTE_RUN`, misses dumpés dans `.misses.jsonl`.
- Coûts loggés (`CostLog`), lanes budget (`budget-manager`, `run-plan`).

### État providers (2026-11)

Kimi indisponible faute de crédits → mode dégradé GLM seul observé : substance plus faible, DA scores bas. **La qualité de sortie dépend fortement du provider primaire — c'est le goulot actuel.**

---

## 4. Infrastructure de preuve et de vérité

C'est le sous-système le plus dense — à traiter avec le plus de respect :

- **Evidence contracts** (`claim-passage-contract.ts`) — chaque claim doit mapper à des passages ; contrat lexical déterministe d'abord, NLI sémantique ensuite (`NOMOSX_CLAIM_PASSAGE_NLI`).
- **Evidence independence** (`evidence-independence.ts`) — documents distincts ≠ recherche indépendante ; détection de corrélation/sources dérivées.
- **Invariants binding** (AGENTS.md) : ≥2 docs distincts in-range fully-supported ; pas de doublons ID/DOI/URL/titre ; références synthétiques exclues ; matching par `sourceId` ; absence d'évaluation thèse = stop avant spend.
- **Adherence** : verdicts `adhered` jamais `true` sur malformed/unavailable ; échec → repair routé + hard gate `thesis_adherence`.
- **Pre-gates** corpus/thèse **avant** `buildAnalystContext` — échec = zéro spend analyst.
- **Gap retrieval** préserve requêtes non tentées/échouées ; trouver un doc ≠ résoudre un claim.
- **Fact-check** avec sanitization → ré-évaluation post-sanitize (artifact version bump), fail-closed si recheck échoue.
- **Reversal watch** (`retraction-watch.ts`) — cap trust 50 sur rétraction.
- **NLI engine** (`nli-engine.ts`) — vérification sémantique claim↔passage.

---

## 5. Systèmes de mémoire et d'apprentissage

| Système | Rôle | Persistance |
|---|---|---|
| `knowledge-infrastructure.ts` | Experience bank : leçons par run (succès/échec, DA objections `phase:'da-objection'`, guidelines) | `agentAuditLog` + cache mémoire réhydraté |
| `frozen-inputs.ts` | Freeze des canaux non-LLM (corpus, readings, quant, mémoire, guidelines, contextes, timing) pour replay déterministe | `stats.frozenContext` dans PipelineRun.steps |
| `prediction-*` + calibration | Prédictions horodatées → Brier scores → `formatCalibrationContext` injecté dans prompts analyst | `Prediction`, `agentAuditLog` |
| `agent-memory`, `episodic-memory`, `synapse-memory`, `temporal-memory` | Mémoire episodique/synaptique/temporelle des agents | DB + Redis (cache) |
| `skill-bank`, `playbook`, `phd-researcher`, `researcher-identity`, `researcher-kb/` | Identité chercheur par domaine, playbooks de styles gagnants | DB |
| `self-evolver`, `lesson-verifier`, `memory-consolidation` | Consolidation et vérification des leçons | DB |
| `witness/` | Cognitive cycle + meta-loop : auto-observation des runs | DB |

**Boucles d'apprentissage actives (post-sprint) :**
- Objections DA fatales/majeures → banquées → injectées comme critères explicites dans le stress test P2 (`analyst-multipass.ts`, channel gelé `daObjections:bank`).
- Calibration Brier → bloc contexte analyst.
- `extractExperience` s'exécute **après** le verdict final du gate (Sprint 42) avec décision + checks échoués.

---

## 6. Gouvernance éditoriale et gates de publication

- **`publication-gate.ts`** — checks durs : `minTrustScore=65`, `minQualityScore=70`, `minDevilsAdvocateScore=40`, citations, word count, scénarios, adherence, contradictions, evidence independence.
- **`trust-score.ts`** — `computeTrustScore` unique ; vetoes/caps : retraction 50, criticPanel 55, editorial floor 60, critic-reject 50, grounding<10 veto dur, quality floor ne peut overrider un grounding veto.
- **`revision-controller.ts`** — itération bornée (max 3 niveaux : run/topic/global), repair reserve.
- **`held-retry`** — obligations de retry bornées ; circuit breaker par **cluster de titre** (park après 2 holds/30 j) — ajouté après la tempête de retry "energy transition" ×50.
- **`cadence-enforcer.ts`** — quotas publication (weekly=10, breaking=2/cycle), budget $20/cycle.
- **`editorial-planner.ts`** — agenda hebdo (weekly mode) ; `research-agenda.ts` — couverture cumulative tous modes.
- **Flags qualité** (tous `=1` en prod depuis 2026-11-11) : `NOMOSX_THESIS_PROMPT_CONTRACT`, `THESIS_INLINE_GATE`, `THESIS_PREMORTEM`, `THESIS_VERDICT_REPAIR`, `EARLY_ADHERENCE_ABORT`, `QUALITY_LOOP_VETO_GUARD`, `DEBATE_ON_DEMAND`, `CLAIM_PASSAGE_NLI`, `NOMOSX_AUTONOMOUS_ENABLED`.

---

## 7. Underlying data — Prisma (59 modèles)

Core : `Source`, `SourceChunk`, `Claim`, `EvidenceSpan`, `ClaimContradiction`, `AnalysisRun`, `AnalysisStep`, `RetrievalLog`, `Brief`, `PipelineRun`, `Job`, `JobDeadLetter`, `CostLog`, `AuditLog`, `AgentAuditLog`, `SystemMetric`, `FeatureFlag`.

Think-tank : `Vertical`, `Signal`, `EditorialDecision`, `ThinkTankPublication`, `ThinkTankPublicationRun`, `ThinkTankClaim`, `ThinkTankEvidenceSpan`, `ThinkTankQualityCheck`, `CadenceCounter`, `PublicationTranslation`, `PublicationReaction`, `PublicationComment`, `Draft`.

Prediction/foresight : `Prediction`, `CausalLink`, `ForesightRun`, `CouncilSession`, `Contradiction`, `ConceptNode`, `ConceptRelation`.

Produit : `User`, `Subscription`, `UserQuota`, `NewsletterSubscriber`, `NewsletterEdition`, `UserVerticalPreference`, `StudioXOrder`, `IngestionRun`, `EpisodicMemory`, `Digest`, `Topic`, `AlertSubscription`, `RunFeedback`, `ClaimFeedback`, `MacroSeries`, `MacroPoint`, `Author`, `Institution`, `SourceAuthor`, `SourceInstitution`, `Domain`, `SourceDomain`, `KnowledgeGraph` (via ConceptNode/Relation).

---

## 8. Infrastructure & exploitation

### Worker durable (`lib/worker/`, `scripts/pipeline-worker.ts`)

- `npm run worker:pipeline` — process long-lived, poll 15 s, handlers `THINK_TANK_CYCLE` + `STUDIOX_PIPELINE`.
- Job claiming avec lock + `workerIdentity`, graceful shutdown (SIGTERM → release), reclaim des jobs orphelins, resource logging.
- Execution scope (`execution-scope.ts`) — deadline propagée aux étapes, `remainingRunMs`.

### Scheduling — Netlify Functions (`netlify/functions/`, `netlify.toml`)

| Fonction | Schedule |
|---|---|
| cron-newsletter | lun 08:00 UTC |
| cron-editorial-plan | dim 20:00 UTC |
| cron-generate-briefs | dim 22:00 UTC |
| cron-generate-briefs-midweek | mer 12:00 UTC |
| cron-auto-scan | 06:00 & 18:00 UTC |
| cadence-reset | 00:00 UTC |
| cron-macro-refresh | lun 05:00 UTC |
| cron-self-improve | 03:00 UTC quotidien |
| cron-studiox-drain | */5 min |
| cron-tweet-publications | */6h (no-op sans creds Twitter) |

### Déploiement

- Site `nomosxmaster` (site ID `a58c500e-…`), repo `RodrigueGeorges/NomosX-master`, branche `main`, Next.js Runtime plugin.
- **Historique incident 2026-10-01→11-12** : builds en échec — (a) `DATABASE_URL` invalide + `JWT_SECRET` <32 chars → `lib/env.ts` throw en page-data ; (b) `cassette.ts` fs dynamique → trace whole-project dans la fonction ; (c) `@temporalio/*` tracé via `think-tank-queue` → zip > limite upload. Tous corrigés (`turbopackIgnore`, `webpackIgnore`, env vars via API). Deploy `ready` depuis `acdf356`.
- Node 22.13 (`netlify.toml`), npm 10.

### État des services

- **PostgreSQL** : Neon (pooler pour `DATABASE_URL`, direct pour `DATABASE_URL_UNPOOLED`).
- **Redis/Upstash** : ⚠️ endpoint `coherent-bee-132663.upstash.io` **mort (NXDOMAIN)** — circuit breaker `lib/agent/redis-rest.ts` évite les délais ; fallback `lib/redis.ts` TCP→REST→local. **Action requise : recréer la DB Upstash et mettre à jour les 2 vars.**
- **Temporal** : opt-in (`TEMPORAL_ENABLED` + ADDRESS + NAMESPACE + auth), worker `scripts/temporal-worker.ts` — non utilisé en prod actuellement.
- **LLM credits** : Kimi épuisé → GLM/Moonshot vars présentes ; DeepSeek/OpenAI/Anthropic clés en env.

---

## 9. Tests, déterminisme, observabilité

- **537 tests** (`__tests__/`, jest, `--runInBand`) — agents, worker, pipeline, security, performance.
- **`scripts/replay-run.ts`** (`npm run replay`) — replay E2E d'un run sur cassette + frozen inputs ; fixture réelle `.llm-cassettes/gulf-minerals.fixture.jsonl` (126 entrées, 44 min → 67 s, drift=0).
- **AGENTS.md** = spec d'architecture de référence (invariants evidence, replay, sprints).
- **AUDIT.md** = audit institutionnel (E1-E4 findings + plan P0-P5).
- **Langfuse** (`lib/agent/langfuse.ts`), Sentry (`lib/sentry.ts`), `SystemMetric`, `process-audit`.

---

## 10. État réel au 2026-11-12 — verdict honnête

### Ce qui fonctionne

- Pipeline complet avec gates durs, evidence contracts, DA, repair borné, agenda éditorial, circuit breakers, replay déterministe, tests massifs.
- Déploiement Netlify réparé et live.
- 69 publications historiques (août–sept), trusts 60-89.

### Ce qui est cassé / dégradé

| Problème | Sévérité | Statut |
|---|---|---|
| **Zéro publication depuis le 21 sept** (~7 sem) | 🔴 Critique | En cours — causes multiples corrigées, en attente d'un cycle live validant |
| **Kimi sans crédits** → GLM seul | 🔴 Critique | Attend recharge — la substance plafonne (DA 0-18) |
| **14 594 signaux expirés / eu-policy 99.95 %** | 🟠 Majeur | Agenda corrige la *sortie* ; le *radar* doit encore être rééquilibré (P2) |
| **Redis mort** | 🟡 Moyen | Circuit breaker en place ; cache dégradé |
| **"Persisted source missing: citation ordering cannot be preserved"** | 🟠 Majeur | Erreur worker observée post-restart — à investiguer (intégrité persistance) |
| **Tempête de retry historique** (energy ×50) | 🟢 Corrigé | Circuit breaker cluster + agenda |
| **3 verticales à 0 signal** (climate, ai-labor, finance) | 🟠 Majeur | Agenda booste ; il faut des *sources* pour ces domaines |

### Leçon structurelle clé

Le système savait **refuser** mais pas **décider quoi tenter**. Tous les mécanismes de gouvernance amont (agenda, run-plan, held-retry cluster, DA→P2) ajoutés récemment répondent à ça — mais **n'ont jamais encore produit une publication live**. Le prochain cycle cron (`auto-scan` 2×/jour) est le premier vrai test.

---

## 11. Priorités pour l'équipe

1. **P0 — Redis** : recréer Upstash, setter `UPSTASH_REDIS_REST_URL`/`TOKEN` (local + Netlify).
2. **P0 — Crédits LLM** : recharger Kimi (ou valider GLM comme provider principal) puis lancer un cycle borné (`worker:pipeline:once` ou attendre cron) et comparer : diversité candidats, duplicate rate, DA score, publication rate, coût.
3. **P1 — Radar rebalancing** : quotas par verticale à la *génération* de signaux (pas seulement au triage), cap = capacité dispatch, sources à créer pour climate/ai-labor/finance.
4. **P1 — Investiguer** `Persisted source missing: citation ordering cannot be preserved` — transactionnalité sourceIds/brief/source records.
5. **P2 — Revue éditoriale des 69 publications** existantes (audit qualité rétrospectif).
6. **P2 — Nettoyage** : `.llm-cassettes` 22 MB commités (fixtures OK, le reste gitignored — vérifier), 92 vulnérabilités npm audit, `experimental.viewTransition` invalide, middleware→proxy codemod, Edge Runtime déprécié.
7. **P3 — Temporal** : évaluer si on l'active pour l'orchestration durable ou on reste sur PG worker (actuellement plus simple et éprouvé).
8. **P3 — StudioX/Witness/Foresight** : surfaces produit vivantes mais peu documentées — audit dédié.

---

## 12. Commandes utiles

```bash
# Tests
./.tools/node/node.exe node_modules/jest/bin/jest.js __tests__/lib/agent __tests__/lib/worker --runInBand
./.tools/node/node.exe node_modules/typescript/bin/tsc --noEmit -p tsconfig.json

# Worker
npm run worker:pipeline          # long-lived
npm run worker:pipeline:once     # un cycle

# Replay
npm run replay -- --publication <id>
npm run replay -- --inspect .llm-cassettes/gulf-minerals.fixture.jsonl

# Build
npm run build                    # next build (Node >=22.12 <24)

# Netlify
netlify build --context production   # nécessite netlify-cli + auth
```

---

## 13. Fichiers de référence

- `AGENTS.md` — spec d'architecture, invariants evidence, historique des sprints (S41→S54+).
- `AUDIT.md` — audit institutionnel E1-E4 + plan P0-P5.
- `docs/` — 20+ docs produit/tech (GOVERNANCE, GO_LIVE_RUNBOOK, LLM_ROUTING, ORCHESTRATION_AGENTS_V2, THINK_TANK_PUBLICATION_QUALITY_RUNBOOK, WORKER_DEPLOYMENT…).
- `ROADMAP_2026.md`, `PRODUCT_VISION.md`, `ARCHITECTURE_DEEP_DIVE.md`, `TECHNICAL_SPEC.md`, `ORCHESTRATION_DIAGRAM.md`.
- `netlify.toml` — build + 10 cron schedules.
- `prisma/schema.prisma` — 59 modèles.

---

*Document généré par revue exhaustive du code, de la DB (231 pipeline runs, 69 publications, 14.6k signaux), des logs worker, de l'API Netlify et des configs d'environnement — 2026-11-12.*
