# NomosX — Documentation complète de passation

> Document unique pour les équipes qui prennent le relais : vision, architecture,
> infrastructure, état réel, priorités — puis l'inventaire exhaustif des 587 modules.
> Généré le 2026-11-12.

---

# PARTIE I — VISION, ARCHITECTURE & EXPLOITATION

**Date :** 2026-11-12 — revue exhaustive du projet : architecture, agents, modèles, infrastructure, produit, état actuel, dette et priorités.

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

---

# PARTIE II — INVENTAIRE EXHAUSTIF DES MODULES


## Pipeline steps (exécution ordonnée) — 39 modules

### `lib/agent/pipeline-steps/analyst-context.ts` — 460 lignes

* ANALYST CONTEXT ASSEMBLY — everything that feeds the analyst prompt: * agent-memory + synapse injection → domain/canon blocks → editorial north * star → conflict-aware reasoning → pre-analyst scenario engine (CANA + * SCATTER, parallel) → innovator author detection → context-block assembly * → SARA compression → prior-failure feedback → evidence sufficiency * warning → positioning agent → slimReadings. * * Returns every produced value; the caller owns `analysis` and the * artifact-versioning m

**Exports :** `AnalystContextDeps`, `buildRequiredCoverageBlock`, `AnalystContextResult`, `buildAnalystContext`

### `lib/agent/pipeline-steps/analyst-run.ts` — 282 lignes

* ANALYST EXECUTION — MoA (opt-in) → durable multipass → test-time scaling * (second candidate on strategic + budget headroom, best citation coverage * wins) → stats.analyst. * * `analysis` is returned — a successful opt-in MoA result is adopted, not * overwritten by the multipass fallback.

**Exports :** `AnalystRunDeps`, `AnalystRunResult`, `runAnalystExecution`

### `lib/agent/pipeline-steps/arbiter-foresight.ts` — 129 lignes

* EDITORIAL ARBITER → FORESIGHT (Monte Carlo) block — V2 path. * Extracted from pipeline-v2.ts — identical semantics. * * Ordering is load-bearing: the arbiter generates the scenarios first, then * foresight refines their probabilities with the simulation (previously * foresight ran first → 0 scenarios → always skipped). * * Returns `{ institutePosition, analysis }` — the caller reassigns both * because foresight materially replaces the analysis object and the arbiter * output is read by the ren

**Exports :** `ArbiterForesightDeps`, `ArbiterForesightOutcome`, `runArbiterForesight`

### `lib/agent/pipeline-steps/branch-coverage.ts` — 117 lignes

Source ids this branch's scout produced — carried from the plan node.

**Exports :** `PlanBranch`, `BranchVerdict`, `BranchCoverageEntry`, `BranchCoverage`, `auditBranchCoverage`, `auditBranchCitations`, `evidenceNotesFor`

### `lib/agent/pipeline-steps/citation-grounding.ts` — 144 lignes

* POST-RENDER CITATION + GROUNDING block. * Extracted from pipeline-v2.ts — identical semantics. Deterministic chain: * citation repair → NLI claim grounding (remove mode) → re-grounding if the * removal improved the score → quant SVG injection → citation filter. * * Returns the mutated HTML. The trailing `void generatePrintHTML` + * `runPostRenderQualityGates` stay with the caller — the quality-gates * closure reads the pipeline's own `html` variable, which must be assigned * from the return va

**Exports :** `CitationGroundingDeps`, `runPostRenderCitationAndGrounding`

### `lib/agent/pipeline-steps/classification-gates.ts` — 245 lignes

* CLASSIFICATION + ROUTING GATES — STEP 4b: topic classification → * foundational-source injection → complexity gate → gap filler (retrieve + * scout) → casting → LAS gate. * * Mutates `topSources` (foundational push) and the step-routing flags — * the caller owns the flags and reads them back from the result. Stats keys: * topicClassification, casting.

**Exports :** `FoundationalSource`, `ClassificationGatesDeps`, `ClassificationGatesResult`, `runClassificationGates`

### `lib/agent/pipeline-steps/critic-block.ts` — 604 lignes

* CRITIC BLOCK — STEP 7b: critic agent → critic panel → critic repair * (re-analysis adopted iff citation coverage holds, then BOTH evaluators * re-checked so the gate never consumes stale verdicts) → critic evidence * tool → outline critic → second gap-request round → self-correct * checkpoint → CoVe. * * Returns `analysis` (mutated when a repair is adopted), the decremented * `reAnalysisBudget`, and `savedCriticResult` (consumed downstream by * post-hoc injection).

**Exports :** `CriticBlockDeps`, `CriticBlockResult`, `runCriticBlock`

### `lib/agent/pipeline-steps/da-post-repair.ts` — 87 lignes

* POST-REPAIR DA REFRESH — extracted from pipeline-v2.ts (Sprint 47). * * The quality loop / self-correct can materially rewrite html AFTER the * sweep's DA verdict (aggressive citation repair, re-grounding). A verdict * tagged to a replaced artifact version is stale → the gate's * evaluation_freshness hard-fails, i.e. every run that needed a repair * auto-HELD regardless of quality. Re-judge the corrected artifact ONCE * (bounded ~$0.03) so the gate sees a verdict on what actually ships. * A wo

**Exports :** `DaPostRepairDeps`, `runDaPostRepairRecheck`

### `lib/agent/pipeline-steps/da-veto.ts` — 54 lignes

* DA RE-CHECK VETO RULE — single site for "does the devil's-advocate veto * still stand after a recheck?". Shared by the post-sweep recheck * (style-sweep-recheck.ts) and the post-repair refresh (pipeline-v2.ts). * * The previous inline rule — `verdict === 'reject' || (major_revision && * strength < 20)` — had two holes: (a) a degraded recheck LIFTED a standing * veto (observed: strength 36→20, fatal 1→2 — `veto LIFTED` on a strictly * worse artifact); (b) a recheck clearing the veto while stayi

**Exports :** `daVetoStands`

### `lib/agent/pipeline-steps/debate-advocate.ts` — 230 lignes

* DEBATE (meta-analysis suppressed) + DEVIL'S ADVOCATE blocks. * Extracted from pipeline-v2.ts — identical semantics. * * These were closures capturing `runDebateStep`/`runDevilsAdvocateStep` flags * and writing to outer `debateResult`/`debateContext`. As steps they take the * flag as a call-time snapshot and RETURN the debate outputs — pipeline-v2 * owns `debateResult`/`debateContext` because the arbiter and the render step * read them at call time, long after this block runs.

**Exports :** `DebateAdvocateDeps`, `DebateOutcome`, `runDebateMetaBlock`, `runDevilsAdvocateBlock`

### `lib/agent/pipeline-steps/eval-rescore.ts` — 170 lignes

The critic result is also consumed downstream (repair instructions, * self-correct checkpoint) — returned so the caller can keep its local ref.

**Exports :** `EvalRescoreDeps`, `SPECULATIVE_OR_META_KEYS`, `staleAnalysisEvalKeys`, `failedAnalysisEvalKeys`, `rescoreStaleAnalysisEvals`

### `lib/agent/pipeline-steps/evaluators-trust.ts` — 498 lignes

* PARALLEL EVALUATORS + DETERMINISTIC TRUST SCORING block. * Extracted from pipeline-v2.ts — identical semantics. * * Six evaluators run via Promise.allSettled — pure readers of the post-repair * HTML writing distinct stats keys — then the deterministic trust score * consumes ALL of them (the scoring stays after the barrier). The scoring * block also injects the methodology note and the abstention banner into the * HTML: additive injections, so the html artifact version is NOT bumped * (Sprint 2

**Exports :** `EvaluatorsTrustDeps`, `runEvaluatorsAndTrust`

### `lib/agent/pipeline-steps/evidence-graph-gaps.ts` — 74 lignes

Scout query derived from the unsupported claim text.

**Exports :** `EvidenceGapRequest`, `deriveEvidenceGapRequests`

### `lib/agent/pipeline-steps/gap-fill.ts` — 505 lignes

* GAP FILL — orchestrator RE_ANALYZE + gap-aware evidence append + typed * research gaps + the blackboard `processGapRequests` consumer + * post-analyst enrichment checkpoint. * * All mutable cross-step state lives in `GapFillState` — the same object is * shared with the critic block so a gap-fill re-analysis triggered from * CRITIC/OUTLINE is actually adopted by the caller (a stale local copy would * otherwise clobber it on return).

**Exports :** `GapFillState`, `GapFillDeps`, `createGapRequestProcessor`, `runGapFillStage`

### `lib/agent/pipeline-steps/hero-image-step.ts` — 68 lignes

* HERO IMAGE: Generate a conceptual abstract image for the publication. * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary.

**Exports :** `runHeroImageStep`

### `lib/agent/pipeline-steps/persistence-tail.ts` — 786 lignes

* PERSISTENCE TAIL — everything after the quality gates converge: * PUBLISHER (brief.create) → post-publish writes (parallel) → prediction * auditor → source reputation → experience bank → eval-freshness assert → * pipelineRun.update → durable seal → learning loop → skill bank → lesson * verifier → flag-gated post-run learning (parallel) → MOA weight update. * * Extracted verbatim from pipeline-v2; the caller keeps the return-object * construction (readerClaims, removeListener). `html` is return

**Exports :** `PersistenceTailDeps`, `runPersistenceTail`

### `lib/agent/pipeline-steps/pipeline-init.ts` — 549 lignes

* Pipeline initialization: flag resolution, pre-flight provider health, * adaptive topology, durable-execution setup, memory injections (witness / * world-model / world-evolver / PRM / self-play / MoA), the blackboard, * idempotency guard, tier flags, the budget accumulator (addCost) and * provider selection (smart + skill-bank + complexity routing). * * Extracted from runPipelineCore (Sprint 28c). Returns a `PipelineInit` * object — the mutable flow state lives in `flags`/`cost`/`selfCorrect` *

**Exports :** `runPipelineInit`

### `lib/agent/pipeline-steps/post-analyst-checks.ts` — 587 lignes

* POST-ANALYST CHECKS — output guardrails + local judge → witness observe + * metaLoop (actuator: cuts optional downstream phases) → self-play → PRM * scoring → self-correct checkpoint → post-analyst diagnostic → blackboard * ANALYST→SCOUT gap detection → topic consistency → terminal distance → * orchestrator assess → self-correction (Reflexion retry, budget-capped). * * `analysis` flows in/out (self-correction may adopt a retried version); * `reAnalysisBudget` is created here and handed to the 

**Exports :** `REPAIR_REANALYSIS_RESERVE`, `PostAnalystChecksDeps`, `PostAnalystChecksResult`, `runPostAnalystChecks`

### `lib/agent/pipeline-steps/post-critic-enrichment.ts` — 116 lignes

* POST-CRITIC ENRICHMENT — STEP 7c/7d/7e: reflective RAG self-evaluation, * cross-model consensus on controversial claims, inter-paper knowledge * graph. Three pure readers — distinct stats keys, no shared mutable state * → run concurrently (three LLM calls off the critical path).

**Exports :** `PostCriticEnrichmentDeps`, `runPostCriticEnrichment`

### `lib/agent/pipeline-steps/post-hoc-injection.ts` — 112 lignes

* POST-HOC DATA INJECTION: Evidence Tiers + Adversarial Transparency + * Multi-Lens Convergence. Extracted from pipeline-v2.ts — identical semantics. * * These fields are computed/injected AFTER the analyst and critic run, then * attached to the analysis object so the renderer can display them. * Strategic reports only.

**Exports :** `PostHocInjectionOptions`, `runPostHocInjection`

### `lib/agent/pipeline-steps/post-render-extras.ts` — 191 lignes

* POST-RENDER EXTRAS — two small cohesive units shared by the V2 and non-V2 * paths (they were byte-identical duplicates in pipeline-v2): * * 1. `injectAdversarialSection` — renders the devil's advocate verdict as an * editorial section. Deterministic; additive injection → no html bump. * 2. `runPeerReviewAndPack` — flag-gated peer review + think-tank pack. * Parallelized: both read the same input html; only the pack rewrites it * (peer review judges the pre-pack artifact in the sequential versi

**Exports :** `injectAdversarialSection`, `applyEvidenceIdsAndProseCleanup`, `PeerReviewPackDeps`, `runPeerReviewAndPack`

### `lib/agent/pipeline-steps/pre-critic-gates.ts` — 140 lignes

* PRE-CRITIC GATES — STEP 6a + 7 + 7a: structural editor review, citation * guard, deterministic claim-binding preflight. Sequential: the structural * editor may append feedback to fullContextBlock; the guard result is * returned for downstream citation counts.

**Exports :** `PreCriticGatesDeps`, `PreCriticGatesResult`, `runPreCriticGates`

### `lib/agent/pipeline-steps/provider-lists.ts` — 262 lignes

* Provider name lists + the Providers union type. * Extracted from pipeline-v2.ts (Sprint 28c) — the source of truth for * provider names. pipeline-v2 re-exports everything for compatibility.

**Exports :** `Providers`, `SHS_PROVIDERS`, `AGRICULTURE_PROVIDERS`, `CRIMINOLOGY_PROVIDERS`, `EU_SCIENCE_PROVIDERS`, `ALL_PROVIDERS`, `NEWS_PROVIDERS`, `ACADEMIC_PROVIDERS`, `GOVERNMENT_PROVIDERS`, `DEFAULT_ACADEMIC_PROVIDERS`

### `lib/agent/pipeline-steps/public-ops.ts` — 499 lignes

* Public ops layer: the scout/index/rank/read/analyst thin wrappers, * citation utilities, the legacy HTML renderer and the lineage tracker. * Extracted from pipeline-v2.ts (Sprint 28c) — pipeline-v2 re-exports the * public surface for backward compatibility; external callers * (scripts, tests, API routes) keep importing from pipeline-v2.

**Exports :** `invalidateScoutCache`, `getCacheStatus`, `scout`, `index`, `RankOptions`, `rank`, `read`, `validateTopicConsistency`, `analyst`, `activeRuns`, `citationGuard`, `dedupeCitations`, `renderBriefHTML`, `DataLineage`, `createLineageTracker`

### `lib/agent/pipeline-steps/quality-loop.ts` — 138 lignes

* POST-RENDER QUALITY LOOP (Karpathy Loop pattern, inspired by Cortis). * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary. * * If trust score is below publication threshold after all quality gates, * retry citation repair + claim grounding with more aggressive settings. * This prevents HELD on reports that are just under the threshold (trust 55-64). * Cost: $0 (deterministic, CPU-only). Only 1 retry to avoid infinite loops.

**Exports :** `runPostRenderQualityLoop`

### `lib/agent/pipeline-steps/rank-enrichment.ts` — 681 lignes

* RANK + ENRICHMENT — STEP 4: rank → pertinence selection (quality bar + * elbow detection) → source-quality rerank → domain relevance filter → * abort-on-empty → adaptive enrichment reasoning (targeted re-scout, * refusal-retry with reformulation) → orchState source stats → evidence * registry. * * Refusal paths return `{ refused: true }`; the caller performs the early * pipeline return (idempotency cleanup + result object). `topSources` is * mutated in place (loadBearing tags, composite rerank

**Exports :** `RankEnrichmentDeps`, `RankEnrichmentResult`, `runRankAndEnrichment`

### `lib/agent/pipeline-steps/reader-block.ts` — 478 lignes

* READER BLOCK — STEP 5: memory injection → parallel [reader V3, framing * (suppressed), quant, quant bridge] → stats → context compression → * evidence bank → fullText attach → orchestrator assess → self-correction * → DEEPEN → hypothesis judge → DPP synthesis → adaptive RAG → * round-table deliberation. * * `topSources` is mutated in place (fullText attach, DEEPEN). Everything * downstream needs is returned: readings + quant artifacts + the context * blocks that feed the analyst prompt.

**Exports :** `ReaderBlockDeps`, `ReaderBlockResult`, `runReaderBlock`

### `lib/agent/pipeline-steps/relevance-screen.ts` — 71 lignes

* Late-addition relevance screen — shared by rank-enrichment and gap-fill. * * Sources that enter the corpus AFTER the initial topical screen (enrichment * merges, refusal-retry, snowball, blackboard gap requests, post-analyst * enrichment) were never scored against the research question. This helper * runs one bounded batch LLM call over the unscreened candidates and returns * the ids scored 0 (off-topic) so callers can drop them and keep them out of * later re-ranks. * * Fail-open by design: a

**Exports :** `RelevanceScreenResult`, `screenSourcesForRelevance`

### `lib/agent/pipeline-steps/render-editor.ts` — 242 lignes

* RENDER EDITOR step — extracted from pipeline-v2.ts (the renderEditorHtml * closure + mapProspectiveToRenderFormat). Identical semantics. * * The legacy `renderBriefHTML` fallback stays in pipeline-v2.ts (exported * API surface) and is injected via `renderBriefFallback` — no circular import.

**Exports :** `RenderEditorContext`, `mapProspectiveToRenderFormat`, `runRenderEditorStep`

### `lib/agent/pipeline-steps/scout-block.ts` — 552 lignes

* SCOUT BLOCK — STEP 1: durable-resume seedIds → deep planner (DAG scout + * mutable expansion + dynamic replan) → flat scout with speculative parallel * reformulations → witness observe → orchestrator assess → RE_SCOUT loop * with adaptive providers + stuck-loop detection. * * Returns `allSourceIds` + `planNodesForAudit` (consumed by the post-render * process audit). `orchState` and `stats` are mutated in place.

**Exports :** `ScoutBlockDeps`, `ScoutBlockResult`, `runScoutBlock`

### `lib/agent/pipeline-steps/scout-enrichment-index.ts` — 246 lignes

* SCOUT ENRICHMENT + INDEX — the zone between the raw scout fan-out and the * rank: web fallback (only when critically low on sources), intelligent * scout (multi-lens), citation graph traversal, durable checkpoint, then * INDEX → EMBED → DEDUPLICATE. * * Perf: the eight web-fallback providers run concurrently — each only * contributes source ids; results are appended in deterministic provider * order after the barrier.

**Exports :** `ScoutEnrichmentIndexDeps`, `runScoutEnrichmentAndIndex`

### `lib/agent/pipeline-steps/scout-impl.ts` — 1327 lignes

* SCOUT provider fan-out: deadline-bounded parallel calls across ~100 * providers, with the provider-health circuit breaker recording each call. * Extracted from pipeline-v2.ts (Sprint 28c) — the public `scout()` wrapper * (governance assert + Redis cache) stays in pipeline-v2 and calls this.

**Exports :** `scoutImpl`

### `lib/agent/pipeline-steps/self-correct-checkpoint.ts` — 48 lignes

* SELF-CORRECT CHECKPOINT: QUALITY LOOP (final trust score). * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary.

**Exports :** `runFinalSelfCorrectCheckpoint`

### `lib/agent/pipeline-steps/style-sweep-recheck.ts` — 210 lignes

* STYLE GATES → COPY EDITOR → SIGNAL SWEEP → DA RE-CHECK. * Extracted from pipeline-v2.ts — identical semantics, one cohesive unit. * * Coupling rationale (why these three stay together): style gates post * `style_violation` signals consumed by the sweep; the sweep's revision editor * mutates html; the DA re-check re-judges the corrected artifact. Splitting * them would re-introduce the stale-evaluator class the S28 versioning fixed.

**Exports :** `runStyleSweepRecheck`

### `lib/agent/pipeline-steps/thesis-binding.ts` — 196 lignes

* Thesis-binding adherence — verify + routed repair. * * The central claim was contracted FROM the corpus upstream (best-supported * judged hypothesis). A verdict that exceeds it is speculation-as-thesis: * exactly what the DA later kills. `verifyThesisBindingStage` is a cheap * check; non-adherence is recorded on stats.thesisBinding and surfaced to * the gate diagnostics without blocking. * * `runThesisBindingRepair` (post-analyst only) consumes one re-analysis * slot to re-run the analyst unde

**Exports :** `ThesisBindingDeps`, `verifyThesisBindingStage`, `runThesisBindingRepair`

### `lib/agent/pipeline-steps/time-budget.ts` — 89 lignes

* RUN-TIME HEADROOM — shared wall-clock guards for expensive escalation * steps (TTS second candidate, gap-fill re-analysis, DA rewrite). * * S34 live-run finding: a TTS candidate + an outline-critic re-analysis * stacked ~20min of extra analyst passes on top of a 35min scout, and the * run died at the 75min timeout mid-pass — zero artifact judged, ~$1.5 * burned. An escalation step that cannot finish before the pipeline * deadline is pure waste: better to keep the current artifact and let * cri

**Exports :** `runDeadlineAt`, `remainingRunMs`, `hasRunHeadroom`, `REPAIR_TAIL_RESERVE_MS`, `hasRunHeadroomWithReserve`

### `lib/agent/pipeline-steps/trust-score.ts` — 223 lignes

* CANONICAL TRUST SCORE — single deterministic composite consumed by both * the post-evaluator scoring (evaluators-trust.ts) and the post-repair * re-score (quality-loop.ts). They previously blended different weights and * applied different veto sets — the loop could re-inflate a score the * canonical pass had capped (missing criticPanel/editorial-floor vetoes). * * Semantics identical to the evaluators-trust implementation: weighted * blend → ordered vetoes → clamp. Callers extract the componen

**Exports :** `TrustComponents`, `TrustVetoes`, `TrustScoreResult`, `computeTrustScore`, `rescoreTrustFromStats`, `countDistinctCitedSources`

### `lib/agent/pipeline-steps/types.ts` — 49 lignes

* Shared context for post-render tail steps extracted from pipeline-v2.ts. * * Extraction contract: the orchestrator builds ONE context object after the * HTML render, each step mutates it in place (ctx.html = ..., ctx.stats.* = * ...), and the orchestrator reads back `ctx.html` / `ctx.selfCorrectRollbacks` * afterwards. This keeps the closure-coupled blocks testable as units without * changing their semantics.

**Exports :** `TailStepContext`

### `lib/agent/pipeline-steps/verification-block.ts` — 325 lignes

* POST-RENDER VERIFICATION block: symbolic verifier → NLI citation verifier → * active repair loop → LLM deep-check → fact-checker (+ fatal sanitization). * Extracted from pipeline-v2.ts — identical semantics. * * Returns the (possibly repaired) HTML. Repairs bump the html artifact * version through the injected `bumpHtmlArtifact`; every evaluator result is * tagged via `tagEval` so stale verdicts stay detectable (Sprint 28).

**Exports :** `VerificationBlockDeps`, `runVerificationBlock`


## Orchestration & dispatch — 25 modules

### `lib/agent/adaptive-topology.ts` — 158 lignes

* Adaptive Topology Selection — NomosX * * Inspired by AdaptOrch (arXiv 2026): * - Automatically selects pipeline topology (parallel vs sequential vs hierarchical) * based on query complexity and task DAG analysis. * - Performance Convergence Scaling Law: when LLMs converge in capability, * orchestration dominates model selection. +12-23% on SWE-bench/GPQA. * * The NomosX pipeline is currently sequential fixed: * SCOUT → INDEX → RANK → READER → ANALYST → EDITOR → GUARD → PUBLISHER * * This modul

**Exports :** `TopologyType`, `TopologyPlan`, `QueryComplexitySignals`, `selectTopology`, `extractComplexitySignals`

### `lib/agent/budget-manager.ts` — 223 lignes

* Global Budget Manager — Autonomous spending control * * Prevents runaway costs by tracking cumulative spending across: * - Per-pipeline costs (already tracked) * - Per-cycle costs (already tracked in think-tank-dispatcher) * - Per-day / per-month / per-year cumulative spending (NEW) * * Features: * - Monthly cap (default $100, configurable via NOMOSX_MONTHLY_BUDGET_USD) * - Daily cap (default $10, configurable via NOMOSX_DAILY_BUDGET_USD) * - Anomaly detection: alerts if single run > 3× averag

**Exports :** `BudgetStatus`, `recordSpend`, `getBudgetStatus`, `checkBudgetGate`, `getBudgetReport`

### `lib/agent/cadence-enforcer.ts` — 322 lignes

* NomosX Cadence Enforcer Agent * * Checks and enforces publication rate limits * Part of the Institutional Think Tank pipeline

**Exports :** `cadenceEnforcer`, `recordPublication`, `resetDailyCounters`, `resetWeeklyCounters`

### `lib/agent/conductor-orchestrator.ts` — 393 lignes

* Conductor — Deterministic Orchestration for Multi-Agent Workflows * * Inspired by: Microsoft Conductor (2026) — MIT License * Key innovation: YAML-defined workflows with Jinja2 routing templates, * zero tokens spent on orchestration, deterministic execution. * * In NomosX, this provides a lightweight alternative to the LLM-driven * Meta-Controller. Instead of spending LLM tokens on orchestration decisions, * the workflow is defined declaratively and executed deterministically. * * Benefits: * 

**Exports :** `WorkflowStep`, `Workflow`, `ExecutionResult`, `WorkflowExecution`, `BRIEF_WORKFLOW`, `STRATEGIC_WORKFLOW`, `evaluateCondition`, `getNextSteps`, `pruneOptionalSteps`, `getWorkflow`

### `lib/agent/deep-planner.ts` — 386 lignes

* NomosX DEEP PLANNER — Research Question Decomposition * * LOT 2.1: Decomposes a research question into a DAG of sub-questions. * Each sub-question becomes a node with dependencies on parent nodes. * * The plan is executed by the pipeline (LOT 2.2) in topological order: * 1. Scout each node independently * 2. Inject parent results as context for child nodes * 3. If a node yields < 5 sources, expand its sub-questions (LOT 2.3)

**Exports :** `ResearchNode`, `ResearchPlan`, `DeepPlannerResult`, `deepPlan`, `replanFromFindings`, `topologicalSort`, `getAncestorSourceIds`

### `lib/agent/graph-of-agents.ts` — 210 lignes

* Graph-of-Agents (GoA) — NomosX * * Inspired by: * - Graph-of-Agents (S15-02, ICLR 2026): Instead of invoking all N agents in a * Mixture-of-Agents setup, GoA selects the K most relevant agents based on * "model cards" (declared capabilities), evaluates pairwise response * relevance, and routes messages along a directed graph. This reduces cost * and latency while improving signal-to-noise over flat MoA aggregation. * * Architecture: * 1. `selectAgents()` — scores each available agent by keywor

**Exports :** `AgentNode`, `AgentEdge`, `GoAConfig`, `DEFAULT_GOA_CONFIG`, `selectAgents`, `buildAgentGraph`, `poolResponses`

### `lib/agent/inquiry-funnel-utils.ts` — 257 lignes

* Inquiry Funnel — Shared utilities (single source of truth) * Used by inquiry-pipeline + inquiry-orchestrator only.

**Exports :** `normalizeTopicKey`, `countWordsHtml`, `getPipelineCostUsd`, `publicationTypeToDepth`, `depthToPublicationType`, `getCompletedAdversarialEvaluation`, `PipelineScores`, `isModerateTierEligible`, `extractPipelineScores`

### `lib/agent/inquiry-orchestrator.ts` — 1321 lignes

* Inquiry Orchestrator — Publication funnel (shared infrastructure) * ─────────────────────────────────────────────────────────────────── * * PRODUCT HIERARCHY: * PRIMARY → ThinkTankDispatcher (autonomous crons) * ADD-ON → Studio — on-demand, quota-based * * Flow: VALIDATE → RUN (inquiry-pipeline) → GATE → PERSIST * All paths MUST use runAndPublishInquiry().

**Exports :** `InquiryPublishSource`, `InquiryPublishStatus`, `InquiryPublishRequest`, `InquiryPublishResult`, `runAndPublishInquiry`, `runInquiryOnly`

### `lib/agent/inquiry-pipeline.ts` — 637 lignes

* Inquiry Pipeline — Unified publication runner * ────────────────────────────────────────────── * Wraps runPipeline to produce Inquiry + full pipeline artifacts. * * Funnel position: RUN step (called by inquiry-orchestrator for GATE → PERSIST).

**Exports :** `RunInquiryPipelineInput`, `InquiryPipelineResult`, `runInquiryPipeline`

### `lib/agent/orchestrator.ts` — 398 lignes

* NomosX ORCHESTRATOR AGENT — Adaptive Pipeline Controller * * Unlike a static sequential pipeline, the Orchestrator makes decisions * at each step and can loop back when quality is insufficient: * * 1. ASSESS — Evaluate source quality after SCOUT. Not enough? Re-scout with broader terms. * 2. DEEPEN — After READER, check if abstracts are sufficient. Need full-text? Trigger PDF extraction. * 3. CHALLENGE — After ANALYST, check confidence. Low? Request more sources or a targeted debate. * 4. PIVO

**Exports :** `OrchestratorAction`, `OrchestratorDecision`, `PipelineState`, `loadCalibratedThresholds`, `assessAfterScout`, `assessAfterReader`, `assessAfterAnalyst`, `assessAfterCriticalLoop`, `generateExpandedTerms`, `createPipelineState`, `recordDecision`

### `lib/agent/pipeline-context.ts` — 227 lignes

* Pipeline Blackboard — Shared context across all agents (2026 pattern). * * Inspired by the Blackboard architecture pattern: all agents read/write * to a shared context object. This breaks silos between SCOUT → RANK → * READER → ANALYST → EDITOR by allowing: * * - ANALYST to request targeted re-search from SCOUT via `requestSourceGap()` * - EDITOR to see gaps identified by ANALYST via `getFindings()` * - READER to see which sources SCOUT found most relevant via `getFindings()` * - Any agent to 

**Exports :** `PipelineFinding`, `SourceGapRequest`, `PipelineBlackboard`, `PipelineContext`

### `lib/agent/pipeline-foresight.ts` — 161 lignes

* Foresight (Monte Carlo swarm) — shared between runPipelineCore and inquiry-pipeline.

**Exports :** `parsePriorProbability`, `roundPercentages`, `applySimulationToAnalysis`, `PipelineForesightInput`, `PipelineForesightResult`, `runPipelineForesight`

### `lib/agent/pipeline-progress.ts` — 208 lignes

* NomosX Pipeline Progress Streaming * * P2/9: EventEmitter-based progress tracking for pipeline execution. * Enables SSE streaming of step-by-step updates to the client.

**Exports :** `PipelineStep`, `PipelineProgressEvent`, `setProgressPersistenceHook`, `emitProgress`, `onProgress`, `createProgressStream`

### `lib/agent/pipeline-types.ts` — 1241 lignes

* PIPELINE TYPES — Typed stats, lineage, and shared interfaces * * Replaces `stats: any` with a fully typed PipelineStats interface. * Every pipeline step writes to a well-defined structure.

**Exports :** `EvalVersionTag`, `PipelineStats`, `DataLineage`, `createLineageTracker`, `recordTransformation`, `exportLineageJSON`, `APACitation`, `formatAPA`, `renderAPAHtml`

### `lib/agent/pipeline-v2.ts` — 2113 lignes

Cohere reranking, batch ops, governance, lineage tracking. * * SCOUT â†’ INDEX â†’ RANK â†’ READER â†’ ANALYST â†’ EDITOR â†’ GUARD â†’ PUBLISHER

**Exports :** `PipelineCoreOptions`, `runFullPipeline`, `ReportFormat`, `StrategicPipelineOptions`, `runStrategicPipeline`, `runPipeline`, `runIntelligenceSweep`

### `lib/agent/process-audit.ts` — 110 lignes

* Process Audit — the PING taxonomy (arXiv 2601.22984) applied to our * trajectory. End-to-end evaluation misses hallucinations that originate in * intermediate steps. PING splits them into four types; we cover three * deterministically (Grounding is already covered by NLI/claim-grounding): * * - INTENT: did the planner decompose the actual question, or drift? * - PROPAGATION: did early errors/thin research silently drop sub-questions * that the final analysis then never addresses? * - NOISE: wh

**Exports :** `ProcessAuditResult`, `auditProcessTrace`

### `lib/agent/publication-generator.ts` — 613 lignes

* NomosX Publication Generator Agent * * @deprecated New production paths MUST use runAndPublishInquiry() from inquiry-orchestrator. * This module remains for legacy signal-template generation only.

**Exports :** `PublicationGeneratorOutput`, `selectPublicationType`, `generatePublication`

### `lib/agent/publication-reserve.ts` — 151 lignes

_(no docstring — voir le code source)_

**Exports :** `ReserveArtifact`, `ReserveCertificate`, `certifyForReserve`, `validateReserveCertificate`, `releaseReservedPublication`

### `lib/agent/run-plan.ts` — 119 lignes

* RUN PLAN — the orchestrator's up-front execution governor. * * Today every stage re-derives its own admission from scattered headroom * guards (reserve, corpus cap, P2 tiers, fact-check windows). Decisions * are reactive: a stage discovers at its turn that the budget is gone and * degrades locally — which is how live runs ended with verification * starved (566s < 600s flat gate → 0/21 claims LLM-verified) while * earlier stages had already spent the tail's window. * * The run plan inverts that

**Exports :** `RunProfile`, `RunPlan`, `RunPlanInput`, `computeRunPlan`

### `lib/agent/signal-detector.ts` — 822 lignes

* NomosX Signal Detector Agent * * Detects meaningful signals from newly ingested sources * Part of the Institutional Think Tank pipeline * * SOCIAL SIGNAL INTEGRATION (2026): * Social media signals (Reddit, Hacker News, Bluesky) feed into the * signal detection pipeline as a SEPARATE FLOW — they never enter the * SCOUT→INDEX→RANK evidence pipeline. This prevents social media noise * from contaminating analytical briefs while still capturing emerging * trends and weak signals for the radar.

**Exports :** `SignalDetectorOutput`, `signalDetector`, `NewsSignalInput`, `processNewsSignals`, `fetchSocialSignals`, `processSocialSignals`

### `lib/agent/signals.ts` — 408 lignes

* SIGNAL BUS + MISSION — the collective-intelligence substrate. * * Inspired by stigmergic coordination (SBP — Stigmergic Blackboard Protocol): * agents do NOT message each other directly. They post *needs* on the shared * blackboard as typed signals with intensity and decay; any agent that has a * registered resolver for that type senses the signal at the next sweep * checkpoint and resolves it. Adding a new capability = registering a new * resolver — the pipeline flow never changes. * * critic

**Exports :** `SignalType`, `AgentSignal`, `SignalResolution`, `SignalResolver`, `BatchSignalResolver`, `MissionTargets`, `Mission`, `SignalBus`, `PersistentSignalBus`, `rehydrateSignalBus`

### `lib/agent/think-tank-dispatcher.ts` — 1517 lignes

* Think Tank Dispatcher — Autonomous brain (PRIMARY product path) * ───────────────────────────────────────────────────────────── * Studio is a paid add-on. This module is the core NomosX loop: * * SENSE → DECIDE → DISPATCH → runAndPublishInquiry() * * Modes: * • breaking — 2×/day radar + Editor-in-Chief (auto-scan cron) * • weekly — editorial plan + signal fallback (generate-briefs cron) * * Crons are thin HTTP wrappers; all logic lives here.

**Exports :** `selectFormatFromSignal`, `ThinkTankCycleMode`, `ThinkTankStrategy`, `ThinkTankDispatchItem`, `ThinkTankCycleProgress`, `ThinkTankCycleOptions`, `ThinkTankDispatchOutcome`, `ThinkTankCycleResult`, `CadenceState`, `getWeeklyPublicationMax`, `getCadenceState`, `verticalHasCapacity`, `executeDispatchQueue`, `runThinkTankCycle`, `getThinkTankStatus`

### `lib/agent/think-tank-pack.ts` — 517 lignes

* Think Tank Quality Pack — NomosX * * Pousse un brief académique au niveau d'une note de think tank renommée * (RAND, Brookings, Chatham House, IFRI) en ajoutant : * 1. Recommandations actionnables par stakeholder * 2. Options / trade-offs explicites * 3. Analyse économique et régulatoire * 4. Relecture éditoriale (anti-répétitions, anti-coquilles, ton) * * Inspirations : * - Takshashila Scholar (policy brief draft, stakeholder analysis) * - RAND / Brookings / Chatham House report structure * -

**Exports :** `Stakeholder`, `Recommendation`, `PolicyOption`, `PolicyRecommendations`, `PolicyEconomics`, `EditorialPolish`, `ThinkTankPackOptions`, `generatePolicyRecommendations`, `generatePolicyEconomics`, `polishEditorial`, `augmentThinkTankHtml`

### `lib/agent/topic-classifier.ts` — 924 lignes

* NomosX UNIFIED TOPIC CLASSIFIER * * Single source of truth for topic → domain → researchers → vertical routing. * Replaces the 3 independent keyword-based classification systems: * - researcher-ownership.ts detectOwners() * - signal-detector.ts classifyVertical() * - smart-provider-selector.ts detectDomain() * * Architecture: LLM-based classification with rule-based fast path fallback. * The LLM classifier understands nuance (e.g., "AI regulation in the EU" → law + technology). * * Design prin

**Exports :** `TopicClassification`, `DomainDomainScore`, `AssignedResearcher`, `classifyTopic`, `classifyTopicSync`, `classifyVerticalUnified`, `detectDomainUnified`, `getPrimaryResearcherUnified`, `getProvidersForTopic`

### `lib/agent/topic-radar.ts` — 800 lignes

* NomosX TOPIC RADAR V3 — Maximum Coverage Breaking Topic Detection * * 6 parallel source sweeps, <35 seconds total: * * 1. GDELT — 14 verticals: geopolitics, AI, climate, health, finance, * energy, trade, cyber, biotech, emerging-mkts, social, science, EU, digital * 2. RSS Elite — 30 feeds: think tanks + news wires + central banks + policy orgs * 3. Academic — OpenAlex trending + arXiv (cs/econ/q-fin) + Semantic Scholar * 4. Policy/Data— NBER, VoxEU, World Bank, IMF Blog, Eurostat, UN News * 5.

**Exports :** `RadarTopic`, `RadarSweepResult`, `runTopicRadar`


## Editorial & planning — 21 modules

### `lib/agent/author-innovator-detector.ts` — 361 lignes

* NomosX Author Innovator Detector * * Identifies the most innovative, cross-domain, and heterodox authors * from a pool of sources. Unlike traditional h-index ranking, this system * looks for: * * 1. CITATION VELOCITY — authors whose recent work is being cited faster than their older work * 2. CROSS-DOMAIN IMPACT — authors who publish across multiple disciplines * 3. HETERODOX SIGNALS — authors who challenge consensus (low agreement with mainstream) * 4. EMERGING VOICES — authors with low total

**Exports :** `AuthorProfile`, `InnovatorDetectionResult`, `detectInnovatorAuthors`, `generateInnovatorPromptBlock`

### `lib/agent/casting-agent.ts` — 207 lignes

* CASTING AGENT — Assemble a cross-domain reasoning team for productive friction. * Public briefs expose lenses (domains), not PhD personas.

**Exports :** `castingAgent`

### `lib/agent/debate-agent.ts` — 288 lignes

* NomosX DEBATE Agent — Adversarial Deliberation * * A dedicated agent that generates the STRONGEST possible counter-arguments * to any analysis. Unlike the adversarial reviewer in Critical Loop (which * reviews a draft), this agent operates at the EVIDENCE level: * * 1. Takes the analysis question + sources + readings * 2. Identifies the dominant thesis * 3. Constructs the STEEL MAN of the opposing view * 4. Finds evidence FROM THE SAME SOURCES that supports the counter * 5. Produces a structur

**Exports :** `DebateArgument`, `DebatePosition`, `DebateResult`, `debateAgent`

### `lib/agent/domain-classifier.ts` — 201 lignes

* Domain Classification Agent * * Classifie automatiquement les sources dans un ou plusieurs domaines * basé sur title, abstract, topics et JEL codes

**Exports :** `classifySourceDomains`, `classifyBatchSources`, `classifyUnclassifiedSources`

### `lib/agent/domain-expert.ts` — 1666 lignes

* Domain Expert Interface - Expertise-based personas (no institutional claims) * * Replaces PhD Researcher with domain-specialized experts * Each expert has verifiable expertise without institutional affiliations

**Exports :** `DomainExpert`, `ExpertAnalysis`, `DOMAIN_EXPERTS`, `getExpertById`, `getExpertsByDomain`, `getAllExperts`, `DomainExpertLearning`, `getExpertLearning`, `updateExpertLearning`, `getAdaptedMethodologies`

### `lib/agent/editor-agent.ts` — 1391 lignes

* EDITOR AGENT — Publication-Grade HTML Rendering * * Produces think-tank quality HTML publications with: * - Branded header with metadata bar (date, sources, trust score, reading time) * - Executive summary card with key findings * - Professional typography and spacing * - APA 7th edition citations with DOI links * - Source distribution visualization * - Responsive design for print and screen * - [SRC-N] → clickable superscript references * * Output quality benchmark: McKinsey Quarterly, Brooki

**Exports :** `dedupeCitations`, `renderProfessionalBriefHTML`, `renderProfessionalStrategicHTML`

### `lib/agent/editor-in-chief.ts` — 455 lignes

* NomosX EDITOR-IN-CHIEF — LLM Triage for Breaking Topics * * The "DECIDE" step in the DETECT → DECIDE → DELEGATE architecture. * Takes raw RadarTopic[] from TopicRadar and decides: * * 1. Is this NEW? (not already covered in recent publications) * 2. Is this URGENT? (time-sensitive, breaking) * 3. Do we have an ANGLE? (can our researchers add value?) * 4. What FORMAT? (brief vs strategic) * 5. WHO handles it? (which researcher, which providers) * * Single LLM call with gpt-4o-mini — fast, cheap

**Exports :** `EditorialDecision`, `EditorialTriageResult`, `editorialTriage`

### `lib/agent/editorial-arbiter.ts` — 464 lignes

* EDITORIAL ARBITER — Institute position after evidence, debate, and foresight. * Output is position-first: verdict + scenario distribution + traceability.

**Exports :** `ArbiterInput`, `editorialArbiter`

### `lib/agent/editorial-config.ts` — 81 lignes

* Editorial V2 feature flag — position-first, foresight-in-core pipeline reorder. * When false: legacy step order (editor at step 8).

**Exports :** `isEditorialV2Enabled`, `getPipelineMaxBudgetUsd`, `NOMOS_EDITORIAL_LINE`, `NOMOS_EDITORIAL_LINE_SHORT`

### `lib/agent/editorial-planner.ts` — 385 lignes

* NomosX EDITORIAL PLANNER — Autonomous Topic Selection & Agenda * * Like France Stratégie's editorial committee, this agent: * 1. Analyzes Knowledge Graph trends to find emerging topics * 2. Detects coverage gaps (important topics never analyzed) * 3. Identifies stale briefs that need revisiting (data changed) * 4. Proposes a prioritized editorial agenda * 5. Self-commissions analyses when confidence is high enough * * Schedule: Runs weekly (before generate-briefs cron) to plan the week's outpu

**Exports :** `EditorialProposal`, `EditorialReason`, `EditorialAgenda`, `planEditorialAgenda`

### `lib/agent/editorial-scenarios.ts` — 75 lignes

* Ensure ≥2 scenarios exist before Monte Carlo foresight (Editorial V2). * Analyst multipass does not emit scenarios — derive from consensus / debate / implications.

**Exports :** `ensureEditorialScenarios`

### `lib/agent/editorial-types.ts` — 226 lignes

* Editorial V2 — position-first brief structure. * Detected subject → cross-domain team → scenarios → institute position.

**Exports :** `EditorialDimension`, `CastTeamMember`, `CastingResult`, `ScenarioOutlook`, `ProspectiveFramework`, `InstitutePosition`, `CentralScenarioDecision`, `resolveCentralScenario`, `centralScenarioIssues`, `PositionFirstBriefInput`, `dimensionsFromClassification`, `formatDomainLabel`, `collisionLabel`

### `lib/agent/enrichment-reasoner.ts` — 380 lignes

* NomosX ENRICHMENT REASONER — Adaptive Evidence Sufficiency Assessment * * Replaces fixed thresholds (minSourceCount, minEvidenceCount) with * LLM-based reasoning about whether the current evidence base is sufficient * for the specific topic, domain, and publication format. * * This is NOT a critique layer — it does not evaluate output quality. * It is an ENRICHMENT DECISION layer: it decides whether to search more * or proceed with available evidence. Effort goes toward research, not rewriting

**Exports :** `EnrichmentVerdict`, `EnrichmentAssessment`, `EvidenceGap`, `MetaCognitiveState`, `buildMetaCognitiveState`, `formatMetaCognitiveBlock`, `assessEvidenceSufficiency`

### `lib/agent/nomos-voice.ts` — 176 lignes

* nomos-voice.ts — The editorial DNA of NomosX. * * NomosX is neither McKinsey, nor RAND, nor Institut Montaigne, nor Harvard. * It is the institute that binds order, verification, and scenarios into a * position worth defending. "From Chaos to Nomos" is not a tagline — it is * the movement every report must perform. * * This file is the single source of truth for the NomosX editorial voice. * It is injected into the editorial arbiter prompt above any style-profile * layer, so that the DNA persi

**Exports :** `NOMOS_EDITORIAL_MANIFESTO`, `NOMOS_DEFAULT_LABELS`, `NOMOS_WRITING_RULES`

### `lib/agent/perspective-questions.ts` — 101 lignes

* Perspective-Guided Question Generation — Co-STORM method (EMNLP 2024). * * Stanford's STORM showed that directly prompting an LLM to "ask questions" * produces shallow, redundant queries. Their fix: first discover distinct * expert PERSPECTIVES on the topic, then generate questions each perspective * would actually ask. This systematically covers dimensions that a generic * "enhance this query" pass misses (e.g., legal/sovereignty angles on a * geopolitics topic, ethical framings on a tech top

**Exports :** `PerspectiveQuestionResult`, `generatePerspectiveQueries`

### `lib/agent/policy-council.ts` — 211 lignes

* POLICY COUNCIL — NomosX * * Conseil deliberatif multi-perspectives a la maniere de : * - Claude Policy Council (adamconner) : 19+ agents votant * - LLM Council Policy Ideation (danielrosehill) : 6 lenses + chairman * - CouncilVerse (Relay-Launch) : formations pretes a l'emploi * * Objectif : obtenir une recommandation politique eprouvee par plusieurs * ideologies et specialites, avec desaccords explicites et synthese.

**Exports :** `PolicyPersona`, `PolicyPerspective`, `PolicyReview`, `PolicyRecommendation`, `PolicyCouncilReport`, `PolicyCouncilOptions`, `runPolicyCouncil`, `renderPolicyCouncil`

### `lib/agent/positioning-agent.ts` — 227 lignes

* Positioning Agent — editorial differentiation vs the field. * * What a senior editor does before green-lighting a piece: "what has the * competition already published on this, and what do we add?" Publications * that re-synthesize the field consensus are commodity; the differentiator * is occupying a position nobody else holds — with better evidence. * * Pipeline: * 1. COMPETITOR CORPUS: retrieve competing analyses from think-tank * providers (brookings, carnegie, chatham-house, rand, cfr, ecf

**Exports :** `CompetitorPiece`, `DifferentiationDirective`, `PositioningBrief`, `buildPositioningBrief`

### `lib/agent/research-agenda.ts` — 147 lignes

* NomosX RESEARCH AGENDA — the editorial desk layer. * * The radar finds what is happening; the triage picks what is publishable. * Neither decides what the INSTITUTION should be covering. This module is * that missing layer: a deterministic, DB-grounded account of domain * coverage over a trailing window, the flagship questions each domain has * answered best, and the deficit signal the Editor-in-Chief needs to keep * the publication mix honest over weeks — not just within one cycle. * * Pure r

**Exports :** `DomainCoverage`, `ResearchAgendaContext`, `buildResearchAgendaContext`, `agendaPriorityBoost`

### `lib/agent/round-table.ts` — 336 lignes

* Round-Table Deliberation (ReConcile-style) — NomosX * * Inspired by: * - ReConcile (ACL 2024): Multi-model multi-agent round table conference * with confidence-weighted voting. Outperforms GPT-4 on three datasets. * - Reasoning Jury (arXiv 2026): Jury of open-weight models outperforms * frontier models at 16-88% of cost. * - LLM-jury (arXiv 2026): Agreement structure as verification signal. * - DAR Library: Fast multi-agent debate (100x faster). * * Architecture: * - For controversial topics, 

**Exports :** `DeliberationParticipant`, `DeliberationRound`, `DeliberationResult`, `deliberate`

### `lib/agent/schools-of-thought.ts` — 174 lignes

* Schools of Thought — rival epistemic traditions per contested domain. * * A PhD-level debate is not "thesis vs generic counter" — it is a clash of * established schools with named positions, canonical claims, and known * critiques. This registry gives the debate agent real opponents: the * steel-man is built FROM a school's position, not invented on the spot. * * Coverage: the most contested domains first. Each school carries its core * claims and its standard critique — enough to run a real a

**Exports :** `SchoolOfThought`, `SCHOOLS_OF_THOUGHT`, `buildSchoolsBlock`

### `lib/agent/source-reputation-agent.ts` — 295 lignes

* NomosX SOURCE REPUTATION AGENT — Persistent Source Quality Learning * * P3-M: Sources that consistently contribute to high-quality analyses * should have their qualityScore boosted over time. Sources that are * consistently ignored or associated with low-trust outputs should decay. * * This creates a self-improving source library where the best sources * rise to the top automatically. * * Process: * 1. After each pipeline run, record which sources were used + final trust score * 2. Periodicall

**Exports :** `SourceReputation`, `ReputationUpdateResult`, `recordSourceUsage`, `updateSourceReputations`, `getTopReputationSources`, `getSourceReputationReport`


## Analyst & drafting — 31 modules

### `lib/agent/adaptive-rag.ts` — 589 lignes

* Adaptive RAG — NomosX Sprint 6 (Gap 4) * * RAG adaptatif avec reflection tokens et corrective retrieval. * Inspiré de : * - Self-RAG (ICLR 2024, arxiv 2310.11511) — reflection tokens pour contrôle à l'inference * - CRAG (arxiv 2401.15884) — retrieval evaluator + web search fallback * - Adaptive RAG (NAACL 2024) — adaptive retrieval strategy * * Le problème : * Le retrieval NomosX est *pipeline-fixe* (SCOUT→RANK→READER). L'agent ne peut pas * décider dynamiquement *pendant son raisonnement* s'i

**Exports :** `ReflectionToken`, `RetrievalConfidence`, `RetrievalEvaluation`, `CorrectiveAction`, `AdaptiveRetrievalResult`, `AdaptiveRAGConfig`, `predictRetrieveToken`, `evaluateRetrieval`, `critiqueSupport`, `adaptiveRetrieve`, `buildReflectionTokenHint`, `SourceForAssessment`, `ReadingForAssessment`, `RetrievalSufficiencyAssessment`, `assessRetrievalSufficiency`

### `lib/agent/analysis-repair.ts` — 75 lignes

_(no docstring — voir le code source)_

**Exports :** `applyAnalysisRepair`, `criticReviewText`, `repairImproves`

### `lib/agent/analysis-review-text.ts` — 93 lignes

* Plain-text analysis bundle for epistemic review before final HTML render (Editorial V2).

**Exports :** `buildAnalysisReviewText`

### `lib/agent/analyst-multipass.ts` — 2004 lignes

* ANALYST Agent V3 — Prospective Multi-Pass Analysis * * NomosX does not produce analyses of topics. It isolates the strongest, * most non-obvious cross-domain causal chain, refutes it until it breaks * or holds, extrapolates its trajectory toward a dated future, and takes * ONE position — rendered in institute prose where the machinery stays * invisible. * * PASS 1 — FRICTION MAPPING: Extract mechanisms with trajectory, identify cross-domain collisions * PASS 2 — STRESS TEST: Try to break every

**Exports :** `TemporalStatus`, `FrictionMap`, `StressTestMap`, `CausalLink`, `ProspectiveNote`, `AnalysisOutput`, `MultiPassAnalysis`, `ThematicMap`, `ContradictionMap`, `analystAgentV3`

### `lib/agent/context-primer.ts` — 443 lignes

* NomosX CONTEXT PRIMER — Institutional Memory Injection * * Before every analysis, this agent: * 1. Queries the Knowledge Graph for related concepts * 2. Retrieves prior briefs on the same/similar topics * 3. Identifies what has changed since last analysis * 4. Builds a structured context block for the ANALYST * * This is what transforms NomosX from a stateless tool into a persistent think tank. * France Stratégie remembers what it published — so does NomosX.

**Exports :** `PrimedContext`, `primeContext`

### `lib/agent/copy-editor.ts` — 130 lignes

* COPY EDITOR — NomosX * * The missing newsroom role: style gates and the editorial panel DETECT prose * defects (AI tells, filler, clichés) but nothing fixed them. This agent turns * detections into surgical, verified edits. * * Design (edit-list contract, not free-form rewrite): * - The LLM receives the flagged phrases + editorial findings and returns a * list of { find, replace, reason } edits — never full HTML. This avoids the * failure mode of polishEditorial (stripped text in, "HTML" out =

**Exports :** `CopyEditResult`, `RawEdit`, `applySurgicalEdits`, `copyEditHtml`

### `lib/agent/cross-source-signals.ts` — 266 lignes

* Cross-Source Signal Detection — NomosX * * Inspired by: * - Signal Hunter: Cross-source signals with 1.5x multiplier for topics * in 2+ sources, velocity tracking (accelerating, new, fading, steady) * - Breaking News Monitor: Multi-source corroboration (2+ sources = higher confidence) * - SignalForge: 3-stage LLM pipeline with 6-factor scoring * - GlobalPulse: 35+ data layers with AI-powered risk scoring * * Architecture: * - After topic radar collects items from RSS feeds, cluster by topic * 

**Exports :** `NewsItem`, `SignalCluster`, `clusterByTopic`, `detectCrossSourceSignals`, `formatSignalClusters`

### `lib/agent/dpp-synthesis.ts` — 350 lignes

* DPP (Determinantal Point Process) Synthesis — NomosX * * Inspired by: * - "Principled Content Selection for Multi-Document Summarization" (ACL 2025): * Three-step approach: (1) reduce documents to atomic key points, * (2) use DPP to select diverse key points, (3) rewrite to final summary. * - Addresses "lost in the middle" phenomenon in LLMs. * - Increases source coverage on multi-document tasks. * * Architecture: * - Step 1: Extract atomic key points from each source's readings * - Step 2: Co

**Exports :** `AtomicKeyPoint`, `DPPSelection`, `extractAtomicKeyPoints`, `selectDiverseKeyPoints`, `formatKeyPointsForAnalyst`

### `lib/agent/hall-detect.ts` — 301 lignes

* HallDetect — Lightweight Reference-Free Hallucination Detection (NomosX) * * Inspired by: * - HallDetect (S15-07, arXiv 2026): Decomposed entailment with a contrastive * formulation for reference-free hallucination detection. Runs as a * lightweight complement to mDeBERTa-v3 NLI, catching internal * contradictions and unsupported claims without an LLM in the loop. * * Architecture: * 1. `decomposeClaims()` — splits text into atomic, sentence-level claims. * 2. `detectInternalContradictions()` 

**Exports :** `FlaggedClaim`, `ContradictionPair`, `UnsupportedClaim`, `HallucinationScore`, `decomposeClaims`, `detectInternalContradictions`, `detectUnsupportedClaims`, `hallDetect`

### `lib/agent/intelligent-scout.ts` — 1033 lignes

* NomosX Intelligent Scout — Multi-lens adaptive retrieval. * * Replaces the "collect everything" approach with a targeted, multi-lens strategy * that finds both consensus sources AND eclectic/divergent material for scenario planning. * * Inspired by: * - AutoSearch (2026): Adaptive search depth — stop when enough evidence * - EACL 2026: Exploration-exploitation bandit for sub-query selection (+35% precision) * - Paper Circle (ACL 2026): Multi-criteria scoring + diversity-aware ranking * - REAP 

**Exports :** `LensType`, `SearchLens`, `LensResult`, `IntelligentScoutResult`, `generateSearchLenses`, `LensBandit`, `AdaptiveDepthConfig`, `assessSufficiency`, `computeDiversityScore`, `computeConsensusScore`, `computeScenarioRichness`, `SourceAuthority`, `classifyAuthority`, `authorityScore`, `preFilterSources`

### `lib/agent/macro-refresh.ts` — 147 lignes

_(no docstring — voir le code source)_

**Exports :** `MacroRefreshResult`, `refreshMacroSeries`

### `lib/agent/nestbrowse.ts` — 389 lignes

* NESTBROWSE: Nested Browser-Use for Deep Web Access * * Based on: ACL 2026 "NestBrowse: Nested Browser-Use Agents for Deep Web * Reasoning" * * A minimal and complete browser-action framework that decouples interaction * control from page exploration. Enables access to deep web content beyond * what API snippets provide. * * Two-layer architecture: * - **Outer agent**: high-level reasoning (what to search, when to dig deeper) * - **Inner agent**: low-level browser actions (click, scroll, extrac

**Exports :** `BrowserAction`, `BrowserResult`, `NestBrowseSession`, `NestBrowseConfig`, `DEFAULT_NESTBROWSE_CONFIG`, `createSession`, `executeAction`, `exploreUrl`, `batchExplore`

### `lib/agent/novlangue-detector.ts` — 168 lignes

* Novlangue Detector — Deterministic euphemism & semantic drift scanner. * * Pillar 6 made real: "Combat novlangue, guard the truth." * This module scans publication HTML for known euphemisms, bureaucratic * jargon, and semantic drift patterns. It is DETERMINISTIC (code, not LLM) * per the NomosX invariant: "Les garde-fous sur les chiffres sont * déterministes (code), jamais confiés à un LLM." * * The detector does NOT block publication (that would be censorship of its * own kind). It flags viol

**Exports :** `NovlangueMatch`, `NovlangueDetectionResult`, `detectNovlangue`

### `lib/agent/originality-check.ts` — 128 lignes

* Originality Check — detects close paraphrasing / plagiarism of source abstracts. * * Compares the generated analysis text against source abstracts using * trigram overlap (a fast, deterministic proxy for textual similarity). * High overlap → the analysis may be regurgitating source text rather than * synthesizing it.

**Exports :** `OriginalityResult`, `checkOriginality`

### `lib/agent/primary-data-synthesizer.ts` — 233 lignes

* PRIMARY DATA SYNTHESIZER — NomosX * * Intègre des données primaires (entretiens d'experts, enquêtes, mémos, * datasets, observations terrain) dans un brief de think tank. * * Inspirations : * - Harvard Kennedy School — primary evidence in policy memos * - RAND — structured interview synthesis and Delphi panels * - Brookings — field research and expert quotes

**Exports :** `PrimarySourceType`, `PrimarySourceInput`, `SynthesizedFinding`, `ExpertQuote`, `PrimaryDataSynthesis`, `PrimaryDataOptions`, `synthesizePrimaryData`, `renderPrimaryDataSection`

### `lib/agent/quant-agent.ts` — 445 lignes

* NomosX QUANT Agent — Primary Data Exploitation * * The differentiator vs. traditional think tanks: instead of citing that * "a dataset exists", this agent FETCHES the actual numbers from T1 * primary-data providers (energy-charts, RTE, Treasury, Eurostat…), * computes trends/variations, and injects a QUANTITATIVE EVIDENCE block * into the Analyst prompt — plus chart-ready series for the Editor. * * Position in funnel: after RANK, parallel with READER, before ANALYST. * * Design principles: * -

**Exports :** `QuantSeries`, `QuantFact`, `QuantOutput`, `quantAgent`

### `lib/agent/query-enhancer.ts` — 304 lignes

* QUERY ENHANCER * * Transforms user queries into optimized search queries for academic APIs. * * Features: * - Multi-language support (auto-detect, translate to English) * - Query expansion (synonyms, related terms) * - Multi-query generation (different perspectives) * - Domain-specific optimization * * @example * input: "quels sont les impacts de l'IA sur le travail dans les 30 prochaines années ?" * output: { * original: "quels sont...", * language: "fr", * translated: "what are the impacts o

**Exports :** `EnhancedQuery`, `enhanceQuery`, `generateSearchQueries`, `quickEnhance`

### `lib/agent/radar-innovations.ts` — 761 lignes

* NomosX RADAR INNOVATIONS — 2026 State-of-the-Art Signal Detection * * Implements 6 innovations from recent research: * * C: Temporal Signal Trajectories (ACL 2026 — Navasartian) * Classifies topics as emerging/bursting/stable/fading based on * mention velocity across runs. Burst ≠ emerging (bursts signal * consolidation, not early detection). * * A: BERTrend Velocity Scoring (RTE-France 2024) * Delta-based scoring: compares mention count between current run * and previous runs. Exponential dec

**Exports :** `SignalTrajectory`, `TopicVelocity`, `computeTopicVelocities`, `AnticipatoryOutlier`, `detectAnticipatoryOutliers`, `SourceDomain`, `CredibilityScore`, `classifySourceDomain`, `scoreCredibility`, `getCredibilityThreshold`, `ProviderRoute`, `selectProviders`, `diversifyQueries`, `LLMCapability`, `filterByCapability`

### `lib/agent/reader-agent-v3.ts` — 1250 lignes

* READER Agent V3 — Full-Text Deep Extraction * * Upgrades over V2: * 1. PDF FULL-TEXT: Downloads and parses PDFs via pdf-parse (already in deps) * 2. CHUNKED READING: Splits long papers into sections, reads each * 3. QUANTITATIVE EXTRACTION: Effect sizes, p-values, sample sizes, confidence intervals * 4. CROSS-REFERENCE: Identifies which sources cite each other * 5. STRUCTURED OUTPUT: Rich ReadingResultV3 with typed quantitative data * 6. FALLBACK CHAIN: Full-text → Abstract → Rule-based * * A 

**Exports :** `QuantitativeData`, `Mechanism`, `ReadingResultV3`, `readerAgentV3`, `storeSourceChunks`

### `lib/agent/realtime-data-hub.ts` — 1301 lignes

* NomosX REAL-TIME DATA HUB — Multi-Domain Live Intelligence * * Aggregates live data from 12 free public APIs covering ALL 22 PhD domains: * * Economics/Finance: FRED (Federal Reserve) — rates, inflation, unemployment, housing, trade * ECB (European Central Bank) — EUR/USD, MRO rate, Euro area GDP * Health/Biotech: WHO Disease Outbreak News — epidemic alerts worldwide * Climate/Energy: Open-Meteo — global temperature proxy * NASA GISS — global temperature anomaly (satellite-grade) * Security: U

**Exports :** `IndicatorCategory`, `RealTimeIndicator`, `RealTimePulse`, `MarketAlert`, `buildRealTimeContextBlock`, `fetchRealTimePulse`

### `lib/agent/refrain.ts` — 173 lignes

* REFRAIN — Adaptive Early-Stopping for Chain-of-Thought Reasoning * * Based on: ACL 2026 "REFRAIN: Adaptive Early-Stopping for LLM Reasoning" * * Key insight: LLMs often "overthink" — continuing to reason after they've * already converged on an answer. REFRAIN detects convergence and stops early, * reducing token usage by 20-55% without sacrificing accuracy. * * In NomosX, this applies to: * 1. ANALYST multipass — if pass N+1 doesn't add new mechanisms/findings, skip pass N+2 * 2. ReAct loop — 

**Exports :** `RefrainConfig`, `DEFAULT_REFRAIN_CONFIG`, `RefrainState`, `createRefrainState`, `shouldStopEarly`, `estimateTokenSavings`

### `lib/agent/revision-controller.ts` — 562 lignes

* REVISION CONTROLLER — NomosX * * The collective-intelligence loop the pipeline was missing: when the * publication gate returns `revise` or `hold`, its failures are posted as * typed signals onto a SignalBus, and registered resolvers resolve them — * ordered by the bus's goal-directed priority (signals serving unmet mission * targets first), not by a hardcoded ladder. * * Resolvers (registered here, but the pattern is open — any new signal type * works if a resolver exists): * scenario_invalid

**Exports :** `RevisionInput`, `RevisionResult`, `reviseForGate`, `RegenDecision`, `daFailureSignature`, `shouldRegenerate`, `attemptScore`, `buildFailureFeedback`

### `lib/agent/revision-editor.ts` — 85 lignes

* REVISION EDITOR — NomosX * * The content-level counterpart of the copy editor: when the publication gate * or the Devil's Advocate finds substantive defects (fatal challenges, weak * argumentation, overclaims), this agent produces surgical {find, replace} * edits that address them — qualify overstated conclusions, add the missing * caveat, name the counter-argument — without rewriting the document. * * Same safety contract as the copy editor (applySurgicalEdits): find must be * verbatim, repla

**Exports :** `RevisionEditResult`, `reviseForFindings`

### `lib/agent/sara-compression.ts` — 230 lignes

* SARA — Selective and Adaptive RAG with Context Compression (NomosX) * * Inspired by: * - SARA (S15-04, ACL 2026): Combines natural-language snippets (preserving * entities, numerical values, and named terms verbatim) with semantic * compression (dropping redundant sentences to broaden coverage) under a * fixed token budget. Outperforms pure-extractive and pure-compressive * baselines while staying fully reference-free and LLM-free. * * Architecture: * 1. `extractSnippets()` — identifies senten

**Exports :** `CompressedContext`, `extractSnippets`, `semanticCompress`, `saraCompress`

### `lib/agent/semantic-engine.ts` — 905 lignes

* NomosX Semantic Engine * * Replaces keyword/n-gram matching with real vector embeddings. * Uses OpenAI text-embedding-3-small (1536 dims) for: * * 1. Source embedding — embed title+abstract at ingestion time * 2. Query embedding — embed search queries for semantic retrieval * 3. Cosine similarity — rank sources by true semantic relevance * 4. Hybrid scoring — combine semantic + keyword + metadata signals * 5. Batch operations — embed multiple texts efficiently * * Storage: Prisma Float[] field

**Exports :** `embedText`, `embedTextDetailed`, `embedBatch`, `embedBatchDetailed`, `cosineSimilarity`, `embedSource`, `embedSourcesBatch`, `semanticSearch`, `reciprocalRankFusion`, `sparseSearch`, `hybridSearch`, `HybridRelevanceScore`, `scoreRelevanceHybrid`, `filterByRelevanceHybrid`, `backfillEmbeddings`

### `lib/agent/strategic-analyst-agent.ts` — 1153 lignes

* STRATEGIC ANALYST Agent * Produces comprehensive 10-15 page Strategic Reports with: * - Executive Summary * - Deep Literature Review * - Methodology Assessment * - Thematic Analysis * - Stakeholder Impact Matrix * - Scenario Planning * - Policy Recommendations * - Implementation Roadmap

**Exports :** `StrategicAnalysisOutput`, `backfillMissingAnalyticalFields`, `strategicAnalystAgent`

### `lib/agent/structural-editor.ts` — 272 lignes

* NomosX STRUCTURAL EDITOR — Storyline Review * * Think tanks like McKinsey, BCG, France Stratégie enforce a strict * narrative structure: every section has a "governing thought" (key message), * supporting evidence, and a "so what" (implication). * * This agent reviews the analysis JSON BEFORE rendering to HTML and: * 1. Validates narrative arc (does the story flow logically?) * 2. Ensures each section has a governing thought * 3. Checks "so what" per section (actionable implication) * 4. Detec

**Exports :** `SectionReview`, `StructuralReviewResult`, `structuralEditorReview`, `buildSectionInventory`

### `lib/agent/style-gates.ts` — 207 lignes

* NomosX STYLE GATES — Regex-based quality enforcement * * LOT 5.1: Enforce editorial voice standards on generated HTML. * Each gate returns a violation list — the pipeline can use these * to trigger auto-revision or flag for human review. * * Gates: * - G1: No "delves into" / "sheds light" / "navigates" / "underscores" * - G2: No "it is worth noting" / "it should be noted" / "importantly" * - G3: No "in today's world" / "in the modern era" / "in the 21st century" * - G4: No "plays a crucial rol

**Exports :** `StyleViolation`, `runStyleGates`, `runNumericalGate`

### `lib/agent/style-judge.ts` — 278 lignes

* STYLE JUDGE — NomosX * * Agent intelligent qui selectionne, critique et affine le style editorial. * Pas un simple profil statique : il lit la question, les sources, le domaine, * l'audience et le draft, puis juge quelle voix think tank est la plus crédible. * * Inspirations : * - LLM-Rubric (Microsoft) : evaluation multi-dimension avec calibration * - Rulers (LabRAI) : rubriques verrouillees et evidence-anchored scoring * - humanizer-skill / etincel : detection et correction des "AI tells" * 

**Exports :** `StyleJudgment`, `StyleScore`, `StyleCritique`, `IntelligentStyleInput`, `judgeStyle`, `critiqueDraft`, `composeIntelligentStyleGuide`

### `lib/agent/style-orchestrator.ts` — 359 lignes

* STYLE ORCHESTRATOR — NomosX * * Sélectionne et compose un guide d'écriture crédible par domaine / institution, * pour éviter le ton "IA" des LLMs et imiter des think tanks de référence. * * Inspirations : * - Harvard Kennedy School : policy memo, BLUF, active voice, skimmable * - France Stratégie : note d'analyse, discours-expert, méthodo visible, consensus * - Institut Montaigne : note d'action, analyse-débat-action, modèle français/européen * - McKinsey Global Institute : executive summary, 

**Exports :** `ThinkTankStyle`, `StyleProfile`, `StyleGuide`, `StyleOrchestratorInput`, `PROFILES`, `composeStyleGuide`, `renderStyleBadge`

### `lib/agent/trend-analyzer.ts` — 450 lignes

* NomosX Trend Analyzer Agent * * Detects trend breaks and shifts in research patterns over time. * Analyzes temporal evolution of topics, citations, and findings. * * Key capabilities: * - Detect sudden changes in publication volume * - Identify shifts in consensus or methodology * - Spot emerging topics gaining traction * - Flag declining research areas

**Exports :** `TrendBreak`, `TrendAnalysisOutput`, `trendAnalyzer`, `runWeeklyTrendAnalysis`


## Evidence & verification — 37 modules

### `lib/agent/atomic-claims.ts` — 243 lignes

* NomosX Atomic Claim Decomposition — Decontextualized claim extraction. * * Inspired by: * - FactReasoner (IBM): 5-stage pipeline with atomic decomposition + decontextualization * - VeriScore: pipelined claim extraction → evidence retrieval → claim verification * - HallDetect (2026): decomposition + compact encoder-based entailment * - chaincheck: claim-level hallucination detection via NLI * * Decomposes complex paragraphs into atomic, decontextualized claims * that can be independently verifi

**Exports :** `AtomicClaim`, `DecompositionResult`, `decomposeIntoAtomicClaims`, `decomposeHtmlIntoAtomicClaims`

### `lib/agent/chain-probability.ts` — 584 lignes

* NomosX CHAIN PROBABILITY — Source-Grounded Foresight * * LOT 4.2-4.8: Converts meta-analysis results and causal chains into * probability distributions for Monte Carlo simulation. * * LOT 4.2: buildPriors() — source-grounded prior distributions * LOT 4.3: propagateChainProbability() — joint probability via Monte Carlo * LOT 4.4: chainTournament() — permutations of mechanisms → best joint probability * LOT 4.5: dToProbability() — versioned mapping d → P * LOT 4.6: scenariosFromChain() — base/ad

**Exports :** `Prior`, `MAPPING_VERSION`, `DerivedQuantity`, `verifyDerivedQuantity`, `verifyDerivedQuantities`, `ChainScenario`, `buildPriors`, `dToProbability`, `propagateChainProbability`, `buildPriorsFromCausalChain`, `propagateCausalChainProbability`, `chainTournament`, `scenariosFromChain`, `InflectionResult`, `inflectionCheck`

### `lib/agent/chain-verification.ts` — 468 lignes

* Chain-of-Verification (CoVe) — NomosX Sprint 6 (Gap 6) * * Vérification par chaîne de questions indépendantes, *pendant* la rédaction. * Inspiré de : * - Chain-of-Verification (CoVe, Meta, ACL 2024 Findings, arxiv 2309.11495) * - SelfCheckGPT (potsawee, EMNLP 2023) — zero-resource hallucination detection * * Le problème : * La vérification NomosX est *post-hoc* (Citation Verifier, NLI, Source Check * après l'analyse). CoVe génère des verification questions indépendantes * *pendant* la rédactio

**Exports :** `VerificationQuestion`, `VerificationResult`, `CoVeResult`, `CoVeConfig`, `extractClaims`, `planVerificationQuestions`, `executeVerification`, `integrateResults`, `chainOfVerification`

### `lib/agent/citation-filter.ts` — 160 lignes

* NomosX Citation Filter — Post-generation grounding enforcement * * Inspired by WueRAG (TREC 2025 #1) and DEER benchmark. * * Two-level policy: * 1. Implicit claim back-tracking: sentences without [SRC-N] inherit citations * from the nearest preceding paragraph that has one (semantic proximity). * 2. Uncited claim flagging: sentences that still have no citation after * back-tracking get a [UNCITED] marker so the editor can remove or fix them. * * This runs AFTER HTML rendering but BEFORE the cr

**Exports :** `CitationFilterResult`, `applyCitationFilter`

### `lib/agent/citation-graph.ts` — 375 lignes

* Citation Graph Traversal — finds hub papers and bridge papers. * * After the initial source collection, this module traverses the citation graph * to find: * 1. HUB PAPERS: Sources cited by many of the collected sources (foundational work) * 2. BRIDGE PAPERS: Sources that connect different clusters (interdisciplinary) * 3. CLUSTERS: Groups of sources that cite each other (schools of thought) * * This is the Paper Circle (ACL 2026) pattern: use the citation network * to discover important sourc

**Exports :** `CitationNode`, `HubPaper`, `BridgePaper`, `CitationCluster`, `CitationGraphResult`, `findHubPapers`, `detectClusters`, `traverseCitationGraph`

### `lib/agent/citation-repair.ts` — 837 lignes

* Deterministic Citation Repair — post-render HTML cleanup. * * Problem: The LLM analyst generates numbers without [SRC-N] citations, * and the editor render can drop [SRC-N] tags. This produces: * - 71 unsourced numbers → numerical gate violations * - NLI integrity 40% → claims don't match sources * - Grounding veto → trust score capped at 40 * * Solution (deterministic, no LLM — Invariant 5): * 1. CITATION BACKFILL: Scan analyst JSON for [SRC-N] tags that are missing * from the rendered HTML a

**Exports :** `CitationRepairResult`, `backfillCitationsFromAnalysis`, `sanitizeUnsourcedNumbers`, `injectCitationsBySourceMatch`, `injectCitationsByContentMatch`, `injectBroadCitations`, `repairCitations`

### `lib/agent/citation-verifier.ts` — 1370 lignes

* NomosX Citation Verifier — Semantic Citation Validation * * Goes beyond the old citationGuard (which only checks [SRC-N] format validity). * This agent verifies that each citation ACTUALLY SUPPORTS the claim it's attached to. * * Process: * 1. Parse all [SRC-N] citations from the analysis text * 2. Extract the claim/sentence surrounding each citation * 3. Compare claim semantics against the source's actual content * 4. Flag misattributions, unsupported claims, and cherry-picking * 5. Produce a

**Exports :** `CitationInstance`, `CitationVerification`, `VerificationReport`, `extractCitations`, `verifyCitations`, `CiteGuardResult`, `citeGuardValidation`, `FranqFaithfulness`, `FranqFactuality`, `FranqStatement`, `FranqResult`, `assessWithFranq`, `ActiveRepairResult`, `ActiveRepairConfig`, `DEFAULT_REPAIR_CONFIG`

### `lib/agent/claim-grounding.ts` — 1002 lignes

* Claim Grounding Gate — deterministic claim-to-source verification. * * Inspired by: * - groundrails (stellarshenson): deterministic lexical grounding, no LLM, CPU-only * - warrant (eburke21): decompose answer into atomic claims, verify each against sources * - sourcecheck (aberaio): resolve citation to real source, check claim appears in source text * - DeepCitation: deterministic verification layer for AI citations * * Pipeline: * 1. DECOMPOSE: Extract sentences from HTML, split into atomic c

**Exports :** `ClaimVerdict`, `AtomicClaim`, `GroundingResult`, `repairHtmlWithGrounding`, `groundClaims`, `groundClaimsWithNLI`, `GraphNode`, `GraphEdge`, `SourceGraph`, `buildSourceGraph`, `GraphGroundingResult`, `verifyClaimAgainstGraph`, `graphGroundClaims`

### `lib/agent/claim-passage-contract.ts` — 213 lignes

* Claim→passage evidence contract — deterministic, no LLM. * * Audit priority #1, second half: a [SRC-N] citation proves a claim points * at a SOURCE, not that the source's extracted content actually carries * the claim. CausalChain links already carry claim/evidence/warrant/ * sourceRef — this module checks each present_fact link's claim text * against the cited source's READING passages (claims/results/ * limitations extracted by the reader), and marks links whose claim has * no passage-level 

**Exports :** `passageContainment`, `ClaimPassageContractResult`, `applyClaimPassageContract`, `ClaimPassageNLIResult`, `refineClaimPassageWithNLI`

### `lib/agent/conflict-aware.ts` — 216 lignes

* NomosX Conflict-Aware Reasoning — Detect and preserve source contradictions. * * Inspired by: * - EvidentialRAG (2026): Convert sources to probabilistic evidence, * preserve conflicts as epistemic uncertainty (Dempster-Shafer fusion) * - ConflictRAG (2026): Detect-classify-resolve-generate pipeline * - ConflictScore (2026): Quantify how well a model acknowledges conflicts * - CONFRAG (ACL 2026): Benchmark for contradiction-aware reasoning * * Key innovation: Instead of normalizing away contrad

**Exports :** `SourceConflict`, `ConflictDetectionResult`, `detectSourceConflicts`

### `lib/agent/contradiction-detector.ts` — 330 lignes

* NomosX Contradiction Detector Agent * * Detects contradictions between sources on the same topic. * Key differentiator for a real think tank. * * Process: * 1. Group sources by topic/vertical * 2. Extract claims from each source * 3. Compare claims using LLM to detect contradictions * 4. Generate CONTRADICTION signals when found

**Exports :** `ContradictionResult`, `ContradictionDetectorOutput`, `contradictionDetector`, `detectContradictionsInRecent`

### `lib/agent/evidence-bank.ts` — 151 lignes

* Evidence Bank — the WebWeaver/Perplexity pattern. * * Instead of letting the writer invent citations at generation time and * verifying them post-hoc, we build a bank of extracted evidence AT READING * TIME: every claim/method/result the reader extracted from a source becomes * a banked entry keyed to that source's [SRC-N] index. * * The analyst is told: every factual claim must trace to banked evidence. * Post-render, we validate that cited sources actually contributed evidence * to the bank 

**Exports :** `EvidenceEntry`, `EvidenceBank`, `BankValidation`, `buildEvidenceBank`, `buildEvidenceBankBlock`, `validateCitationsAgainstBank`

### `lib/agent/evidence-gatherer.ts` — 498 lignes

* Adaptive Evidence Gatherer * * Instead of rejecting topics with insufficient/misaligned sources, this module * acts like a real researcher: decomposes the question into researchable sub-angles, * searches each independently, combines all sources, and reassesses. * * Flow: * 1. Initial search → assess alignment * 2. If misaligned or insufficient → LLM decomposes into 3-5 sub-angles * 3. Search each sub-angle across multiple providers * 4. Combine + dedup all sources * 5. Semantic reassessment *

**Exports :** `GatheredSource`, `EvidenceGatherResult`, `gatherEvidence`

### `lib/agent/evidence-independence.ts` — 132 lignes

Cosine ≥ this on title+abstract ⇒ treated as the same evidence cluster.

**Exports :** `NEAR_DUPLICATE_THRESHOLD`, `EvidenceIndependence`, `citedSourceIndices`, `clusterBySimilarity`, `auditEvidenceIndependence`

### `lib/agent/evidence-ledger.ts` — 139 lignes

_(no docstring — voir le code source)_

**Exports :** `EvidenceSupportStatus`, `EvidenceLedgerClaim`, `EvidenceLedger`, `stripHtmlForEvidence`, `extractCitationNumbers`, `buildEvidenceLedger`

### `lib/agent/evidence-partition.ts` — 104 lignes

* EVIDENCE PARTITION — designed information asymmetry (InfoDelphi, arXiv 2607.01661) * * Finding: when every agent in a panel sees identical evidence, deliberation * collapses into herding — correlated errors, no real belief revision. The fix * is to partition the corpus into a SHARED pool (common ground) plus DISJOINT * private slices per agent. Each participant holds exclusive knowledge that can * only reach the others through their verdict — inter-agent error correlation * drops, and the aggr

**Exports :** `EvidencePartition`, `PartitionOptions`, `partitionEvidence`, `formatPartitionedSources`

### `lib/agent/evidence-registry.ts` — 167 lignes

* NomosX Stable Evidence IDs * * Inspired by geodocs.dev + EviReport (ACL 2026). * * Instead of using positional [SRC-N] indices that shift when sources are * added/removed, this module assigns stable evidence IDs [E1], [E2]... * with a bidirectional mapping table. * * Benefits: * - Adding/removing a source doesn't break existing citations * - Citations can be traced back to exact source spans * - Enables evidence deduplication (same source cited multiple times) * * Usage: * 1. Create an Evidenc

**Exports :** `EvidenceEntry`, `EvidenceRegistry`, `createEvidenceRegistry`, `replaceSrcWithEvidenceIds`, `resolveEvidenceId`, `getCitationStats`

### `lib/agent/evidence-tiering.ts` — 175 lignes

* Evidence Tiering — classifies sources into 5 tiers based on provenance and type. * * Tier 1 — Empirical: controlled studies, datasets, quantitative research * Tier 2 — Institutional: official documents from governments, IGOs, religious institutions * Tier 3 — Academic: peer-reviewed papers, systematic reviews * Tier 4 — Policy: EU AI Act, OECD, UNESCO, Council of Europe, GPAI, ISO standards * Tier 5 — Emerging: preprints, working papers, exploratory research, conference papers * * Inspired by:

**Exports :** `EvidenceTiers`, `computeEvidenceTiers`, `summarizeEvidenceTiers`

### `lib/agent/fact-checker.ts` — 602 lignes

* NomosX FACT-CHECKER — Numerical Claim Verification * * The #1 credibility problem in AI-generated think tank reports: * citing numbers that don't match the source data. * * This agent: * 1. Extracts all numerical claims from the HTML (percentages, amounts, ratios) * 2. For each claim, checks if the number appears in the cited source * 3. Flags claims where the number doesn't match the source * 4. Provides corrected values when possible * * Inspired by: * - McKinsey's fact-checking process (eve

**Exports :** `NumericalClaim`, `FactCheckResult`, `CitanceVerdict`, `CitanceReport`, `FactCheckerOutput`, `factChecker`

### `lib/agent/fact-repair.ts` — 249 lignes

* FACT REPAIR — anchored correction of fact-checker fatal discrepancies. * * The generic revision editor cannot fix these: the fact-checker's `claim` * strings come from stripHtmlForEvidence(html) (sup→[SRC-N], tags stripped), * so a verbatim `find` can never match raw HTML across citations and inline * tags, and the editor only ever saw 12KB of an ~90KB article. This repairer * prompts on the claim sentences alone and applies edits tolerantly — * whitespace/tags inside the find span are ignored

**Exports :** `FactualDiscrepancy`, `FactRepairResult`, `applyTolerantEdit`, `repairFactualDiscrepancies`

### `lib/agent/gap-aware-append.ts` — 168 lignes

* NomosX Gap-Aware Evidence Append * * Inspired by EviReport (ACL 2026) — gap-aware iterative evidence retrieval. * * After analysis, identifies sections with low citation density and generates * targeted search queries to fill those gaps. The new sources are then injected * into the analysis context for the structural editor to incorporate.

**Exports :** `GapAnalysisResult`, `SectionGap`, `analyzeCitationGaps`, `generateGapQueries`

### `lib/agent/gap-filler.ts` — 312 lignes

* NomosX GAP FILLER — Proactive Knowledge Gap Identification & Pre-Fetching * * Inspired by WebThinker (NeurIPS 2025) and KnowSelf (ACL 2025): * - After each analysis, identify what the agent DIDN'T know or couldn't address * - Store these gaps as structured "knowledge gaps" in AgentAuditLog * - Before the next run on a similar topic, retrieve relevant gaps and * inject them as priority search queries for SCOUT * * This closes the loop: the system knows what it doesn't know and * proactively see

**Exports :** `KnowledgeGap`, `GapExtractionResult`, `GapInjection`, `extractAndStoreGaps`, `getRelevantGaps`, `markGapsFilled`

### `lib/agent/nli-engine.ts` — 553 lignes

* NomosX NLI Engine — Real Natural Language Inference for claim verification. * * Replaces the heuristic composite scoring in nli-verifier.ts with a proper * NLI model that classifies claim→source as entailment / neutral / contradiction. * * Architecture (pluggable): * 1. PRIMARY: Local NLI model via @huggingface/transformers (cross-encoder/nli-deberta-v3-base) * - DeBERTa-v3 NLI cross-encoder, fine-tuned for RAG citation verification (F1=0.89) * - English-first but handles multilingual claims w

**Exports :** `NLIVerdict`, `NLIClassification`, `NLIBatchResult`, `classifyNLI`, `classifyNLIBatch`, `nliToGroundingVerdict`, `nliToCitationVerdict`, `isNLIModelAvailable`, `preloadNLIModel`

### `lib/agent/nli-verifier.ts` — 241 lignes

* NomosX NLI Citation Verifier — Real entailment-based verification * * Powered by nli-engine.ts which uses mDeBERTa-v3 (multilingual NLI model) * for true entailment classification: entailment / neutral / contradiction. * * Falls back to embedding-based NLI (OpenAI embeddings + negation + numbers) * when the local model is not available. * * Three-stage process: * 1. Extract claim-citation pairs from HTML * 2. For each pair, classify with NLI model (entailment / neutral / contradiction) * 3. Ma

**Exports :** `verifyCitationsNLI`

### `lib/agent/outline-critic.ts` — 144 lignes

* Outline Critic — the WebWeaver (ICLR 2026) / AgentDisCo pattern. * * Mature deep-research systems iterate on the OUTLINE (the structured * intermediate representation) before/while writing — not only on the final * text. A critic evaluates whether the analysis structure actually covers * the question's dimensions, finds missing angles, and emits targeted * retrieval queries to fill structural gaps. * * NomosX flow: analyst → critic (claim-level) → outline-critic (structure- * level) → gap-fill

**Exports :** `OutlineCritique`, `critiqueOutline`

### `lib/agent/pre-draft-review.ts` — 131 lignes

* Pre-draft scope review — the "short thesis/outline review BEFORE full * drafting" called for by the source-to-publication audit. * * The 3-pass analyst is the most expensive stage (~7-10min, bulk of run * cost). Today scope/causality defects are only caught AFTER all three * passes: thesis adherence post-analyst, outline critique post-analyst, * DA at the tail. A verdict that exceeds the evidence-bound thesis then * costs a full re-analysis to repair. * * This module reviews the PASS-1 frictio

**Exports :** `PreDraftReviewResult`, `reviewDraftDirection`

### `lib/agent/provenance-graph.ts` — 321 lignes

* NomosX Claim Provenance Graph — Stable claim-to-evidence traceability. * * Inspired by: * - ClaimKit (isaac-cf-wong): Claim-level provenance with stable IDs and validation status * - agent-grounding (LanNguyenSi): Evidence ledger with claim gates and hypothesis tracking * - verified-science-agent (fraware): Treat every report like a build artifact with provenance * * Every claim in a NomosX publication gets: * 1. A STABLE ID (claim-{pubId}-{idx}) that persists across revisions * 2. A VALIDATIO

**Exports :** `ClaimStatus`, `ProvenanceClaim`, `ProvenanceGraph`, `buildProvenanceGraph`, `markStaleClaims`

### `lib/agent/rav-verifier.ts` — 265 lignes

* RAV (Recon-Answer-Verify) Citation Verification — NomosX * * Inspired by: * - RAV (EMNLP 2025): Three-agent framework that iteratively generates * and answers sub-questions to verify different claim aspects. * Outperforms SOTA by 57.5% on PFO dataset. * - CiteGuard (ACL 2026): Retrieval-aware agent for citation attribution. * - CiteCheck: Hybrid scholarly retrieval + LLM verifier (88.9% accuracy). * - FIRE (NAACL 2025): Fact-checking with iterative retrieval, 7.6x cheaper. * * Architecture: * 

**Exports :** `SubQuestion`, `SubAnswer`, `RAVVerdict`, `decomposeClaim`, `answerSubQuestion`, `aggregateVerdict`, `verifyWithRAV`, `batchVerifyWithRAV`

### `lib/agent/research-patterns.ts` — 450 lignes

* Research Patterns — STORM + PaperQA2 — NomosX Sprint 6 (Gap 13) * * Deux patterns récents pour améliorer le research agent : * 1. STORM (Stanford, NAACL 2024) — perspective-guided question asking * 2. PaperQA2 (FutureHouse, arxiv 2409.13740) — citation traversal * * Le problème : * L'Intelligent Scout a 6 lenses mais pas : * - STORM : simuler différents profils d'experts pour générer des questions de recherche * - PaperQA2 : suivre les références des top sources pour enrichir le corpus * * Arc

**Exports :** `StormPerspective`, `StormOutline`, `CitationTraversalResult`, `ResearchPatternsConfig`, `DEFAULT_RESEARCH_PATTERNS_CONFIG`, `generateStormPerspectives`, `buildStormOutline`, `extractReferences`, `scoreReferencesForRelevance`, `traverseCitations`, `buildResearchSearchPlan`

### `lib/agent/research-protocol.ts` — 117 lignes

* Research Protocol & AI Disclaimer — auto-generated sections for transparency. * * Inspired by: * - RAND 2022 Standards: "document purpose, scope, sources, assumptions, data, methods, limitations" * - CFR: "The Council takes no institutional position" * - Brookings: "All work represents the sole conclusions of its authors" * * These sections are NOT LLM-generated. They are computed from pipeline metadata * to ensure factual accuracy about the research process itself.

**Exports :** `ProtocolMetadata`, `renderResearchProtocol`, `renderAIDisclaimer`

### `lib/agent/retraction-watch.ts` — 173 lignes

* Retraction Watch — Source Integrity Verification * * Inspired by Sourcecheck (2026, GitHub aberaio/sourcecheck): * - Resolve each source's DOI against OpenAlex + Crossref * - Check is_retracted flag * - Retracted sources are vetoed (never accepted as evidence) * - Non-blocking: failures are logged, not thrown * * API: * - OpenAlex: https://api.openalex.org/works/doi:{doi}?select=is_retracted,id * - Crossref: https://api.crossref.org/works/{doi} * * Free, no API key required (polite pool with m

**Exports :** `RetractionResult`, `RetractionBatchResult`, `checkRetraction`, `checkRetractionsBatch`, `filterRetracted`

### `lib/agent/retrieval-gapfill.ts` — 101 lignes

* Retrieval Gap-Fill — CRAG-style corrective retrieval. * * Corrective RAG (arXiv 2401.15884): evaluate retrieval quality BEFORE * generation and trigger targeted re-retrieval when coverage is deficient — * rather than discovering the gap after the report is written. * * NomosX already detects coverage gaps (CARE missingConcepts at SCOUT K10) * but only logged them. This module closes the loop: missing concepts become * targeted queries, run against a bounded set of fast providers, deduped * aga

**Exports :** `GapFillResult`, `gapFillMissingConcepts`

### `lib/agent/safe-verifier.ts` — 408 lignes

* SAFE Verifier — Search-Augmented Factuality Evaluation. * * Implements the DeepMind SAFE method (arXiv 2403.18802, NeurIPS 2024): * for each atomic claim, generate search queries, retrieve LIVE evidence * from the web, then rate the claim against that evidence with NLI. * * Why this exists: groundClaimsWithNLI verifies claims against the STORED * sources only. A claim can be perfectly true yet "unsupported" because its * cited source is a thin abstract. SAFE rescues genuinely-true claims and *

**Exports :** `SafeVerdict`, `SafeClaimResult`, `SafeVerificationReport`, `SafeVerifyOptions`, `verifyClaimsWithLiveSearch`

### `lib/agent/source-quality.ts` — 205 lignes

* Source Quality Engine — NomosX 2026 * * Inspired by: * - BIP! impact indicators (OpenAIRE) — citation-based impact * - Rapid Journal Quality Check — SJR, H-Index, CCF * - Sourcecheck / RefChecker — provenance-first verification * - LevelRAG / HippoRAG 2 — re-rank by source reliability * * Scores academic and non-academic sources on multiple dimensions, * then re-ranks the top sources by a composite quality score.

**Exports :** `SourceQualityScore`, `ScoredSource`, `scoreSource`, `computeDiversityScores`, `rankSourcesByQuality`, `filterAndBoostTopSources`

### `lib/agent/sourcecheck.ts` — 448 lignes

* NomosX Source Check — Provenance-first verification for AI-generated claims. * * Inspired by sourcecheck (aberaio): * "Does the cited source exist, is it retracted, is the quoted text actually there?" * * This module takes the OPPOSITE stance from LLM judges: * - Resolve the citation to ground truth first (OpenAlex/Crossref) * - Check if the source is retracted * - Verify the claim text appears in the source * - ABSTAIN when we can't confirm (rather than guessing) * * Three checks per citation

**Exports :** `SourceCheckVerdict`, `SourceCheckResult`, `SourceCheckBatchResult`, `scoreSourceCredibility`, `checkSource`, `checkSourcesBatch`

### `lib/agent/symbolic-verifier.ts` — 295 lignes

* NSRSA: Neuro-Symbolic Recursive Self-Alignment * * Based on: arXiv 2026 "NSRSA: Neuro-Symbolic Recursive Self-Alignment for * Trustworthy Reasoning in LLMs" * * Combines neural reasoning (LLM) with symbolic verification (deterministic * checks) to catch reasoning errors that look correct but are flawed. * * Key insight: 34% of "correct" answers have flawed reasoning. NSRSA * rejects these by verifying each step symbolically. * * In NomosX, this adds a symbolic verification layer for: * 1. **Qu

**Exports :** `SymbolicCheck`, `NSRSAResult`, `verifySymbolically`, `buildSymbolicVerificationReport`

### `lib/agent/ufo-factcheck.ts` — 273 lignes

* UFO — Unified Fact-Checking with Plug-and-Play Sources (NomosX) * * Inspired by: * - UFO (S15-06, AAAI 2026): A unified framework supporting multiple * plug-and-play fact sources — human-written evidence, web search, LLM * internal knowledge, structured databases, and knowledge graphs — with * flexible source selection and reordering based on claim characteristics. * * Architecture: * 1. `selectSources()` — given a claim, picks the most appropriate source * types based on lexical cues: numbers

**Exports :** `FactSource`, `FactCheckResult`, `UFOConfig`, `DEFAULT_UFO_CONFIG`, `selectSources`, `verifyWithMultipleSources`, `batchFactCheck`


## Adversarial & quality gates — 31 modules

### `lib/agent/bias-detector.ts` — 488 lignes

* Bias Detector — systematic detection of common biases in the source corpus * and generated analysis. * * This is a deterministic, LLM-free check that flags: * - Provider concentration (selection bias) * - Geographic skew (sources from one region only) * - Temporal skew (all sources from same year/period) * - Methodological monoculture (all sources same type) * - Publication bias (only positive results reported) * - Funding bias (conflict of interest — sources funded by interested parties) * - 

**Exports :** `BiasFinding`, `BiasReport`, `detectBiases`

### `lib/agent/cohere-reranker.ts` — 200 lignes

* COHERE RERANKER * * Uses Cohere's rerank API to reorder search results by relevance. * Cohere's rerank-english-v3.0 is state-of-the-art for search relevance. * * Fallback: If Cohere API fails or is not configured, uses local relevance scoring.

**Exports :** `RerankResult`, `rerankSources`, `rerankBatch`

### `lib/agent/confidence-aggregation.ts` — 93 lignes

* CONFIDENCE-WEIGHTED AGGREGATION — independent scoring beats deliberation. * * KalshiBench oracle study (arXiv 2605.30802): deliberative consensus DEGRADES * accuracy below the best single model (confidently-wrong agents flip correct * ones), while independent aggregation with confidence weighting beats every * single-model baseline. Demystifying-MAD (ACL 2026) adds the second missing * piece: explicit, calibrated confidence communication. * * This module is the deterministic aggregation layer:

**Exports :** `ScoredVote`, `AggregationResult`, `aggregateIndependentScores`

### `lib/agent/critic-agent.ts` — 1095 lignes

* NomosX Critic Agent — Multi-stage verification with adversarial scrutiny. * * Inspired by: * - Critic-Guided Hybrid Agentic RAG (OpenReview 2026): multi-stage verification * with atomic claim verification + adaptive retrieval + semantic failure memory * - GAVEL (ACL 2026): Evidence-Contract Debate with mechanized scrutiny * - Self-Correcting RAG (ACL 2026): NLI-guided verification + repair * - Reflective RAG (ACL 2026): self-evaluation driven strategy optimization * * The Critic sits between A

**Exports :** `CriticVerdict`, `AtomicClaim`, `ContradictionPair`, `BiasFlag`, `CitationIssue`, `CriticResult`, `decomposeAnalysis`, `groundClaims`, `detectContradictions`, `detectBias`, `validateCitations`, `generateRepairInstructions`, `runCritic`

### `lib/agent/critic-panel.ts` — 276 lignes

* Critic Panel — rubric-based multi-dimension review (G-Eval style). * * The scalar critic score compresses everything into one number: a paper can * score 18 for ten different reasons and nobody can tell which. Research on * LLM-as-judge (G-Eval, MT-Bench, peer-review agents) shows rubric-anchored * per-dimension scoring is more reliable, more actionable, and less biased. * * This panel runs 4 independent reviewers IN PARALLEL, each with its own * rubric and its own mandate. Each returns a 1-10

**Exports :** `PanelDimension`, `DimensionVerdict`, `CriticPanelResult`, `FieldContext`, `runCriticPanel`

### `lib/agent/critical-loop-v2.ts` — 651 lignes

* NomosX Critical Loop V2 — Iterative Self-Correction * * Unlike V1 which only SCORES a draft, V2 actually REWRITES it. * * Flow: * 1. Run 3 parallel critics (Methodology Judge, Adversarial Reviewer, Decision Calibrator) * 2. If composite score < threshold → REWRITE the draft using critic feedback * 3. Re-run critics on rewritten draft * 4. Max 2 iterations (draft → critique → rewrite → re-critique) * 5. Return best version with full audit trail * * This mimics academic peer review: * - Reviewer

**Exports :** `runCriticalLoopV2`

### `lib/agent/cross-model-consensus.ts` — 475 lignes

* NomosX Cross-Model Consensus + Reflective RAG * * Two complementary innovations from 2026 research: * * 1. CROSS-MODEL CONSENSUS (LLM Jury, arxiv 2026): * Multiple independently-trained models vote on critical claims. * Errors decorrelate → consensus emerges. +4.6 accuracy vs single model. * Key insight: 3 models from different providers = ~1.3 independent models * (r=0.77 error correlation), but still better than any single model. * * 2. REFLECTIVE RAG (ACL 2026 Findings): * Self-evaluation a

**Exports :** `ConsensusVote`, `ConsensusResult`, `crossModelConsensus`, `PipelinePhase`, `ReflectionResult`, `reflectOnPhase`, `FailureRecord`, `recordFailure`, `getRelevantFailures`, `getFailureMemorySize`

### `lib/agent/dedup-doi.ts` — 313 lignes

* DOI-First Deduplication with Union-Find Clustering * * Inspired by BibFusion (2026) and risforge (2026): * - DOI-first matching cascade with conservative fallbacks * - Union-find for transitive clustering (A=B, B=C → A=B=C) * - Zero data loss on merge: best record is base, others supplement * * Cascade: * 1. DOI exact match (100% confidence) * 2. Normalized title + first-author surname match (99% confidence) * 3. Fuzzy title similarity ≥90% + year validation (90% confidence) * * Non-destructiv

**Exports :** `DedupSource`, `DedupResult`, `dedupSources`

### `lib/agent/devils-advocate.ts` — 514 lignes

* NomosX DEVIL'S ADVOCATE — Permanent Adversarial Intelligence * * Every publication, before release, faces a dedicated adversarial agent * whose sole purpose is to find what is wrong, overstated, missing, or * intellectually dishonest in the analysis. * * This is not the same as the Critical Loop (which improves writing quality). * The Devil's Advocate operates at the EPISTEMIC level: * - Are the conclusions actually supported by the evidence? * - What would a hostile expert at McKinsey/Brookin

**Exports :** `AdvocateChallenge`, `ChallengeType`, `AdvocateReport`, `InstitutionComparison`, `ComparisonScore`, `runDevilsAdvocate`

### `lib/agent/enhanced-ranker.ts` — 797 lignes

* ENHANCED RANKER - A+ LEVEL QUALITY FILTERING * * Amélioration du système de ranking pour atteindre les standards A+ * - Seuil qualité augmenté à 80% * - Filtrage sources académiques premium * - Diversité améliorée * - Extraction données quantitatives

**Exports :** `EnhancedRankOptions`, `EnhancedRankedSource`, `enhancedRank`, `SourceTrustTier`, `classifyTrustTier`

### `lib/agent/gate-diagnosis.ts` — 141 lignes

* GATE DIAGNOSIS — SEVA-style structured verification output (arXiv 2606.29713). * * A bare "check failed" string leaves the revision machinery guessing. Each * failed gate check is mapped to a typed diagnosis: WHAT class of failure, * HOW severe, and WHAT the actionable fix is. The regeneration feedback * (buildFailureFeedback) consumes these instead of raw reason strings, and * the audit trail gains a stable machine-readable failure taxonomy. * * Deterministic — zero LLM, zero cost. The LLM-si

**Exports :** `DiagnosisCategory`, `DiagnosisSeverity`, `GateDiagnosis`, `diagnoseCheck`, `diagnoseGateResult`, `renderDiagnoses`

### `lib/agent/gmpo-optimizer.ts` — 313 lignes

* GMPO — Gradient-Guided Multi-Judge Prompt Optimization — NomosX * * Inspired by: * - GMPO (ACL 2026, S15-08): Gradient-Guided Multi-Judge Prompt Optimization. * Uses first-order gradient approximation to estimate per-segment importance * in a prompt and a panel of multiple judges to select the best edit. * Replaces the deleted dspy-optimizer.ts with a lighter, dependency-free * implementation adapted for the NomosX pipeline. * * Architecture: * - segmentPrompt(): splits a prompt into segments 

**Exports :** `PromptSegment`, `OptimizationResult`, `GMPOConfig`, `DEFAULT_GMPO_CONFIG`, `segmentPrompt`, `approximateGradient`, `optimizePrompt`

### `lib/agent/human-feedback.ts` — 333 lignes

* Human Feedback Integration — NomosX * * Permet aux corrections manuelles de l'utilisateur de nourrir le système * d'apprentissage. Avant ce module, quand vous corrigiez un brief manuellement, * le système ne le savait pas — il ne pouvait pas apprendre de vos interventions. * * Architecture : * 1. recordHumanCorrection() — enregistre une correction dans AgentAuditLog * avec le type "HUMAN_CORRECTION" + extrait une leçon via LLM * 2. getHumanCorrectionsForAgent() — récupère les corrections passé

**Exports :** `HumanCorrection`, `ExtractedLesson`, `recordHumanCorrection`, `getHumanCorrectionLessons`, `getCorrectionStats`

### `lib/agent/judge-arena.ts` — 316 lignes

* JudgeArena — Unified LLM-Judge Evaluation with Statistical Calibration — NomosX * * Inspired by: * - JudgeArena (arXiv 2026, S15-05): Unified framework for reproducible * LLM-judge evaluation with proper statistical methods. Provides * Cohen's κ (agreement), Spearman ρ (rank correlation), calibration * against ground truth, and confidence intervals for judge selection. * * Architecture: * - cohensKappa(): agreement between judge scores and ground truth, computed * on binned (ordinal) scores to

**Exports :** `JudgeEvaluation`, `JudgeCalibration`, `BenchmarkResult`, `cohensKappa`, `spearmanRho`, `calibrateJudge`, `selectBestJudge`, `confidenceInterval`

### `lib/agent/leap-aggregation.ts` — 128 lignes

* LEAP — Likelihood Elicitation and Aggregation for probabilistic forecasting * (arXiv 2609.01337). * * Core idea: a monolithic "read all evidence, emit a probability" forecast * hides how each evidence item moves the result and collapses uncertainty. * Instead: explicit prior + per-item likelihood updates → deterministic * posterior in log-odds space. Auditable, reproducible, and each evidence * item's contribution is inspectable. * * Two entry points: * - `evidenceLikelihoodUpdate`: fold the s

**Exports :** `toLogOdds`, `fromLogOdds`, `LeapEvidenceUpdate`, `evidenceLikelihoodUpdate`, `ForecastVote`, `PooledForecast`, `poolForecasts`

### `lib/agent/lesson-verifier.ts` — 253 lignes

* NomosX LESSON VERIFIER — Independent verification of agent lessons * * Inspired by LUCID (2026): "Memory Reward Inflation in Self-Improving LLM Agents" * * PROBLEM (the Echo Gap): * When an agent generates its own lessons and scores them, incorrect lessons * receive inflated rewards. The agent then preferentially reuses its most * confident mistakes. The error compounds through memory rather than averaging out. * * SOLUTION (Error-Independence Assumption): * A verifier that is INDEPENDENT from

**Exports :** `LessonVerification`, `BatchVerificationResult`, `verifyLesson`, `verifyAndDeInflateLessons`

### `lib/agent/local-judge.ts` — 469 lignes

* Local Judge — NomosX Sprint 6 (Gap 8) * * LLM-as-Judge open-source (Prometheus 2 / JudgeLM / Auto-J) pour réduire * la dépendance aux modèles propriétaires et les coûts. * Inspiré de : * - Prometheus 2 (EMNLP 2024, arxiv 2405.01535) — evaluator LM with custom rubrics * - JudgeLM (BAAI-Vision) — scalable judge * - Auto-J (GAIR-NLP) — generative judge for alignment * * Le problème : * Cross-Model Consensus, CRITIC, et PRM utilisent GPT-4o-mini/DeepSeek/GLM. * Un judge local open-source = coût $0

**Exports :** `RubricCriterion`, `JudgeRubric`, `JudgeEvaluation`, `LocalJudgeConfig`, `DEFAULT_LOCAL_JUDGE_CONFIG`, `NOMOSX_JUDGE_RUBRICS`, `isLocalJudgeAvailable`, `judge`, `judgeForPRM`, `judgeAttack`, `calibrateLocalJudge`

### `lib/agent/moa/mixture-of-agents.ts` — 942 lignes

* Mixture of Agents (MoA) — NomosX * * Au lieu d'un seul ANALYST, le MoA lance plusieurs analystes * spécialisés en parallèle, chacun avec une perspective différente, * puis agrège leurs insights. C'est le pattern qui crée la capacité * émergente : la qualité de l'agrégation est supérieure à celle du * meilleur agent individuel. * * Inspiré de : * - "Mixture of Agents" (Together AI, 2024-2026) * - "More Agents Is All You Need" (2024) * - Society of Minds (multi-perspective debate) * - Ensemble m

**Exports :** `AgentSpecialization`, `SpecialistAgent`, `SpecialistAnalysis`, `MoAResult`, `SPECIALIST_AGENTS`, `runSpecialistAgents`, `aggregateAnalyses`, `runMixtureOfAgents`, `updateAgentWeights`, `loadAgentWeights`, `AgentProposal`, `selectAgentsDynamically`, `QuadraticVote`, `QuadraticVotingResult`, `computeQuadraticVotes`

### `lib/agent/output-guard.ts` — 322 lignes

* Output Guardrails — NomosX Sprint 6 (Gap 15) * * Validation structurée des outputs des LLM (Guardrails AI style). * Inspire de : * - Guardrails AI (guardrails-ai/guardrails) — structured output validation * - NeMo Guardrails (NVIDIA) — policy-based evaluation * - GRETEL (2024) — execution-grounded validation * * Le problème : * Le WriteGuard protège les *interventions du Witness*, mais il n'y a pas de * validation systématique des *outputs des LLMs* (format, PII, claims sourcées). * * Architec

**Exports :** `GuardOutcome`, `GuardViolation`, `OutputGuardResult`, `OutputGuardConfig`, `DEFAULT_OUTPUT_GUARD_CONFIG`, `guardOutput`, `buildRepairFeedback`

### `lib/agent/peer-reviewer.ts` — 148 lignes

* Peer Reviewer Agent — NomosX 2026 * * Inspired by Feynman (companion-inc/feynman) and OpenResearcher: * - Four bundled research agents: Researcher, Reviewer, Writer, Verifier * - Simulated peer review with severity-graded feedback * - Checks: novelty, methodology, citations, clarity, significance, limitations * * This agent runs BEFORE the EDITOR to catch flaws that the primary ANALYST missed. * It acts as an external reviewer, not a friend of the analysis.

**Exports :** `ReviewIssue`, `PeerReview`, `runPeerReview`, `renderPeerReviewInjection`

### `lib/agent/prm/process-reward-model.ts` — 561 lignes

* Process Reward Model (PRM) — NomosX * * Le Process Reward Model est le moat le plus profond du système. * Il apprend, à partir de chaque run, quels chemins de raisonnement * mènent à de bons résultats et lesquels mènent à des échecs. * * Inspiré de : * - OpenAI PRM (Process Reward Model, "Let's Verify Step by Step", 2023-2024) * - DeepMind step-level rewards (2024-2026) * - Math-Shepherd (automatic process annotation) * * Architecture : * 1. Chaque étape du pipeline reçoit un score de processu

**Exports :** `ProcessStep`, `ProcessFeatures`, `PRMPrediction`, `PRMModel`, `extractFeatures`, `scoreStep`, `llmScoreStep`, `trainPRM`, `persistProcessStep`, `persistPRMModel`, `loadPRMModel`, `loadProcessSteps`, `selectBestPath`, `retrainPRM`

### `lib/agent/pruning-gates.ts` — 534 lignes

* NomosX PRUNING GATES — Deterministic Post-Generation Quality Assurance * * Principles (from research best practices): * - Gates PRUNE, never BLOCK. Every publication is publishable by default. * - Gates are deterministic (code only, zero LLM). The LLM produces; code verifies and prunes. * - Trust propagates through the DAG: weak parents reduce confidence in children. * - A pruned link is removed before render. The reader never sees invalid content. * - No veto, no blocking threshold. The trust

**Exports :** `ConfidenceTier`, `PruningResult`, `gateCitationSanitize`, `gateCascadeCheck`, `gateOrphanCheck`, `gateMultiRootCheck`, `gateGroundingCheck`, `gateDomainTravelCheck`, `gateInflectionCheck`, `gateHedgingStrip`, `propagateTrust`, `runAllPruningGates`

### `lib/agent/publication-gate.ts` — 381 lignes

P3.7: If triangular judge overrode DA verdict, skip fatal_challenges hard gate

**Exports :** `PublicationGateDecision`, `PublicationGateThresholds`, `PublicationGateInput`, `PublicationGateCheck`, `PublicationGateResult`, `DEFAULT_PUBLICATION_GATE_THRESHOLDS`, `evaluatePublicationGate`

### `lib/agent/ragas-eval.ts` — 159 lignes

* RAGAS-style Evaluation — NomosX 2026 * * Inspired by the RAGAS framework (Retrieval-Augmented Generation Assessment). * Evaluates the RAG pipeline without human labels by using the LLM itself * as an evaluator on: * - Faithfulness: does the answer stick to the retrieved context? * - Answer Relevancy: does the answer address the question? * - Context Precision: how much of the retrieved context is relevant? * - Context Recall: did we retrieve the information needed to answer? * * Reference: htt

**Exports :** `RagasSubMetrics`, `RagasMetrics`, `RagasEvaluation`, `evaluateRAG`, `evaluateBriefRAG`

### `lib/agent/relevance-scorer.ts` — 534 lignes

* RELEVANCE SCORER * * Scores how relevant a source is to a given query. * * Scoring factors: * 1. Topic overlap (keywords in title/abstract) * 2. Field matching (academic domains) * 3. Temporal relevance (if query mentions time period) * 4. Citation context (highly cited = more authoritative on topic) * * Score: 0.0 - 1.0 * - 0.8+ : Highly relevant, core to query * - 0.6-0.8 : Relevant, useful context * - 0.4-0.6 : Somewhat relevant, peripheral * - 0.0-0.4 : Not relevant, likely off-topic

**Exports :** `RelevanceScore`, `SourceForScoring`, `scoreRelevance`, `filterByRelevance`, `logRelevanceScores`, `CAREResult`, `evaluateWithCARE`

### `lib/agent/self-correct.ts` — 877 lignes

* Self-Correct Module — Hybrid CHARM + Overseer * * Inspired by: * - CHARM (Cascading Hallucination in Agentic RAG) — cross-stage consistency tracking, * cascade detection, confidence propagation monitoring, rollback * - Overseer — verifier-first architecture with auto-feedback injection on retry * * This module wraps existing pipeline stages with: * 1. Checkpoints — snapshot each stage's output + verifier results * 2. Cross-stage consistency — TF-IDF cosine drift between consecutive stages * 3.

**Exports :** `VerifierVerdict`, `VerifierResult`, `StageSnapshot`, `CheckpointResult`, `CascadeResult`, `SelfCorrectorConfig`, `DEFAULT_SELF_CORRECT_CONFIG`, `JudgmentGateResult`, `judgmentGate`, `StabilityMetrics`, `computeStability`, `RootCauseAttribution`, `attributeRootCause`, `SelfCorrector`, `thresholdVerifier`

### `lib/agent/self-correction-integration.ts` — 345 lignes

* Self-Correction Integration Layer — NomosX * * Câble la self-correction (Reflexion/MASC pattern) dans le pipeline de production. * Ce module est le pont entre self-correction.ts (qui existe mais n'était jamais appelé) * et pipeline-v2.ts. * * Trois points d'intégration : * 1. afterReader() — évalue la qualité du READER, retry si < 50 * 2. afterAnalyst() — évalue la qualité de l'ANALYST, retry si < 50 * 3. reAnalyzeAfterGapFill() — re-exécute l'ANALYST avec les nouvelles sources gap-filled * * 

**Exports :** `ReaderSelfCorrectionInput`, `AnalystSelfCorrectionInput`, `SelfCorrectionStats`, `selfCorrectReader`, `selfCorrectAnalyst`, `reAnalyzeAfterGapFill`

### `lib/agent/self-correction.ts` — 355 lignes

* Multi-Phase Self-Correction — NomosX * * Inspired by: * - Reflexion (NeurIPS 2023): verbal reinforcement learning from self-reflections * - MASC (ACL 2026): Metacognitive Self-Correction with step-level error detection * - Uncertainty-Aware Self-Correction (OpenReview 2026): SAUP for coding agents * - Process Reward Models (SWE-PRM): inference-time trajectory correction * - Experience Memory Graph (arXiv 2026): graph matching for failure recovery * * Architecture: * - After EACH phase (scout, 

**Exports :** `PhaseReflection`, `SelfCorrectionResult`, `assessPhaseQuality`, `buildCorrectionFeedback`, `reflectAndRetry`

### `lib/agent/self-play/adversarial.ts` — 681 lignes

* Adversarial Self-Play — NomosX * * Le système génère ses propres cas de test difficiles et essaie de * trouver des faiblesses dans ses propres analyses. C'est le pattern * qui crée le moat le plus défensif : le système découvre ses * faiblesses avant les utilisateurs. * * Inspiré de : * - AlphaGo self-play (Silver et al., 2016-2024) * - Red-teaming + automated adversarial testing (2024-2026) * - Constitutional AI's self-critique loop * - "Scalable Oversight" (Anthropic/DeepMind 2026) * * Archi

**Exports :** `AdversarialRole`, `AdversarialQuery`, `ChallengeType`, `AttackVector`, `AttackTarget`, `WeaknessCategory`, `DefenseResponse`, `SelfPlayResult`, `SelfPlayLesson`, `generateAdversarialQueries`, `attackAnalysis`, `defendAnalysis`, `judgeSelfPlay`, `runSelfPlayRound`, `getSelfPlayLessons`

### `lib/agent/ts-setrank.ts` — 248 lignes

* TS-SetRank — Contextual Relevance Reranking via Thompson Sampling * * Inspired by TS-SetRank (ACL 2026): * "Contextual Relevance and Adaptive Sampling for LLM-Based Document Reranking" * * Key insight: document relevance is context-dependent. The same document * may be judged relevant or irrelevant depending on which other documents * appear alongside it in the batch. TS-SetRank estimates contextual relevance * by marginalizing over multiple sampled batches using Thompson Sampling. * * This im

**Exports :** `TSSetRankResult`, `tsSetRank`

### `lib/agent/url-health.ts` — 121 lignes

* URL Health — the urlhealth pattern (arXiv 2604.03173). * * 3–13% of citation URLs produced by deep-research agents are hallucinated * (no Wayback record, never existed); 5–18% don't resolve at all. A cheap * liveness + Wayback check catches both, and is the difference between * "citations look real" and "citations are real". * * Runs post-render on the sources that were actually cited — not the whole * pool — so the cost is bounded (~≤25 URLs).

**Exports :** `UrlHealthResult`, `checkCitedUrlHealth`


## Memory, learning & identity — 50 modules

### `lib/agent/agent-memory.ts` — 957 lignes

* NomosX AGENT MEMORY — Persistent Learning & Self-Calibration * * This is what separates NomosX from a stateless LLM wrapper. * Every agent accumulates a performance history that feeds back into * its own prompts and decision thresholds — creating a genuine * improvement loop without fine-tuning. * * Architecture: * 1. PERFORMANCE LEDGER — per-domain, per-agent success/failure rates * 2. LESSON STORE — explicit lessons extracted from past analyses * 3. CALIBRATION ENGINE — adjusts thresholds ba

**Exports :** `AgentPerformanceRecord`, `FailureMode`, `AgentLesson`, `AgentCalibration`, `MemoryInjection`, `recordAgentPerformance`, `extractLessons`, `getProviderPerformance`, `computeCalibration`, `buildMemoryInjection`, `storeLesson`, `updateLessonSuccessRate`, `recordLearningCycle`, `pruneStaleLessons`, `autoDetectFailureModes`

### `lib/agent/canon/canon-matcher.ts` — 205 lignes

* Canon matcher — deterministic relevance scoring between a research question * and the foundational-text corpus. No LLM call: pure keyword/domain scoring * so it runs in microseconds and costs nothing.

**Exports :** `CANON`, `CanonMatch`, `matchCanon`, `buildCanonBlock`, `buildCanonBlockFromMatches`

### `lib/agent/canon/corpus-economics.ts` — 282 lignes

* Canon — Economics, Strategy & International Relations, History.

**Exports :** `ECONOMICS_IR_CANON`

### `lib/agent/canon/corpus-philosophy.ts` — 305 lignes

* Canon — Philosophy & Political Theory. * From classical antiquity to contemporary critical theory.

**Exports :** `PHILOSOPHY_CANON`

### `lib/agent/canon/corpus-sociology.ts` — 256 lignes

* Canon — Sociology, Anthropology & Social Theory.

**Exports :** `SOCIOLOGY_CANON`

### `lib/agent/canon/corpus-technology.ts` — 321 lignes

* Canon — Science & Technology Studies, Ecology & Risk.

**Exports :** `TECHNOLOGY_CANON`

### `lib/agent/canon/index.ts` — 3 lignes

_(no docstring — voir le code source)_

**Exports :** `—`

### `lib/agent/canon/types.ts` — 43 lignes

* Canon layer — curated foundational texts injected as interpretive * frameworks into the analyst context. This is the "mémoire exhaustive": * philosophy, sociology, political theory, economics, history, STS. * * Unlike live providers (which return metadata + abstracts), the canon * carries the *conceptual content* — each entry encodes the work's core * thesis so the analyst can use it as an analytical lens, not just a citation.

**Exports :** `CanonTradition`, `CanonEntry`

### `lib/agent/episodic-memory.ts` — 420 lignes

* REMEM: Episodic Memory with Hybrid Graph (Gists + Facts) * * Based on: arXiv 2026 "REMem: Episodic Memory with Hybrid Graph for Long-Range * Reasoning in Agentic Systems" * * Maintains a hybrid memory graph with two types of nodes: * - **Gists**: Compressed summaries of events (with timestamps) — "what happened" * - **Facts**: Temporal triplets (subject, predicate, object, timestamp) — "what we know" * * Retrieval is agentic and iterative: the agent traverses the graph, * following edges to fi

**Exports :** `Gist`, `TemporalFact`, `EpisodicMemoryGraph`, `EpisodicRetrievalResult`, `createEpisodicMemory`, `addGist`, `addFact`, `retrieveEpisodic`, `buildEpisodicMemoryInjection`, `EpisodeRecord`, `RetrievedEpisode`, `retrieveEpisodes`, `buildEpisodeContextBlock`, `formatEpisodeContext`, `storeEpisode`

### `lib/agent/foresight-delphi.ts` — 1042 lignes

* FORESIGHT DELPHI — Professional-grade multi-expert scenario forecasting * * Based on proven methods from the Good Judgment Project, IARPA, and 2026 research: * * 1. BASE RATE COMPUTATION (Tetlock, Superforecasting) * - Historical base rates are the #1 predictor of forecasting accuracy * - LLM analyzes historical analogues to establish priors * * 2. FERMI DECOMPOSITION (Fermi estimation, GJP) * - Break the question into sub-questions, estimate each separately * - Reduces overconfidence and anch

**Exports :** `DelphiScenario`, `DelphiResult`, `remapToScenarioNames`, `partitionEvidence`, `extremize`, `plattScale`, `normalize`, `runDelphiForesight`

### `lib/agent/foresight-graph.ts` — 218 lignes

* Foresight GraphRAG — entity graph from academic sources + scenarios * Clean-room alternative to MiroFish seed graph (no AGPL code)

**Exports :** `SourceEvidence`, `ForesightNode`, `ForesightEdge`, `ForesightGraph`, `ScenarioSpec`, `buildForesightGraph`, `graphScenarioBoost`

### `lib/agent/foresight-social.ts` — 161 lignes

* Dual-channel social dynamics — SignalStream + PolicyForum * Clean-room inspired by OASIS (Twitter/Reddit parallel) without AGPL code

**Exports :** `SocialChannel`, `SocialPost`, `SocialFeed`, `createEmptyFeed`, `SocialTickResult`, `runSocialTick`, `summarizeFeed`

### `lib/agent/foresight-swarm.ts` — 122 lignes

* Hierarchical swarm — 512 numeric crowd agents + voice leader personas * Scales like OASIS without 512 LLM calls per tick

**Exports :** `CrowdAgent`, `spawnCrowd`, `propagateCrowd`, `aggregateCrowdMomentum`, `syncLeadersFromCrowd`

### `lib/agent/foresight-types.ts` — 32 lignes

Shared types for Foresight Engine modules (breaks circular imports)

**Exports :** `PersonaArchetype`, `PersonaActionType`, `SwarmLeader`, `SimulationTickEventLite`

### `lib/agent/frozen-inputs.ts` — 119 lignes

* Frozen-inputs store — the non-LLM companion to the cassette. * * The LLM cassette (`lib/llm/cassette.ts`) freezes request/response pairs, * but several pipeline inputs bypass the LLM boundary entirely and mutate * between record and replay: agent-memory lesson reads (every run WRITES * new lessons, so the next replay sees a different set), researcher * profiles/positions (a record run persists the position it just took), * playbooks, live web inputs (positioning competitor corpus, prediction *

**Exports :** `seedFrozenInputs`, `snapshotFrozenInputs`, `hasFrozenInputs`, `hasFrozenInput`, `mergeInputsIntoStats`, `captureInput`, `captureInputSync`, `captureInputFifo`

### `lib/agent/hypothesis-engine.ts` — 438 lignes

* NomosX HYPOTHESIS ENGINE — Framing + Judgment * * Transforms the pipeline from "critique downstream" to "hypothesis upstream", * the working method of elite consultancies (McKinsey's hypothesis-driven * problem solving, RAND's analytic tradecraft): * * 1. FRAMING (before analysis): decompose the question into 3-5 testable * hypotheses, each with explicit evidence requirements. * 2. JUDGE (after reading): assess each hypothesis against actual evidence * → supported / refuted / inconclusive, wit

**Exports :** `Hypothesis`, `FramingOutput`, `HypothesisVerdict`, `JudgeOutput`, `framingAgent`, `hypothesisJudge`, `checkThesisAdherence`, `DerivedThesis`, `deriveThesisFromCorpus`

### `lib/agent/knowledge-graph-pagerank.ts` — 543 lignes

* Knowledge Graph Multi-Hop Retrieval — NomosX Sprint 6 (Gap 5) * * Retrieval multi-hop sur le knowledge graph via Personalized PageRank. * Inspiré de : * - HippoRAG (OSU-NLP-Group, NeurIPS 2024, arxiv 2405.14831) — hippocampal indexing + PageRank * - LightRAG (HKUDS/LightRAG, EMNLP 2025) — dual-level retrieval * - GraphRAG (Microsoft, 2024) — community detection + global search * * Le problème : * Le retrieval NomosX sur le Knowledge Graph est *embedding cosine*. Pour les * questions multi-hop 

**Exports :** `GraphNode`, `GraphEdge`, `MultiHopResult`, `MultiHopConfig`, `DEFAULT_MULTIHOP_CONFIG`, `personalizedPageRank`, `calculateHopDistances`, `multiHopRetrieve`, `isMultiHopQuery`

### `lib/agent/knowledge-graph.ts` — 775 lignes

* NomosX KNOWLEDGE GRAPH — Concept Store & Longitudinal Memory * * A pgvector-backed concept store that tracks knowledge across briefs: * * 1. Extracts key concepts from each analysis (entities, claims, relationships) * 2. Stores concept embeddings for semantic retrieval * 3. Links concepts to sources, briefs, and other concepts * 4. Tracks concept evolution over time (longitudinal tracking) * 5. Detects emerging themes and shifting consensus * 6. Provides "institutional memory" — the system rem

**Exports :** `Concept`, `ConceptType`, `ConceptRelation`, `RelationType`, `ConceptExtractionResult`, `KnowledgeQueryResult`, `LongitudinalInsight`, `extractAndStoreConcepts`, `queryKnowledgeGraph`, `getLongitudinalInsights`, `WorkingMemoryCluster`, `ExperienceMemoryEntry`, `EvoMemKGState`, `createEvoMemKG`, `addToWorkingMemory`

### `lib/agent/knowledge-infrastructure.ts` — 589 lignes

* NomosX Knowledge Graph + Experience Bank + Context Compression * * Three infrastructure innovations from 2026 research: * * 1. KNOWLEDGE GRAPH (Agents-K1, arxiv 2026): * Converts papers into typed knowledge graphs with entities, claims, * mechanisms, method lineages. Enables multi-hop reasoning. * * 2. EXPERIENCE BANK (TMAS, ICML 2026): * Persistent memory of past analyses. Reusable conclusions, patterns, * and guidelines that improve future runs. * * 3. CONTEXT COMPRESSION (IterResearch, ICLR

**Exports :** `KGEntity`, `KGRelation`, `KnowledgeGraph`, `buildKnowledgeGraph`, `normalizeKGEntity`, `ExperienceEntry`, `GuidelineEntry`, `recordExperience`, `recordGuideline`, `getRelevantExperience`, `getRelevantGuidelines`, `extractExperience`, `compressContext`, `compressReadings`

### `lib/agent/memory-consolidation.ts` — 249 lignes

* Memory Consolidation — STM→LTM promotion (AgeMem / memorywire pattern). * * The pipeline stores episodic records (EPISODE_STORED) and procedural * lessons (LESSON_LEARNED), but nothing compresses recurring experience into * durable SEMANTIC knowledge. Without consolidation, episodic memory grows * forever and never becomes "what we know". * * This cron-side module: * 1. Reads recent episodes + lessons * 2. Groups them by domain * 3. LLM-digests each cluster into consolidated domain patterns * 

**Exports :** `ConsolidationResult`, `getSemanticPatterns`, `consolidateEpisodicMemory`

### `lib/agent/meta-analysis-engine.ts` — 527 lignes

* NomosX META-ANALYSIS ENGINE * * Statistical aggregation of effect sizes across multiple sources. * This is what separates a real think tank from a glorified summarizer: * * 1. Collects quantitative data from READER V3 outputs * 2. Standardizes effect sizes (Cohen's d, Hedges' g, odds ratios → common scale) * 3. Computes weighted pooled estimates (inverse-variance weighting) * 4. Assesses heterogeneity (I², Q-statistic, tau²) * 5. Detects publication bias (funnel plot asymmetry via Egger's test

**Exports :** `EffectSizeEntry`, `PooledEstimate`, `HeterogeneityStats`, `PublicationBiasAssessment`, `ForestPlotEntry`, `MetaAnalysisResult`, `metaAnalysisEngine`

### `lib/agent/pathmind-kg.ts` — 273 lignes

* PathMind — Retrieve-Prioritize-Reason KG Reasoning — NomosX * * Inspired by: * - PathMind (AAAI 2026, S15-10): Retrieve-Prioritize-Reason framework for * knowledge-graph reasoning with semantic-aware path priority. Combines * A*-style cost + future-cost estimation with beam search to produce * high-quality reasoning chains. Enhances EvoMemKG (K12) by adding * priority-driven path selection over the knowledge graph. * * Architecture: * - pathPriority(): semantic-aware priority = costWeight * co

**Exports :** `KGEdge`, `KGPath`, `PathPriorityConfig`, `DEFAULT_PATH_CONFIG`, `pathPriority`, `beamSearch`, `rankPaths`, `extractReasoningChain`

### `lib/agent/phd-researcher.ts` — 2286 lignes

* NomosX PhD RESEARCHER AGENTS — Phase 3 Domain Expert Council (22 domains) * * 22 specialized PhD-level domain experts, each with: * - Deep domain knowledge encoded in system prompts * - Specific analytical frameworks (econometrics, ML theory, policy analysis...) * - Calibrated confidence (knows what it doesn't know) * - Academic citation standards (APA-level rigor) * * Architecture optimized for scalable parallel processing: * - Smart domain selection based on topic relevance * - Load balancin

**Exports :** `runExpertAnalysis`, `detectRelevantExperts`, `determineOptimalExpertCount`, `runExpertCouncil`

### `lib/agent/playbook.ts` — 202 lignes

* PLAYBOOK — ACE-style evolving context (Agentic Context Engineering, ICLR 2026). * * Instead of static prompts, each agent role maintains a curated playbook of * durable strategy bullets that accumulate, refine, and get pruned over runs. * Unlike distilled summaries (which suffer brevity bias / context collapse), * entries are structured, incremental, and individually scored — the store * keeps the detail, the prompt only carries the current best slice. * * Store: `agentAuditLog` rows (action: 

**Exports :** `PlaybookOp`, `PlaybookBullet`, `recordPlaybookDelta`, `getPlaybook`, `getPlaybookBlock`, `curatePlaybook`

### `lib/agent/policy-stress-tester.ts` — 136 lignes

* POLICY STRESS TESTER — NomosX * * Stress-teste les recommandations d'un think tank a la maniere de Civica : * plusieurs archetypes specialises (economiste, juriste, industriel, etc.) * identifient les risques, groupes affectes et mecanismes pour chaque * recommandation, puis un coordinateur synthetise le resultat. * * Inspiration : Civica (Shlok-Ippala) — multi-agent policy stress test.

**Exports :** `StressRecommendation`, `StressRisk`, `StressTestResult`, `StressTestOptions`, `stressTestRecommendations`, `renderStressTest`

### `lib/agent/prediction-auditor.ts` — 360 lignes

* NomosX PREDICTION AUDITOR — Retrospective Accuracy Tracking * * P2-G: Each PhD researcher makes predictions with probability + timeframe. * This agent checks whether past predictions have been validated or falsified * by new evidence arriving in subsequent pipeline runs. * * Flow: * 1. Load all stored predictions from AgentAuditLog (type: "prediction") * 2. For each prediction past its timeframe, search new sources for evidence * 3. Use LLM to assess: confirmed / falsified / inconclusive * 4. 

**Exports :** `PredictionAuditResult`, `PredictionAuditOutput`, `runPredictionAuditor`

### `lib/agent/prediction-markets.ts` — 278 lignes

* Prediction Market Integration — External forecast validation * * Integrates real-time prediction market data to ground Delphi forecasts * in market expectations. Prediction markets are often more accurate than * individual experts (Wisdom of Crowds, Hayek's information aggregation). * * Sources: * - Polymarket (public API, no key needed) * - Metaculus (public API, no key needed) * * Usage in foresight-delphi.ts: * const marketData = await fetchPredictionMarketData(question, scenarioNames); * /

**Exports :** `MarketPrediction`, `MarketDataResult`, `fetchPredictionMarketData`, `blendWithMarket`

### `lib/agent/prediction-registration.ts` — 272 lignes

* NomosX PREDICTION REGISTRATION — T10 * * Extracts testable predictions from the analysis output and registers them * in the Prediction table for retrospective auditing. * * A prediction is a claim about the future with: * - A horizon (when it will be testable) * - Resolution criteria (what observable fact would confirm/refute) * - A confidence tier (from pruning gates trust propagation) * - Source references (which [SRC-N] support it) * * Predictions are extracted from: * - future_extrapolatio

**Exports :** `extractPredictions`, `registerPredictions`

### `lib/agent/prediction-tracker.ts` — 453 lignes

* Prediction Tracker & Calibration — NomosX * * Inspired by: * - Forecasting Agent (NYU Agentic Learning Lab, +0.18 info coefficient) * - predict-raven (Polymarket live agent) * - Outcome-based RL for Forecasting (14B model matche o1, beats on calibration) * - ConfidenceBench (2026): Calibration benchmark for LLMs * - Scenario Lab (MCTS for branching futures) * * Architecture: * - Store each SCATTER hypothesis/prediction with timestamp + probability * - 30/90/365 days later, evaluate if the pred

**Exports :** `Prediction`, `CalibrationReport`, `storePrediction`, `storePredictionsFromHypotheses`, `parseHorizonDue`, `findPredictionsDueForEvaluation`, `resolveDuePredictions`, `evaluatePrediction`, `generateCalibrationReport`, `formatCalibrationContext`

### `lib/agent/prediction-watch.ts` — 223 lignes

* PREDICTION WATCH — closes the forecast loop (P2/7). * * Predictions are registered OPEN with `whatWouldFalsify` / `resolutionCriteria` * triggers (prediction-registration.ts). Until now nothing compared today's * news flow against those triggers — predictions were write-only memory. * * Each radar cycle, incoming topics are matched against OPEN predictions' * trigger text. A match means the world moved on a dossier we already covered: * → a PREDICTION_TRIGGER Signal is persisted (traceability 

**Exports :** `TriggerMatch`, `matchPredictionTriggers`, `runPredictionWatch`

### `lib/agent/prompt-optimizer/index.ts` — 28 lignes

* Prompt Optimizer module — NomosX Sprint 6 (Gap 1) * * Optimisation end-to-end des prompts via "textual gradients" (DSPy/TextGrad/Trace-OPTO). * * @see ROADMAP_2026.md — Gap 1

**Exports :** `—`

### `lib/agent/prompt-optimizer/prompt-optimizer.ts` — 649 lignes

* Prompt Optimizer — NomosX Sprint 6 (Gap 1) * * Optimisation end-to-end des prompts des agents via "textual gradients". * Inspiré de : * - DSPy (stanfordnlp/dspy) — prompt optimization via BootstrapFewShot, MIPRO * - TextGrad (zou-group/textgrad) — backprop textuelle PyTorch-style * - Trace / OPTO (microsoft/Trace, NeurIPS 2024) — AutoDiff-like pour workflows * * Le problème : * Le Witness *suggère* des prompt modifications (append-only), mais il n'y a pas * d'optimisation systématique. L'optim

**Exports :** `PromptVersion`, `FeedbackSource`, `PromptOptimizationInput`, `OptimizationFeedback`, `PromptOptimizationResult`, `getPromptVersions`, `getActivePromptVersion`, `registerPromptVersion`, `setActivePromptVersion`, `optimizePrompt`, `updatePromptMetrics`, `optimizeAllPrompts`, `loadPromptArchive`, `registerDefaultPrompt`, `getActiveSystemPrompt`

### `lib/agent/researcher-identity.ts` — 559 lignes

* NomosX RESEARCHER IDENTITY — Persistent Intellectual Personas * * Each PhD researcher is not a stateless prompt — they are an intellectual * entity with a history of positions, a track record of predictions, and * the ability to evolve their views based on new evidence. * * This is what makes NomosX publications genuinely superior: * Dr. Ploutos has published 23 analyses. She predicted in March that carbon * taxes would underperform in high-inequality contexts. New evidence confirms * this. Sh

**Exports :** `ResearcherPosition`, `PredictionRecord`, `ResearcherProfile`, `PositionUpdate`, `storeResearcherPosition`, `storePrediction`, `buildResearcherProfile`, `ResearcherPositionRecord`, `ResearcherPredictionRecord`, `ResearcherTrackRecord`, `getResearcherTrackRecord`, `detectPositionEvolution`, `storeExpertAnalysisMemory`

### `lib/agent/researcher-kb/index.ts` — 3978 lignes

* NomosX RESEARCHER KNOWLEDGE BASE SYSTEM * * Each PhD researcher has: * 1. A dedicated knowledge base (key concepts, frameworks, reference papers) * 2. Domain-specific tools (APIs they can query directly) * 3. Private memory (past analyses, predictions, lessons learned) * 4. Methodology preferences (how they approach research) * * This replaces the shallow "system prompt only" approach with * true specialization — like giving each researcher their own library. * * Architecture pattern: RAG-lite

**Exports :** `ResearcherKB`, `KeyConcept`, `AnalyticalFramework`, `ReferencePaper`, `DataSource`, `MethodologyProfile`, `QualityCriteria`, `RESEARCHER_KBS`, `getResearcherKB`, `buildKBInjection`, `getResearcherDataSources`, `getAllKBs`

### `lib/agent/researcher-ownership.ts` — 2122 lignes

* NomosX Researcher Ownership System * * CTO-Level Architecture: Domain-based editorial ownership system * Maps PhD researchers to their primary domains with pipeline tier selection. * * Purpose: * - Assign editorial responsibility for research domains * - Select appropriate pipeline tiers based on topic complexity * - Provide researcher sign-off mechanisms for quality control * - Enable domain-specific provider preferences * * Architecture Principles: * - Single source of truth for domain owner

**Exports :** `getResearcherUIName`, `getResearcherUITitle`, `getResearcherUIInstitution`, `ResearcherProfile`, `RESEARCHER_REGISTRY`, `VERTICAL_RESEARCHER_MAP`, `getVerticalForTopic`, `getLeadResearcherForVertical`, `getProvidersForVertical`, `PipelineTier`, `PipelineTierConfig`, `PIPELINE_TIERS`, `DomainScore`, `detectOwners`, `getPrimaryOwner`

### `lib/agent/scenario-architect.ts` — 165 lignes

* Scenario Architect — the Shell method, made structural. * * The classic failure mode of LLM scenarios: three variants of the same * future (optimistic/base/pessimistic on one implicit dimension). Shell's * method avoids this by construction: * * 1. PREDETERMINED ELEMENTS — what is already certain ("it has rained in * the mountains, so it will flood in the plains"). These belong in * EVERY scenario and must not be treated as uncertainties. * 2. CRITICAL UNCERTAINTIES — exactly two axes, each hi

**Exports :** `CriticalUncertainty`, `ScenarioSkeleton`, `ScenarioArchitecture`, `architectScenarioMatrix`, `architectureToPromptBlock`

### `lib/agent/scenario-engine.ts` — 504 lignes

* NomosX Causal Analogical Researcher (CANA) + SCATTER + Courtroom Debate * * Three innovations from 2026 research for scenario-rich analysis: * * 1. CANA (arxiv 2026): Causal Analogical Researcher * Finds historical analogies by UNDERLYING MECHANISM, not surface similarity. * +10% vs deep research agents on ADR-bench. * Key insight: LLMs match on surface features. CANA decomposes situations * into causal mechanisms, then searches for analogues on those mechanisms. * * 2. SCATTER (ACL 2026): Sca

**Exports :** `CausalMechanism`, `HistoricalAnalogue`, `CanaResult`, `runCana`, `Hypothesis`, `ScatterResult`, `runScatter`, `DebateArgument`, `DebateResult`, `runCourtroomDebate`

### `lib/agent/scenario-pack.ts` — 107 lignes

* SCENARIO PACK - NomosX * * Modele des scenarios de niveau think tank: moteurs, points de bascule, * signaux d'alerte precoce et sensibilite aux hypotheses. * * Inspirations : RAND Foresight, Chatham House Scenarios, Shell Scenarios.

**Exports :** `ScenarioPackOptions`, `ScenarioOutlook`, `ScenarioModeling`, `generateScenarioModeling`, `renderScenarioModeling`

### `lib/agent/self-evolver.ts` — 1016 lignes

* SELF-EVOLVER — NomosX * * Agent autonome qui ameliore ses propres prompts a partir des experiences passees. * Inspiration : HyperAgents, SePO, FAPO, Karpathy autoresearch, EvoTool, canvas-org/meta-agent. * * Principe : apres chaque run, le Self-Evolver : * 1. collecte les lecons et echecs * 2. propose une mutation ciblee du prompt system * 3. evalue l'ancien vs le nouveau via un juge * 4. garde le meilleur et versionne * * Le modele reste gele ; seul le texte du prompt evolue.

**Exports :** `PromptVersion`, `EvolutionResult`, `EvolverConfig`, `collectEvolutionSignal`, `proposePromptMutation`, `scorePromptVariant`, `evolveAgentPrompt`, `getLatestPrompt`, `runEvolutionCycle`, `MagesubgraphType`, `MAGEExperienceNode`, `MAGESkillNode`, `MAGECurriculumNode`, `MAGEPerformanceNode`, `MAGEState`

### `lib/agent/simulation-agent.ts` — 1475 lignes

* Simulation Agent — NomosX Foresight Engine v3 * ────────────────────────────────────────────── * Surpasses MiroFish/OASIS on: GraphRAG + 512-agent swarm + dual-channel social * + multi-seed robustness + academic calibration + adversarial gate.

**Exports :** `PersonaArchetype`, `StakeholderPersona`, `SimulationScenarioSpec`, `SimulationInput`, `MonteCarloConfig`, `ConvergenceResult`, `SensitivityEntry`, `SensitivityMatrix`, `PersonaActionType`, `SimulationTickEvent`, `SimulationScenarioState`, `SimulationTick`, `ScenarioTrajectory`, `SimulatedScenarioOutcome`, `SimulationOutput`

### `lib/agent/skill-bank.ts` — 109 lignes

* SKILL BANK — NomosX * * Procedural memory for research strategies (FlowEvo/SkillGLoW pattern, 2026). * When a pipeline run produces a high-trust result, the winning configuration * (domain → providers + lens types) is compiled into a reusable "skill". * * On subsequent runs in the same domain, proven skills bias retrieval toward * the provider/lens mix that previously produced trust ≥ 80. * * Storage: AgentAuditLog rows with action 'SKILL_RECORD' — no schema change. * A skill is promoted to "p

**Exports :** `SkillRecord`, `ProvenSkill`, `recordSkill`, `getProvenSkill`, `applySkillToProviders`

### `lib/agent/synapse-memory.ts` — 275 lignes

* SYNAPSE: Spreading Activation Memory for Agentic Systems * * Based on: ACL 2026 "Synapse: Spreading Activation Memory for Long-Range * Reasoning in Agents" * * Unified episodic-semantic memory with spreading activation: * - When a node is activated (by query match), activation spreads to * neighboring nodes in the graph * - Lateral inhibition: strongly activated nodes suppress weak neighbors * (focuses retrieval on the most relevant memories) * - Temporal decay: older memories lose activation 

**Exports :** `MemoryNode`, `MemoryEdge`, `SynapseGraph`, `SynapseRetrievalResult`, `createSynapseGraph`, `addMemoryNode`, `connectMemories`, `retrieveWithSpreadingActivation`, `buildSynapseMemoryInjection`

### `lib/agent/temporal-memory.ts` — 363 lignes

* Temporal Memory — NomosX Sprint 6 (Gap 9) * * Bi-temporal knowledge tracking for the World Model. * Inspired by : * - Graphiti (getzep/graphiti) — temporal knowledge graph with bi-temporal validity * - Zep (getzep/zep) — long-term memory with temporal context * - HippoRAG — neurobiologically inspired long-term memory * * Le problème : * Le World Model et Agent Memory de NomosX sont *snapshot*. On ne sait pas * quand un fait était vrai, quand il a été enregistré, et comment les positions * ont 

**Exports :** `TemporalFact`, `PositionEvolution`, `TemporalQueryOptions`, `recordTemporalFact`, `queryTemporalFacts`, `findCurrentFacts`, `getPositionEvolution`, `ensureTemporalFields`, `buildTemporalMemoryInjection`

### `lib/agent/track-record.ts` — 203 lignes

* Track Record — Brier score display and historical accuracy. * * Inspired by: * - IARPA Good Judgment Project: superforecaster calibration tracking * - Friedman et al. 2017 (888K forecasts): numeric probabilities are more informative * - Tetlock: "the assertion-to-evidence ratio" matters * * This module renders the historical track record of NomosX predictions, * showing calibration (Brier score) and accuracy by confidence level.

**Exports :** `TrackRecordStats`, `computeTrackRecordStats`, `renderTrackRecordHtml`

### `lib/agent/witness/cognitive-cycle.ts` — 825 lignes

* Witness Cognitive Cycle — NomosX * * Le cycle cognitif à 6 phases du Witness : * PERCEIVE → INTERPRET → EVAL → INTEND → PLAN → ACT * * Une cycle = une observation d'une étape du pipeline. * Le Witness reçoit l'observation, l'interprète, l'évalue contre les * attentes, décide s'il doit intervenir, planifie l'intervention, * et l'exécute (via WriteGuard). * * Inspiré de Sakshi (Witness pattern) + MIDCA (metacognitive control).

**Exports :** `WitnessConfig`, `DEFAULT_WITNESS_CONFIG`, `Witness`

### `lib/agent/witness/integration.ts` — 218 lignes

* Witness Integration — NomosX * * Câble le Witness dans le pipeline de production. * Le Witness observe chaque étape du pipeline et peut intervenir. * * Usage : * const witnessCtx = createWitnessContext(runId, query, budgetCapUsd); * // ... after each pipeline step: * await witnessCtx.witness.observe(observation); * // ... at the end: * const learning = await witnessCtx.finalize();

**Exports :** `WitnessContext`, `createWitnessContext`, `buildObservation`

### `lib/agent/witness/meta-loop.ts` — 487 lignes

* Witness Meta-Loop & Cross-Run Learning — NomosX * * La méta-loop (MONITOR → ASSESS → CONTROL) tourne au-dessus du cycle * cognitif. Elle observe la santé globale du run, pas juste une étape. * * L'auto-amélioration entre les runs : après chaque pipeline run, le Witness * extrait des leçons et propose des modifications de prompts et de seuils * pour les runs futurs. C'est la couche 4 — le système apprend à mieux * fonctionner, pas juste à se corriger dans le moment. * * Patterns : * - Sakshi Wi

**Exports :** `MetaLoopResult`, `runMetaLoop`, `extractRunLearning`, `getPastLearnings`, `buildLearningInjection`

### `lib/agent/witness/seams.ts` — 474 lignes

* Witness Seams — NomosX * * Les "seams" typés du Witness : les interfaces que le host (pipeline) * doit implémenter pour que le Witness puisse observer et intervenir. * * Inspiré de Sakshi (bionicbutterfly13/sakshi) — le Witness observe * via des seams typés sans jamais posséder la cognition. * * Quatre seams principaux : * 1. EventBus — émission d'événements (cycle traces, anomalies) * 2. GoalStateStore — lecture de l'état du pipeline * 3. WriteGuard — validation des interventions (sécurité) *

**Exports :** `EventBus`, `ConsoleEventBus`, `DatabaseEventBus`, `GoalStateStore`, `InMemoryGoalStateStore`, `WriteGuard`, `DenyByDefaultWriteGuard`, `AlwaysPermitWriteGuard`, `ProductionWriteGuard`, `Clock`, `SystemClock`, `DeterministicClock`, `InterventionExecutor`, `NoOpInterventionExecutor`

### `lib/agent/witness/types.ts` — 306 lignes

* Witness Types — NomosX * * Types et interfaces du Witness pattern (méta-conscience). * Inspiré de Sakshi (bionicbutterfly13/sakshi) — le Witness observe * le pipeline sans faire le travail lui-même. * * Le Witness : * - Observe chaque cycle du pipeline via des seams typés * - Évalue si le résultat correspond aux attentes * - Peut intervenir (via WriteGuard) quand quelque chose va mal * - Apprend entre les runs pour améliorer les prompts et seuils * * Cycle cognitif à 6 phases : * PERCEIVE → IN

**Exports :** `CognitivePhase`, `MetaPhase`, `CycleTrace`, `PhaseResult`, `CycleAssessment`, `AnomalyType`, `AnomalyEvent`, `InterventionType`, `InterventionRecord`, `GuardVerdict`, `GuardDecision`, `StepExpectation`, `PipelineObservation`, `WitnessState`, `RunLearning`

### `lib/agent/world-model/world-model.ts` — 825 lignes

* World Model — NomosX * * Le World Model est la mémoire persistante du système. Il accumule * la connaissance à travers les runs : quels domaines ont été explorés, * quelles sont les positions établies, quelles sont les controverses * actives, quelles sont les connexions inter-domaines. * * C'est le moat le plus durable : après des milliers de runs, le système * a une compréhension du monde que les concurrents ne peuvent pas * répliquer sans le même volume d'exploration. * * Inspiré de : * - Wo

**Exports :** `DomainMemory`, `ConceptEntry`, `PositionEntry`, `ControversyEntry`, `SourceEntry`, `ParadigmShiftEntry`, `CrossDomainLink`, `queryWorldModel`, `updateWorldModel`, `EpisodicMemoryEntry`, `SemanticMemoryRule`, `WorldEvolverState`, `createWorldEvolver`, `recordEpisode`, `predictWithForesight`


## Agent submodules (lenses, MoA, PRM, self-play, witness, canon, KB) — 22 modules

### `lib/agent/brief-html-extract.ts` — 91 lignes

* Extract teasers from brief HTML — legacy executive summary + Editorial V2 position-first.

**Exports :** `isPositionFirstBrief`, `extractInstituteVerdict`, `extractDetectedSubject`, `extractBriefSummary`

### `lib/agent/chart-generator.ts` — 254 lignes

* Chart Generator — SVG Charts for Pipeline HTML Reports * * Generates inline SVG charts that can be embedded directly in HTML briefs * and strategic reports without requiring client-side JavaScript. * * Used by: renderBriefHTML, renderStrategicReportHTML

**Exports :** `renderEvidenceGaugeSVG`, `BarChartItem`, `renderHorizontalBarSVG`, `DonutItem`, `renderDonutSVG`, `ScenarioData`, `renderScenariosSVG`, `renderSourceDistributionSVG`, `StakeholderData`, `renderStakeholderImpactSVG`

### `lib/agent/durable-execution.ts` — 444 lignes

* Durable Execution — NomosX Sprint 6 (Gap 12) — ÉVALUATION * * Évaluation des options pour remplacer la job queue par une orchestration durable. * Inspiré de : * - Temporal (temporal.io) — durable workflows with replay * - Inngest AgentKit — AI-native durable orchestration * - Rivet agentOS — durable workflows with WebAssembly * * Le problème : * La job queue NomosX est priority-based mais pas *durable*. En cas de crash, * les runs en cours sont perdus. Les runs "strategic" peuvent durer 10+ mi

**Exports :** `DurableExecutionState`, `StepResult`, `runDurableStep`, `durableResume`, `markDurableComplete`, `saveDurableStep`, `durableKeyFor`, `initDurableRun`, `DurableExecutionOption`, `DURABLE_EXECUTION_OPTIONS`

### `lib/agent/hero-image.ts` — 610 lignes

* NomosX Hero Image Generator — generates symbolic illustrations * for publication heroes using GPT Image 2. * * Design philosophy — "From Chaos to Nomos", expressed as GREEK FRESCO × AI: * - Each publication gets a mythic figure or tableau — gods, draped beings, * mythological scenes — rendered like a rediscovered ancient fresco: * mineral pigments, weathered plaster, visible craquelure * - The ancient scene is fused with machine intelligence: fine luminous * filaments woven into drapery, glowi

**Exports :** `HeroImageResult`, `HeroArticleContext`, `generateHeroImage`, `saveHeroImage`

### `lib/agent/index-agent.ts` — 500 lignes

* INDEX Agent * Normalizes sources, enriches identities (ROR/ORCID), and deduplicates

**Exports :** `indexAgent`, `deduplicateSources`

### `lib/agent/json-utils.ts` — 163 lignes

* Shared JSON utilities — robust parsing for LLM outputs. * * LLMs (especially GLM, DeepSeek) frequently wrap JSON in markdown fences * (```json ... ```), truncate long outputs, or append trailing text. * These utilities handle all those cases gracefully.

**Exports :** `stripJsonMarkdownFences`, `repairTruncatedJson`, `parseJson`, `parseJsonOrThrow`

### `lib/agent/langfuse.ts` — 312 lignes

* Langfuse Observability — NomosX Sprint 6 (Gap 11) * * Intégration de Langfuse (TypeScript natif) pour l'observabilité des LLM calls. * Langfuse : tracing distribué, cost tracking, prompt management, datasets. * * Le problème : * NomosX a des dashboards custom mais pas d'observabilité production-grade * avec tracing distribué, traçage des coûts, gestion des prompts, etc. * * Architecture : * 1. Wrapper autour de callLLM pour envoyer les traces à Langfuse * 2. Traces structurées par run, agent, 

**Exports :** `LangfuseConfig`, `LangfuseTrace`, `LangfuseScore`, `queueTrace`, `queueScore`, `traceLLMCall`, `tracePipelineStart`, `tracePipelineEnd`, `scorePipeline`, `flushAll`

### `lib/agent/lenses/lens-agent.ts` — 226 lignes

* Lens Agent — gives each search lens its own PhD-level intelligence. * * A lens is no longer a query template. The lens agent: * 1. Receives the question + its knowledge profile + the sources found * 2. Judges whether its knowledge suffices (self-assessment) * 3. If not, generates targeted fetch queries for ITS providers/canon * 4. Produces a lens insight — a mini-analysis in its disciplinary voice * * Runs one LLM call per lens (bounded), only for strategic/dossier formats.

**Exports :** `LensInsight`, `runLensAgent`, `lensFetchProviders`, `LensTension`, `checkLensTensions`

### `lib/agent/lenses/lens-knowledge.ts` — 195 lignes

* Lens Knowledge — PhD-level intellectual profiles for each search lens. * * A lens is not a query template: it is a way of knowing. Each profile encodes * the intellectual tradition, methodology, signature questions, and blind * spots a doctoral-level specialist would bring — plus the providers and * canon works that field draws on when its knowledge runs out.

**Exports :** `LensKnowledge`, `LENS_KNOWLEDGE`

### `lib/agent/pdf-export.ts` — 41 lignes

* PDF EXPORT — Convert HTML briefs/reports to print-optimized HTML * * Note: Puppeteer-based PDF generation is disabled for Netlify builds. * Users can Ctrl+P the HTML output to save as PDF. * * The HTML includes: * - Professional typography * - Print-optimized layout * - Color preservation

**Exports :** `generatePrintHTML`

### `lib/agent/position-first-brief.css.ts` — 1006 lignes

* Shared CSS for position-first brief HTML (Editorial V2). * Values mirror --nx-* tokens from app/globals.css (standalone briefs load Barlow via Google Fonts).

**Exports :** `POSITION_FIRST_BRIEF_CSS`

### `lib/agent/position-first-renderer.ts` — 711 lignes

* Position-first brief renderer — Editorial V2 public format. * * The NomosX DNA: "From Chaos to Nomos" — every report performs the movement * from disorder to order. The 4-act structure maps to our method: * I. The Question (Map) — define the question, show the chaos * II. The Evidence (Confront)— our position, the evidence, the counter-argument * III. The Futures (Quantify)— scenarios as narratives, not bullet points * IV. The Decision (Decide) — a position worth defending, with the receipts *

**Exports :** `CentralScenarioLabels`, `renderCentralScenarioBlock`, `renderPositionFirstBriefHTML`

### `lib/agent/provider-health-tracker.ts` — 301 lignes

* NomosX PROVIDER HEALTH TRACKER — Circuit Breaker for Data Sources * * P3-K: Tracks provider failure rates and temporarily blacklists * providers that are consistently failing, avoiding wasted API calls. * * Features: * - Tracks success/failure per provider in Redis (with DB fallback) * - Circuit breaker: blacklist provider after 3 consecutive failures * - Auto-recovery: re-enable after 30 minutes * - Feeds failure data back into AgentMemory for calibration * - Exposes getHealthyProviders() for

**Exports :** `ProviderHealth`, `ProviderCallResult`, `recordProviderCall`, `isProviderHealthy`, `isProviderEmptyDegraded`, `getHealthyProviders`, `getProviderHealthReport`, `resetProvider`

### `lib/agent/provider-queue.ts` — 216 lignes

* NomosX PROVIDER QUEUE — Backpressure control for 200+ academic providers. * * Instead of launching all providers in parallel via Promise.allSettled(), * this module wraps calls in a concurrency-limited queue with: * - Per-provider concurrency caps (configurable) * - Global concurrency cap (prevents thundering herd) * - Request deduplication (same query+provider = 1 call) * - Circuit breaker integration (skip queued calls if provider is tripped) * * Design: * - Uses p-limit for in-process concu

**Exports :** `QueuedCallOptions`, `queuedProviderCall`, `queuedBatchCalls`, `getQueueStats`, `resetQueue`

### `lib/agent/redis-rest.ts` — 94 lignes

* Upstash REST-backed Redis client. * * The deployment only has UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN * (HTTP API credentials) — no rediss:// TCP endpoint — so ioredis cannot * connect and every cache/rate-limit path silently degrades. The Upstash * REST API accepts the same commands as a JSON array over HTTPS, which * covers the entire method surface NomosX actually uses * (get/setex/set/del/incr/expire/ttl/ping/flushdb). * * This is NOT a full ioredis replacement: no pipelining, no

**Exports :** `createUpstashRestClient`

### `lib/agent/redis-simple.ts` — 345 lignes

* NomosX REDIS CONFIGURATION - Simplified Version * Configuration Redis simplifiée pour éviter les erreurs de compatibilité

**Exports :** `SimpleRedisConfig`, `simpleRedisConfig`, `SimpleRedisManager`, `SimpleCacheUtils`, `simpleRedisManager`

### `lib/agent/resilience.ts` — 225 lignes

* NomosX RESILIENCE LAYER — Cockatiel-based bulkhead + retry policies. * * This module provides: * - Bulkhead isolation: limits concurrent LLM calls per provider * - Retry with exponential backoff + jitter (Cockatiel's built-in) * - Timeout escalation: increases timeout on each retry attempt * - Circuit breaker integration: delegates to the existing custom breaker * * Used as a wrapper around LLM calls in unified-llm.ts. * The existing Redis-backed circuit breaker remains the source of truth for

**Exports :** `createLLMRetryPolicy`, `withLLMResilience`, `getBulkheadStats`, `recordAdaptive429`, `recordAdaptiveSuccess`, `getAdaptiveRate`, `getAdaptiveRateStats`

### `lib/agent/smart-provider-selector.ts` — 538 lignes

* Smart Provider Selector * * Intelligently selects the best providers and quantities * based on domain and question complexity * * Best Practices 2026: Context-aware, intelligent defaults

**Exports :** `Provider`, `SmartSelection`, `detectDomain`, `estimateComplexity`, `selectSmartProviders`

### `lib/agent/strategic-report-renderer.ts` — 813 lignes

* Strategic Report HTML Renderer * Renders comprehensive 10-15 page Strategic Reports with: * - Professional styling * - Table of contents * - Section numbering * - Source references * - Charts placeholders

**Exports :** `dedupeCitations`, `renderStrategicReportHTML`

### `lib/agent/svg-charts.ts` — 255 lignes

* SVG Chart Generator — inline SVG visualizations for strategic reports. * * Inspired by: * - CSIS: "data-rich graphics and maps that provide fresh insights" * - IISS Strategic Survey: "Data-rich graphics and maps" * * Generates static SVG (no JS) that renders in any browser/email client. * Supports: line charts (trends), bar charts (comparisons).

**Exports :** `renderLineChartSvg`, `renderBarChartSvg`, `renderScenarioChartSvg`, `injectQuantSection`

### `lib/agent/translation-service.ts` — 279 lignes

* Publication Translation Service * * On-demand translation of published articles using GPT-4. * Translations are cached in the `PublicationTranslation` table. * * Flow: * 1. User visits /fr/inquiry/[slug] * 2. Look up existing translation in DB * 3. If found → return cached translation * 4. If not → call GPT to translate, store in DB, return * * The original article is never modified. Translations are linked via * the `PublicationTranslation` model (publicationId + locale unique).

**Exports :** `TranslationResult`, `getPublicationInLocale`

### `lib/agent/types/index.ts` — 260 lignes

* NomosX Unified Type System * * Single source of truth for all shared types across the agent system. * Prevents circular dependencies and type conflicts.

**Exports :** `DomainExpertise`, `ExpertAnalysis`, `EvidenceAssessment`, `Prediction`, `ExpandedPhDResearcher`, `PipelineCoreOptions`, `DataLineage`, `AutoPublisherLineage`, `PublicationResult`, `AutoPublisherOutput`, `CouncilConfig`, `EnhancedSynthesisReport`, `VerticalPublisherOutput`, `Providers`, `ReportFormat`


## Providers — providers racine — 70 modules

### `lib/providers/apitube-provider.ts` — 102 lignes

* APITube Provider — Real-time news API with entity extraction & sentiment. * Free tier: full enriched schema, no credit card required. * 500K+ sources, 59 languages, 177+ countries. * Each article enriched with entities, sentiment, categories, source authority.

**Exports :** `searchAPITube`

### `lib/providers/arxiv.ts` — 109 lignes

* arXiv Provider - Preprints en physique, mathématiques, CS, etc. * API: https://info.arxiv.org/help/api/index.html

**Exports :** `searchArxiv`

### `lib/providers/base.ts` — 43 lignes

* BASE (Bielefeld Academic Search Engine) Provider - Méta-moteur académique * API: https://www.base-search.net/about/en/about_develop.php

**Exports :** `searchBASE`, `searchBase`

### `lib/providers/biology.ts` — 70 lignes

* Biology Provider — via SemanticScholar (field-of-study) + OpenAlex fallback * Covers: molecular biology, genetics, ecology, evolutionary biology, cell biology

**Exports :** `searchBiology`

### `lib/providers/business.ts` — 70 lignes

* Business Provider — via SemanticScholar (field-of-study) + OpenAlex fallback * Covers: management, strategy, organizational behavior, marketing, operations

**Exports :** `searchBusiness`

### `lib/providers/chemistry.ts` — 70 lignes

* Chemistry Provider — via SemanticScholar (field-of-study) + OpenAlex fallback * Covers: organic, inorganic, analytical, physical, materials chemistry

**Exports :** `searchChemistry`

### `lib/providers/core.ts` — 106 lignes

* CORE Provider — 300M+ open access research papers * The world's largest aggregator of open access research. * Covers ALL disciplines: STEM, social sciences, humanities, law, arts. * API: https://core.ac.uk/documentation/api * * KEY VALUE: Fills humanities/social science gap that PubMed/arXiv don't cover.

**Exports :** `searchCORE`, `searchCore`

### `lib/providers/crossref.ts` — 53 lignes

_(no docstring — voir le code source)_

**Exports :** `searchCrossref`

### `lib/providers/data-europa-provider.ts` — 80 lignes

* data.europa.eu Provider — EU Open Data Portal (1M+ datasets) * * Free, no API key required. The official EU open data portal aggregating * datasets from EU institutions, member states, and regional governments. * Covers: environment, economy, transport, agriculture, justice, education, * health, population, science, technology, government. * * KEY VALUE: Government open data with structured metadata. Complements * Eurostat/ECB with granular datasets from 36+ countries. Each result * includes d

**Exports :** `searchDataEuropa`

### `lib/providers/datacite-provider.ts` — 82 lignes

* DataCite Provider — 40M+ research datasets with DOIs. * Free API, no key required. Covers research data across all disciplines. * * API docs: https://support.datacite.org/docs/api * Endpoint: https://api.datacite.org/dois

**Exports :** `searchDataCite`

### `lib/providers/dblp.ts` — 118 lignes

* DBLP Provider — Computer Science conferences & publications * DBLP API (https://dblp.org/search/publ/api) covers ACL, CVPR, NeurIPS, ICML, AAAI, etc. * Fallback: SemanticScholar filtered to Computer Science, then OpenAlex CS concept.

**Exports :** `searchDBLP`

### `lib/providers/dimensions-provider.ts` — 99 lignes

* Dimensions (Digital Science) Provider — 140M+ publications, grants, patents, clinical trials. * Free API tier: 1 req/s. Requires API key from https://app.dimensions.ai * Multi-disciplinary: covers all research domains. * * API docs: https://docs.dimensions.ai/dsl * Endpoint: POST https://app.dimensions.ai/api/dsl * Auth: JWT key

**Exports :** `searchDimensions`

### `lib/providers/doaj.ts` — 76 lignes

* DOAJ Provider — Directory of Open Access Journals * 20,000+ journals, 10M+ articles across ALL disciplines. * Strong coverage of: humanities, social sciences, law, education, arts. * API: https://doaj.org/api/docs * * KEY VALUE: Best open access source for humanities, law, and social sciences * that arXiv/PubMed don't cover. Free API, no key required.

**Exports :** `searchDOAJ`

### `lib/providers/ecb.ts` — 122 lignes

* ECB (European Central Bank) client for monetary data * Official endpoint: https://data-api.ecb.europa.eu/service/data * * We request SDMX-JSON (ECB supports it via Accept header) and parse TIME_PERIOD.

**Exports :** `MacroDataPoint`, `MacroSeries`, `fetchECBSeries`, `ingestECBIndicators`

### `lib/providers/eric.ts` — 118 lignes

* ERIC Provider — Education Resources Information Center * 1.7M+ documents on education research: pédagogie, formation, enseignement supérieur. * Primary: api.eric.ed.gov JSON API (may be blocked in some regions) * Fallback: SemanticScholar filtered to Education field of study

**Exports :** `searchERIC`

### `lib/providers/europepmc.ts` — 65 lignes

* Europe PMC Provider — 40M+ biomedical & life sciences papers * European counterpart to PubMed with broader coverage (preprints, patents, guidelines). * API: https://europepmc.org/RestfulWebService * * KEY VALUE: Broader than PubMed — includes preprints, WHO guidelines, patents. * Free API, no key required.

**Exports :** `searchEuropePMC`

### `lib/providers/eurostat.ts` — 157 lignes

* Eurostat client for European macro-economic data * Official endpoint: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data * * Notes: * - Eurostat returns a JSON-stat-ish payload where observations are keyed by an integer index * (flattened observation vector), not by the time label. * - For our curated indicators we fully specify non-time dimensions so only TIME varies.

**Exports :** `MacroDataPoint`, `MacroSeries`, `fetchEurostatSeries`, `ingestEurostatIndicators`

### `lib/providers/exa-provider.ts` — 144 lignes

* Exa Provider — Semantic search over 350M+ publications. * Free tier: $20 signup credits + $10/month (~2,800 searches). * Category "publication" for academic papers; general web for everything else.

**Exports :** `ExaSearchOptions`, `markExaExhausted`, `isExaExhausted`, `searchExa`, `searchExaPublications`

### `lib/providers/fao.ts` — 117 lignes

* FAO Provider — Food and Agriculture Organization of the United Nations * Agriculture, alimentation, sécurité alimentaire, pêche, forêts. * API: https://www.fao.org/faostat/en/#data (FAOSTAT) + AGRIS (agriculture research) * AGRIS API: https://agris.fao.org/agris-search/search.do

**Exports :** `searchFAO`

### `lib/providers/geography.ts` — 70 lignes

* Geography Provider — via SemanticScholar (field-of-study) + OpenAlex fallback * Covers: human geography, GIS, urban planning, cartography, regional studies

**Exports :** `searchGeography`

### `lib/providers/google-books-provider.ts` — 121 lignes

* Google Books Provider — covers books, monographs, book chapters. * Free API, no key required (with rate limits). Key recommended for higher quota. * * API docs: https://developers.google.com/books/docs/overview * Endpoint: https://www.googleapis.com/books/v1/volumes

**Exports :** `searchGoogleBooks`

### `lib/providers/hal.ts` — 98 lignes

* HAL (Hyper Articles en Ligne) Provider - Archive ouverte française * API: https://api.archives-ouvertes.fr/docs/search

**Exports :** `searchHAL`

### `lib/providers/hf-papers-provider.ts` — 78 lignes

* HuggingFace Papers Provider — AI/ML research papers with code & model links * * Free, no API key required for search. HuggingFace indexes papers from arXiv * and adds community-curated metadata: linked models, datasets, and code repos. * * KEY VALUE: Bridges the gap between academic papers and practical implementations. * When a paper has a HuggingFace model or dataset, we get the link directly. * Especially strong for AI, ML, NLP, CV, and adjacent fields. * * API: https://huggingface.co/api/p

**Exports :** `searchHuggingFacePapers`

### `lib/providers/history.ts` — 70 lignes

* History Provider — via SemanticScholar (field-of-study) + OpenAlex fallback * Covers: world history, historiography, economic history, cultural history

**Exports :** `searchHistory`

### `lib/providers/ietf-provider.ts` — 91 lignes

* IETF Datatracker Provider — RFCs and Internet-Drafts * * Free, no API key required. The IETF Datatracker is the official repository * for Internet Engineering Task Force documents: RFCs (standards), active * and expired Internet-Drafts, working group documents, and IESG ballots. * * KEY VALUE: Technical standards and governance documents for the internet. * Covers: networking protocols, security (TLS, IPsec, OAuth), AI/ML standards, * IoT, 5G, privacy, cryptography, internet governance. Import

**Exports :** `searchIETF`

### `lib/providers/independent-media-provider.ts` — 296 lignes

* NomosX Independent Media Provider * * Searches independent, investigative, and heterodox media sources * that are NOT covered by mainstream news aggregators. * * Sources: * 1. RSS feeds from independent media (The Intercept, ProPublica, Mediapart, etc.) * 2. GDELT filtered to independent domains * 3. Web search (Tavily/Linkup) scoped to independent journalism * * This is the DISSIDENT lens backbone — voices outside the institutional mainstream.

**Exports :** `searchIndependentMedia`, `searchGDELTIndependent`, `getIndependentFeeds`

### `lib/providers/insee.ts` — 141 lignes

* INSEE client for French economic data * * - Time series: INSEE BDM (SDMX-XML) * Example: https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/000857179 * - Dataset search: Melodi API (requires token)

**Exports :** `MacroDataPoint`, `MacroSeries`, `fetchINSEESeries`, `ingestINSEEIndicators`, `searchINSEE`

### `lib/providers/isidore.ts` — 75 lignes

* ISIDORE Provider — Sciences Humaines et Sociales (SHS) * 9M+ documents: articles, thèses, rapports en SHS francophones et internationaux. * API: https://api.isidore.science/ * Gratuite, sans clé. Couvre: histoire, sociologie, philosophie, géographie, anthropologie.

**Exports :** `searchISIDORE`

### `lib/providers/lens-provider.ts` — 105 lignes

* Lens.org Scholarly Provider — 200M+ scholarly records + 140M+ patents. * Free tier: 50 req/min. Requires API token from https://www.lens.org * Strong in: patents, scholarly works, multi-disciplinary coverage. * * API docs: https://docs.api.lens.org * Endpoint: POST https://api.lens.org/scholarly/search * Auth: Bearer token

**Exports :** `searchLens`

### `lib/providers/linkup-sdk.ts` — 105 lignes

* LinkUp Provider — Scout-compatible search via the official LinkUp SDK. * Only `searchLinkUp` is used by the active pipeline.

**Exports :** `searchLinkUp`

### `lib/providers/melodi.ts` — 278 lignes

* INSEE Melodi API Provider * API: https://api.insee.fr/melodi * Documentation: https://www.insee.fr/fr/information/2114819 * * Accès aux données statistiques françaises via l'API Melodi * Nécessite une clé API INSEE

**Exports :** `getMelodiCatalog`, `getMelodiDataset`, `getMelodiRange`, `getMelodiData`, `getMelodiCount`, `searchMelodi`

### `lib/providers/nber.ts` — 19 lignes

* NBER Provider — National Bureau of Economic Research * 30,000+ working papers from top economists. * Uses the NBER website search API (public, no key required). * * KEY VALUE: Pre-publication working papers from Nobel laureates and top economists. * Many seminal papers (Acemoglu, Banerjee, Duflo, Autor, etc.) appear here first.

**Exports :** `searchNBER`

### `lib/providers/news-scout-providers.ts` — 502 lignes

* NomosX News SCOUT Providers * * SCOUT-compatible wrappers for real-time news sources. * Returns the same format as academic providers so they integrate * directly into the SCOUT → INDEX → RANK pipeline. * * Providers: * 1. GDELT DOC API (free, no key) — Global event monitoring, 100+ languages * 2. NewsAPI (NEWSAPI_KEY) — Reuters, AP, BBC, Al Jazeera headlines * 3. MediaStack (MEDIASTACK_KEY) — 7500+ sources, real-time news * 4. TheNewsAPI (THENEWSAPI_KEY) — Business & tech news aggregator * 5.

**Exports :** `searchGDELTNews`, `searchNewsAPI`, `searchMediaStack`, `searchTheNewsAPI`, `searchGNews`, `searchEventRegistry`, `searchAllNewsProviders`

### `lib/providers/newsdata-provider.ts` — 75 lignes

* NewsData.io Provider — Free news API (200 credits/day, 10 articles/credit) * * Free tier: 200 API credits/day, 10 articles per request, 48h lookback. * No credit card required. Key required (free registration). * * KEY VALUE: Complements GDELT with structured news metadata: * - Category filtering (politics, business, technology, environment, etc.) * - Country and language filtering * - Multiple languages supported * * API: https://newsdata.io/api/1/news * Docs: https://newsdata.io/documentatio

**Exports :** `searchNewsData`

### `lib/providers/open-access-providers.ts` — 278 lignes

* Open Access Providers — 5 free APIs, no key required. * * 1. PLOS — Public Library of Science (Solr API) — OA science full-text * 2. Federal Register — US regulation & executive documents * 3. SEC EDGAR — US financial filings full-text search * 4. World Bank Documents & Reports — development research * 5. CORDIS — EU-funded research projects * * All follow the SCOUT normalized result shape (same as osti-provider).

**Exports :** `searchPLOS`, `searchFederalRegister`, `searchSECEdgar`, `searchWorldBankDocs`, `searchCORDIS`

### `lib/providers/openaire.ts` — 82 lignes

* OpenAIRE Provider — European Open Science Graph * 100M+ research outputs financés par l'UE (Horizon 2020, Horizon Europe). * Excellent pour: sciences exactes, SHS, interdisciplinaire européen. * API: https://api.openaire.eu/ * Gratuite, sans clé.

**Exports :** `searchOpenAIRE`

### `lib/providers/openalex-snowball.ts` — 132 lignes

* OpenAlex citation snowballing — the recall lever PaperQA2 identified: * keyword search finds what the query names; the strongest supporting or * contradicting evidence is often what the best sources CITE (backward, * `cited_by`) or what CITES them (forward, `cites`). * * Bounded: at most `maxSeeds` seed works × `perSeed` works per direction, * capped at `cap` persisted candidates. Failures degrade to an empty result — * the caller treats this as a non-blocking enrichment pass.

**Exports :** `SnowballResult`, `snowballFromSeeds`

### `lib/providers/openalex.ts` — 326 lignes

* Mark the API key as exhausted (called when we get a 429 with x-ratelimit-remaining: 0). * This immediately switches all subsequent requests to the polite pool.

**Exports :** `markOpenAlexKeyExhausted`, `openAlexAuthParam`, `fetchOpenAlexJson`, `normalizeOpenAlexWork`, `searchOpenAlex`, `getOpenAlexConceptGroups`, `searchOpenAlexSemantic`, `batchFetchByDoi`

### `lib/providers/opencitations.ts` — 161 lignes

* OpenCitations Provider — Citation graph search (1.5B+ citations) * * OpenCitations indexes citation relationships between DOIs. * Free API, no key required. Useful for: * - Finding papers that cite a known DOI (forward citations) * - Finding papers cited by a known DOI (references) * - Enriching sources with citation context * * API docs: https://opencitations.net/index/api/v2 * Endpoint: https://opencitations.net/index/api/v2/references/{doi} * https://opencitations.net/index/api/v2/citations

**Exports :** `getCitationsOf`, `getReferencesOf`, `searchOpenCitations`

### `lib/providers/orcid.ts` — 43 lignes

* ORCID client for author identity enrichment

**Exports :** `ORCIDData`, `getORCIDById`, `searchOrcid`

### `lib/providers/osti-provider.ts` — 81 lignes

* OSTI.gov Provider — US Department of Energy science & technology research. * Free API, no key required. Strong in: energy, physics, materials, chemistry. * * API docs: https://www.osti.gov/api/v1/docs * Endpoint: https://www.osti.gov/api/v1/records

**Exports :** `searchOSTI`

### `lib/providers/overton.ts` — 174 lignes

* Overton Provider — World's Largest Policy Document Index * * Overton (overton.io) indexes 20M+ policy documents from governments, * think tanks, IGOs, and NGOs worldwide. Includes grey literature that * is systematically absent from academic databases: policy briefs, * white papers, regulatory documents, working papers from 180+ countries. * * API: REST API requiring api_key parameter. * Set OVERTON_API_KEY environment variable. * Free for academic research (contact support@overton.io). * Rate

**Exports :** `OvertonResult`, `searchOverton`, `searchOvertonScholarly`

### `lib/providers/pdf-extractor.ts` — 332 lignes

* 📄 PDF Text Extractor pour theses.fr * * Stratégie : * 1. Télécharger le PDF depuis l'URL publique * 2. Extraire le texte complet * 3. Nettoyer et structurer le contenu * * Note : Ce module nécessite pdf-parse v2+ * Installation : npm install pdf-parse

**Exports :** `extractPDFText`, `enrichTheseWithPDFText`, `extractManyPDFs`, `getPDFExtractionStats`

### `lib/providers/persee.ts` — 62 lignes

* Persée Provider — SHS francophones historiques * Persée.fr has no public REST API. We use HAL (Hyper Articles en Ligne) filtered to * French SHS disciplines: shs.hist, shs.socio, shs.geo, shs.archeo, shs.langue, shs.scipo. * HAL covers 1M+ French academic publications with open access full text. * API: https://api.archives-ouvertes.fr/search/ * Gratuite, sans clé.

**Exports :** `searchPersee`

### `lib/providers/philpapers.ts` — 74 lignes

* PhilPapers Provider — Philosophy research (via SemanticScholar philosophy field-of-study) * PhilPapers.org blocks all programmatic access (403 on JSON + Atom). * We use SemanticScholar filtered to Philosophy field-of-study (C138885662) as equivalent. * 2M+ philosophy, ethics, epistemology, AI ethics papers.

**Exports :** `searchPhilPapers`

### `lib/providers/political-science.ts` — 70 lignes

* Political Science Provider — via SemanticScholar (field-of-study) + OpenAlex fallback * Covers: comparative politics, international relations, public policy, governance

**Exports :** `searchPoliticalScience`

### `lib/providers/psychology.ts` — 70 lignes

* Psychology Provider — via SemanticScholar (field-of-study) + OpenAlex fallback * Covers: clinical, cognitive, developmental, social, applied psychology

**Exports :** `searchPsychology`

### `lib/providers/pubmed.ts` — 112 lignes

* PubMed/NCBI Provider - Sciences biomédicales et de la santé * API: https://www.ncbi.nlm.nih.gov/books/NBK25501/

**Exports :** `searchPubMed`

### `lib/providers/registry-bridge.ts` — 1053 lignes

* REGISTRY BRIDGE - Version Corrigée et Optimisée * * Bridge unifié pour tous les providers avec fallback OpenAlex * Imports corrects, chemins valides, intégration complète

**Exports :** `RegistrySearchResult`, `RegistrySearchOptions`, `searchRegistry`, `getAvailableProviders`, `searchExtendedProviders`, `getExtendedProvidersForDomain`, `getProviderType`

### `lib/providers/repec.ts` — 38 lignes

* RePEc Provider — Research Papers in Economics * 4M+ working papers, journal articles, and books in economics. * Uses the IDEAS/RePEc search API. * * KEY VALUE: THE #1 source for economics research worldwide. * Covers working papers from central banks, universities, and research institutes. * Free API via IDEAS search endpoint.

**Exports :** `searchRePEc`

### `lib/providers/ror.ts` — 63 lignes

* ROR (Research Organization Registry) client * Enriches institution metadata with canonical IDs

**Exports :** `RORData`, `searchROR`, `getRORById`

### `lib/providers/searxng.ts` — 72 lignes

* SEARXNG Provider — free metasearch over ~240 upstream engines. * * Purpose: resilience. When Tavily (paid) and Exa (credits) are exhausted, * SAFE live verification and general web retrieval die with them. SearXNG * is the zero-cost floor: query any instance's JSON API, no key required. * * Priority: SEARXNG_URL env (self-hosted, recommended) → rotating public * instances (searx.space). Many public instances disable format=json under * bot pressure — we try each once and degrade to [] graceful

**Exports :** `searchSearxng`

### `lib/providers/semantic-scholar-api.ts` — 222 lignes

* Semantic Scholar Graph API — Enhanced Provider * 200M+ papers with citation graph, influence scores, and TLDR summaries. * Free API, no key required (rate limit: 100 req/5min). * * KEY VALUE: Citation graph traversal, influence scoring, TLDR summaries. * Complements OpenAlex with AI-generated paper summaries and influence metrics. * API docs: https://api.semanticscholar.org/api-docs/graph

**Exports :** `searchSemanticScholarGraph`, `searchSemanticScholarBulk`, `enrichAuthorS2`

### `lib/providers/semanticscholar.ts` — 77 lignes

* Semantic Scholar Provider - VERSION 2.0 OPTIMISÉE * 200M+ papers, API gratuite, abstracts riches * * OPTIMISATIONS V2: * - Content-First: filtre abstracts < 200 chars * - Augmente limit par défaut à 50 * - Ajoute contentLength pour scoring * - Extraction DOI et metadata enrichie

**Exports :** `searchSemanticScholar`

### `lib/providers/sociology.ts` — 70 lignes

* Sociology Provider — via SemanticScholar (field-of-study) + OpenAlex fallback * Covers: social theory, demography, urban studies, social movements, migration

**Exports :** `searchSociology`

### `lib/providers/source-quality-filter.ts` — 446 lignes

* SOURCE QUALITY FILTER * * Blocks SEO content farms, spam directories, and irrelevant sources from * entering the NomosX pipeline. Applied at two stages: * 1. SCOUT (pipeline-v2.ts) — before upserting raw results to the database * 2. RANK (enhanced-ranker.ts) — defensive second pass to catch stragglers * * Design notes: * - `academia.edu` is intentionally NOT blacklisted — it is a legitimate * academic sharing platform. * - Medium posts from non-verified authors are blocked, but institutional *

**Exports :** `DOMAIN_BLACKLIST`, `TITLE_SPAM_PATTERNS`, `RELEVANCE_KEYWORDS`, `SourceQualityInput`, `isLowQualitySource`, `filterLowQualitySources`

### `lib/providers/springer-provider.ts` — 130 lignes

* Springer Nature Provider — 10M+ articles from Springer + Nature journals. * Free API key from https://dev.springernature.com * Strong in: physics, engineering, medicine, life sciences, computer science. * * API docs: https://dev.springernature.com * Endpoint: https://api.springernature.com/metadata/json

**Exports :** `searchSpringer`

### `lib/providers/ssrn.ts` — 97 lignes

* SSRN Provider — Social Science Research Network * 1M+ working papers in economics, law, finance, political science, management. * Uses the public search endpoint (no API key required). * * KEY VALUE: #1 source for pre-publication economics, law, and finance research. * Many papers appear on SSRN months before journal publication.

**Exports :** `searchSSRN`

### `lib/providers/stats-data.ts` — 245 lignes

* STATS-DATA Providers — domain statistics that return REAL NUMBERS. * * - `searchUCDP` : Uppsala Conflict Data Program — live API, aggregated * conflict deaths by country/conflict (free, no key). * - `searchILOSTAT`: ILO labor statistics — catalog of indicators fetched from * the bulk-download table of contents (free, no key). * - `searchOWID` : Our World in Data — grapher search index. * * Abstracts embed actual figures so analysts can cite numbers directly.

**Exports :** `searchUCDP`, `searchILOSTAT`, `searchOWID`

### `lib/providers/stats-keys.ts` — 474 lignes

* STATS-KEYS Providers — national/international statistics APIs. * * Free but key-gated (degrade to [] gracefully when env missing): * comtrade (COMTRADE_API_KEY), bls (BLS_API_KEY), census (CENSUS_API_KEY), * acled (ACLED_API_KEY + ACLED_EMAIL), unhcr (UNHCR_API_KEY), * estat-jp (ESTAT_JP_APP_ID), kosis (KOSIS_API_KEY) * No key required: * ons-uk (api.beta.ons.gov.uk), ibge (servicodados.ibge.gov.br agregados)

**Exports :** `searchComtrade`, `searchBLS`, `searchCensus`, `searchACLED`, `searchUNHCR`, `searchEStatJP`, `searchKOSIS`, `searchDataCommons`, `searchONS`, `searchIBGE`

### `lib/providers/tavily-provider.ts` — 125 lignes

* Tavily Provider — AI-optimised web search with content extraction. * Free tier: 1,000 credits/month (1 credit = 1 basic search). * Returns clean structured content ready for LLM consumption. * * API docs: https://docs.tavily.com/documentation/api-reference/endpoint/search * Auth: Bearer tvly-YOUR_API_KEY

**Exports :** `TavilySearchOptions`, `searchTavily`, `searchTavilyNews`

### `lib/providers/thesesfr-hal-bridge.ts` — 129 lignes

* ThesesFr-HAL Bridge * * Enrichit les thèses de theses.fr avec les données HAL * pour récupérer le texte intégral quand disponible

**Exports :** `enrichManyThesesWithHAL`, `enrichThesisWithHAL`

### `lib/providers/thesesfr.ts` — 100 lignes

* Theses.fr Provider - Thèses françaises * API: https://theses.fr/api/v1 * * Accès aux thèses de doctorat françaises

**Exports :** `searchThesesFr`, `getThesisByNNT`

### `lib/providers/unodc.ts` — 114 lignes

* UNODC Provider — United Nations Office on Drugs and Crime * Criminologie, drogues, criminalité organisée, terrorisme, corruption, traite des êtres humains. * Primary: DOAJ filtered to criminology/drug policy subjects * Fallback: SemanticScholar filtered to Law/Political Science with crime keywords

**Exports :** `searchUNODC`

### `lib/providers/unpaywall.ts` — 29 lignes

_(no docstring — voir le code source)_

**Exports :** `unpaywallByDoi`

### `lib/providers/who-gho.ts` — 75 lignes

* WHO GHO Provider — World Health Organization Global Health Observatory * 2,000+ health indicators across 194 countries. * Uses the GHO OData API (public, no key required). * * KEY VALUE: Authoritative global health data — mortality, disease burden, * health systems, risk factors. Gold standard for health policy research. * API docs: https://www.who.int/data/gho/info/gho-odata-api

**Exports :** `searchWHOGHO`

### `lib/providers/wikidata.ts` — 679 lignes

* Wikidata Provider for NomosX * * Replaces Google Knowledge Graph (cost elimination). * Uses the Wikidata API (free, no API key) to: * - Identify and disambiguate entities (people, organizations, concepts) * - Enrich sources with structured entity data * - Validate institutional and person references * * API Docs: https://www.wikidata.org/w/api.php * Rate limit: none enforced, but be respectful (we cap concurrency)

**Exports :** `KGEntity`, `KGSearchResult`, `KGEntityEnrichment`, `searchKnowledgeGraph`, `enrichWithKnowledgeGraph`, `batchEnrichEntities`, `validateInstitution`, `validatePerson`

### `lib/providers/worldbank-data.ts` — 176 lignes

* WORLD BANK DATA Provider — api.worldbank.org/v2 (free, no key). * * Two faces: * 1. `ingestWorldBankIndicators()` — bulk series ingestion for the macro DB * (macro-refresh.ts), curated indicators × major economies, last 15 years. * 2. `searchWorldBankData(query)` — doc-layer provider returning "dataset" * sources whose abstracts embed the LATEST VALUES for major economies, * so analysts can cite real numbers (GDP growth FR: 0.9%, DE: -0.3%...).

**Exports :** `WB_INDICATORS`, `ingestWorldBankIndicators`, `searchWorldBankData`

### `lib/providers/zbmath.ts` — 117 lignes

* zbMATH Provider — Mathematics publications (Mathematics, Applied Mathematics, Statistics) * zbMATH API (https://api.zbmath.org/v1/search) covers 4M+ math papers. * Fallback: SemanticScholar filtered to Mathematics, then OpenAlex Math concept.

**Exports :** `searchZbMath`

### `lib/providers/zenodo.ts` — 65 lignes

* Zenodo Provider — CERN Open Science Repository * 3M+ records: publications, preprints, datasets, software, reports across all disciplines. * API: https://developers.zenodo.org/ * Free, no key required for search. Rich descriptions (abstracts), DOIs, open access.

**Exports :** `searchZenodo`


## Providers — `institutional/` — 105 modules

### `lib/providers/institutional/academic/biorxiv.ts` — 120 lignes

* bioRxiv/medRxiv — Preprint servers * API: https://api.biorxiv.org/ (free, no key required) * Biology and medical preprints, also covers cross-domain topics

**Exports :** `searchBioRxiv`

### `lib/providers/institutional/academic/harvard-dash.ts` — 76 lignes

* Harvard DASH — Harvard Institutional Repository * API: https://dash.harvard.edu/rest/ (DSpace 8 REST API, free, no key) * 58,000+ works including articles, working papers, theses, case studies

**Exports :** `searchHarvardDASH`

### `lib/providers/institutional/academic/max-planck-pure.ts` — 72 lignes

* Max Planck PuRe — Publication repository * API: https://pure.mpg.de/rest/ (public, read-only, no key) * Replaces OpenAlex wrapper with real institutional API

**Exports :** `searchMaxPlanckPuRe`

### `lib/providers/institutional/academic/mit-dspace.ts` — 76 lignes

* MIT DSpace — MIT Institutional Repository * API: https://dspace.mit.edu/rest/ (DSpace REST API, free, no key) * 60,000+ works including theses, technical reports, white papers

**Exports :** `searchMITDSpace`

### `lib/providers/institutional/academic/openreview.ts` — 72 lignes

* OpenReview — Conference papers (ICLR, NeurIPS, ICML, etc.) * API: https://api2.openreview.net/ (free, no key required) * Provides AI/ML conference submissions, reviews, and decisions

**Exports :** `searchOpenReview`

### `lib/providers/institutional/academic/papers-with-code.ts` — 97 lignes

* Papers with Code — AI/ML papers with code and benchmarks * Original API deprecated (acquired by HuggingFace). * Now uses HuggingFace Daily Papers API + Semantic Scholar as fallback.

**Exports :** `searchPapersWithCode`

### `lib/providers/institutional/archives/archives-nationales-fr.ts` — 75 lignes

* Archives nationales (France) * Legal: French Open Data * URL: https://www.archives-nationales.culture.gouv.fr

**Exports :** `searchArchivesNationalesFR`

### `lib/providers/institutional/archives/nara.ts` — 78 lignes

* NARA - National Archives and Records Administration (US) * Legal: 17 U.S.C. §105 - US Government works in public domain * URL: https://catalog.archives.gov

**Exports :** `searchNARA`

### `lib/providers/institutional/archives/uk-archives.ts` — 75 lignes

* UK National Archives * Legal: UK Open Government Licence * URL: https://discovery.nationalarchives.gov.uk

**Exports :** `searchUKArchives`

### `lib/providers/institutional/consolidated-institutions.ts` — 159 lignes

* Consolidated Institutional Provider (V3.1) * * Instead of 30+ separate OpenAlex requests (one per institution), * this provider makes a SINGLE OpenAlex request with all ROR IDs * combined using OR filters. * * OpenAlex filter syntax for OR: filter=authorships.institutions.ror:ROR1|ROR2|ROR3 * This reduces 30+ API calls to 1, eliminating rate-limit cascades. * * Inspired by: OpenAlex best practices for batch institutional queries.

**Exports :** `searchConsolidatedInstitutions`, `getConsolidatedProviderNames`

### `lib/providers/institutional/cyber/cisa.ts` — 79 lignes

* CISA - Cybersecurity and Infrastructure Security Agency * Primary: CISA advisories JSON feed (public-domain, US gov) * Fallback: OpenAlex with cyber security concept filter

**Exports :** `searchCISA`

### `lib/providers/institutional/cyber/enisa.ts` — 29 lignes

* ENISA - European Union Agency for Cybersecurity * Uses OpenAlex with ENISA ROR filter (reliable, no API key required) * ROR: https://ror.org/00wqx6897

**Exports :** `searchENISA`

### `lib/providers/institutional/cyber/nist.ts` — 71 lignes

* NIST - National Institute of Standards and Technology * Primary: NIST CSRC JSON API for cybersecurity publications * Fallback: OpenAlex with NIST ROR filter (05xpvk416)

**Exports :** `searchNIST`

### `lib/providers/institutional/defense/eda.ts` — 41 lignes

* EDA - European Defence Agency / EU Defence Research * Uses OpenAlex with EU defence research ROR filters: * - EUISS (EU Institute for Security Studies): 01bmvkm47 * - FOI (Swedish Defence Research Agency): 02mkv8r24

**Exports :** `searchEDA`

### `lib/providers/institutional/defense/eeas.ts` — 41 lignes

* EEAS - European External Action Service / EU Security Research * Uses OpenAlex with EUISS ROR filter (EU Institute for Security Studies) * EUISS ROR: https://ror.org/01bmvkm47 * EU Commission ROR: https://ror.org/00k4n6c32

**Exports :** `searchEEAS`

### `lib/providers/institutional/defense/nato.ts` — 41 lignes

* NATO / Defense Research * Uses OpenAlex with dual ROR filter: * - NATO ROR: https://ror.org/05xagc088 * - RAND Corporation ROR: https://ror.org/00f2z7n96 (leading defense research institution)

**Exports :** `searchNATO`

### `lib/providers/institutional/defense/sgdsn.ts` — 41 lignes

* SGDSN / French Defense & Security Research * Uses OpenAlex with French strategic research institute ROR filters: * - IFRI (Institut français des relations internationales): 00ny8df12 * - Sciences Po Paris: 00mpxgs49

**Exports :** `searchSGDSN`

### `lib/providers/institutional/economic/bis.ts` — 23 lignes

* BIS — Real RSS API (primary) + OpenAlex fallback * Primary: BIS RSS feed (www.bis.org/doclist/all.rss) * Fallback: OpenAlex with BIS ROR filter

**Exports :** `searchBIS`

### `lib/providers/institutional/economic/imf.ts` — 23 lignes

* IMF — Real SDMX API (primary) + OpenAlex fallback * Primary: IMF SDMX JSON service (dataservices.imf.org) * Fallback: OpenAlex with IMF ROR filter

**Exports :** `searchIMF`

### `lib/providers/institutional/economic/oecd-direct.ts` — 47 lignes

* OECD Direct API - iLibrary + OECD.Stat * Uses OECD iLibrary search API (no key required for metadata) * Supplements the OpenAlex-based OECD provider with direct iLibrary results

**Exports :** `searchOECDDirect`

### `lib/providers/institutional/economic/oecd.ts` — 17 lignes

* OECD - Organisation for Economic Co-operation and Development * Uses OpenAlex with OECD ROR filter (reliable, no API key required) * ROR: https://ror.org/05n14r570

**Exports :** `searchOECD`

### `lib/providers/institutional/economic/worldbank.ts` — 23 lignes

* World Bank — Real API (primary) + OpenAlex fallback * Primary: World Bank official API (search.worldbank.org/api/v2/wds) * Fallback: OpenAlex with World Bank ROR filter

**Exports :** `searchWorldBank`

### `lib/providers/institutional/economics/ecb.ts` — 16 lignes

* ECB - European Central Bank * Uses OpenAlex with ECB ROR filter (reliable, no API key required) * ROR: https://ror.org/04bwf3862

**Exports :** `searchECB`

### `lib/providers/institutional/economics/eib.ts` — 29 lignes

* EIB - European Investment Bank * Uses OpenAlex with EIB ROR filter * ROR: https://ror.org/03zxry661

**Exports :** `searchEIB`

### `lib/providers/institutional/economics/eurostat.ts` — 76 lignes

* Eurostat - EU Statistical Office * Primary: Eurostat JSON API (free, no key required) * API: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ * Fallback: OpenAlex with European Commission ROR

**Exports :** `searchEurostat`

### `lib/providers/institutional/economics/fred.ts` — 71 lignes

* FRED - Federal Reserve Economic Data (St. Louis Fed) * Primary: FRED API (free, requires key from env or fallback) * API: https://fred.stlouisfed.org/docs/api/fred/ * Fallback: OpenAlex with Federal Reserve Board ROR: 03yd7cn72

**Exports :** `searchFRED`

### `lib/providers/institutional/economics/nber.ts` — 16 lignes

* NBER - National Bureau of Economic Research * Uses OpenAlex with NBER ROR filter * ROR: https://ror.org/05d5mza29

**Exports :** `searchNBER`

### `lib/providers/institutional/energy/acer.ts` — 99 lignes

* ACER — EU Agency for the Cooperation of Energy Regulators * Uses EU Open Data Portal + ACER website RSS * Provides energy market monitoring reports, grid operation reports * Not an OpenAlex wrapper — returns unique sources.

**Exports :** `searchACER`

### `lib/providers/institutional/energy/energi-data.ts` — 63 lignes

* Energi Data Service — Danish real-time energy data * API: https://api.energidataservice.dk/dataset (free, no key) * CO2 emissions, production, prices, electricity balance

**Exports :** `searchEnergiDataService`

### `lib/providers/institutional/energy/energy-charts.ts` — 95 lignes

* energy-charts.info — European electricity prices, generation, flows * API: https://api.energy-charts.info/ (free, no key required) * Covers all European bidding zones with real-time and historical data

**Exports :** `searchEnergyCharts`

### `lib/providers/institutional/energy/entsoe.ts` — 77 lignes

* ENTSO-E — European Network of Transmission System Operators for Electricity * Transparency Platform API: https://transparency.entsoe.eu/ * API docs: https://transparency.entsoe.eu/content/static_content/Static%20content/web%20api%20api%20key%20guide.html * * This provider searches ENTSO-E publications and reports via their public API. * No API key required for basic document search.

**Exports :** `searchENTSOE`

### `lib/providers/institutional/energy/entsog.ts` — 119 lignes

* ENTSOG — European Network of Transmission System Operators for Gas * API: https://transparency.entsog.eu/api/v1/ (free, no key required) * Provides EU gas infrastructure, capacity, and flow data

**Exports :** `searchENTSOG`

### `lib/providers/institutional/energy/fingrid.ts` — 73 lignes

* Fingrid — Finnish transmission system operator * API: https://api.fingrid.fi/api (free, no key for public endpoints) * Real-time Finnish grid data at 3-min resolution

**Exports :** `searchFingrid`

### `lib/providers/institutional/energy/iaea.ts` — 29 lignes

* IAEA - International Atomic Energy Agency * Uses OpenAlex with IAEA ROR filter (reliable, no API key required) * ROR: https://ror.org/02zt1gg83

**Exports :** `searchIAEA`

### `lib/providers/institutional/energy/iea.ts` — 99 lignes

* IEA — International Energy Agency * Real API: IEA iLibrary RSS + web search * Provides energy policy reports, World Energy Outlook, etc. * Not an OpenAlex wrapper — returns unique sources.

**Exports :** `searchIEA`

### `lib/providers/institutional/energy/irena.ts` — 29 lignes

* IRENA - International Renewable Energy Agency * Uses OpenAlex with IRENA ROR filter * ROR: https://ror.org/01dej0523

**Exports :** `searchIRENA`

### `lib/providers/institutional/energy/jrc.ts` — 53 lignes

* JRC — Joint Research Centre (European Commission) * Publications API: https://data.jrc.ec.europa.eu/api/3/action/package_search * Free, no API key required.

**Exports :** `searchJRC`

### `lib/providers/institutional/energy/rte-france.ts` — 68 lignes

* RTE France — French electricity transmission system operator * API: RTE ODRE (Open Data Réseaux Énergies) — https://data.rte-france.com * French generation (nuclear, wind, solar), consumption, exchanges * Some endpoints are free without authentication

**Exports :** `searchRTEFrance`

### `lib/providers/institutional/energy/smard.ts` — 80 lignes

* SMARD.de — German Federal Network Agency (Bundesnetzagentur) market data * Original SMARD API deprecated. Now uses energy-charts.info API which * serves the same Bundesnetzagentur data under CC BY 4.0.

**Exports :** `searchSMARD`

### `lib/providers/institutional/environmental/eea.ts` — 59 lignes

* EEA — European Environment Agency * Provides climate, energy, and environmental policy data for Europe * API: https://www.eea.europa.eu/api/ (free, no key required) * Also uses EEA datahub for datasets

**Exports :** `searchEEA`

### `lib/providers/institutional/french/ademe.ts` — 29 lignes

* ADEME - Agence de la transition écologique (France) * Uses OpenAlex with ADEME ROR filter * ROR: https://ror.org/05rth8x13

**Exports :** `searchADEME`

### `lib/providers/institutional/french/cea.ts` — 29 lignes

* CEA - Commissariat à l'Énergie Atomique et aux Énergies Alternatives (France) * Uses OpenAlex with CEA ROR filter * ROR: https://ror.org/00jjx8s55

**Exports :** `searchCEA`

### `lib/providers/institutional/french/cnrs.ts` — 29 lignes

* CNRS - Centre national de la recherche scientifique * Uses OpenAlex with CNRS ROR filter * ROR: https://ror.org/02feahw73

**Exports :** `searchCNRS`

### `lib/providers/institutional/french/data-gouv.ts` — 46 lignes

* data.gouv.fr - French Open Government Data Portal * API: https://www.data.gouv.fr/api/1/ (free, no key required)

**Exports :** `searchDataGouv`

### `lib/providers/institutional/french/ens.ts` — 40 lignes

* ENS - Écoles Normales Supérieures (Paris, Lyon, PSL) * Uses OpenAlex with multi-ROR filter covering ENS Paris + ENS Lyon * ENS Paris ROR: 05a0dhs15 | ENS Lyon ROR: 04zmssz18

**Exports :** `searchENS`

### `lib/providers/institutional/french/france-strategie.ts` — 31 lignes

* France Stratégie - French government think tank (PM office) * Uses OpenAlex enriched keyword search + Sciences Po proxy * France Stratégie has limited OpenAlex indexing, uses thematic enrichment

**Exports :** `searchFranceStrategie`

### `lib/providers/institutional/french/iddri.ts` — 39 lignes

* IDDRI - Institut du développement durable et des relations internationales * Uses OpenAlex with IDDRI ROR filter * ROR: https://ror.org/02j05s068

**Exports :** `searchIDDRI`

### `lib/providers/institutional/french/inrae.ts` — 29 lignes

* INRAE - Institut national de recherche pour l'agriculture, l'alimentation et l'environnement * Uses OpenAlex with INRAE ROR filter * ROR: https://ror.org/003vg9w96

**Exports :** `searchINRAE`

### `lib/providers/institutional/french/insee.ts` — 73 lignes

* INSEE - Institut National de la Statistique et des Études Économiques (France) * Primary: INSEE public API (no key for basic endpoints) * Fallback: OpenAlex with INSEE ROR filter * INSEE ROR: 02cjnvs63

**Exports :** `searchINSEE`

### `lib/providers/institutional/french/legifrance.ts` — 78 lignes

* Légifrance - French Official Legal Database * Uses Légifrance PISTE API (api.piste.gouv.fr) * Covers: legislation, regulations, court decisions, official journals * Requires: LEGIFRANCE_API_KEY (PISTE OAuth2)

**Exports :** `searchLegifrance`

### `lib/providers/institutional/french/shift-project.ts` — 31 lignes

* The Shift Project - French climate & energy think tank * Uses OpenAlex enriched keyword search (limited academic indexing) * + Sciences Po Paris ROR as proxy: 00mpxgs49

**Exports :** `searchShiftProject`

### `lib/providers/institutional/french/terra-nova.ts` — 53 lignes

* Terra Nova - French progressive think tank * Fetches publications via Terra Nova RSS/API feed * Website: https://tnova.fr

**Exports :** `searchTerraNova`

### `lib/providers/institutional/french/vie-publique.ts` — 55 lignes

* Vie Publique - French Public Affairs Documentation * Official French government public policy reference portal * Uses RSS feed + search API (no key required) * Website: https://www.vie-publique.fr

**Exports :** `searchViePublique`

### `lib/providers/institutional/government/istat.ts` — 83 lignes

* ISTAT — Italian National Statistics (SDMX REST API) * API: https://esploradati.istat.it/SDMXWS/rest/ (free, no key) * 4,700+ datasets: demographics, employment, economy, health, territory

**Exports :** `searchISTAT`

### `lib/providers/institutional/government/open-primitive.ts` — 85 lignes

* Open Primitive — US Federal Data API (30 domains, no key) * API: https://api.openprimitive.com/v1/ (free, no key, no limits) * Covers: electricity (EIA), SEC, health (PubMed), clinical trials, * demographics (Census), weather (NWS), air quality (EPA), etc.

**Exports :** `searchOpenPrimitive`

### `lib/providers/institutional/government/treasury-fiscal.ts` — 62 lignes

* US Treasury Fiscal Data — Federal financial data API * API: https://api.fiscaldata.treasury.gov/api/v1/ (free, no key, no registration) * Debt, revenue, spending, interest rates, savings bonds

**Exports :** `searchTreasuryFiscal`

### `lib/providers/institutional/health/cdc.ts` — 29 lignes

* CDC - Centers for Disease Control and Prevention * Uses OpenAlex with CDC ROR filter + CDC Public Health Reports API * ROR: https://ror.org/042twtr12

**Exports :** `searchCDC`

### `lib/providers/institutional/health/clinical-trials.ts` — 79 lignes

* ClinicalTrials.gov — Clinical trials registry * API: https://clinicaltrials.gov/api/v2/studies (free, no key) * 500K+ clinical trials with detailed protocols and results

**Exports :** `searchClinicalTrials`

### `lib/providers/institutional/health/cochrane.ts` — 29 lignes

* Cochrane - Cochrane Library (systematic reviews) * Uses OpenAlex with Cochrane Collaboration ROR filter * ROR: https://ror.org/00dbkrq51

**Exports :** `searchCochrane`

### `lib/providers/institutional/health/ecdc.ts` — 29 lignes

* ECDC - European Centre for Disease Prevention and Control * Uses OpenAlex with ECDC ROR filter * ROR: https://ror.org/00s9v1h75

**Exports :** `searchECDC`

### `lib/providers/institutional/health/ema.ts` — 29 lignes

* EMA - European Medicines Agency * Uses OpenAlex with EMA ROR filter * ROR: https://ror.org/01z0wsw92

**Exports :** `searchEMA`

### `lib/providers/institutional/health/inserm.ts` — 29 lignes

* INSERM - Institut national de la santé et de la recherche médicale (France) * Uses OpenAlex with INSERM ROR filter * ROR: https://ror.org/02vjkv261

**Exports :** `searchINSERM`

### `lib/providers/institutional/health/nih.ts` — 50 lignes

* NIH - National Institutes of Health (Enriched) * Combines OpenAlex NIH ROR filter with PubMed Central full-text search * ROR: https://ror.org/01cwqze88

**Exports :** `searchNIH`

### `lib/providers/institutional/health/who-direct.ts` — 70 lignes

* WHO Direct API - World Health Organization * Uses WHO IRIS repository API (institutional repository, no key required) * Also queries OpenAlex with WHO ROR for peer-reviewed outputs * ROR: https://ror.org/01f80g185

**Exports :** `searchWHODirect`

### `lib/providers/institutional/index.ts` — 127 lignes

* Institutional Providers Index * Centralized exports for all institutional data sources

**Exports :** `—`

### `lib/providers/institutional/intelligence/cia-foia.ts` — 82 lignes

* CIA FOIA Reading Room - Declassified documents * Legal: Freedom of Information Act - Public domain * URL: https://www.cia.gov/readingroom/

**Exports :** `searchCIAFOIA`

### `lib/providers/institutional/intelligence/global-intelligence.ts` — 181 lignes

* Global Intelligence & Security Providers (V3.1) * * Hybrid approach: Direct RSS feeds + Google News RSS fallback * for organizations that don't have public RSS or block bots. * * Direct RSS (confirmed working): * - Bellingcat (OSINT investigations) * * Google News RSS (covers all others): * - MI5, GCHQ, CSIS Canada, ASIO, Europol, Interpol, Frontex * - IISS, SIPRI, ICC, ICJ, OPCW, CTBTO * - BND (via Bundestag), DGSE (via Assemblée/Sénat)

**Exports :** `searchGlobalIntelligence`

### `lib/providers/institutional/intelligence/nsa.ts` — 77 lignes

* NSA - National Security Agency Publications * Legal: 17 U.S.C. §105 - US Government works in public domain * URL: https://www.nsa.gov

**Exports :** `searchNSA`

### `lib/providers/institutional/intelligence/odni.ts` — 80 lignes

* ODNI - Office of the Director of National Intelligence * Legal: 17 U.S.C. §105 - US Government works in public domain * URL: https://www.dni.gov

**Exports :** `searchODNI`

### `lib/providers/institutional/intelligence/uk-jic.ts` — 76 lignes

* UK Joint Intelligence Committee & National Archives * Legal: UK Open Government Licence * URL: https://www.gov.uk

**Exports :** `searchUKJIC`

### `lib/providers/institutional/international/global-orgs.ts` — 192 lignes

* Global International Organizations Provider (V3.1) * * Hybrid approach: Direct RSS feeds + Google News RSS fallback. * * Direct RSS (confirmed working): * - WHO (World Health Organization) * * Google News RSS (covers all others): * - WTO, WIPO, UNHCR, IOM, UNICEF, OCHA, IFRC, UNEP, ILO, ITU, * ICAO, IMO, WMO, IFAD, UNIDO, UN-Habitat, UN Women, UN, UNDP, UNCTAD

**Exports :** `searchGlobalOrgs`

### `lib/providers/institutional/law/eur-lex.ts` — 71 lignes

* EUR-Lex - EU Law & Official Journal of the European Union * Primary: EUR-Lex SPARQL/REST API (free, no key required) * API: https://eur-lex.europa.eu/search.html?type=advanced&qid=...

**Exports :** `searchEURLex`

### `lib/providers/institutional/multilateral/un.ts` — 36 lignes

* UN — Real Digital Library API (primary) + OpenAlex fallback * Primary: UN ODS API (documents.un.org/api/search) * Fallback: OpenAlex with UN ROR filter

**Exports :** `searchUN`

### `lib/providers/institutional/multilateral/unctad.ts` — 29 lignes

* UNCTAD - United Nations Conference on Trade and Development * Uses OpenAlex with UNCTAD ROR filter (reliable, no API key required) * ROR: https://ror.org/02szg9b20

**Exports :** `searchUNCTAD`

### `lib/providers/institutional/multilateral/undp.ts` — 29 lignes

* UNDP - United Nations Development Programme * Uses OpenAlex with UNDP ROR filter (reliable, no API key required) * ROR: https://ror.org/051777d98

**Exports :** `searchUNDP`

### `lib/providers/institutional/openalex-institution.ts` — 154 lignes

* OpenAlex Institution Resolver * * Many institutional providers (OECD, WorldBank, IMF, NBER, ECB, ...) previously * hardcoded ROR IDs to filter OpenAlex works. A diagnostic revealed that ~40 of * these hardcoded RORs were wrong/outdated and returned 0 works. * * This helper resolves an institution's OpenAlex ID *by name* at runtime (cached * in-memory + persisted process-wide) and filters works by the resolved ID. This * is self-healing: if an institution's ROR changes, we still find it by name

**Exports :** `resolveInstitution`, `searchByInstitution`

### `lib/providers/institutional/presets.ts` — 318 lignes

* Presets intelligents pour providers institutionnels * Recommandations automatiques selon le type de question

**Exports :** `ProviderPreset`, `detectPreset`, `PRESETS`, `recommendProviders`, `PRESET_EXAMPLES`

### `lib/providers/institutional/ror-batch.ts` — 130 lignes

* ROR Batch Provider — collapses pure OpenAlex-ROR institutional wrappers * into a single batched OpenAlex call per query. * * Context: ~30 institutional providers (ema, ecdc, cnrs, swp…) are thin * wrappers around `searchOpenAlex(query, { filter: ror:… })`. Fanning them * out individually costs N calls per query variation (several even fire 2 * ROR calls each) — that fan-out exhausted the per-execution OpenAlex budget * mid-scout and starved later planner nodes. OpenAlex supports OR filters * (

**Exports :** `isRorBatchedProvider`, `searchRorBatch`

### `lib/providers/institutional/science/global-science.ts` — 178 lignes

* Global Science & Technology Organizations Provider (V3.1) * * Hybrid approach: Direct RSS feeds + Google News RSS fallback. * * Direct RSS (confirmed working): * - NASA, ESA, OpenAI, DeepMind, Google Research, Microsoft Research * * Google News RSS (covers all others): * - CERN, NSF, DOE, DARPA, ERC, DFG, Wellcome, Gates, * IEEE, ACM, Royal Society, JST

**Exports :** `searchGlobalScience`

### `lib/providers/institutional/stable/cisa-advisories.ts` — 75 lignes

* CISA Cybersecurity Advisories - STABLE & PRODUCTION-READY * XML Feed: https://www.cisa.gov/cybersecurity-advisories/all.xml * Très stable, mis à jour quotidiennement

**Exports :** `searchCISAAdvisories`

### `lib/providers/institutional/stable/worldbank-api.ts` — 79 lignes

* World Bank API - STABLE & PRODUCTION-READY * API Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392

**Exports :** `searchWorldBankAPI`

### `lib/providers/institutional/tech/allen-ai.ts` — 29 lignes

* Allen Institute for AI (AI2) * Uses OpenAlex with Allen AI ROR filter * ROR: https://ror.org/05w520734

**Exports :** `searchAllenAI`

### `lib/providers/institutional/tech/eth-zurich.ts` — 29 lignes

* ETH Zurich - Swiss Federal Institute of Technology * Uses OpenAlex with ETH Zurich ROR filter * ROR: https://ror.org/05a28rw58

**Exports :** `searchETHZurich`

### `lib/providers/institutional/tech/inria.ts` — 29 lignes

* INRIA - Institut national de recherche en sciences et technologies du numérique * Uses OpenAlex with INRIA ROR filter * ROR: https://ror.org/02kvxyf05

**Exports :** `searchINRIA`

### `lib/providers/institutional/tech/max-planck.ts` — 29 lignes

* Max Planck Society - German premier research organisation * Uses OpenAlex with Max Planck Society ROR filter * ROR: https://ror.org/01hhn8329

**Exports :** `searchMaxPlanck`

### `lib/providers/institutional/think_tanks/bruegel.ts` — 101 lignes

* Bruegel — Brussels-based European economic think tank * Uses Bruegel website search + RSS feed * Provides policy briefs, working papers on European economics, energy, tech * Not an OpenAlex wrapper — returns unique sources.

**Exports :** `searchBruegel`

### `lib/providers/institutional/think-tanks/ecfr.ts` — 39 lignes

* ECFR - European Council on Foreign Relations * Uses OpenAlex with ECFR ROR filter * ROR: https://ror.org/03q12x978

**Exports :** `searchECFR`

### `lib/providers/institutional/think-tanks/global-think-tanks.ts` — 192 lignes

* Global Think Tanks, NGOs & Strategic Analysis Provider (V3.1) * * Hybrid approach: Direct RSS feeds + Google News RSS fallback. * * Direct RSS (confirmed working): * - Amnesty International, Human Rights Watch, Foreign Affairs, Atlantic Council, * Crisis Group, Heritage, GMF, Aspen, CSIS, Hoover * * Google News RSS (covers all others): * - Carnegie, Chatham House, CFR, RAND, Brookings, Cato, CAP, AEI, * Clingendael, IFRI, IRIS, CEPS, EPC, Friends of Europe, ODI, EIU, * Transparency Internation

**Exports :** `searchGlobalThinkTanks`

### `lib/providers/institutional/think-tanks/iai.ts` — 39 lignes

* IAI - Istituto Affari Internazionali (Italian Institute for International Affairs) * Uses OpenAlex with IAI ROR filter * ROR: https://ror.org/028a36g75

**Exports :** `searchIAI`

### `lib/providers/institutional/think-tanks/sipri.ts` — 39 lignes

* SIPRI - Stockholm International Peace Research Institute * Uses OpenAlex with SIPRI ROR filter * ROR: https://ror.org/05e8ym512

**Exports :** `searchSIPRI`

### `lib/providers/institutional/think-tanks/swp.ts` — 39 lignes

* SWP - Stiftung Wissenschaft und Politik (German Institute for International and Security Affairs) * Uses OpenAlex with SWP ROR filter * ROR: https://ror.org/05frkc804

**Exports :** `searchSWP`

### `lib/providers/institutional/v2/archive-org.ts` — 123 lignes

* Archive.org Advanced Search API * SOLUTION pour CIA FOIA, documents historiques * API gratuite, très stable

**Exports :** `searchArchiveOrg`, `searchCIAFOIAViaArchive`, `searchFBIViaArchive`, `searchJFKRecords`

### `lib/providers/institutional/v2/bis-papers.ts` — 101 lignes

* BIS Working Papers - Sequential crawl + RSS * URLs prévisibles pour papers (numéros séquentiels)

**Exports :** `searchBIS`, `crawlBISPapers`

### `lib/providers/institutional/v2/eu-open-data.ts` — 107 lignes

* EU Open Data Portal API * SOLUTION pour EEAS, EDA, ENISA * API officielle, gratuite

**Exports :** `searchEUOpenData`, `searchEEAS`, `searchEDA`, `searchENISAViaEUData`

### `lib/providers/institutional/v2/france-gov.ts` — 111 lignes

* France Government Data - data.gouv.fr API * SOLUTION pour Ministère Armées, SGDSN, Archives Nationales

**Exports :** `searchMinistereArmees`, `searchSGDSN`, `searchArchivesNationales`

### `lib/providers/institutional/v2/google-cse.ts` — 295 lignes

* Google Custom Search Engine - Pour sites sans API * Solution FIABLE pour ODNI, NATO, NSA, ENISA * * Setup: * 1. Créer CSE sur https://programmablesearchengine.google.com/ * 2. Ajouter sites: dni.gov, nato.int, nsa.gov, enisa.europa.eu * 3. Get API key: https://developers.google.com/custom-search/v1/introduction

**Exports :** `searchViaGoogleCSE`, `searchODNIViaGoogle`, `searchNATOViaGoogle`, `searchNSAViaGoogle`, `searchENISAViaGoogle`, `searchLawZeroViaGoogle`, `searchGovAIViaGoogle`, `searchIAPSViaGoogle`, `searchCAIPViaGoogle`, `searchAIPIViaGoogle`, `searchCSETViaGoogle`, `searchAINowViaGoogle`, `searchDataSocietyViaGoogle`, `searchAbundanceViaGoogle`, `searchCAIDPViaGoogle`

### `lib/providers/institutional/v2/imf-elibrary.ts` — 117 lignes

* IMF eLibrary - Structured scraping * Site académique stable, structure HTML prévisible

**Exports :** `searchIMFeLibrary`

### `lib/providers/institutional/v2/imf-sdmx.ts` — 286 lignes

* IMF SDMX Provider (dataservices.imf.org) * * Goal: * - Provide a robust, non-scraping IMF provider that does NOT depend on imf.org / elibrary.imf.org pages * (which are frequently protected / blocked). * - Use the official SDMX JSON service: * https://dataservices.imf.org/REST/SDMX_JSON.svc/ * * Important note: * - SDMX is NOT a full-text search engine. It exposes "dataflows" (datasets) and series/observations via keys. * - This provider implements a pragmatic "search" by querying the Dataflow

**Exports :** `searchIMFSDMX`

### `lib/providers/institutional/v2/index.ts` — 369 lignes

* INSTITUTIONAL PROVIDERS V2 - 21 PROVIDERS COMPLETS * Solutions créatives et RÉELLES pour chaque provider

**Exports :** `InstitutionalProviderV2`, `INSTITUTIONAL_PROVIDERS_V2`, `getProviderConfig`, `getProvidersByCategory`, `getReliableProviders`, `estimateCost`, `checkAuthRequirements`

### `lib/providers/institutional/v2/nara-api.ts` — 79 lignes

* NARA (National Archives) - OFFICIAL API ✅ * API Docs: https://catalog.archives.gov/api/v1/ * Cette API existe vraiment et est officielle !

**Exports :** `searchNARA`

### `lib/providers/institutional/v2/nist-publications.ts` — 121 lignes

* NIST Publications - RSS + Database search * Site très stable avec plusieurs feeds

**Exports :** `searchNIST`

### `lib/providers/institutional/v2/oecd-ilibrary.ts` — 77 lignes

* OECD iLibrary - Structured scraping * Alternative à l'API SDMX complexe

**Exports :** `searchOECDiLibrary`

### `lib/providers/institutional/v2/oecd-sdmx.ts` — 233 lignes

* OECD SDMX Provider (sdmx.oecd.org) * * Why: * - oecd.org and oecd-ilibrary.org are frequently protected (Cloudflare), causing 403s. * - OECD operates an SDMX REST endpoint on a separate domain: * https://sdmx.oecd.org/public/rest * (Disseminate Final DMZ / external access) * * What this provider returns: * - SDMX is a data API, not a publications search engine. * - We implement a pragmatic "search" by pulling the Dataflow catalog and scoring by keyword match. * - Returned items are treated as 

**Exports :** `searchOECDSDMX`

### `lib/providers/institutional/v2/uk-archives-api.ts` — 80 lignes

* UK National Archives - OFFICIAL DISCOVERY API ✅ * API Docs: https://www.nationalarchives.gov.uk/help/discovery-for-developers-about-the-application-programming-interface-api/ * API officielle, gratuite, bien documentée

**Exports :** `searchUKArchives`

### `lib/providers/institutional/v2/un-digital-library.ts` — 95 lignes

* UN Digital Library - OFFICIAL API ✅ * API Docs: https://digitallibrary.un.org/ * API Solr officielle, gratuite

**Exports :** `searchUNDigitalLibrary`, `searchUNDP`, `searchUNCTAD`


## Providers — `feeds/` — 8 modules

### `lib/providers/feeds/academia-society.ts` — 116 lignes

* Academia, civil society, science media & public data — ~80 sources.

**Exports :** `ACADEMIA_FEEDS`, `CIVIL_SOCIETY_FEEDS`

### `lib/providers/feeds/central-banks.ts` — 81 lignes

* Central Banks & Monetary Authorities — ~55 sources. * Monetary policy, financial stability, CBDC, macro-prudential.

**Exports :** `CENTRAL_BANK_FEEDS`

### `lib/providers/feeds/feed-engine.ts` — 208 lignes

* Mega Feed Engine — shared RSS/Google News feed search for 500+ source registries. * * Design constraints: * - NEVER fires all feeds: selects top-N feeds by domain/keyword match per query. * - direct feeds: fetched and filtered locally by query terms. * - GN feeds (site: pattern): query terms injected server-side by Google News. * - Per-feed hard timeout (Promise.race) so one dead feed can't stall the wave. * - Bounded concurrency to avoid socket/rate-limit storms.

**Exports :** `FeedSource`, `GN`, `searchFeedSet`

### `lib/providers/feeds/global-press.ts` — 231 lignes

* Global Press — ~170 quality news outlets by region. * Wires, financial press, quality dailies, analysis magazines.

**Exports :** `GLOBAL_PRESS_FEEDS`

### `lib/providers/feeds/index.ts` — 49 lignes

* MEGA FEED REGISTRY — aggregates all feed registries into one searchable set. * * Total: ~560 registered sources. Per query, `searchMegaFeeds` selects at most * `maxFeeds` feeds scored by domain/keyword relevance — the scout never fires * all 500, so latency stays bounded (~20 feeds × 9s worst-case = <30s).

**Exports :** `MEGA_FEEDS`, `FEED_SUBSETS`, `searchFeedSubset`

### `lib/providers/feeds/stats-offices.ts` — 71 lignes

* National Statistical Offices — ~50 sources. * Demographics, labour, inflation, trade, census data.

**Exports :** `STATS_OFFICE_FEEDS`

### `lib/providers/feeds/think-tanks-extended.ts` — 172 lignes

* Extended Think Tanks — ~90 policy institutes worldwide beyond the * existing global-think-tanks registry (no overlap with those feeds).

**Exports :** `THINK_TANK_EXTENDED_FEEDS`, `DEVELOPMENT_FEEDS`

### `lib/providers/feeds/un-eu-agencies.ts` — 107 lignes

* UN System + EU Agencies — ~90 sources. * Multilateral governance, treaties, EU regulatory machinery.

**Exports :** `UN_SYSTEM_FEEDS`, `EU_AGENCY_FEEDS`


## Providers — `foreign/` — 5 modules

### `lib/providers/foreign/cyberleninka.ts` — 80 lignes

* CyberLeninka Provider — Russian Open Access Academic Database * * CyberLeninka (cyberleninka.ru) is Russia's largest free open-access * scientific digital library. It indexes 2M+ Russian-language articles * from 1000+ journals across all disciplines, integrated with RSCI * (Russian Science Citation Index). * * API: Public search endpoint (JSON), no key required. * Lang: Primarily Russian, some English abstracts. * * KEY VALUE: Russian-language STEM, social sciences, and humanities * research n

**Exports :** `searchCyberLeninka`

### `lib/providers/foreign/elibrary-ru.ts` — 151 lignes

* eLibrary.ru Provider — Russian Scientific Electronic Library * * eLibrary.ru is Russia's largest academic e-library, integrated with * RSCI (Russian Science Citation Index). Contains 30M+ publications * from 20000+ Russian and international journals. Operated by the * Russian Foundation for Basic Research. * * API: Official API requires organizational license + Science Index access. * Set ELIBRARY_API_TOKEN environment variable if you have API access. * Without it, falls back to ethical scrapi

**Exports :** `searchELibrary`

### `lib/providers/foreign/jstage.ts` — 82 lignes

* J-STAGE Provider — Japan Science and Technology Agency (JST) * * J-STAGE (jstage.jst.go.jp) is Japan's largest platform for academic * publications, hosting 3000+ Japanese journals across all disciplines. * Developed and operated by JST. Contains 3M+ articles, many with English * abstracts even when the full text is in Japanese. * * API: Public REST API (JSON), no key required. * Docs: https://www.jstage.jst.go.jp/site/api/ * * KEY VALUE: Japanese-language research, unique STEM and social scie

**Exports :** `searchJStage`

### `lib/providers/foreign/scielo.ts` — 85 lignes

* SciELO Provider — Scientific Electronic Library Online * * SciELO (scielo.org) is the premier open-access platform for Latin * American, Caribbean, African, and Iberian research. Indexes 1500+ * journals with 1.5M+ articles, primarily in Portuguese, Spanish, * and English. Operated by BIREME/PAHO/WHO and FAPESP. * * API: Public REST API (JSON), no key required. * Docs: https://github.com/scieloorg/api * * KEY VALUE: Global South research, tropical medicine, public health, * social sciences fro

**Exports :** `searchSciELO`

### `lib/providers/foreign/wanfang.ts` — 106 lignes

* Wanfang Data Provider — Chinese Academic Database * * Wanfang Data (wanfangdata.com.cn) is one of China's three major * academic databases (alongside CNKI and CQVIP). It indexes Chinese * journals, dissertations, conference papers, patents, standards, * and technical reports. Contains 80M+ records across all disciplines. * * API: Open API requiring X-Ca-AppKey + Authorization (APPCODE) headers. * Set WANFANG_APPKEY and WANFANG_APPCODE environment variables. * Docs: https://github.com/wanfangda

**Exports :** `searchWanfang`


## Providers — `heritage/` — 5 modules

### `lib/providers/heritage/dpla.ts` — 97 lignes

* DPLA Provider — Digital Public Library of America * API : https://api.dp.la/v2/items * Couvre : 40M+ objets numériques (images, textes, vidéos, sons) provenant * de bibliothèques, archives et musées américains (Library of Congress, * Smithsonian, archives d'État, universités...). * * KEY VALUE : couverture patrimoniale américaine massive — histoire nationale, * culture matérielle, archives locales. Complémentaire d'Europeana (EU) et * Gallica (FR). Nécessite une clé API gratuite. * * Obtenir u

**Exports :** `searchDPLA`

### `lib/providers/heritage/europeana.ts` — 88 lignes

* Europeana Provider — European cultural heritage aggregator * API : https://api.europeana.eu/record/v2/search.json * Couvre : 50M+ objets du patrimoine culturel européen agrégés depuis * 3000+ institutions (musées, bibliothèques, archives, galeries) de toute l'Europe. * Images, textes, sons, vidéos — du Moyen Âge à nos jours. * * KEY VALUE : couverture patrimoniale paneuropéenne multilingue, complémentaire * de Gallica (FR) et DPLA (US). Nécessite une clé API gratuite. * * Obtenir une clé : htt

**Exports :** `searchEuropeana`

### `lib/providers/heritage/gallica.ts` — 102 lignes

* Gallica (BnF) Provider — Bibliothèque nationale de France * API SRU : https://gallica.bnf.fr/SRU * Couvre : millions de documents numérisés — livres, manuscrits, presse ancienne, * cartes, images, périodiques — du Moyen Âge au XXIe siècle. * * KEY VALUE : source francophone incontournable pour l'histoire, la littérature, * les humanités classiques et le patrimoine culturel. Gratuit, sans clé. * * Référence API : https://api.bnf.fr/fr/api-gallica-de-recherche-sru

**Exports :** `searchGallica`

### `lib/providers/heritage/gutenberg.ts` — 87 lignes

* Project Gutenberg Provider — via Gutendex API * API : https://gutendex.com/ (miroir officiel, gratuit, sans clé) * Couvre : 70 000+ ebooks libres de droits — classiques littéraires, ouvrages * historiques, textes fondateurs en domaine public (XVIIIe–début XXe siècle). * * KEY VALUE : accès direct au texte intégral des ouvrages classiques et * historiques en plusieurs langues (EN, FR, DE, IT...). Idéal pour la recherche * sur les sources primaires historiques et littéraires.

**Exports :** `searchGutenberg`

### `lib/providers/heritage/wikisource.ts` — 85 lignes

* Wikisource Provider — via Wikimedia Action API * API : https://www.wikisource.org/w/api.php (gratuit, sans clé) * Couvre : textes sources en domaine public multilingues — discours historiques, * traités, constitutions, lettres, manuscrits transcrits, textes religieux, * classiques littéraires. Présent sur 70+ sous-domaines linguistiques. * * KEY VALUE : texte intégral libre pour les sources primaires historiques et * juridiques. Complémentaire de Gallica (FR) et Gutenberg (livres entiers). * O

**Exports :** `searchWikisource`


## Providers — `academic/` — 4 modules

### `lib/providers/academic/crossref-api.ts` — 48 lignes

* CROSSREF API - Academic Search Provider * Recherche de publications académiques via Crossref

**Exports :** `searchCrossref`

### `lib/providers/academic/foresight-sources.ts` — 175 lignes

* Foresight & Prospective Sources — Reports from strategic foresight * organizations for prospective research. * * - Club of Rome (Meadows, Limits to Growth, etc.) * - Millennium Project (State of the Future) * - OECD Future Studies * - RAND Corporation (foresight reports) * * These are critical for strategic/prospective analysis where * foundational texts matter more than recent journal articles. * * Uses Crossref + web search fallbacks since most foresight * organizations publish reports rathe

**Exports :** `searchClubOfRome`, `searchMillenniumProject`

### `lib/providers/academic/foundational-sources.ts` — 407 lignes

* Foundational Academic Sources — Books, reports, and reference texts * for prospective/strategic research. * * These providers cover sources that journal databases miss: * - IPCC/GIEC assessment reports * - Internet Archive (millions of books, reports, historical documents) * - HathiTrust (academic books from research libraries) * - Open Library (book metadata with ISBNs) * - JSTOR (archived journal articles — via Crossref DOI prefix) * * All APIs are free and require no authentication (with ra

**Exports :** `searchIPCC`, `searchInternetArchive`, `searchHathiTrust`, `searchOpenLibrary`, `searchJSTOR`, `searchUNESCO`

### `lib/providers/academic/openalex-api.ts` — 41 lignes

* OPENALEX API - Academic Search Provider * Recherche de publications académiques via OpenAlex

**Exports :** `searchOpenAlex`


## Providers — `global-south/` — 4 modules

### `lib/providers/global-south/ajol.ts` — 80 lignes

* AJOL Provider — African Journals Online * Site : https://www.ajol.info/ | API : pas d'API REST officielle stable. * Couvre : 500+ revues africaines peer-reviewed, 100k+ articles, toutes * disciplines, avec un fort accent sur les contextes africains (santé publique, * agriculture, gouvernance, sciences sociales, environnement). * * KEY VALUE : comble un biais géographique majeur — la recherche africaine est * largement absente d'OpenAlex/Crossref. On accède aux métadonnées via le flux * OAI-PMH

**Exports :** `searchAJOL`

### `lib/providers/global-south/dialnet.ts` — 73 lignes

* Dialnet Provider — Portail scientifique hispanophone (Université de La Rioja) * Site : https://dialnet.unirioja.es/ | API : Dialnet Métricas + recherche web. * Couvre : 8 000+ revues espagnoles et ibéro-américaines, 1,5M+ articles, thèses, * livres, congrès — sciences humaines et sociales surtout (droit, histoire, * philologie, philosophie, économie). * * KEY VALUE : couverture ibérique et latino-américaine en sciences humaines que * les bases anglophones sous-représentent fortement. Pas d'API

**Exports :** `searchDialnet`

### `lib/providers/global-south/riss.ts` — 71 lignes

* RISS Provider — Research Information Service System (Corée du Sud) * Site : https://www.riss.kr/ | API : pas d'API REST publique officielle. * Couvre : 14M+ documents académiques coréens — thèses, articles, livres, * rapports — issus de 600+ universités et institutions coréennes. * * KEY VALUE : la recherche coréenne (KCI) est largement absente des bases * occidentales. On exploite le préfixe Crossref 10.2322 (RISS/KISTI) comme canal * de métadonnées structurées. Aucune clé requise.

**Exports :** `searchRISS`

### `lib/providers/global-south/shodhganga.ts` — 86 lignes

* Shodhganga Provider — Dépôt de thèses indiennes (INFLIBNET) * Site : https://shodhganga.inflibnet.ac.in/ | API : DSpace REST. * Couvre : 500 000+ thèses de doctorat indiennes dans toutes les disciplines, * déposées par les universités indiennes membres de l'UGC. * * KEY VALUE : la production académique indienne en sciences humaines et sociales * est massivement sous-représentée hors de Shodhganga. Accès au texte intégral * pour la plupart des thèses. Aucune clé requise (DSpace REST public).

**Exports :** `searchShodhganga`


## Providers — `macro/` — 4 modules

### `lib/providers/macro/ecb-api.ts` — 245 lignes

* ECB API PROVIDER - Macroéconomique européen * API officielle BCE pour données monétaires et financières

**Exports :** `ECBResult`, `searchECB`

### `lib/providers/macro/eurostat-api.ts` — 227 lignes

* EUROSTAT API PROVIDER - Macroéconomique européen * API officielle Eurostat pour données statistiques européennes

**Exports :** `EurostatResult`, `searchEurostat`

### `lib/providers/macro/index.ts` — 9 lignes

* MACRO PROVIDERS INDEX - Export des providers macroéconomiques

**Exports :** `—`

### `lib/providers/macro/insee-api.ts` — 229 lignes

* INSEE API PROVIDER - Macroéconomique français * API officielle INSEE pour données statistiques françaises

**Exports :** `INSEEResult`, `searchINSEE`


## Providers — `preprints/` — 4 modules

### `lib/providers/preprints/chemrxiv.ts` — 73 lignes

* chemRxiv Provider — Preprint server for chemistry (ACS, RSC, German Bunsen Soc., ...) * API : https://chemrxiv.org/engage/chemrxiv/public-api/v1/items/search * Couvre : 10 000+ preprints en chimie et domaines connexes (matériaux, * chimie verte, catalyse, chimie computationnelle, nanochimie). * * KEY VALUE : seul préprint server majeur en chimie ; bioRxiv/medRxiv ne couvrent * pas la chimie fondamentale. Gratuit, sans clé.

**Exports :** `searchChemRxiv`

### `lib/providers/preprints/dryad.ts` — 81 lignes

* Dryad Provider — dépôt de données de recherche (toutes disciplines) * API : https://datadryad.org/api/v2/search (gratuit, sans clé) * Couvre : 50 000+ jeux de données de recherche avec métadonnées riches et * articles associés, principalement en écologie, évolution, sciences * environnementales, mais aussi médecine et sciences sociales. * * KEY VALUE : source clé pour les données de recherche reproductibles ; les * jeux de données Dryad sont souvent cités dans la littérature peer-reviewed. * A

**Exports :** `searchDryad`

### `lib/providers/preprints/osf.ts` — 103 lignes

* OSF Provider — Open Science Framework (preprints & projects) * API : https://api.osf.io/v2/search/ (gratuit, sans clé pour la recherche publique) * Couvre : 200 000+ preprints et projets de recherche déposés sur OSF, tous * domaines, avec une forte présence en psychologie, sciences sociales, méthodes * quantitatives, et sciences de la reproduction. Inclut les préprints des * fournisseurs partenaires (SocArXiv, PsyArXiv, EarthArXiv, etc.). * * KEY VALUE : agrégateur de préprints multidisciplina

**Exports :** `searchOSF`

### `lib/providers/preprints/preprints-org.ts` — 76 lignes

* Preprints.org Provider — agrégateur multidisciplinaire de préprints (MDPI) * API : https://www.preprints.org/api/v1 (gratuit, sans clé) * Couvre : préprints dans toutes les disciplines (STEM, médecine, sciences * sociales, économie) déposés sur la plateforme preprints.org gérée par MDPI. * * KEY VALUE : complément multidisciplinaire à arXiv/bioRxiv/chemRxiv/OSF, avec * une couverture particulière en sciences sociales et environnement. Aucune clé.

**Exports :** `searchPreprintsOrg`


## Providers — `social/` — 3 modules

### `lib/providers/social/bluesky.ts` — 76 lignes

* Bluesky Social Signal Provider — Decentralized Social Network * * Bluesky (bsky.social) is a decentralized social network built on the * AT Protocol. Increasingly popular with academics, journalists, and * policy experts as an alternative to X/Twitter. Many researchers and * think tank analysts are active here. * * API: Public REST API (JSON), no key required for public search. * AT Protocol: https://atproto.com/ * Public API: https://public.api.bsky.app/ * Rate limit: Generous for unauthentic

**Exports :** `searchBlueskySignals`

### `lib/providers/social/hackernews.ts` — 71 lignes

* Hacker News Social Signal Provider — Tech & Policy Discussion * * Hacker News (news.ycombinator.com) is the premier community for * technology, startups, and policy-adjacent discussions. Run by Y * Combinator. High-signal discussions on AI, cybersecurity, tech * policy, economics, and emerging technologies. * * API: Public REST API (JSON), no key required. * Algolia HN Search API: https://hn.algolia.com/api * Official Firebase API: https://github.com/HackerNews/API * Rate limit: None (Algolia)

**Exports :** `searchHackerNewsSignals`

### `lib/providers/social/reddit.ts` — 164 lignes

* Reddit Social Signal Provider — Expert Subreddit Monitoring * * Reddit hosts expert communities across virtually every domain. Key * subreddits for research signal detection: * - r/science, r/AskScience — peer-reviewed research discussion * - r/economics, r/AskEconomics — economic policy debates * - r/geopolitics, r/foreignpolicy — strategic analysis * - r/MachineLearning, r/artificial — AI/ML research community * - r/energy, r/nuclear — energy policy & technology * - r/climate, r/environment 

**Exports :** `SocialSignal`, `searchRedditSignals`


## Providers — `patents/` — 1 modules

### `lib/providers/patents/patentsview-api.ts` — 202 lignes

* PatentsView PatentSearch API (USPTO / PatentsView) - Stable patent search provider * * Why: * - Google Patents scraping is brittle and frequently blocked. * - PatentsView provides a purpose-built PatentSearch API (ElasticSearch-backed) with stable JSON. * * Docs: * - Endpoint: https://search.patentsview.org/api/v1/patent/ * - Auth: header X-Api-Key: <key> * - Query (q): JSON object (supports _text_any on patent_title / patent_abstract) * - Sorting (s): JSON array of sort objects * - Options (o

**Exports :** `searchPatentsView`


## Couche LLM — 2 modules

### `lib/llm/cassette.ts` — 150 lignes

* LLM cassette — deterministic record/replay at the SDK boundary. * (VCR pattern adapted to agent loops: cassette / pytest-agentreplay / * agentverify all converge on intercepting the model call, not HTTP.) * * NOMOSX_LLM_MODE=live (default) — unchanged production behaviour * NOMOSX_LLM_MODE=record — pass through to providers, append each * request/response pair (and provider errors) to * the cassette file as JSONL * NOMOSX_LLM_MODE=replay — serve responses from the cassette keyed by the * same 

**Exports :** `LlmCassetteMode`, `CassetteMissError`, `CassetteEntry`, `getCassetteMissCount`, `getLlmCassetteMode`, `cassetteFilePath`, `recordLlmCassette`, `replayLlmCassette`, `resetLlmCassette`

### `lib/llm/unified-llm.ts` — 2452 lignes

* Unified LLM Service — Phase 0 re-cabled (01/07/2026) * * Six providers (DeepSeek, GLM-5.3/z.ai, OpenAI, Anthropic, Kimi K3/Moonshot, Google): * - Task→model assignment table (single source of truth, see TASK_ASSIGNMENT) * - Cross-family fallback: Kimi K3 ↔ GPT-6-Astra flagship pair, DeepSeek/GLM/Google fallback * - Per-provider configurable timeouts (GLM needs ≥120s for 30-90s first-token latency) * - Opposite-family rule for fact_check / citation_verification (anti blind-spot) * - Circuit bre

**Exports :** `LLMFamily`, `LLMProvider`, `LLMTask`, `isProviderSuspended`, `getSuspendedProviders`, `recordFreepoolUsage`, `getModelForTask`, `LLMRequest`, `ToolDefinition`, `ToolCall`, `LLMResponse`, `buildCacheKey`, `LLMCostLimitError`, `callLLM`, `C3POCascadeConfig`


## Worker, jobs & Temporal — 14 modules

### `lib/jobs/weekly-newsletter.ts` — 500 lignes

* Weekly Newsletter Job * * Tier-based intelligence dispatch — Abstrakt-style teasing: * - FREE: Title + 1-sentence hook + blurred teaser + upgrade CTA * - ANALYST: Title + full summary (150 words) + "Read full brief →" link * - RESEARCHER: Title + full summary + trust score + source count + direct link * * Schedule: Every Monday at 8:00 AM UTC * Run with: npx tsx lib/jobs/weekly-newsletter.ts

**Exports :** `runWeeklyNewsletter`

### `lib/temporal/activities.ts` — 52 lignes

* Temporal activities — thin adapters over existing pipeline functions. * Runs in the Temporal worker process (full Node + prisma + pipeline graph). * * Heartbeats carry the ThinkTankCycleProgress checkpoint: on activity retry * (worker death mid-cycle), `heartbeatDetails` replays the last checkpoint * into `resume` — same resume semantics as the PG durable worker.

**Exports :** `runThinkTankCycleActivity`

### `lib/temporal/client.ts` — 65 lignes

* Temporal client — lazy singleton for workflow submission. * Imported dynamically only when TEMPORAL_ENABLED=1 so the Next.js bundle * and the legacy worker never load @temporalio/client's native deps.

**Exports :** `getTemporalClient`

### `lib/temporal/config.ts` — 41 lignes

* Temporal configuration — opt-in durable orchestration. * * The think-tank cycle can run either on the legacy PG-backed durable worker * (default) or on Temporal (when TEMPORAL_ENABLED=1). Nothing here is loaded * by the Next.js bundle unless explicitly imported — the client and worker * pull native deps and must stay in the worker entrypoint. * * Temporal Cloud auth: API key (TEMPORAL_API_KEY) or mTLS cert pair.

**Exports :** `TemporalConfig`, `getTemporalConfig`

### `lib/temporal/types.ts` — 26 lignes

* Shared input/result types for the think-tank cycle workflow. * Kept dependency-free — the workflow sandbox must be able to load this file.

**Exports :** `ThinkTankCycleWorkflowInput`, `ThinkTankCycleWorkflowResult`

### `lib/temporal/worker.ts` — 72 lignes

* Temporal worker bootstrap — creates and runs the activity worker against * Temporal Cloud. Shared by the standalone entrypoint (scripts/temporal-worker.ts) * and the in-process start inside the legacy PG worker (opt-in via * TEMPORAL_ENABLED=1). * * Loaded via dynamic import only — @temporalio/worker pulls native deps and * must never reach the Next.js bundle.

**Exports :** `TemporalWorkerHandle`, `startTemporalWorker`

### `lib/temporal/workflows.ts` — 43 lignes

* Think-tank cycle workflow. * * SANDBOX RULES: this file is bundled by @temporalio/worker and executed in * an isolated VM — only deterministic imports are allowed. Never import * prisma, the pipeline, env vars, or anything with side effects here.

**Exports :** `thinkTankCycleWorkflow`

### `lib/worker/durable-worker.ts` — 480 lignes

* Durable Worker — NomosX * * DB-backed job runner for jobs that outlive any single HTTP request or * serverless invocation (think-tank cycles take 45–75 min; Netlify functions * cap at 15 min). The Job row is the source of truth: a worker crash leaves a * stale lock that the next worker reclaims — no run is silently lost. * * Flow: * cron/API → enqueue Job (PENDING) → 202 * worker (any always-on host with DATABASE_URL) → claim → heartbeat → * handler → COMPLETED | retry w/ backoff | FAILED + Jo

**Exports :** `ClaimedJob`, `JobHandler`, `WorkerOptions`, `registerJobHandler`, `getRegisteredJobTypes`, `claimNextJob`, `saveJobProgress`, `assertWorkerMemoryLimits`, `cancelActiveJob`, `getActiveJob`, `executeJob`, `runWorkerLoop`

### `lib/worker/execution-scope.ts` — 304 lignes

* Effective wall-clock deadline for the current execution: the MINIMUM of * every deadline in the scope ancestry — an abort on any ancestor kills the * work, so the tightest bound is the real one. This is what headroom guards * must compare against: a regen child pipeline creates its own format-sized * inner deadline (65min) while the enclosing regen scope is tighter (35min) * — reading only the inner scope would authorise work that can never finish * (S35: an outline rewrite approved on the inn

**Exports :** `getExecutionSignal`, `recordExecutionCost`, `getExecutionDeadlineAt`, `getTightestExecutionBudgetMs`, `assertExecutionActive`, `withExecutionDetached`, `withExecutionSignal`, `withExecutionScope`, `withExecutionDeadline`, `consumeExecutionBudget`, `consumeRootBudget`, `getExecutionBudgetUsage`

### `lib/worker/job-handlers.ts` — 61 lignes

* Job handlers for the durable worker. * Registered lazily — importing this module pulls in the pipeline graph, * so only the worker entrypoint (or sync fallbacks) should import it.

**Exports :** `registerAllJobHandlers`

### `lib/worker/think-tank-queue.ts` — 155 lignes

* Think-tank cycle enqueue — turns the cron-triggered long pipeline into a * durable Job row so cron routes return 202 immediately and a worker executes * the cycle without HTTP timeout constraints.

**Exports :** `THINK_TANK_JOB_TYPE`, `isThinkTankEnabled`, `thinkTankCyclePayloadSchema`, `EnqueueResult`, `enqueueThinkTankCycle`, `getThinkTankJobStatus`

### `scripts/pipeline-worker.ts` — 152 lignes

* NomosX durable pipeline worker. * * Long-running process that executes queued Jobs (think-tank cycles, StudioX * pipelines) against Postgres. Deploy on any always-on host with DATABASE_URL * and the LLM/provider env vars — it does NOT need to run on Netlify. * * Usage: * npx tsx --env-file=.env.local scripts/pipeline-worker.ts # loop * npx tsx --env-file=.env.local scripts/pipeline-worker.ts --once # one pass * npx tsx --env-file=.env.local scripts/pipeline-worker.ts --max-jobs=2 * * Flags: * 

**Exports :** `—`

### `scripts/replay-run.ts` — 433 lignes

* Deterministic pipeline replay — re-run the analytical queue of a * persisted publication against its recorded corpus + LLM cassette. * * tsx --env-file=.env.local scripts/replay-run.ts --publication <id> \ * [--pipeline-run <id>] [--cassette <path>] [--depth deep] [--tolerance N] \ * [--record] [--cleanup] * tsx scripts/replay-run.ts --inspect <cassette path> (offline cassette check) * * --record flips to NOMOSX_LLM_MODE=record on the SAME fixed corpus * (persisted sourceIds → scout skipped): 

**Exports :** `—`

### `scripts/temporal-worker.ts` — 24 lignes

* Temporal worker entrypoint — runs pipeline activities against Temporal Cloud. * * TEMPORAL_ENABLED=1 TEMPORAL_ADDRESS=<ns>.tmprl.cloud:7233 \ * TEMPORAL_NAMESPACE=<ns> TEMPORAL_API_KEY=<key> \ * npx tsx --env-file=.env.local scripts/temporal-worker.ts * * Runs alongside the legacy PG worker during migration — each claims its own * queue (Temporal task queue vs Job table), no double execution. The PG * pipeline-worker also starts this in-process when TEMPORAL_ENABLED=1, so a * single Railway se

**Exports :** `—`


## Foresight & prédictions — 8 modules

### `lib/foresight/adapter.ts` — 247 lignes

* Foresight adapter — normalize pipeline / publication artifacts → ForesightBundle

**Exports :** `extractForesightFromInquiry`, `extractForesightFromPublicationMeta`, `extractForesightFromLineage`, `buildForesightPersistPayload`, `emptyForesight`

### `lib/foresight/config.ts` — 34 lignes

* Foresight Engine — runtime configuration & feature flags

**Exports :** `ForesightConfig`, `getForesightConfig`, `isForesightEnabled`

### `lib/foresight/constants.ts` — 14 lignes

Public labels for prospective foresight UI

**Exports :** `FORESIGHT_METHODOLOGY`, `FORESIGHT_LAYERS`

### `lib/foresight/html-section.ts` — 69 lignes

* Render Simulated Outcomes section for publication HTML

**Exports :** `renderSimulationHtmlSection`, `appendSimulationToHtml`, `htmlHasForesightSection`

### `lib/foresight/index.ts` — 36 lignes

* NomosX Foresight Engine — institutional architecture layer * * MiroFish → swarm simulation + social dynamics * Palantir → graph intelligence + operational telemetry * France Stratégie → scenario planning + executive synthesis * * This module is the canonical public interface for foresight data. * Implementation lives in lib/agent/foresight-*.ts + simulation-agent.ts

**Exports :** `—`

### `lib/foresight/persist-run.ts` — 63 lignes

* Persist ForesightRun telemetry row (Prisma) — non-blocking on schema drift

**Exports :** `PersistForesightRunInput`, `persistForesightRun`

### `lib/foresight/persona-gate.ts` — 53 lignes

* Server-side persona validation for foresight chat

**Exports :** `resolvePublicationPersona`

### `lib/foresight/types.ts` — 82 lignes

* Foresight Engine — canonical types for UI, API, and persistence * Institutional grade: France Stratégie × Palantir × NomosX

**Exports :** `ForesightTrajectory`, `ForesightScenarioOutcome`, `ForesightTelemetry`, `ForesightPersonaSnapshot`, `ForesightSensitivity`, `ForesightBundle`, `ForesightChatRequest`


## StudioX (produit payant) — 6 modules

### `lib/studiox-pricing.ts` — 28 lignes

* Nomos Engine pricing — pay-per-study, aligned with the 4 canonical formats. * * Positioning: premium but accessible. Benchmark against ResearchOS ($1,649), * Revv Research ($295), StratBear ($699 white-label).

**Exports :** `STUDIOX_PRICES`, `getStudioXPrice`

### `lib/studiox/drain.ts` — 98 lignes

* Reconcile stuck StudioX orders — enqueue or reclaim stale RUNNING workers. * Safe to run on a schedule; all actions are idempotent.

**Exports :** `StudioXDrainResult`, `drainStudioXOrders`

### `lib/studiox/enqueue.ts` — 92 lignes

* Enqueue a StudioX pipeline job (idempotent) and trigger background execution. * Safe to call from webhook, API retry, or order reconciliation.

**Exports :** `STUDIOX_JOB_TYPE`, `studioXJobIdempotencyKey`, `enqueueStudioXPipeline`, `triggerStudioXBackground`

### `lib/studiox/format.ts` — 28 lignes

* Map a Nomos Engine publication format to a pipeline report format. * * Canonical mapping (4 formats → 3 pipeline formats): * Signal Brief → "brief" (surface depth, perProvider ~15) * Decision Memo → "memo" (standard depth, perProvider ~30) * Article → "brief" (deep depth, perProvider ~50) * Strategic Report → "strategic" (strategic depth, perProvider ~80) * * Legacy types are resolved via resolveFormatType() before mapping.

**Exports :** `formatTypeToReportFormat`

### `lib/studiox/refund.ts` — 68 lignes

* Refund a failed StudioX order via Stripe PaymentIntent. * Idempotent — skips if already refunded.

**Exports :** `refundStudioXOrder`

### `lib/studiox/runner.ts` — 200 lignes

* Process a paid StudioX order: run the full V7 pipeline and persist the result. * Idempotent — safe if called twice for the same orderId.

**Exports :** `processStudioXOrder`


## Données quant & macro — 5 modules

### `lib/quant/figaro-client.ts` — 141 lignes

* QUANT BRIDGE — FIGARO IO service client * * Thin HTTP client for the Python quant-service (see /quant-service). * The service computes Leontief multipliers and final-demand shock * propagation on Eurostat FIGARO inter-country input-output tables. * * Fail-safe: returns null on any error — the pipeline never blocks on it. * Configure with QUANT_SERVICE_URL (e.g. https://quant.nomosx.com).

**Exports :** `quantServiceUrl`, `figaroShock`, `deriveFigaroRequest`, `figaroResponseToModelResult`

### `lib/quant/parametric-cost.ts` — 145 lignes

* QUANT BRIDGE — Parametric costing engine * * Deterministic order-of-magnitude cost estimation: * total = Σ (unitCost × quantity) × Π (1 + riskFactor) * with per-line uncertainty propagated to a low/central/high range. * * Design principles (same as quant-agent): * - Zero LLM calls — pure arithmetic, no hallucination possible * - Full lineage — every unit cost carries its statistical source * - Honest ranges — uncertainty is propagated, never hidden

**Exports :** `runParametricCost`

### `lib/quant/quant-bridge.ts` — 101 lignes

* QUANT BRIDGE — Orchestrator * * Runs the deterministic quantitative models relevant to a query and * produces a MODEL EVIDENCE block for the STRATEGIC ANALYST prompt. * * Numbers produced here are cited as [MODEL-N] in reports and validated * by the extended citation guard (see pipeline-v2.ts:citationGuard). * * Position in funnel: parallel with READER/QUANT, before ANALYST. * Fail-safe: every model isolated; the pipeline never blocks on the bridge.

**Exports :** `QuantDepth`, `QuantBridgeOptions`, `runQuantBridge`

### `lib/quant/reference-costs.ts` — 130 lignes

* QUANT BRIDGE — Reference cost database * * Curated unit costs from official/public statistical sources. * Every entry carries its source and reference year so that any * estimate built on it is fully traceable and defensible. * * Extend this table as engagements require — keep entries sourced. * NEVER add an entry without a verifiable public source.

**Exports :** `ReferenceCost`, `REFERENCE_COSTS`, `REFERENCE_COST_BY_ID`, `staleReferenceCosts`, `referenceCostAudit`

### `lib/quant/types.ts` — 103 lignes

* QUANT BRIDGE — Shared types * * The QUANT BRIDGE orchestrates deterministic quantitative models * (parametric costing, FIGARO input-output analysis) and produces * a MODEL EVIDENCE block for the STRATEGIC ANALYST, plus structured * tables for Excel/CSV export. * * Every number carries full lineage: model, parameters, data source. * Models are referenced as [MODEL-N] in reports (validated by the * extended citation guard).

**Exports :** `QuantModelKind`, `ModelParameter`, `ModelResultRow`, `ModelResult`, `QuantBridgeOutput`, `CostLineInput`, `ParametricCostInput`, `FigaroShockRequest`, `FigaroShockResponse`


## Think-tank product layer — 5 modules

### `lib/think-tank/index.ts` — 16 lignes

* NomosX Think Tank Library - Main Export

**Exports :** `—`

### `lib/think-tank/templates.ts` — 288 lignes

* NomosX Institutional Think Tank — Publication Templates * * 4 canonical templates aligned 1:1 with Inquiry depths and Engine formats. * Word counts benchmarked against top think tanks: * * SUMMARY_BRIEF → surface depth — 500-1,200 words, 5+ sources * Benchmark: Carsey fact sheet (900-1000w), FAO policy brief (700w), World Bank short brief (1500w) * * DECISION_MEMO → standard depth — 1,200-2,500 words, 8+ sources * Benchmark: GNSI Decision Brief (2400w), WHO policy brief (1000-3000w), National 

**Exports :** `PUBLICATION_TEMPLATES`, `getTemplate`

### `lib/think-tank/types.ts` — 297 lignes

* NomosX Institutional Think Tank - Type Definitions * * Types for the signal-driven publication system

**Exports :** `SIGNAL_TYPES`, `SignalType`, `SIGNAL_STATUSES`, `SignalStatus`, `PUBLICATION_TYPES`, `PublicationType`, `FORMAT_MAPPING`, `CLAIM_TYPES`, `ClaimType`, `EDITORIAL_DECISIONS`, `EditorialDecisionType`, `CHECK_TYPES`, `CheckType`, `VerticalConfig`, `SignalScores`

### `lib/think-tank/ui-types.ts` — 185 lignes

* NomosX Think Tank - UI Types * * Centralized types for Think Tank UI components and pages * Avoids duplication across pages

**Exports :** `VerticalSummary`, `VerticalRef`, `UISignalScores`, `SignalSummary`, `PublicationSummary`, `PublicationDetail`, `PublicationSource`, `PublicationClaim`, `QualityCheck`, `CadenceData`, `SIGNAL_TYPE_LABELS`, `PUBLICATION_TYPE_LABELS`, `PUBLICATION_TYPE_META`, `SIGNAL_STATUS_LABELS`

### `lib/think-tank/verticals.ts` — 139 lignes

* NomosX Institutional Think Tank - Vertical Definitions * * Pre-configured verticals for the think tank

**Exports :** `VerticalDefinition`, `VERTICALS`, `getVerticalBySlug`, `getVerticalConfig`


## Knowledge, council & queries — 7 modules

### `lib/council/council-manager.ts` — 548 lignes

* NomosX Council Manager - Advanced 22 Expert Management * * Intelligent selection and load balancing for 22 domain experts * Optimized for performance and quality

**Exports :** `CouncilQuery`, `CouncilSelection`, `CouncilResult`, `ExpertLoadBalance`, `ExpertPerformanceRecord`, `CouncilManager`, `councilManager`

### `lib/knowledge/multi-domain-corpus.ts` — 1240 lignes

* NomosX Multi-Domain Knowledge Base * * 760+ fundamental documents across 22 domains * Each domain expert has access to specialized corpus * * Architecture: * - Domain-specific document collections * - Metadata and categorization * - Search and retrieval APIs * - Expert-specific knowledge priming

**Exports :** `KnowledgeDocument`, `DomainCorpus`, `KnowledgeQuery`, `KnowledgeResult`, `DomainExpertise`, `MULTI_DOMAIN_CORPUS`, `MultiDomainKnowledgeBase`, `knowledgeBase`

### `lib/queries/dossiers.ts` — 150 lignes

* Dossier watch queries — "dossiers suivis" page data. * * A dossier is an analyzed subject NomosX keeps watching: the Brief that * originated open predictions plus every UPDATE_NOTE follow-up triggered * when the world matched a falsification trigger (Sprint 28 P2/7). * * Linkage chain: * UPDATE_NOTE publication → signalId → Signal(PREDICTION_TRIGGER, * summary contains "[PRED:<predictionId>]") → Prediction → briefId.

**Exports :** `DossierPrediction`, `DossierUpdate`, `WatchedDossier`, `fetchWatchedDossiers`

### `lib/queries/knowledge-graph.ts` — 65 lignes

_(no docstring — voir le code source)_

**Exports :** `GraphNode`, `GraphEdge`, `KnowledgeGraphData`, `fetchKnowledgeGraph`

### `lib/queries/predictions.ts` — 136 lignes

The public inquiry that contains this call, when linked.

**Exports :** `PredictionWithBrief`, `fetchPredictions`, `fetchPredictionStats`, `DeskPrediction`, `fetchDeskPredictions`

### `lib/queries/public-briefs.ts` — 133 lignes

* Server-side brief fetcher — mirrors the /api/public/briefs logic * but callable directly from Server Components (no HTTP roundtrip).

**Exports :** `fetchPublicBriefs`

### `lib/queries/public-inquiry.ts` — 257 lignes

* Publications embed images as base64 data URIs — they can weigh several MB * inside the HTML payload. Replace each src with a deterministic URL that the * media route resolves by index; bytes are served once, cacheable forever. * Order must match the extractor in app/api/articles/[id]/media/[n]/route.ts.

**Exports :** `extractTopics`, `externalizeInlineImages`, `InquiryDeskAttribution`, `InquiryData`, `RelatedInquiryData`, `fetchInquiryData`


## Gouvernance, sécurité & validation — 16 modules

### `lib/auth.ts` — 168 lignes

* Authentication utilities * Handles password hashing, JWT tokens, and session management

**Exports :** `SessionUser`, `hashPassword`, `verifyPassword`, `createToken`, `verifyToken`, `createSession`, `getSession`, `deleteSession`, `requireAuth`, `requireAdmin`

### `lib/env.ts` — 225 lignes

* Environment variables validation with Zod * Ensures all required vars are present at runtime

**Exports :** `Env`, `env`

### `lib/governance/audit.ts` — 110 lignes

* Agent Governance Layer - Audit Logging * * Minimal internal audit trail for critical agent actions. * Logs only: publications, holds, silents, violations. * * ⚠️ INTERNAL ONLY - No UI, no export, no user access

**Exports :** `AuditAction`, `AuditEvent`, `logAuditEvent`, `logPublication`, `getRecentAuditLogs`, `getAgentAuditLogs`, `getViolationCount`

### `lib/governance/guard.ts` — 103 lignes

* Agent Governance Layer - Permission Guard * * Core enforcement mechanism for agent permissions. * All critical actions MUST pass through this guard. * * Principle: Fail fast - violations throw immediately. * * ⚠️ INTERNAL ONLY - Never expose to UI or marketing

**Exports :** `GovernanceViolationError`, `assertPermission`, `assertPermissions`, `withPermission`

### `lib/governance/index.ts` — 14 lignes

* Agent Governance Layer - Public API * * Central export point for the governance system. * * ⚠️ INTERNAL ONLY - Never expose to UI or marketing

**Exports :** `—`

### `lib/governance/permissions.ts` — 126 lignes

* Agent Governance Layer - Permission Definitions * * Explicit permissions for each agent role. * Principle: Least privilege - agents can only perform authorized actions. * * ⚠️ INTERNAL ONLY - Never expose to UI or marketing

**Exports :** `Permission`, `AgentPermissions`, `hasPermission`, `getPermissions`

### `lib/governance/roles.ts` — 43 lignes

* Agent Governance Layer - Role Definitions * * Defines the strict roles for each agent in the NomosX Think Tank. * Each agent has a single, well-defined responsibility. * * ⚠️ INTERNAL ONLY - Never expose to UI or marketing

**Exports :** `AgentRole`, `AgentRole`, `AgentRoleDescriptions`

### `lib/governance/rules.ts` — 199 lignes

* Agent Governance Layer - Editorial Rules * * Enforces editorial discipline and cadence limits. * These rules ensure NomosX maintains institutional-grade quality. * * Principle: Silence is a success state. * * ⚠️ INTERNAL ONLY - Never expose to UI or marketing

**Exports :** `CadenceViolationError`, `CADENCE_LIMITS`, `enforceCadenceLimit`, `enforceDailyCadenceLimit`, `canPublish`, `getCadenceStatus`

### `lib/sanitize.ts` — 138 lignes

* HTML sanitization for brief/report content rendered via dangerouslySetInnerHTML. * * Uses the browser's Sanitizer API where available (Chrome 105+), * otherwise falls back to a lightweight allowlist-based approach. * * This prevents XSS from LLM-generated HTML (scripts, iframes, event handlers).

**Exports :** `sanitizeHtml`

### `lib/security.ts` — 152 lignes

Validation schemas

**Exports :** `rateLimit`, `securityHeaders`, `addSecurityHeaders`, `LoginSchema`, `RegisterSchema`, `UpdateProfileSchema`, `CreateBriefSchema`, `UpdateBriefSchema`, `SubscriptionSchema`, `ContactSchema`, `rateLimitConfigs`, `sanitizeInput`, `sanitizeSqlInput`, `fileUploadConfig`, `validateFileUpload`

### `lib/security/index.ts` — 6 lignes

* Security module barrel exports

**Exports :** `—`

### `lib/security/rate-limit.ts` — 131 lignes

* Rate limiting for Next.js API routes. * * Strategy: * 1. Try Redis (ioredis) for serverless-safe distributed rate limiting * 2. Fallback to in-memory fixed window if Redis unavailable * * Redis uses atomic INCR + EXPIRE for correctness across instances.

**Exports :** `RateLimitError`, `assertRateLimit`, `assertRateLimitSync`

### `lib/security/timing-safe.ts` — 35 lignes

* Timing-safe secret comparison for cron/webhook/admin authentication. * * Plain `===` on secrets leaks length and prefix via timing side-channels. * `crypto.timingSafeEqual` requires equal-length Buffers, so we SHA-256 both * sides first — constant-time and length-agnostic.

**Exports :** `safeCompare`, `verifyBearerToken`

### `lib/sentry.ts` — 89 lignes

* Sentry Error Monitoring * * To activate: * 1. npm install @sentry/nextjs * 2. Set SENTRY_DSN in .env * 3. Uncomment the code below

**Exports :** `initSentry`, `captureException`, `captureMessage`, `setUser`, `clearUser`

### `lib/validation.ts` — 256 lignes

Re-export rateLimitConfigs for backward compatibility

**Exports :** `withValidation`, `withRateLimit`, `withAuth`, `withValidationAndAuth`, `withValidationAndAuth`, `withValidationAndAuth`, `withRateLimitAndValidation`, `withAll`, `commonSchemas`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `RateLimitError`, `createSuccessResponse`, `createErrorResponse`

### `lib/validators/format-validator.ts` — 565 lignes

* Format Validator - Comprehensive validation for NomosX formats * Validates content against format specifications and LawZero standards

**Exports :** `FormatValidationResult`, `SectionValidation`, `TitleValidation`, `ValidationOptions`, `validateFormat`, `batchValidateFormat`, `generateValidationReport`


## Infrastructure support — 44 modules

### `lib/analytics.ts` — 164 lignes

* Analytics Service — Product Analytics & Tracking * * Tracks user behavior, conversion events, and business metrics. * Integrates with Posthog (or Plausible) for product analytics. * * Events tracked: * - signup: User registration * - trial_started: Trial activation * - trial_expired: Trial expiry * - upgrade: Subscription upgrade * - brief_commissioned: User commissions a brief * - strategic_report: User commissions strategic report * - studio_analysis: User runs studio analysis

**Exports :** `AnalyticsEvent`, `PageView`, `trackEvent`, `trackPageView`, `trackSignup`, `trackTrialStarted`, `trackTrialExpired`, `trackUpgrade`, `trackBriefCommissioned`, `trackStudioAnalysis`

### `lib/audit/institutional-quality.ts` — 747 lignes

* NomosX — Institutional Quality Audit Engine * * Benchmarks: France Stratégie · Harvard/Brookings · McKinsey GMI · RAND * Pure functions — no side effects. Used by scripts/institutional-quality-audit.ts

**Exports :** `InstitutionalTier`, `BenchmarkId`, `AuditCheck`, `PublicationAuditInput`, `PublicationAuditResult`, `PipelineHealthSnapshot`, `countWordsHtml`, `detectMarkdownArtifacts`, `detectForbiddenPhrases`, `detectSections`, `tierFromScore`, `tierLabel`, `auditPublication`, `summarizeAuditResults`

### `lib/brand/cover-manifest.ts` — 59 lignes

* Generated by scripts/domain-figures.py — keys whose * public/figures/<key>-cover.webp asset exists.

**Exports :** `COVER_KEYS`, `COVER_META`

### `lib/brand/domain-figures.ts` — 73 lignes

* Mythological domain covers — public/figures/<key>-cover.webp. * Generated by scripts/domain-figures.py from public-domain Wikimedia * artwork (frescoes, mosaics, mythological paintings), graded warm with * an engraved plate frame. Keys may carry a sub-domain suffix * ("finance-crypto") — falls back to the parent domain's cover when no * dedicated artwork was generated.

**Exports :** `DomainFigureVariant`, `domainFigureUrl`, `PlateCover`, `PlateCoverVariant`, `nomosPlateCover`, `plateCoverUrl`, `domainCoverCredit`

### `lib/brand/domains.ts` — 12 lignes

Public domain taxonomy — matches the archives DOMAIN_FILTERS.

**Exports :** `DOMAINS`

### `lib/brand/email-brand.ts` — 26 lignes

Shared monochrome email brand tokens (SpaceX-like, matches public UI).

**Exports :** `EMAIL_BRAND`, `emailTrustColor`

### `lib/brand/featured-verdict.ts` — 164 lignes

Map latest publication → homepage FeaturedVerdictCard data.

**Exports :** `FeaturedBriefSource`, `buildFeaturedVerdict`, `FALLBACK_FEATURED_VERDICT`, `isEmptyVerdict`

### `lib/brand/fresco-fields.ts` — 38 lignes

* FrescoFields — landscape luminance matrices of Greek-mythology * frescoes (public domain, Wikimedia), rendered as Greek glyphs by * components/signature/GodField.tsx in fitWidth mode. * Generated by scripts/fresco-fields.py. * * Sources: * technology: The Fall of Icarus, fresco from Pompeii, 40-79 AD.png * economics: Fresco of Mercury-Hermes, Pompeii.jpg * governance: Jupiter and Thetis (Ingres).jpg * geopolitics: Rape of Europa from Casa di Giasone (Pompeii).jpg * climate: Neptune Amphitrite 

**Exports :** `FRESCO_COLS`, `FRESCO_ROWS`, `FRESCO_FIELDS`, `frescoFieldFor`

### `lib/brand/god-fields.ts` — 141 lignes

* GodFields — one luminance matrix per public domain, each sampled * from a public-domain classical figure (Wikimedia Commons). * Rendered as Greek glyphs by components/signature/GodField.tsx. * Generated by scripts/greek-god-fields.py. * * Sources: * technology: Wenceslas Hollar - The Greek gods. Vulcan.jpg * economics: Bust of Hermes of Olympia Gilliéron EFA-CEG-734.jpg * governance: Zeus Otricoli Pio-Clementino Inv257.jpg * geopolitics: Janus-Vatican.jpg * climate: Bust of Poseidon.jpg * heal

**Exports :** `GOD_COLS`, `GOD_ROWS`, `GOD_FIELDS`, `VERTICAL_TO_DOMAIN`, `resolveDomainKey`, `resolveCoverKey`, `godFieldFor`

### `lib/brand/inquiry-html-parse.ts` — 288 lignes

* Parse Editorial V2 (position-first) brief HTML for structured inquiry UI. * * Sections are matched on their stable `nx-block <name>` class — NOT on the * localized eyebrow labels, which vary per persona and locale (7 variants).

**Exports :** `EditorialTeamMember`, `EditorialScenario`, `ParsedEditorialInquiry`, `parseEditorialInquiry`, `extractLegacyArticleBody`

### `lib/brand/logo-config.ts` — 15 lignes

Brand mark accent — dark luminous — X glyph glows on light background.

**Exports :** `LOGO_ACCENT`, `LOGO_MONO_DEFAULT`, `LOGO_NAV_CAP`, `LOGO_AUTH_SYMBOL`, `LOGO_ERROR_CAP`

### `lib/brand/logo-inline.ts` — 81 lignes

_(no docstring — voir le code source)_

**Exports :** `inlineSymbolSvg`, `inlineWordmarkSvg`, `inlineLockupSvg`, `emailLogoHeaderHtml`

### `lib/brand/logo-paths.ts` — 38 lignes

* NomosX brand geometry — extracted from Barlow Semi Condensed SemiBold (OFL). * Shared by NomosXLogo (React) and logo-inline (HTML emails / briefs).

**Exports :** `LOGO_ACCENT_COLOR`, `LOGO_GLYPHS`, `LOGO_LAYOUT`, `logoHeightFromCap`, `symbolSvgSize`

### `lib/brand/public-copy.ts` — 85 lignes

Shared public-facing brand strings — single source for NomosX DA v2

**Exports :** `BRAND_NAME`, `BRAND_POSITIONING`, `BRAND_TITLE`, `BRAND_TAGLINE`, `BRAND_SHORT`, `BRAND_HERO_SUBTITLE_SHORT`, `BRAND_DESCRIPTION`, `BRAND_OG_DESCRIPTION`, `BRAND_MANIFEST_DESCRIPTION`, `BRAND_HERO_TITLE`, `BRAND_HERO_SUBTITLE`, `BRAND_HERO_DETAIL`, `BRAND_MANIFESTO`, `BRAND_MISSION`, `NOMOS_PHILOSOPHY_PILLARS`

### `lib/brand/public-ui.ts` — 39 lignes

* NomosX public surface — SpaceX-like monochrome tokens. * Import in public pages/components for consistent typography & controls.

**Exports :** `nx`

### `lib/brand/reasoning-lenses.ts` — 64 lignes

* Public reasoning lenses — domain analytical models backed by named * NomosX desk identities (Greek canon, never fabricated human credentials). * Derived from the canonical registry in lib/researchers.ts.

**Exports :** `ReasoningLens`, `getReasoningLenses`, `REASONING_LENS_COUNT`

### `lib/brand/researcher-portraits.ts` — 217 lignes

* Council desk portraits — each NomosX desk is embodied by a patron * mythological figure, rendered as a rediscovered fresco portrait * (same DA as publication heroes: obsidian ground, mineral pigments, * luminous machine filaments). * * `visualDna` is the LOCKED description of the figure — it is reused * verbatim in every generation so the desk's face stays consistent * across regenerations (the "Elements" pattern: identity first, scene second). * * `filamentMotif` is the desk's signature of ma

**Exports :** `DeskPortrait`, `DESK_PORTRAITS`, `getDeskPortrait`, `deskPortraitUrl`

### `lib/brand/thinking-lenses.ts` — 83 lignes

* The nine thinking lenses — public, display-safe copy for the landing prism. * Distilled from lib/agent/lenses/lens-knowledge.ts (the operational personas). * Pure data: no pipeline imports — safe to bundle on the client.

**Exports :** `ThinkingLens`, `THINKING_LENSES`

### `lib/cache/redis-cache.ts` — 124 lignes

* Redis Cache Service * Provides caching for embeddings, LLM responses, and API calls * P1-FIX: Delegates to simpleRedisManager (single connection, no duplication)

**Exports :** `cacheEmbedding`, `getCachedEmbedding`, `cacheLLMResponse`, `getCachedLLMResponse`, `cacheAPIResponse`, `getCachedAPIResponse`, `invalidateCacheByPattern`, `getCacheStats`, `closeRedisConnection`

### `lib/db.ts` — 148 lignes

* P1 FIX: Ensure connection pooling params for Neon serverless Postgres. * Appends pgbouncer=true&connection_limit=5 if not already present.

**Exports :** `prisma`, `withDbRetry`

### `lib/domains.ts` — 243 lignes

* Domaines prédéfinis pour la classification des sources

**Exports :** `Domain`, `PREDEFINED_DOMAINS`, `getDomainBySlug`, `getDomainsBySlugs`

### `lib/email.ts` — 579 lignes

* NomosX Email Service — Resend * Central email utility for all transactional emails. * Requires: RESEND_API_KEY, EMAIL_FROM env vars. * * Features: * - Premium dark mode design * - Optimized preheaders for email clients * - UTM tracking on all links * - Responsive layout

**Exports :** `sendWelcomeEmail`, `sendNewsletterConfirmation`, `sendNewsletterWelcome`, `sendBulkNewsletter`, `sendBriefPublishedNotification`, `sendTrialExpiryReminder`, `sendEmailVerificationEmail`, `sendTrialExpired`, `sendBriefReadyNotification`, `sendPasswordResetEmail`, `sendDigestEmail`, `sendContactEmail`

### `lib/email/index.ts` — 277 lignes

* Email Service * * Abstraction layer for email sending. * Supports multiple providers: Resend, SendGrid, etc. * * Configure via environment variables: * - EMAIL_PROVIDER: "resend" | "sendgrid" | "console" (default for dev) * - RESEND_API_KEY: API key for Resend * - SENDGRID_API_KEY: API key for SendGrid * - EMAIL_FROM: Default sender email

**Exports :** `EmailOptions`, `EmailResult`, `sendEmail`, `sendBulkNewsletter`, `sendDigestEmail`, `sendWelcomeEmail`

### `lib/export/print-document.ts` — 116 lignes

* Shared print-document builder for article exports (HTML download, PDF). * * Applies the NomosX editorial DA to a publication body: engraved-lockup * header, mythological domain cover with artwork credit, format/domain * meta line, APA citation block, print stylesheet. Same chrome as the * inquiry page, flattened into one standalone HTML document.

**Exports :** `PrintDocumentInput`, `buildPrintDocument`

### `lib/export/report-workbook.ts` — 276 lignes

* EXPORT — Excel workbook & CSV builders for publications * * Produces analyst-grade deliverables: * - XLSX: Report metadata + analysis text + source register + claims + predictions + model results (QUANT BRIDGE) * - CSV: source register alone (interoperable with any tooling) * * Used by /api/articles/[id]/export/data — turns a NomosX publication * into a reusable evidence file for tenders and downstream analysis.

**Exports :** `ExportSource`, `ExportClaim`, `ExportPrediction`, `ReportExportData`, `buildReportWorkbook`, `buildSourcesCSV`

### `lib/formatters/title-formatter.ts` — 296 lignes

* Title Formatter - LawZero Style Standardization * Implements [Concept]: [Subtitle] format for all NomosX publications

**Exports :** `TitleFormatOptions`, `formatTitle`, `validateTitleFormat`, `parseTitle`, `generateTitleSuggestions`, `batchFormatTitles`, `scoreTitleQuality`

### `lib/free-run.ts` — 33 lignes

* NOMOSX_FREE_RUN=1 — zero-cost rehearsal mode. * * A full think-tank cycle exercises the orchestration (scout fan-out, durable * checkpoints, reclaim/resume, budgets, gates) without spending a cent: * - unified-llm routes every call to the freepool cascade ($0) * - the scout drops providers that meter paid API credits * - embeddings are skipped (OpenAI/Cohere bill per token) * - the dispatcher clamps maxPublications to 1 * * Reads process.env directly so tests can toggle the flag per case.

**Exports :** `isFreeRun`, `PAID_SCOUT_PROVIDERS`, `filterFreeRunProviders`

### `lib/generators/format-generator.ts` — 536 lignes

* Format Generator - Generate templates and content for NomosX formats * Creates structured templates based on format specifications

**Exports :** `FormatTemplate`, `SectionTemplate`, `ValidationRules`, `GeneratedContent`, `ContentMetadata`, `SectionMetadata`, `generateFormatTemplate`, `generateAllFormatTemplates`, `generateContent`

### `lib/http-client.ts` — 1132 lignes

* Production-grade HTTP client with: * - Configurable timeout * - Exponential backoff retry * - Per-provider rate limiting * - Request/response logging * - Graceful error handling

**Exports :** `withHttpBudgetLane`, `getHttpInflightStats`, `isHttpBudgetExhausted`, `HttpOptions`, `RateLimitConfig`, `getRateLimiter`, `setRateLimiter`, `isCircuitBreakerTripped`, `isCircuitBreakerTrippedAsync`, `getCircuitBreakerStats`, `HttpError`, `readBoundedText`, `getHttpCacheStats`, `httpGet`, `httpPost`

### `lib/inquiry-mapper.ts` — 69 lignes

Per-publication commissioned artwork (generated hero image).

**Exports :** `BriefLike`, `inferInquiryDepth`, `mapBriefToInquiryCard`, `mapBriefToInquiryWithMeta`

### `lib/json-safe.ts` — 46 lignes

* Postgres-safe JSON serialization for Prisma Json/Text columns. * * LLM output can contain literal NUL (\u0000) and other C0 control * characters. JSON.stringify escapes them (\u0000), but Postgres jsonb * rejects the escaped form too ("\u0000 ne peut pas être converti en * texte"), so a run that completed analytically dies at persistence — * observed live on the ai-relationships-china record (brief.create 22P05). * * toJsonSafe() performs the same JSON round-trip as the previous * JSON.parse(J

**Exports :** `stripPgUnsafeControls`, `toJsonSafe`

### `lib/public-urls.ts` — 37 lignes

Canonical public routes (DA + IA unifiées)

**Exports :** `PUBLIC_ROUTES`, `absoluteUrl`, `inquiryUrl`, `archivesUrl`, `archivesDomainUrl`

### `lib/publication-formats.ts` — 117 lignes

* NomosX Publication Formats — aligned 1:1 with Inquiry depths and Engine pricing. * * Signal Brief → depth "surface" → 39 € * Decision Memo → depth "standard" → 99 € * Article → depth "deep" → 199 € * Strategic Report → depth "strategic" → 699 € * * Legacy aliases (RESEARCH_BRIEF, EXECUTIVE_BRIEF, UPDATE_NOTE, DATA_NOTE, * POLICY_NOTE, DOSSIER) are kept for DB backward-compat and mapped via * resolveFormatType() to one of the 4 canonical formats.

**Exports :** `PUBLICATION_FORMATS`, `PublicationFormatType`, `PublicationFormatFamily`, `FORMAT_FILTERS`, `PUBLICATION_FORMAT_BY_TYPE`, `FORMAT_TYPES_BY_FAMILY`, `resolveFormatType`, `getPublicationFormat`, `getPublicationFormatLabel`

### `lib/publication-visibility.ts` — 285 lignes

* Publication quality rules — UNIFORM QUALITY BAR across all formats. * * The difference between formats is ANGLE and LENGTH, not quality. * A Signal Brief is held to the SAME trust/quality standard as a Strategic Report. * What varies is only the minimum word count and source count (format length). * * minTrustScore: 65 for ALL formats (same credibility bar) * minQualityScore: 70 for ALL formats (same analytical rigor) * minCitationCoverage: 50% for ALL formats (same evidence standard) * minWor

**Exports :** `PUBLIC_PUBLICATION_MINIMUMS`, `PublicationQualityRule`, `PUBLICATION_QUALITY_RULES`, `DEFAULT_PUBLICATION_QUALITY_RULE`, `getPublicationQualityRule`, `getAdaptiveMinSourceCount`, `evaluatePublicationReadiness`, `publicPublicationWhere`, `isPublicPublicationEligible`

### `lib/redis.ts` — 170 lignes

* Redis client with fallback for development * Uses Upstash Redis in production, local Redis in development

**Exports :** `redis`, `cacheHelpers`

### `lib/researchers.ts` — 1162 lignes

* NomosX AI Researchers — The Council (Phase 3 - 20+ PhDs) * * Single source of truth for all 20+ PhD-level AI researchers. * Used across the entire app: publications (author), landing page, methodology, etc. * * Phase 3 Expansion: Advanced specialization for comprehensive coverage * Each researcher is a specialized domain expert with: * - A real-sounding academic identity * - A specific analytical framework * - A signature color for UI consistency * - Institutional credibility * - Advanced spec

**Exports :** `Researcher`, `RESEARCHERS`, `SUB_LENS_IDENTITIES`, `getResearcher`, `getDeskName`, `DESK_FOR_DOMAIN`, `getResearcherForDomain`, `getDomainForDesk`, `getLeadResearcher`, `getResearchersByTier`, `getResearcherCount`, `getResearchersByCategory`, `getResearchersByField`, `getTopResearchersByCitations`, `getResearchersByInstitution`

### `lib/score.ts` — 160 lignes

* Novelty scoring: prioritize recent, under-cited, and emerging research

**Exports :** `scoreSource`, `scoreNovelty`

### `lib/stripe.ts` — 154 lignes

* Stripe Integration — NomosX StudioX Payments * * Pay-per-commission checkout and webhook handling for StudioX orders. * Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. * * If STRIPE_SECRET_KEY is not set, all functions gracefully return errors * without crashing.

**Exports :** `handleWebhookEvent`, `createStudioXCheckoutSession`, `isStripeConfigured`

### `lib/text.ts` — 7 lignes

_(no docstring — voir le code source)_

**Exports :** `clamp`, `invertedIndexToText`

### `lib/twitter/client.ts` — 142 lignes

* Twitter/X API v2 client — OAuth 1.0a for posting tweets. * * Uses the Twitter API v2 POST /2/tweets endpoint with OAuth 1.0a User Context. * Required env vars: * TWITTER_API_KEY * TWITTER_API_SECRET * TWITTER_ACCESS_TOKEN * TWITTER_ACCESS_TOKEN_SECRET * * The Basic tier ($100/mo) allows 3,000 tweets/month via this endpoint. * Free tier does NOT allow posting — only read.

**Exports :** `TweetResult`, `postTweet`, `isTwitterConfigured`

### `lib/twitter/tweet-generator.ts` — 241 lignes

* Tweet generator — LLM-powered teasing for NomosX publications. * * Instead of a generic "New article: [title] [link]", this generates * a stylized, professional tweet that hooks the reader. * * Styles are rotated to avoid repetition: * - question : provocative question from the analysis * - insight : key finding with a surprising angle * - contradiction: highlights a debate/tension * - number : striking statistic from the report * - thread : for strategic reports, a 3-tweet thread

**Exports :** `generateTweet`

### `lib/types/inquiry.ts` — 242 lignes

* Inquiry — The single canonical publication format of NomosX * ───────────────────────────────────────────────────────────── * Every automated research output is an Inquiry, regardless of depth. * Depth is expressed via sections present, not via a separate format. * * Depth levels: * • surface → summary + verdict only (tweet-length signal) * • standard → summary + debate + evidence + verdict (default brief) * • deep → + literature review + thematic analysis + stakeholder matrix * • strategic → 

**Exports :** `InquiryDepth`, `InquiryStatus`, `ProbabilisticVerdict`, `InquirySource`, `InquirySectionSummary`, `InquirySectionDebate`, `InquirySectionEvidence`, `InquirySectionLiterature`, `InquirySectionThematic`, `InquirySectionStakeholders`, `InquirySectionScenarios`, `InquirySectionImplementation`, `InquirySectionSimulation`, `InquirySection`, `Inquiry`

### `lib/utils.ts` — 153 lignes

* Utils - NomosX utility functions

**Exports :** `cn`, `formatDate`, `formatPrice`, `slugify`, `isValidEmail`, `truncateText`, `calculateReadingTime`, `generateRandomColor`, `debounce`, `isEmpty`, `deepClone`, `generateId`, `delay`, `isValidUrl`, `formatNumber`

### `lib/word-counter.ts` — 348 lignes

* Word Counter and Validation System * Accurate word counting with format-specific validation

**Exports :** `WordCountOptions`, `ValidationResult`, `SectionWordCount`, `countWords`, `validateWordCount`, `countWordsBySections`, `generateWordCountReport`, `batchValidateWordCount`, `estimateReadingTime`, `getWordCountStats`, `formatWordCount`


## Netlify scheduled functions — 11 modules

### `netlify/functions/cadence-reset.ts` — 42 lignes

* Netlify Scheduled Function — Cadence Reset * Schedule: Every day at 00:00 UTC * * Resets expired publication counters (daily + weekly). * Direct import — no HTTP call needed (pure DB operation).

**Exports :** `config`

### `netlify/functions/cron-auto-scan.ts` — 52 lignes

* Netlify Scheduled Function — Auto-Scan * Schedule: Every day at 06:00 and 18:00 UTC * Calls: POST /api/cron/auto-scan * * Runs twice daily to: * 1. Scout new academic sources per vertical * 2. Detect signals from new sources * 3. Analyze trends across corpus * 4. Detect contradictions * 5. Fetch live news intelligence (GDELT + NewsAPI + RSS think tanks)

**Exports :** `config`

### `netlify/functions/cron-editorial-plan.ts` — 43 lignes

* Netlify Scheduled Function — Editorial Planner * Schedule: Every Sunday at 20:00 UTC (before weekly pipeline) * Calls: POST /api/cron/editorial-plan

**Exports :** `config`

### `netlify/functions/cron-generate-briefs-midweek.ts` — 47 lignes

* Netlify Scheduled Function — Mid-Week Brief Generation * Schedule: Every Wednesday at 12:00 UTC * Calls: POST /api/cron/generate-briefs * * Catches urgent signals detected during the week that can't wait until Sunday.

**Exports :** `config`

### `netlify/functions/cron-generate-briefs.ts` — 43 lignes

* Netlify Scheduled Function — Generate Briefs * Schedule: Every Sunday at 22:00 UTC (after editorial plan) * Calls: POST /api/cron/generate-briefs

**Exports :** `config`

### `netlify/functions/cron-macro-refresh.ts` — 45 lignes

* Netlify Scheduled Function — Macro Data Refresh * Schedule: Every Monday at 05:00 UTC (before auto-scan) * Calls: POST /api/cron/macro-refresh * * Refreshes Eurostat, ECB, INSEE macro series for data-driven analysis.

**Exports :** `config`

### `netlify/functions/cron-newsletter.ts` — 43 lignes

* Netlify Scheduled Function — Weekly Newsletter * Schedule: Every Monday at 08:00 UTC * Calls: POST /api/cron/newsletter

**Exports :** `config`

### `netlify/functions/cron-self-improve.ts` — 42 lignes

* Netlify Scheduled Function — Self-Improvement (Prediction Auditor + Source Reputation) * Schedule: Every day at 03:00 UTC * Calls: GET /api/cron/self-improve

**Exports :** `config`

### `netlify/functions/cron-studiox-drain.ts` — 44 lignes

* Netlify Scheduled Function — StudioX order drainer * Schedule: every 5 minutes * Calls: POST /api/cron/studiox-drain

**Exports :** `config`

### `netlify/functions/cron-tweet-publications.ts` — 58 lignes

* Netlify Scheduled Function — Auto-Tweet Publications * Schedule: Every 30 minutes * Calls: POST /api/cron/tweet-publications * * Finds newly published articles that haven't been tweeted yet, * generates a stylized teasing tweet via LLM, and posts to Twitter/X. * * Requires Twitter API credentials (Basic tier $100/mo): * TWITTER_API_KEY, TWITTER_API_SECRET, * TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET

**Exports :** `config`

### `netlify/functions/studiox-run-pipeline-background.ts` — 43 lignes

* Netlify Background Function — StudioX Pipeline Runner * Runs up to 15 minutes. Invoked fire-and-forget after Stripe payment. * * POST body: { orderId: string } * Auth: Bearer $CRON_SECRET

**Exports :** `—`


---

# PARTIE III — AUDIT FORENSIQUE : CHEMIN PROSPECTIF, SORTIES RÉELLES, TERRAINS

> Ajout post-inventaire. Chaque affirmation ci-dessous est adossée à une lecture
> de code (fichier:ligne) ou à une requête Prisma sur la base de production.
> Quand la donnée n'existe pas, c'est dit explicitement — jamais déduit.

---

## III.1 Le code du chemin prospectif — ce qui fait bouger les « 512 agents »

### Réponse courte

**Les 512 agents de la foule (crowd) ne font aucun appel LLM.** Ce sont des
agents numériques purement déterministes. Les seuls appels LLM du chemin
prospectif sont : (a) la construction du panneau de personas parties prenantes,
(b) les ticks de personas par batch borné, (c) le red team adversarial, et
(d) l'arbitre éditorial qui *génère* les scénarios en amont. Le Monte Carlo et
la propagation de la foule sont du calcul numérique seedé.

### Détail par fichier

#### `lib/agent/foresight-swarm.ts` (121 lignes) — la foule, 100 % numérique

- `spawnCrowd(count, leaders, scenarioNames, seed)` : `mulberry32(seed)` — RNG
  déterministe. Chaque agent reçoit des positions initiales =
  `0.65 * rand() normalisé + 0.35 * position du leader de son cluster`, plus
  `activity ∈ [0.2, 1.0]` et `susceptibility ∈ [0.15, 0.6]`, tous deux tirés du
  même RNG seedé. **Zéro LLM, zéro source, zéro horloge** — même seed ⇒ même
  foule à l'identique.
- `propagateCrowd(crowd, leaders, viralBoost, names, alpha=0.12)` : à chaque
  tick, chaque agent relaxe vers `0.5*leader + 0.3*self + 0.2*viral*susceptibility`
  avec `alpha=0.12`, puis renormalise. Retourne le nombre de « shifts »
  (déplacements > 0.03) — critère de convergence.
- `aggregateCrowdMomentum` : momentum = moyenne des positions pondérée par
  `activity`, normalisée par `crowd.length * 0.55`.
- `syncLeadersFromCrowd(weight=0.25)` : les leaders absorbent 25 % de la moyenne
  de leur cluster à chaque tick — boucle de rétroaction leader↔foule.

#### `lib/agent/simulation-agent.ts` (1474 lignes) — le moteur

Structure réelle (ordre d'exécution dans `simulationAgent`) :

1. **`loadSourceEvidence(sourceIds)`** (l.321) — lit les ≤30 meilleures sources
   en base (`qualityScore desc`), extrait titre + 400 premiers caractères de
   l'abstract. **Paramètres tirés des sources : oui, mais seulement comme
   texte d'overlap et comme moyenne de `qualityScore`.**
2. **`buildPersonaPanel`** (l.613) — **appel LLM** (`swarm_persona`, GLM fast,
   30 s). Génère les personas parties prenantes (fonctions
   `StakeholderPersona`, archétypes `PersonaArchetype`). C'est le seul endroit
   où un modèle « incarne » les acteurs.
3. **`buildSourceGraph`** (l.342) — pour chaque scénario, `overlapScore` =
   similarité lexicale (tokens en commun) entre `name + description` du
   scénario et l'extrait source, pondérée par `qualityScore/100`. Garde le top 5
   par score > 0.05 → `sourceBoost`.
4. **`calibrateFromSources`** (l.363) — met à l'échelle TOUS les paramètres par
   `0.82 + 0.18 * (avgQuality/100)` et réduit `uncertainty` de
   `×(1.1 − 0.4*weight)`. Sources de meilleure qualité ⇒ paramètres légèrement
   plus « confiants ».
5. **`defaultParameters`** (l.404) — `{momentum:0.5, uncertainty:0.3,
   adoption:0.5, scenario_i_weight: priorProbability}`. Ce sont les **seules
   constantes** du moteur ; tout le reste dérive des entrées.
6. **`inferAssumptions`** (l.384) — si le scénario n'apporte pas
   `assumptions` explicites, elles sont **fabriquées depuis le prior**
   (`prior * (0.8 + 0.4*i/(n+1))`). Le commentaire l.442-446 documente le
   piège corrigé : ces assumptions synthétiques contribuent une evidence
   **neutre** (sinon double-comptage du prior → collapse ~100/0).
7. **Monte Carlo** (`runMonteCarloCore` l.469+, `sampleGamma` l.416
   Marsaglia–Tsang, `scenarioEvidenceWeight` l.448) — par run : tirage
   Dirichlet de priors, perturbation des paramètres par `paramUncertainty`,
   poids = `exp(-mismatch) * (1 + sourceBoost*0.15)`. `empiricalProbability`
   = fréquence observée ; `bootstrapConfidenceIntervals` (l.582) ;
   `computeSensitivityMatrix` (l.552) ; convergence via `ConvergenceResult`.
8. **Ticks LLM bornés** — `runLLMTickBatch` (l.731) et
   `runAdversarialRedTeam` (l.817) : appels `callLLM` groupés, les personas
   « parlent »/« réagissent »/« changent de position ».
9. **`computeScenarioStatesWithSwarm`** (l.854) — état final d'un scénario =
   `0.35 * leaderStates + 0.55 * crowdMomentum + terme red-team`. C'est la
   fusion des trois canaux : personas LLM, foule numérique, adversaire LLM.

### Répartition honnête des influences

| Mécanisme | Type | Poids dans le résultat |
|---|---|---|
| Priors `probability` des scénarios (écrits par l'arbitre LLM ou fallback 50/30/20) | LLM en amont, numérique ensuite | **Domine** — base du Dirichlet |
| `sourceBoost` (overlap lexical × qualityScore) | Paramètre extrait des sources | Modificateur ±15 % max par scénario (`boostFactor = 1 + boost*0.15`) |
| `calibrateFromSources` (avg qualityScore) | Paramètre extrait des sources | ±18 % sur les paramètres, borne `uncertainty` |
| Personagens LLM (panel + ticks + red team) | Appels LLM | Canal « voix » : positions des leaders |
| Foule 512 | Numérique seedé | 55 % du mélange final de momentum |
| Constantes | Numériques | momentum .5, uncertainty .3, adoption .5, alpha .12, poids .35/.55 |

**Conclusion dev** : les probabilités publiées (`empiricalProbability`) sont
principalement une **re-normalisation Monte Carlo des priors fournis par
l'arbitre**, modulée à la marge par la qualité/overlap des sources. La «
simulation » n'invente pas de probabilités à partir des sources — elle les
échantillonne autour des priors. La chaîne `chain-probability.ts` (LOT 4.2-4.8)
est le seul endroit où des données sources (méta-analyse, I², sourceCount)
produisent des distributions de priors *réellement* source-groundées — avec
`verifyDerivedQuantity` (l.64) qui vérifie déterministement qu'une valeur
calculée apparaît dans le texte source (`exact_match`/`range_check`/`unit_check`).

---

## III.2 L'entrée réelle du swarm aujourd'hui

**Le swarm ne reçoit jamais la chaîne causale brute.** Chemin réel :

```
analyst-multipass → analysis.causalChain (liens typés)
        │
        ▼  (résumé textuel, 5 premiers liens max)
editorialArbiter (LLM, gpt-6-astra) ── prompt inclut "CAUSAL CHAIN SUMMARY"
        │        (editorial-arbiter.ts l.225-226)
        ▼  produit InstitutePosition.scenarios[] (nom, probabilité, narratif)
runArbiterForesight (pipeline-steps/arbiter-foresight.ts l.87-104)
        │  injecte ces scénarios dans un analysis synthétique
        ▼
runPipelineForesight (pipeline-foresight.ts l.134-147)
        │  mappe {name, description, assumptions, priorProbability, signals}
        ▼
simulationAgent(question, simInput, {domain, sourceIds, depth})
```

Donc : **scénarios synthétisés par l'arbitre LLM à partir de** (a) la chaîne
causale résumée, (b) le débat dominant/contre, (c) ≤12 sources (titre/année/
provider), (d) le manifesto éditorial et le style guide. Le scénario central
**porte donc sur le sujet réel** — mais c'est une synthèse de second ordre :
le modèle reformule la chaîne causale en futurs narratifs, il ne propage pas
mécaniquement les liens causaux.

### Le fallback qui dégrade tout

Si l'analyste n'émet pas ≥2 scénarios, `ensureEditorialScenarios`
(`editorial-scenarios.ts` l.23-74) **fabrique** Base 50 % / Adverse 30 % /
Accelerated 20 %, descriptions = les 420 premiers caractères de
`consensus`/`disagreements`/`implications`. Probabilités **fixes**, non
calculées. Si l'arbitre échoue, `buildFallbackPosition`
(`editorial-arbiter.ts` l.58-95) fait de même (50/30). Conséquence : sur les
runs où l'arbitre ou l'analyste dégradent, les « probabilités » publiées sont
des constantes de gabarit — c'est le canal n°1 de scénarios/probas génériques.

Garde-fous amont : foresight skippé si `< 2` scénarios ou `< 10` sources
(`arbiter-foresight.ts` l.78-83) ; skippé si `isForesightEnabled()` faux ;
`skipGapFillRetrieval` forcé en record/replay.

---

## III.3 Règle de sélection : « le plus pertinent et probable »

Tout est dans `resolveCentralScenario` (`editorial-types.ts` l.127-166) :

1. **Choix éditorial d'abord.** L'arbitre LLM doit renvoyer
   `dominantScenario` = nom **exact** (après normalisation casse/espaces) d'un
   de ses scénarios, + `centralScenarioRationale` avec citations [SRC-N]
   obligatoire. Un match partiel (« Stagflation trap » vs « …in Europe ») est
   **refusé** et dégrade en `probability_fallback` — le gate signale alors
   « requires an explicit editorial choice ». Pas de matching flou.
2. **Fallback probabiliste.** Sinon : filtre `!isWildcard && probability ≥ 0`,
   tri par `probability(b) − probability(a)` décroissant, prend `candidates[0]`.
   `probability()` préfère `calibratedProbability` (0-1) sinon parse
   `"NN%"`. **`Array.sort` JS est stable ⇒ ex æquo = ordre de déclaration des
   scénarios par l'arbitre.** Il n'y a **pas de tie-break explicite** — deux
   scénarios à probabilité égale sont départagés par leur position dans le
   JSON de l'arbitre, ce qui est déterministe à prompt égal mais arbitraire
   sur le fond.
3. **Le Monte Carlo n'élit pas.** `simulation[]` sert seulement à calculer
   `simulationLeader` et `simulationDisagrees` (l.163-164) : si le leader
   empirique diffère du choix éditorial, c'est **flaggé** et visible par le
   gate — la divergence n'est jamais silencieuse.
4. Sortie : `CentralScenarioDecision { name, description, rationale, horizon,
   implications, revisionTriggers, confidence, selectedBy:
   'editorial'|'probability_fallback', simulationLeader, simulationDisagrees }`
   persisté dans `stats.centralScenario` → metadata brief.

**Ensemble ou central ?** Un seul scénario central est retenu pour le rendu ;
les autres restent dans `scenarios[]` avec leurs `empiricalProbability` et
`confidenceInterval` (`applySimulationToAnalysis`, `pipeline-foresight.ts`
l.59-75 — pourcentages arrondis par **largest remainder** pour sommer à 100).

---

## III.4 Sorties réelles

### Publications publiées (table `Brief`, `publishedAt != null`)

21 publiées sur 155 briefs. Les 4 plus récentes :

| Brief ID | Kind | Trust | Quality | Objet |
|---|---|---|---|---|
| `cmubo8gv10118bahnldoa20hl` | brief | 62 | 65 | Sanctions, patronage & capture réglementaire — inversion de la pression financière coercitive |
| `cmubm35an01gzy6hyad2ruzou` | brief | 71 | 64 | Sommet-diplomatie, interdépendance & bargaining US-Chine |
| `cmtyem5j1011m13mpb400c2sz` | strategic | 78 | 56 | Supply-chain IA + CBAM — reconfiguration commerciale 2026 |
| `cmtycmu0t01ivjxfaiyeoua4o` | strategic | 73 | 50 | idem (itération antérieure) |
| `cmt7oxk9r02xc6sj15ee3x12o` | strategic | 77 | 66 | Stablecoins & paiements transfrontaliers |

Côté `ThinkTankPublication` (table séparée) : **21 PUBLISHED / 46 HELD /
2 DRAFT**. Exemples HELD récents (2026-11-10) : « China's economic and
diplomatic strategy challenging USD dominance » (`cmwb7ozpw…`),
« Dollar Erosion Dynamics » (`cmwb5410g…`).

### Run persisté exemple (non publié)

`PipelineRun aac8500c-056a-40ad-967c-345fe0e85a7c` — status `COMPLETED`,
**$0.0674, 737 493 ms (~12 min)**, brief `cmwb7onp305ea10aozypgt0in`
(pipelineRun.steps complet persisté, 55 clés de stats). `phaseTimings` :
`{scout:80, critic:722227, reader:114831, render:722300, analyst:581045,
rankGates:11664, indexEnrich:91}` — **attention : ces valeurs sont des
marqueurs de fenêtre cumulés, pas des durées de phase** (critic≈render
suggère des bornes de début/fin, pas des deltas ; ne pas les lire comme des
coûts temps réel). `steps.foresight`/`editorialArbiter` absents sur ce run —
c'est un run `brief` plus ancien sans la chaîne V2 complète ; les runs
`strategic`/inquiry récents portent `editorialArbiter`, `foresight`,
`centralScenario` dans `stats`.

**Limite honnête** : `ThinkTankPublicationRun` contient **0 ligne** — le lien
publication↔run n'est pas peuplé par cette table ; la jointure se fait via
`Brief.pipelineRunId` ou `metadata.pipelineRunId`. Le `PipelineRun.steps`
complet d'un run HELD récent n'a pas pu être extrait proprement faute de ce
lien ; les champs disponibles sont documentés ci-dessus.

---

## III.5 Track record des prédictions — la vérité terrain

Requête Prisma directe sur `Prediction` :

- **813 prédictions enregistrées** (2026-08-14 → 2026-11-10)
- **0 résolues** — `status` = `OPEN` pour les 813, `resolvedAt` null partout
- **Brier : non calculable.** Aucun outcome n'existe.

Les enregistrements sont des claims auto-générés accrochés aux briefs
(ex. « surprise: A black swan event: a cyberattack on US nuclear command
and control… » avec `horizon`, `probability`, `whatWouldFalsify`).

### III.5.b Verdict corrigé — la boucle de résolution EXISTE

Vérification demandée : « l'auditeur lirait `AgentAuditLog` alors que
l'enregistrement écrit dans `Prediction` » — **hypothèse réfutée**.

- `resolveDuePredictions` (`prediction-tracker.ts` l.207+) lit
  `prisma.prediction` — **la même table** que `prediction-registration.ts`.
  Aucun lien avec `AgentAuditLog`.
- Le resolver est **câblé et actif** : `durable-worker.ts` l.422 appelle
  `resolveDuePredictions(5)` à chaque sweep (commentaire : « closes the
  prospective-learning loop that was dead code (813 OPEN / 0 resolved
  live) »). ~5 résolutions/sweep, verdict LLM borné `fact_check`, Brier
  écrit dans `resolutionNotes`, statuts `CONFIRMED`/`REFUTED`/`EXPIRED`.
- `parseHorizonDue` (l.141-174) a été **patché** : l'ancien code ne
  matchait que les littéraux `30d/90d/365d/long-term` — les horizons
  calendaires n'étaient jamais éligibles. Le parseur actuel couvre
  `Nd`, `long-term`, `N years`, `YYYY`, `YYYY-YYYY` (→ milieu de range),
  `YYYY-Qn`, `calLoose`.

**Cause réelle des 0 résolutions : aucune prédiction n'est échue.**
Rejeu du parseur sur les 813 lignes : 790 horizons parsables, **0 dues** —
l'échéance la plus proche est **2028-07-01**. Les horizons enregistrés
sont massivement « 2026-2030 » (→ Jul 2030), « 5-10 years », « 2026-2035 ».
Les prédictions ont été créées août→nov 2026 avec des horizons pluriannuels
: le système est correct, il n'a simplement pas encore atteint sa première
échéance.

**Résidu réel (bug confirmé, mineur)** : 23 horizons en prose
(« We look to 2030 because three independent cycles… ») retournent `null`
→ jamais dues automatiquement, OPEN à perpétuité — fail-closed assumé par
design, mais ces lignes ne se résoudront jamais sans intervention manuelle.
Recommandation : soit extraire le « 2030 » de ces prose-horizons, soit
leur assigner un horizon par défaut à l'enregistrement.

### III.5.c Conséquence corrigée pour le diagnostic

Le problème n'est plus « boucle absente » mais **(a)** pas de donnée de
résolution avant 2028 — la calibration prospectif est structurellement
non mesurable à court terme ; **(b)** 3 % de prédictions orphelines ;
**(c)** même une fois résolues, `generateCalibrationReport` devra être
vérifié pour boucler vers les prompts (aujourd'hui `context-primer` lit
-il bien ces scores ? à auditer).

---

## III.6 Répartition des échecs — 231 PipelineRun + ThinkTankQualityCheck

### PipelineRun (231 derniers)

`status` : **155 COMPLETED / 76 FAILED** — pas de statut `HELD` à ce niveau
(HELD vit sur `ThinkTankPublication`). `steps.qualityGate` = « diagnostic
only — no agents skipped » : **le détail des checks du publication-gate
n'est PAS persisté dans PipelineRun.steps** — il est calculé dans
`inquiry-orchestrator.assess()` (`evaluatePublicationGate`,
`publication-gate.ts` l.110+) et persisté côté publication, pas côté run.

### ThinkTankQualityCheck (persistance réelle des checks)

Agrégat par `checkType × passed`, scopé par statut de la publication :

| CheckType | HELD fail | HELD pass | PUBLISHED fail | PUBLISHED pass |
|---|---|---|---|---|
| THRESHOLD | **78** | 14 | 7 | 33 |
| CALIBRATION | **46** | 0 | 9 | 11 |
| ADVERSARIAL | **37** | 0 | 6 | 0 |
| CITATION | 2 | 44 | 0 | 20 |
| METHODOLOGY | 0 | 0 | 0 | 0 |

Détail type d'un échec : `{"detail":"Trust score 40 (min 65)",
"checkName":"trust_score","threshold":65}` — le check THRESHOLD est dominé par
le plancher de trust score. **Sur les HELD, CALIBRATION et ADVERSARIAL
n'ont jamais passé** (0 pass) — ces deux familles sont structurellement les
points de blocage. Les PUBLISHED gardent des checks en échec (THRESHOLD 7,
CALIBRATION 9, ADVERSARIAL 6) : les checks sont des **signaux** agrégés par la
décision finale, pas des veto unitaire — à documenter comme tel pour éviter
toute lecture « check fail ⇒ pas publié ».

Multi-échec : oui, une publication accumule plusieurs checks (46 HELD ont au
moins un CALIBRATION fail, etc.).

---

## III.7 Temps et coût par étape + TASK_ASSIGNMENT

### Où c'est enregistré

- `PipelineRun.totalCostUsd`, `totalTokensIn/Out`, `durationMs` (colonnes).
- Par étape : `steps.<etape>.costUsd` / `durationMs` quand le module les
  expose (ex. `steps.critic.costUsd=0.0114, durationMs=91355` observé),
  `steps.phaseTimings` (marqueurs de fenêtre — voir III.4, sémantique
  ambiguë), `stats.foresight.costUsd`, `stats.editorialArbiter.costUsd`,
  `addCost(usd, step)` agrège dans le total.
- **`CostLog` : table créée mais 0 ligne** — l'instrumentation coût par
  opération/provider (`operation`, `provider`, `model`, `tokens*`,
  `costUsd`) existe dans le schéma mais n'est pas alimentée. Les coûts réels
  ne sont donc traçables qu'au niveau run/étape, pas au niveau appel LLM
  unitaire (sauf cassette record).

### TASK_ASSIGNMENT (`lib/llm/unified-llm.ts` l.224+)

Table unique tâche→{provider, model, timeoutMs} :

| Classe | Tâches | Provider/Modèle |
|---|---|---|
| Rapide/bas | query_enhancement, topic_classification, casting, editor_in_chief, swarm_persona, studiox, enrichment_reasoner, preflight_semantic_check, query_reformulation, delphi_round1/2, cross_impact, translation, verbatim… | `glm` / GLM_FAST (30-60 s) |
| Extraction/vérif | fact_check, citation_verification | `google` / `gemini-3.8-flash` (60 s) — « best measured groundedness » ; sans GOOGLE_API_KEY la règle opposite-family reroute kimi↔glm |
| Lourd analyse | reader_v3, strategic_analyst, harvard_council, elenchus, analyst_brief, auto_revision, editorial_arbiter, meta_analysis, structural_editor, primary_data_synthesis, stress_test | `openai` / OPENAI_REASONING / `gpt-6-astra` pour l'arbiter (90-600 s) |

Fallback : cross-family Kimi K3 ↔ GPT-6-Astra, puis DeepSeek/GLM/Google ;
circuit breaker 2 tiers (60 s cooldown, 24 h suspend) ; `LLM_PRE_SUSPENDED`
pour pré-suspendre (défaut : anthropic). **Distinction importante** :
TASK_ASSIGNMENT = routage *configuré* ; le provider *effectivement* utilisé
dépend des clés présentes, du circuit breaker et du fallback — à lire dans
les cassettes (`recordLlmCassette` tague provider/modèle par appel) pour le
par-run.

---

## III.8 AGENTS.md et AUDIT.md

Les deux fichiers **existent** dans le dépôt racine :

- `AGENTS.md` (~4 700 lignes) — spec complète du pipeline agentique :
  invariants evidence-boundary (thèse supportée, ≥2 documents distincts
  in-range, pas de double comptage ID/DOI/URL/titre, sources synthétiques
  exclues, matching par `sourceId`, inspection bornée à 25 sources, absence
  ≠ preuve, échec d'adhérence ≠ succès, screening des ajouts tardifs,
  gap-fill préservant les requêtes pending), historique des sprints 41-46,
  harness replay (`scripts/replay-run.ts`, `frozen-inputs.ts`, fixture
  `gulf-minerals.fixture.jsonl`), commandes de vérification.
- `AUDIT.md` — présent à la racine (document d'audit antérieur).

Tous deux doivent être ajoutés à la table des références de la Partie I.

---

## III.9 Diagnostic éditorial — « qu'est-ce qui est insuffisant ? »

Réponse calibrée sur les données de III.5-III.6, pas sur impression :

### Ce qui est mesurable automatiquement (déjà instrumenté)

| Défaut | Signal disponible | État |
|---|---|---|
| Scénarios/probas génériques | `selectedBy:'probability_fallback'` + `simulationDisagrees` dans `stats.centralScenario` ; présences de 50/30/20 fixes (`editorial-scenarios.ts`) | Instrumenté, non agrégé |
| Thèse banale | `thesisBinding` verdict + adherence hard-gate ; `originalityCheck` dans steps | Instrumenté |
| Preuve mince | check CITATION (78 % pass sur HELD — ce n'est PAS le bloquant principal) | Instrumenté |
| Confiance mal calibrée | check CALIBRATION : **0 pass sur 46 HELD** | Instrumenté, structurellement bloquant |
| Défaut adversarial | check ADVERSARIAL : **0 pass sur 46 HELD**, 6 fail sur 21 PUBLISHED | Instrumenté, structurellement bloquant |
| Plancher trust | check THRESHOLD : 78 fail sur HELD, dominant = `trust_score < 65` | Instrumenté |

### Ce qui exige un jugement éditorial humain

- **Originalité de la thèse** — aucun check ne mesure « ai-je déjà lu ça » ;
  `originalityCheck` porte sur le texte, pas sur la littérature.
- **Crédibilité des probabilités** — le système ne peut pas savoir qu'un
  « 35 % » est du gabarit tant que la boucle de résolution n'existe pas
  (III.5). **C'est le défaut le plus structurel** : sans Brier, aucune
  probabilité publiée n'est jamais validée ni recalibrée.
- **Style/lecture** — `styleGates`, `structuralEditor`, critic panel mesurent
  la forme ; le « sentiment de banalité » reste éditorial.
- **Utilité/actionnabilité** — `recommendations` exigées par le prompt de
  l'arbitre mais non scorées par un check dédié.

### Diagnostic argumenté

Sur la base des comptes : les HELD ne meurent **pas** faute de citations
(CITATION passe à 96 %) ni faute de seuil de preuve — ils meurent sur
**CALIBRATION (0/46 pass) et ADVERSARIAL (0/46 pass)**. Autrement dit, le
système produit des textes bien sourcés dont la *posture* (confiance affichée
vs solidité réelle, objections non traitées) est ce qui bloque. Et en amont,
les probabilités de scénarios sont majoritairement des **priors LLM**
échantillonnées par Monte Carlo, avec un fallback gabarit 50/30/20 quand la
chaîne dégrade — sans aucune validation ultérieure puisque les prédictions
ne sont jamais résolues. La correction la plus rentable n'est donc pas une
brique de style : c'est **(1) implémenter la boucle de résolution des
prédictions → Brier → recalibration**, et **(2) remonter le taux de
`selectedBy:'editorial'`** pour que le scénario central soit un choix
argumenté, pas un tri par probabilité.

---

*Fin de la Partie III. Sources : lecture directe des fichiers cités
(lignes indiquées) + requêtes Prisma sur la base de production au
2026-11 (tables `PipelineRun`, `Brief`, `ThinkTankPublication`,
`ThinkTankQualityCheck`, `Prediction`, `CostLog`,
`ThinkTankPublicationRun`).*

---

# PARTIE IV — IMPLÉMENTATION DE L'AUDIT EXTERNE (état au 2026-11-12)

L'audit « NomosX — Audit qualité des publications et architecture cible » a été
traduit en ordres de travail OT-1 → OT-8. État réel du code sur `main` :

## IV.1 Livré et poussé

| OT | Livrable | Fichiers | Statut |
|---|---|---|---|
| OT-8 traces | `persistCostLog` à la frontière `callLLM`/`streamLLM` (provider/modèle effectif, tokens, coût, runId, exempte replay) ; gate persisté dans `PipelineRun.steps.publicationGate` ; `ThinkTankPublicationRun` créé par publication | `lib/llm/unified-llm.ts`, `lib/agent/inquiry-orchestrator.ts`, `lib/agent/pipeline-steps/persistence-tail.ts` | ✅ |
| OT-1 sentinelles | Schéma `Prediction` : `kind`, `dueAt`, `linkId`, `parentPredictionId`, `resolutionSource` ; registration émet 3 sentinelles 30/60/90j depuis `whatToWatch`+triggers ; `parseHorizonDue` fallback prose ; **backfill exécuté : 813 dueAt + 749 sentinelles** — première échéance 2026-12-31 (était 2028-07) | `prisma/schema.prisma`, `lib/agent/prediction-registration.ts`, `lib/agent/prediction-horizon.ts` | ✅ local — ⚠️ prod Neon à migrer |
| OT-2 gate binaire | `binary-gate.ts` — 6 checks binaires calculés + persistés en `stats.publicationGate.binaryChecks`, **non décisifs** (shadow) | `lib/agent/binary-gate.ts` | ✅ shadow |
| OT-3 scénarios chaîne | `chain-scenarios.ts` — incertitudes dérivées de `causalChain` (`future_extrapolation`/`active_mechanism`), cellules mutuellement exclusives, cellule incohérente écartée ; chaîne complète passée à l'arbitre | `lib/agent/chain-scenarios.ts`, `arbiter-foresight.ts` | ✅ |
| OT-4 swarm électeur | `swarm-forecaster.ts` — 15 votants indépendants : rotation 3 providers, tranches de preuves disjointes + pool partagé (`evidence-partition`), 4 lentilles, formulation niée (anti-acquiescement), agrégation log-odds ; votes malformés rejetés (pas de réparation) | `lib/agent/swarm-forecaster.ts` | ✅ |
| OT-5 Monte Carlo | `mc-elector.ts` — Beta(moments) par maillon, 20 000 tirages seedés, IC Wilson, `contested`, margin vs runner-up, `selectedBy:'swarm'` ; **déterministe au seed près** (7 tests) | `lib/agent/mc-elector.ts` | ✅ |
| OT-6 arbitre rédacteur | Réordonnancement : chaîne → swarm → élection **avant** l'arbitre ; l'arbitre reçoit la branche élue (p, IC, contested, runner-up) avec interdiction de modifier les probabilités ; **enforcement post-parse** : proba épinglée, runner-ups rescadés à Σ100, `dominantScenario` forcé, CI attachée ; Delphi calibration skippé sous élection (il réécrivait les probabilités) ; `selectedBy:'swarm'` accepté par `centralScenarioIssues` ; `analysis.scenarios` synchronisé | `arbiter-foresight.ts`, `editorial-arbiter.ts`, `editorial-types.ts` | ✅ |
| Cleanup citations | **Héritage de citation supprimé** (`citation-filter`) ; **3 passes d'injection lexicale supprimées** (`citation-repair` : source-match, content-match, broad) ; injection du grounding-veto du critical-loop supprimée ; `repairCitations` ne garde que backfill analyste + sanitization + normalisation | `citation-filter.ts`, `citation-repair.ts`, `critical-loop-v2.ts` | ✅ |
| Cleanup probas | Gabarit 50/30/20 supprimé (`editorial-scenarios.ts` effacé, fallback arbitre → `'—'`) ; `sourceBoost`/`calibrateFromSources`/`inferAssumptions` retirés du chemin de probabilité | `simulation-agent.ts`, `editorial-arbiter.ts` | ✅ |
| OT-7 calibration | `Prediction.domain` + rapport calibration sur axes réels + `getCalibrationShrink()` injecté avant l'élection MC (actif après ≥20 résolutions) | `prediction-tracker.ts`, `schema.prisma` | ✅ câblé, en attente de données |
| Freeze apprentissage | `learning-gate.ts` — toutes les écritures mémoire/auto-évolution **gelées par défaut** (`NOMOSX_LEARNING_WRITES=1` pour réactiver) : KG, gap-filler, episodic, agent-memory, skill-bank, lesson-verifier, source-reputation, experience-bank, witness, world-model, PRM, self-evolver, MoA. Lectures inchangées | `learning-gate.ts`, `persistence-tail.ts`, `inquiry-orchestrator.ts`, `publication-generator.ts` | ✅ gelé — ablation par replay à planifier |
| Migration prod | Route `POST /api/admin/migrate-predictions` — DDL idempotent des 5 colonnes `Prediction`, gardée par `ADMIN_KEY` (le client Prisma est déjà bundlé ; `prisma db push` impossible sans URL Neon locale) | `app/api/admin/migrate-predictions/route.ts` | ✅ à déployer |

## IV.2 Architecture résultante (chemin prospectif)

```
causalChain (analyst-multipass, typé)
  → deriveChainScenarios      incertitudes = maillons future_extrapolation /
                              active_mechanism ; cellules exclusives par
                              combinaison de conditions
  → runSwarmVote              15 votants × preuves disjointes+partagées,
                              3 familles providers, lentilles, formulation
                              niée → distribution par maillon (log-odds)
  → electScenario             Beta par maillon → 20k tirages seedés →
                              proba exacte par cellule + IC Wilson +
                              contested + runner-up
  → editorialArbiter          RÉDIGE pour la branche élue (proba épinglée
                              post-parse, runner-ups rescadés, Σ=100)
  → resolveCentralScenario    contourné quand selectedBy='swarm'
  → stats.{chainScenarios, swarmForecasts, swarmElection, centralScenario,
            foresight.elected} persistés dans PipelineRun.steps
```

Fallback honnête : si la chaîne ne produit pas d'incertitudes ou si le swarm
ne produit aucun forecast valide, l'ancien chemin Monte Carlo +
`resolveCentralScenario` reste actif — ces runs sont marqués
(`stats.swarmElection.skipped` / `reason`) et ne peuvent pas usurper
`selectedBy:'swarm'`.

## IV.3 Reste à faire

1. ~~**Prod Neon**~~ : ✅ **fait** — `prisma db push` exécuté sur la base de
   production (2026-11-12) : colonnes `kind/dueAt/linkId/parentPredictionId/
   resolutionSource/domain` + index créés. Backfill relancé sur prod :
   **31 predictions stratégiques → dueAt posés, 16 sentinelles créées,
   47 OPEN au total, première échéance 2026-12-31**. La route admin
   `/api/admin/migrate-predictions` reste disponible pour les futures
   migrations additives.
2. **OT-7 calibration** : ✅ câblée — `Prediction.domain` + rapport de
   calibration sur axes réels (domain/kind/horizon) + `getCalibrationShrink()`
   injecté avant l'élection (≥20 résolutions requises, shrink borné 0,70).
   Reste : attendre les résolutions (1ʳᵉ sentinelle ~90j, 1ʳᵉ stratégique
   2026-12-31) ; bootstrap ForecastBench possible en attendant.
3. **Bascule gate** : `binaryChecks` en shadow → comparés aux décisions
   réelles sur ~10 runs stables → alors seulement décisifs. Composite
   trust/quality conservé comme signal advisory (routage degraded-mode,
   confidence warnings).
4. **Ablation** : ✅ écritures gelées (`learning-gate.ts`). Reste :
   replay par module pour prouver l'inutilité avant suppression ;
   `Temporal`/`Redis` legacy peuvent partir (déjà morts).
5. **Investigations ouvertes** : qualityScore persisté 50-66 sur des
   publications alors que le seuil documenté est 70 (score gaté ≠ colonne
   stockée ? chemin alternatif ?) ; `ThinkTankQualityCheck` en échec sur
   des publications (ADVERSARIAL/CALIBRATION étaient déjà morts — le gate
   binaire shadow les remplace).
6. **Coût swarm** : 15 appels/votants/run — mesurer via CostLog (désormais
   instrumenté) avant de monter `VOTER_COUNT`.

## IV.4 Risques résiduels connus

- L'élection swarm dépend de `analysis.causalChain` non vide — les runs sans
  chaîne exploitable restent sur le chemin legacy (marqué, pas silencieux).
- `runSwarmVote` est non-bloquant par design : un swarm en échec dégrade vers
  le fallback MC — acceptable tant que `stats.swarmElection.error` est
  persisté et auditable.
- Les probabilités de scénarios *non élus* sont rescadées proportionnellement
  aux estimations de l'arbitre — elles restent des priors LLM, mais
  minoritaires par construction (le élu porte la masse).
- Le retrait de l'injection de citations peut faire chuter `citationCoverage`
  sur les runs où l'injection masquait des lacunes réelles — c'est le but
  (fail closed), mais surveiller le taux de HELD sur les prochains runs.

*Tests : `chain-scenarios.test.ts` 7/7, `central-scenario*.test.ts` 34/34,
`prediction-horizon.test.ts` 7/7, typecheck `tsc --noEmit` 0 erreur.*
