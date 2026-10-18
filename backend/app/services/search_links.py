"""Generate LinkedIn content-search links for the user to open and review manually.

We only BUILD a URL. Nothing is fetched. The user opens it in their own logged-in browser.
LinkedIn's URL parameters change over time, so the format is isolated in one function.
"""

from urllib.parse import quote

# Default service vocabulary per category (used when a campaign doesn't override it)
DEFAULT_SERVICE_TERMS: dict[str, list[str]] = {
    "influencer_marketing": ["influencer marketing agency", "influencer agency", "influencer marketing"],
    "ad_agency": ["advertising agency", "ad agency", "digital marketing agency"],
    "production_house": ["production house", "video production company", "production company"],
    "brand_film": ["brand film company", "corporate film maker", "brand film"],
}

# Buyer-intent phrasings
PHRASE_TEMPLATES = [
    '"looking for" {term}',
    '"can anyone recommend" {term}',
    '"recommend" {term}',
    '"need" {term}',
    '"any suggestions" {term}',
]

DATE_FILTERS = {"past-24h": '"past-24h"', "past-week": '"past-week"', "past-month": '"past-month"'}


def build_search_url(query: str, date_posted: str = "past-week", sort_by: str = "date_posted") -> str:
    parts = [f"keywords={quote(query)}"]
    if date_posted in DATE_FILTERS:
        parts.append(f"datePosted={quote(DATE_FILTERS[date_posted])}")
    if sort_by:
        parts.append(f"sortBy={quote(chr(34) + sort_by + chr(34))}")
    return "https://www.linkedin.com/search/results/content/?" + "&".join(parts)


def generate_queries(
    service_categories: list[str],
    keywords: list[str],
    locations: list[str],
    max_queries: int = 60,
) -> list[tuple[str, str | None]]:
    """Returns [(query_text, service_category)], de-duplicated, capped."""
    terms: list[tuple[str, str | None]] = []
    for cat in service_categories:
        for t in DEFAULT_SERVICE_TERMS.get(cat, []):
            terms.append((t, cat))
    for kw in keywords:
        if kw.strip():
            terms.append((kw.strip(), None))

    seen: set[str] = set()
    out: list[tuple[str, str | None]] = []
    loc_options: list[str | None] = [None] + [l for l in locations if l.strip()]
    for term, cat in terms:
        for tpl in PHRASE_TEMPLATES:
            base = tpl.format(term=term)
            for loc in loc_options:
                q = f"{base} {loc}".strip() if loc else base
                if q.lower() not in seen:
                    seen.add(q.lower())
                    out.append((q, cat))
                if len(out) >= max_queries:
                    return out
    return out
