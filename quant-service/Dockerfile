FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY figaro.py main.py docling_parse.py forecast.py minicheck_check.py ./

# FIGARO cache — ephemeral on Railway (Volumes unsupported); /tmp is
# writable by the non-root user and survives within a container lifetime.
ENV FIGARO_CACHE_DIR=/tmp/figaro-cache
RUN mkdir -p /tmp/figaro-cache

# Run as non-root user (UID 65532 = distroless-style nonroot)
USER 65532

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/').read()" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
