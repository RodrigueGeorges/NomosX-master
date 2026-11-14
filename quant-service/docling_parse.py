"""
Docling PDF → structured markdown extraction (optional heavy path).

Docling (IBM, MIT) preserves tables, reading order and layout that
pdf-parse flattens — the difference matters for evidence contracts:
a claim citing "Table 3: $4.2B exports" needs the table to survive
extraction. Lazy-loaded: the service runs fine without it (endpoint
returns 503), and model weights download on first use.

API verified against docling 2.x:
  DocumentConverter().convert(DocumentStream) → ConversionResult
  result.status / result.document.export_to_markdown()

Env:
  DOCLING_ENABLED=0      — hard off switch (default: on when installed)
  DOCLING_MAX_PAGES      — refuse docs above this page count (default 80)
  DOCLING_OCR=0          — disable OCR (faster, loses scanned-PDF text)
"""

from __future__ import annotations

import io
import logging
import os
import time
from typing import Any

logger = logging.getLogger("quant.docling")

_converter: Any = None
_converter_failed = False


def available() -> bool:
    """True when docling is importable and not hard-disabled."""
    if os.environ.get("DOCLING_ENABLED", "1") == "0":
        return False
    if _converter_failed:
        return False
    try:
        import docling  # noqa: F401
        return True
    except Exception:
        return False


def _get_converter() -> Any:
    """Lazy singleton — first call pays model load (~10-30s)."""
    global _converter, _converter_failed
    if _converter is not None:
        return _converter
    if _converter_failed:
        raise RuntimeError("docling unavailable")
    try:
        from docling.document_converter import DocumentConverter
        _converter = DocumentConverter()
        logger.info("docling converter initialized")
        return _converter
    except Exception as exc:  # pragma: no cover - environment dependent
        _converter_failed = True
        logger.error("docling init failed: %s", exc)
        raise


def parse_pdf_bytes(data: bytes, filename: str = "document.pdf") -> dict[str, Any]:
    """Convert PDF bytes to markdown. Raises on failure — caller maps to HTTP."""
    if not available():
        raise RuntimeError("docling not installed or disabled")

    max_pages = int(os.environ.get("DOCLING_MAX_PAGES", "80"))
    converter = _get_converter()

    from docling.datamodel.base_models import DocumentStream

    stream = DocumentStream(name=filename, stream=io.BytesIO(data))
    t0 = time.monotonic()
    # max_num_pages bounds conversion work server-side — an 80-page cap
    # rejects before the expensive layout pass, not after.
    result = converter.convert(stream, max_num_pages=max_pages)
    duration_ms = int((time.monotonic() - t0) * 1000)

    status = getattr(result, "status", None)
    status_name = getattr(status, "value", str(status)) if status is not None else "unknown"
    if status_name not in ("success", "partial_success"):
        errors = getattr(result, "errors", None) or []
        raise RuntimeError(f"docling conversion status={status_name}: {errors[:3]}")

    doc = result.document
    num_pages = len(getattr(doc, "pages", {}) or {}) or getattr(result, "pages", None)
    text = doc.export_to_markdown() or ""

    return {
        "text": text,
        "pages": num_pages,
        "chars": len(text),
        "durationMs": duration_ms,
        "format": "markdown",
        "status": status_name,
    }
