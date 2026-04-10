# NomosX

**Le think tank agentique de nouvelle génération**  
De la recherche académique à l'intelligence stratégique, automatiquement.

---

## 🎯 Vision

NomosX est le **premier think tank personnel autonome** qui orchestre 15+ agents IA spécialisés pour transformer la recherche académique (250M+ sources OpenAlex) en insights décisionnels exploitables.

**Pas un outil de recherche** — Un think tank automatisé avec intelligence collective.

### 🏆 Avantages Uniques

| Ce que vous obtenez | Comment | Concurrent |
|---------------------|---------|------------|
| **8 Perspectives PhD** | 8 experts domaines (MIT, Stanford, Oxford, Johns Hopkins, Georgetown, Yale, ETH, Harvard) | ❌ Aucun (STORM = questions, DeepDebater = research) |
| **Decision-Ready en 60s** | De la question au brief structuré (10-15 sections) | ⚠️ Semantic Scholar, Consensus = research-ready |
| **Radar Signaux Faibles** | Auto-détection tendances émergentes (novelty ≥ 60) | ❌ Aucun concurrent |
| **Intent-First UX** | 1 question → Auto-sélection → Brief | ⚠️ Perplexity (conversational mais général) |
| **Citations Vérifiées** | Citation Guard + [SRC-*] tracées | ✅ Consensus, Scite (mais pas multi-perspectives) |
| **V5 Harvard Council** | Débat contradictoire avec review board Oxford CEBM | ❌ Aucun concurrent |
| **V4 Agents Autonomes** | Context Primer, Orchestrator, Editorial Planner | ❌ Aucun concurrent |
| **Meta-Analysis Engine** | Cohen's d, forest plots, I², Egger's test | ❌ Aucun concurrent |

**Positionnement** : Think Tank Autonome pour Décideurs Stratégiques  
**Cible** : C-level, Consultants, Innovation Directors, Policy Makers, Chercheurs Senior

---

## 🏗️ Architecture

### Pipeline agentic V5

```
V4 AUTONOMOUS LAYER:
CONTEXT PRIMER → Knowledge Graph + prior briefs enrichment
ORCHESTRATOR   → 4 checkpoint evaluators + RE_SCOUT loops
EDITORIAL PLANNER → Trend detection + auto-commission

V3 CORE PIPELINE:
SCOUT      → Collecte multi-sources (OpenAlex 250M+, 66+ providers)
INDEX      → Enrichissement identités (ROR, ORCID) + déduplication
EMBED      → Hybrid semantic + full-text search
DEDUP      → DOI-based deduplication
RANK       → Sélection stratégique (qualité, nouveauté, diversité)
READER V3  → PDF full-text + extraction quantitative
ANALYST V3 → Multi-pass synthesis (thematic → contradictions → synthesis)
GUARD      → Validation citations (zéro hallucination)
EDITOR     → Rendu HTML premium
CITATION VERIFIER → Semantic + LLM verification

V2 ADVANCED LAYER:
CRITICAL LOOP V2 → Iterative critique + 3 parallel critics
DEBATE AGENT → Steel-man adversarial + 2-pass LLM
META-ANALYSIS ENGINE → Cohen's d, forest plots, I², Egger's
KNOWLEDGE GRAPH → ConceptNode + longitudinal tracking
PUBLISHER → Multi-format output
DIGEST     → Veille hebdomadaire par topic
RADAR      → Détection signaux faibles

V5 HARVARD COUNCIL:
8 PhD RESEARCHERS → MIT, Stanford, Oxford, Johns Hopkins, Georgetown, Yale, ETH, Harvard
EVIDENCE GRADER → Oxford CEBM levels + GRADE framework
ADVERSARIAL REVIEW BOARD → Methodologist, Statistician, Devil's Advocate
SYNTHESIS DIRECTOR → Final integrated analysis
```

### Stack technique

- **Frontend**: Next.js 16 + React 18 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes + Prisma ORM + Neon PostgreSQL
- **Base de données**: PostgreSQL (250M+ sources OpenAlex + Knowledge Graph)
- **IA**: OpenAI GPT-4 Turbo (temp 0.1-0.4 selon agent) + Anthropic Claude (fallback)
- **Providers**: 66+ providers (OpenAlex, CrossRef, PubMed, Semantic Scholar, arXiv, SSRN, CORE, DOAJ, RePEc, EuropePMC, Google CSE, etc.)
- **Queue**: Redis (Upstash) + job processing
- **Email**: Resend (newsletter + digests)
- **Monitoring**: Sentry + custom health checks
- **Deployment**: Netlify (Edge Functions) + GitHub Actions CI/CD

---

## ✨ Features Uniques

### 🎯 V5 Harvard Council (9 PhD Researchers)

Analyse **9 perspectives expertes** automatiquement :

```
� Dr. Elena Vasquez (MIT PhD) → Econometrics & Policy Economics
🤖 Dr. James Chen (Stanford PhD) → AI/ML & Digital Systems  
🏛️ Dr. Amara Okafor (Oxford PhD) → Public Policy & Governance
🏥 Dr. Sarah Lindström (Johns Hopkins PhD) → Epidemiology & Public Health
🔒 Dr. Marcus Webb (Georgetown PhD) → Strategic Security & Intelligence
⚖️ Dr. Isabelle Moreau (Yale Law PhD) → International Law & Regulatory Frameworks
🌍 Dr. Kenji Tanaka (ETH Zurich PhD) → Climate Science & Environmental Systems
📈 Dr. Priya Sharma (Harvard Stats PhD) → Quantitative Methods & Causal Inference

+ Evidence Grader (Oxford CEBM) + Adversarial Review Board + Synthesis Director
```

**Unique sur le marché** — Aucun concurrent (8 experts PhD vs single AI analysis)

---

### 📡 Radar Signaux Faibles

Détection **automatique** des tendances émergentes :

```
✅ Novelty Score ≥ 60 auto-filtré
✅ GPT-4 identifie pertinence stratégique
✅ 3 niveaux confiance (high/medium/low)
✅ Abonnement email digest hebdo
✅ Contenu autonome (lecture directe, pas de génération)
```

**Unique sur le marché** — Aucun concurrent n'a de push proactif signaux faibles

---

### ⚡ Intent-First UX

De la question au brief en **1 clic, 60 secondes** :

```
1. User tape question
2. Smart selection auto (11 domaines détectés)
3. Providers optimaux sélectionnés (ex: Santé → PubMed + OpenAlex)
4. Quantité ajustée par complexité (12-25 sources)
5. Brief 10 sections généré avec citations [SRC-*] vérifiées

→ ZÉRO décision technique requise
```

**Meilleur UX du marché** — Niveau Lovable/Linear

---

### 📊 Decision-Ready Output

**Brief Standard** (10 sections) :
```
1. Résumé Exécutif + Key Findings
2. Consensus Scientifique
3. Points de Débat + Controversies
4. Pour & Contre (argumentaires)
5. Qualité des Preuves
6. Implications Stratégiques
7. Risques & Limitations
8. Questions Ouvertes
9. What Changes Our Mind
10. Sources (12+ avec métadonnées)
```

**Strategic Report** (15 sections, V5 Council) :
```
1. Executive Summary + Key Findings
2. Literature Review (frameworks, methodologies)
3. Thematic Analysis (themes, consensus, controversies, trends)
4. Debate (position 1, position 2, synthesis, nuances)
5. Evidence Quality Assessment (1-10 score)
6. Stakeholder Impact Matrix
7. Scenario Planning (3-5 scenarios with probabilities)
8. Recommendations (immediate, short-term, long-term, risk mitigation)
9. Implementation Roadmap
10. Conclusion + Open Questions
+ 5 sections détaillées par domaine expert
```

**Decision-ready** (pas research-ready comme Semantic Scholar/Consensus)

---

### 🔒 Citations Vérifiées

Citation Guard + Traçabilité totale :

```
✅ Chaque claim référence [SRC-1][SRC-3]
✅ Guard vérifie 100% citations valides
✅ Sources avec auteurs, année, provider, qualityScore
✅ Impossible de générer brief sans citations
```

**Zéro hallucination garantie**

---

## 🚀 Installation

### Prérequis

- Node.js 20.19.0+ (Next.js 16 compatible)
- PostgreSQL 14+ (Neon recommandé)
- OpenAI API Key
- Redis (Upstash recommandé)

### 1. Cloner et installer

```bash
git clone <repo>
cd NomosX
npm install
```

### 2. Configuration environnement

Créez un fichier `.env` à la racine :

```bash
# === REQUIRED ===
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/nomosx
DATABASE_URL_UNPOOLED=postgresql://user:password@localhost:5432/nomosx
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o

# === SECURITY ===
JWT_SECRET=your-super-secret-jwt-key-32-chars-minimum
ADMIN_KEY=admin-nomosx-secure-key-2026
CRON_SECRET=cron-nomosx-webhook-secret-2026

# === REDIS (Upstash) ===
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AYyVAAIncDFl...

# === EMAIL ===
EMAIL_PROVIDER=resend
FROM_EMAIL=noreply@nomosx.com
RESEND_API_KEY=re_gr7fKc9T_N44HbXahfGwtbj8xuAornxAY

# === PROVIDERS ===
GOOGLE_CSE_API_KEY=AIzaSyBqGDe5CwvmhtVcebCVz0nrXu28qPPhZS8
GOOGLE_CSE_CX=052848175e3404dc6
LINKUP_API_KEY=800bf484-ccbd-4b51-acdb-8a86d36f7a1e
UNPAYWALL_EMAIL=your-email@example.com

# === MONITORING ===
SENTRY_DSN=
SENTRY_ORG=nomosx
SENTRY_PROJECT=nomosx-production

# === Next.js ===
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Base de données

```bash
# Générer le client Prisma
npm run prisma:gen

# Créer le schéma
npm run db:push

# (Optionnel) Seeder des données de démo
npm run seed
```

### 4. Lancer l'application

```bash
# Dev server
npm run dev

# Worker (pour jobs asynchrones)
npm run worker
```

Accédez à [http://localhost:3000](http://localhost:3000)

---

## 📁 Structure du projet

```
NomosX/
├── app/                        # Next.js App Router
│   ├── page.tsx               # Landing page
│   ├── dashboard/             # Vue d'ensemble
│   ├── radar/                 # Signaux faibles
│   ├── search/                # Recherche sources
│   ├── brief/                 # Générateur brief
│   ├── briefs/                # Bibliothèque
│   ├── council/               # Débat multi-angles
│   ├── digests/               # Veille hebdomadaire
│   ├── topics/                # Topics publics
│   ├── about/                 # Méthodologie
│   ├── settings/              # Admin (topics, ingestion, monitoring)
│   └── api/                   # API Routes
│       ├── radar/
│       ├── search/
│       ├── briefs/
│       ├── council/
│       ├── digests/
│       ├── topics/
│       ├── stats/
│       └── runs/
├── components/                # React components
│   ├── Shell.tsx              # Layout principal
│   └── ui/                    # Design system
├── lib/                       # Business logic
│   ├── agent/                 # Agents pipeline
│   │   ├── pipeline-v2.ts     # SCOUT, RANK, ANALYST, GUARD, EDITOR
│   │   ├── index-agent.ts     # INDEX (enrichissement)
│   │   ├── reader-agent.ts    # READER (extraction)
│   │   ├── analyst-agent.ts   # ANALYST (synthèse)
│   │   ├── digest-agent.ts    # DIGEST (veille)
│   │   └── radar-agent.ts     # RADAR (signaux faibles)
│   ├── db.ts                  # Prisma client
│   ├── env.ts                 # Validation env vars (Zod)
│   └── email.ts               # Service email
├── prisma/
│   └── schema.prisma          # Schéma DB
├── scripts/
│   ├── worker.mjs             # Job worker
│   └── seed.mjs               # Seeder données démo
└── public/                    # Assets statiques
```

---

## 🎨 Design System

### Palette de couleurs

```css
--bg: #0B0E12          /* Background principal */
--panel: #10151D       /* Panels */
--panel2: #1C2130      /* Panels secondaires */
--border: #232833      /* Bordures */
--text: #EDE9E2        /* Texte principal */
--muted: #8B8F98       /* Texte secondaire */
--accent: #5EEAD4      /* Accent (teal) */
--ai: #4C6EF5          /* IA features (bleu) */
--danger: #FB7185      /* Erreurs (rose) */
--success: #10B981     /* Succès (vert) */
```

### Composants UI

- `Button` : variants (primary, secondary, ghost, ai, success, danger)
- `Card` : variants (default, premium, error)
- `Badge` : variants (default, ai, success, warning, error, premium)
- `Input`, `Textarea`, `Skeleton`, `Modal`

### Animations

- `animate-fade-in` : Fade in simple
- `animate-spring-in` : Entrée avec spring
- `ai-line` : Ligne gradient animée

---

## 🧪 API Routes

### Publiques

- `GET /api/radar?limit=5` → RadarCards
- `GET /api/digests?topicId=...&limit=20` → Liste digests
- `GET /api/topics` → Liste topics
- `GET /api/briefs?limit=30` → Liste briefs
- `POST /api/briefs` → Créer brief
- `POST /api/council/ask` → Débat multi-angles
- `GET /api/search?q=...` → Recherche sources
- `GET /api/stats` → Statistiques système

### Admin (require `x-admin-key` header)

- `POST /api/topics` → Créer topic
- `PATCH /api/topics/:id` → Modifier topic
- `DELETE /api/topics/:id` → Supprimer topic
- `POST /api/runs` → Créer ingestion run
- `POST /api/digests/send` → Envoyer digest par email

---

## 🔐 Sécurité

### Authentification

Actuellement : **Accès ouvert** (pas d'auth requise pour utiliser l'app).

Pour ajouter de l'authentification :
- **Recommandé** : NextAuth.js ou Clerk
- Protéger `/settings` avec middleware
- Limiter rate-limiting sur API publiques

### Admin

Les routes admin nécessitent un header `x-admin-key` :

```bash
curl -X POST http://localhost:3000/api/topics \
  -H "x-admin-key: your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"name":"Climate Policy","query":"carbon tax","tags":["climate","policy"]}'
```

### CORS

Par défaut, les API Routes Next.js sont same-origin. Pour exposer une API publique, configurer CORS dans chaque route.

---

## 📊 Base de données

### Modèles principaux

```
Source          → Publications académiques
Author          → Chercheurs (avec ORCID)
Institution     → Institutions (avec ROR)
Topic           → Domaines de veille
Brief           → Synthèses générées
Digest          → Veille hebdomadaire
Job             → Queue jobs asynchrones
IngestionRun    → Historique ingestions
```

### Migrations

```bash
# Créer migration
npx prisma migrate dev --name description

# Appliquer en prod
npx prisma migrate deploy

# Studio (GUI)
npx prisma studio
```

---

## 🤖 Agents

### Configuration

Chaque agent a des paramètres configurables :

```typescript
// lib/agent/pipeline-v2.ts
const SCOUT_PER_PROVIDER = 20;    // Sources par provider
const RANK_LIMIT = 12;            // Top sources pour analyse
const READER_TEMP = 0.1;          // Température GPT-4
const ANALYST_TEMP = 0.2;
const DIGEST_TEMP = 0.3;
const RADAR_TEMP = 0.4;
```

### Déterminisme

| Agent    | Déterminisme | Variance                     |
|----------|--------------|------------------------------|
| SCOUT    | Semi         | APIs externes                |
| INDEX    | Semi         | Lookups ROR/ORCID            |
| RANK     | Full         | —                            |
| READER   | Semi         | LLM (temp=0.1)               |
| ANALYST  | Semi         | LLM (temp=0.2)               |
| GUARD    | Full         | —                            |
| EDITOR   | Full         | —                            |
| DIGEST   | Semi         | LLM (temp=0.3)               |
| RADAR    | Semi         | LLM (temp=0.4)               |
| COUNCIL  | Semi         | LLM                          |

### Retry & Error Handling

- **GUARD** force retry ANALYST si citations invalides (max 3 attempts)
- **Jobs** : 3 retries avec backoff exponentiel
- **Providers SCOUT** : fail-safe (continue avec autres sources)

---

## 🚨 Monitoring

### Dashboard `/settings`

- **Vue d'ensemble** : sources, briefs, topics, digests
- **Jobs** : pending, failed
- **Sources** : coverage embeddings, répartition providers

### Logs

```bash
# Logs application
npm run dev

# Logs worker
npm run worker

# Logs Prisma
DATABASE_URL=... npx prisma studio
```

### Métriques recommandées

```sql
-- Performance agents
SELECT type, AVG(EXTRACT(EPOCH FROM (finishedAt - startedAt))) as avg_seconds
FROM "Job" WHERE status='DONE'
GROUP BY type;

-- Taux d'échec
SELECT type, 
  COUNT(*) FILTER (WHERE status='FAILED') * 100.0 / COUNT(*) as failure_rate
FROM "Job" GROUP BY type;

-- Qualité citations
SELECT id, question, 
  LENGTH(html) - LENGTH(REPLACE(html, '[SRC-', '')) / 5 as citation_count
FROM "Brief"
WHERE LENGTH(html) - LENGTH(REPLACE(html, '[SRC-', '')) / 5 < 3;
```

---

## 📖 Documentation complète

### Pages clés

- `/about` → Architecture des 10 agents, sources de données, limites/biais
- `/dashboard` → Vue d'ensemble activité récente
- `/settings` → Admin (topics, ingestion, monitoring)
- `AGENTS.md` → Spécification complète du pipeline agentic

### Ressources externes

- [OpenAlex API](https://docs.openalex.org/)
- [CrossRef API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [Semantic Scholar API](https://api.semanticscholar.org/)
- [ROR API](https://ror.readme.io/docs/rest-api)
- [ORCID API](https://info.orcid.org/documentation/)
- [Prisma Docs](https://www.prisma.io/docs/)

---

## 🐛 Troubleshooting

### La base de données ne se connecte pas

```bash
# Vérifier la connexion
psql $DATABASE_URL

# Réinitialiser le schéma
npm run db:push
```

### Les agents ne répondent pas

1. Vérifier `OPENAI_API_KEY` dans `.env`
2. Vérifier les quotas OpenAI
3. Regarder les logs : erreurs 429 (rate limit) ou 500

### Le worker ne traite pas les jobs

```bash
# Vérifier jobs pending
psql $DATABASE_URL -c 'SELECT * FROM "Job" WHERE status='"'"'PENDING'"'"';'

# Relancer worker
npm run worker
```

### Pas de résultats de recherche

1. Lancer une ingestion : `/settings` → Ingestion → Créer run
2. Lancer le worker : `npm run worker`
3. Attendre fin traitement (SCOUT → INDEX)

---

## Déploiement

### Netlify (Production)

```bash
# Variables d'environnement dans Netlify UI
NODE_VERSION=20.19.0
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-proj-...
JWT_SECRET=...
ADMIN_KEY=...
# + toutes les autres variables .env

# Build configuration (netlify.toml)
[build]
  command = "npm cache clean --force && npm install && npm run build"
  publish = ".next"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "20.19.0"
  NPM_VERSION = "10"
  SHARP_IGNORE_GLOBALVIPS = "1"
  SHARP_GLOBAL_BASEDIR = "/opt/buildhome/.npm-global"
```

### Vercel (Alternative)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Variables d'environnement
vercel env add DATABASE_URL
vercel env add OPENAI_API_KEY
# ... etc
```

### Railway / Render

1. Connecter repo GitHub
2. Configurer variables d'environnement
3. Build command : `npm run build`
4. Start command : `npm start`

### Worker séparé

Le worker doit tourner en process séparé :

```bash
# Sur serveur dédié ou service worker
npm run worker

# Ou via PM2
pm2 start npm --name "nomosx-worker" -- run worker
```

---

## 🎓 Crédits

### Sources de données

- **OpenAlex** : Index ouvert 250M+ publications
- **CrossRef** : 70M+ DOIs
- **Semantic Scholar** : 200M+ papers
- **Theses.fr** : Thèses doctorales françaises
- **ROR** : Registry of Research Organizations
- **ORCID** : Open Researcher and Contributor ID

### Technologies

Built with ❤️ using:
- Next.js, React, TypeScript, Tailwind CSS
- Prisma, PostgreSQL
- OpenAI GPT-4 Turbo
- Resend (email)

---

## 📄 Licence

Propriétaire © 2026 NomosX

---

## 🤝 Contact

Questions, feedback, partenariats : **contact@nomosx.ai**

---

**NomosX v1.0 — Intelligence stratégique autonome**
