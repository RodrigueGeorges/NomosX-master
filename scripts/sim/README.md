# Simulateur de stack NomosX

Outils pour choisir les réglages de la stack et vérifier les règles de publication sans relancer de run payant.

| Fichier | Rôle |
|---|---|
| `calibrate.py` | Lit `scripts/_validate-run*.key.log` et `scripts/_run*-stats.json`, écrit `calib.json` (fournisseurs morts, relances de recherche, texte intégral, informativité des votes, bug de date, changement de question, coût, durée). |
| `replay_gate.py` | Rejoue sur un vrai run, sans appel LLM, les règles proposées : ancrage de la date, règle d'élection, lien « question », trust honnête, informativité des votes. |
| `stack_sim2.py` | Monte Carlo de la mécanique du pipeline, calibré par `calib.json` avec incertitude, et recherche Optuna de la configuration la moins chère sous contrainte (publications fautives ≤ 8 %, bonnes notes ≥ 55 %, Brier ≤ 0,225). |

## Après chaque run

```bash
pip install numpy optuna
python3 scripts/sim/calibrate.py scripts
python3 scripts/sim/replay_gate.py scripts/_runN-stats.json
python3 scripts/sim/stack_sim2.py --trials 400 --runs 3000
```

Joindre les sorties à la PR. Avant un run, noter la prédiction de `stack_sim2.py` pour la comparer au résultat réel.

## Limites

La « qualité » est une variable abstraite : le simulateur classe les leviers et les réglages, il ne prédit pas la qualité d'écriture d'un modèle. Un changement de modèle se valide par de vrais runs, pas par rejeu. La calibration s'élargit ou se resserre selon le nombre de runs tracés.
