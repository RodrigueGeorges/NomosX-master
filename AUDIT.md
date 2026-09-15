# NomosX — Audit Technique

**Dernier audit :** Septembre 2026 · **Branche :** main · **Statut :** TypeScript 0 erreurs · ESLint 0 erreurs / ~138 warnings

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
| Secrets compare | ⚠️ `ADMIN_KEY` validé en env.ts mais jamais comparé (config morte) |
| Dependencies | `npm audit` — vulnérabilités restantes = breaking changes (netlify-cli, nodemailer v10, exceljs, sharp) |

## Dette technique connue

| Item | Sévérité | Note |
|------|----------|------|
| `pipeline-v2.ts` 7 426 lignes | Haute | Monolithe à découper par phase |
| Coverage tests ~2.5 % | Haute | 13 fichiers de test / 514 sources lib |
| 191 modules agent | Moyenne | Audit dead code (`knip`) recommandé |
| `scripts/` 315 fichiers | Moyenne | Nombreux scripts one-off à archiver |
| `react-hooks/*` warnings | Basse | `set-state-in-effect`, `exhaustive-deps`, `purity` — à traiter progressivement |

## Vérifications

```bash
npx tsc --noEmit     # 0 erreurs
npm run lint         # eslint --cache (0 erreurs)
npm run test         # jest
npm run build        # next build
```

## Commits

Ce dépôt suit [Conventional Commits](https://www.conventionalcommits.org/) : `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, `security:`.
