# NomosX Editorial Pipeline — Topographie Complète

> Document de référence pour Claude / LLM agents. Décrit chaque étape du funnel, sa logique, ses entrées/sorties, et ses points de défaillance.

---

## Vue d'ensemble

```
DETECT → DECIDE → DELEGATE (runPipelineCore) → INQUIRY ORCHESTRATOR → PUBLICATION
```

Le funnel `scripts/test-funnel.ts` appelle le `think-tank-dispatcher` qui:
1. **DETECT** — collecte signaux (RSS, GDELT, DB) → déduplication → 15-60 signaux
2. **DECIDE** — LLM classe les signaux par pertinence → sélectionne 1-N topics
3. **DELEGATE** — pour chaque topic, lance `runPipelineCore()` (le cœur du pipeline)

---

## `runPipelineCore()` — Les 17 étapes

Fichier: `lib/agent/pipeline-v2.ts` (~3060 lignes)

### STEP 1: SCOUT (ligne ~1483)
- **Agent**: `scout()` dans `lib/agent/pipeline-v2.ts`
- **Entrée**: query + providers (OpenAlex, Crossref, GDELT, etc.)
- **Process**: Query parallèle multi-providers (Promise.allSettled), normalize en schema commun, enrichit avec Unpaywall (si DOI), upsert en DB `Source`
- **Sortie**: `sourceIds[]`, `found`, `upserted`
- **Orchestrateur checkpoint**: `assessAfterScout()` → peut décider `RE_SCOUT` si diversité insuffisante
- **RE_SCOUT** (ligne ~1510): génère des termes expansés (`generateExpandedTerms`), relance scout sur chaque terme, fusionne résultats
- **Déterminisme**: ⚠️ Semi (variance API externe)
- **Erreur**: Provider failures = logged, non-blocking

### STEP 2: INDEX (ligne ~1561)
- **Agent**: `indexAgent()` dans `lib/agent/index-agent.ts`
- **Entrée**: `sourceIds[]`
- **Process**: Pour chaque source: extrait auteurs → search/create `Author` (enrichit ORCID), extrait institutions → search/create `Institution` (enrichit ROR API), crée liens `SourceAuthor`/`SourceInstitution`, calcule `noveltyScore`
- **Sortie**: `{ enriched, errors }`
- **Déterminisme**: ⚠️ Semi (ROR/ORCID lookups)

### STEP 2b: EMBED (ligne ~1565)
- **Process**: Génère vecteurs sémantiques (`embedSourcesBatch`) pour recherche sémantique future
- **Sortie**: `{ embedded, skipped (cached) }`
- **Erreur**: Non-blocking

### STEP 3: DEDUPLICATE (ligne ~1577)
- **Process**: Groupe par DOI, garde le plus ancien, supprime les doublons
- **Sortie**: `{ removed }`
- **Déterminisme**: ✅ Déterministe

### STEP 4: RANK (ligne ~1581)
- **Agent**: `rank()` dans `lib/agent/pipeline-v2.ts`
- **Entrée**: query + `RankOptions` (limit, mode, minQuality, maxPerProvider, minProviderDiversity, etc.)
- **Options Strategic**: limit=25, mode="balanced", minQuality=65, maxPerProvider=6, minProviderDiversity=3
- **Options Brief**: limit=18, mode="quality", minQuality=55, requireAbstract=true, minAbstractLength=150
- **Process**: WHERE clause dynamique → query DB → composite score (quality + novelty + recency) → relevance score (keyword matching) → diversity constraints (maxPerProvider, maxPerYear, minProviderDiversity) → top N
- **Sortie**: `Source[]` avec `compositeScore`, `relevanceScore`
- **Abort**: Si 0 sources → throw. Si < 5 (strategic) ou < 3 (brief) → structured refusal
- **Déterminisme**: ✅ Déterministe

### STEP 4b: DOMAIN CLASSIFICATION (ligne ~1641)
- **Agent**: `classifyTopic()` — LLM primary, rules fallback
- **Sortie**: `{ primaryDomain, domains[], dimensions[], isCrossDomain, confidence }`
- **Complexity Gate** (ligne ~1658): Si 1 domaine + confidence ≥ 0.8 → skip meta-analysis + deliberation (économise tokens)

### STEP 4c: FOUNDATIONAL LIBRARY (ligne ~1686)
- **Process**: Pour strategic uniquement — injecte `RESEARCHER_KBS[domain].referencePapers` comme sources `foundational:` en DB, les ajoute à `topSources` avec compositeScore=90
- **But**: S'assurer que les travaux séminaux sont cités dans l'analyse

### STEP 4d: GAP FILLER SCOUT (ligne ~1740)
- **Process**: Récupère les knowledge gaps des runs précédents (`getRelevantGaps`), génère des queries supplémentaires, lance scout sur ces queries
- **But**: Combler les lacunes identifiées dans les analyses passées

### STEP 4e: CASTING (ligne ~1754, Editorial V2 seulement)
- **Agent**: `castingAgent()` — assemble une équipe cross-domaine d'experts
- **Sortie**: `{ team[{domain, mandate}], collisionSummary, costUsd }`
- **Logique**: Détermine quelles "lentilles" (perspectives) appliquer à l'analyse

### STEP 5: READER V3 + FRAMING + QUANT (parallèle, ligne ~1768)
- **READER V3** (`readerAgentV3()`): Extraction profonde depuis les sources
  - PDF extraction, news fetch, abstract parsing
  - Batch concurrency=5, timeout 120s (strategic)
  - Domain-aware mode
  - Sortie: `ReadingResultV3[]` = `{ claims[], methods[], results[], limitations[], quantitative{effectSizes, sampleSizes}, readingDepth, confidence }`
- **FRAMING** (`framingAgent()`): Pré-enregistre des hypothèses testables
  - Sortie: `{ hypotheses[], keyUnknowns[] }`
- **QUANT** (`quantAgent()`): Récupère données chiffrées depuis providers T1 (energy-charts, rte-france, etc.)
  - Sortie: `{ series[], facts[], evidenceBlock, chartData[] }`

### STEP 5b: HYPOTHESIS JUDGE (ligne ~1806)
- **Agent**: `hypothesisJudge()` — évalue chaque hypothèse contre les sources
- **Sortie**: `verdicts[{id, verdict, confidence}]` — verdicts: "supported" | "refuted" | "partially_supported" | "inconclusive"
- **Non-blocking**

### STEP 6: ANALYST (ligne ~1823)
- **Strategic**: `strategicAnalystAgent()` — génère 10 sections (executive summary, literature review, thematic analysis, debate, evidence quality, stakeholder matrix, scenarios, recommendations, implementation roadmap, conclusion)
  - LLM: GPT-4 Turbo ou DeepSeek (failover), maxTokens=16000, temp=0.2
  - Sortie: `StrategicAnalysisOutput` (titre, executiveSummary 500+ mots, keyFindings[5], scenarios[3-5], recommendations{immediate, shortTerm, longTerm, riskMitigation}, etc.)
- **Brief**: `analystMultipass()` — 3 passes (overview → deep analysis → synthesis)
  - Sortie: `AnalysisOutput` (titre, summary, consensus, disagreements, debate{pro, con, synthesis}, evidence, implications, risks, open_questions)
- **Agent Memory** (ligne ~1826): Injecte jusqu'à 5 leçons passées dans le prompt
- **Context injection**: memoryBlock + primedContext + gapContextBlock + quant.evidenceBlock + hypothesisVerdictBlock

### STEP 6a: TOPIC CONSISTENCY VALIDATION (ligne ~1886)
- **Agent**: `validateTopicConsistency()` — vérifie que l'analyse reste sur le sujet
- **Si ≥ 2 issues**: Flag pour révision (non-blocking, n'arrête pas le pipeline)

### STEP 6a-2: GAP ANALYSIS (ligne ~1908)
- **Agent**: `analyzeCitationGaps()` — analyse la couverture des citations par section
- **Log only**: N'ajoute pas de sources ici (le gap-filling se fait en STEP 4d pré-analysis)

### STEP 6a-3: STRUCTURAL EDITOR (ligne ~1926)
- **Agent**: `structuralEditorReview()` — review narrative structure (McKinsey pyramid principle)
- **Sortie**: `{ overallStructure/100, narrativeArcValid, sectionReviews[], logicalGaps[] }`
- **Si structure < 70**: Applique `revisedAnalysis` (merge des champs révisés)
- **Non-blocking**

### STEP 6b: HARVARD COUNCIL (ligne ~1957)
- **Enhanced** (strategic): `runEnhancedHarvardCouncil()` — 3-6 PhD experts
  - Sélection experts par domaine (security, energy, geopolitics, complexity-science, etc.)
  - Hiérarchique: domain leads + supporting experts
  - Interdisciplinary analysis (connections, conflicts, synergies)
  - Sortie: `{ expertCount, domainLeads[], interdisciplinary, evidenceQuality, recommendations }`
- **Legacy** (brief): `runHarvardCouncil()` — 9 experts
- **Non-blocking** (erreurs logged)

### STEP 6c: PhD COLLABORATIVE DELIBERATION (ligne ~2043)
- **Agent**: `runCollaborativeDeliberation()` — 3 rounds:
  1. Position statements
  2. Cross-examination (challenges)
  3. Position revision
- **Sortie**: `{ totalChallenges, criticalChallenges, consensusPoints, activeDisagreements, emergentInsights, deliberationDepth/100, consensusLevel/100 }`
- **Skipped** si low-complexity (complexity gate)

---

### STEP 7: CITATION GUARD (ligne ~2088)
- **Agent**: `citationGuard()` — valide que tous `[SRC-N]` sont valides (1 ≤ N ≤ sourceCount)
- **Sortie**: `{ ok, usedCount, invalid[] }`
- **Déterminisme**: ✅ Déterministe
- **Non-fatal**: Si !ok, proceed with degraded quality flag

---

### BRANCHE EDITORIAL V2 (ligne ~2549)

Si `editorialV2 = true` (strategic ou brief premium):

#### STEP 8: FORESIGHT (ligne ~2556)
- **Agent**: `runPipelineForesight()` — Monte Carlo scenario distribution
- **Sortie**: `{ scenarios[], monteCarloRuns, monteCarloConverged }`
- **Non-blocking** (peut être skipped)

#### STEP 9: DEBATE + META-ANALYSIS (parallèle, ligne ~2258)
- **DEBATE** (`debateAgent()`): Adversarial deliberation
  - Pass 1: Thesis identification + steel-man construction
  - Pass 2: Synthesis and nuance extraction
  - Sortie: `{ dominantThesis, position2, confidenceInDominant, debateQuality{steelManStrength}, nuances[] }`
- **META-ANALYSIS** (`metaAnalysisEngine()`): Effet size pooling
  - Collecte effect sizes depuis readings
  - Sortie: `{ k, pooledEffect (d), I² (heterogeneity), biasDetected, forestPlot[] }`

#### STEP 10: EDITORIAL ARBITER (ligne ~2583, si casting)
- **Agent**: `editorialArbiter()` — formule la position de l'institut
- **Sortie**: `InstitutePosition { confidence/100, confidenceLabel, scenarios[] }`

#### STEP 11: DEVIL'S ADVOCATE — PASS 1 (ligne ~2604)
- **Agent**: `runDevilsAdvocate()` dans `lib/agent/devils-advocate.ts`
- **Entrée**: analysis text (pas encore HTML), mode strategic/brief
- **Process**: LLM génère fatal/major/minor challenges, verdict (reject/major_revision/publish), publishabilityScore, benchmark vs institutions (McKinsey, Brookings, RAND, France Stratégie)
- **Seuil verdict**: 3+ fatal → "reject"
- **Sortie**: `AdvocateReport { verdict, overallStrength/100, publishabilityScore, fatalChallenges[], majorChallenges[], minorChallenges[], vsInstitutionBenchmark }`
- **Non-blocking** (erreurs logged, pas de crash)

#### STEP 11b: RENDER HTML (ligne ~2605)
- **Agent**: `renderEditorHtml()` — render via `editor-agent.ts`
  - Strategic: `renderProfessionalStrategicHTML()`
  - Brief V2: `renderPositionFirstBriefHTML()`
  - Brief legacy: `renderProfessionalBriefHTML()`
  - Fallback: `renderBriefHTML()` / `renderStrategicReportHTML()`
- **CSS**: Inline `<style>` dans le HTML standalone. Pour le web, `sanitizeHtml` strip le `<style>` → styles doivent être dans `globals.css`

#### STEP 11c: QUANT CHARTS (ligne ~2606)
- **Agent**: `injectQuantSection()` — injecte SVG charts dans HTML
- **Sortie**: HTML avec charts

#### STEP 11d: CITATION FILTER (ligne ~2618)
- **Agent**: `applyCitationFilter()` — back-track citations implicites, flag uncited claims
- **Sortie**: `{ backtrackedClaims, removedSentences, citationCoverageBefore, citationCoverageAfter }`

#### STEP 12: QUALITY GATES (ligne ~2637, `runPostRenderQualityGates()`)

##### 12a: CITATION VERIFIER — NLI (ligne ~2143)
- **Agent**: `verifyCitationsNLI()` — vérification sémantique claim-citation via NLI
- **Si > 5 flagged**: LLM deep-check sur flagged subset (`verifyCitations()` avec opposite-family provider)
- **Sortie**: `{ overallIntegrity%, supported, flaggedClaims[] }`
- **Anti-biais**: Verifiers run sur LLM family différente du producer

##### 12b: FACT-CHECKER (ligne ~2192)
- **Agent**: `factChecker()` — vérifie claims numériques dans le HTML
- **Sortie**: `{ totalClaims, verified, majorIssues, fatalIssues, integrityScore% }`
- **Si fatalIssues > 0**: Flag `factCheckerFatalFlagged`

##### 12c: CRITICAL LOOP V2 (ligne ~2212)
- **Agent**: `runCriticalLoopV2()` dans `lib/agent/critical-loop-v2.ts`
- **Process**: Itératif (max 3 iterations):
  1. Score: Methodology (M) + Analysis (A) + Calibration (C) → Composite
  2. Grounding veto: si citation coverage < 50% → cap composite à 40 → **TERMINAL** (sortie immédiate, pas de réécriture)
  3. Si score < threshold et pas de veto → rewrite draft via LLM
  4. Re-score → repeat
- **Threshold**: `Math.max(caller=60, calibrated=55)` → 60
- **Sortie**: `{ iterations, finalScore, improvementDelta, finalHtml, needsHumanReview }`
- **Failover**: Si LLM timeout → switch provider (GLM → DeepSeek)
- **Fallback**: Si crash → compute fallback score from debate/structural editor
- **FIX 2026-07-28**: Le grounding veto est maintenant terminal. Avant, la boucle réécrivait le prose en essayant d'améliorer la couverture — mais une réécriture ne produit pas de citations. Résultat: 2 itérations de gaspillage ($0.20, 5-10 min), couverture dégradée (39% → 0%), output jeté par length-validation. Maintenant: cap → break immédiat.

#### STEP 13: DEVIL'S ADVOCATE — PASS 2 (ligne ~2639)
- **Condition**: DA pass 1 n'a pas eu d'erreur et n'était pas skipped
- **Entrée**: HTML rendu (pas analysis text) — permet auto-revision
- **Auto-revision** (ligne ~2384): Si `overallStrength < 80 (strategic) / 75 (brief)` ET `fatalChallenges > 0`:
  1. Extract lessons → store en DB
  2. LLM revise le JSON analysis (task: `auto_revision`, maxTokens=16000)
  3. **Length validation**: Si revision < 70% de l'original → garde l'original, patch seulement
  4. Re-render HTML via `renderEditorHtml()`
  5. Re-apply citation filter
- **Triangular Judge** (ligne ~2517): Si DA verdict ≠ Critical Loop score:
  - `needsTriangularJudging(daVerdict, clScore)` — true si DA="reject" mais CL ≥ 60
  - `runTriangularJudge(advocateReport, clScore, html)` — LLM arbitre
  - Verdicts: `uphold_da` | `downgrade` | `override_da`
  - Si override/downgrade: `stats.devilsAdvocate.verdict` = revisedVerdict
  - **Garde anti-double**: `!stats.triangularJudge` — ne s'exécute qu'une fois

---

### BRANCHE NON-V2 (ligne ~2642)
Si `editorialV2 = false`:
1. Render HTML
2. Quant charts injection
3. Citation filter
4. Quality gates (citation verifier + fact-checker + critical loop)
5. Debate + meta-analysis (séquentiel)
6. Devil's advocate (1 seule passe, avec auto-revision)

---

### STEP 14: EVIDENCE IDS (ligne ~2683)
- **Agent**: `replaceSrcWithEvidenceIds()` — convertit `[SRC-N]` → `[E-N]` dans le HTML final
- **Sortie**: `{ totalEvidence, citedEvidence, uncitedEvidence }`

### STEP 15: PUBLISHER (ligne ~2698)
- **Process**:
  1. `sanitizeForJson(html)` — strip control chars (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)
  2. `safeStats = JSON.parse(sanitizeForJson(JSON.stringify(stats)))` — try/catch avec fallback
  3. `prisma.brief.create()` — sauvegarde en DB
- **Sortie**: `briefId`
- **Point de défaillance historique**: "unexpected end of hex escape" → fixé par sanitizeForJson

### STEP 16: KNOWLEDGE GRAPH (ligne ~2727)
- **Agent**: `extractAndStoreConcepts()` — extrait concepts et relations du brief
- **Non-blocking**

### STEP 17: GAP FILLER EXTRACTION (ligne ~2737)
- **Agent**: `extractAndStoreGaps()` — identifie knowledge gaps pour futures runs
- **Non-blocking**

### STEP 18: PREDICTION AUDITOR (ligne ~2749, async)
- **Agent**: `runPredictionAuditor()` — vérifie rétrospectivement les prédictions passées
- **Async non-blocking** (fire-and-forget)

### STEP 19: SOURCE REPUTATION (ligne ~2761)
- **Agent**: `recordSourceUsage()` — enregistre quels sources ont été citées pour learning
- **Non-blocking**

### FINALISATION (ligne ~2776)
- Update `PipelineRun` avec status="COMPLETED", durationMs, totalCostUsd, trustScore, steps
- Return `{ briefId, stats, pipelineRunId, format }`

---

## POST-PIPELINE: INQUIRY ORCHESTRATOR

Fichier: `lib/agent/inquiry-orchestrator.ts`

### Publication Gate (`evaluatePublicationGate()`)
Fichier: `lib/agent/publication-gate.ts`

Évalue:
- `trustScore` (≥ 65 = OK)
- `qualityScore` (≥ 60 = OK)
- `citationCoverage` (≥ 0.50 = OK)
- `fatalChallenges` (DA — **advisory seulement**, pas hard failure)
- `factCheckerFatal` (si fatal > 0 = hard failure)

**Décision gate**: "publish" | "revise" | "hold"
- "publish": tous metrics OK
- "revise": quelques metrics insuffisants mais corrigeable
- "hold": metrics critiques insuffisants

### Publication Readiness
Vérifie: sourceCount suffisant, citationCoverage ≥ 0.50, pas de fatal fact-check issues

### `resolvePublicationStatus()` (ligne ~358)

**Priorité de décision** (ordre):

| # | Condition | Status |
|---|-----------|--------|
| 1 | Gate="publish" + readiness OK + trust ≥ 65 | **published** |
| 2 | Gate="revise" + readiness OK + trust ≥ 70 | **published** |
| 3 | DA="reject" + trust < 70 | review |
| 4 | Sign-off not approved | draft |
| 5 | Gate="revise" ou readiness not OK | held |
| 6 | Trust < 65 | draft |

**Logique clé**: DA reject n'est plus un veto. Si trust ≥ 70 et gate="revise" → publish quand même (DA est advisory).

### Triangular Override
Si le triangular judge a overridé le DA verdict (downgrade/override_da), le verdict révisé est utilisé à la place du verdict original.

---

## LLM FAILOVER

Fichier: `lib/llm/unified-llm.ts`

### Providers
- **GLM-5.2** (z.ai): Reasoning model, 1M context, prefix caching. Primary pour reader_v3, harvard_council, elenchus, strategic_analyst. Peut laisser content="" si token limit atteint mid-reasoning.
- **DeepSeek-V4-Flash**: Non-reasoning, JSON clean. Primary pour topic_classification, casting, fact_check, meta_analysis, auto_revision, editorial_arbiter.

### Failover Logic
1. `callOpenAICompatible()`: Si content="" → fallback sur `reasoning_content`. Si encore vide → **throw** (déclenche failover)
2. `callLLM()`: Si `jsonMode=true` && `!isParseableJson(content)` → **throw** → failover automatique
3. `isParseableJson()`: Validateur tolérant (direct parse → fence strip → brace extract → truncation repair). Réparable = pas de failover inutile.
4. **Anti-biais**: Verifiers (fact_check, citation_verification, auto_revision) routés sur **opposite family** du producer

### Timeouts
- Default: 150s (strategic), 120s (brief)
- GLM peut timeout sur auto_revision (180s) → failover vers DeepSeek

---

## CSS & STYLING

### Strategy
1. **Standalone HTML** (brief exporté): `<style>` inline dans `BRIEF_CSS` / `POSITION_FIRST_BRIEF_CSS` / `STRATEGIC_EXTRA_CSS`
2. **Web display**: `sanitizeHtml()` strip les `<style>` inline → styles doivent être dans `app/globals.css`
3. `globals.css` contient:
   - Variables `--nx-*` au niveau `:root` (héritées par `article.nomosx-brief`)
   - Variables `--bg`, `--text`, etc. au niveau `article.nomosx-brief` (dark + light mode)
   - Toutes les classes du brief standard (`.brief-header`, `.debate-grid`, `.theme-entry`, etc.)
   - Toutes les classes du position-first brief (`.brief-hero`, `.nx-block`, `.team-grid`, `.verdict-block`, etc.)

---

## POINTS DE DÉFAILLANCE HISTORIQUES (et fixes)

| Bug | Cause | Fix | Fichier |
|-----|-------|-----|---------|
| Prisma "hex escape" | Control chars 0x00-0x1F dans HTML LLM | `sanitizeForJson()` strip control chars | `pipeline-v2.ts:2701` |
| Triangular judge challenges vides | `advocateReport` hors scope | Hoist `let advocateReport` avant try block | `pipeline-v2.ts:2316` |
| Triangular judge double exécution | DA pass 2 re-déclenche le judge | Garde `!stats.triangularJudge` | `pipeline-v2.ts:2519` |
| DA reject = hard veto | Publication gate bloquait | DA = advisory seulement | `publication-gate.ts:187` |
| Orchestrator bloquait sur DA reject | Priorité 3 avant priorité 2 | Reorder: gate="revise"+trust≥70 → publish | `inquiry-orchestrator.ts:366` |
| GLM content="" | Reasoning model hit token limit | Fallback sur reasoning_content + throw si vide | `unified-llm.ts` |
| CSS stripped | sanitizeHtml enlève `<style>` | Styles dupliqués dans globals.css | `globals.css` |
| Auto-revision trop court | LLM raccourcit l'analyse | Length validation ≥ 70% de l'original | `pipeline-v2.ts:2461` |
| Critical loop threshold trop bas | Calibrated < caller | `Math.max(caller, calibrated)` | `critical-loop-v2.ts:365` |
| Grounding veto boucle morte | Veto cap → rewrite → coverage pire → veto re-trigger | Veto terminal: cap → break immédiat | `critical-loop-v2.ts:407-441` |

---

## BUGS DIAGNOSTIQUÉS (--fast run, 2026-07-28)

### Bug A: Auto-révision ne fonctionne jamais
- **Symptôme**: 0/3 succès. "LLM timeout", "les deux LLMs ont échoué", "trop courte, original gardé".
- **Coût**: ~$0.05 et plusieurs minutes par run pour rien.
- **Chemin de code**: STEP 13 auto-revision (même code que WO-1 Bug A).
- **Priorité**: Remontée — même chemin que WO-1.

### Bug B: SmartProvider filtre rien
- **Symptôme**: `[SmartProvider] Filtered 22 → 22 providers for climate domain`
- **22 → 22**: No-op. bioRxiv, IAEA, INRAE partent chercher sur du carbon pricing.
- **Fichier**: SmartProvider (à localiser).

### Bug C: Context primer contamine
- **Symptôme**: 42 trend breaks sur carbon pricing dont "Cobalt", "clinical-trial", "thesis", "medicine". REALTIME tire 47 indicateurs (WHO, USGS, NVD/CISA) sans rapport. Tourne 2× par run (47s chaque).
- **Cause racine**: Le US CPI at 332.568 [DATA] injecté dans le rapport sanctions vient d'ici.
- **Fix requis**: Gate de pertinence WO-6 volet 1 doit couvrir le context primer, pas seulement le quant agent.

### Bug D: Hypothesis verdicts — `confirmed` n'existe pas
- **Symptôme**: `hypothesisResolved` toujours 0% — le scoring cherchait `confirmed` mais l'enum est `supported`.
- **Fix**: `confirmed` → `supported` dans `eval/score.ts:246`. Ajout de `partialRate` pour `partially_supported` (4e verdict explicite).

### Bug E: groundingRate dénominateur nul
- **Symptôme**: 0 numéraux → groundingRate=0% au lieu de null. Pollue la moyenne (avgGroundingRate 32% était faux).
- **Fix**: `null` quand 0 numéral, filtré des agrégats.

---

## MÉTRIQUES DE QUALITÉ

| Métrique | Seuil | Source |
|----------|-------|--------|
| Trust Score | ≥ 65 (publish), ≥ 70 (revise→publish) | Critical Loop V2 composite |
| Quality Score | ≥ 60 | Gate computation |
| Citation Coverage | ≥ 0.50 | Citation filter |
| NLI Integrity | > 50% idéal | NLI verifier |
| Fact-Check Integrity | 100% (0 fatal) | Fact checker |
| Critical Loop Score | ≥ 60 | M+A+C composite |
| DA Overall Strength | ≥ 80 (strategic), ≥ 75 (brief) | Devil's Advocate |
| Source Count | ≥ 5 (strategic), ≥ 3 (brief) | Rank |
| Provider Diversity | ≥ 3 | Rank options |

---

## COÛTS TYPIQUES

| Étape | Coût estimé |
|-------|------------|
| Scout + Index | $0.00 (API gratuites) |
| Reader V3 (28 sources) | ~$0.10-0.15 (GLM) |
| Strategic Analyst | ~$0.005 (DeepSeek) |
| Harvard Council (4 experts) | ~$0.006 |
| PhD Deliberation | ~$0.02 |
| Debate + Meta-analysis | ~$0.03 |
| Devil's Advocate (2 passes) | ~$0.05 |
| Critical Loop (3 iterations) | ~$0.20 |
| **Total strategic** | **~$0.25-0.35** |
| **Total brief** | **~$0.05-0.15** |

---

## DURÉE TYPIQUE

| Étape | Durée |
|-------|-------|
| Scout | 10-30s |
| Reader V3 (28 sources) | 3-5 min |
| Strategic Analyst | 1-2 min |
| Harvard Council | 1-2 min |
| PhD Deliberation | 1-2 min |
| Debate + Meta | 1-2 min |
| DA + Triangular | 1-2 min |
| Critical Loop (3 iter) | 5-10 min |
| **Total strategic** | **~20-30 min** |
| **Total brief** | **~10-15 min** |
