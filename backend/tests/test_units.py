from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.config import settings
from app.services.classifier import classify
from app.services.dedup import content_hash, find_near_duplicate, hamming_distance, normalize_text, simhash
from app.services.importer import parse_posted_at
from app.services.parsers import parse_bulk_text, parse_csv
from app.services.search_links import build_search_url, generate_queries
from app.services.url_parser import InvalidPostUrl, parse_post_url


# ---------------------------------------------------------------- url parser
@pytest.mark.parametrize(
    "url,kind,pid",
    [
        ("https://www.linkedin.com/posts/jane-doe-1a2b_slug-activity-7123456789012345678-AbCd", "activity", "7123456789012345678"),
        ("https://in.linkedin.com/posts/jane_slug-activity-7123456789012345678-xyz?utm_source=share&rcm=ABC", "activity", "7123456789012345678"),
        ("https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/", "activity", "7123456789012345678"),
        ("linkedin.com/feed/update/urn:li:share:7123456789012345678", "share", "7123456789012345678"),
        ("https://www.linkedin.com/feed/update/urn:li:ugcPost:7123456789012345678", "ugcPost", "7123456789012345678"),
    ],
)
def test_url_variants_resolve_to_same_post(url, kind, pid):
    p = parse_post_url(url)
    assert (p.kind, p.post_id) == (kind, pid)
    assert p.canonical_url == f"https://www.linkedin.com/feed/update/urn:li:{kind}:{pid}/"


@pytest.mark.parametrize(
    "bad",
    ["", "   ", "https://example.com/posts/x-activity-7123456789012345678", "https://www.linkedin.com/in/someone", "https://linkedin.com.evil.com/posts/x-activity-7123456789012345678"],
)
def test_url_rejects_garbage_and_lookalike_hosts(bad):
    with pytest.raises(InvalidPostUrl):
        parse_post_url(bad)


def test_short_url_resolves_and_extracts_post_id():
    dest = "https://www.linkedin.com/posts/jane-doe-1a2b_hello-activity-7123456789012345678-AbCd?utm_source=share"
    transport = httpx.MockTransport(lambda req: httpx.Response(301, headers={"Location": dest}))
    client = httpx.Client(transport=transport)
    p = parse_post_url("https://lnkd.in/p/dg6tJPHG", client=client)
    assert p.kind == "activity"
    assert p.post_id == "7123456789012345678"
    assert p.author_slug == "jane-doe-1a2b"
    assert p.canonical_url == "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/"


def test_short_url_multi_hop_resolves_to_destination():
    hop1 = "https://lnkd.in/p/step2"
    dest = "https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678/"

    def handler(request):
        if str(request.url).endswith("step1"):
            return httpx.Response(301, headers={"Location": hop1})
        return httpx.Response(302, headers={"Location": dest})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    p = parse_post_url("https://lnkd.in/p/step1", client=client)
    assert p.kind == "share"
    assert p.post_id == "7123456789012345678"
    assert p.canonical_url == "https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678/"


@pytest.mark.parametrize(
    "external_target",
    [
        "https://evil.com/posts/activity-7123456789012345678",
        "http://127.0.0.1:8000/internal",
        "http://localhost:8000/api",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.1/admin",
        "http://192.168.1.1/router",
        "https://sub.linkedin.com/posts/activity-7123456789012345678",
        "https://linkedin.com.attacker.com/posts/activity-7123456789012345678",
    ],
)
def test_short_url_rejects_external_and_ssrf_redirects(external_target):
    transport = httpx.MockTransport(lambda req: httpx.Response(301, headers={"Location": external_target}))
    client = httpx.Client(transport=transport)
    with pytest.raises(InvalidPostUrl):
        parse_post_url("https://lnkd.in/p/test", client=client)


def test_short_url_times_out():
    def handler(request):
        raise httpx.ReadTimeout("Connection timed out")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(InvalidPostUrl) as exc_info:
        parse_post_url("https://lnkd.in/p/timeout-test", client=client)
    assert "Timed out" in str(exc_info.value)


def test_short_url_rejects_no_redirect_and_not_found():
    client_200 = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, text="OK")))
    with pytest.raises(InvalidPostUrl) as exc_info:
        parse_post_url("https://lnkd.in/p/no-redirect", client=client_200)
    assert "did not redirect" in str(exc_info.value)

    client_404 = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(404, text="Not Found")))
    with pytest.raises(InvalidPostUrl) as exc_info:
        parse_post_url("https://lnkd.in/p/missing", client=client_404)
    assert "404" in str(exc_info.value)


def test_short_url_rejects_redirect_without_post_id():
    dest = "https://www.linkedin.com/in/someone"
    client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(301, headers={"Location": dest})))
    with pytest.raises(InvalidPostUrl) as exc_info:
        parse_post_url("https://lnkd.in/p/profile", client=client)
    assert "Could not find a post/activity id" in str(exc_info.value)


def test_short_url_redirect_loop_exceeds_max_redirects():
    # Loop back and forth between two short URLs
    def loop_handler(request):
        if "loop1" in str(request.url):
            return httpx.Response(301, headers={"Location": "https://lnkd.in/p/loop2"})
        return httpx.Response(301, headers={"Location": "https://lnkd.in/p/loop1"})

    client = httpx.Client(transport=httpx.MockTransport(loop_handler))
    with pytest.raises(InvalidPostUrl) as exc_info:
        parse_post_url("https://lnkd.in/p/loop1", client=client)
    assert "Too many redirects" in str(exc_info.value)



# ---------------------------------------------------------------- dedup
def test_normalize_strips_noise():
    assert normalize_text("Hello,  WORLD! #hiring @bob https://x.co/a") == "hello world"


def test_exact_hash_ignores_case_punctuation_links():
    assert content_hash("Looking for an agency!! https://a.b") == content_hash("looking for an AGENCY")


def test_simhash_edit_is_near_but_different_post_is_far():
    base = "Looking for an influencer marketing agency in Mumbai for our D2C skincare launch. Budget around 5 lakh. Any recommendations?"
    edited = base + " Please DM."
    other = "Looking for an influencer marketing agency in Delhi for our fintech app launch. Budget around 8 lakh. Any suggestions?"
    limit = settings.simhash_max_distance
    assert hamming_distance(simhash(base), simhash(edited)) <= limit
    assert hamming_distance(simhash(base), simhash(other)) > limit


@pytest.mark.parametrize("text", [
    "Need an ad agency for a festive TVC campaign, any suggestions?",
    "We need a reliable video production company for a corporate film.",
    "Require an experienced creative agency for rebranding.",
])
def test_need_phrases_with_adjectives_still_count_as_intent(text):
    assert any("need / require" in sig for sig in classify(text).signals)


def test_find_near_duplicate_picks_closest():
    s = simhash("some text about a production house in pune for a brand film")
    far = simhash("completely unrelated sentence about cooking pasta tonight")
    assert find_near_duplicate(s, [(1, far), (2, s)], 7) == (2, 0)
    assert find_near_duplicate(s, [(1, far)], 7) is None


# ---------------------------------------------------------------- classifier
def test_genuine_request_scores_high_and_india():
    r = classify("Looking for an influencer marketing agency in Mumbai for our D2C launch. Budget 5 lakh. Any recommendations?")
    assert r.service_category == "influencer_marketing"
    assert r.intent_label == "high" and r.intent_score >= 70
    assert r.is_india and r.relevance_score >= 70


def test_agency_self_promo_is_not_a_lead():
    r = classify("We are an influencer marketing agency. We offer end-to-end campaigns. Book a call today!")
    assert r.intent_label == "not_a_lead" and r.intent_score == 0


def test_job_post_is_not_a_lead():
    r = classify("We're hiring a Production Manager for our film production house. Apply now, send your CV.")
    assert r.intent_label == "not_a_lead"


def test_job_seeker_is_not_a_lead():
    r = classify("Open to work! Looking for a job as a video editor at a production house.")
    assert r.intent_label == "not_a_lead"


def test_recommendation_ask_categories():
    r = classify("Can anyone recommend a production house in Bangalore for a brand film? Urgent.")
    assert r.service_category in ("production_house", "brand_film")
    assert r.intent_label == "high"


def test_hinglish_request():
    r = classify("Koi acchi ad agency suggest karo, hume TVC chahiye Delhi me")
    assert r.intent_label in ("high", "medium") and r.is_india


def test_buyer_phrase_without_service_is_weaker():
    generic = classify("Looking for a good dentist near me, any recommendations?")
    assert generic.service_category == "other"
    assert generic.relevance_score == 0
    assert generic.intent_score < 40


def test_campaign_keywords_boost_and_exclude_penalise():
    text = "Looking for an advertising agency, any recommendations?"
    base = classify(text).relevance_score
    assert classify(text, campaign_keywords=["advertising agency"]).relevance_score > base
    assert classify(text, exclude_keywords=["recommendations"]).relevance_score < base


def test_empty_text_is_safe():
    r = classify("")
    assert r.intent_score == 0 and r.relevance_score == 0 and r.service_category == "other"


# ---------------------------------------------------------------- dates
def test_relative_and_iso_dates():
    now = datetime(2026, 10, 18, 12, 0, tzinfo=timezone.utc)
    assert parse_posted_at("3d", now) == now - timedelta(days=3)
    assert parse_posted_at("2w", now) == now - timedelta(weeks=2)
    assert parse_posted_at("5h", now) == now - timedelta(hours=5)
    assert parse_posted_at("1mo", now) == now - timedelta(days=30)
    assert parse_posted_at("2026-10-12", now).date().isoformat() == "2026-10-12"
    assert parse_posted_at("", now) is None and parse_posted_at(None, now) is None
    with pytest.raises(ValueError):
        parse_posted_at("yesterday-ish", now)


# ---------------------------------------------------------------- parsers
def test_bulk_text_parsing_with_headers_and_missing_url():
    raw = """
https://www.linkedin.com/posts/a-b_x-activity-7123456789012345601-aa
Author: Priya Shah
Company: Glow Co
Posted: 2d
Looking for an influencer agency in Pune. Any recommendations?
---
https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345602/
Need a production house for a brand film.
---
https://lnkd.in/p/dg6tJPHG
Looking for a social media marketing agency for our brand campaign.
---
this block has no url at all
"""
    items = parse_bulk_text(raw)
    assert len(items) == 4
    assert items[0]["author_name"] == "Priya Shah" and items[0]["company"] == "Glow Co" and items[0]["posted_at"] == "2d"
    assert items[0]["text"].startswith("Looking for an influencer agency")
    assert items[1]["url"].endswith("7123456789012345602/")
    assert items[2]["url"] == "https://lnkd.in/p/dg6tJPHG"
    assert items[2]["text"].startswith("Looking for a social media")
    assert items[3]["url"] == ""


def test_csv_parsing_aliases_and_errors():
    data = b"Post Link,Content,Author\nhttps://www.linkedin.com/feed/update/urn:li:activity:7123456789012345601/,hello there friend,Sam\n"
    items = parse_csv(data)
    assert items == [{"url": "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345601/", "text": "hello there friend", "author_name": "Sam"}]
    with pytest.raises(ValueError):
        parse_csv(b"foo,bar\n1,2\n")


# ---------------------------------------------------------------- search links
def test_search_link_generation():
    qs = generate_queries(["production_house"], ["brand film"], ["Mumbai"], max_queries=500)
    texts = [q for q, _ in qs]
    assert len(texts) == len(set(t.lower() for t in texts))  # no duplicates
    assert any("Mumbai" in t for t in texts)
    url = build_search_url('"looking for" production house', "past-week")
    assert url.startswith("https://www.linkedin.com/search/results/content/?keywords=")
    assert "datePosted" in url
