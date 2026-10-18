import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Lead, utcnow
from ..schemas import BulkStatusIn, LeadOut, LeadPage, LeadPatch

router = APIRouter(prefix="/leads", tags=["leads"])

SORTABLE = {
    "captured_at": Lead.captured_at,
    "posted_at": Lead.posted_at,
    "relevance": Lead.relevance_score,
    "intent": Lead.intent_score,
    "author": Lead.author_name,
    "category": Lead.service_category,
    "status": Lead.status,
}


class LeadFilters:
    """Shared by the list endpoint and the CSV export so both always agree."""

    def __init__(
        self,
        q: str | None = Query(None, description="Search in post text, author, company"),
        status: str | None = Query(None, pattern="^(new|reviewed|shortlisted|rejected)$"),
        category: str | None = None,
        intent_label: str | None = Query(None, pattern="^(high|medium|low|not_a_lead)$"),
        min_relevance: float | None = Query(None, ge=0, le=100),
        min_intent: float | None = Query(None, ge=0, le=100),
        campaign_id: int | None = None,
        run_id: int | None = None,
        india_only: bool = False,
        include_duplicates: bool = False,
        include_not_leads: bool = True,
        posted_after: datetime | None = None,
        posted_before: datetime | None = None,
        sort_by: str = Query("captured_at"),
        order: str = Query("desc", pattern="^(asc|desc)$"),
    ):
        self.__dict__.update(locals())
        del self.__dict__["self"]

    def apply(self, stmt):
        if self.q:
            like = f"%{self.q.strip()}%"
            stmt = stmt.where(
                or_(
                    Lead.content.ilike(like),
                    Lead.author_name.ilike(like),
                    Lead.author_slug.ilike(like),
                    Lead.company.ilike(like),
                    Lead.author_headline.ilike(like),
                )
            )
        if self.status:
            stmt = stmt.where(Lead.status == self.status)
        if self.category:
            stmt = stmt.where(Lead.service_category == self.category)
        if self.intent_label:
            stmt = stmt.where(Lead.intent_label == self.intent_label)
        if self.min_relevance is not None:
            stmt = stmt.where(Lead.relevance_score >= self.min_relevance)
        if self.min_intent is not None:
            stmt = stmt.where(Lead.intent_score >= self.min_intent)
        if self.campaign_id:
            stmt = stmt.where(Lead.campaign_id == self.campaign_id)
        if self.run_id:
            stmt = stmt.where(Lead.import_run_id == self.run_id)
        if self.india_only:
            stmt = stmt.where(Lead.is_india.is_(True))
        if not self.include_duplicates:
            stmt = stmt.where(Lead.is_duplicate.is_(False))
        if not self.include_not_leads:
            stmt = stmt.where(Lead.intent_label != "not_a_lead")
        if self.posted_after:
            stmt = stmt.where(Lead.posted_at >= self.posted_after)
        if self.posted_before:
            stmt = stmt.where(Lead.posted_at <= self.posted_before)
        return stmt

    def sort(self, stmt):
        col = SORTABLE.get(self.sort_by)
        if col is None:
            raise HTTPException(422, f"sort_by must be one of {sorted(SORTABLE)}")
        # NULLs last regardless of direction; id as a stable tiebreaker
        ordered = col.asc() if self.order == "asc" else col.desc()
        return stmt.order_by(col.is_(None), ordered, Lead.id.desc())


@router.get("", response_model=LeadPage)
def list_leads(
    f: LeadFilters = Depends(),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
):
    base = f.apply(select(Lead))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(f.sort(base).offset((page - 1) * page_size).limit(page_size)).all()
    return LeadPage(items=rows, total=total, page=page, page_size=page_size)


def _csv_safe(value) -> str:
    """Neutralise spreadsheet formula injection (cells starting with = + - @ are executed by Excel)."""
    s = "" if value is None else str(value)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


EXPORT_COLUMNS = [
    ("id", lambda l: l.id),
    ("status", lambda l: l.status),
    ("service_category", lambda l: l.service_category),
    ("intent_label", lambda l: l.intent_label),
    ("intent_score", lambda l: l.intent_score),
    ("relevance_score", lambda l: l.relevance_score),
    ("is_india", lambda l: l.is_india),
    ("author_name", lambda l: l.author_display),
    ("author_headline", lambda l: l.author_headline),
    ("company", lambda l: l.company),
    ("location", lambda l: l.location),
    ("posted_at", lambda l: l.posted_at.isoformat() if l.posted_at else ""),
    ("captured_at", lambda l: l.captured_at.isoformat() if l.captured_at else ""),
    ("source_url", lambda l: l.source_url),
    ("post_text", lambda l: l.content),
    ("signals", lambda l: "; ".join(l.matched_signals or [])),
    ("notes", lambda l: l.notes),
]


@router.get("/export.csv")
def export_csv(f: LeadFilters = Depends(), db: Session = Depends(get_db)):
    stmt = f.sort(f.apply(select(Lead)))

    def stream():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([name for name, _ in EXPORT_COLUMNS])
        yield "﻿" + buf.getvalue()  # BOM so Excel opens UTF-8 correctly
        for lead in db.scalars(stmt.execution_options(yield_per=200)):
            buf.seek(0)
            buf.truncate()
            w.writerow([_csv_safe(fn(lead)) for _, fn in EXPORT_COLUMNS])
            yield buf.getvalue()

    stamp = utcnow().strftime("%Y%m%d-%H%M%S")
    return StreamingResponse(
        stream(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="leads-{stamp}.csv"'},
    )


@router.post("/bulk-status")
def bulk_status(payload: BulkStatusIn, db: Session = Depends(get_db)):
    res = db.execute(
        update(Lead).where(Lead.id.in_(payload.ids)).values(status=payload.status, updated_at=utcnow())
    )
    db.commit()
    return {"updated": res.rowcount}


@router.get("/{lead_id}", response_model=LeadOut)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    return lead


@router.patch("/{lead_id}", response_model=LeadOut)
def patch_lead(lead_id: int, payload: LeadPatch, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    try:
        payload.validate_values()
    except ValueError as e:
        raise HTTPException(422, str(e))
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(lead, key, value)
    lead.updated_at = utcnow()
    db.commit()
    return lead


@router.delete("/{lead_id}", status_code=204)
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    # Anything flagged as a duplicate of this lead loses its pointer (FK is SET NULL)
    db.delete(lead)
    db.commit()
