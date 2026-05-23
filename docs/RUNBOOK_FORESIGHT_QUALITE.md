# NomosX — Runbook opérationnel (Foresight + Qualité institutionnelle)

> **Audience** : instance Cursor / opérateur sur machine avec accès shell + DB + clés API.  
> **Objectif** : lire ce document, exécuter les commandes **dans l’ordre**, valider le pipeline think tank et la qualité des publications au niveau France Stratégie / Harvard / McKinsey / RAND.

---

## 0. Instructions pour l’agent IA

Si tu es une instance Cursor chargée d’appliquer ce runbook :

1. **Clone / ouvre** le repo `NomosX-master` sur une machine où PowerShell/bash **peut exécuter** `npm` et `tsx`.
2. **Ne modifie pas** les fichiers marqués FIGÉS (voir §8) sauf demande explicite.
3. **Exécute les étapes 1 → 7 dans l’ordre**. Ne passe à l’étape suivante que si la précédente réussit (exit code 0) ou si l’échec est documenté et non bloquant.
4. **Capture** la sortie console de chaque commande dans ta réponse finale (résumé + erreurs éventuelles).
5. **Exit code attendu** : `0` pour audit standard ; `1` acceptable en `--strict` si le catalogue contient des pubs legacy sous Gold.

---

## 1. Prérequis machine

| Prérequis | Vérification |
|-----------|--------------|
| Node.js ≥ 18 | `node -v` |
| npm | `npm -v` |
| Accès réseau (npm, APIs) | — |
| PostgreSQL (Neon ou local) | `DATABASE_URL` dans `.env.local` |
| Clé OpenAI (pipeline + audit live) | `OPENAI_API_KEY` |
| Clé cron (tests E2E serveur) | `CRON_SECRET` (optionnel étape 7) |

### PowerShell Windows — débloquer l’exécution

Sur certaines machines Windows, Cursor ne peut pas lancer de scripts. **Avant toute commande** :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd "C:\chemin\vers\NomosX-master"
```

Alternative : **Git Bash** ou **WSL** (recommandé pour `tsx`).

---

## 2. Installation initiale (une fois)

```bash
cd NomosX-master
npm install
npx prisma generate
npx prisma db push
```

**Ce que `db push` crée / met à jour** :
- Modèle `ForesightRun` (télémétrie simulation par publication)
- Relation `ThinkTankPublication.foresightRun`

Si `db push` échoue : vérifier `DATABASE_URL`, droits DB, puis relancer.

---

## 3. Variables d’environnement

Copier `.env.example` → `.env.local` si absent, puis renseigner :

```bash
# Obligatoire
DATABASE_URL=postgresql://...

# Pipeline LLM
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview   # ou modèle configuré dans le projet

# Foresight Engine (optionnel — defaults OK)
NOMOSX_FORESIGHT_ENABLED=true
NOMOSX_FORESIGHT_MAX_COST_USD=5.5
NOMOSX_FORESIGHT_CHAT_RATE_LIMIT=10
NOMOSX_FORESIGHT_MIN_SEED_SOURCES=8

# Tests cron / E2E (optionnel)
CRON_SECRET=votre-secret
```

---

## 4. Architecture produit (contexte)

```
ThinkTankDispatcher (crons)
  → runAndPublishInquiry()          [lib/agent/inquiry-orchestrator.ts]
      VALIDATE → RUN → GATE → PERSIST

RUN = inquiry-pipeline.ts
  → runPipeline()                   [lib/agent/pipeline-v2.ts]
  → maybeRunSimulation()            [lib/agent/simulation-agent.ts v3]
  → persist brief.lineage + html enrichi
  → buildForesightPersistPayload

UI
  /inquiry/[slug]  →  GET /api/inquiry/[id]/foresight  →  ForesightPanel
  Chat persona     →  POST /api/foresight/chat
```

**Foresight v3** : Monte Carlo + swarm 1024 + GraphRAG + multi-seed + red-team + panel UI.

**Skip SCOUT** : si `seedSourceIds.length ≥ 8`, le pipeline réutilise les sources seed sans appeler les APIs scout (voir `pipeline-v2.ts`).

---

## 5. Scripts à exécuter — ordre recommandé

### Étape A — Backfill Foresight (publications existantes)

Reconstruit `criticalLoopResult.foresight`, injecte la section HTML « Simulated Outcomes » si absente.  
**Ne relance pas** la simulation LLM (pas de coût).

```bash
# 1. Dry-run (lecture seule, log uniquement)
npm run foresight:backfill:dry

# 2. Application
npm run foresight:backfill

# Options avancées
npx tsx scripts/backfill-foresight-metadata.ts --limit=50
npx tsx scripts/backfill-foresight-metadata.ts --dry-run --limit=10
```

**Succès attendu** :
- Log `Done: N updated, M skipped`
- Publications strategic/deep avec `simulation` dans `criticalLoopResult` → `foresight` peuplé
- HTML contient `data-nomosx-foresight="v3"` ou `id="simulated-outcomes"` si simulation présente

**Fichier** : `scripts/backfill-foresight-metadata.ts`

---

### Étape B — Audit institutionnel complet

Benchmarks : **France Stratégie · Harvard/Brookings · McKinsey GMI · RAND · NomosX Gate**.

```bash
# Audit standard (DB, ~30s, sans LLM)
npm run audit:institutional

# Uniquement publications PUBLISHED + mode strict (CI)
npm run audit:institutional:strict

# Complet : pipeline health + test LLM Critical Loop + rapport HTML
npm run audit:institutional:full

# Export JSON
npm run audit:institutional -- --json > audit-report.json

# Rapport HTML custom
npm run audit:institutional -- --html reports/audit-$(date +%Y%m%d).html

# Rétrograder en HELD les pubs score < 70 ou gate=hold
npm run audit:institutional -- --hold-failing --published-only
```

#### Toutes les options CLI

| Flag | Effet |
|------|--------|
| `--published-only` | Audite seulement `status=PUBLISHED` |
| `--limit=N` | Limite le nombre de publications scannées |
| `--json` | Sortie JSON stdout (CI / parsing) |
| `--html=path` | Génère un rapport HTML |
| `--pipeline` | Inclut santé PipelineRun / Jobs / Foresight |
| `--live-test` | Lance Critical Loop V2 sur article synthétique (**coût LLM**) |
| `--strict` | Exit 1 si toutes les pubs ne sont pas Gold+ (≥80) |
| `--hold-failing` | Passe en HELD les publications sous seuil |
| `--min-tier=silver` | Exit 1 si tier < silver (défaut) |

#### Tiers de score

| Tier | Score | Signification |
|------|-------|---------------|
| Platinum | ≥ 90 | Dépasse France Stratégie / Harvard |
| Gold | ≥ 80 | Think tank tier-1 |
| Silver | ≥ 70 | Publiable avec relecture |
| Bronze | ≥ 60 | Retenir / réviser |
| Fail | < 60 | Ne pas publier |

**Fichiers** :
- `scripts/institutional-quality-audit.ts` — CLI
- `lib/audit/institutional-quality.ts` — moteur (25+ checks)

---

### Étape C — Audit qualité business rules (legacy, complémentaire)

```bash
npm run quality:audit
npm run quality:audit -- --json
npm run quality:hold          # HELD si règles publication-visibility échouent
```

**Fichier** : `scripts/audit-publication-quality.ts`

---

### Étape D — Audit think tank infrastructure (offline)

```bash
node scripts/audit-think-tank.mjs
```

Vérifie : verticals ↔ signal detectors, researchers, search queries, cadence.

---

### Étape E — Test pipeline qualité (legacy coloré)

```bash
npx tsx scripts/quality-pipeline-test.ts audit
npx tsx scripts/quality-pipeline-test.ts test    # LLM — Critical Loop
npx tsx scripts/quality-pipeline-test.ts fix-markdown
```

---

## 6. Validation E2E (nouvelle publication)

Après backfill + audit, **valider une nouvelle inquiry strategic** :

### Option 1 — Via code (tsx one-shot)

Créer un script temporaire ou utiliser le dispatcher :

```typescript
import { runAndPublishInquiry } from "@/lib/agent/inquiry-orchestrator";

const result = await runAndPublishInquiry({
  question: "Impact des tarifs carbone sur la compétitivité industrielle en Europe",
  domain: "climate-energy",
  depth: "deep",
  source: "manual-test",
  signalId: undefined, // ou ID signal existant avec sourceIds
});
console.log(result);
```

```bash
npx tsx scripts/test-think-tank-e2e.mjs   # nécessite dev server :3000 + CRON_SECRET
```

### Option 2 — Checklist manuelle post-run

| Check | Où vérifier |
|-------|-------------|
| Brief persisté avec `lineage.simulation` | DB `Brief.lineage` |
| HTML section Foresight | `Brief.html` ou `ThinkTankPublication.html` |
| Panel UI | `/inquiry/[slug]` → onglet / section Foresight |
| API foresight | `GET /api/inquiry/{publicId}/foresight` → `{ available: true }` |
| Chat persona | `POST /api/foresight/chat` body `{ publicationId, personaId, message }` |
| ForesightRun row | DB `ForesightRun` lié à `publicationId` |
| Skip SCOUT | Logs pipeline : `SCOUT: skipped — using N seedSourceIds` |

---

## 7. Séquence complète pour l’autre instance (copier-coller)

```bash
# === SETUP ===
cd NomosX-master
npm install
npx prisma generate
npx prisma db push

# === FORESIGHT BACKFILL ===
npm run foresight:backfill:dry
npm run foresight:backfill

# === AUDIT INSTITUTIONNEL ===
npm run audit:institutional -- --pipeline --json > audit-initial.json
npm run audit:institutional -- --html audit-report.html

# === (Optionnel) Audit strict + hold ===
# npm run audit:institutional:strict
# npm run audit:institutional -- --hold-failing --published-only

# === (Optionnel) Test LLM Critical Loop ===
# npm run audit:institutional:full

# === (Optionnel) E2E serveur ===
# npm run dev   # terminal 1
# node scripts/test-think-tank-e2e.mjs   # terminal 2
```

---

## 8. Fichiers clés (cartographie)

```
lib/agent/
  inquiry-orchestrator.ts    # Funnel publication (VALIDATE→RUN→GATE→PERSIST)
  inquiry-pipeline.ts        # RUN + simulation + persist lineage/html
  pipeline-v2.ts             # SCOUT→INDEX→…→PUBLISHER (skip SCOUT si seeds)
  simulation-agent.ts        # Foresight Engine v3
  publication-gate.ts        # Gate publish/revise/hold
  devils-advocate.ts         # Gate adversarial
  critical-loop-v2.ts        # Révision itérative

lib/foresight/
  adapter.ts                 # extractForesight*, buildForesightPersistPayload
  persist-run.ts             # Prisma ForesightRun upsert
  persona-gate.ts            # Chat sécurisé (persona serveur)
  html-section.ts            # Section HTML Simulated Outcomes

lib/audit/
  institutional-quality.ts   # Moteur audit institutionnel

scripts/
  backfill-foresight-metadata.ts
  institutional-quality-audit.ts
  audit-publication-quality.ts
  audit-think-tank.mjs
  quality-pipeline-test.ts
  test-think-tank-e2e.mjs

components/foresight/        # ForesightPanel, PersonaChat, etc.
app/api/foresight/chat/      # POST chat
app/api/inquiry/[id]/foresight/  # GET bundle

prisma/schema.prisma         # ForesightRun model
```

### Fichiers FIGÉS (ne pas modifier sans autorisation)

- `tailwind.config.mjs`, `app/globals.css`, `components/signature/*`
- `app/page.tsx` (copy marketing seulement si demandé)
- `lib/types/inquiry.ts` (extensions OK seulement)

---

## 9. Critères de succès (Definition of Done)

L’instance peut considérer le runbook **réussi** si :

- [ ] `npx prisma db push` OK
- [ ] `npm run foresight:backfill:dry` puis `foresight:backfill` OK
- [ ] `npm run audit:institutional` exit 0 (ou exit 1 documenté en `--strict` avec plan de remédiation)
- [ ] Aucun `PipelineRun` RUNNING > 45 min (`--pipeline`)
- [ ] Au moins 1 publication strategic avec `foresight.available=true` via API (après backfill ou nouvelle run)
- [ ] Rapport `audit-report.json` ou `audit-report.html` généré et archivé

---

## 10. Dépannage

| Problème | Solution |
|----------|----------|
| `ExecutionPolicy` PowerShell | `Set-ExecutionPolicy -Scope Process Bypass` ou Git Bash/WSL |
| `ForesightRun` model unknown | `npx prisma generate` puis `db push` |
| `[ForesightRun] persist skipped` | Migration non appliquée — refaire `db push` |
| Panel Foresight vide sur anciennes pubs | Lancer `npm run foresight:backfill` |
| Audit tier FAIL massif | Normal sur catalogue demo/legacy — filtrer `--published-only`, exclure demos (`publication-visibility.ts`) |
| `--live-test` échoue | Vérifier `OPENAI_API_KEY`, quota, modèle |
| SCOUT pas skipped | Vérifier `seedSourceIds.length >= 8` passé à `runPipeline()` |
| Chat persona 403/429 | Rate limit IP ; vérifier `NOMOSX_FORESIGHT_ENABLED` |

---

## 11. Scripts npm — référence rapide

```json
"foresight:backfill": "tsx scripts/backfill-foresight-metadata.ts"
"foresight:backfill:dry": "tsx scripts/backfill-foresight-metadata.ts --dry-run"
"audit:institutional": "tsx scripts/institutional-quality-audit.ts"
"audit:institutional:strict": "tsx scripts/institutional-quality-audit.ts --strict --published-only"
"audit:institutional:full": "tsx scripts/institutional-quality-audit.ts --pipeline --live-test --html audit-report.html"
"quality:audit": "tsx scripts/audit-publication-quality.ts"
"quality:hold": "tsx scripts/audit-publication-quality.ts --hold"
```

---

## 12. Prompt suggéré pour l’autre instance Cursor

Copier-coller dans le chat de l’autre machine :

```
Lis intégralement docs/RUNBOOK_FORESIGHT_QUALITE.md et exécute la séquence §7 
(setup → db push → foresight backfill dry+apply → audit institutionnel avec 
--pipeline et export JSON + HTML). 

Règles :
- Ne pas modifier les fichiers FIGÉS (§8)
- Ne pas commit sauf si je le demande
- Me rendre un rapport final : exit codes, résumé audit (tiers, benchmarks), 
  erreurs, et prochaines actions si exit ≠ 0
```

---

*Dernière mise à jour : session Foresight v3 + P2 (skip SCOUT, ForesightRun, backfill, audit institutionnel).*
