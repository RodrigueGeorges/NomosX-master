"""
NomosX quant-service — deterministic quantitative model API.

Endpoints:
  GET  /                    — service info (lightweight, no model load)
  GET  /health              — liveness + loaded model info
  POST /v1/io/shock         — FIGARO final-demand shock propagation
  GET  /v1/io/multipliers   — Leontief output multiplier for a sector

Run locally:
  pip install -r requirements.txt
  FIGARO_DEMO=1 uvicorn main:app --port 8100

Deploy: see Dockerfile (Railway / Fly.io / any container host).
The Next.js app reaches this service via QUANT_SERVICE_URL.

Environment:
  QUANT_CORS_ORIGINS  — comma-separated allowed origins (default: *)
  FIGARO_DEMO=1       — use demo matrix instead of downloading Eurostat
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from figaro import get_model

# --- Structured logging -------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("quant.api")

app = FastAPI(title="NomosX quant-service", version="0.2.0")

# --- CORS ---------------------------------------------------------------------

_cors_env = os.environ.get("QUANT_CORS_ORIGINS", "").strip()
if _cors_env:
    _allowed_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    _allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# --- Request ID + duration middleware -----------------------------------------

@app.middleware("http")
async def request_context(request: Request, call_next: Any) -> Any:
    rid = request.headers.get("x-request-id", uuid.uuid4().hex[:12])
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
    response.headers["x-request-id"] = rid
    logger.info(
        f'rid={rid} method={request.method} path={request.url.path} '
        f'status={response.status_code} ms={elapsed_ms}'
    )
    return response


METHODOLOGY = (
    "Leontief type-I input-output analysis on Eurostat FIGARO inter-country "
    "industry-by-industry tables. A final-demand shock is propagated through "
    "the Leontief inverse (I-A)^-1 to obtain direct + indirect output and "
    "value-added effects. Fixed technical coefficients; no price or supply "
    "constraints; results are linear in the shock."
)


class ShockRequest(BaseModel):
    region: str = Field(..., examples=["FR", "EU27"])
    industry: str = Field(..., examples=["C26", "D35", "J62_63"])
    demandShockMeur: float = Field(1000, gt=0, le=1_000_000)
    year: int | None = None


@app.get("/")
def root() -> dict:
    """Lightweight service info — does NOT load the FIGARO model."""
    try:
        import docling_parse as dp
        docling = dp.available()
    except Exception:
        docling = False
    try:
        import forecast as fc
        chronos = fc.available()
    except Exception:
        chronos = False
    try:
        import minicheck_check as mc
        minicheck = mc.available()
    except Exception:
        minicheck = False
    return {"service": "NomosX quant-service", "version": "0.4.0", "docling": docling, "chronos": chronos, "minicheck": minicheck, "docs": "/docs"}


@app.get("/health")
def health() -> dict:
    m = get_model()
    return {"status": "ok", "dataSource": m.source, "year": m.year, "sectors": int(len(m.x))}


@app.post("/v1/io/shock")
def io_shock(req: ShockRequest) -> dict:
    m = get_model()
    region = req.region.strip().upper()
    industry = req.industry.strip().upper()
    if not region or not industry:
        raise HTTPException(status_code=400, detail="region and industry must be non-empty strings")
    try:
        result = m.shock(region, industry, req.demandShockMeur)
    except KeyError as e:
        raise HTTPException(
            status_code=404,
            detail=f"Region/industry not found in FIGARO matrix: {e}. Available regions/industries depend on the loaded year.",
        ) from e
    return {
        "region": region,
        "industry": industry,
        "year": m.year,
        "demandShockMeur": req.demandShockMeur,
        **result,
        "dataSource": m.source,
        "methodology": METHODOLOGY,
    }


@app.get("/v1/io/multipliers")
def io_multipliers(region: str, industry: str) -> dict:
    m = get_model()
    region_u = region.strip().upper()
    industry_u = industry.strip().upper()
    if not region_u or not industry_u:
        raise HTTPException(status_code=400, detail="region and industry query params are required")
    try:
        result = m.shock(region_u, industry_u, 1000.0)
    except KeyError as e:
        raise HTTPException(
            status_code=404,
            detail=f"Region/industry not found in FIGARO matrix: {e}.",
        ) from e
    return {
        "region": region_u,
        "industry": industry_u,
        "year": m.year,
        "outputMultiplier": result["outputMultiplier"],
        "valueAddedPerMeur": round(result["valueAddedImpactMeur"] / 1000.0, 4),
        "dataSource": m.source,
        "methodology": METHODOLOGY,
    }


# --- Docling structured PDF extraction (optional heavy path) -----------------
#
# The Next.js reader calls this BEFORE its local pdf-parse fallback: Docling
# preserves tables/reading order that pdf-parse flattens, which matters for
# claim→passage evidence contracts. 503 when docling isn't installed — the
# caller treats any failure as "fall back", never as fatal.

DOCLING_MAX_BYTES = int(os.environ.get("DOCLING_MAX_BYTES", str(8 * 1024 * 1024)))
DOCLING_FETCH_TIMEOUT = float(os.environ.get("DOCLING_FETCH_TIMEOUT", "20"))


class DoclingParseRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    timeoutS: float = Field(default=90.0, ge=5.0, le=180.0)


@app.post("/v1/docling/parse")
def docling_parse(req: DoclingParseRequest) -> dict:
    import docling_parse as dp

    if not dp.available():
        raise HTTPException(status_code=503, detail="docling not installed or DOCLING_ENABLED=0")

    # Fetch server-side: the reader already proved reachability concerns are
    # ours to handle; keep the same UA discipline as the TS reader.
    import requests
    try:
        resp = requests.get(
            req.url,
            timeout=DOCLING_FETCH_TIMEOUT,
            headers={"User-Agent": "NomosX/3.0 (Academic Research Platform; mailto:contact@nomosx.com)"},
            stream=True,
        )
        resp.raise_for_status()
        chunks, total = [], 0
        for chunk in resp.iter_content(65536):
            total += len(chunk)
            if total > DOCLING_MAX_BYTES:
                raise HTTPException(status_code=413, detail="pdf exceeds DOCLING_MAX_BYTES")
            chunks.append(chunk)
        data = b"".join(chunks)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"fetch failed: {exc}") from exc

    if len(data) < 100:
        raise HTTPException(status_code=422, detail="empty or non-pdf payload")

    try:
        result = dp.parse_pdf_bytes(data)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("docling parse failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"docling conversion failed: {exc}") from exc

    if result["chars"] < 100:
        raise HTTPException(status_code=422, detail="docling produced insufficient text")
    return {"url": req.url, **result}


# --- Chronos-2 zero-shot forecasting (optional heavy path) --------------------
#
# The reader's quant-agent already produces primary-data series (energy
# prices, macro indicators). This endpoint forecasts them with quantiles —
# the forecast becomes a [MODEL-N] exhibit. 503 without chronos-forecasting.

CHRONOS_MAX_HISTORY = int(os.environ.get("CHRONOS_MAX_HISTORY", "512"))
CHRONOS_MAX_HORIZON = int(os.environ.get("CHRONOS_MAX_HORIZON", "24"))


class ForecastRequest(BaseModel):
    values: list[float] = Field(..., min_length=3, max_length=CHRONOS_MAX_HISTORY)
    predictionLength: int = Field(default=12, ge=1, le=CHRONOS_MAX_HORIZON)


@app.post("/v1/forecast")
def chronos_forecast(req: ForecastRequest) -> dict:
    import forecast as fc

    if not fc.available():
        raise HTTPException(status_code=503, detail="chronos not installed or CHRONOS_ENABLED=0")

    clean = [float(v) for v in req.values if v == v and abs(v) != float("inf")]
    if len(clean) < 3:
        raise HTTPException(status_code=422, detail="fewer than 3 finite observations")

    try:
        result = fc.forecast(clean, req.predictionLength)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("chronos forecast failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"forecast failed: {exc}") from exc

    return result


# --- MiniCheck shadow fact-checking (optional heavy path) ---------------------
#
# Claim↔document support verdicts from MiniCheck (Apache 2.0). Shadow mode:
# the app records verdicts for calibration against the LLM fact-checker —
# this endpoint never gates publication. Bounded to 30 pairs/call.

MINICHECK_MAX_PAIRS = int(os.environ.get("MINICHECK_MAX_PAIRS", "30"))


class MiniCheckPair(BaseModel):
    claim: str = Field(..., min_length=3, max_length=2000)
    document: str = Field(..., min_length=10, max_length=20000)


class MiniCheckRequest(BaseModel):
    pairs: list[MiniCheckPair] = Field(..., min_length=1, max_length=MINICHECK_MAX_PAIRS)


@app.post("/v1/minicheck/check")
def minicheck_check(req: MiniCheckRequest) -> dict:
    import minicheck_check as mc

    if not mc.available():
        raise HTTPException(status_code=503, detail="minicheck not installed or MINICHECK_ENABLED=0")

    try:
        out = mc.check_pairs([{"claim": p.claim, "document": p.document} for p in req.pairs])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("minicheck check failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"minicheck failed: {exc}") from exc

    return out
