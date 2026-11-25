"""
NomosX stack simulator v2.
- Parameters calibrated from real traces (calib.json, built by calibrate.py) with
  uncertainty: every simulated run draws its own calibration, so recommendations
  must hold across the plausible range, not for one guess.
- Continuous settings (forecaster count, critic passes, thresholds, election margin,
  analyst re-runs, read cap) on top of the on/off levers.
- Constrained search (SCOPE-style: cheapest configuration meeting quality constraints)
  with Optuna TPE, then Pareto front cost / good notes / forecast skill.
Usage: python3 stack_sim2.py [--trials 400] [--runs 3000]
"""
import json, os, sys
import numpy as np
import optuna

arg = lambda k, d: int(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
TRIALS, RUNS = arg("--trials", 400), arg("--runs", 3000)
CAL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "calib.json")))
optuna.logging.set_verbosity(optuna.logging.WARNING)

DEAD_NOW = set(p.lower() for p in CAL["dead_providers"])
PROVIDERS = {"tavily": 1.0, "exa": 1.0, "springer": 0.5, "openalex": 1.0, "crossref": 0.6, "s2": 0.8, "gdelt": 0.4}
FLAKY_NOW = {"openalex": 0.8, "crossref": 0.5, "s2": 0.7, "gdelt": 0.6}
BOOL_LEVERS = {"f0_infra", "circuit_breaker", "corpus_quota", "premium_models", "question_link",
               "contra_guard", "date_anchor", "honest_trust"}
CONSTRAINTS = dict(false_share=0.08, good_rate=0.55, brier=0.225)


def draw_calibration(rng, n):
    """Per-run calibration draws, centred on observed values, widened for n_runs=1."""
    return dict(
        critic_sd=rng.uniform(8, 16, n),                         # within-judge noise ~45% variance
        card_w=rng.uniform(0.05, 0.25, n),                        # v10: |p-0.5| = 0.074 on card votes
        agentic_w=rng.uniform(0.35, 0.70, n),                     # AIA/FutureSearch: search >> cards
        premium=rng.uniform(0.03, 0.12, n),
        date_bug=rng.beta(3, 1, n),                               # v10: 2/2 sentinels in the past
        sub_base=rng.uniform(0.5, 0.9, n),                        # v10: thesis corpus-derived
        f0_up=rng.uniform(0.85, 0.98, n),
    )


def simulate(s, n=RUNS, seed=0):
    rng = np.random.default_rng(seed)
    s = {k: (bool(v) if k in BOOL_LEVERS else v) for k, v in s.items()}
    P = draw_calibration(rng, n)
    d = rng.uniform(0, 1, n); p_true = rng.beta(2, 2, n)
    premium = s["premium_models"] and s["f0_infra"]

    # infra & HTTP budget
    alive_w = np.zeros(n); waste = np.zeros(n); search_alive = np.zeros(n, bool)
    for name, w in PROVIDERS.items():
        if s["f0_infra"]:
            p_up = P["f0_up"]
        else:
            p_up = 0.0 if name in DEAD_NOW else FLAKY_NOW.get(name, 0.9)
        up = rng.random(n) < p_up
        alive_w += up * w
        waste += (~up) * (1 if s["circuit_breaker"] else 45)
        if name in ("tavily", "exa"):
            search_alive |= up
    read_cap = s["read_cap"]
    budget_left = 400 - waste - rng.normal(200 + 2 * read_cap, 40, n)
    gapfill_ok = (budget_left > 0) & search_alive
    markets_ok = (budget_left + (40 if s["circuit_breaker"] else 0)) > 0

    # corpus: breadth, full text, regulatory/recency, read depth (diminishing returns past ~25)
    breadth = 1 - np.exp(-alive_w / 2.0)
    fulltext = (0.45 if s["f0_infra"] else CAL["fulltext_rate"]) + (0.2 if s["corpus_quota"] else 0)
    regulatory = rng.random(n) < (0.9 if s["corpus_quota"] else 0.2)
    depth = 1 - np.exp(-read_cap / 15)
    q_c = np.clip(0.3 * breadth + 0.25 * fulltext + 0.25 * regulatory + 0.1 * depth
                  + 0.1 * gapfill_ok + rng.normal(0, 0.05, n), 0, 1)

    # analyst (extra re-runs help a little, cost a lot)
    rerun_gain = 0.02 * (s["analyst_max_runs"] - 1)
    q_a = np.clip(0.25 + 0.5 * q_c + premium * P["premium"] - 0.15 * d + rerun_gain
                  + rng.normal(0, 0.08, n), 0, 1)
    substituted = rng.random(n) < np.where(s["question_link"], 0.05, np.clip(P["sub_base"] - q_c, 0.05, 0.9))
    date_bug = rng.random(n) < np.where(s["date_anchor"], 0.02, P["date_bug"])
    truly_good = (q_a >= 0.6) & ~substituted & ~date_bug

    # critic: k passes, median; false prospective contradictions
    k = s["critic_passes"]
    fp = rng.poisson((0.3 if s["contra_guard"] else 1.5) * d)
    draws = np.stack([110 * (q_a - 0.2) - 10 * fp + rng.normal(0, 1, n) * P["critic_sd"] for _ in range(k)])
    score = np.median(draws, axis=0)
    reject = score < 20

    # gates
    trust = (55 + 45 * q_a if s["honest_trust"] else 78 + 12 * q_a) + rng.normal(0, 4, n)
    quality = 100 * q_a + rng.normal(0, 6, n)
    published = ((~reject) & (trust >= s["trust_th"]) & (quality >= s["quality_th"])
                 & ~(date_bug & s["date_anchor"]) & ~(substituted & s["question_link"])).astype(bool)

    # forecast on the question
    K = s["n_forecasters"]
    if K > 0:
        w = P["agentic_w"] * np.where(search_alive, 1.0, 0.35) + 0.15 * markets_ok
        noise = 0.35 * np.sqrt(0.4 + 0.6 / K)            # shared error does not average out
    else:
        w = P["card_w"] + 0.05 * markets_ok
        noise = 0.6
    logit = np.log(p_true / (1 - p_true))
    p_hat = np.clip(1 / (1 + np.exp(-(w * logit + rng.normal(0, 1, n) * noise))), 0.05, 0.95)
    answers_q = (~substituted) & s["question_link"]
    p_pub = np.where(answers_q, p_hat, 0.5)
    brier = (p_pub - p_true) ** 2 + p_true * (1 - p_true)
    dominant = np.abs(p_hat - 0.5) > s["election_margin"]
    misleading = published & ~dominant & (s["election_margin"] < 0.05)
    false_pub = published & (~truly_good | misleading)

    # cost & time
    cost = (0.30 + 0.012 * read_cap + s["analyst_max_runs"] * 0.37 * (1.5 if premium else 1.0)
            + 0.012 * k + (K * 3 * rng.uniform(0.14, 0.55, n) if K > 0 else 0.05))
    minutes = 25 + 0.4 * read_cap + 6.5 * s["analyst_max_runs"] + (0 if s["circuit_breaker"] else 4) \
        + (6 if K > 0 else 0) + rng.normal(0, 5, n)

    pubs = max(published.sum(), 1)
    return dict(good_rate=float((published & ~false_pub).mean()),
                false_share=float(false_pub.sum() / pubs),
                brier=float(brier[published].mean()) if published.any() else 0.25,
                commit=float((published & dominant & answers_q).sum() / pubs),
                cost=float(np.mean(cost)), minutes=float(np.mean(minutes)))


def space(t):
    return dict(
        f0_infra=t.suggest_categorical("f0_infra", [0, 1]),
        circuit_breaker=t.suggest_categorical("circuit_breaker", [0, 1]),
        corpus_quota=t.suggest_categorical("corpus_quota", [0, 1]),
        premium_models=t.suggest_categorical("premium_models", [0, 1]),
        question_link=t.suggest_categorical("question_link", [0, 1]),
        contra_guard=t.suggest_categorical("contra_guard", [0, 1]),
        date_anchor=t.suggest_categorical("date_anchor", [0, 1]),
        honest_trust=t.suggest_categorical("honest_trust", [0, 1]),
        n_forecasters=t.suggest_int("n_forecasters", 0, 7),
        critic_passes=t.suggest_categorical("critic_passes", [1, 3, 5]),
        trust_th=t.suggest_int("trust_th", 60, 85, step=5),
        quality_th=t.suggest_int("quality_th", 55, 75, step=5),
        election_margin=t.suggest_float("election_margin", 0.0, 0.2, step=0.025),
        analyst_max_runs=t.suggest_int("analyst_max_runs", 1, 3),
        read_cap=t.suggest_int("read_cap", 15, 40, step=5),
    )


def objective(t):
    s = space(t); r = simulate(s, seed=t.number)
    for k, v in r.items():
        t.set_user_attr(k, v)
    pen = (max(0, r["false_share"] - CONSTRAINTS["false_share"]) * 40
           + max(0, CONSTRAINTS["good_rate"] - r["good_rate"]) * 40
           + max(0, r["brier"] - CONSTRAINTS["brier"]) * 400)
    return r["cost"] + pen


def main():
    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=1))
    study.optimize(objective, n_trials=TRIALS)
    trials = [t for t in study.trials if t.value is not None]
    feas = [t for t in trials if t.user_attrs["false_share"] <= CONSTRAINTS["false_share"]
            and t.user_attrs["good_rate"] >= CONSTRAINTS["good_rate"] and t.user_attrs["brier"] <= CONSTRAINTS["brier"]]
    best = min(feas, key=lambda t: t.user_attrs["cost"]) if feas else study.best_trial

    # robustness: re-simulate the best config under 10 independent calibration seeds
    reps = [simulate(best.params, seed=1000 + i) for i in range(10)]
    agg = {k: (np.mean([r[k] for r in reps]), np.percentile([r[k] for r in reps], 5),
               np.percentile([r[k] for r in reps], 95)) for k in reps[0]}

    # Pareto front on (cost, -good_rate, brier) among low-false configs
    pool = [t for t in trials if t.user_attrs["false_share"] <= 0.10]
    pareto = []
    for t in pool:
        a = t.user_attrs
        dom = any(o.user_attrs["cost"] <= a["cost"] and o.user_attrs["good_rate"] >= a["good_rate"]
                  and o.user_attrs["brier"] <= a["brier"] and o is not t and
                  (o.user_attrs["cost"], -o.user_attrs["good_rate"], o.user_attrs["brier"]) != (a["cost"], -a["good_rate"], a["brier"])
                  for o in pool)
        if not dom:
            pareto.append(t)
    pareto.sort(key=lambda t: t.user_attrs["cost"])

    # parameter importance (fANOVA) on the penalised objective
    try:
        imp = optuna.importance.get_param_importances(study)
    except Exception:
        imp = {}

    L = ["# Simulateur v2 — recherche sous contrainte", "",
         f"Calibré sur {CAL['n_runs']} run(s) réel(s), {TRIALS} configurations explorées x {RUNS} runs simulés, "
         f"calibration tirée au hasard dans sa plage plausible pour chaque run.",
         f"Contraintes : publications fautives <= {CONSTRAINTS['false_share']:.0%}, bonnes notes publiées >= "
         f"{CONSTRAINTS['good_rate']:.0%}, Brier des notes publiées <= {CONSTRAINTS['brier']}.", "",
         f"## Configuration la moins chère qui respecte les contraintes ({len(feas)} configurations faisables)",
         "| Réglage | Valeur |", "|---|---|"]
    for k, v in best.params.items():
        L.append(f"| {k} | {v} |")
    L += ["", "Sur 10 calibrations indépendantes (moyenne, 5e–95e centile) :", "| Mesure | Moyenne | Plage |", "|---|---|---|"]
    lab = dict(good_rate="Bonnes notes publiées", false_share="Publications fautives", brier="Brier (notes publiées)",
               commit="Notes qui s'engagent sur la question", cost="Coût par run ($)", minutes="Durée (min)")
    for k, (m, lo, hi) in agg.items():
        pct = k in ("good_rate", "false_share", "commit")
        f = (lambda x: f"{x:.0%}") if pct else (lambda x: f"{x:.3f}" if k == "brier" else f"{x:.2f}")
        L.append(f"| {lab[k]} | {f(m)} | {f(lo)} – {f(hi)} |")
    L += ["", "## Front de Pareto (publications fautives <= 10 %)",
          "| Coût | Bonnes publiées | Brier | Engagées | Prévisionnistes | Passes critic | Relances analyste | Sources lues |",
          "|---|---|---|---|---|---|---|---|"]
    for t in pareto[:10]:
        a, p = t.user_attrs, t.params
        L.append(f"| {a['cost']:.2f} $ | {a['good_rate']:.0%} | {a['brier']:.3f} | {a['commit']:.0%} | "
                 f"{p['n_forecasters']} | {p['critic_passes']} | {p['analyst_max_runs']} | {p['read_cap']} |")
    if imp:
        L += ["", "## Importance des réglages (fANOVA sur l'objectif)", "| Réglage | Importance |", "|---|---|"]
        for k, v in list(imp.items())[:10]:
            L.append(f"| {k} | {v:.0%} |")
    txt = "\n".join(L)
    print(txt)
    open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "stack_sim2_results.md"), "w").write(txt + "\n")


if __name__ == "__main__":
    main()
