"""Turn user input (bulk paste, CSV) into a list of plain item dicts. No DB access here."""

import csv
import io
import re

MAX_CSV_BYTES = 2 * 1024 * 1024
MAX_ITEMS_PER_BATCH = 500

_SEPARATOR_RE = re.compile(r"^\s*(-{3,}|={3,}|_{3,})\s*$", re.MULTILINE)
_URL_LINE_RE = re.compile(
    r"(https?://\S*(?:linkedin\.com|lnkd\.in)\S*|(?<![\w/])(?:www\.)?(?:linkedin\.com|lnkd\.in)/\S+)",
    re.IGNORECASE,
)
_HEADER_RE = re.compile(
    r"^\s*(author|name|headline|title|company|location|posted|date|posted_at|profile)\s*[:=]\s*(.+?)\s*$",
    re.IGNORECASE,
)
_HEADER_KEY_MAP = {
    "author": "author_name",
    "name": "author_name",
    "headline": "author_headline",
    "title": "author_headline",
    "company": "company",
    "location": "location",
    "posted": "posted_at",
    "date": "posted_at",
    "posted_at": "posted_at",
    "profile": "author_profile_url",
}

_CSV_ALIASES = {
    "url": ["url", "post_url", "link", "source_url", "post link"],
    "text": ["text", "content", "post", "post_text", "post text", "body"],
    "author_name": ["author_name", "author", "name"],
    "author_headline": ["author_headline", "headline", "title"],
    "author_profile_url": ["author_profile_url", "profile_url", "profile"],
    "company": ["company", "organization", "organisation"],
    "location": ["location", "city"],
    "posted_at": ["posted_at", "posted", "date", "post_date"],
}


def parse_bulk_text(raw: str) -> list[dict]:
    """Blocks separated by a line of '---'. In each block: one LinkedIn URL line, optional
    'Author: ...' style header lines, and the rest is the post text."""
    items: list[dict] = []
    for block in _SEPARATOR_RE.split(raw or ""):
        # re.split with a capture group also returns the separator text; skip those
        if block is None or re.fullmatch(r"-{3,}|={3,}|_{3,}", block.strip() or "x"):
            continue
        lines = [ln.rstrip() for ln in block.strip().splitlines()]
        if not any(ln.strip() for ln in lines):
            continue

        item: dict = {"url": "", "text": ""}
        text_lines: list[str] = []
        url_found = False
        for ln in lines:
            if not url_found:
                m = _URL_LINE_RE.search(ln)
                if m and len(ln.strip()) <= len(m.group(0)) + 5:  # the line is basically just the URL
                    item["url"] = m.group(0)
                    url_found = True
                    continue
            hm = _HEADER_RE.match(ln) if not text_lines else None
            if hm:
                item[_HEADER_KEY_MAP[hm.group(1).lower()]] = hm.group(2)
                continue
            text_lines.append(ln)
        item["text"] = "\n".join(text_lines).strip()
        items.append(item)
    return items


def parse_csv(data: bytes) -> list[dict]:
    if len(data) > MAX_CSV_BYTES:
        raise ValueError(f"CSV too large (max {MAX_CSV_BYTES // 1024 // 1024} MB)")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")
    header_map: dict[str, str] = {}
    lowered = {(h or "").strip().lower(): h for h in reader.fieldnames}
    for field, aliases in _CSV_ALIASES.items():
        for alias in aliases:
            if alias in lowered:
                header_map[field] = lowered[alias]
                break
    if "url" not in header_map:
        raise ValueError("CSV needs a 'url' column (aliases: post_url, link, source_url)")

    items: list[dict] = []
    for row in reader:
        item = {field: (row.get(col) or "").strip() for field, col in header_map.items()}
        if not any(item.values()):
            continue
        items.append(item)
        if len(items) > MAX_ITEMS_PER_BATCH:
            raise ValueError(f"Too many rows (max {MAX_ITEMS_PER_BATCH} per upload)")
    return items
