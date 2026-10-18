from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ErrorLog, ImportRun, Lead, SearchTask, utcnow
from ..schemas import RunOut

router = APIRouter(tags=["dashboard"])


def _group_counts(db: Session, column, *where) -> dict[str, int]:
    stmt = select(column, func.count()).where(Lead.is_duplicate.is_(False), *where).group_by(column)
    return {k: v for k, v in db.execute(stmt).all()}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    real = Lead.is_duplicate.is_(False)
    total = db.scalar(select(func.count()).select_from(Lead).where(real)) or 0
    duplicates = db.scalar(select(func.count()).select_from(Lead).where(Lead.is_duplicate.is_(True))) or 0

    since = utcnow() - timedelta(days=14)
    per_day_rows = db.execute(
        select(func.date(Lead.captured_at), func.count())
        .where(real, Lead.captured_at >= since)
        .group_by(func.date(Lead.captured_at))
        .order_by(func.date(Lead.captured_at))
    ).all()

    high_intent = db.scalar(
        select(func.count()).select_from(Lead).where(real, Lead.intent_label == "high")
    ) or 0
    shortlisted = db.scalar(
        select(func.count()).select_from(Lead).where(real, Lead.status == "shortlisted")
    ) or 0
    reviewed_total = db.scalar(
        select(func.count()).select_from(Lead).where(real, Lead.status != "new")
    ) or 0

    recent_runs = db.scalars(
        select(ImportRun).order_by(ImportRun.started_at.desc(), ImportRun.id.desc()).limit(8)
    ).all()

    return {
        "totals": {
            "leads": total,
            "duplicates_hidden": duplicates,
            "high_intent": high_intent,
            "shortlisted": shortlisted,
            "needs_review": total - reviewed_total,
            "open_errors": db.scalar(
                select(func.count()).select_from(ErrorLog).where(
                    ErrorLog.level == "error", ErrorLog.resolved.is_(False)
                )
            ) or 0,
            "pending_searches": db.scalar(
                select(func.count()).select_from(SearchTask).where(SearchTask.status == "pending")
            ) or 0,
            "runs": db.scalar(select(func.count()).select_from(ImportRun)) or 0,
        },
        "by_status": _group_counts(db, Lead.status),
        "by_category": _group_counts(db, Lead.service_category),
        "by_intent_label": _group_counts(db, Lead.intent_label),
        "leads_per_day": [{"date": str(d), "count": c} for d, c in per_day_rows],
        # Usefulness metric: of the leads a human reviewed, how many were worth keeping?
        "review_precision": _precision(db),
        "recent_runs": [RunOut.model_validate(r) for r in recent_runs],
    }


def _precision(db: Session) -> dict:
    """Share of reviewed leads that were shortlisted, overall and per intent label.
    This is the product's honest quality signal: does a high score predict a human 'yes'?"""
    rows = db.execute(
        select(Lead.intent_label, Lead.status, func.count())
        .where(Lead.is_duplicate.is_(False), Lead.status.in_(("shortlisted", "rejected")))
        .group_by(Lead.intent_label, Lead.status)
    ).all()
    per: dict[str, dict[str, int]] = {}
    for label, status, n in rows:
        per.setdefault(label, {"shortlisted": 0, "rejected": 0})[status] = n
    out = {}
    all_s = all_r = 0
    for label, c in per.items():
        decided = c["shortlisted"] + c["rejected"]
        out[label] = {**c, "precision": round(c["shortlisted"] / decided, 3) if decided else None}
        all_s += c["shortlisted"]
        all_r += c["rejected"]
    overall = all_s + all_r
    return {
        "overall": round(all_s / overall, 3) if overall else None,
        "decided": overall,
        "by_intent_label": out,
    }
