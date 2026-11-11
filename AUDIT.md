# NomosX — Audit Technique

**Dernier audit :** 7 novembre 2026 (Sprint 46) · **Branche :** main · **Statut :** TypeScript 0 erreurs · Jest 47 suites / 473 tests (agent + worker + security + colocated, offline) · replay fixture : **0 miss, trust 40→40, gate hold→hold** (record 14, ~68min live → ~9s replay, 297 entrées — inclut regen + réserve repair + pre-draft review ×3)

> Les rapports d'audit historiques sont archivés dans [`docs/audits/`](./docs/audits/). Ce document est la référence unique pour l'état actuel du projet.

---

## Architecture (résumé)

| Composant | Détail |
|-----------|--------|
| Frontend | Next.js 16 (App Router), React 18, next-intl (fr/en), Tailwind |
| Pipeline | `lib/agent/pipeline-v2.ts` — pipeline agentic multi-phase (Scout → Rank → Reader → Analyst → Critic → Debate → Editor → Verify → Publish) |
| LLM | `lib/llm/unified-llm.ts` — 5 providers (DeepSeek, GLM, OpenAI, Anthropic, Kimi), circuit breaker, per-task routing |
| Data | PostgreSQL + Prisma (59 modèles), pgvector, Redis (cache + BullMQ) |
| Deploy | Netlify (functions + background), Sentry |

Historique complet des sprints : [`AGENTS.md`](./AGENTS.md).

## Sécurité

| Contrôle | Statut |
|----------|--------|
| Secrets | `.env*` gitignorés ; **clés locales à révoquer après tests** |
| Auth secrets | Comparaison timing-safe (`lib/security/timing-safe.ts`) sur toutes les routes cron/studiox |
| CSRF | Validation Origin/Referer + bypass interne sur header dédié |
| Headers | CSP, HSTS, X-Frame-Options, nosniff, Permissions-Policy |
| XSS | `sanitizeHtml` allowlist server + Sanitizer API client |
| Passwords | bcrypt (12 rounds), migration legacy SHA-256 |
| Secrets compare | `ADMIN_KEY` comparé en timing-safe : `x-admin-key` ne bypass le CSRF que s'il matche `ADMIN_KEY` (middleware + `lib/security/csrf.ts`) |
| Dependencies | `npm audit` (2026-11-07) : ~33 vulns d'origine. `npm audit fix` a été testé puis **reverté** — il régressait à 87 vulns en tirant des chaînes transitives cassantes (netlify-cli→@fastify/static/tar/toml/ws). Restent par catégorie : `@sentry/nextjs` <10.76.1 (critical, tunnel middleware bypass — fix non-cassant dispo), `adm-zip` via onnxruntime-node/@huggingface/transformers (high), `nodemailer` → v10 requis (cassant), `exceljs`→uuid + `zod` via puppeteer-core/linkup-sdk (cassants), `sharp` libvips (high), `@fastify/static`/`tar`/`toml`/`tmp`/`ws`/`qs`/`undici`/`source-map-js` — majoritairement transitifs de netlify-cli et outillage, surface d'attaque faible hors dev |

## Dette technique connue

| Item | Sévérité | Note |
|------|----------|------|
| `pipeline-v2.ts` 2 053 lignes + `pipeline-steps/` (36 modules) | Moyenne | **Évaluation modularisation (2026-11-07)** : ~85 % du travail lourd est déjà extrait — `runPipelineCore` (~1 500 lignes) n'est plus qu'orchestration séquentielle sur état mutable partagé (`html`/`analysis`/`stats`/`orchState`). Extractions restantes à fort ratio/risque : (a) dispatch analyst STEP 6 (~300 lignes, 627-925) ; (b) orchestration render+debate+DA (~380 lignes, 1147-1530) → `pipeline-steps/render-phase.ts` avec `TailStepContext`-like ctx explicite ; (c) DA post-repair recheck (~60 lignes) → `da-post-repair.ts`. **Garder inline** : closures `renderEditorHtml`/`runPostRenderQualityGates` (timing d'assignation `html`/`debateResult` critique) et wrappers publics. Règle : un stage = un commit + replay fixture 0-miss exigé (l'ordre des effets de bord EST le contrat). Pas de rewrite — risque de régression replay >> gain cosmétique |
| Couverture tests | Haute | 62 fichiers de test, concentrés sur `lib/agent` / `lib/worker` ; `app/` et `components/` non testés |
| 254 modules agent | Moyenne | `knip` installé (2026-11-07) : 284 fichiers inutilisés, 26 deps + 4 devDeps, 721 exports morts. **Tri partiel fait** : 207 scripts one-off archivés dans `scripts/_archive/` (git mv, historique préservé) ; 35 scripts encore référencés + modules non-scripts restent à trier |
| `scripts/` 432 fichiers | Moyenne | Scripts `tmp-*` / `_*` désormais ignorés par git ; archivage des one-off à faire |
| Fixture replay | ✅ Soldé | **Multi-corpus (2026-11-08)** : 4 fixtures commités, tous replay **0-miss re-vérifié** — `gulf-minerals` (énergie, 297 entrées), `nordic-total-defence` (stratégique, 240), `sanctions-patronage` (économie, **re-recordé** : 77 entrées + 76 frozen inputs, trust 0/hold, coût identique au cent), `ai-relationships-china` (gouvernance IA — record 1 a exposé un bug de persistance `\u0000`/jsonb, corrigé par `lib/json-safe.ts` `toJsonSafe`, record 2 validé ~84min). Tous les runs tiennent `hold` — outcomes fail-closed reproduits à l'identique. Le re-record sanctions a fermé le dernier canal de drift : appels LLM post-gate (leçons, gaps, KG, experience, playbook) gelés via `captureInputFifo`, CI Delphi gelée par contenu, gate lesson-verifier gelé (`rand:lesson-verify`) |
| Caches TTL en mémoire | Basse | `topic-classifier`, `quant-agent` traités (S45) ; `topic-radar` (12 min) hors chemin pipeline |
| `react-hooks/*` warnings | Basse | `set-state-in-effect`, `exhaustive-deps` — 10 occurrences |
| `import/no-anonymous-default-export` | Basse | 91 occurrences, stubs `lib/providers/**/*.js` hérités |
| `@next/next/no-html-link-for-pages` | Basse | 40 occurrences |

## Vérifications

```bash
npx tsc --noEmit -p tsconfig.json                              # 0 erreurs
npx eslint lib app components --cache --max-warnings 200       # 0 erreurs
NOMOSX_TEST_OFFLINE=1 npx jest __tests__/lib/agent __tests__/lib/worker --runInBand --ci
npm run replay:inspect -- .llm-cassettes/gulf-minerals.fixture.jsonl   # intégrité du fixture (hors DB)
npm run replay -- --cassette .llm-cassettes/gulf-minerals.fixture.jsonl --cleanup   # replay déterministe ($0, DB requise)
npm run build                                                  # next build
./.tools/node/node.exe node_modules/knip/dist/cli.js           # audit dead-code (rapport seul)
```

C'est exactement ce que `.github/workflows/ci.yml` exécute (Node 22 via `.node-version`). Les déploiements sont assurés par Netlify (`netlify.toml`), pas par GitHub Actions.

## Commits

Ce dépôt suit [Conventional Commits](https://www.conventionalcommits.org/) : `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, `security:`.

---

# Audit institutionnel — 2026-11-11 (Sprint 55)

Audit minutieux demandé par le propriétaire : la stack doit se comporter
comme un think tank — publications impactantes et publiables par défaut,
couvrant tous les domaines. Constat : **la chaîne de vérification est
solide ; la chaîne éditoriale (quoi rechercher, pour qui, avec quelle
cadence) est en panne.**

## Données de base vérifiées (DB prod)

| Métrique | Valeur | Lecture |
|---|---|---|
| Publications | 21 briefs (août–21 sept, trust 60–89) | Qualité historique correcte |
| Runs depuis 20 sept | 176 pipeline runs → **0 publié** | Cadence morte ~7 semaines |
| Décisions depuis 1 oct | 22 HOLD / 0 PUBLISH / 0 REJECT | Tout est held, rien de publié |
| Raisons HOLD dominantes | trust=40 (7×), fatal_challenges DA (6×), timeouts (3×), quality<70 | Veto DA/critic + substance insuffisante |
| Signaux | 14 594 EXPIRED / 12 HELD / 1 NEW | Génération ≫ capacité dispatch |
| Verticales | 5 déclarées — eu-policy 99.95 % des signaux, 3 verticales à 0 | Couverture "tous domaines" nominale |
| Prédictions | 813 OPEN / 0 résolues (avant fix Sprint 54) | Boucle d'apprentissage morte |

## Findings par sous-système

### CRITIQUE — chaîne éditoriale

**E1. Aucun agenda éditorial vivant.** Le North Star (`analyst-context.ts`)
définit la rigueur de sortie, mais rien en amont ne décide QUOI
rechercher : pas de beat sheet, pas de questions flagship, pas de quotas
domaines, pas de règles de mort de sujet. Un think tank se distingue par
son jugement éditorial en amont de la production — ici la seule sélection
est `priorityScore ≥ 55` côté dispatcher.

**E2. Funnel signaux cassé à l'échelle.** 14,6k signaux générés vs une
dizaines traités : le radar produit plus vite que le pipeline ne consomme,
le sweep hygiène expire le surplus >7j. Conséquence : la base de signaux
est du bruit, pas un vivier.

**E3. Couverture domaines nominale.** `climate-industry`, `ai-labor`,
`finance-regulation` : 0 signal en base. La promesse "tous les domaines"
échoue à la configuration radar — les verticales vides n'ont ni sources
ni providers dédiés. eu-policy accapare 99.95 % du flux.

**E4. Cadence publique morte.** 176 runs / 7 semaines / 0 publication.
Causes cumulées : providers dégradés (glm seul → substance insuffisante →
veto DA), funnel signaux bruyant, et absence d'agenda qui prioriserait
les sujets à fort potentiel de publication.

### HAUTE — chaîne de production (corrigée ce sprint)

**P1. Boucle apprentissage morte** — 813 prédictions jamais résolues
(horizons calendaires non parsés + statut invalide + calibration sans
appelant). **Corrigé Sprint 54** : `parseHorizonDue`,
`resolveDuePredictions` (5/sweep worker), calibration injectée dans le
contexte analyst (`9abd3c7`).

**P2. Famine de vérification** — gate fact-check 600s flat → 0/21 claims
LLM-vérifiées à 566s restantes. **Corrigé** : dégradation partielle par
batch (150s/batch, canaux gelés) + run-plan governor (`343d056`,
`03c04b2`).

**P3. Réparation fact-check inefficace** — 8/8 edits skippés
(spans_boundary/not_found). **Corrigé** : entity-flex matching +
fallback numérique déterministe fail-closed (`52ccd8b`, `15b2c3f`).

**P4. Faux blacklists providers** — budget-exhausted compté comme panne
provider → blacklists 30min injustifiés. **Corrigé** (`267e03d`).

**P5. Retry topic contourné** — HELD_MAX_RETRIES par signalId, même
question via nouveaux signaux (energy ×5). **Corrigé** : cluster par
titre normalisé (`476b4fd`).

### MOYENNE — dette mesurée

**M1.** `sourcesFound=0` persisté (stats.scout array nu) — **corrigé**
(`9abd3c7`). **M2.** signal sémantique du reranker constant ~0 % —
**corrigé** (`b1513a6`). **M3.** XSS JSON-LD sur 4 sites — **corrigé**
(`3bc0972`). **M4.** Fixtures gulf/nordic stale — re-record requis.
**M5.** 21 briefs publiés jamais relus éditorialement (pré-gates actuels).
**M6.** `pipeline-v2.ts` ~2 100 lignes — modularisation évaluée, gain
cosmétique < risque replay (cf. tableau ci-dessus).

## Plan de corrections — priorisé

| Phase | Action | Dépendance | Effort |
|---|---|---|---|
| **P0 — Diagnostiquer** | Répartition fine des 22 HOLD : combien de veto DA vs budget vs timeout vs gate structurel ; identifier si le seuil DA (strength<20 → cap 40) est calibré pour le mode dégradé ou s'il rend la publication structurellement impossible sans Kimi | Accès stats existantes | Faible |
| **P1 — Agenda éditorial** | Module `research-agenda.ts` : beat sheet vivant (domaines prioritaires, questions flagship, quotas hebdo, règles de mort) injecté dans `collectBreakingItems`/`collectHeldRetryItems` — le desk décide QUOI avant le radar | — | Moyen |
| **P2 — Rééquilibrage radar** | Quota par verticale à la génération de signaux + cap de volume proportionnel à la capacité dispatch ; classifier pourquoi eu-policy domine (keywords larges ? sources ? classifier default ?) | P1 (l'agenda définit les quotas) | Moyen |
| **P3 — Boucle adversariale** | Objections fatales DA → critères de stress P2 (experience bank → prompt P2) | — | Faible-Moyen |
| **P4 — Validation live** | Recharger Kimi → cycle flags ON (runbook AGENTS.md) → re-record fixtures → mesurer first-pass rate | Crédits | — |
| **P5 — Revue rétrospective** | Audit éditorial des 21 briefs publiés (pré-gates) : lequel aurait passé aujourd'hui ? | — | Faible |

## Principe directeur

La stack prouve désormais qu'elle **refuse bien**. La prochaine frontière
n'est pas "publier plus" mais "décider mieux quoi publier" — un think
tank n'est pas une usine à vérification, c'est une rédaction avec un
agenda. P0→P2 transforment le radar en rédaction ; P3→P5 bouclent
l'apprentissage et la mesure.
