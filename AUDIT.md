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
| `pipeline-v2.ts` 1 983 lignes + `pipeline-steps/` | Moyenne | Découpage par phase effectué (S28→S44) ; le fichier reste le point d'orchestration |
| Couverture tests | Haute | 62 fichiers de test, concentrés sur `lib/agent` / `lib/worker` ; `app/` et `components/` non testés |
| 254 modules agent | Moyenne | `knip` installé (2026-11-07) : 284 fichiers inutilisés, 26 deps + 4 devDeps, 721 exports morts. **Tri partiel fait** : 207 scripts one-off archivés dans `scripts/_archive/` (git mv, historique préservé) ; 35 scripts encore référencés + modules non-scripts restent à trier |
| `scripts/` 432 fichiers | Moyenne | Scripts `tmp-*` / `_*` désormais ignorés par git ; archivage des one-off à faire |
| Fixture replay | ✅ Soldé | Record 12 (2026-11-07) : canaux post-scout gelés (`frozenScout`, snowball, nestbrowse, `corpus:rank-entry`) — replay 0 miss, coût identique. Le bug sémantique du primer (« (0 days ago) ») corrigé via `primerCoverageCutoff` |
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
