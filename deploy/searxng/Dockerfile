# SearXNG self-hosted metasearch — NomosX resilience floor (Bloc 8 / Claude §3).
#
# The official image disables `format=json` by default; NomosX's searxng
# provider requires it. settings.yml enables JSON + disables the bot limiter
# (server-to-server traffic, no browser session). The entrypoint substitutes
# the literal `ultrasecretkey` with $SEARXNG_SECRET at container start.
FROM searxng/searxng:latest

COPY settings.yml /etc/searxng/settings.yml
