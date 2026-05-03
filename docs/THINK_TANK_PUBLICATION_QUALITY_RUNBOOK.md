# NomosX Think Tank Publication Quality Runbook

Goal: keep the public think tank empty unless a publication is genuinely high quality.

## Business Rule

Every public publication must pass the quality rule for its format before it can remain `PUBLISHED`.

| Format | Trust | Quality | Citations | Words | Sources |
|---|---:|---:|---:|---:|---:|
| Signal Brief | 75 | 75 | 72% | 700 | 5 |
| Update Note | 75 | 75 | 72% | 600 | 3 |
| Data Note | 75 | 75 | 75% | 900 | 4 |
| Policy Memo | 78 | 78 | 75% | 1200 | 8 |
| Research Brief | 78 | 78 | 75% | 1500 | 10 |
| Decision Brief | 78 | 78 | 75% | 1500 | 10 |
| Strategic Report | 80 | 80 | 78% | 3500 | 20 |
| Research Dossier | 82 | 82 | 80% | 8000 | 35 |

The rule is implemented in:

- `lib/publication-visibility.ts`
- `lib/agent/publication-gate.ts`
- `scripts/audit-publication-quality.ts`

## Execution Prompt For A Node Machine

Use this on a PC/server that has Node 22+ and access to the production database.

```bash
git pull origin main
npm install
npm run prisma:gen
npm run quality:audit
```

If the audit lists failing publications and you want to unpublish them:

```bash
npm run quality:hold
```

Then verify:

```bash
npm run quality:audit
```

Expected result:

```txt
Checked: N
Failing: 0
All published publications pass the current business rules.
```

## Manual SQL Verification

Use this if you only have SQL access.

```sql
SELECT
  id,
  "publicId",
  title,
  type,
  status,
  "trustScore",
  "qualityScore",
  "citationCoverage",
  "wordCount",
  CARDINALITY("sourceIds") AS "sourceCount",
  "publishedAt"
FROM "ThinkTankPublication"
WHERE status = 'PUBLISHED'
ORDER BY "publishedAt" DESC;
```

If weak content appears, hold it:

```sql
UPDATE "ThinkTankPublication"
SET status = 'HELD', "publishedAt" = NULL
WHERE status = 'PUBLISHED'
  AND (
    "publishedAt" IS NULL
    OR "trustScore" < 75
    OR "qualityScore" < 75
    OR "citationCoverage" < 0.72
    OR "wordCount" < 600
  );
```

The Node audit is preferred because it applies the stricter per-format source and word thresholds.

## Improve Agents From Failed Publications

The quality gate prevents weak public output. The agent improvement script teaches the system from failed, held, or draft publications by writing performance records and lessons into `AgentAuditLog`.

Dry run first:

```bash
npm run agents:improve
```

Apply lessons:

```bash
npm run agents:improve:apply
```

Optional JSON output for logs:

```bash
npx tsx scripts/improve-agents-from-publication-audit.ts --json
npx tsx scripts/improve-agents-from-publication-audit.ts --apply --json
```

What it does:

- audits recent `PUBLISHED`, `HELD`, and `DRAFT` publications;
- applies the same per-format business rules;
- detects failure modes such as `citation_gaps`, `provider_bias`, `overconfident`, and `shallow_methodology`;
- records `PERFORMANCE_RECORD` rows for `publisher`, `analyst`, `reader`, and `citation-guard`;
- stores reusable `LESSON_LEARNED` rows for `publisher` and `analyst`;
- feeds the existing memory injection system used by the agents.

Recommended production cadence:

```bash
npm run quality:audit
npm run quality:hold
npm run agents:improve:apply
npm run quality:audit
npm run build
```

## Publication Policy

Do not manually force `PUBLISHED` unless:

- the title is specific and not demo/test content;
- the publication has visible `[SRC-N]` citations;
- the source list is real, not `demo-*` or `source-*`;
- the business rule passes;
- the article reads like a think-tank output, not a generic AI essay.

If no publication passes, publish nothing. A clean empty archive is better than weak public content.
