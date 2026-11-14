# NomosX quant-service

Deterministic quantitative model API — the Python side of the **QUANT BRIDGE**.

Computes Leontief input-output analysis on **Eurostat FIGARO** inter-country
industry-by-industry tables (free, official EU statistics, commercially safe).

## Why a separate service?

The NomosX app runs on Netlify (Node/Next.js) which cannot host
pandas/numpy workloads. This service runs on any container host
(Railway, Fly.io, Render...) and is reached via `QUANT_SERVICE_URL`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + loaded matrix info |
| POST | `/v1/io/shock` | Final-demand shock propagation (output, VA, spillovers) |
| GET | `/v1/io/multipliers?region=FR&industry=C26` | Leontief multipliers for a sector |

### Example

```bash
curl -X POST http://localhost:8100/v1/io/shock \
  -H "Content-Type: application/json" \
  -d '{"region": "FR", "industry": "C26", "demandShockMeur": 1000}'
```

Response: total output impact (direct + indirect), value-added impact,
type-I output multiplier, top spillover sectors — all in M EUR, with
data source and methodology statement attached.

## Run locally

```bash
pip install -r requirements.txt
FIGARO_DEMO=1 uvicorn main:app --port 8100   # demo matrix, offline
uvicorn main:app --port 8100                 # real FIGARO (downloads ~100MB once)
```

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `FIGARO_YEAR` | `2021` | Reference year of the IO table |
| `FIGARO_EDITION` | `24ed` | FIGARO release edition |
| `FIGARO_CACHE_DIR` | `./.cache` | Where the parquet cache lives |
| `FIGARO_DEMO` | `0` | `1` = bundled demo matrix (dev/CI) |

## Next.js integration

Set in the Netlify environment:

```
QUANT_SERVICE_URL=https://your-quant-service.example.com
```

The pipeline (`lib/quant/quant-bridge.ts`) automatically derives
sector×region shocks from strategic queries and injects results as
`[MODEL-N]` evidence into the STRATEGIC ANALYST prompt.

## Methodology & limits (stated in every response)

- Leontief type-I: fixed technical coefficients, no price effects,
  no supply constraints, no induced (household) effects.
- Results are linear in the shock — read as impact per €1bn.
- Static structural analysis, not a dynamic forecast.

## Roadmap

- FIGARO-E3 extensions (employment FTE, kt CO2e per sector)
- FIGARO-REG (NUTS2 regional impact analysis)
- TwinRD D4.2 model integration when released (July 2026, open source)

## Docling structured extraction (optional)

`POST /v1/docling/parse` converts a PDF URL to structured markdown via
[Docling](https://github.com/docling-project/docling) (IBM, MIT) — tables
and reading order preserved, unlike the reader's pdf-parse fallback.

Docling is **not** in `requirements.txt` (heavy: ~2-4 GB of models).
Install it in a dedicated deployment:

```bash
pip install -r requirements.txt -r requirements-docling.txt
```

Env: `DOCLING_ENABLED=0` hard-disables; `DOCLING_MAX_PAGES` (default 80),
`DOCLING_MAX_BYTES` (default 8 MB), `DOCLING_FETCH_TIMEOUT` (default 20s).
Without docling installed the endpoint returns 503 and the reader falls
back to pdf-parse — the pipeline never blocks on it.

The app side requires `QUANT_SERVICE_URL` + `NOMOSX_DOCLING=1`.

## Chronos-2 forecasting (optional)

`POST /v1/forecast` produces zero-shot quantile forecasts
(median + q10/q90) for a univariate series via
[Chronos-2](https://github.com/amazon-science/chronos-forecasting)
(Apache 2.0). The reader feeds it primary-data series from quant-agent;
the result becomes a `[MODEL-N]` exhibit.

Not in `requirements.txt` — install with:

```bash
pip install -r requirements.txt -r requirements-chronos.txt
```

Env: `CHRONOS_ENABLED=0` hard-disables; `CHRONOS_MODEL`
(default `amazon/chronos-2`), `CHRONOS_DEVICE` (`cpu` default),
`CHRONOS_MAX_HISTORY` (512), `CHRONOS_MAX_HORIZON` (24).
App side: `QUANT_SERVICE_URL` + `NOMOSX_CHRONOS=1`.

## MiniCheck shadow verification (optional)

`POST /v1/minicheck/check` returns claim↔document support verdicts via
[MiniCheck](https://github.com/Liyan06/MiniCheck) (Apache 2.0) — a small
model specialized in grounding verification. The app uses it in SHADOW
mode (`stats.minicheckShadow`) to calibrate against the LLM
fact-checker before any gating role.

```bash
pip install -r requirements.txt -r requirements-minicheck.txt
```

Env: `MINICHECK_ENABLED=0`, `MINICHECK_MODEL`
(default `lytang/MiniCheck-Flan-T5-Large`, `bespokelabs/Bespoke-MiniCheck-7B`
for higher accuracy), `MINICHECK_DEVICE`, `MINICHECK_MAX_PAIRS` (30).
App side: `QUANT_SERVICE_URL` + `NOMOSX_MINICHECK=1`.
