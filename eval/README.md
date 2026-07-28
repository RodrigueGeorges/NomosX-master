# NomosX Eval Harness

## Usage

```bash
npm run eval              # 5 topics, repeats=3 (gate de fin de WO)
npm run eval -- --fast    # topics 1,2,5 only, repeats=1 (itération intra-WO)
npm run eval -- --topic topic-1-carbon-pricing   # single topic
npm run eval -- --repeats 5   # custom repeat count
npm run eval -- --no-run  # compare last two snapshots only
```

## Métriques

Toutes déterministes, aucun LLM juge.

| Métrique | Description |
|----------|-------------|
| groundingRate | Numéraux avec citation [SRC-N] ou [E-N] / total numéraux |
| primarySourceRatio | Sources tier 1-2 (par domaine) / total classifié |
| tier4Ratio | Sources tier 4 / total classifié |
| unclassifiedRatio | Sources non classifiées / total |
| hypothesisResolved | Hypothèses confirmed+refuted / total |
| inconclusiveRate | Hypothèses inconclusive / total |
| refusalCorrectness | Refuse quand il faut, publie quand il faut |
| internalConsistency | Incohérences arithmétiques (doit = 0) |
| costUsd | Coût du run |
| durationMs | Durée du run |

**Métriques interdites** (auto-référentielles): trustScore, qualityScore, publishability, overallStrength.

## Règle 2σ

Un delta inférieur à 2σ n'est pas un résultat. Aucun WO ne se valide sur du bruit.

La comparaison entre snapshots affiche pour chaque métrique:
- delta (current - previous)
- 2σ du snapshot de référence
- verdict: **SIGNIFICATIF** si |delta| >= 2σ, **BRUIT** sinon

## Stubs (TODO futur WO)

- `channelCoverage` → WO-4 (mechanism map)
- `gapResolutionRate` → WO-3 (gap resolver)

## Snapshots

Stockés dans `eval/snapshots/snapshot-<timestamp>.json`.
Chaque snapshot contient: git SHA, branche, config pipeline, agrégats par topic (mean/stddev/min/max), runs individuels.
