import io

from tests.conftest import post_url

REQ = "Looking for an influencer marketing agency in Mumbai for our D2C launch. Budget 5 lakh. Any recommendations?"
PROMO = "We are an influencer marketing agency. We offer end-to-end campaigns. Book a call today! #influencer"


def _import(client, items, **extra):
    r = client.post("/api/imports", json={"items": items, **extra})
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------- import + dedup
def test_import_creates_classified_leads(client):
    run = _import(client, [{"url": post_url(1), "text": REQ, "author_name": "Priya", "posted_at": "2d"}, {"url": post_url(2), "text": PROMO}])
    assert run["status"] == "completed" and run["created"] == 2 and run["failed"] == 0

    leads = client.get("/api/leads").json()
    assert leads["total"] == 2
    by_url = {l["post_id"]: l for l in leads["items"]}
    good = by_url["7123456789012345601"]
    assert good["intent_label"] == "high" and good["service_category"] == "influencer_marketing"
    assert good["author_name"] == "Priya" and good["posted_at"] is not None
    assert good["source_url"].startswith("https://www.linkedin.com/feed/update/urn:li:activity:")
    assert by_url["7123456789012345602"]["intent_label"] == "not_a_lead"


def test_same_post_via_different_url_shapes_is_deduplicated(client):
    _import(client, [{"url": post_url(1), "text": REQ}])
    run = _import(client, [{"url": "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345601/?utm=x", "text": REQ}])
    assert run["created"] == 0 and run["duplicates"] == 1
    assert client.get("/api/leads").json()["total"] == 1


def test_short_url_import_resolves_and_deduplicates_against_canonical(client, monkeypatch):
    dest = "https://www.linkedin.com/posts/priya-123_launch-activity-7123456789012345601-AbCd"
    import app.services.url_parser as url_parser_mod
    monkeypatch.setattr(url_parser_mod, "resolve_short_url", lambda url, **kw: dest)

    run = _import(client, [{"url": "https://lnkd.in/p/dg6tJPHG", "text": REQ}])
    assert run["created"] == 1
    leads = client.get("/api/leads").json()
    assert leads["total"] == 1
    assert leads["items"][0]["post_id"] == "7123456789012345601"

    # Now importing the direct canonical URL is recognized as duplicate
    run2 = _import(client, [{"url": dest, "text": REQ}])
    assert run2["duplicates"] == 1 and run2["created"] == 0


def test_resubmitting_a_batch_is_idempotent(client):
    items = [
        {"url": post_url(1), "text": REQ},
        {"url": post_url(2), "text": "Can anyone recommend a production house in Bangalore for a brand film? Urgent."},
        {"url": post_url(3), "text": "Need an ad agency for a festive TVC campaign, any suggestions? Budget 10 lakh, Delhi."},
    ]
    first = _import(client, items)
    again = _import(client, items)
    assert first["created"] == 3 and again["created"] == 0 and again["duplicates"] == 3
    assert client.get("/api/leads").json()["total"] == 3


def test_duplicate_fills_missing_fields_on_existing_lead(client):
    _import(client, [{"url": post_url(1), "text": REQ}])
    _import(client, [{"url": post_url(1), "text": REQ, "company": "Glow Co", "author_name": "Priya Shah"}])
    lead = client.get("/api/leads").json()["items"][0]
    assert lead["company"] == "Glow Co" and lead["author_name"] == "Priya Shah"


def test_near_duplicate_text_is_flagged_and_hidden_by_default(client):
    _import(client, [{"url": post_url(1), "text": REQ}])
    run = _import(client, [{"url": post_url(2, "someone-else-9z"), "text": REQ + " Please DM."}])
    assert run["near_duplicates"] == 1 and run["created"] == 0
    assert client.get("/api/leads").json()["total"] == 1
    everything = client.get("/api/leads", params={"include_duplicates": True}).json()
    assert everything["total"] == 2
    dup = next(l for l in everything["items"] if l["is_duplicate"])
    assert dup["duplicate_of_id"] is not None


def test_incomplete_and_bad_items_are_logged_not_fatal(client):
    run = _import(
        client,
        [
            {"url": post_url(1), "text": REQ},
            {"url": "https://example.com/nope", "text": REQ},
            {"url": post_url(3), "text": "too short"},
            {"text": REQ},
            {"url": post_url(5), "text": REQ + " second distinct post about brand films in Delhi", "posted_at": "not-a-date"},
        ],
    )
    assert run["status"] == "partial"
    assert run["created"] == 2 and run["failed"] == 3
    detail = client.get(f"/api/runs/{run['id']}").json()
    stages = sorted(e["stage"] for e in detail["errors"] if e["level"] == "error")
    assert stages == ["parse", "validate", "validate"]
    assert any(e["level"] == "warning" for e in detail["errors"])  # bad date -> saved without date
    assert all(e["payload"] is not None for e in detail["errors"] if e["level"] == "error")


def test_retry_recovers_after_failure_is_fixed(client):
    # A run that fails because of a missing campaign-independent reason can't be "fixed" by retry,
    # so simulate a transient failure: the item fails, then the data is repaired in the error log.
    run = _import(client, [{"url": post_url(1), "text": "short"}])
    assert run["status"] == "failed"
    errors = client.get("/api/errors", params={"run_id": run["id"]}).json()
    assert len(errors) == 1 and not errors[0]["resolved"]

    from app.database import SessionLocal
    from app.models import ErrorLog

    with SessionLocal() as db:
        e = db.get(ErrorLog, errors[0]["id"])
        e.payload = {**e.payload, "text": REQ}  # user fixes the text
        db.commit()

    retried = client.post(f"/api/runs/{run['id']}/retry").json()
    assert retried["status"] == "completed" and retried["created"] == 1 and retried["failed"] == 0
    assert client.get("/api/leads").json()["total"] == 1
    assert client.get("/api/errors", params={"run_id": run["id"], "unresolved_only": True}).json() == []


def test_bulk_text_and_csv_import(client):
    raw = f"{post_url(1)}\nAuthor: Priya\n{REQ}\n---\n{post_url(2)}\nNeed a production house for a brand film in Bangalore. Urgent, any suggestions?\n---\nno url here just text"
    r = client.post("/api/imports/bulk-text", json={"raw_text": raw})
    assert r.status_code == 201
    run = r.json()
    assert run["created"] == 2 and run["failed"] == 1 and run["source"] == "bulk"

    csv_data = f"url,text,company\n{post_url(7)},Can anyone recommend an ad film production house in Chennai? Urgent.,Acme\n"
    r = client.post("/api/imports/csv", files={"file": ("x.csv", io.BytesIO(csv_data.encode()), "text/csv")})
    assert r.status_code == 201 and r.json()["created"] == 1 and r.json()["source"] == "csv"
    bad = client.post("/api/imports/csv", files={"file": ("x.csv", io.BytesIO(b"foo,bar\n1,2\n"), "text/csv")})
    assert bad.status_code == 422


def test_interrupted_runs_are_recovered_on_startup(client):
    from app.database import SessionLocal
    from app.models import ImportRun
    from app.services.importer import recover_interrupted_runs

    with SessionLocal() as db:
        db.add(ImportRun(status="running", total=5))
        db.commit()
        assert recover_interrupted_runs(db) == 1
    runs = client.get("/api/runs", params={"status": "interrupted"}).json()
    assert len(runs) == 1
    assert client.get(f"/api/runs/{runs[0]['id']}").json()["errors"][0]["level"] == "warning"


# ---------------------------------------------------------------- leads: filter / sort / status / export
def _seed(client):
    _import(
        client,
        [
            {"url": post_url(1), "text": REQ, "author_name": "Zed", "posted_at": "1d"},
            {"url": post_url(2), "text": "Can anyone recommend a production house in Bangalore for a brand film? Urgent.", "author_name": "Amy", "posted_at": "5d"},
            {"url": post_url(3), "text": PROMO, "author_name": "Mia"},
            {"url": post_url(4), "text": "Need an ad agency for a festive TVC campaign, any suggestions? Budget 10 lakh, Delhi.", "author_name": "Bob", "posted_at": "3d"},
        ],
    )


def test_filter_search_sort_paginate(client):
    _seed(client)
    g = lambda **p: client.get("/api/leads", params=p).json()
    assert g()["total"] == 4
    assert g(category="influencer_marketing")["total"] >= 1
    assert all(l["intent_label"] == "high" for l in g(intent_label="high")["items"])
    assert g(include_not_leads=False)["total"] == 3
    assert g(q="bangalore")["total"] == 1
    assert g(q="amy")["total"] == 1  # searches author too
    assert g(min_intent=70)["total"] == 3
    asc = [l["author_name"] for l in g(sort_by="author", order="asc")["items"]]
    assert asc == sorted(asc)
    by_intent = [l["intent_score"] for l in g(sort_by="intent", order="desc")["items"]]
    assert by_intent == sorted(by_intent, reverse=True)
    p1 = g(page_size=3, page=1)
    p2 = g(page_size=3, page=2)
    assert len(p1["items"]) == 3 and len(p2["items"]) == 1 and p1["total"] == 4
    assert client.get("/api/leads", params={"sort_by": "bogus"}).status_code == 422


def test_status_workflow_notes_and_bulk(client):
    _seed(client)
    items = client.get("/api/leads").json()["items"]
    lid = items[0]["id"]
    r = client.patch(f"/api/leads/{lid}", json={"status": "shortlisted", "notes": "call Monday"})
    assert r.status_code == 200 and r.json()["status"] == "shortlisted" and r.json()["notes"] == "call Monday"
    assert client.patch(f"/api/leads/{lid}", json={"status": "bogus"}).status_code == 422
    assert client.patch(f"/api/leads/{lid}", json={"service_category": "bogus"}).status_code == 422
    assert client.patch("/api/leads/99999", json={"status": "reviewed"}).status_code == 404

    ids = [i["id"] for i in items[1:3]]
    assert client.post("/api/leads/bulk-status", json={"ids": ids, "status": "rejected"}).json()["updated"] == 2
    assert client.get("/api/leads", params={"status": "rejected"}).json()["total"] == 2


def test_csv_export_respects_filters_and_blocks_formula_injection(client):
    _import(client, [
        {"url": post_url(1), "text": REQ, "author_name": "=HYPERLINK(\"http://evil\")"},
        {"url": post_url(2), "text": PROMO, "author_name": "Mia"},
    ])
    r = client.get("/api/leads/export.csv", params={"include_not_leads": False})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    body = r.text
    assert body.startswith("﻿id,status")
    lines = [l for l in body.strip().splitlines()]
    assert len(lines) == 2  # header + the one real lead
    assert "'=HYPERLINK" in body and ",=HYPERLINK" not in body


# ---------------------------------------------------------------- campaigns + search checklist
def test_campaign_crud_and_search_generation(client):
    r = client.post("/api/campaigns", json={"name": "Q4 India", "service_categories": ["production_house", "brand_film"], "keywords": ["TVC"], "locations": ["Mumbai", "Delhi"]})
    assert r.status_code == 201
    cid = r.json()["id"]
    assert client.post("/api/campaigns", json={"name": "Q4 India"}).status_code == 409
    assert client.post("/api/campaigns", json={"name": "bad", "service_categories": ["nope"]}).status_code == 422

    tasks = client.post(f"/api/campaigns/{cid}/generate-searches", json={"max_queries": 30}).json()
    assert 0 < len(tasks) <= 30
    assert all(t["search_url"].startswith("https://www.linkedin.com/search/results/content/") for t in tasks)
    again = client.post(f"/api/campaigns/{cid}/generate-searches", json={"max_queries": 30}).json()
    assert again == []  # idempotent: nothing new

    tid = tasks[0]["id"]
    assert client.patch(f"/api/search-tasks/{tid}", json={"status": "skipped"}).json()["status"] == "skipped"
    assert client.patch(f"/api/search-tasks/{tid}", json={"status": "bogus"}).status_code == 422

    # importing against a search task marks it done and counts posts
    run = _import(client, [{"url": post_url(1), "text": REQ}], campaign_id=cid, search_task_id=tasks[1]["id"])
    t = client.get(f"/api/campaigns/{cid}/search-tasks").json()[1]
    assert t["status"] == "done" and t["posts_added"] == run["created"] == 1

    assert client.get(f"/api/campaigns/{cid}").json()["lead_count"] == 1
    assert client.delete(f"/api/campaigns/{cid}").status_code == 204
    assert client.get("/api/leads").json()["total"] == 1  # leads survive campaign deletion


def test_campaign_keywords_influence_relevance(client):
    cid = client.post("/api/campaigns", json={"name": "C", "service_categories": ["ad_agency"], "keywords": ["festive"]}).json()["id"]
    text = "Need an ad agency for a festive campaign, any suggestions?"
    _import(client, [{"url": post_url(1), "text": text}])
    _import(client, [{"url": post_url(2), "text": text + " second post in a different city for another brand launch"}], campaign_id=cid)
    leads = {l["post_id"]: l for l in client.get("/api/leads").json()["items"]}
    assert leads["7123456789012345602"]["relevance_score"] > leads["7123456789012345601"]["relevance_score"]


# ---------------------------------------------------------------- dashboard
def test_dashboard_and_review_precision(client):
    _seed(client)
    items = client.get("/api/leads", params={"intent_label": "high"}).json()["items"]
    client.patch(f"/api/leads/{items[0]['id']}", json={"status": "shortlisted"})
    client.patch(f"/api/leads/{items[1]['id']}", json={"status": "rejected"})
    d = client.get("/api/dashboard").json()
    assert d["totals"]["leads"] == 4 and d["totals"]["shortlisted"] == 1
    assert d["totals"]["needs_review"] == 2
    assert d["review_precision"]["overall"] == 0.5 and d["review_precision"]["decided"] == 2
    assert d["recent_runs"] and d["by_category"]
    assert sum(x["count"] for x in d["leads_per_day"]) == 4
