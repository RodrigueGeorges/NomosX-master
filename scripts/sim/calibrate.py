"""
Auto-calibration: reads real NomosX run traces (scripts/_validate-run*.key.log and
scripts/_run*-stats.json) and writes calib.json for stack_sim2.py.
Each new run pushed by Devin refines the simulator: python3 calibrate.py <repo>/scripts
"""
import glob, json, os, re, sys
from datetime import date

SCRIPTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TODAY = date.today()

AUTH_QUOTA = re.compile(r"\[SCOUT/(\w+)\].*HTTP (401|402|432)")
FLAKY = re.compile(r"\[SCOUT/(\w+)\].*(429|timeout|Circuit breaker|fetch failed)", re.I)
BUDGET = re.compile(r"\[SCOUT/(\w+)\].*request budget exhausted", re.I)
GAPFILL = re.compile(r"\[GAP-FILL\].*\+(\d+) new sources")
CRITIC = re.compile(r"\[Critic\] Verdict: (\w+) \(score=(\d+)")
READER = re.compile(r"Complete: (\d+) full-text, (\d+) abstract")
ANALYST = re.compile(r"\[Analyst V3\] Complete in (\d+)ms")


def parse_log(path):
    txt = open(path, encoding="utf-8", errors="ignore").read().splitlines()
    dead, flaky, starved = {}, {}, {}
    gap, critic, ft, ab, analyst_ms = [], [], 0, 0, []
    for line in txt:
        if m := AUTH_QUOTA.search(line): dead[m[1]] = dead.get(m[1], 0) + 1
        elif m := BUDGET.search(line): starved[m[1]] = starved.get(m[1], 0) + 1
        elif m := FLAKY.search(line): flaky[m[1]] = flaky.get(m[1], 0) + 1
        if m := GAPFILL.search(line): gap.append(int(m[1]))
        if m := CRITIC.search(line): critic.append((m[1], int(m[2])))
        if m := READER.search(line): ft += int(m[1]); ab += int(m[2])
        if m := ANALYST.search(line): analyst_ms.append(int(m[1]))
    return dict(dead=dead, flaky=flaky, starved=starved, gapfill=gap, critic=critic,
                fulltext_rate=ft / max(ft + ab, 1), analyst_runs=len(analyst_ms),
                analyst_min=sum(analyst_ms) / 60000)


def parse_stats(path):
    s = json.load(open(path))
    out = {"cost": s.get("costUsd"), "minutes": (s.get("durationMs") or 0) / 60000,
           "status": s.get("status")}
    sf = s.get("swarmForecasts") or {}
    probs = [f["probability"] for f in sf.get("forecasts", []) if f.get("families", 0) >= 2]
    if probs:
        out["swarm_informativeness"] = sum(abs(p - 0.5) for p in probs) / len(probs)
        out["ungrounded_vote_share"] = sf.get("ungroundedVotes", 0) / max(sf.get("validVotes", 1), 1)
    el = s.get("swarmElection") or {}
    if el.get("probabilities"):
        n = len(el["probabilities"]); top = max(el["probabilities"].values())
        out["election_lead_over_uniform"] = top - 1 / n
        out["election_winshare"] = el.get("winShare")
    sents = (s.get("centralScenario") or {}).get("sentinels", [])
    past = 0
    for st in sents:
        years = [int(y) for y in re.findall(r"\b(20\d\d)\b", st.get("statement", ""))]
        m = re.search(r"By (\d{1,2}) (\w+) (20\d\d)", st.get("statement", ""))
        if m:
            try:
                from datetime import datetime
                d = datetime.strptime(f"{m[1]} {m[2]} {m[3]}", "%d %B %Y").date()
                past += d <= TODAY
            except ValueError:
                pass
    out["sentinels"] = len(sents); out["past_dated_sentinels"] = past
    fc = s.get("factChecker") or {}
    out["fact_integrity"] = fc.get("integrityScore"); out["fact_fatal"] = fc.get("fatalIssues")
    gate = s.get("publicationGate") or {}
    out["gate_reasons"] = gate.get("reasons", [])
    tb = s.get("thesisBinding") or {}
    out["thesis_origin"] = tb.get("origin")
    return out


def main():
    runs = []
    for log in sorted(glob.glob(os.path.join(SCRIPTS, "_validate-run*.key.log"))):
        tag = re.search(r"run(\d+)", log)[1]
        r = {"run": tag, **parse_log(log)}
        st = os.path.join(SCRIPTS, f"_run{tag}-stats.json")
        if os.path.exists(st):
            r.update(parse_stats(st))
        runs.append(r)
    if not runs:
        sys.exit("no run traces found")

    # aggregate into simulator parameters (simple pooled estimates)
    dead = set().union(*[r["dead"] for r in runs])
    crit = [c for r in runs for c in r["critic"]]
    gap = [g for r in runs for g in r["gapfill"]]
    def mean(key, default):
        v = [r[key] for r in runs if r.get(key) is not None]
        return sum(v) / len(v) if v else default
    calib = {
        "n_runs": len(runs),
        "dead_providers": sorted(dead),
        "gapfill_success_rate": sum(g > 0 for g in gap) / max(len(gap), 1),
        "fulltext_rate": mean("fulltext_rate", 0.2),
        "card_voter_informativeness": mean("swarm_informativeness", 0.05),
        "ungrounded_vote_share": mean("ungrounded_vote_share", 0.2),
        "election_lead_over_uniform": mean("election_lead_over_uniform", 0.03),
        "date_bug_rate": sum(r.get("past_dated_sentinels", 0) for r in runs) / max(sum(r.get("sentinels", 0) for r in runs), 1),
        "substitution_rate": sum(r.get("thesis_origin") == "corpus_derived" for r in runs) / len(runs),
        "analyst_runs": mean("analyst_runs", 2),
        "minutes": mean("minutes", 70), "cost": mean("cost", 1.4),
        "critic_scores": crit,
        # literature prior: single LLM-judge pass ~45% within-judge variance (Coin Flip Judge, 2026)
        "critic_within_noise_share": 0.45,
        "runs": runs,
    }
    json.dump(calib, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "calib.json"), "w"), indent=1, default=str)
    show = {k: v for k, v in calib.items() if k != "runs"}
    print(json.dumps(show, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
