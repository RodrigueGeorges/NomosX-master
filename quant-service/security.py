"""Request authentication and outbound-URL safety for quant-service.

Two exposures this module closes:
  * The service runs heavy models (Docling, Chronos, MiniCheck). Without a
    shared secret, anyone who finds the URL can spend its compute.
  * /v1/docling/parse fetches a caller-supplied URL server-side. Unchecked,
    that is a server-side request forgery: the caller can make the service
    read internal addresses (cloud metadata, private network, localhost).
"""

from __future__ import annotations

import hmac
import ipaddress
import os
import socket
from urllib.parse import urljoin, urlparse

MAX_REDIRECTS = 4


def service_token() -> str | None:
    token = os.environ.get("QUANT_SERVICE_TOKEN", "").strip()
    return token or None


def is_authorized(authorization_header: str | None) -> bool:
    """True when no token is configured, or the bearer token matches."""
    token = service_token()
    if token is None:
        return True
    if not authorization_header or not authorization_header.lower().startswith("bearer "):
        return False
    return hmac.compare_digest(authorization_header[7:].strip(), token)


def _ip_is_public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast
        or addr.is_reserved or addr.is_unspecified
    )


def is_public_http_url(url: str, resolver=socket.getaddrinfo) -> bool:
    """http(s) only, and every address the host resolves to must be public."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    if parsed.username or parsed.password:
        return False
    try:
        infos = resolver(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except OSError:
        return False
    addresses = {info[4][0] for info in infos}
    return bool(addresses) and all(_ip_is_public(a) for a in addresses)


def safe_get(url: str, *, timeout: float, headers: dict[str, str]):
    """GET that validates the URL and every redirect hop before following it."""
    import requests

    current = url
    for _ in range(MAX_REDIRECTS + 1):
        if not is_public_http_url(current):
            raise ValueError("url is not a public http(s) address")
        resp = requests.get(current, timeout=timeout, headers=headers, stream=True, allow_redirects=False)
        if resp.is_redirect or resp.is_permanent_redirect:
            location = resp.headers.get("location")
            resp.close()
            if not location:
                raise ValueError("redirect without location")
            current = urljoin(current, location)
            continue
        return resp
    raise ValueError("too many redirects")
