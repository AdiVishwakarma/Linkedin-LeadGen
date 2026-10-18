"""Import pipeline: validate -> dedup -> classify -> save, one item at a time.

Reliability properties
  * Each item is committed on its own. One bad item never aborts the batch or loses prior work.
  * Failed items are written to error_logs WITH their raw payload, so they can be retried later.
  * Idempotent: post_id has a UNIQUE index, so re-submitting a batch after an interrupted run
    just counts the already-saved posts as duplicates. A race between two requests is caught
    as an IntegrityError and treated as a duplicate too.
  * Incomplete data is accepted where it can be (no author/company/date is fine); only a missing
    or invalid URL, or missing post text, is a hard failure because nothing can be classified.
"""

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Campaign, ErrorLog, ImportRun, Lead, SearchTask, utcnow
from . import dedup
from .classifier import classify
from .url_parser import InvalidPostUrl, parse_post_url

MIN_TEXT_CHARS = 20
MAX_TEXT_CHARS = 10_000
_FIELD_LIMITS = {
    "author_name": 200,
    "author_headline": 300,
    "company": 200,
    "location": 200,
}
_OPTIONAL_FIELDS = ("author_name", "author_headline", "author_profile_url", "company", "location")


class ItemError(Exception):
    def __init__(self, stage: str, message: str):
        super().__init__(message)
        self.stage = stage
        self.message = message


# ------------------------------------------------------------------ date parsing

_REL_RE = re.compile(
    r"^\s*(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?|mo|mos|months?|y|yr|yrs|years?)\b",
    re.IGNORECASE,
)


def parse_posted_at(value: str | None, now: datetime | None = None) -> datetime | None:
    """Accepts ISO dates ('2026-10-12', '2026-10-12T09:30:00Z') or LinkedIn-style relative ages
    ('3d', '2w', '1mo', '5h'). Returns None for empty input; raises ValueError for garbage."""
    if value is None or not str(value).strip():
        return None
    value = str(value).strip()
    now = now or utcnow()

    m = _REL_RE.match(value)
    if m:
        n, unit = int(m.group(1)), m.group(2).lower()
        if unit.startswith("mo"):
            delta = timedelta(days=30 * n)
        elif unit in ("m", "min", "mins") or unit.startswith("minute"):
            delta = timedelta(minutes=n)
        elif unit.startswith("h"):
            delta = timedelta(hours=n)
        elif unit.startswith("d"):
            delta = timedelta(days=n)
        elif unit.startswith("w"):
            delta = timedelta(weeks=n)
        else:
            delta = timedelta(days=365 * n)
        return now - delta

    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"Unrecognized date '{value}' (use YYYY-MM-DD or a relative age like 3d / 2w)")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# ------------------------------------------------------------------ core

def _clean(value) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _normalize_item(item: dict) -> dict:
    out = {"url": _clean(item.get("url")), "text": _clean(item.get("text"))}
    for f in _OPTIONAL_FIELDS:
        v = _clean(item.get(f))
        if v and f in _FIELD_LIMITS:
            v = v[: _FIELD_LIMITS[f]]
        out[f] = v
    out["posted_at"] = _clean(item.get("posted_at"))
    return out


def _log(db: Session, run: ImportRun, stage: str, message: str, payload: dict | None, level="error"):
    db.add(ErrorLog(run_id=run.id, stage=stage, message=message[:2000], payload=payload, level=level))


def _process_item(
    db: Session,
    item: dict,
    run: ImportRun,
    campaign: Campaign | None,
    sim_candidates: list[tuple[int, str]],
) -> str:
    """Returns 'created' | 'duplicate' | 'near_duplicate'. Raises ItemError for bad input."""
    item = _normalize_item(item)

    if not item["url"]:
        raise ItemError("validate", "Missing post URL")
    try:
        parsed = parse_post_url(item["url"])
    except InvalidPostUrl as e:
        raise ItemError("parse", str(e))

    text = item["text"]
    if not text or len(text) < MIN_TEXT_CHARS:
        raise ItemError(
            "validate",
            f"Post text missing or too short (need at least {MIN_TEXT_CHARS} characters). "
            "Paste the post text along with the URL.",
        )
    text = text[:MAX_TEXT_CHARS]

    try:
        posted_at = parse_posted_at(item["posted_at"])
    except ValueError as e:
        posted_at = None
        _log(db, run, "validate", f"{e}. Saved the lead without a date.", None, level="warning")

    # ---- layer 1: same post (activity id) ----
    existing = db.scalar(select(Lead).where(Lead.post_id == parsed.post_id))
    if existing is not None:
        # Fill gaps on the existing record instead of discarding richer data
        changed = False
        for f in _OPTIONAL_FIELDS:
            if not getattr(existing, f) and item[f]:
                setattr(existing, f, item[f])
                changed = True
        if existing.posted_at is None and posted_at is not None:
            existing.posted_at = posted_at
            changed = True
        if changed:
            existing.updated_at = utcnow()
        return "duplicate"

    # ---- layers 2 and 3: same / near-same text ----
    c_hash = dedup.content_hash(text)
    sim = dedup.simhash(text)
    duplicate_of: int | None = None
    exact = db.scalar(
        select(Lead.id).where(Lead.content_hash == c_hash, Lead.is_duplicate.is_(False)).limit(1)
    )
    if exact is not None:
        duplicate_of = exact
    else:
        near = dedup.find_near_duplicate(sim, sim_candidates, settings.simhash_max_distance)
        if near is not None:
            duplicate_of = near[0]

    # ---- classify ----
    cls = classify(
        text,
        campaign_keywords=campaign.keywords if campaign else None,
        exclude_keywords=campaign.exclude_keywords if campaign else None,
        target_categories=campaign.service_categories if campaign else None,
    )
    lead = Lead(
        campaign_id=campaign.id if campaign else None,
        import_run_id=run.id,
        source_url=parsed.canonical_url,
        post_id=parsed.post_id,
        post_id_kind=parsed.kind,
        content=text,
        content_hash=c_hash,
        simhash=sim,
        author_name=item["author_name"],
        author_slug=(parsed.author_slug or None) and parsed.author_slug[:200],
        author_headline=item["author_headline"],
        author_profile_url=item["author_profile_url"],
        company=item["company"],
        location=item["location"],
        posted_at=posted_at,
        service_category=cls.service_category,
        relevance_score=cls.relevance_score,
        intent_score=cls.intent_score,
        intent_label=cls.intent_label,
        is_india=cls.is_india,
        matched_signals=cls.signals,
        is_duplicate=duplicate_of is not None,
        duplicate_of_id=duplicate_of,
    )
    db.add(lead)
    db.flush()  # surfaces a UNIQUE violation here, inside the caller's try block
    if duplicate_of is None:
        sim_candidates.append((lead.id, sim))
        return "created"
    return "near_duplicate"


def _load_sim_candidates(db: Session) -> list[tuple[int, str]]:
    rows = db.execute(select(Lead.id, Lead.simhash).where(Lead.is_duplicate.is_(False))).all()
    return [(r[0], r[1]) for r in rows]


def _apply_outcome(run: ImportRun, outcome: str) -> None:
    if outcome == "created":
        run.created += 1
    elif outcome == "duplicate":
        run.duplicates += 1
    elif outcome == "near_duplicate":
        run.near_duplicates += 1


def _finalize(run: ImportRun) -> None:
    if run.failed == 0:
        run.status = "completed"
    elif run.failed >= run.total:
        run.status = "failed"
    else:
        run.status = "partial"
    run.finished_at = utcnow()


def run_import(
    db: Session,
    items: list[dict],
    *,
    source: str = "manual",
    campaign_id: int | None = None,
    search_task_id: int | None = None,
) -> ImportRun:
    campaign = db.get(Campaign, campaign_id) if campaign_id else None
    task = db.get(SearchTask, search_task_id) if search_task_id else None
    if task and not campaign:
        campaign = db.get(Campaign, task.campaign_id)

    run = ImportRun(
        campaign_id=campaign.id if campaign else None,
        search_task_id=task.id if task else None,
        source=source,
        status="running",
        total=len(items),
    )
    db.add(run)
    db.commit()

    try:
        sim_candidates = _load_sim_candidates(db)
        for item in items:
            try:
                outcome = _process_item(db, item, run, campaign, sim_candidates)
                _apply_outcome(run, outcome)
                db.commit()
            except ItemError as e:
                db.rollback()
                run = db.merge(run)
                run.failed += 1
                _log(db, run, e.stage, e.message, dict(item))
                db.commit()
            except IntegrityError:
                # Lost a race against another request that saved the same post_id
                db.rollback()
                run = db.merge(run)
                run.duplicates += 1
                db.commit()
            except Exception as e:  # noqa: BLE001  (never let one item kill the run)
                db.rollback()
                run = db.merge(run)
                run.failed += 1
                _log(db, run, "save", f"{type(e).__name__}: {e}", dict(item))
                db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        run = db.merge(run)
        run.status = "failed"
        run.finished_at = utcnow()
        _log(db, run, "run", f"Run aborted: {type(e).__name__}: {e}", None)
        db.commit()
        return run

    run = db.merge(run)
    _finalize(run)
    if task:
        task = db.merge(task)
        task.posts_added += run.created
        task.status = "done"
        task.completed_at = utcnow()
    db.commit()
    return run


def retry_run(db: Session, run_id: int) -> ImportRun:
    """Re-process the failed items of a run, using the payloads stored in error_logs."""
    run = db.get(ImportRun, run_id)
    if run is None:
        raise LookupError("Run not found")
    campaign = db.get(Campaign, run.campaign_id) if run.campaign_id else None

    pending = db.scalars(
        select(ErrorLog).where(
            ErrorLog.run_id == run.id,
            ErrorLog.resolved.is_(False),
            ErrorLog.payload.is_not(None),
            ErrorLog.level == "error",
        )
    ).all()
    sim_candidates = _load_sim_candidates(db)

    for err in pending:
        if not err.payload:  # nothing to replay (e.g. a run-level error)
            continue
        try:
            outcome = _process_item(db, err.payload, run, campaign, sim_candidates)
            _apply_outcome(run, outcome)
            run.failed = max(0, run.failed - 1)
            err.resolved = True
            db.commit()
        except ItemError as e:
            db.rollback()
            err = db.merge(err)
            err.stage, err.message = e.stage, e.message[:2000]
            db.commit()
        except IntegrityError:
            db.rollback()
            err = db.merge(err)
            run = db.merge(run)
            run.duplicates += 1
            run.failed = max(0, run.failed - 1)
            err.resolved = True
            db.commit()
        except Exception as e:  # noqa: BLE001
            db.rollback()
            err = db.merge(err)
            err.message = f"{type(e).__name__}: {e}"[:2000]
            db.commit()

    run = db.merge(run)
    _finalize(run)
    db.commit()
    return run


def recover_interrupted_runs(db: Session) -> int:
    """Called on startup: any run still 'queued'/'running' belongs to a dead process."""
    stuck = db.scalars(select(ImportRun).where(ImportRun.status.in_(("queued", "running")))).all()
    for run in stuck:
        run.status = "interrupted"
        run.finished_at = utcnow()
        db.add(
            ErrorLog(
                run_id=run.id,
                stage="run",
                level="warning",
                message="Server stopped before this run finished. Posts already saved are kept; "
                "re-submit the batch to continue (already-saved posts are skipped as duplicates).",
            )
        )
    db.commit()
    return len(stuck)
