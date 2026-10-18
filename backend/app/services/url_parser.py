"""Parse and canonicalize LinkedIn post URLs.

Supported shapes:
  https://www.linkedin.com/posts/jane-doe-123_some-slug-activity-7123456789012345678-AbCd
  https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/
  https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678
  https://www.linkedin.com/feed/update/urn:li:ugcPost:7123456789012345678
We only parse the string the user gave us. We never fetch it.
"""

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx

_ID_RE = re.compile(r"(activity|share|ugcPost)[-:](\d{15,25})", re.IGNORECASE)
_POSTS_SLUG_RE = re.compile(r"/posts/([^_/?#]+)_", re.IGNORECASE)

SHORT_URL_HOSTS = {"lnkd.in", "www.lnkd.in"}
ALLOWED_DESTINATION_HOSTS = {"linkedin.com", "www.linkedin.com"}
MAX_REDIRECTS = 5
DEFAULT_RESOLVE_TIMEOUT = 5.0
_CGNAT_NET = ipaddress.ip_network("100.64.0.0/10")


class InvalidPostUrl(ValueError):
    pass


@dataclass(frozen=True)
class ParsedPostUrl:
    canonical_url: str
    post_id: str
    kind: str  # activity | share | ugcPost
    author_slug: str | None


def _is_linkedin_host(host: str) -> bool:
    host = host.lower().split(":")[0]
    return host == "linkedin.com" or host.endswith(".linkedin.com")


def _is_short_host(host: str) -> bool:
    host = host.lower().split(":")[0]
    return host in SHORT_URL_HOSTS


def _is_private_or_local_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        return True
    if isinstance(ip, ipaddress.IPv4Address) and ip in _CGNAT_NET:
        return True
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return _is_private_or_local_ip(ip.ipv4_mapped)
    return False


def _validate_safe_host(hostname: str, port: int = 443) -> None:
    """SSRF guard: reject private, loopback, link-local, and reserved IP addresses/hostnames."""
    if not hostname or not hostname.strip():
        raise InvalidPostUrl("URL has no hostname")

    clean_host = hostname.lower().strip()
    if (
        clean_host in ("localhost", "0.0.0.0")
        or clean_host.endswith(".local")
        or clean_host.endswith(".localhost")
        or clean_host.endswith(".internal")
    ):
        raise InvalidPostUrl(f"Access to private or local network host '{hostname}' is forbidden")

    # Check if host is already an IP literal
    try:
        ip = ipaddress.ip_address(clean_host)
        if _is_private_or_local_ip(ip):
            raise InvalidPostUrl(f"Access to private or local network address '{hostname}' is forbidden")
        return
    except ValueError:
        pass

    # Resolve hostname to check resolved IP addresses
    try:
        addr_infos = socket.getaddrinfo(clean_host, port, type=socket.SOCK_STREAM)
        for _, _, _, _, sockaddr in addr_infos:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            if _is_private_or_local_ip(ip):
                raise InvalidPostUrl(
                    f"Host '{hostname}' resolves to private or local network address ({ip_str})"
                )
    except socket.gaierror as e:
        raise InvalidPostUrl(f"Could not resolve host '{hostname}': {e}")


def resolve_short_url(
    short_url: str,
    *,
    client: httpx.Client | None = None,
    max_redirects: int = MAX_REDIRECTS,
    timeout: float = DEFAULT_RESOLVE_TIMEOUT,
) -> str:
    """Resolve an lnkd.in short URL to its final LinkedIn destination URL.

    Security & Reliability Rules:
    - Only connects to supported lnkd.in hosts.
    - Rejects redirects to unrelated domains and private/local network addresses (SSRF prevention).
    - Only accepts final destinations whose hostname is exactly linkedin.com or www.linkedin.com.
    - Limits redirects and enforces a strict timeout.
    - Does not fetch the post content or use LinkedIn credentials.
    """
    if not short_url or not short_url.strip():
        raise InvalidPostUrl("URL is empty")

    current_url = short_url.strip()
    if "://" not in current_url:
        current_url = "https://" + current_url

    parsed = urlparse(current_url)
    if parsed.scheme not in ("http", "https"):
        raise InvalidPostUrl(f"Unsupported URL scheme: {parsed.scheme}")

    initial_host = (parsed.hostname or "").lower()
    if not _is_short_host(initial_host):
        raise InvalidPostUrl(f"Not a supported short URL host: {initial_host or current_url}")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    _validate_safe_host(initial_host, port)

    def _do_resolve(http_client: httpx.Client) -> str:
        nonlocal current_url
        hops = 0
        while hops < max_redirects:
            hops += 1
            try:
                resp = http_client.head(current_url, follow_redirects=False)
                if resp.status_code == 405:
                    resp = http_client.get(current_url, follow_redirects=False)
            except httpx.TimeoutException:
                raise InvalidPostUrl(f"Timed out resolving short URL after {timeout}s: {current_url}")
            except httpx.RequestError as e:
                raise InvalidPostUrl(f"Network error resolving short URL: {e}")

            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location")
                if not location:
                    raise InvalidPostUrl(f"Short link redirect missing Location header (HTTP {resp.status_code})")

                next_url = urljoin(current_url, location)
                next_parsed = urlparse(next_url)
                if next_parsed.scheme not in ("http", "https"):
                    raise InvalidPostUrl(f"Short link redirected to unsupported scheme: {next_parsed.scheme}")

                next_host = (next_parsed.hostname or "").lower()
                next_port = next_parsed.port or (443 if next_parsed.scheme == "https" else 80)
                _validate_safe_host(next_host, next_port)

                if next_host in ALLOWED_DESTINATION_HOSTS:
                    return next_url
                elif _is_short_host(next_host):
                    current_url = next_url
                    continue
                else:
                    raise InvalidPostUrl(f"Short link redirected to an unrelated or unsupported domain: {next_host}")
            elif resp.status_code == 200:
                raise InvalidPostUrl("Short link did not redirect to a destination URL (HTTP 200)")
            else:
                raise InvalidPostUrl(f"Short link returned HTTP {resp.status_code}")

        raise InvalidPostUrl(f"Too many redirects resolving short URL (exceeded limit of {max_redirects})")

    if client is not None:
        return _do_resolve(client)

    with httpx.Client(
        timeout=httpx.Timeout(timeout, connect=min(timeout, 3.0)),
        follow_redirects=False,
        headers={"User-Agent": "LinkedInLeadDiscovery/1.0"},
    ) as default_client:
        return _do_resolve(default_client)


def parse_post_url(raw: str, client: httpx.Client | None = None) -> ParsedPostUrl:
    if not raw or not raw.strip():
        raise InvalidPostUrl("URL is empty")
    raw = raw.strip()
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()

    if _is_short_host(host):
        resolved_url = resolve_short_url(raw, client=client)
        parsed = urlparse(resolved_url)
        host = (parsed.hostname or "").lower()
        if host not in ALLOWED_DESTINATION_HOSTS:
            raise InvalidPostUrl(f"Short link destination host is not supported: {host}")
    elif not _is_linkedin_host(parsed.netloc):
        raise InvalidPostUrl(f"Not a linkedin.com URL: {parsed.netloc or raw}")

    # Query strings (utm_source, rcm, ...) never identify the post; ignore them.
    path = parsed.path
    m = _ID_RE.search(path) or _ID_RE.search(parsed.query)
    if not m:
        raise InvalidPostUrl("Could not find a post/activity id in the URL")

    kind_raw = m.group(1)
    kind = {"activity": "activity", "share": "share", "ugcpost": "ugcPost"}[kind_raw.lower()]
    post_id = m.group(2)

    slug_match = _POSTS_SLUG_RE.search(path)
    author_slug = slug_match.group(1) if slug_match else None

    # Canonical, tracking-free form that always resolves to the post.
    canonical = f"https://www.linkedin.com/feed/update/urn:li:{kind}:{post_id}/"
    return ParsedPostUrl(canonical, post_id, kind, author_slug)


def name_from_slug(slug: str | None) -> str | None:
    """'jane-doe-1a2b3c' -> 'Jane Doe'. Only a display fallback; never stored as the author's name."""
    if not slug:
        return None
    parts = [x for x in slug.split("-") if x]
    # LinkedIn appends a random id chunk containing digits; drop trailing chunks that have one
    while parts and any(ch.isdigit() for ch in parts[-1]):
        parts.pop()
    return " ".join(x.capitalize() for x in parts) or None
