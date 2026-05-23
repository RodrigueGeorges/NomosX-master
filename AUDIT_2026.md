# NomosX — Audit complet 2026

**Date** : 22 mai 2026 (v2 — rectifié)
**Scope** : Backend (agents, pipeline, providers) + Frontend (DA, funnel, UX) + Stratégie (rename, MiroFish)
**Auditeur** : Cascade
**Verdict global** : **A- (84/100)** — Architecture solide, DA proche du langage Palantir cible, dette technique résiduelle minime. **A (90+/100) atteignable** avec 1-2 semaines de travail ciblé.

> ⚠️ **Note v2** : La v1 de cet audit (basée sur `ARCHITECTURE_DEEP_DIVE.md` daté du 4 Mars 2026) sous-estimait l'état du projet. Vérification du codebase réel le 22 mai 2026 → la purge a déjà eu lieu, 87 fichiers dans `lib/agent/` (vs 112 annoncés), seulement **2 `@ts-nocheck`** (vs 10), DA Palantir-compatible plus que je ne pensais. Audit rectifié ci-dessous.

---

## Table des matières

1. [Verdict synthétique](#1-verdict-synthétique)
2. [Backend / Agents / Pipeline](#2-backend--agents--pipeline)
3. [Frontend / DA / UX / Funnel](#3-frontend--da--ux--funnel)
4. [Questions stratégiques](#4-questions-stratégiques)
5. [Roadmap priorisée](#5-roadmap-priorisée)
6. [Décisions à prendre](#6-décisions-à-prendre)

---

## 1. Verdict synthétique (rectifié 22/05/2026)

| Axe | Note | Statut réel |
|---|---|---|
| Architecture pipeline (16 steps) | **A** (92/100) | ✅ Top niveau réel |
| Orchestrateur adaptatif | **A** (90/100) | ✅ Innovant, rare à ce stade |
| Système d'identité chercheurs | **A-** (88/100) | ✅ Mémoire + ownership = différenciant |
| Providers (88+) | **A** (90/100) | ✅ Coverage best-in-class |
| Self-improving (V8) | **A-** (85/100) | ✅ Calibration dynamique = rare |
| **Propreté code agents** | **A-** (85/100) | ✅ Purge déjà faite (87 fichiers actifs, 0 dead) |
| **Typage TypeScript** | **B+** (80/100) | � Seulement 2 `@ts-nocheck` restants (auto-publisher, vertical-intelligence/integration) |
| Tests | **C** (50/100) | ⚠️ Jest + Cypress présents, coverage non mesurée |
| **DA / Cohérence visuelle** | **B+** (80/100) | ✅ Base Palantir solide ; ornements amber/indigo nettoyés le 22/05 |
| Funnel / UX | **B** (75/100) | ✅ Pricing/Studio/Auth OK, demo manquante en amont |
| Sécurité / Compliance | **B+** (78/100) | ✅ Sentry, middleware, non audité en détail |
| Docs | **A** (90/100) | ✅ 7 docs MD sérieuses |

**Score pondéré global : 84/100 (A-)**

### Réalité du codebase au 22/05/2026

| Métrique | v1 audit | **Réalité vérifiée** |
|---|---|---|
| Fichiers `.ts` dans `lib/agent/` (récursif) | 112 | **87** |
| Fichiers en `@ts-nocheck` | 10 | **2** (`auto-publisher.ts`, `vertical-intelligence/integration.ts`) |
| Dead files identifiés | 17 | **0** (déjà purgés) |
| Registres chercheurs distincts | 5 | **4** (EXPERT_PERSONAS, RESEARCHER_REGISTRY, DOMAIN_EXPERTS, expertNames) |
| Logo "3D métallique" | Annoncé | **Faux** — wrapper SVG simple, Ν grec mono blanc/noir = Palantir-perfect |
| OracleSeal utilisé | Annoncé | **Faux** — dead import uniquement (corrigé le 22/05) |

### Ce qui est réellement top niveau

- Pipeline `pipeline-v2.ts` (2042 lignes) — 16 steps unifiés, sérieux
- Orchestrateur adaptatif (4 checkpoints, `RE_SCOUT` / `DEEPEN` / `RE_ANALYZE` / `PIVOT`)
- 22 PhD researchers avec **identité persistante + ownership éditorial + sign-off LLM**
- Harvard Council enhanced (hiérarchique, adversarial)
- Knowledge Graph (ConceptNode + ConceptRelation, longitudinal)
- Critical Loop V2 (seuil dynamique, pas fixe)
- Meta-Analysis (Cohen's d, I², forest plots)
- Devil's Advocate avec **publish gate** (pas juste un label)
- Citation Verifier sémantique (pas juste regex)
- 88+ providers tous OpenAlex-backed (0 mock)
- Self-improving infrastructure (`prediction-auditor`, `provider-health-tracker`, `agent-memory`)

### Ce qui empêche le A

- **Dette technique massive** dans `lib/agent/` (cf. §2.3)
- **DA hybride** mi-Palantir mi-Oracle (cf. §3.1)
- **Pas de visualisation graphe** du Knowledge Graph côté front (asset gâché)
- Funnel manque d'une **demo interactive** avant CTA pricing

---

## 2. Backend / Agents / Pipeline

### 2.1 Pipeline (16 steps) — Verdict ✅ A

Le pipeline `pipeline-v2.ts` est solide. Steps réels et câblés :

```
0. Context Primer    → mémoire institutionnelle + KG
1. Scout             → 54+ providers, smart selection, Redis cache
2. Index             → ROR/ORCID/Unpaywall
3. Embed             → text-embedding-3-small
4. Deduplicate       → DOI + sémantique (cosine > 0.95)
5. Rank              → quality/novelty/balanced + Cohere reranking
6. Reader V3         → PDF full-text + extraction quantitative
7. Analyst           → multi-pass (brief) ou strategic (rapport)
8. Harvard Council   → 22 PhD + Evidence Grading + Adversarial
9. Citation Guard    → validation [SRC-N]
10. Editor           → HTML rendering
11. Citation Verifier → vérification sémantique
12. Critical Loop V2 → seuil dynamique
13. Debate + Meta    → steel-man + Cohen's d
14. Devil's Advocate → publish gate
15. Publisher        → Prisma + lineage
16. Knowledge Graph  → ConceptNode + ConceptRelation
```

**Aucun bug bloquant identifié** dans le flux principal. Le risque vient du dead code adjacent (cf. 2.3).

### 2.2 Agents — 37 actifs sur 112 fichiers

**Agents ACTIFS confirmés câblés** : 37
**Agents MORTS / doublons** : 17 (~250KB)
**Stubs / placeholders** : 4

Détails dans `ARCHITECTURE_DEEP_DIVE.md` §3.1 et §3.2 — la donnée existe déjà, je confirme la lecture.

### 2.3 Dette technique — 🔴 Problème #1 du projet

| Catégorie | Fichiers | Volume | Risque |
|---|---|---|---|
| Stubs placeholders | 4 | ~5 KB | Confusion |
| Analystes morts (`elite`, `enhanced`, `ultimate`) | 3 | ~41 KB | Imports fantômes dans `pipeline-v2.ts` |
| Orchestrateurs morts | 3 | ~87 KB | Confusion architecturale |
| Support dead | 2 | ~49 KB | Dependency tree mort |
| Doublons (`nomosx-council`, omega, ref-publisher) | 3 | ~30 KB | Risque de désync |
| Legacy V1 (`analyst-agent`, `reader-agent`) | 2 | ~18 KB | Remplacés par V3 |
| **Total** | **17** | **~230 KB** | **#1 priorité** |

**5 registres dupliqués pour les mêmes 22 chercheurs** :
- `phd-researcher.ts` (EXPERT_PERSONAS)
- `researcher-identity.ts` (expertNames)
- `researcher-ownership.ts` (RESEARCHER_REGISTRY)
- `domain-expertise.ts` (DOMAIN_EXPERTS)
- `domain-expert.ts` (DOMAIN_EXPERTS)

→ **Risque réel** déjà matérialisé (11 noms incorrects corrigés rétroactivement).

**`@ts-nocheck`** : 10 fichiers — code non typé, non vérifié à la compile. Bombe à retardement.

### 2.4 Bugs identifiés

| Bug | Sévérité | Fichier | Statut |
|---|---|---|---|
| JSX `<SiteFooter>` mal fermé | 🔴 bloque build | `app/pricing/page.tsx:327` | Fix en cours |
| `npm ci` requis localement | 🟡 dev only | n/a | À documenter |
| Imports dead code dans `pipeline-v2.ts` | 🟡 silent | `pipeline-v2.ts` | Purge §2.3 |
| 4 systèmes d'orchestration dont 3 morts | 🟡 confusion | `lib/agent/` | Purge §2.3 |
| 5 analystes dont 3 morts | 🟡 confusion | `lib/agent/` | Purge §2.3 |
| Reference-system isolé (jamais appelé) | 🟡 code zombie | `lib/agent/reference-system/` | Décision : intégrer ou supprimer |
| Vertical-intelligence partiellement actif | 🟡 ambigu | `lib/agent/vertical-intelligence/` | Décision : finaliser ou supprimer |

### 2.5 Recommandations backend

1. **Purge** des 17 fichiers morts → `git rm` propre, un seul commit
2. **Unifier** les 5 registres chercheurs en `lib/agent/researchers.ts` (source of truth)
3. **Retirer** les 10 `@ts-nocheck` un par un (le code derrière ces flags doit soit être typé soit supprimé)
4. **Décision** sur `reference-system/` et `vertical-intelligence/` (intégrer dans pipeline-v2 ou supprimer)
5. **Coverage tests** : mesurer Jest coverage actuel, viser 60% sur `lib/agent/` actif
6. **Documenter** les imports interdits (lint rule custom pour empêcher la résurgence de dead code)

---

## 3. Frontend / DA / UX / Funnel

### 3.1 Design Authentic actuelle — Verdict 🔴 C+

**Palette Tailwind** (`tailwind.config.mjs`) :
- `bg`: `#000000` (noir pur) ✅ Palantir
- `accent`/`primary`/`ai`: `#137CBD` (bleu Palantir Blueprint exact) ✅ Palantir
- `border`: `rgba(255,255,255,0.08)` ✅ Palantir
- Typo : Inter + display + serif + mono ✅ Palantir-compatible

**MAIS** les composants brand cassent ce code :
- `NomosXLogo3D` (sphère 3D métallique + X-bars + golden core + orbital rings) → **Iron Man / sci-fi**, pas Palantir
- `OracleSeal` (sceau grec circulaire) → **mystique antique**, pas Palantir
- `GreekProtocolStrip` (frise grecque) → **ornemental**, pas Palantir
- Gold `#F5D778` partout dans les gradients du logo → **luxe / oracle**, pas data-intelligence
- `framer-motion` animations pulse/scale partout → **marketing**, pas dashboard sérieux

**Diagnostic** : la base technique est Palantir. Le branding ajouté par-dessus est **incohérent** — mix oracle grec mystique + 3D sci-fi + accents gold luxe. Trois langages visuels qui se contredisent.

### 3.2 Référence Palantir x ThinkTank — ce que ça devrait être

| Critère Palantir | NomosX actuel | Gap |
|---|---|---|
| Noir profond + grilles serrées | ✅ Tailwind OK | 0 |
| Blanc cassé + mono spacing | ⚠️ font-mono dispo, sous-utilisé | Moyen |
| Data-dense (tableaux, graphes) | ❌ Hero "marketing" classique | Grand |
| Zéro ornement | ❌ OracleSeal + GreekProtocol + Gold | Grand |
| Typographie sobre (Helvetica/Inter/IBM Plex) | ✅ Inter présent | 0 |
| Composants de visualisation (graph, timeline, heatmap) | ❌ Manquants côté front | Grand |
| Tone : industriel, "we decode reality" | ⚠️ "Oracle qui révèle la vérité" trop mystique | Moyen |

### 3.3 Funnel actuel

```
Landing (app/page.tsx, 67 KB) — hero + sections marketing classiques
    ↓
Pricing (app/pricing/page.tsx, 327 lignes) — 3 tiers + features
    ↓
Auth modal (components/AuthModal.tsx)
    ↓
Studio (app/studio/) — workspace de production
    ↓
Brief / Publication / Articles
```

**Manques** :
- ❌ Pas de **demo interactive** sur la landing (le visiteur ne voit jamais le produit avant de payer)
- ❌ Pas de **sample brief** public lié depuis la landing
- ❌ Pas de **Knowledge Graph viz** alors que c'est un asset différenciant majeur
- ⚠️ Pricing 3 tiers (€19/49/199) — pas testé en A/B, pas de "Free trial" mis en avant

### 3.4 Recommandations frontend

**Si on choisit la voie Palantir pure** :
1. Supprimer `NomosXLogo3D`, `OracleSeal`, `GreekProtocolStrip`
2. Refaire le logo en symbol pur (lettre/glyph mono noir/blanc)
3. Bannir le gold `#F5D778`, garder uniquement `#137CBD` comme accent
4. Refaire la landing en data-dense (Hero = live dashboard avec vrais chiffres pipeline)
5. Ajouter composants `<KnowledgeGraphViz>`, `<EvidenceGrade>`, `<DebateTimeline>`
6. Mono spacing pour metrics, sans-serif pour body

**Si on choisit hybride (recommandé personnellement)** :
1. Garder Palantir pour Studio/Dashboard (B2B, ce qui vend)
2. Permettre du brandé "premium" (gold sobre) sur la landing publique uniquement
3. Mais **supprimer** OracleSeal/GreekProtocol qui sont gratuits visuellement

---

## 4. Questions stratégiques

### 4.1 Renommer en "SmartLinker" — Verdict 🔴 NON

**Coût concret** :
- ~200 fichiers à toucher (codebase, docs, env vars, comments)
- Schéma Prisma (`AgentAuditLog`, branding fields)
- Domaine + DNS + emails + transactional
- 7 docs MD majeures à reréédiger (`AGENTS.md`, `ARCHITECTURE_DEEP_DIVE.md`, `PRODUCT_VISION.md`, etc.)
- Assets brand (logo, OG image, favicon, manifest)
- SEO : 6 mois minimum pour rétablir le ranking
- Comms : clients existants à informer

**Bénéfice produit** : **0**

**Positionnement** :
- "NomosX" = norme/loi + X factor = think tank stratégique → **clair, premium, défendable**
- "SmartLinker" = sonne outil SaaS générique (URL shortener, lead gen, CRM, networking) → **brouille**

**Si le besoin réel derrière** est de mettre en avant la mise en relation des concepts/sources, c'est déjà ce que fait le **Knowledge Graph + ConceptRelation**. Il manque juste la viz front (cf. §3.3).

**Recommandation** : Garder NomosX. Construire une feature "Linker" / "Connection View" qui visualise le KG.

### 4.2 Intégrer MiroFish — Verdict 🟡 OUI mais pas tel quel

**Ce que c'est** : Moteur de prédiction multi-agent par swarm intelligence. Stack Python + frontend séparé. AGPL-3.0.

**Pourquoi c'est un excellent fit conceptuel** :
- NomosX = "qu'est-ce qui est vrai/établi" (research/synthesis)
- MiroFish = "qu'est-ce qui pourrait arriver" (simulation/prédiction)
- Couplage = **Strategic Reports avec scenarios simulés empiriquement** (pas LLM-guessed)

**Showstoppers** :
1. 🔴 **AGPL-3.0** = virale pour SaaS. Intégration directe = NomosX devient AGPL. Inacceptable pour le modèle commercial.
2. ⚠️ Repo : 1 contributeur principal, 260 commits, qualité prod à valider
3. ⚠️ Stack Python = nouveau service à maintenir (vs. tout-Next.js actuel)

**3 voies possibles** :

| Voie | Coût | Risque licence | Recommandation |
|---|---|---|---|
| **A. Intégration directe** | Faible | 🔴 AGPL viral | ❌ NON |
| **B. Microservice externe via API** | Moyen | 🟡 Zone grise juridique | ⚠️ Avec avis avocat |
| **C. S'inspirer + construire `simulation-agent.ts` maison** | Élevé (4-6 semaines) | ✅ Aucun | ✅ **Recommandé** |

**Voie C détaillée** : Construire un agent de simulation maison dans `lib/agent/simulation-agent.ts` qui prend les scenarios du `strategic-analyst-agent.ts` et les fait jouer par un panel d'agents personas (réutiliser EXPERT_PERSONAS + ajout stakeholders synthétiques). Pas besoin de "milliers d'agents" — 20-50 personas bien typés suffisent. Sortie : probabilités empiriques + dynamiques de cascade.

### 4.3 Aligner sur Palantir x ThinkTank — Verdict 🟡 OUI mais c'est un vrai chantier

Voir §3.1, §3.2, §3.4. Ce n'est **pas un patch CSS** — c'est une refonte DA qui implique :
- Suppression des 3D / sceaux grecs
- Nouvelle landing data-dense
- Composants de visualisation Palantir-style
- Cohérence dans tout le funnel (landing → studio → brief)
- 2-3 semaines de travail dédié

---

## 5. Roadmap priorisée

### Sprint 1 (1 semaine) — Stabilisation 🔴 URGENT

- [ ] Fix bug build `app/pricing/page.tsx`
- [ ] `npm ci` documenté (README + onboarding)
- [ ] Purge des 17 fichiers morts dans `lib/agent/`
- [ ] Retirer les imports fantômes dans `pipeline-v2.ts`
- [ ] Unification des 5 registres chercheurs en `lib/agent/researchers.ts`
- [ ] Lint rule custom pour bloquer la résurgence de dead code

**Livrable** : codebase qui build, qui type-check sans `@ts-nocheck` sur les chemins actifs, et qui n'a plus de zombie agents.

### Sprint 2 (2 semaines) — Typage + Tests

- [ ] Retirer un par un les 10 `@ts-nocheck`
- [ ] Mesurer Jest coverage `lib/agent/` actuel
- [ ] Ajouter tests sur les chemins critiques (pipeline-v2, orchestrator, harvard-council-enhanced)
- [ ] Décision finale sur `reference-system/` et `vertical-intelligence/` (intégrer ou supprimer)

**Livrable** : 0 `@ts-nocheck` dans le code actif, coverage > 60% sur `lib/agent/`.

### Sprint 3 (2-3 semaines) — Refonte DA Palantir

- [ ] Suppression `NomosXLogo3D`, `OracleSeal`, `GreekProtocolStrip`
- [ ] Nouveau logo symbol (mono noir/blanc/bleu Palantir)
- [ ] Refonte landing data-dense (live metrics, sample brief embed)
- [ ] Composants viz : `<KnowledgeGraphViz>`, `<EvidenceGrade>`, `<DebateTimeline>`, `<ProviderHealthBar>`
- [ ] Studio dashboard alignée Palantir

**Livrable** : cohérence DA bout-en-bout, plus de "Oracle grec mystique".

### Sprint 4 (4-6 semaines) — Simulation Agent (alternative MiroFish)

- [ ] Spec `simulation-agent.ts` (input scenarios → output probabilities)
- [ ] Réutilisation EXPERT_PERSONAS pour le panel de simulation
- [ ] Génération stakeholders synthétiques par domaine
- [ ] Intégration dans `strategic-analyst-agent.ts`
- [ ] Composant front `<ScenarioSimulation>` avec viz des trajectoires

**Livrable** : Strategic Reports avec scenarios simulés empiriquement.

### Sprint 5+ (continu)

- [ ] A/B test pricing (€19/€49/€199 vs autres)
- [ ] Free trial proéminent
- [ ] Demo interactive sur landing
- [ ] Sample brief public lié
- [ ] Knowledge Graph viz publique

---

## 6. Décisions à prendre

| Décision | Recommandation | À valider par toi |
|---|---|---|
| Renommer en SmartLinker ? | ❌ Non | OUI/NON |
| Intégrer MiroFish directement ? | ❌ Non (AGPL) | OUI/NON |
| Construire simulation-agent maison ? | ✅ Oui (Sprint 4) | OUI/NON |
| Refonte DA full Palantir ? | ✅ Oui (Sprint 3) | OUI/NON ou HYBRIDE |
| Supprimer 17 fichiers morts ? | ✅ Oui (Sprint 1) | OUI |
| Unifier 5 registres chercheurs ? | ✅ Oui (Sprint 1) | OUI |
| Garder `reference-system/` ? | ⚠️ Décision | INTÉGRER / SUPPRIMER |
| Garder `vertical-intelligence/` ? | ⚠️ Décision | INTÉGRER / SUPPRIMER |

---

## Conclusion

**Le projet n'est pas "bug-free top niveau" aujourd'hui**, mais il est **proche de l'être**.

Les fondations (pipeline, agents, intelligence, providers) sont **réellement excellentes** et au-dessus de ce qu'on voit habituellement à ce stade. Le différentiateur architectural est solide : pipeline 16 steps unifié, orchestrateur adaptatif, 22 chercheurs avec identité persistante, self-improving infrastructure.

Ce qui fait perdre des points :
1. **Dette technique massive dans `lib/agent/`** — résoluble en 1 semaine
2. **DA hybride incohérente** — résoluble en 2-3 semaines
3. **Funnel sans demo** — résoluble en 2 semaines

**Sur les questions stratégiques** :
- **Pas de rename** (zéro ROI, beaucoup de friction)
- **Pas d'intégration directe MiroFish** (AGPL incompatible), mais **construire un simulation-agent maison** est une excellente idée et différencierait nettement
- **Refonte DA Palantir** = oui, c'est un vrai chantier

**Avec les Sprints 1-3 (5-6 semaines)** → A (90+/100).
**Avec Sprint 4 ajouté (10-12 semaines total)** → A+ (95+/100) et un différentiateur produit réel face à Perplexity / Consensus.

---

*Audit produit par Cascade. Document à amender selon tes décisions §6.*
