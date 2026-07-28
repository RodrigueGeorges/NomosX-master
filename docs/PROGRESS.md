# NomosX — Chantier complet : de pipeline à chercheur

## WO-0b — Harnais d'éval
- **Statut**: terminé (harnais corrigé, --fast validé, baseline complète en attente)
- **Fichiers créés**: eval/corpus.ts, eval/score.ts, eval/run.ts, eval/domain-tiers.ts, eval/README.md, eval/snapshots/README.md
- **Fichiers modifiés**: package.json (script `eval`), docs/PROGRESS.md
- **Corrections implémentées**:
  - Variance: `--repeats N` (défaut 3, `--fast` → 1), agrégats mean/stddev/min/max/n
  - `groundingRate`: préserve `<sup class="cite">` avant strip HTML, détecte `[SRC-N]`, `[E-N]`, `[CITE]`
  - `primarySourceRatio`: classification par domaine (eval/domain-tiers.ts, ~100 entrées), DOI → tier 2
  - `tier4Ratio` et `unclassifiedRatio` ajoutés
  - `hypothesisResolved` et `inconclusiveRate` extraits de `stats.hypothesisJudge.verdicts`
  - `--fast` mode: topics 1, 2, 5 avec repeats=1
  - Snapshot: git SHA, branch, config pipeline, runs individuels + agrégats
  - Comparaison 2σ avec verdict SIGNIFICATIF/BRUIT
- **Métriques stubbées**: channelCoverage (WO-4), gapResolutionRate (WO-3)
- **Exit code**: 0 si consistencyViolations=0 ET refusalAccuracy >= 0.5

### Résultats --fast (3 topics × 1 repeat, 2026-07-28)

| Métrique | Topic 1 (carbon) | Topic 2 (lithium) | Topic 5 (regression) |
|----------|------------------|--------------------|-----------------------|
| Statut | review | held | held |
| groundingRate | 39.1% | 0.0% | 56.8% |
| primarySourceRatio | 100% | 100% | 100% |
| tier4Ratio | 0% | 0% | 0% |
| unclassifiedRatio | 63.3% | 38.1% | 17.9% |
| hypothesisResolved | 50% | 0% | 0% |
| inconclusiveRate | 25% | 100% | 75% |
| refusalCorrectness | ✗ (should publish, got review) | ✓ (should refuse, got held) | ✗ (should publish, got held) |
| internalConsistency | 0 | 0 | 1 |
| costUsd | $0.37 | $0.30 | $0.25 |
| durationMs | 2208s | 1777s | 2149s |

**Agrégat --fast:**
- avgGroundingRate: 32.0%
- avgPrimarySourceRatio: 100.0% (des sources classifiées)
- avgUnclassifiedRatio: 39.8%
- avgHypothesisResolved: 16.7%
- avgInconclusiveRate: 66.7%
- **refusalAccuracy: 33.3%** ⚠️ (1/3 correct)
- totalCostUsd: $0.92
- totalDurationMs: 6134s (~102 min)
- consistencyViolations: 1

### Observations --fast
1. **refusalAccuracy 33.3%**: Le pipeline hold/review sur les topics 1 et 5 qui devraient publier. Le grounding veto (30-39% citation coverage) cappe le composite à 40, en dessous du seuil de 60. C'est un problème de qualité du pipeline, pas du harnais.
2. **groundingRate 0% sur topic 2**: Le brief held (3315 mots) a peu de numéraux. Normal pour un topic qui devrait refuser.
3. **primarySourceRatio 100% mais unclassifiedRatio 39.8%**: Toutes les sources classifiées sont tier 1-2, mais beaucoup n'ont pas d'URL ou domaine non dans la table. Révèle un problème de métadonnées sources.
4. **hypothesisResolved/inconclusiveRate**: Extraction correcte des verdicts. Topic 2: 100% inconclusive (toutes les hypothèses inconclusives). Topic 1: 50% resolved, 25% inconclusive.
5. **internalConsistency**: 1 violation sur topic 5 (incohérence arithmétique entre pourcentages).
6. **Failover LLM**: DeepSeek → GLM fonctionne. GPT-4o utilisé en fallback pour elenchus sur topic 5.
7. **NLI Verifier**: Intégrité 54% sur les deux topics (27 supported, 23 partial, 26 unsupported, 4 misattributed pour topic 1).

## WO-1 — Bugs diagnostiqués
- **Statut**: en attente

## WO-2 — Tuer la fabrication de chiffres
- **Statut**: en attente

## WO-3 — Lacunes typées + primitive de résolution
- **Statut**: en attente

## WO-4 — Carte des mécanismes en amont
- **Statut**: en attente

## WO-5 — Retrieval agentique itératif
- **Statut**: en attente

## WO-6 — Providers de données primaires
- **Statut**: en attente

## WO-7 — Calibration au centre
- **Statut**: en attente

## WO-8 — Grounding en veto, critique dégonflée
- **Statut**: en attente
