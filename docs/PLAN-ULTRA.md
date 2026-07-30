# NomosX — Plan Ulta Pro

> Plan définitif groundé dans le code réel. Calibré pour surpasser Brookings, RAND, Bruegel, France Stratégie.

Date: 2026-07-29. Baseline: `docs/CHALLENGE.md`, `docs/pipeline-topo.md`.

---

## Principes

1. **Déplacer l'effort vers l'amont.** Le système est fort en QA (12 étages), faible en retrieval.
2. **Le grounding est un veto, pas un terme de moyenne** (Invariant 4).
3. **Un champ sans evidence = hallucination.** Tout champ quantifié doit être nullable (Invariant 1).
4. **Garde-fous chiffres = déterministes (code), jamais LLM** (Invariant 5).
5. **Modifications chirurgicales.** Pas de rewrite complet.
6. **Pas de nouvel étage de critique LLM.** Supprimer, pas ajouter.

---

## Phasage: 4 vagues, 8 lots, ~14.5j

| Vague | Lots | Durée | Objectif |
|-------|------|-------|----------|
| V1 | LOT 0 + LOT 3 | 2j | Stop hémorragie |
| V2 | LOT 1 + LOT 2 | 4.5j | Amont fort |
| V3 | LOT 4 + LOT 5 | 5j | Foresight sourcé + voix |
| V4 | LOT 6 + LOT 7 + LOT 8 | 3j | Infra + moat + measurement |

---

## VAGUE 1 — STOP HÉMORRAGIE (LOT 0 + LOT 3)

### LOT 0 — Ne pas partir en ligne avec des claims faux

#### 0.1 — Footer (15min)
- **Fichier**: `editor-agent.ts:574,628,849`
- Retirer "Every claim sourced. Every source verified." → remplacer par `${sources.length} sources from ${providers} providers`
- "Cross-domain foresight" est dans `public-copy.ts` (meta SEO), pas dans le footer. Séparé.

#### 0.2 — Supprimer ensureEditorialScenarios + rebrancher foresight (1h)
- **Fichiers**: `editorial-scenarios.ts`, `pipeline-v2.ts:2549-2580`
- Supprimer l'appel `ensureEditorialScenarios()`
- Remplacer par lecture de `analysis.scenarios`, `analysis.trajectory`, `analysis.rejectedAlternatives` (champs ProspectiveNote)
- Si < 2 scénarios → skip propre du Monte Carlo (pas de stubs)

#### 0.3 — Invariant échec bruyant (30min)
- Déjà partiellement fait: `!isStrategic` retiré, `stats.rendererUsed` ajouté, warning ligne 2117
- Reste: `console.error` (pas warn) pour champ absent. pgvector absent = erreur explicite.

#### 0.4 — depth: 'strategic' au lieu de 'deep' (5min)
- **Fichier**: `pipeline-v2.ts:2564`
- Changer `depth: 'deep'` → `depth: isStrategic ? 'strategic' : 'brief'`
- Divise le coût foresight par 4

---

### LOT 3 — La chaîne honnête

#### 3.1 — Supprimer cible de longueur causalChain (30min)
- **Fichier**: `analyst-multipass.ts` prompt pass3
- Retirer "8-12 maillons". Remplacer par "as many links as evidence supports"

#### 3.2 — sourceRef obligatoire par maillon (1h)
- Ajouter `sourceRef?: number` au type `CausalChainLink`
- Prompt: "Each link MUST include sourceRef pointing to [SRC-N]"
- Gate code: maillon sans sourceRef → flag dans stats

#### 3.3 — Cascade guard correctif (1h)
- **Fichier**: `analyst-multipass.ts:800-803`
- Remplacer `console.warn` par marquage `unsupported: true` sur le maillon
- Renderer affiche "unsupported by evidence"
- Pas de nouvel agent LLM. Marquage déterministe.

#### 3.4 — Propager le veto (15min)
- **Fichier**: `inquiry-funnel-utils.ts:112-116`
- Si `criticalScore <= 40` → `trustScore = criticalScore` (pas de blend)
- Test: criticalScore=40, quality=78, coverage=0.77 → trustScore=40 (pas 59)

#### 3.5 — Distance terminale (30min)
- **Fichier**: `pipeline-v2.ts` après analyst
- Si premier et dernier maillon même domaine ET chain > 5 → warning dans stats

#### 3.6 — Veto DA étroit (30min)
- **Fichier**: `devils-advocate.ts` prompt
- Ajouter: "If analogy from domain X to Y, check structural validity. Invalid analogy → fatal type 'invalid_analogy'"

#### 3.7 — Suppression des neuf (3h)

| # | Composant | Fichier | Action |
|---|-----------|---------|--------|
| 1 | DA auto-revision | `pipeline-v2.ts:2384-2419` | Supprimer. DA reste advisory. |
| 2 | Triangular judge | `pipeline-v2.ts:2518-2547` | Supprimer. |
| 3 | Harvard Council | `pipeline-v2.ts:1980-2083` | Supprimer l'appel. |
| 4 | PhD deliberation | `pipeline-v2.ts:2040-2077` | Supprimer l'appel. |
| 5 | Meta-analysis (appel) | `pipeline-v2.ts` STEP 9 | Supprimer l'appel. Engine reste pour LOT 4.2. |
| 6 | Structural editor | `pipeline-v2.ts:1923-1952` | Supprimer. |
| 7 | Critical loop rewrite | `pipeline-v2.ts:2213-2234` | Supprimer. `html` garde valeur renderer. |
| 8 | ensureEditorialScenarios | `editorial-scenarios.ts` | Déjà supprimé en 0.2. |
| 9 | Foundational injection | `pipeline-v2.ts:1686-1738` | Supprimer. |

Pour chaque: `grep` préalable → supprimer → `tsc --noEmit` → vérifier stats.
**Économie**: ~$0.15/run, ~5min/run.

#### 3.8 — Tests régression V1 (1h)
- Run `test-funnel.ts` query de référence
- Vérifier HTML produit, `stats.rendererUsed` populated, veto respecté, scénarios de l'analyse

---

## VAGUE 2 — AMONT FORT (LOT 1 + LOT 2)

### LOT 1 — Radar multi-canal (extension radar existant)

#### 1.1 — Collision multi-canal (3h)
- **Fichier**: `topic-radar.ts` après dedup
- Grouper par embedding cosine > 0.85
- Si ≥ 3 canaux distincts → boost +15
- Ajouter `crossChannelBoost` au stats

#### 1.2 — Canal séries temporelles (2j)
- **Nouveau fichier**: `lib/agent/series-radar.ts`
- FRED (14 séries macro), ECB, World Bank
- Pour chaque paire: ADF (stationnarité) → corrélation glissante (window 24mo) → rupture si |delta| > 0.3
- Score: base 50 + |delta_corr| * 30 + recency
- Cointégration Engle-Granger en phase 2 (post-V1)

#### 1.3 — Normalisation domaines (1j)
- Ajouter `domain`, `domainConfidence` à table `Source`
- OpenAlex: utiliser `concepts.id` (gratuit)
- Autres providers: `classifyTopic()` à l'indexation
- Batch rétroactif: `scripts/backfill-domains.ts`

#### 1.5 — SmartProvider par domaine (2h)
- **Fichier**: `smart-provider-selector.ts`
- Inverser logique: `DOMAIN_INCLUSIONS` (garder pertinents) au lieu de `DOMAIN_EXCLUSIONS`
- Fallback: tous providers si domaine non trouvé

#### 1.6 — group_by OpenAlex (0.5j)
- Contrôle: `group_by=concepts.id`, `per_page=200` vs requêtes directes
- Si joint counts pertinents (3-10) → utiliser. Sinon fallback.

#### 1.7 — Scoring par canal (2h)
- **Fichier**: `topic-radar.ts`
- `pmiBoost`: ≥ 3 canaux → +15
- `slopeBoost`: score augmente sur 3 sweeps → +10
- `jointRecentBoost`: nouveau (< 24h) ET cross-canal → +20

#### 1.8 — Pont ABC (1h)
- `editorialTriage()` existe déjà (reformule headline → research question)
- Passer `radarScore` et `crossChannelBoost` dans metadata
- Ajuster `perProvider` selon score

#### 1.9 — Droit de refuser (30min)
- Si aucun topic score ≥ 60 → retourner vide avec `reason: "insufficient_signal_quality"`

---

### LOT 2 — Plan-then-execute + recherche itérative

#### 2.1 — DeepPlanner (1j)
- **Nouveau fichier**: `lib/agent/deep-planner.ts`
- `ResearchPlan { rootQuestion, nodes: ResearchNode[] }`
- `ResearchNode { id, subQuestion, parentIds, producers, resultVariable, status }`
- 3-7 sous-questions avec dépendances

#### 2.2 — Exécution DAG (1j)
- **Fichier**: `pipeline-v2.ts` remplacer STEP 1
- Ordre topologique. Scout par nœud. Injecter résultats parents comme contexte.

#### 2.3 — DAG mutable (0.5j)
- Si < 5 sources après rank → expand sous-questions → re-scout

#### 2.4 — Extraction mécanismes (1j)
- **Fichier**: `reader-agent.ts` prompt + type
- Ajouter `Mechanism { description, direction, rate?, horizon, isStated, sourceRef }`
- `isStated` incertain → default `true` (préserver, pas supprimer)

#### 2.5 — Sources porteuses (1h)
- Top 3 sources = `load_bearing`. Autres = `context`.

#### 2.6 — Lacunes typées (2h)
- `NOT_REACHED` | `RESTRICTED` | `INEXISTANT`
- Ajouter `researchGaps: { type, description }[]` aux stats

---

## VAGUE 3 — FORESIGHT SOURCÉ + VOIX (LOT 4 + LOT 5)

### LOT 4 — Quantification et prospective

#### 4.1 — Rebrancher foresight (inclus dans LOT 0.2)
- `trajectory` → scénario dominant, `rejectedAlternatives` → alternatives

#### 4.2 — Priors sourcés (1j)
- `metaAnalysisEngine()` → `buildPriors(metaAnalysis): Prior[]`
- `Prior { variable, mean, width, sourceCount, heterogeneity, mappingVersion }`
- Largeur = `f(I², k)`: I² > 75% ou k < 5 → wide. I² < 25% et k > 10 → narrow.

#### 4.3 — Propagation sur chaîne (1j)
- **Nouveau fichier**: `lib/agent/chain-probability.ts`
- `propagateChainProbability(chain, priors)` → joint probability
- Monte Carlo tire sur priors, pas sur paramètres de scénario

#### 4.4 — Tournoi de chaînes (1j, DÉPEND LOT 2.4)
- 3 mécanismes `isStated=true` → 6 permutations (3!) → Monte Carlo → meilleure joint probability
- Si LOT 2.4 non fait → skip, chaîne unique

#### 4.5 — Mapping d→P versionné (inclus dans 4.3)
- `P = norm.cdf(d / sqrt(k))` (corrigé: k, pas n)
- Calibré par Brier score sur prédictions passées (LOT 7.1)
- `mappingVersion` pour le registre

#### 4.6 — Scénarios depuis la chaîne (3h)
- Base: priors à moyenne. Adverse: -1σ. Accelerated: +1σ.

#### 4.7 — Quantité dérivée (2h)
- `DerivedQuantity { name, value, unit, derivation, inputs, confidence }`

#### 4.8 — Exigence d'inflexion (30min)
- Si chain ≥ 5 et aucun `direction: 'reversing'` → warning

---

### LOT 5 — Voix

#### 5.1 — Style gates regex (2h)
- **Nouveau fichier**: `lib/agent/style-gates.ts`
- Pas de "It is important to note", "In conclusion", "Further research is needed" sans détail
- Pas de paragraphe > 200 mots sans citation

#### 5.2 — Corpus voix (30min)
- Prompt analyst: "Write like Bruegel Briefing. Direct, declarative. Numbers with units and timeframes. Position first, evidence second."

#### 5.4 — Position-first sur strategic (1h)
- `!isStrategic` déjà retiré. Tester que `stats.rendererUsed = "position_first"` sur strategic.

#### 5.5 — Footer enrichi (30min)
- `${sources.length} sources from ${providers} providers. Generated ${date}. Mapping v${mappingVersion}.`

#### 5.6 — Fact-checker fix (15min)
- **Fichier**: `fact-checker.ts:66-115`
- Remplacer `html.replace(/<[^>]*>/g, ' ')` par `stripHtmlForEvidence(html)` de `evidence-ledger.ts`
- Normalise `<sup class="cite">` en `[SRC-N]` avant strip

#### 5.7 — Gate numéraux (30min)
- `factChecker.fatalIssues > 0` → status="held", reason="fatal_fact_check"

---

## VAGUE 4 — INFRA + MOAT + MEASUREMENT (LOT 6 + 7 + 8)

### LOT 6 — Infrastructure

#### 6.1 — pgvector dédup sémantique (0.5j)
- Activer pgvector sur Neon. `embedding vector(1536)` sur `Source`.
- Dédup: DOI + cosine > 0.92. Absent → erreur bruyante.

#### 6.2 — Context primer gate (1h)
- **Fichier**: `context-primer.ts:105`
- `DOMAIN_PULSE_MAP`: health→who, cyber→nvd, geopolitics→gdelt. Default→skip.

#### 6.3 — Politique d'échec (1h)
- `stats.stepErrors[stepName]` pour chaque échec. > 3 → `degradedRun: true`.

#### 6.4 — Trigger.dev (0.5j, optionnel)
- Migrer `collectBreakingItems()` vers Trigger.dev. Toutes les 2h, budget $20.

---

### LOT 7 — Moat

#### 7.1 — Registre de prédictions (3h, DÉPEND LOT 4.5)
- Modèle Prisma `Prediction { briefId, claim, horizon, probability, mappingVersion, status, outcome }`
- Après publication: extraire claims quantifiés avec horizon → stocker
- Cron hebdomadaire: résoudre prédictions échues (comparer claim vs réalité)
- Calculer Brier score → calibrer mapping d→P

#### 7.2 — Antériorité de détection (1h, DÉPEND LOT 1.1)
- Modèle Prisma `Collision { topicHash, channels[], firstSeen, publishedBriefId? }`
- Si collision détectée mais pas de brief → signal d'opportunité
- Si collision détectée ET brief existe → antériorité prouvée

---

### LOT 8 — Measurement

#### 8.1 — Harness de test (2h)
- `scripts/test-funnel.ts` avec query de référence + SHA snapshot du HTML
- Comparer HTML avant/après chaque lot (diff visuel + word count + citation count)

#### 8.2 — Métriques nouvelles (2h)
- `groundingRate`: % de claims avec citation valide (déjà partiellement existant)
- `mechanismCoverage`: % de maillons avec `sourceRef` valide
- `priorCalibration`: Brier score sur prédictions résolues
- `rendererUsed`: déjà ajouté
- `degradedRun`: ajouté en 6.3

#### 8.3 — Dashboard (1h)
- Page admin simple: derniers runs, trust scores, coûts, renderer used, fatal issues

---

## Dépendances critiques (respecter absolument)

```
LOT 0.2 ──atomique──→ LOT 4.1 (foresight rebranché)
LOT 2.4 ──prérequis──→ LOT 4.4 (tournoi needs mechanisms)
LOT 4.5 ──prérequis──→ LOT 7.1 (registry needs mappingVersion)
LOT 1.1 ──prérequis──→ LOT 7.2 (antériorité needs collisions)
LOT 1.3 ──prérequis──→ LOT 1.5 (SmartProvider needs domain normalization)
LOT 3.1 ──prérequis──→ LOT 3.3 (cascade guard needs no length target)
LOT 0.3 ──prérequis──→ LOT 5.6 (fact-checker needs renderer determined)
```

---

## Économies attendues après V1

| Suppression | Économie/run |
|-------------|-------------|
| Harvard Council | $0.006 + 2min |
| PhD deliberation | $0.02 + 2min |
| Critical loop rewrite | $0.20 + 5-10min |
| DA auto-revision | $0.05 + 3min |
| Triangular judge | $0.01 + 1min |
| Structural editor | $0.01 + 1min |
| Meta-analysis (appel) | $0.03 + 1min |
| ensureEditorialScenarios | évite MC sur stubs |
| **Total** | **~$0.33 + ~15min/run** |

Coût strategic avant: ~$0.25-0.35. Après suppressions + depth fix: ~$0.10-0.15.

---

## Critères de succès

1. **Trust score respecte le veto**: coverage < 50% → trustScore ≤ 40
2. **Fact-checker trouve des claims**: totalClaims > 0 sur position-first HTML
3. **Scénarios de l'analyse**: 0 stubs ensureEditorialScenarios dans le HTML
4. **Renderer position-first sur strategic**: `stats.rendererUsed = "position_first"`
5. **Footer sans claim invérifiable**: 0 "Every claim sourced" dans le HTML
6. **Coût par run strategic ≤ $0.15**
7. **Durée strategic ≤ 20min**
8. **Brier score < 0.25** sur premières prédictions résolues (LOT 7.1)
