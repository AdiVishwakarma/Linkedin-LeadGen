"""Deduplication primitives.

Three layers, cheapest first:
  1. post_id (LinkedIn activity id)  -> same post, exact. Enforced by a UNIQUE index.
  2. content_hash (sha256 of normalized text) -> same text posted again / reshared.
  3. simhash (64-bit, word 3-shingles) -> near-duplicates (edited, reposted by another account).
"""

import hashlib
import re
import unicodedata

_URL_RE = re.compile(r"https?://\S+")
_MENTION_RE = re.compile(r"[@#]\w+")
_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_WS_RE = re.compile(r"\s+")


def normalize_text(text: str) -> str:
    """Lowercase, strip URLs/hashtags/mentions/punctuation, collapse whitespace."""
    text = unicodedata.normalize("NFKC", text).lower()
    text = _URL_RE.sub(" ", text)
    text = _MENTION_RE.sub(" ", text)
    text = _NON_WORD_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def content_hash(text: str) -> str:
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


def _shingles(tokens: list[str], n: int = 3) -> list[str]:
    if len(tokens) < n:
        return [" ".join(tokens)] if tokens else []
    return [" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]


def simhash(text: str) -> str:
    """64-bit simhash as a 16-char hex string."""
    tokens = normalize_text(text).split()
    shingles = _shingles(tokens)
    if not shingles:
        return "0" * 16
    weights = [0] * 64
    for sh in shingles:
        h = int.from_bytes(hashlib.md5(sh.encode("utf-8")).digest()[:8], "big")
        for bit in range(64):
            weights[bit] += 1 if (h >> bit) & 1 else -1
    value = 0
    for bit in range(64):
        if weights[bit] > 0:
            value |= 1 << bit
    return f"{value:016x}"


def hamming_distance(hex_a: str, hex_b: str) -> int:
    return bin(int(hex_a, 16) ^ int(hex_b, 16)).count("1")


def find_near_duplicate(
    sim: str, candidates: list[tuple[int, str]], max_distance: int
) -> tuple[int, int] | None:
    """candidates = [(lead_id, simhash_hex)]. Returns (lead_id, distance) of the closest match."""
    best: tuple[int, int] | None = None
    for lead_id, other in candidates:
        d = hamming_distance(sim, other)
        if d <= max_distance and (best is None or d < best[1]):
            best = (lead_id, d)
    return best
