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
# Eurostat moved FIGARO flat files to the CIRCABC collaborative platform.
# Direct downloads use https://circabc.europa.eu/rest/download/<node-id>;
# node ids below were listed from the FIGARO space on 2026-10-03 (edition 26ed,
# NACE rev. 2.1 industry codes, 50 regions incl. ALB/MKD/MNE/SRB + FIGW1=ROW).
FIGARO_YEAR = int(os.environ.get("FIGARO_YEAR", "2021"))
FIGARO_EDITION = os.environ.get("FIGARO_EDITION", "26ed")
FIGARO_NODES_26ED = {
    2014: "85d3f6de-3510-45ff-96c9-11da9f1e325a",
    2015: "e989cc76-52f5-4cd9-ba8c-5764fafde13a",
    2016: "2e7bc8e5-ee0c-4e57-a082-60a9fb59ee73",
    2017: "0bd4147b-d06b-4800-87e4-c479352e88ba",
    2018: "40c2349e-1ba7-48b5-b4a3-4f00b78f2283",
    2019: "ba9d7f3a-a381-49f2-998d-64fec81c3d35",
    2020: "28d77fbf-50c2-475c-8ba6-c97b02a69039",
    2021: "57fd3555-51db-4f03-b765-3cb7fcfe3007",
    2022: "f1330ee5-2841-4f3a-949c-20f36d068714",
    2023: "836a0346-bdb5-4d8a-bbea-b3bd583a53c9",
    2024: "8ac7da34-911e-4a91-ab1c-8aec1a574381",
}
FIGARO_URL = os.environ.get("FIGARO_URL") or (
    f"https://circabc.europa.eu/rest/download/{FIGARO_NODES_26ED[FIGARO_YEAR]}"
    if FIGARO_EDITION == "26ed" and FIGARO_YEAR in FIGARO_NODES_26ED
    else ""
)

# ISO2 region codes as they appear in the 26ed matrix (GR=Greece, GB=UK).
EU27 = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
    "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT",
    "RO", "SE", "SI", "SK",
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

    # 26ed matrix layout: index/columns are "REGION_INDUSTRY" (ISO2 region,
    # NACE rev. 2.1 code, e.g. "FR_C26"), "FIGW1_*" is the ROW region, and
    # each region carries 5 final-demand columns (P3_S13/S14/S15, P51G, P5M).
    # "W2_*" rows are ROW value-added components — excluded from Z.
    FD_SUFFIXES = {"P3_S13", "P3_S14", "P3_S15", "P51G", "P5M"}

    def parts(label: object) -> tuple[str, str] | None:
        if not isinstance(label, str) or "_" not in label:
            return None
        reg, ind = label.split("_", 1)
        if reg == "W2" or not ind or ind in FD_SUFFIXES:
            return None
        return reg, ind

    row_parts = {r: parts(r) for r in m.index}
    col_parts = {c: parts(c) for c in m.columns}
    ind_rows = [r for r, p in row_parts.items() if p]
    ind_cols = [c for c, p in col_parts.items() if p]
    common = [k for k in ind_rows if k in ind_cols]

    Z = m.loc[common, common].astype(float)
    # Gross output = full row sum across industries AND final-demand columns.
    x = m.loc[ind_rows].sum(axis=1).astype(float)
    x = x.reindex(common).fillna(0.0)
    # The 26ed matrix has no explicit VA rows: VA = gross output minus total
    # intermediate inputs consumed by the sector (column sum of Z).
    intermediates = Z.sum(axis=0)
    va = (x - intermediates).clip(lower=0.0)

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
