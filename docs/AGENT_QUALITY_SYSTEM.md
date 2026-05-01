# NomosX Agent Quality System

This document defines the CTO/CPO operating model for institutional-grade outputs.

## 1. Publication Funnel

Every public piece should pass through the same funnel:

1. **Scout**: collect sources from diverse providers.
2. **Index**: normalize authors, institutions, identifiers, and novelty.
3. **Rank**: select sources with quality, relevance, recency, and diversity constraints.
4. **Read**: extract claims, methods, results, limitations, and quantitative signals.
5. **Synthesize**: produce an analysis with explicit uncertainty and citations.
6. **Dissent**: steel-man the best counter-position.
7. **Verify**: check citation support and claim density.
8. **Gate**: deterministic publish / revise / hold decision.
9. **Publish**: publish only when cadence, quality, and sign-off agree.
10. **Learn**: store failure modes, lessons, concepts, and performance traces.

## 2. Publication Gate Standard

The shared gate lives in `lib/agent/publication-gate.ts`.

Default thresholds:

- Trust score: 75/100 minimum.
- Quality score: 70/100 minimum.
- Citation coverage: 72% minimum.
- Brief source depth: 5 sources minimum.
- Strategic report source depth: 12 sources minimum.
- Fatal adversarial challenges: 0.
- Devil's Advocate publishability: 70/100 minimum.
- Uncited claim-like sentence ratio: 35% maximum.

Decision semantics:

- `publish`: all checks pass.
- `revise`: no hard failure, but evidence density or quality needs work.
- `hold`: insufficient sources, fatal challenge, failed sign-off, or adversarial block.

## 3. Evidence Ledger

The deterministic ledger lives in `lib/agent/evidence-ledger.ts`.

It extracts claim-like sentences, citation tags, citation counts, cited claim counts, and uncited claim ratios. This is not a replacement for semantic citation verification. It is a preflight instrument that catches weak drafts before they enter the public surface.

## 4. LLM Portfolio

Use multiple models only when they create measurable advantage.

Recommended policy:

- **Frontier model**: synthesis, contradiction detection, quantitative extraction, strategic reports, board memos.
- **Small frontier model**: classification, routing, citation triage, topic tagging, cheap structured checks.
- **Open-source/local model**: privacy-sensitive drafts, offline summarization, redundancy tests, first-pass extraction, embeddings experiments.
- **Do not use open-source as final judge** unless its benchmarked performance on citation support and policy reasoning is known.

Open-source candidates to benchmark:

- Llama-class instruct models for summarization and extraction.
- Mistral-class instruct models for multilingual French/English editorial support.
- Qwen-class models for structured reasoning and long context.
- Domain-specific embedding models only if retrieval quality beats the current baseline.

Acceptance criteria before adding any model:

- Better quality, lower cost, lower latency, higher privacy, or better availability.
- Evaluated against a fixed regression set of NomosX briefs.
- Same structured output contracts as existing agents.
- Logged model name, prompt version, cost, latency, and failure mode.

## 5. Prompt Contracts

Each agent prompt should include:

- Mission and non-mission.
- Required input schema.
- Required output schema.
- Citation rules.
- Uncertainty language.
- Failure behavior.
- Red-team instruction: "What would make this wrong?"
- Version identifier.

Forbidden in publication prompts:

- Uncited factual claims.
- Invented institutions, authors, or citations.
- False consensus language.
- Recommendations without implementation constraints.
- Confidence claims without evidence quality rationale.

## 6. Cadence

Top-tier think-tank output is scarce by design.

Recommended cadence:

- 1 to 3 public publications per week by default.
- Daily radar can exist, but it should be clearly labeled as signals, not final analysis.
- Strategic reports should be slower and gated by stronger source depth.
- Weekly editorial meeting should decide what is not published.

Quality is improved by selection pressure. NomosX should publish fewer pieces with stronger provenance, not more pieces with weaker claims.
