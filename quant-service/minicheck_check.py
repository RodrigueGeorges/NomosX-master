"""
MiniCheck claim↔document verification (optional heavy path).

MiniCheck (Tang, Laban, Durrett — EMNLP 2024, Apache 2.0) is a small
seq2seq model trained specifically to decide whether a claim is
supported by a grounding document — GPT-4-level agreement at ~400×
lower cost. Used here as a SHADOW verifier: its verdicts are recorded
for calibration against the LLM fact-checker, never gating (yet).

Lazy-loaded like docling/chronos — 503 without the deps. FLAN-T5 variant
is the cheap default; Bespoke-MiniCheck-7B available via MINICHECK_MODEL.

Env:
  MINICHECK_ENABLED=0   — hard off switch
  MINICHECK_MODEL       — HF id (default lytang/MiniCheck-Flan-T5-Large)
  MINICHECK_DEVICE      — 'cpu' (default) | 'cuda'
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger("quant.minicheck")

_model = None
_tokenizer = None
_model_failed = False

MAX_DOC_CHARS = 12000
MAX_CLAIM_CHARS = 1000


def available() -> bool:
    if os.environ.get("MINICHECK_ENABLED", "1") == "0":
        return False
    if _model_failed:
        return False
    try:
        import transformers  # noqa: F401
        return True
    except Exception:
        return False


def _get_model() -> tuple[Any, Any]:
    global _model, _tokenizer, _model_failed
    if _model is not None:
        return _model, _tokenizer
    if _model_failed:
        raise RuntimeError("minicheck unavailable")
    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        model_id = os.environ.get("MINICHECK_MODEL", "lytang/MiniCheck-Flan-T5-Large")
        device = os.environ.get("MINICHECK_DEVICE", "cpu")
        _tokenizer = AutoTokenizer.from_pretrained(model_id)
        _model = AutoModelForSeq2SeqLM.from_pretrained(model_id).to(device)
        _model.eval()
        logger.info("minicheck model initialized: %s on %s", model_id, device)
        return _model, _tokenizer
    except Exception as exc:  # pragma: no cover - environment dependent
        _model_failed = True
        logger.error("minicheck init failed: %s", exc)
        raise


def _label_for(output: str) -> tuple[str, float]:
    """Map generated text to a support verdict. MiniCheck FLAN-T5 emits a
    short answer; we read it conservatively — anything ambiguous is
    'unclear', never a confident verdict."""
    o = output.strip().lower()
    if any(k in o for k in ("yes", "supported", "true", "entailed")):
        return "supported", 0.8
    if any(k in o for k in ("no", "not supported", "false", "contradicted", "refuted")):
        return "not_supported", 0.8
    return "unclear", 0.3


def check_pairs(pairs: list[dict[str, str]]) -> list[dict[str, Any]]:
    """Verify claim↔document pairs. Returns per-pair verdicts."""
    if not available():
        raise RuntimeError("minicheck not installed or disabled")
    import torch

    model, tokenizer = _get_model()
    device = os.environ.get("MINICHECK_DEVICE", "cpu")

    results = []
    t0 = time.monotonic()
    for p in pairs[:30]:  # hard bound — shadow mode, never a bottleneck
        claim = str(p.get("claim", ""))[:MAX_CLAIM_CHARS]
        doc = str(p.get("document", ""))[:MAX_DOC_CHARS]
        if not claim or not doc:
            results.append({"label": "unclear", "score": 0.0, "raw": ""})
            continue
        prompt = f"Premise: {doc}\nHypothesis: {claim}"
        try:
            inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1024).to(device)
            with torch.no_grad():
                out = model.generate(**inputs, max_new_tokens=8, do_sample=False)
            text = tokenizer.decode(out[0], skip_special_tokens=True)
            label, score = _label_for(text)
            results.append({"label": label, "score": score, "raw": text[:80]})
        except Exception as exc:
            logger.warning("minicheck pair failed: %s", exc)
            results.append({"label": "unclear", "score": 0.0, "raw": "error"})

    return {
        "results": results,
        "checked": len(results),
        "durationMs": int((time.monotonic() - t0) * 1000),
    }
