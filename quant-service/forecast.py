"""
Chronos-2 zero-shot time-series forecasting (optional heavy path).

Amazon Chronos-2 (Apache 2.0) produces quantile forecasts for a univariate
series with NO training — the forecast becomes a [MODEL-N] exhibit row
set (median + q10/q90 range), fully reproducible from the input series.

Lazy-loaded like docling: the service runs fine without it (503), model
weights download on first use. API verified against chronos-forecasting:

  Chronos2Pipeline.from_pretrained(model_id)
  pipeline.predict_quantiles(context=Tensor, prediction_length=N,
                             quantile_levels=[...]) -> (batch, N, Q)

Env:
  CHRONOS_ENABLED=0     — hard off switch
  CHRONOS_MODEL         — HF model id (default amazon/chronos-2)
  CHRONOS_DEVICE        — 'cpu' (default) | 'cuda'
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import numpy as np

logger = logging.getLogger("quant.chronos")

_pipeline: Any = None
_pipeline_failed = False
QUANTILE_LEVELS = [0.1, 0.5, 0.9]


def available() -> bool:
    if os.environ.get("CHRONOS_ENABLED", "1") == "0":
        return False
    if _pipeline_failed:
        return False
    try:
        import chronos  # noqa: F401
        return True
    except Exception:
        return False


def _get_pipeline() -> Any:
    global _pipeline, _pipeline_failed
    if _pipeline is not None:
        return _pipeline
    if _pipeline_failed:
        raise RuntimeError("chronos unavailable")
    try:
        import torch
        from chronos import Chronos2Pipeline, ChronosPipeline

        model_id = os.environ.get("CHRONOS_MODEL", "amazon/chronos-2")
        device = os.environ.get("CHRONOS_DEVICE", "cpu")
        dtype = torch.float32 if device == "cpu" else torch.bfloat16
        try:
            _pipeline = Chronos2Pipeline.from_pretrained(model_id, device_map=device, torch_dtype=dtype)
        except Exception:
            # chronos-forecasting <2.x exposes ChronosPipeline only
            _pipeline = ChronosPipeline.from_pretrained(model_id, device_map=device, torch_dtype=dtype)
        logger.info("chronos pipeline initialized: %s on %s", model_id, device)
        return _pipeline
    except Exception as exc:  # pragma: no cover - environment dependent
        _pipeline_failed = True
        logger.error("chronos init failed: %s", exc)
        raise


def forecast(values: list[float], prediction_length: int) -> dict[str, Any]:
    """Quantile forecast for a univariate series. Raises on failure."""
    if not available():
        raise RuntimeError("chronos not installed or disabled")
    if len(values) < 3:
        raise ValueError("need at least 3 observations")

    import torch

    pipeline = _get_pipeline()
    context = torch.tensor([values], dtype=torch.float32)

    t0 = time.monotonic()
    # predict_quantiles returns (batch, prediction_length, num_quantiles)
    q = pipeline.predict_quantiles(
        context,
        prediction_length=prediction_length,
        quantile_levels=QUANTILE_LEVELS,
    )
    duration_ms = int((time.monotonic() - t0) * 1000)

    arr = q[0].detach().cpu().numpy() if hasattr(q[0], "detach") else np.asarray(q[0])
    # arr shape: (prediction_length, 3) with columns [q10, q50, q90]
    if arr.ndim == 3:  # some versions return (1, N, Q) unbatched differently
        arr = arr[0]
    points = []
    for h in range(arr.shape[0]):
        row = arr[h]
        points.append({
            "horizon": h + 1,
            "q10": float(row[0]),
            "q50": float(row[1]),
            "q90": float(row[2]),
        })

    return {
        "model": os.environ.get("CHRONOS_MODEL", "amazon/chronos-2"),
        "quantileLevels": QUANTILE_LEVELS,
        "horizon": prediction_length,
        "points": points,
        "durationMs": duration_ms,
    }
