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
    return {"service": "NomosX quant-service", "version": "0.2.0", "docling": docling, "docs": "/docs"}


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
