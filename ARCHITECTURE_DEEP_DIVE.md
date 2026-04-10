# NomosX — Architecture Deep Dive
## Think Tank Agentique IA Autonome

**Date**: 4 Mars 2026 | **Scope**: Full codebase audit | **Verdict**: B+ (78/100) → A possible

---

## 1. VUE D'ENSEMBLE — CE QUI EXISTE

### 1.1 Architecture Globale
```
┌─────────────────────────────────────────────────────────────────┐
│                     NomosX Think Tank                           │
├─────────────────────────────────────────────────────────────────┤
│  FRONTEND: Next.js 16 / TailwindCSS / React                    │
│  BACKEND:  Next.js API Routes (serverless)                      │
│  DATABASE: Prisma + Neon (PostgreSQL) + pgvector                │
│  CACHE:    Redis (Upstash) + in-memory fallback                 │
│  LLM:     OpenAI (gpt-4o, gpt-4-turbo) + Anthropic (Claude)    │
│  DEPLOY:  Netlify (serverless functions)                        │
│  MONITOR: Sentry (client + server + edge)                       │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Chiffres Cles
| Metrique | Valeur | Verdict |
|---|---|---|
| Fichiers dans `lib/agent/` | **112** | ⚠️ Beaucoup trop — 40+ sont morts |
| Fichiers `@ts-nocheck` | **10** | 🔴 Code non-type = risque |
| Providers academiques | **88+** | ✅ Excellent coverage |
| PhD Researchers | **22** | ✅ Complet apres refactor |
| Pipeline steps | **16** | ✅ Bien structure |
| Fichiers placeholder/stub | **3** | ⚠️ A supprimer |

---

## 2. LE PIPELINE — FUNNEL DE PRODUCTION

### 2.1 Pipeline Principal (Source de Verite)
**Fichier**: `lib/agent/pipeline-v2.ts` (2042 lignes)

```
Step 0:  CONTEXT PRIMER     -> Memoire institutionnelle + Knowledge Graph
Step 1:  SCOUT              -> 54+ providers, smart selection, Redis cache
Step 2:  INDEX              -> Normalise, enrichit (ROR, ORCID, Unpaywall)
Step 3:  EMBED              -> Vecteurs semantiques (text-embedding-3-small)
Step 4:  DEDUPLICATE        -> Par DOI + semantique
Step 5:  RANK               -> Quality/novelty/balanced + Cohere reranking
Step 6:  READER V3          -> PDF full-text + extraction quantitative
Step 7:  ANALYST            -> Brief: Multi-pass V3 / Strategic: Strategic Analyst
Step 8:  HARVARD COUNCIL    -> 22 PhD experts + Evidence Grading + Adversarial Review
Step 9:  CITATION GUARD     -> Validation [SRC-N]
Step 10: EDITOR             -> HTML rendering (brief ou strategic)
Step 11: CITATION VERIFIER  -> Verification semantique des citations
Step 12: CRITICAL LOOP V2   -> Critique iterative, seuil dynamique
Step 13: DEBATE + META      -> Steel-man adversarial + Cohen's d / I-squared
Step 14: DEVIL'S ADVOCATE   -> Challenges epistemiques, gate publish
Step 15: PUBLISHER          -> Publication Prisma + lineage tracking
Step 16: KNOWLEDGE GRAPH    -> ConceptNode + ConceptRelation
```

**Verdict Pipeline**: ✅ **EXCELLENT** — Pipeline unifie, bien orchestre, 16 steps reels.

### 2.2 Orchestrateur Adaptatif
**Fichier**: `lib/agent/orchestrator.ts` (374 lignes)

4 checkpoints intelligents dans le pipeline:
- **assessAfterScout** -> RE_SCOUT si sources insuffisantes
- **assessAfterReader** -> DEEPEN si abstracts insuffisants
- **assessAfterAnalyst** -> RE_ANALYZE ou DEBATE si confiance basse
- **assessAfterCriticalLoop** -> PIVOT si nouveau angle detecte

Seuils calibres dynamiquement via AgentMemory.

**Verdict**: ✅ **EXCELLENT** — Comportement de senior analyst, pas un script lineaire.

---

## 3. LES AGENTS AI — INVENTAIRE COMPLET

### 3.1 Agents ACTIFS (cables dans pipeline-v2.ts)
| Agent | Fichier | Role | LLM? |
|---|---|---|---|
| Context Primer | `context-primer.ts` | Memoire + KG pre-analyse | ✅ |
| Scout | `pipeline-v2.ts` | Recherche multi-provider | ❌ |
| Index Agent | `index-agent.ts` | Normalisation + enrichissement | ❌ |
| Semantic Engine | `semantic-engine.ts` | Embeddings + cosine scoring | ❌ |
| Enhanced Ranker | `enhanced-ranker.ts` | Ranking multi-critere | ❌ |
| Cohere Reranker | `cohere-reranker.ts` | Neural reranking | API |
| Reader V3 | `reader-agent-v3.ts` | PDF + quant extraction | ✅ |
| Analyst Multi-pass | `analyst-multipass.ts` | 3-pass analysis | ✅ |
| Strategic Analyst | `strategic-analyst-agent.ts` | Rapport 10-15 pages | ✅ |
| PhD Researcher | `phd-researcher.ts` | 22 experts paralleles | ✅ |
| Evidence Grader | `review-board.ts` | Oxford CEBM + GRADE | ✅ |
| Review Board | `review-board.ts` | 3 adversarial reviewers | ✅ |
| Synthesis Director | `review-board.ts` | Reconciliation finale | ✅ |
| Harvard Council Enhanced | `harvard-council-enhanced.ts` | 22 PhD + hierarchique | ✅ |
| Citation Guard | `pipeline-v2.ts` | Validation [SRC-N] | ❌ |
| Citation Verifier | `citation-verifier.ts` | Verification semantique | ✅ |
| Critical Loop V2 | `critical-loop-v2.ts` | Critique iterative | ✅ |
| Debate Agent | `debate-agent.ts` | Steel-man adversarial | ✅ |
| Meta-Analysis | `meta-analysis-engine.ts` | Cohen's d, forest plots | ✅ |
| Devil's Advocate | `devils-advocate.ts` | Challenge + publish gate | ✅ |
| Knowledge Graph | `knowledge-graph.ts` | Concept extraction | ✅ |
| Agent Memory | `agent-memory.ts` | Performance + calibration | ✅ |
| Query Enhancer | `query-enhancer.ts` | LLM query expansion | ✅ |
| Relevance Scorer | `relevance-scorer.ts` | Score de pertinence | ❌ |
| Smart Provider Selector | `smart-provider-selector.ts` | Selection intelligente | ❌ |
| Provider Health Tracker | `provider-health-tracker.ts` | Circuit breaker | ❌ |
| Source Reputation | `source-reputation-agent.ts` | Quality tracking | ❌ |
| Prediction Auditor | `prediction-auditor.ts` | Verification predictions | ❌ |
| Signal Detector | `signal-detector.ts` | Detection signaux faibles | ✅ |
| Trend Analyzer | `trend-analyzer.ts` | Analyse tendances | ✅ |
| Contradiction Detector | `contradiction-detector.ts` | Detection contradictions | ✅ |
| Editorial Planner | `editorial-planner.ts` | Planification editoriale | ✅ |
| Editorial Gate | `editorial-gate.ts` | Quality gate publication | ❌ |
| Cadence Enforcer | `cadence-enforcer.ts` | Limite publications | ❌ |
| Publication Generator | `publication-generator.ts` | Generation finale | ✅ |
| Auto-Publisher | `auto-publisher.ts` | Orchestration autonome | ✅ |
| Researcher Identity | `researcher-identity.ts` | Profils + predictions | ✅ |
| Researcher Ownership | `researcher-ownership.ts` | Domain ownership + sign-off | ✅ |

**Total agents actifs: ~37**

### 3.2 Agents MORTS / DOUBLONS (a supprimer)
| Fichier | Probleme | Action |
|---|---|---|
| `evidence-grader.ts` (533B) | **PLACEHOLDER STUB** — gradeEvidence() hardcode | SUPPRIMER |
| `adversarial-review.ts` (855B) | **PLACEHOLDER STUB** — conductAdversarialReview() hardcode | SUPPRIMER |
| `synthesis-director.ts` (728B) | **PLACEHOLDER STUB** — directSynthesis() hardcode | SUPPRIMER |
| `phd-researcher-expanded.ts` (3KB) | **PLACEHOLDER STUB** — interfaces + fonctions vides | SUPPRIMER |
| `elite-analyst.ts` (18KB) | `@ts-nocheck`, importe 1x pipeline-v2 mais **non utilise en prod** | DEAD CODE |
| `enhanced-analyst.ts` (15KB) | `@ts-nocheck`, importe 1x pipeline-v2 mais **non utilise en prod** | DEAD CODE |
| `ultimate-analyst.ts` (8KB) | `@ts-nocheck`, importe 1x pipeline-v2 mais **non utilise en prod** | DEAD CODE |
| `nomosx-council.ts` (15KB) | **DOUBLON** de harvard-council-enhanced.ts, jamais importe | SUPPRIMER |
| `think-tank-core.ts` (26KB) | `@ts-nocheck`, jamais importe par l'app | DEAD CODE |
| `think-tank-automation.ts` (35KB) | `@ts-nocheck`, jamais importe par l'app | DEAD CODE |
| `pipeline-orchestrator.ts` (26KB) | `@ts-nocheck`, "Y-Combinator Level" mais jamais utilise par l'app | DEAD CODE |
| `domain-intelligence.ts` (36KB) | `@ts-nocheck`, importe par 3 fichiers @ts-nocheck morts | DEAD TREE |
| `visualization-generator.ts` (13KB) | `@ts-nocheck`, importe uniquement par elite/enhanced-analyst (dead) | DEAD CODE |
| `analyst-agent.ts` (9KB) | **V1 LEGACY** — remplace par `analyst-multipass.ts` | LEGACY |
| `reader-agent.ts` (9KB) | **V1 LEGACY** — remplace par `reader-agent-v3.ts` | LEGACY |
| `omega-verification.ts` (agent/) | Doublonne par `reference-system/omega-verification.ts` | DOUBLON |
| `reference-publisher.ts` (agent/) | Doublonne par `reference-system/reference-publisher.ts` | DOUBLON |

**Total dead code estime: ~250KB / 17 fichiers**
Le codebase actif est enterre sous du dead code. C'est le probleme #1.

### 3.3 Diagnostic Doublons — Registres Experts
Il existe **4 registres differents** pour les memes 22 chercheurs:

| Fichier | Contenu | Utilise par |
|---|---|---|
| `phd-researcher.ts` EXPERT_PERSONAS | Nom + system prompt (22 entrees) | `runExpertAnalysis()` — **ACTIF** |
| `researcher-identity.ts` expertNames | Nom mapping (22 entrees) | `buildResearcherProfile()` — **ACTIF** |
| `researcher-ownership.ts` RESEARCHER_REGISTRY | Profil complet + threshold (22 entrees) | `detectOwners()`, sign-off — **ACTIF** |
| `domain-expertise.ts` DOMAIN_EXPERTS | Nom + keywords + providers (22 entrees) | vertical-intelligence — **PARTIELLEMENT ACTIF** |
| `domain-expert.ts` DOMAIN_EXPERTS | Nom + methodologies + biases (22 entrees) | council-manager — **PARTIELLEMENT ACTIF** |

**Probleme**: 5 sources de verite pour les memes 22 chercheurs. Si un nom change, il faut le changer dans 5 fichiers.
**Risque**: Desynchro (deja arrive — on a corrige 11 noms incorrects dans la session precedente).

---

## 4. LES 22 PhD RESEARCHERS — IDENTITE, AUTONOMIE, OWNERSHIP

### 4.1 Registre Complet des Chercheurs
| # | Domaine | Chercheur | Institution | Statut |
|---|---|---|---|---|
| 1 | economics | Dr. Elena Vasquez | MIT | ✅ Coherent |
| 2 | technology | Dr. James Chen | Stanford | ✅ Coherent |
| 3 | policy | Dr. Amara Okafor | Oxford | ✅ Coherent |
| 4 | health | Dr. Sarah Lindstrom | Johns Hopkins | ✅ Coherent |
| 5 | security | Dr. Marcus Webb | Georgetown | ✅ Coherent |
| 6 | law | Dr. Isabelle Moreau | Yale Law | ✅ Coherent |
| 7 | environment | Dr. Kenji Tanaka | ETH Zurich | ✅ Coherent |
| 8 | quantitative | Dr. Priya Sharma | Harvard Stats | ✅ Coherent |
| 9 | finance | Dr. Michael Roberts | Wharton/Chicago Booth | ✅ Corrige (etait Webb) |
| 10 | social-sciences | Dr. Fatima Al-Rashidi | LSE | ✅ Corrige |
| 11 | geopolitics | Dr. Hans Mueller | Hertie/IISS | ✅ Corrige |
| 12 | energy-advanced | Dr. Lucia Fernandez | Imperial College | ✅ Corrige |
| 13 | digital-society | Dr. Yuki Nakamura | Tokyo/MIT Media Lab | ✅ Corrige |
| 14 | behavioral-economics | Dr. Anya Petrova | Chicago/Zurich | ✅ Corrige |
| 15 | complexity-science | Dr. Carlos Mendoza | Santa Fe Institute | ✅ Corrige |
| 16 | computational-social-science | Dr. Li Wei Zhang | Tsinghua/Stanford | ✅ Corrige |
| 17 | bioethics | Dr. Nadia Okonkwo | Johns Hopkins/WHO | ✅ Corrige |
| 18 | cognitive-science | Dr. Sophie Laurent | ENS Paris/INSERM | ✅ Corrige |
| 19 | urban-studies | Dr. Raj Patel | UCL/UN-Habitat | ✅ Corrige |
| 20 | humanities | Dr. Emma Richardson | Cambridge/British Academy | ✅ Corrige |
| 21 | development-economics | Dr. Amina Diallo | LSE/J-PAL/UNDP | ✅ Ajoute |
| 22 | risk-analysis | Dr. Anika Johansson | LSE/Swiss Re/BIS | ✅ Ajoute |

### 4.2 Systeme d'Identite (researcher-identity.ts)
Chaque chercheur a:
- **Positions**: Historique des positions prises sur des sujets (stocke en Prisma AgentAuditLog)
- **Predictions**: Predictions datees avec verification retrospective
- **Profil injectable**: System prompt enrichi avec positions + predictions passes
- **Memoire semantique**: Retrieval des positions passees pertinentes via embeddings

**Verdict**: ✅ **INNOVANT** — Les chercheurs ont une vraie memoire et evoluent au fil du temps.

### 4.3 Systeme d'Ownership (researcher-ownership.ts)
Chaque chercheur possede:
- **Domaine editorial**: Propriete intellectuelle sur un domaine
- **Seuil de qualite**: Min quality threshold (70-76) pour publication
- **Cadence**: weekly / biweekly / monthly
- **Agenda de recherche**: Questions prioritaires par domaine
- **Providers preferes**: Sources academiques preferees par domaine
- **Sign-off LLM**: Le chercheur review le brief via LLM avant publication

**Verdict**: ✅ **EXCELLENT** — Vrai ownership editorial, pas juste un label.

### 4.4 Pipeline Tiers par Chercheur
| Tier | Cout | Contenu | Quand |
|---|---|---|---|
| standard | $0.80-1.50 | Analyst V3 + Guard + Editor | Questions simples |
| premium | $2.50-4.00 | + Harvard Council (3 experts) + Critical Loop | Questions complexes |
| strategic | $8-15.00 | Full pipeline (22 experts) + Debate + Meta + DA | Rapports strategiques |

---

## 5. PROVIDERS — SOURCES ACADEMIQUES & API

### 5.1 Architecture Provider
```
smart-provider-selector.ts     -> Selection intelligente par domaine (54 providers)
provider-health-tracker.ts     -> Circuit breaker (3 failures -> blacklist 30min)
source-reputation-agent.ts     -> Tracking qualite par source
openalex-provider-factory.js   -> Factory centralisee (50+ configs ROR/Source/Concept)
registry-bridge.ts             -> Normalisation SourceCandidate -> Prisma Source
registry-v2.ts                 -> Contrat unifie ProviderConfig + ProviderResult
```

### 5.2 Tiers de Providers
| Tier | Providers | Exemples |
|---|---|---|
| TIER 1: Academic Core | 8 | OpenAlex, CrossRef, Semantic Scholar, PubMed, arXiv, BASE, HAL, ThesesFR |
| TIER 2: Institutional | 15 | IMF, World Bank, OECD, BIS, NATO, NIST, UN, UNDP, CISA, ENISA... |
| TIER 3: Think Tanks | 20 | Brookings, RAND, CNAS, Chatham House, Carnegie, Aspen Digital... |
| TIER 4: Archives | 3 | NARA, UK Archives, Archives FR |
| TIER 5: New Academic | 5 | CORE (300M+), Europe PMC (40M+), DOAJ (10M+), SSRN (1M+), RePEc (4M+) |
| TIER 6: Specialized | 37+ | DeepMind, OpenAI Research, Nature, Lancet, Cell, PNAS... |

**Total: 88+ providers, tous OpenAlex-backed, 0 mock restant.**

### 5.3 Deduplication
- **Phase 1**: DOI-based (exact match dans DEDUPLICATE step)
- **Phase 2**: Semantic (embedding cosine similarity > 0.95)
- **Phase 3**: Source reputation tracking (qualityScore recompute post-pipeline)

### 5.4 Smart Selection
Le `smart-provider-selector.ts` fait:
1. Detecte le domaine de la question (keyword matching)
2. Exclut les providers non-pertinents par domaine (DOMAIN_EXCLUSIONS)
3. Trie par performance historique (AgentAuditLog)
4. Filtre par health status (circuit breaker)
5. Selectionne 8-12 providers pertinents

**Verdict**: ✅ **EXCELLENT** — Selection intelligente, pas brute-force.

---

## 6. INTELLIGENCE — MEMOIRE, APPRENTISSAGE, CALIBRATION

### 6.1 Agent Memory (agent-memory.ts)
- **Performance recording**: Chaque agent log ses metriques (duree, cout, qualite)
- **Calibration dynamique**: Seuils ajustes en fonction des performances passees
- **Prompt injection**: Metriques de calibration injectees dans les system prompts
- **Stockage**: AgentAuditLog + SystemMetric (Prisma)

### 6.2 Researcher Identity Memory (researcher-identity.ts)
- **Positions passees**: Le chercheur se souvient de ses analyses precedentes
- **Predictions**: Predictions datees avec verification retrospective (prediction-auditor.ts)
- **Evolution**: Les positions evoluent au fil du temps (pas de reset)
- **Retrieval semantique**: Embeddings pour retrouver les positions pertinentes

### 6.3 Knowledge Graph (knowledge-graph.ts)
- **ConceptNode**: Concepts extraits des briefs (Prisma model)
- **ConceptRelation**: Relations entre concepts (supports, contradicts, relates_to)
- **Longitudinal tracking**: Evolution des concepts dans le temps
- **Context Primer**: Le KG est interroge en debut de pipeline pour enrichir le contexte

### 6.4 Self-Improving Infrastructure (V8)
| Agent | Role | Frequence |
|---|---|---|
| `prediction-auditor.ts` | Verifie accuracy des predictions PhD | Cron daily |
| `provider-health-tracker.ts` | Circuit breaker + auto-recovery | Real-time |
| `source-reputation-agent.ts` | Recompute qualityScore | Cron daily |
| `agent-memory.ts` | Calibration des seuils | A chaque run |

### 6.5 LLM Layer (unified-llm.ts)
- **Multi-provider**: OpenAI + Anthropic avec fallback automatique
- **Circuit breaker**: 3 failures -> circuit open 1 min
- **Retry avec backoff**: Exponential + jitter, max 3 retries
- **Cache semantique**: Redis 7j TTL, hash-based
- **Cost tracking**: Estimation par 1K tokens (input/output)
- **Models**: gpt-4o ($0.005/$0.015), gpt-4o-mini ($0.00015/$0.0006), Claude 3.5 Sonnet ($0.003/$0.015)

**Verdict Intelligence**: ✅ **TRES INNOVANT** — Systeme qui apprend de lui-meme, rare pour un projet de cette taille.

---

## 7. DIAGNOSTIC — PROBLEMES & INCOHERENCES

### 7.1 PROBLEME CRITIQUE #1: Dead Code Massif (~250KB)
**17 fichiers morts** representent ~30% du codebase agent.
10 fichiers marques `@ts-nocheck` = code non-type, non-compile, non-teste.

**Impact**: Confusion architecturale, imports fantomes, maintenance impossible.

**Fichiers concernes**:
- `elite-analyst.ts`, `enhanced-analyst.ts`, `ultimate-analyst.ts` (3 analystes morts)
- `think-tank-core.ts`, `think-tank-automation.ts`, `pipeline-orchestrator.ts` (3 orchestrateurs morts)
- `domain-intelligence.ts`, `visualization-generator.ts` (support dead)
- `nomosx-council.ts` (doublon council)
- `evidence-grader.ts`, `adversarial-review.ts`, `synthesis-director.ts`, `phd-researcher-expanded.ts` (4 stubs)
- `analyst-agent.ts`, `reader-agent.ts` (2 legacy V1)
- Doublons `omega-verification.ts` et `reference-publisher.ts`

### 7.2 PROBLEME #2: 5 Registres pour les memes 22 Chercheurs
Les 22 PhD researchers sont definis dans **5 fichiers differents** avec des structures differentes:

1. `phd-researcher.ts` → EXPERT_PERSONAS (nom + system prompt)
2. `researcher-identity.ts` → expertNames (nom mapping)
3. `researcher-ownership.ts` → RESEARCHER_REGISTRY (profil complet)
4. `domain-expertise.ts` → DOMAIN_EXPERTS (keywords + providers)
5. `domain-expert.ts` → DOMAIN_EXPERTS (methodologies + biases)

**Risque**: Changement dans un fichier oublie dans les 4 autres (deja arrive: 11 noms incorrects corriges).
**Solution**: Un seul fichier `researchers.ts` avec tout, les autres importent depuis.

### 7.3 PROBLEME #3: Duplication Orchestration
Il existe **4 systemes d'orchestration** dont 3 sont morts:

| Systeme | Fichier | Statut |
|---|---|---|
| Orchestrator (V4) | `orchestrator.ts` | ✅ ACTIF — cable dans pipeline-v2 |
| Pipeline Orchestrator | `pipeline-orchestrator.ts` | ❌ MORT — @ts-nocheck, jamais appele |
| Think Tank Core | `think-tank-core.ts` | ❌ MORT — @ts-nocheck, jamais appele |
| Think Tank Automation | `think-tank-automation.ts` | ❌ MORT — @ts-nocheck, jamais appele |

### 7.4 PROBLEME #4: Duplication Analystes
Il existe **5 analystes** dont 3 sont morts:

| Analyste | Fichier | Statut |
|---|---|---|
| Analyst V3 Multi-pass | `analyst-multipass.ts` | ✅ ACTIF — brief mode |
| Strategic Analyst | `strategic-analyst-agent.ts` | ✅ ACTIF — strategic mode |
| Elite Analyst | `elite-analyst.ts` | ❌ MORT — @ts-nocheck |
| Enhanced Analyst | `enhanced-analyst.ts` | ❌ MORT — @ts-nocheck |
| Ultimate Analyst | `ultimate-analyst.ts` | ❌ MORT — @ts-nocheck |

### 7.5 PROBLEME #5: Reference System Isole
Le dossier `reference-system/` contient un systeme parallele:

```
reference-system/
  unified-workflow.ts      -> PhD-Led -> Alpha -> Vertical -> Omega -> Reference
  phd-led-intelligence.ts  -> PhD qui INITIENT des recherches
  alpha-intelligence.ts    -> Detection signaux real-time
  omega-verification.ts    -> Verification multi-couche
  reference-publisher.ts   -> Publication "living documents"
  alpha-vertical-integration.ts
  index.ts
```

Ce systeme est **conceptuellement interessant** (PhD-led proactive research) mais:
- N'est **jamais appele** par l'app (aucune route API)
- Doublonne partiellement `auto-publisher.ts` + `editorial-planner.ts`
- Import `researcher-ownership.ts` mais pas integre dans le pipeline principal

### 7.6 PROBLEME #6: Vertical Intelligence Parallele
Le dossier `vertical-intelligence/` contient:

```
vertical-intelligence/
  vertical-orchestrator.ts       -> Orchestrateur vertical
  vertical-intelligence-engine.ts -> Decouverte de topics innovants
  expert-led-research.ts          -> Projets de recherche expert-led
  integration.ts                  -> @ts-nocheck
```

Ce systeme est **partiellement actif** (utilise `domain-expertise.ts`) mais:
- Le `vertical-orchestrator.ts` n'est appele par aucune route API
- C'est un doublon conceptuel de `auto-publisher.ts` + `editorial-planner.ts`

### 7.7 INCOHERENCE: pipeline-v2.ts importe du dead code
```typescript
// pipeline-v2.ts importe ces 3 fichiers @ts-nocheck:
import { eliteAnalystAgent } from './elite-analyst';       // MORT
import { enhancedAnalystAgent } from './enhanced-analyst';  // MORT
import { ultimateAnalystAgent } from './ultimate-analyst';  // MORT
```
Ces imports sont probablement dans des branches mortes (conditions jamais vraies), mais ils:
- Augmentent le bundle size
- Creent de fausses dependances
- Empechent la suppression propre

---

## 8. RAPPORT FINAL — RECOMMANDATIONS

### 8.1 Score Architecture Actuel: B+ (78/100)

| Dimension | Score | Detail |
|---|---|---|
| Pipeline (funnel) | 95/100 | Excellent, 16 steps, orchestrateur adaptatif |
| Agents actifs | 90/100 | 37 agents bien conçus, specialises |
| PhD Researchers | 88/100 | 22 complets, memoire + ownership, noms corriges |
| Providers | 92/100 | 88+ providers, smart selection, circuit breaker |
| Intelligence | 90/100 | Self-improving, predictions, KG, calibration |
| LLM Layer | 85/100 | Multi-provider, retry, cache, cost tracking |
| Securite | 88/100 | CSRF, rate limiting, Zod, auth, headers |
| **Dead Code** | **35/100** | **250KB morts, 10 @ts-nocheck, 17 fichiers** |
| **Duplication** | **40/100** | **5 registres chercheurs, 4 orchestrateurs, 5 analystes** |
| **Coherence** | **55/100** | **Systemes paralleles non-integres (reference-system, vertical-intelligence)** |

### 8.2 Plan d'Action — 3 Phases

#### PHASE 1: Nettoyage Chirurgical (1-2 jours) — Score cible: A- (85/100)

**P1-A: Supprimer les 4 stubs placeholder**
```
DELETE: evidence-grader.ts, adversarial-review.ts, synthesis-director.ts, phd-researcher-expanded.ts
```
Risque: Nul (stubs non-utilises, les vrais sont dans review-board.ts et phd-researcher.ts)

**P1-B: Supprimer les 3 analystes morts**
```
DELETE: elite-analyst.ts, enhanced-analyst.ts, ultimate-analyst.ts
EDIT: pipeline-v2.ts -> retirer les imports morts
```

**P1-C: Supprimer les 3 orchestrateurs morts**
```
DELETE: think-tank-core.ts, think-tank-automation.ts, pipeline-orchestrator.ts
```

**P1-D: Supprimer le dead code restant**
```
DELETE: nomosx-council.ts, domain-intelligence.ts, visualization-generator.ts
```

**P1-E: Archiver le legacy**
```
MOVE to lib/agent/_legacy/: analyst-agent.ts, reader-agent.ts, critical-loop.ts
```

**P1-F: Nettoyer les imports morts dans pipeline-v2.ts**
Retirer les imports de elite/enhanced/ultimate-analyst et tout code de branche morte.

#### PHASE 2: Unification Registres (2-3 jours) — Score cible: A (90/100)

**P2-A: Creer `lib/agent/researchers/registry.ts` — Source de verite unique**
```typescript
// UN SEUL FICHIER pour les 22 chercheurs
export const RESEARCHERS: Record<DomainExpertise, ResearcherDefinition> = {
  economics: {
    id: 'economics',
    name: 'Dr. Elena Vasquez',
    title: 'Political Economist & Econometrician',
    institution: 'MIT',
    systemPrompt: '...', // depuis phd-researcher.ts
    keywords: [...],      // depuis domain-expertise.ts
    providers: [...],     // depuis domain-expertise.ts
    methodologies: [...], // depuis domain-expert.ts
    calibrationRules: [...],
    knownBiases: [...],
    focusAreas: [...],    // depuis researcher-ownership.ts
    minQualityThreshold: 72,
    cadence: 'weekly',
    researchAgenda: [...],
  },
  // ... 21 autres
};
```

**P2-B: Refactorer les 5 fichiers actuels pour importer depuis registry.ts**
```
phd-researcher.ts       -> import { RESEARCHERS } from './researchers/registry'
researcher-identity.ts   -> import { RESEARCHERS } from './researchers/registry'
researcher-ownership.ts  -> import { RESEARCHERS } from './researchers/registry'
domain-expertise.ts      -> import { RESEARCHERS } from './researchers/registry'
domain-expert.ts         -> import { RESEARCHERS } from './researchers/registry'
```

#### PHASE 3: Integration Systemes Paralleles (3-5 jours) — Score cible: A+ (95/100)

**P3-A: Integrer reference-system dans le pipeline principal**
Les concepts du reference-system sont innovants:
- **PhD-Led Intelligence**: Les chercheurs initient des recherches proactivement
- **Alpha Intelligence**: Detection signaux real-time
- **Omega Verification**: Verification multi-couche

Plutot que les garder isoles, les integrer comme:
- PhD-Led -> Extension de `editorial-planner.ts` (cron planification)
- Alpha -> Extension de `signal-detector.ts` (real-time monitoring)
- Omega -> Extension de `critical-loop-v2.ts` (verification multi-couche)

**P3-B: Integrer vertical-intelligence dans auto-publisher**
Le `vertical-orchestrator.ts` est un doublon de `auto-publisher.ts` avec un focus vertical.
Fusionner les deux: auto-publisher accepte un `verticalSlug` optionnel.

**P3-C: Eliminer les doublons omega-verification et reference-publisher**
Garder uniquement les versions dans `reference-system/`, supprimer celles dans `agent/`.

### 8.3 Architecture Cible Post-Optimisation

```
lib/agent/
  researchers/
    registry.ts              <- SOURCE DE VERITE UNIQUE (22 PhD)
  pipeline-v2.ts             <- Pipeline unifie (16 steps)
  orchestrator.ts            <- Orchestration adaptative
  context-primer.ts          <- Memoire + KG
  index-agent.ts             <- Enrichissement sources
  semantic-engine.ts         <- Embeddings
  enhanced-ranker.ts         <- Ranking
  cohere-reranker.ts         <- Neural reranking
  reader-agent-v3.ts         <- Extraction PDF + quant
  analyst-multipass.ts       <- Brief analysis (3-pass)
  strategic-analyst-agent.ts <- Strategic reports
  phd-researcher.ts          <- 22 PhD experts (importe registry.ts)
  review-board.ts            <- Evidence + Adversarial + Synthesis
  harvard-council-enhanced.ts <- Council hierarchique
  citation-verifier.ts       <- Verification citations
  critical-loop-v2.ts        <- Critique iterative + Omega verification
  debate-agent.ts            <- Steel-man adversarial
  meta-analysis-engine.ts    <- Cohen's d, forest plots
  devils-advocate.ts         <- Publish gate
  knowledge-graph.ts         <- Concept extraction
  agent-memory.ts            <- Self-improving
  researcher-identity.ts     <- Memoire chercheurs (importe registry.ts)
  researcher-ownership.ts    <- Ownership (importe registry.ts)
  smart-provider-selector.ts <- Provider selection
  provider-health-tracker.ts <- Circuit breaker
  source-reputation-agent.ts <- Quality tracking
  prediction-auditor.ts      <- Prediction audit
  signal-detector.ts         <- Signal detection + Alpha intelligence
  trend-analyzer.ts          <- Trend analysis
  contradiction-detector.ts  <- Contradiction detection
  editorial-planner.ts       <- Editorial planning + PhD-Led proactive
  editorial-gate.ts          <- Publication gate
  cadence-enforcer.ts        <- Cadence control
  publication-generator.ts   <- HTML generation
  auto-publisher.ts          <- Autonomous publisher (+ vertical support)
  domain-detection.ts        <- Keyword detection
  query-enhancer.ts          <- Query expansion
  relevance-scorer.ts        <- Relevance scoring
  _legacy/                   <- Code archive (analyst-agent, reader-agent, etc.)
```

**Resultat: ~35 fichiers actifs au lieu de 112. Architecture claire, zero doublon.**

---

## 9. CE QUI EST DEJA EXCELLENT (ne pas toucher)

1. **Pipeline unifie** (`pipeline-v2.ts`) — 16 steps bien orchestres
2. **Orchestrateur adaptatif** — 4 checkpoints, decisions intelligentes
3. **Harvard Council** — 22 PhD avec evidence grading + adversarial review
4. **LLM Layer** — Multi-provider, retry, circuit breaker, cache
5. **Self-improving** — Prediction auditor, source reputation, agent memory
6. **Knowledge Graph** — ConceptNode + relations, context primer
7. **Security** — CSRF, rate limiting, Zod, auth, sanitization
8. **Providers** — 88+ sources, smart selection, health tracking
9. **Researcher autonomy** — Memoire, predictions, ownership, sign-off LLM
10. **Devil's Advocate** — Vrai garde-fou epistemique avant publication

---

## 10. CONCLUSION

NomosX est un systeme **remarquablement ambitieux et innovant**. Le coeur (pipeline + agents + chercheurs + intelligence) est de **niveau production** et depasse la plupart des think tanks AI existants.

Le probleme principal est **l'accumulation de code mort et de systemes paralleles** qui:
- Obscurcissent l'architecture reelle
- Creent des risques de desynchro (deja arrive avec 11 noms incorrects)
- Augmentent le bundle size inutilement
- Rendent l'onboarding developeur quasi impossible

**Le nettoyage en 3 phases permet de passer de B+ (78/100) a A+ (95/100) sans toucher au coeur fonctionnel.**

L'architecture cible est: **35 fichiers clairs, 1 source de verite chercheurs, 0 doublon, 0 @ts-nocheck**.
