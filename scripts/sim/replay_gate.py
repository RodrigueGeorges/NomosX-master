"""
Counterfactual replay of the publication decision on a REAL run (no LLM call).
Re-applies proposed rules to the persisted stats of a run and shows what would change.
Usage: python3 replay_gate.py <repo>/scripts/_run10-stats.json
"""
import json, os, re, sys
from datetime import date, datetime

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_run10-stats.json")
s = json.load(open(path))
today = date.today()
rows = []

# 1. date anchor: sentinels dated in the past are rejected
sent = (s.get("centralScenario") or {}).get("sentinels", [])
past = []
for st in sent:
    m = re.search(r"By (\d{1,2}) (\w+) (20\d\d)", st.get("statement", ""))
    if m:
        d = datetime.strptime(f"{m[1]} {m[2]} {m[3]}", "%d %B %Y").date()
        if d <= today:
            past.append(f"{d.isoformat()} (linkId {st.get('linkId')})")
rows.append(("Ancrage de la date", f"{len(past)}/{len(sent)} sentinelles rejetées : " + ", ".join(past) if past else "aucune"))

# 2. election rule: central scenario only if lead over uniform > 10 pts and winShare >= 0.6
el = s.get("swarmElection") or {}
if el.get("probabilities"):
    n = len(el["probabilities"]); top = el["probability"]
    lead = top - 1 / n
    ok = lead > 0.10 and (el.get("winShare") or 0) >= 0.6
    rows.append(("Règle d'élection", f"écart sur l'uniforme {lead*100:.1f} pts, winShare {el.get('winShare'):.0%} → "
                 + ("scénario central maintenu" if ok else "« pas de scénario dominant »")))

# 3. question link: does the bound thesis / forecast address the question?
tb = s.get("thesisBinding") or {}
sub = tb.get("origin") == "corpus_derived"
rows.append(("Lien « question »", "thèse dérivée du corpus, pas de probabilité sur la question → bloqué" if sub else "ok"))

# 4. honest trust: fact integrity and fatal numbers cap the trust
fc = s.get("factChecker") or {}
integ, fatal = fc.get("integrityScore"), fc.get("fatalIssues", 0)
gate = s.get("publicationGate") or {}
trust_now = next((c["details"] for c in gate.get("checks", []) if c["check"] == "trust_score"), "?")
cap = None
if integ is not None and (integ < 85 or fatal >= 1):
    cap = 55 if fatal >= 1 else 65
rows.append(("Trust honnête", f"actuel {trust_now} ; fact-check {integ} %, {fatal} fatale → plafond {cap}" if cap else "inchangé"))

# 5. swarm vote quality
sf = s.get("swarmForecasts") or {}
probs = [f["probability"] for f in sf.get("forecasts", []) if f.get("families", 0) >= 2]
if probs:
    info = sum(abs(p - 0.5) for p in probs) / len(probs)
    rows.append(("Informativité des votes", f"écart moyen à 0,5 = {info:.3f} sur {len(probs)} liens ; "
                 f"{sf.get('ungroundedVotes')} votes sans preuve sur {sf.get('validVotes')}"))

print(f"Rejeu contrefactuel — {path}\nDécision réelle : {gate.get('decision')} ({'; '.join(gate.get('reasons', []))})\n")
for k, v in rows:
    print(f"- {k} : {v}")
