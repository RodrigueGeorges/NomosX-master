# NomosX Roadmap 2026 — State of the Art Gap Analysis

Deep search des projets open source et papiers innovants (2024-2026) sur les agents IA,
croisé avec la stack NomosX existante pour identifier les améliorations à fort impact.

---

## Stack NomosX actuelle (rappel)

NomosX est déjà un research agent multi-agent très avancé :

- **Pipeline** : SCOUT → INDEX → RANK → READER → ANALYST → EDITOR → PUBLISHER (+ DIGEST, RADAR)
- **Self-correction** : Reflexion-style après READER et ANALYST, gap-fill re-analysis
- **Human feedback learning** : corrections manuelles → lessons → injection future runs
- **Agentic layer** : Tool calling, ReAct loop, Tool Registry (6 tools), Meta-Controller (COMPASS+D2Plan), Agentic ANALYST, Dynamic DAG Planner
- **Witness métacognitif** : 6-phase cognitive cycle, meta-loop, 11 interventions, WriteGuard, cross-run learning (Sakshi/MIDCA/HyperAgents-inspired)
- **Moat 4 piliers** : PRM (logistic regression), Adversarial Self-Play, MoA (8 specialists), World Model
- **Vérification** : NLI Engine (mDeBERTa), Source Check, Atomic Claims, Citation Verifier, Cross-Model Consensus, Reflective RAG
- **Agents avancés** : Intelligent Scout (6 lenses, UCB1), CRITIC, Scenario Engine (CANA+SCATTER), Reader V3 (PDF), Analyst V3 (multipass), Critical Loop V2, Debate Agent, Meta-Analysis Engine, Knowledge Graph, Agent Memory, Researcher Identity, Devil's Advocate

---

## Gaps identifiés vs état de l'art (15 gaps)

### Gap 1 — Prompt Optimization end-to-end (DSPy / TextGrad / Trace-OPTO) ⭐⭐⭐⭐⭐ P0

**Ce qui manque** : Le Witness *suggère* des prompt modifications (append-only), mais il n'y a pas
d'optimisation systématique end-to-end. DSPy/TextGrad/Trace traitent les prompts comme des
paramètres optimisables via "textual gradients" : feedback → backprop textuelle → mise à jour.

**Projets/papiers** :
- DSPy (stanfordnlp/dspy, 20k stars) — BootstrapFewShot, MIPRO, Bayesian optimization
- TextGrad (zou-group/textgrad, 2.5k) — backprop textuelle PyTorch-style
- Trace/OPTO (microsoft/Trace, NeurIPS 2024) — AutoDiff-like pour workflows

**Implémentation NomosX** : `lib/agent/prompt-optimizer/`
- `prompt-optimizer.ts` : après chaque run, utilise les feedbacks (PRM scores, self-play lessons,
  human corrections, Witness learnings) pour *réécrire* les prompts via LLM-as-optimizer
- Métrique d'évaluation : PRM score + citation count + trust score
- Archive des versions de prompts avec leur score (best-of-N style)
- Converge vers les prompts qui maximisent la qualité prédite

### Gap 2 — Automated Agent Design (ADAS / AgentSquare / EvoAgentX) ⭐⭐⭐⭐⭐ P1

**Ce qui manque** : Le Meta-Controller *replanifie* l'exécution, mais n'*invente* pas de nouveaux
agents. ADAS (ICLR 2025 Outstanding) montre qu'un méta-agent peut *programmer* de nouveaux
agents en code à partir d'une archive de découvertes.

**Projets/papiers** :
- ADAS (ShengranHu/adas, ICLR 2025 Outstanding) — Meta Agent Search
- AgentSquare (Tsinghua, ICLR 2025) — modular agent search
- EvoAgentX (EvoAgentX/EvoAgentX, 3.2k) — self-evolving workflows

**Implémentation NomosX** : `lib/agent/adas/`
- `meta-agent-search.ts` : périodiquement, propose de nouvelles combinaisons d'agents/outils/prompts
- Test via self-play, garde les meilleures (archive style ADAS)
- Complémentaire au Moat — l'archive grandit avec chaque run

### Gap 3 — Tree Search pour le raisonnement (LATS / Agent Q) ⭐⭐⭐⭐ P1

**Ce qui manque** : Le ReAct est *linéaire*. LATS (ICML 2024) unifie reasoning+acting+planning
via MCTS avec LLM comme value function. Pour les analyses complexes, explorer plusieurs branches.

**Projets/papiers** :
- LATS (lapisrocks/LanguageAgentTreeSearch, ICML 2024) — MCTS + LM value functions
- Agent Q (arxiv 2408.07199) — MCTS + self-critique + DPO

**Implémentation NomosX** : `lib/agent/lats/`
- `tree-search.ts` : MCTS optionnel pour l'ANALYST sur queries stratégiques complexes
- Value function = PRM existant
- Expansion = tool calls, simulation = ReAct sub-loops, backprop = PRM scores

### Gap 4 — RAG adaptatif avec reflection tokens (Self-RAG / CRAG) ⭐⭐⭐⭐ P1

**Ce qui manque** : Le retrieval est *pipeline-fixe*. Self-RAG (ICLR 2024) introduit des
reflection tokens qui contrôlent *à l'inference* si/quoi/quand retriever. CRAG ajoute un
retrieval evaluator qui déclenche web search fallback.

**Projets/papiers** :
- Self-RAG (ICLR 2024, arxiv 2310.11511) — reflection tokens
- CRAG (arxiv 2401.15884) — retrieval evaluator + web search fallback

**Implémentation NomosX** : `lib/agent/adaptive-rag.ts`
- Tokens `retrieve?` / `is_relevant?` / `critique?` dans le ReAct loop
- Retrieval evaluator : confiance faible → fallback web search (Intelligent Scout)
- Intégré à l'Agentic ANALYST

### Gap 5 — Knowledge Graph RAG multi-hop (HippoRAG / LightRAG) ⭐⭐⭐⭐ P1

**Ce qui manque** : Le KG retrieval est *embedding cosine*. HippoRAG (NeurIPS 2024) utilise
Personalized PageRank sur un KG schemaless pour multi-hop QA. LightRAG fait du dual-level.

**Projets/papiers** :
- HippoRAG (OSU-NLP-Group/HippoRAG, NeurIPS 2024) — PageRank + hippocampal indexing
- LightRAG (HKUDS/LightRAG, 38k) — dual-level retrieval

**Implémentation NomosX** : `lib/agent/knowledge-graph-pagerank.ts`
- Mode retrieval `graph-pagerank` à `queryKnowledgeGraph()`
- Personalized PageRank sur le KG existant pour multi-hop
- Pour les questions "chaînes causales entre X et Y"

### Gap 6 — Chain-of-Verification (CoVe) ⭐⭐⭐ P2

**Ce qui manque** : La vérification est *post-hoc*. CoVe (Meta, ACL 2024) génère des
verification questions indépendantes *pendant* la rédaction, puis les exécute.

**Papier** : CoVe (arxiv 2309.11495, ACL 2024 Findings)

**Implémentation NomosX** : `lib/agent/chain-verification.ts`
- Step dans l'ANALYST : pour chaque claim clé, génère une question de vérification
- Exécute la vérification (NLI + source check) avant d'inclure la claim
- Marque les claims vérifiés vs non-vérifiés dans l'output

### Gap 7 — MCP (Model Context Protocol) ⭐⭐⭐ P2

**Ce qui manque** : Le Tool Registry est propriétaire. MCP est le standard de facto
(Anthropic, OpenAI, Cursor, Bee, Mastra l'ont adopté). 8000+ servers existent.

**Projet** : modelcontextprotocol/servers (2k stars)

**Implémentation NomosX** : `lib/agent/mcp/`
- `mcp-server.ts` : expose les tools NomosX (`search_sources`, `read_source`, `query_knowledge_graph`) comme MCP server
- `mcp-client.ts` : consomme des MCP servers externes (filesystem, git, browser) dans le Tool Registry

### Gap 8 — LLM-as-Judge open-source (Prometheus 2 / JudgeLM) ⭐⭐⭐ P2

**Ce qui manque** : Cross-Model Consensus et CRITIC utilisent GPT-4o-mini/DeepSeek/GLM.
Prometheus 2 (EMNLP 2024) est un judge open-source 7B avec 90% d'accord avec GPT-4.

**Projets** :
- Prometheus 2 (prometheus-eval/prometheus, 1.1k) — custom rubrics
- JudgeLM (baaivision/JudgeLM) — scalable judge

**Implémentation NomosX** : `lib/agent/local-judge.ts`
- Option de judge local via Prometheus 2 (ou Glider) pour PRM et self-play
- Complément des judges propriétaires (coût $0 + indépendance)

### Gap 9 — Temporal memory bi-temporal (Graphiti/Zep) ⭐⭐⭐ P2

**Ce qui manque** : Le World Model et Agent Memory sont *snapshot*. Graphiti maintient un
bi-temporal KG : quand un fait a été vrai + quand il a été enregistré.

**Projet** : getzep/graphiti (1.5k) — bi-temporal validity windows

**Implémentation NomosX** : ajout de `validFrom` / `validTo` / `recordedAt` au World Model
et Knowledge Graph. Permet "que savait-on à la date X ?" pour le Researcher Identity.

### Gap 10 — Test-time scaling / Budget forcing (s1) ⭐⭐⭐ P2

**Ce qui manque** : Le ReAct a `max_steps` et `max_cost` comme *hard caps*. s1 (Stanford,
EMNLP 2025) montre le *budget forcing* : forcer le modèle à continuer ("Wait") ou s'arrêter.

**Papier** : s1 (simplescaling/s1, arxiv 2501.19393, EMNLP 2025)

**Implémentation NomosX** : `lib/agent/budget-forcing.ts`
- Mode `extended_reasoning` : si PRM prédit qualité < seuil, injecte "Wait, let me reconsider..."
- Permet d'étendre le reasoning au-delà du budget par défaut pour les queries complexes

### Gap 11 — Observabilité production-grade (Langfuse / Helicone) ⭐⭐⭐ P2

**Ce qui manque** : Dashboards custom mais pas de tracing distribué production-grade.

**Projets** :
- Langfuse (langfuse/langfuse, TS natif, MIT) — tracing, evals, prompt management
- Helicone (Helicone/helicone, TS) — AI Gateway + observabilité

**Implémentation NomosX** : intégration Langfuse comme backend d'observabilité pour LLM calls.

### Gap 12 — Durable execution (Temporal / Inngest) ⭐⭐ P3

**Ce qui manque** : La job queue est *priority-based* mais pas *durable* (replay après crash).

**Projets** : Temporal (35k, TS SDK), Inngest AgentKit

**Implémentation NomosX** : évaluation — pour les runs longs (strategic, 10+ min), migrer
vers Temporal/Inngest pour résilience. Effort élevé, à évaluer.

### Gap 13 — Research patterns (STORM / PaperQA2) ⭐⭐⭐ P1

**Ce qui manque** : Intelligent Scout a 6 lenses mais pas de perspective-guided questioning
(STORM) ni de citation traversal (PaperQA2).

**Projets/papiers** :
- STORM (stanford-oval/storm, NAACL 2024) — perspective-guided question asking
- PaperQA2 (Future-House/paper-qa, arxiv 2409.13740) — citation traversal

**Implémentation NomosX** :
- Mode "STORM" à l'Intelligent Scout : pour chaque lens, simuler un expert qui pose des questions
- Citation traversal au READER : pour les top sources, récupérer leurs références

### Gap 14 — Self-Discover (reasoning structure composition) ⭐⭐ P3

**Ce qui manque** : Les agents ont des prompts fixes. Self-Discover (NeurIPS 2024) compose
automatiquement la structure de raisonnement à partir de modules atomiques.

**Papier** : Self-Discover (Google DeepMind, arxiv 2402.03620, NeurIPS 2024)

**Implémentation NomosX** : `lib/agent/self-discover.ts`
- Phase de "reasoning structure discovery" pour l'ANALYST
- Sélection/composition de modules (decomposition, abstraction, causal, comparative...)

### Gap 15 — Output guardrails (Guardrails AI / NeMo) ⭐⭐ P3

**Ce qui manque** : Le WriteGuard protège les *interventions du Witness*, pas les *outputs des LLMs*.

**Projets** : Guardrails AI (2k), NeMo Guardrails (NVIDIA)

**Implémentation NomosX** : `lib/agent/output-guard.ts`
- Validation structured outputs de l'ANALYST (format JSON, pas de PII, claims sourcées)

---

## Priorisation

| Priorité | Gaps | Impact |
|----------|------|--------|
| P0 | Gap 1 (Prompt Optimizer) | Énorme — chaînon manquant Witness → amélioration effective |
| P1 | Gaps 2, 3, 4, 5, 13 | Grand — moat + raisonnement + retrieval + research patterns |
| P2 | Gaps 6, 7, 8, 9, 10, 11 | Moyen — vérification + standards + observabilité |
| P3 | Gaps 12, 14, 15 | Faible — résilience + patterns avancés |

---

## Implémentation (Sprint 6 — 2026-08) — ÉTAT RÉEL VÉRIFIÉ (2026-11)

> ⚠️ Correction d'audit : la version initiale de cette section affirmait que
> tous les gaps P0–P2 étaient implémentés. Vérification du code (imports
> réels, pas seulement fichiers présents) :

**Implémentés ET câblés dans le pipeline :**
- `lib/agent/adaptive-rag.ts` — Gap 4 (utilisé par `reader-block.ts`)
- `lib/agent/knowledge-graph-pagerank.ts` — Gap 5 (via `knowledge-graph.ts`)
- `lib/agent/chain-verification.ts` — Gap 6 (utilisé par `critic-block.ts`, `ufo-factcheck.ts`)
- `lib/agent/local-judge.ts` — Gap 8 (utilisé par `post-analyst-checks.ts`, PRM, self-play)
- `lib/agent/output-guard.ts` — Gap 15 (utilisé par `post-analyst-checks.ts`)
- `lib/agent/temporal-memory.ts` — Gap 9 (bi-temporel, via `knowledge-graph.ts`)
- `lib/agent/langfuse.ts` — Gap 11 (tracing LLM dans `unified-llm.ts`)
- `lib/agent/durable-execution.ts` — Gap 12 (snapshots durables, Sprint 28)

**Implémenté mais derrière flag optionnelle :**
- `lib/agent/prompt-optimizer/` — Gap 1 : utilisé par `witness/meta-loop.ts`
  (`optimizeAllPrompts`), donc actif uniquement quand `useWitness` est activé.

**NON implémentés (présents dans la roadmap initiale, absents du code) :**
- Gap 2 — ADAS / meta-agent-search (`lib/agent/adas/` n'existe pas)
- Gap 3 — LATS tree search (`lib/agent/lats/` n'existe pas)
- Gap 7 — MCP server/client (`lib/agent/mcp/` n'existe pas)
- Gap 10 — Budget forcing / s1 (`lib/agent/budget-forcing.ts` n'existe pas)
- Gap 14 — Self-Discover (`lib/agent/self-discover.ts` n'existe pas)

**Partiellement couvert par des mécanismes existants :**
- Gap 13 (STORM/PaperQA2) : flag `useStorm` existe dans les options pipeline ;
  la citation traversal OpenAlex snowball est implémentée (Sprint « external-stack »).

Chaque module implémenté est conçu pour s'intégrer avec l'existant sans casser la compatibilité.
Activation via options de `runPipeline()`.
  
---  
## SPRINT 9-12 (2026-08) - IMPLEMENTED INNOVATIONS  
  
### Sprint 9 - P0+P1 Corrections  
- **P0-1**: Critic veto fix (tiered: <10  cap 40, <25  cap 55, <60  proportional)  
- **P0-2**: Provider 400 low-balance now triggers cross-family fallback  
- **P1-3**: NLI input length increased (18003000 premise, 500800 hypothesis)  
- **P1-4**: Groundedness threshold lowered (0.650.50 entailment, +0.75 strong tier)  
- **P1-5**: SCOUT provider registry expanded (2353 providers)  
- **P1-6**: ANALYST citation target lowered (50%%35%%)  
- **P1-7**: Auto-activation K1/K5/K11 (MoA, LATS, WorldEvolver)  
  
### Sprint 10 - P2 Innovations (ACL/arXiv 2026)  
- **Verbal-R3** (ACL 2026): Verbal reranker - generates annotations explaining source relevance  
- **Reflective RAG** (ACL 2026): Self-evaluation driven retrieval strategy optimization  
- **LLM-as-a-Verifier** (arXiv 2026): Continuous scoring via logit expectation  
- **CiteAudit** (arXiv 2026): Multi-agent citation authenticity verification  
  
### Sprint 11 - P2 Innovations (ICLR/arXiv 2026)  
- **Argus** (arXiv 2026): Evidence assembly with Navigator+Searcher pattern  
- **Test-Time Scaling** (ICLR 2026): Asymmetric verification - 3 parallel generations + heavy verify  
- **DSPy/MIPROv2** (Stanford): Automatic prompt optimization via Bayesian search  
- **OpenAlex Semantic Search** (2026): Embeddings-based retrieval + batch DOI verification  
  
### Sprint 12 - P3 Frontier (2026-2027)  
- **REMem** (arXiv 2026): Episodic memory with hybrid graph (gists + facts)  
- **EvoMemKG** (ACL 2026): Evolvable memory for multi-hop KG reasoning  
- **VMAO** (ICLR 2026): Plan-Execute-Verify-Replan DAG orchestrator  
- **FS-Researcher** (arXiv 2026): File-system dual agent for 100+ sources  
- **NestBrowse** (ACL 2026): Nested browser-use for deep web access  
- **NSRSA** (arXiv 2026): Neuro-symbolic recursive self-alignment  
  
  
## SPRINT 13 (2026-08) - DEEP AUDIT CORRECTIONS  
  
### P0 - Critical Bug Fixes  
- **P0-A**: Integrity propagation bug - repair result now always updates stats (was stale 58%% vs actual 79%%)  
- **P0-B**: Self-refine multi-iteration (FineRef AAAI 2026) - 3 iterations with re-verification, only accepts if improved  
- **P0-C**: Auto-suspend dead providers (VeriSwarm/Cortex 2026) - 5 failures  24h suspension (was 60s cooldown)  
  
### P1 - High-Impact Improvements  
- **P1-D**: Groundedness weight 16%%22%%, citation coverage 20%%15%% (GroundEval 2026 - quality over quantity)  
- **P1-E**: PDF extraction retry (pdfmux 2026) - 2 retries with exponential backoff + 30s timeout (was 15s, 0 retries)  
- **P1-F**: Debate quality gate (D3 EACL 2026) - re-run debate if steel-man <50 with adversarial boost prompt  
- **P1-G**: CiteGuard threshold 0.150.35 (CiteGuard ACL 2026) - reduces false positives in citation injection  
- **P1-H**: Radar Global South sources (BENI Global 10) - +19 feeds (AfDB, ADB, CAF, ISS Africa, SAIIA, ORF, ISEAS, Al-Monitor, etc.) + 5 GDELT verticals (Africa, Latin America, Southeast Asia, Middle East, South Asia)  
  
### P2 - Optimizations  
- **P2-I**: SCOUT neural routing opt-out (was opt-in) - always selects 12 most relevant providers  
- **P2-J**: Provider diversity veto - <3 providers  cap trust at 60  
- **P2-K**: Query diversification threshold 53 - activates more often  
