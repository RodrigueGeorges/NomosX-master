# CHALLENGE DU PLAN CONSOLIDÉ

Date: 2026-07-29. Vérification adversariale ligne par ligne contre le code réel.

---

## POINTS FAIBLES CONNUS

### PW-1. Mapping d→P (LOT 4.2)
- **VÉRIFIÉ**: Aucun mapping n'existe. `metaAnalysisEngine()` calcule Cohen's d + I², stocke dans `stats.metaAnalysis`, jamais passé à `runPipelineForesight()`.
- **FAUX**: La formule P=Φ(d/√n) est effectivement mathématiquement incorrecte.
- **MANQUE**: Le I² n'est pas le seul facteur de largeur de prior. Le nombre d'études k entre aussi. Suggérer: prior width = f(I², k).
- **EFFORT**: Code nouveau (`propagateChainProbability`, type `Prior`). 1.5j non inclus dans les 2.5j du LOT 4.

### PW-2. Canal séries (LOT 1.2)
- **VÉRIFIÉ**: Le radar existe déjà (`topic-radar.ts:runTopicRadar()`) avec 6 sweeps: GDELT (14 verticals), RSS (28 feeds elite), Academic (OpenAlex+arXiv+Semantic Scholar), DB Signals. Mais aucun canal séries temporelles — FRED/ECB/WorldBank sont dans `smart-provider-selector.ts` comme providers textuels, pas comme sources de séries.
- **MANQUE**: Le plan dit "corrélation glissante" — insuffisant. Deux séries macro non-stationnaires → corrélation spurieuse (Granger & Newbold 1974). Il faut test de racine unitaire (ADF) + cointégration (Engle-Granger), pas Pearson simple.
- **EFFORT**: 2j canal + 0.5j stationnarité. Le LOT 1 entier passe à 3j (extension radar existant, pas construction from scratch).

### PW-3. group_by et troncature (LOT 1.6)
- **VÉRIFIÉ**: Aucun code utilisant l'API OpenAlex `group_by`. Le risque de troncature est réel: `per_page=200` retourne les plus fréquents, le signal (joint counts 3-10) est dans la queue.
- **ESTIMATION**: Correcte (0.5j contrôle + 0.5j fallback).

### PW-4. Tournoi à 3 survivants (LOT 4.4)
- **VÉRIFIÉ**: Aucun code de tournoi. `analystMultipass` génère une seule chaîne dans Pass 3.
- **MANQUE**: Le goulot n'est pas seulement le nombre (3) mais la **qualité**. Si Reader V3 sort des constats statiques et que Pass 1 invente la dynamique, les "mécanismes" sont du bruit LLM. Le tournoi sur des permutations de bruit ne produit pas de la rigueur.
- **DÉPENDANCE CACHÉE**: LOT 4.4 dépend de LOT 2.4 (extraction mécanismes), pas seulement de LOT 3.

### PW-5. Normalisation domaines (LOT 1.3)
- **VÉRIFIÉ**: Aucune table `Domain`/`SourceDomain` dans Prisma. `topic-classifier.ts` fait du matching par mots-clés, pas ontologique.
- **MANQUE**: Pour OpenAlex, `concepts.id` déjà disponibles — pas besoin de LLM. Pour les autres providers, LLM nécessaire. Le plan devrait distinguer. L'indexation rétroactive est un batch job coûteux.
- **EFFORT**: 2j, pas 1j.

### PW-6. Suppression des neuf (LOT 3.7)

| # | Composant | Rendu HTML? | Risque suppression |
|---|-----------|-------------|-------------------|
| 1 | DA auto-revision (`pipeline-v2.ts:2384`) | Modifie `analysis` inplace | ⚠️ Conditionnel (`fatalChallenges>0`), pas systématique |
| 2 | Triangular judge (`pipeline-v2.ts:2518`) | Non — stats seulement | ✅ |
| 3 | Harvard Council (`pipeline-v2.ts:1980`) | Non — `_deliberation` non lu par renderers | ✅ |
| 4 | PhD deliberation (`pipeline-v2.ts:2040`) | Non — même mécanisme | ✅ |
| 5 | Meta-analysis | Non — `stats.metaAnalysis` | ✅ |
| 6 | Structural editor (`pipeline-v2.ts:1923`) | ⚠️ OUI — modifie `analysis` inplace si score<70 (ligne 1938) | ⚠️ C'est le BUT (supprimer le pyramid principle) |
| 7 | Critical loop rewrite (`pipeline-v2.ts:2229`) | ⚠️ OUI — `html = criticalResult.finalHtml` | ⚠️ Voir 3.10 |
| 8 | ensureEditorialScenarios | ⚠️ Injecte scénarios rendus par position-first | ⚠️ Couplé avec LOT 4.1 |
| 9 | Foundational injection (`pipeline-v2.ts:1686`) | Indirect — ajoute sources à topSources | ✅ |

**DÉPENDANCE CACHÉE**: Supprimer `ensureEditorialScenarios` (8) sans rebrancher sur trajectory (LOT 4.1) = foresight sans entrées. **LOT 3.7 et LOT 4.1 sont atomiques**.

### PW-7. Estimations de temps

| Lot | Plan | Révisé | Raison |
|-----|------|--------|--------|
| 0 | 1h | 1.5h | 0.3 partiellement fait |
| 1 | 2j | 2.5j | Extension radar existant (canal séries + stationnarité + normalisation) |
| 2 | 2j | 2.5j | DAG + extraction mécanismes |
| 3 | 1j | 1.5j | 9 suppressions + cascade guard + tests |
| 4 | 2.5j | 3.5j | Code nouveau: chain probability + tournoi + priors |
| 5 | 1.5j | 2j | Style gates + fact-checker fix |
| 6 | 2j | 2.5j | pgvector + context primer + Trigger.dev |
| 7 | 2h+continu | 3h+continu | Registre + schéma + job |
| 8 | 0.5j | 0.5j | OK |
| **Total** | **~12j** | **~15.5j** | +29% |

### PW-8. Dépendances cachées entre lots

1. **LOT 3.7 ↔ LOT 4.1**: Supprimer `ensureEditorialScenarios` sans rebrancher = foresight sans entrées. Atomiques.
2. **LOT 4.4 ↔ LOT 2.4**: Tournoi sans extraction mécanismes = sélection de bruit.
3. **LOT 1.3 ↔ LOT 1.5**: SmartProvider filtering dépend de la normalisation des domaines.
4. **LOT 3.3 ↔ LOT 3.1**: Cascade guard correctif n'a de sens que si la cible de longueur est supprimée.
5. **LOT 5.6 ↔ LOT 0.3**: Fact-checker dépend du format de citation déterminé par le renderer.
6. **LOT 4.2 ↔ LOT 7.1**: Le registre doit enregistrer `mappingVersion` — le mapping doit être versionné avant.
7. **LOT 3.10 ↔ LOT 3.7**: Voir ci-dessous.

---

## LOT 0

### 0.1 — Footer
- **VÉRIFIÉ**: `editor-agent.ts:574,628,849` contient "Every claim sourced. Every source verified." dans les footers HTML.
- **FAUX**: Le plan dit "Cross-domain foresight" dans le footer. **INCORRECT**. "Cross-domain foresight" est dans `lib/brand/public-copy.ts:16,18` (meta SEO), `lib/email.ts`, `app/articles/layout.tsx`, `app/feed.xml/route.ts`, `app/s/[id]/SharedBriefClient.tsx`. Ce sont des métadonnées de marque, pas des affirmations dans le rapport.
- **CORRECTION**: Retirer "Every claim sourced. Every source verified." (3 occurrences `editor-agent.ts`). "Cross-domain foresight" est un claim marketing séparé.

### 0.2 — Probabilités MC dans HTML
- **VÉRIFIÉ**: Le position-first renderer rend les scénarios avec probabilités. `ensureEditorialScenarios()` génère des stubs depuis des champs qui n'existent plus dans `ProspectiveNote` (consensus, disagreements, implications). Les scénarios sont dégénérés → MC sur du boilerplate.

### 0.3 — Invariant échec bruyant
- **PARTIELLEMENT FAIT** (session précédente): `!isStrategic` retiré de `pipeline-v2.ts:2102`. `stats.rendererUsed` ajouté (lignes 2113,2121,2126). Warning bruyant à ligne 2117.
- **RESTE**: Invariant "champ absent → erreur" non codé. `ensureEditorialScenarios()` toujours en place. pgvector non-bloquant à vérifier.

### 0.4 — git dans PATH
Infrastructure. OK.

---

## LOT 1 — RADAR MULTI-CANAL

### Ce qui EXISTE DÉJÀ

- **Radar**: `topic-radar.ts:runTopicRadar()` — 6 sweeps parallèles en <35s:
  1. GDELT (14 verticals, `sweepGDELT()` ligne 186)
  2. RSS Elite (28 feeds think tanks, `sweepRSS()` ligne 219)
  3. Academic (OpenAlex `sweepOpenAlex()` + arXiv `sweepArXiv()` + Semantic Scholar `sweepSemanticScholar()`)
  4. DB Signals (`sweepDBSignals()` ligne 351 — signaux Prisma `priorityScore>=60`)
  - Scoring: `base_score + recency_decay + source_tier_bonus + urgency_keyword_bonus`
  - Dedup: Jaccard word-overlap ≥60%
  - TTL cache 12min

- **Funnel**: `think-tank-dispatcher.ts:collectBreakingItems()` (ligne 193):
  1. `runTopicRadar()` → topics
  2. `editorialTriage()` (`editor-in-chief.ts:61`) → LLM sélectionne/priorise, reformule en research question
  3. `breakingDecisionToItem()` → `ThinkTankDispatchItem` avec depth, domain, providers
  4. `runAndPublishInquiry()` (`inquiry-orchestrator.ts:197`) → pipeline complet

- **Editorial triage**: `editor-in-chief.ts:editorialTriage()` — LLM unique call, sélection par nouveauté/urgence/impact/angle/diversité, reformulation headline → research question analytique, budget management.

- **Weekly items**: `collectWeeklyItems()` (ligne 237) — `planEditorialAgenda()` + `selectSmartProviders()` + `classifyTopic()`

### Ce qui N'EXISTE PAS (à construire)

- **Collision multi-canal**: Le radar actuel est mono-canal par topic (un topic = un vertical). Pas de détection de collision entre canaux (ex: même sujet apparaissant simultanément dans GDELT + RSS + Academic = signal fort).
- **Canal séries temporelles**: Aucun code pour FRED/ECB/WorldBank comme séries (pas textes). Voir PW-2.
- **Normalisation domaines**: Voir PW-5.
- **Scoring par canal (PMI/slope/jointRecent)**: Le scoring actuel est `base + recency + tier + urgency` — pas de PMI, pas de slope, pas de jointRecent.
- **Pont ABC**: Aucun mapping radar → pipeline research question au-delà de `editorialTriage()`.
- **Droit de refuser**: Aucun gate de refus du radar basé sur qualité des sources.

### 1.5 SmartProvider
- **VÉRIFIÉ**: `filterProvidersByDomain()` exclut 6 providers (`cisa,nsa,odni,cia-foia,nato,sgdsn`) via `DOMAIN_EXCLUSIONS`. bioRxiv, IAEA, INRAE non filtrés sur climate economics. **Confirmé**. La logique exclut des providers irrelevant, elle ne GARDE pas les pertinents par canal.

### CORRECTION DU PLAN
- Le plan dit "construction neuve" pour LOT 1. **FAUX**. Le radar et le funnel existent et fonctionnent. LOT 1 est une **extension** du radar existant: ajouter un canal séries, ajouter la détection de collision, normaliser les domaines, améliorer le scoring.
- **EFFORT RÉVISÉ**: 2j (pas 3j) — l'extension d'un radar existant est moins coûteuse qu'une construction from scratch. Le canal séries reste 2j, la normalisation 0.5j (réutilise `topic-classifier.ts` existant), le scoring 0.5j.

---

## LOT 2 — PLAN-THEN-EXECUTE

- **VÉRIFIÉ**: Aucun code DAG/planner. Scout one-shot sur query brute.
- **2.4**: Reader V3 sort `{claims, methods, results, limitations, quantitative}`. Pas de `Mechanism{direction, rate, horizon, isStated}`. Le type n'existe pas.
- **MANQUE**: `isStated` (true/false) est un jugement sémantique — l'LLM peut mal classer. Risque: suppression injustifiée de mécanismes valides.

---

## LOT 3 — CHAÎNE HONNÊTE

### 3.1 — Cible de longueur
- **VÉRIFIÉ**: Le prompt Pass 3 contient des instructions de longueur pour causalChain. La session précédente a ajouté `depth` qui ajuste verdict/anchoringBasis, mais causalChain garde ses consignes.

### 3.2 — sourceRef obligatoire
- **VÉRIFIÉ**: `causalChain` a un champ `evidence` par maillon mais pas de `sourceRef` obligatoire. Aucun gate code vérifie.

### 3.3 — Cascade guard
- **VÉRIFIÉ** `analyst-multipass.ts:800-803`: `console.warn` uniquement. Aucune action corrective. HypoAgent n'existe pas.
- **EFFORT**: 1j (identifier fragment + chercher remplacement + revalider), pas 0.5j.

### 3.4 — Propager le veto
- **VÉRIFIÉ** `inquiry-funnel-utils.ts:112-116`: `trust = criticalScore*0.5 + qualityScore*0.3 + coverage*0.2`. Avec veto à 40, quality 78, coverage 77%: `20+23.4+15.4=59`. **Invariant 4 violé. Confirmé.**

### 3.5 — Distance terminale
- **VÉRIFIÉ**: Aucun code ne vérifie domaine final ≠ domaine initial.

### 3.6 — Veto DA étroit
- **VÉRIFIÉ**: DA auto-revision se déclenche sur `fatalChallenges>0`. Triangular judge peut override. Pas de veto étroit "analogie invalide". Veto global retiré — confirmé.

### 3.7 — Voir PW-6 ci-dessus.

### 3.10 — finalHtml après suppression critical loop rewrite
- **VÉRIFIÉ**: `pipeline-v2.ts:2229-2230`: `if (criticalResult.improvementDelta > 0) { html = criticalResult.finalHtml; }`.
- **FAUX DANS LE PLAN**: Le plan dit "sans réassignation, on publie vide". **INCORRECT**. `html` est déjà assigné avant le critical loop (par `renderEditorHtml()`). Si on supprime le critical loop, `html` garde sa valeur originale. **On ne publie PAS vide**. Le plan se trompe sur ce point — 3.10 est un non-problème.
- **CORRECTION**: Supprimer le critical loop rewrite est safe pour le HTML. `html` retombe sur la sortie du renderer.

---

## LOT 4 — QUANTIFICATION ET PROSPECTIVE

### 4.1 — Rebrancher
- **VÉRIFIÉ**: `ensureEditorialScenarios()` lit `consensus/disagreements/implications` — champs de l'ancien type `AnalysisOutput`, pas de `ProspectiveNote`. La bascule vers `analystMultipass` a cassé l'alimentation. **Confirmé.**
- **MANQUE**: Le mapping `trajectory → scénario dominant` et `rejectedAlternatives → alternatives` existe dans le type `ProspectiveNote` mais n'est pas utilisé par `runPipelineForesight()`.

### 4.2 — Priors sourcés
- **VÉRIFIÉ**: `metaAnalysisEngine()` calcule pooled effect + I² + Egger. Stocké dans `stats.metaAnalysis` uniquement. Jamais passé à `runPipelineForesight()` ni `simulationAgent()`. **Confirmé.**

### 4.3 — Propagation sur chaîne
- **VÉRIFIÉ**: `runMonteCarloCore` (`simulation-agent.ts:422`) tire sur des paramètres de scénario, pas sur des liens de chaîne. `propagateChainProbability()` n'existe pas. Code nouveau. **Confirmé.**

### 4.7 — Quantité dérivée
- **VÉRIFIÉ**: Aucun type `DerivedQuantity` n'existe.

### 4.8 — Exigence d'inflexion
- **VÉRIFIÉ**: Aucun gate sur maillon d'inflexion. `Mechanism.direction = "reversing"` n'existe pas encore.

### 4.10 — depth: 'strategic'
- **VÉRIFIÉ**: `pipeline-v2.ts:2564` hardcode `depth: 'deep'`. **Confirmé.** Coût 4x si non corrigé avant.

---

## LOT 5 — VOIX

### 5.6 — Parseur fact-checker
- **VÉRIFIÉ**: `fact-checker.ts:66-115` `extractNumericalClaims()` cherche `[SRC-N]` dans le texte. Mais le position-first renderer utilise `<sup class="cite"><a href="#ref-N">`. Le fact-checker strip les tags HTML (`html.replace(/<[^>]*>/g, ' ')`) ce qui détruit les citations `<sup class="cite">` avant qu'elles ne soient cherchées comme `[SRC-N]`.
- **CORRECTION**: Le fact-checker ne trouve pas `[SRC-N]` car le renderer les a convertis en `<sup class="cite">`. Le strip HTML supprime les sup mais ne reconstruit pas `[SRC-N]`. **0 claims est le résultat attendu, pas un bug aléatoire.**
- **FIX**: Le fact-checker doit utiliser `stripHtmlForEvidence()` de `evidence-ledger.ts:50-63` qui normalise `<sup class="cite">` en `[SRC-N]` avant de stripper.

### 5.7 — Gate numéraux
- Aucun code existant. À construire.

---

## LOT 6 — INFRA

### 6.2 — Context primer
- **VÉRIFIÉ**: `context-primer.ts:105` appelle `fetchRealTimePulse()` inconditionnellement via `Promise.all`. Aucun gate de pertinence. Tire WHO/USGS/NVD sur du carbon pricing. **Confirmé.**
- **MANQUE**: Le plan dit "appel unique + gate". Mais `fetchRealTimePulse()` est aussi appelée ailleurs — vérifier les doublons d'appel dans le pipeline.

---

## LOT 7 — MOAT

### 7.1 — Registre de prédictions
- **VÉRIFIÉ**: Aucun modèle `Prediction` dans Prisma. Aucun job de résolution. L'artefact CBAM contenait une trajectoire datée non enregistrée. **Confirmé.**
- **DÉPENDANCE**: `mappingVersion` requiert LOT 4.2 fait d'abord.

### 7.2 — Antériorité de détection
- **VÉRIFIÉ**: Aucun modèle `Collision` n'existe. Dépend du LOT 1 entier.

---

## RÉSUMÉ DES CORRECTIONS APPORTÉES AU PLAN

1. **0.1**: "Cross-domain foresight" n'est pas dans le footer du rapport. C'est dans les meta SEO. Correction: retirer seulement "Every claim sourced. Every source verified." du footer.
2. **3.10**: FAUX. `html` est déjà assigné avant le critical loop. Supprimer le rewrite ne publie pas vide. Non-problème.
3. **5.6**: Le fact-checker ne trouve pas 0 claims par hasard — c'est parce que le renderer convertit `[SRC-N]` en `<sup class="cite">` et le strip HTML détruit les citations. Fix: utiliser `stripHtmlForEvidence()`.
4. **PW-2**: Canal séries nécessite tests de stationnarité/cointégration, pas corrélation simple.
5. **PW-4**: Tournoi dépend de LOT 2.4, pas seulement LOT 3.
6. **PW-5**: Normalisation domaines = 2j pas 1j. OpenAlex concepts.id gratuits.
7. **PW-6**: Structural editor modifie `analysis` inplace — suppression est le but, mais vérifier dépendances.
8. **PW-8**: 7 dépendances cachées identifiées, dont 3.7↔4.1 atomiques et 4.2↔7.1 séquentielles.
9. **LOT 1**: Le radar et le funnel existent déjà (`topic-radar.ts`, `think-tank-dispatcher.ts`, `editor-in-chief.ts`, `inquiry-orchestrator.ts`). LOT 1 est une **extension**, pas une construction neuve.
10. **Estimations**: Total révisé à ~15.5j (+29%).
