# NomosX — Plan d'Améliorations Ultime

> Audit complet : vision, agents, chercheurs, stack, UX, architecture
> Date : 2026-03-03 | Auteur : CTO Audit

---

## DIAGNOSTIC GLOBAL

### Ce qui est excellent (garder)
- **Vision produit** claire et ambitieuse ("1er think tank autonome")
- **Pipeline 16 étapes** complet (Context Primer → Knowledge Graph)
- **Harvard Council** avec 8 PhD + Evidence Grader + Adversarial Review Board
- **66+ providers** réels (OpenAlex, CrossRef, PubMed, etc.)
- **Schema Prisma** riche (Claims, Evidence Spans, Contradictions, Knowledge Graph)
- **Security audit** fait (rate limiting, CSRF, auth, sanitization)
- **Design system** cohérent (palette blue/purple premium)

### Ce qui est problématique (corriger)

| Catégorie | Sévérité | Problème |
|-----------|----------|----------|
| **Hygiène code** | CRITIQUE | 259 fichiers .md à la racine, 28 .json orphelins, 24 .ts scripts à la racine |
| **@ts-nocheck** | CRITIQUE | 10 fichiers agents avec @ts-nocheck = 300K+ lignes non typées |
| **Dead code** | HAUTE | `phd-researcher-expanded.ts` = 100% placeholder, `synthesis-director.ts` = 100% placeholder |
| **Duplication** | HAUTE | `harvard-council-enhanced.ts` vs `review-board.ts:runHarvardCouncil()` — deux implémentations parallèles |
| **Pipeline monolithe** | HAUTE | `pipeline-v2.ts` = 83K (2042 lignes) — un seul fichier god-object |
| **Provider chaos** | MOYENNE | Mix `.js` / `.mjs` / `.ts` pour les providers, pas de standard unique |
| **Tests** | HAUTE | Quasi-zéro tests unitaires pour les agents, pas de tests e2e |
| **Stripe** | HAUTE | Skeleton uniquement — aucune intégration réelle de paiement |
| **Embeddings** | MOYENNE | pgvector commenté, embeddings stockés en Float[] JSON (pas de vector search réel) |
| **Observabilité** | MOYENNE | Sentry configuré mais pas de métriques business (Prometheus/Grafana) |
| **Node.js** | BLOQUANT | Machine locale en Node 24 incompatible — dev impossible sans nvm |

---

## PLAN D'AMÉLIORATION — 4 PHASES

---

## PHASE 1 : NETTOYAGE & STABILISATION (1-2 semaines)

### 1.1 — Hygiène racine (P0)
**Objectif** : Racine propre avec uniquement les fichiers de config standard

- [ ] Déplacer les 259 `.md` vers `docs/` (sauf README.md, AGENTS.md)
- [ ] Déplacer les 28 `.json` orphelins vers `docs/reports/` ou supprimer
- [ ] Déplacer les 24 `.ts` scripts racine vers `scripts/analysis/`
- [ ] Déplacer les `.bak` vers `archived-scripts/`
- [ ] Résultat attendu : racine = ~15 fichiers (package.json, tsconfig, next.config, etc.)

### 1.2 — Supprimer les @ts-nocheck (P0)
**Objectif** : Zéro @ts-nocheck dans le codebase

Pour chaque fichier :
- [ ] `think-tank-core.ts` — Typer les interfaces, ajouter les types manquants
- [ ] `think-tank-automation.ts` — Idem
- [ ] `domain-intelligence.ts` — Idem
- [ ] `elite-analyst.ts` — Idem
- [ ] `pipeline-orchestrator.ts` — Idem
- [ ] `auto-publisher.ts` — Idem
- [ ] `enhanced-analyst.ts` — Idem
- [ ] `visualization-generator.ts` — Idem
- [ ] `vertical-intelligence/integration.ts` — Idem
- [ ] `ultimate-analyst.ts` — Idem

**Méthode** : Créer un fichier `lib/agent/types/index.ts` centralisé avec TOUTES les interfaces partagées, puis typer progressivement.

### 1.3 — Supprimer le dead code (P0)
- [ ] `phd-researcher-expanded.ts` — 100% placeholder → supprimer, utiliser `phd-researcher.ts`
- [ ] `synthesis-director.ts` — 100% placeholder → supprimer, la vraie synthèse est dans `review-board.ts`
- [ ] `evidence-grader.ts` (533 bytes) — stub → supprimer si la vraie impl est dans review-board
- [ ] `adversarial-review.ts` (855 bytes) — stub → supprimer si la vraie impl est dans review-board
- [ ] `_runFullPipelineLegacy_DELETE_ME` et `_runStrategicPipelineLegacy_DELETE_ME` dans pipeline-v2 → supprimer
- [ ] Supprimer les 20+ fichiers `.mjs` de test dans `lib/agent/` (test-*.mjs, fix-*.mjs, audit-*.mjs)
- [ ] Supprimer `activate-all-providers.ts.bak`, `all-providers-test.ts.bak` à la racine

### 1.4 — Standardiser les providers (P1)
**Objectif** : Un seul format pour tous les providers

- [ ] Convertir tous les `.js` / `.mjs` providers en `.ts` avec interface commune
- [ ] Créer `lib/providers/types.ts` avec `ProviderConfig`, `ProviderResult`
- [ ] Fusionner `registry-bridge.ts` (21K) + `registry-bridge-clean.ts` (8K) + `registry-v2.ts` (10K) → UN SEUL `registry.ts`
- [ ] Fusionner `extended-registry.mjs` + `final-complete-registry.mjs` + `linkup-registry.mjs` → intégrer dans le registry unique

### 1.5 — Installer nvm/fnm (P0)
- [ ] Installer fnm (Fast Node Manager) sur la machine locale
- [ ] Configurer `.nvmrc` à `20.19.0`
- [ ] Ajouter script `scripts/setup-env.ps1` pour onboarding

---

## PHASE 2 : ARCHITECTURE & QUALITÉ (2-3 semaines)

### 2.1 — Découper le monolithe pipeline-v2.ts (P0)
**Objectif** : Fichier de 83K → modules de 2-5K chacun

```
lib/pipeline/
├── index.ts              # Exports publics (runPipeline, runStrategicPipeline)
├── core.ts               # runPipelineCore (orchestration seule)
├── types.ts              # PipelineCoreOptions, ReportFormat, etc.
├── lineage.ts            # createLineageTracker, recordTransformation
├── steps/
│   ├── scout.ts          # scout(), scoutImpl()
│   ├── index-step.ts     # index()
│   ├── embed.ts          # embedSourcesBatch()
│   ├── dedup.ts          # deduplicateSources()
│   ├── rank.ts           # rank(), RankOptions
│   ├── reader.ts         # Wrapper autour de reader-agent-v3
│   ├── analyst.ts        # analystMultipass + strategicAnalystAgent
│   ├── council.ts        # Harvard Council orchestration
│   ├── guard.ts          # citationGuard()
│   ├── editor.ts         # renderBriefHTML, renderStrategicReportHTML
│   ├── verifier.ts       # verifyCitations()
│   ├── critical-loop.ts  # runCriticalLoopV2()
│   ├── debate.ts         # debateAgent + metaAnalysisEngine
│   ├── advocate.ts       # runDevilsAdvocate
│   ├── publisher.ts      # Prisma save
│   └── knowledge-graph.ts
└── orchestrator/
    ├── state.ts           # createPipelineState, assessAfter*
    ├── decisions.ts       # recordDecision, loadCalibratedThresholds
    └── memory.ts          # buildMemoryInjection, recordAgentPerformance
```

### 2.2 — Activer pgvector (P1)
**Objectif** : Vraie recherche sémantique au lieu de Float[] JSON

- [ ] Ajouter extension `pgvector` dans le schema Prisma
- [ ] Décommenter les colonnes `embedding Unsupported("vector(1536)")` dans Source et SourceChunk
- [ ] Créer les index HNSW pour cosine similarity
- [ ] Migrer les embeddings Float[] existants vers les colonnes vector
- [ ] Implémenter `lib/search/semantic-search.ts` avec requêtes SQL brutes pour vector similarity
- [ ] Performance attendue : recherche sémantique en <100ms vs scan linéaire actuel

### 2.3 — Tests (P0)
**Objectif** : Coverage 60%+ sur le code critique

```
__tests__/
├── unit/
│   ├── pipeline/
│   │   ├── scout.test.ts       # Mock providers, test retry logic
│   │   ├── rank.test.ts        # Test scoring deterministic
│   │   ├── guard.test.ts       # Test citation validation
│   │   └── editor.test.ts      # Test HTML rendering
│   ├── agents/
│   │   ├── phd-researcher.test.ts  # Test expert detection
│   │   ├── review-board.test.ts    # Test evidence grading
│   │   └── debate-agent.test.ts    # Test debate synthesis
│   └── providers/
│       ├── openalex.test.ts
│       └── registry.test.ts
├── integration/
│   ├── pipeline-brief.test.ts    # E2E brief pipeline (mocked LLM)
│   ├── pipeline-strategic.test.ts # E2E strategic pipeline
│   └── api/
│       ├── briefs.test.ts
│       ├── auth.test.ts
│       └── security.test.ts      # (existe déjà)
└── e2e/
    └── cypress/
        ├── dashboard.cy.ts
        ├── brief-generation.cy.ts
        └── auth-flow.cy.ts
```

- [ ] Configurer Jest avec mocks pour OpenAI (`lib/__mocks__/llm/unified-llm.ts`)
- [ ] Créer fixtures de sources et readings pour tests reproductibles
- [ ] Ajouter `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`
- [ ] Intégrer dans CI : `npm run test:unit` obligatoire avant merge

### 2.4 — Unifier les deux Harvard Council (P1)
- [ ] `review-board.ts:runHarvardCouncil()` = legacy (9 experts, fonctionnel)
- [ ] `harvard-council-enhanced.ts:runEnhancedHarvardCouncil()` = enhanced (15 experts, placeholders)
- [ ] **Action** : Merger dans un seul `lib/council/harvard-council.ts` avec flag `mode: 'standard' | 'enhanced'`
- [ ] Supprimer les stubs/placeholders de `phd-researcher-expanded.ts`

---

## PHASE 3 : FONCTIONNALITÉS BUSINESS (3-4 semaines)

### 3.1 — Stripe Integration (P0)
**Objectif** : Paiements réels pour les 3 tiers

- [ ] Créer les 3 produits Stripe : Researcher (€19), Studio (€49), Enterprise (€199)
- [ ] Implémenter `lib/stripe.ts` complet (checkout, webhooks, customer portal)
- [ ] Ajouter `/api/stripe/create-checkout` — crée une session Checkout
- [ ] Ajouter `/api/stripe/customer-portal` — redirige vers le portail client
- [ ] Compléter `/api/stripe/webhook` — gérer `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
- [ ] Mettre à jour le modèle `Subscription` automatiquement depuis les webhooks
- [ ] Ajouter middleware `withSubscription(tier)` pour protéger les routes premium

### 3.2 — Living Documents (P1)
**Objectif** : Les briefs s'actualisent quand de nouvelles sources apparaissent

- [ ] Ajouter `Brief.lastRefreshedAt`, `Brief.refreshCount`, `Brief.autoRefresh` au schema
- [ ] Créer `lib/agent/brief-refresher.ts` — détecte les nouvelles sources pertinentes
- [ ] CRON job `/api/cron/refresh-briefs` — toutes les 24h, vérifie les briefs avec `autoRefresh: true`
- [ ] Si ≥3 nouvelles sources pertinentes → re-run ANALYST + EDITOR (pas tout le pipeline)
- [ ] Notification email aux subscribers du brief
- [ ] UI : Badge "Updated" + diff view dans le brief

### 3.3 — API Publique (P1)
**Objectif** : API key management pour le tier Studio/Enterprise

- [ ] Créer modèle `ApiKey` dans Prisma (hashed, scoped, rate-limited)
- [ ] Ajouter `/api/keys` CRUD
- [ ] Middleware `withApiKey()` pour les routes API
- [ ] Rate limiting par API key (10 req/min Studio, 100 req/min Enterprise)
- [ ] Documentation Swagger auto-générée depuis `openapi.yaml`
- [ ] SDK TypeScript publié sur npm (`@nomosx/sdk`)

### 3.4 — Notification System (P1)
- [ ] Modèle `Notification` dans Prisma
- [ ] Push notifications (brief terminé, signal détecté, document mis à jour)
- [ ] Composant `NotificationBell.tsx` (existe déjà) → connecter aux vraies données
- [ ] Email digest configurable (daily/weekly/monthly)

### 3.5 — Export PDF (P2)
**Objectif** : Export premium pour Enterprise

- [ ] Utiliser `puppeteer-core` (déjà installé) + `@sparticuz/chromium` pour serverless
- [ ] Template PDF avec header NomosX, numérotation, table des matières
- [ ] Route `/api/briefs/[id]/export?format=pdf`
- [ ] Uniquement pour tier Studio+ (via `withSubscription`)

---

## PHASE 4 : WORLD-CLASS (4-6 semaines)

### 4.1 — Observabilité Avancée (P1)
- [ ] Ajouter OpenTelemetry pour traces distribuées dans le pipeline
- [ ] Dashboard `/admin/monitoring` avec métriques temps-réel :
  - Pipeline duration p50/p95/p99
  - Coût LLM par pipeline ($)
  - Trust score distribution
  - Provider health status
  - Source quality histogram
- [ ] Alertes Slack/Email si trust score moyen < 65 ou pipeline failure rate > 10%

### 4.2 — Streaming UX (P1)
**Objectif** : L'utilisateur voit la progression en temps-réel

- [ ] Améliorer `/api/brief/stream` avec SSE granulaires :
  ```
  event: step
  data: {"step":"scout","status":"running","progress":0.1}
  
  event: step
  data: {"step":"scout","status":"done","found":142}
  
  event: step
  data: {"step":"council","status":"running","expert":"Dr. Vasquez"}
  
  event: step
  data: {"step":"editor","status":"done"}
  
  event: complete
  data: {"briefId":"abc123","trustScore":82}
  ```
- [ ] Composant `PipelineProgress.tsx` avec animation hexagonale par étape
- [ ] Afficher les PhD en train d'analyser (avatars animés)
- [ ] Temps estimé restant basé sur historique

### 4.3 — Multi-langue (P2)
- [ ] Détecter la langue de la question (français/anglais)
- [ ] Prompt les agents dans la langue détectée
- [ ] Briefs générés dans la langue demandée
- [ ] UI i18n avec `next-intl` (français par défaut, anglais)

### 4.4 — Collaboration (P3)
- [ ] Partage de briefs par lien public (`/s/[publicId]`) — existe partiellement
- [ ] Commentaires sur les briefs (model `BriefComment`)
- [ ] Collections/Dossiers de briefs (model `Collection`)
- [ ] Team workspace pour Enterprise

### 4.5 — Mobile-First (P2)
- [ ] Audit responsive complet de toutes les pages
- [ ] PWA manifest + service worker pour offline reading
- [ ] Optimiser les briefs pour lecture mobile (typography, spacing)

---

## CORRECTIONS TECHNIQUES IMMÉDIATES

### Bugs à corriger maintenant
1. **`publicationFormat` Prisma** — Le modèle n'existe pas dans le schema mais est utilisé dans `format-generator.ts` et `app/api/formats/route.ts`. Soit ajouter le modèle au schema, soit supprimer le système de formats.
2. **`mcp-agents-index.ts` re-exports** — Des fonctions qui n'existent pas sont encore ré-exportées dans l'objet `mcpAgents` (à vérifier systématiquement).
3. **`harvard-council-enhanced.ts`** utilise `phd-researcher-expanded.ts` (placeholders) au lieu de `phd-researcher.ts` (réel) → import cassé.
4. **`evidence-grader.ts`** (533 bytes) et `adversarial-review.ts` (855 bytes) sont des stubs que `harvard-council-enhanced.ts` importe → soit implémenter soit rediriger vers review-board.ts.
5. **`Subscription.plan`** default = "ANALYST" dans le schema mais la page pricing montre "Researcher" comme tier de base → incohérence naming.

### Dette technique à résoudre
1. **`prisma as any`** — 5+ usages pour contourner des modèles inexistants → résoudre proprement
2. **`error as any`** — 10+ usages → utiliser `error instanceof Error ? error.message : String(error)`
3. **Unused imports** — Passer ESLint strict sur les imports inutilisés
4. **Console.log en prod** — Remplacer par Winston logger avec niveaux (debug/info/warn/error)

---

## MÉTRIQUES DE SUCCÈS

| Métrique | Actuel | Cible Phase 1 | Cible Phase 4 |
|----------|--------|---------------|---------------|
| Fichiers racine | ~120 | ~15 | ~15 |
| @ts-nocheck | 10 fichiers | 0 | 0 |
| Test coverage | ~5% | 40% | 70% |
| Build time | ~45s | ~30s | ~20s |
| Pipeline p95 | ~120s | ~90s | ~60s |
| Trust score moyen | ~70 | ~75 | ~82 |
| Dead code | ~50K lignes | ~5K | ~0 |
| Provider format | 3 (.js/.mjs/.ts) | 1 (.ts) | 1 (.ts) |
| Paiement | ❌ skeleton | ✅ Stripe live | ✅ + Enterprise |

---

## PRIORITÉS RECOMMANDÉES

```
SEMAINE 1-2 : Phase 1.1 (hygiène) + 1.3 (dead code) + 1.5 (nvm)
SEMAINE 3-4 : Phase 1.2 (@ts-nocheck) + 2.3 (tests unit)
SEMAINE 5-6 : Phase 2.1 (découper pipeline) + 3.1 (Stripe)
SEMAINE 7-8 : Phase 2.4 (unifier council) + 1.4 (providers)
SEMAINE 9-10 : Phase 3.2 (Living Documents) + 4.2 (Streaming UX)
SEMAINE 11-12 : Phase 2.2 (pgvector) + 4.1 (observabilité)
SEMAINE 13+ : Phase 3.3 (API) + 3.5 (PDF) + 4.3-4.5
```

---

*Ce plan transforme NomosX d'un prototype fonctionnel en un produit world-class prêt pour le marché.*
