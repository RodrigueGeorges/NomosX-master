# NomosX Go-Live Runbook

This is the operational checklist for launching NomosX live.

## 1. Required Production Services

- PostgreSQL database, preferably managed and backed up.
- Redis or Upstash Redis for distributed rate limiting.
- DeepSeek API key for the main agent pipeline. Qwen, Anthropic, or OpenAI can be configured as fallbacks.
- Resend or another configured email provider.
- Sentry for error tracking.
- Stripe only if paid subscriptions are enabled at launch.

## 2. Required Environment Variables

Minimum production set:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<64-char-random-secret>
ADMIN_KEY=<32-char-random-secret>
CRON_SECRET=<32-char-random-secret>
PRIMARY_LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL_FAST=deepseek-v4-flash
DEEPSEEK_MODEL_REASONING=deepseek-v4-pro
NEXT_PUBLIC_APP_URL=https://your-domain.com
NOMOSX_WEEKLY_PUBLICATION_MAX=3
REDIS_URL=redis://...
```

Recommended:

```bash
SENTRY_DSN=https://...
RESEND_API_KEY=re_...
EMAIL_FROM="NomosX <noreply@your-domain.com>"
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
LINKUP_API_KEY=...
UNPAYWALL_EMAIL=research@your-domain.com
QWEN_API_KEY=...
OPENAI_API_KEY=... # optional, mostly useful for embeddings/fallback
```

## 3. Preflight

Run before deploying:

```bash
npm install
npm run prisma:gen
npm run preflight:live
npm run lint
npm run test
npm run build
```

Full one-shot command:

```bash
npm run verify:live
```

## 4. Database

Before first production launch:

```bash
npm run prisma:gen
npx prisma migrate deploy
```

If the database is empty, seed only production-safe defaults:

```bash
npm run seed:domains
```

Avoid demo seed scripts in production unless intentionally launching with sample content.

## 5. Deployment

Recommended order:

1. Configure environment variables in the hosting platform.
2. Deploy application.
3. Run `npx prisma migrate deploy`.
4. Hit `/api/ready`.
5. Hit `/api/health`.
6. Create a test user.
7. Run a small StudioX request.
8. Generate one draft publication, not an automatic public publication.
9. Confirm publication gate stores `publicationGate` in `criticalLoopResult`.
10. Enable cron jobs only after the manual smoke test passes.

## 6. Post-Launch Smoke Test

Check:

- `/` loads.
- `/articles` loads.
- `/studio` redirects unauthenticated users.
- `/api/ready` returns `ready`.
- `/api/health` returns `healthy` or acceptable `degraded`.
- Register/login flow works.
- StudioX returns a response.
- Rate limits return 429 when exceeded.
- Cron routes reject requests without `CRON_SECRET`.
- Sentry receives errors.

## 7. Production Cadence

Start conservative:

```bash
NOMOSX_WEEKLY_PUBLICATION_MAX=1
```

After one stable week:

```bash
NOMOSX_WEEKLY_PUBLICATION_MAX=3
```

Daily radar can run more often, but public analysis should remain scarce.

## 8. Rollback

If the launch misbehaves:

1. Disable cron jobs.
2. Set `NOMOSX_WEEKLY_PUBLICATION_MAX=1` or `0` if the code is adjusted to allow zero.
3. Pause publication by holding drafts in review.
4. Roll back the deployment in the hosting platform.
5. Keep the database; do not reset production data.

## 9. Definition Of Live-Ready

NomosX is live-ready when:

- `npm run verify:live` passes.
- `/api/ready` returns 200.
- Database migrations are deployed.
- Redis is configured in production.
- Cron secret is configured and tested.
- Sentry is receiving events.
- A test StudioX request succeeds.
- At least one draft publication passes through the publication gate.
