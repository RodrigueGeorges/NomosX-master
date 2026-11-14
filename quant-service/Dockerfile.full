FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements-full.txt .
RUN pip install --no-cache-dir -r requirements-full.txt

# Copy application code
COPY figaro.py main.py docling_client.py forecast.py minicheck_check.py ./

# FIGARO cache — ephemeral on Railway (Volumes unsupported); /tmp is
# writable by the non-root user and survives within a container lifetime.
ENV FIGARO_CACHE_DIR=/tmp/figaro-cache
# HF model caches — container runs as non-root; /app is not writable
ENV HF_HOME=/tmp/hf-cache
ENV HF_HUB_CACHE=/tmp/hf-cache
ENV TRANSFORMERS_CACHE=/tmp/hf-cache
RUN mkdir -p /tmp/figaro-cache /tmp/hf-cache && chown -R 65532:65532 /tmp/figaro-cache /tmp/hf-cache

# Run as non-root user (UID 65532 = distroless-style nonroot)
USER 65532

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/').read()" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
