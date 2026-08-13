"""
FIGARO input-output engine.

Loads Eurostat FIGARO inter-country industry-by-industry input-output tables,
builds the Leontief inverse, and computes final-demand shock propagation
(output, value added, spillovers).

Data source: Eurostat FIGARO (free, official EU statistics, no usage
restrictions beyond source attribution).
https://ec.europa.eu/eurostat/web/esa-supply-use-input-tables/database

Design:
- The full FIGARO matrix (46 regions x 64 industries) is downloaded once and
  cached on disk as parquet (~100MB CSV upstream).
- A small bundled demo matrix (3 industries x 2 regions) allows the service
  to run offline for development and CI.
"""

from __future__ import annotations

import io
import logging
import os
import zipfile
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import requests

logger = logging.getLogger("quant.figaro")

CACHE_DIR = os.environ.get("FIGARO_CACHE_DIR", os.path.join(os.path.dirname(__file__), ".cache"))
# Eurostat FIGARO flat-file naming: matrix_eu-ic-io_ind-by-ind_24ed_YYYY.csv
FIGARO_YEAR = int(os.environ.get("FIGARO_YEAR", "2021"))
FIGARO_EDITION = os.environ.get("FIGARO_EDITION", "24ed")
FIGARO_URL = (
    "https://ec.europa.eu/eurostat/documents/51957/17979414/"
    f"matrix_eu-ic-io_ind-by-ind_{FIGARO_EDITION}_{FIGARO_YEAR}.csv"
)

EU27 = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
    "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
    "SE", "SI", "SK",
}


@dataclass
class IOModel:
    """Leontief model built from a FIGARO IC-IO matrix."""

    year: int
    source: str
    # index/columns: "REGION_INDUSTRY" e.g. "FR_C26"
    Z: pd.DataFrame           # inter-industry flows (M EUR)
    x: pd.Series              # total output by region-industry (M EUR)
    va: pd.Series             # value added by region-industry (M EUR)
    L: pd.DataFrame = field(init=False)   # Leontief inverse
    va_coef: pd.Series = field(init=False)

    def __post_init__(self) -> None:
        x_safe = self.x.replace(0, np.nan)
        A = self.Z.div(x_safe, axis=1).fillna(0.0)
        eye = np.eye(len(A))
        self.L = pd.DataFrame(np.linalg.inv(eye - A.values), index=A.index, columns=A.columns)
        self.va_coef = (self.va / x_safe).fillna(0.0)

    def sectors_for(self, region: str, industry: str) -> list[str]:
        if region == "EU27":
            return [f"{r}_{industry}" for r in EU27 if f"{r}_{industry}" in self.L.columns]
        key = f"{region}_{industry}"
        return [key] if key in self.L.columns else []

    def shock(self, region: str, industry: str, demand_meur: float) -> dict:
        """Propagate a final-demand shock through the Leontief inverse."""
        targets = self.sectors_for(region, industry)
        if not targets:
            raise KeyError(f"sector not found: {region}_{industry}")

        f = pd.Series(0.0, index=self.L.columns)
        f[targets] = demand_meur / len(targets)

        dx = self.L @ f                      # output impact by region-industry
        dva = dx * self.va_coef              # value added impact
        total_output = float(dx.sum())
        multiplier = total_output / demand_meur if demand_meur else 0.0

        spill = dx.drop(labels=targets).sort_values(ascending=False).head(8)
        return {
            "outputImpactMeur": round(total_output, 1),
            "valueAddedImpactMeur": round(float(dva.sum()), 1),
            "outputMultiplier": round(multiplier, 3),
            "topSpilloverSectors": [
                {"industry": k, "outputMeur": round(float(v), 1)} for k, v in spill.items() if v > 0.05
            ],
        }


def _demo_model() -> IOModel:
    """Tiny bundled matrix so the service runs offline (dev/CI only)."""
    idx = ["FR_C26", "FR_D35", "FR_J62_63", "DE_C26", "DE_D35", "DE_J62_63"]
    rng = np.random.default_rng(42)
    Z = pd.DataFrame(rng.uniform(5, 60, (6, 6)), index=idx, columns=idx)
    x = pd.Series([400, 600, 500, 900, 800, 700], index=idx, dtype=float)
    va = x * 0.42
    return IOModel(year=FIGARO_YEAR, source="DEMO MATRIX — not for production use", Z=Z, x=x, va=va)


def _load_figaro_csv() -> IOModel:
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache = os.path.join(CACHE_DIR, f"figaro_{FIGARO_EDITION}_{FIGARO_YEAR}.parquet")

    if os.path.exists(cache):
        logger.info("Loading FIGARO from cache: %s", cache)
        m = pd.read_parquet(cache)
    else:
        logger.info("Downloading FIGARO %s (%s) — this can take a few minutes", FIGARO_YEAR, FIGARO_URL)
        resp = requests.get(FIGARO_URL, timeout=600)
        resp.raise_for_status()
        content = resp.content
        if content[:2] == b"PK":  # zip-wrapped
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                name = zf.namelist()[0]
                content = zf.read(name)
        m = pd.read_csv(io.BytesIO(content), index_col=0)
        m.to_parquet(cache)
        logger.info("FIGARO cached: %s (%d x %d)", cache, *m.shape)

    # FIGARO IC-IO layout: rows = supplying region_industry + VA rows,
    # columns = using region_industry + final demand columns.
    ind_rows = [r for r in m.index if isinstance(r, str) and "_" in r and not r.startswith(("W2_", "VA", "OP_", "D2"))]
    ind_cols = [c for c in m.columns if isinstance(c, str) and "_" in c and c.split("_", 1)[0] in (EU27 | {"US", "UK", "GB", "CN", "JP", "W2"}) and not any(t in c for t in ("_P3", "_P5", "_P6", "GCF", "HFCE"))]
    common = [k for k in ind_rows if k in ind_cols]

    Z = m.loc[common, common].astype(float)
    x = m.loc[common].sum(axis=1).astype(float)  # total output = row sum (intermediate + final)
    va_rows = [r for r in m.index if isinstance(r, str) and (r.startswith("W2_") or "VA" in r.upper() or r.startswith("D2"))]
    va = m.loc[va_rows, common].sum(axis=0).astype(float) if va_rows else x * 0.4

    return IOModel(year=FIGARO_YEAR, source=f"Eurostat FIGARO {FIGARO_EDITION} ind-by-ind IC-IO, {FIGARO_YEAR}", Z=Z, x=x, va=va)


_model: IOModel | None = None


def get_model() -> IOModel:
    global _model
    if _model is None:
        if os.environ.get("FIGARO_DEMO", "0") == "1":
            logger.warning("FIGARO_DEMO=1 — using bundled demo matrix")
            _model = _demo_model()
        else:
            try:
                _model = _load_figaro_csv()
            except Exception:
                logger.exception("FIGARO download failed — falling back to demo matrix")
                _model = _demo_model()
    return _model
