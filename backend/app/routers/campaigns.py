from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Campaign, Lead, SearchTask, utcnow
from ..schemas import (
    VALID_CATEGORIES,
    CampaignIn,
    CampaignOut,
    GenerateSearchesIn,
    SearchTaskOut,
    SearchTaskPatch,
)
from ..services.search_links import build_search_url, generate_queries

router = APIRouter(tags=["campaigns"])


def _clean_list(values: list[str]) -> list[str]:
    seen, out = set(), []
    for v in values:
        v = (v or "").strip()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


def _validate(payload: CampaignIn) -> None:
    bad = [c for c in payload.service_categories if c not in VALID_CATEGORIES]
    if bad:
        raise HTTPException(422, f"Unknown service categories: {bad}. Valid: {list(VALID_CATEGORIES)}")


def _to_out(db: Session, c: Campaign) -> CampaignOut:
    out = CampaignOut.model_validate(c)
    out.lead_count = db.scalar(
        select(func.count()).select_from(Lead).where(Lead.campaign_id == c.id, Lead.is_duplicate.is_(False))
    ) or 0
    out.pending_searches = db.scalar(
        select(func.count()).select_from(SearchTask).where(
            SearchTask.campaign_id == c.id, SearchTask.status == "pending"
        )
    ) or 0
    return out


@router.get("/campaigns", response_model=list[CampaignOut])
def list_campaigns(db: Session = Depends(get_db)):
    rows = db.scalars(select(Campaign).order_by(Campaign.created_at.desc())).all()
    return [_to_out(db, c) for c in rows]


@router.post("/campaigns", response_model=CampaignOut, status_code=201)
def create_campaign(payload: CampaignIn, db: Session = Depends(get_db)):
    _validate(payload)
    c = Campaign(
        name=payload.name.strip(),
        description=payload.description,
        service_categories=_clean_list(payload.service_categories),
        keywords=_clean_list(payload.keywords),
        exclude_keywords=_clean_list(payload.exclude_keywords),
        locations=_clean_list(payload.locations),
        is_active=payload.is_active,
    )
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A campaign with this name already exists")
    return _to_out(db, c)


@router.get("/campaigns/{campaign_id}", response_model=CampaignOut)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(404, "Campaign not found")
    return _to_out(db, c)


@router.put("/campaigns/{campaign_id}", response_model=CampaignOut)
def update_campaign(campaign_id: int, payload: CampaignIn, db: Session = Depends(get_db)):
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(404, "Campaign not found")
    _validate(payload)
    c.name = payload.name.strip()
    c.description = payload.description
    c.service_categories = _clean_list(payload.service_categories)
    c.keywords = _clean_list(payload.keywords)
    c.exclude_keywords = _clean_list(payload.exclude_keywords)
    c.locations = _clean_list(payload.locations)
    c.is_active = payload.is_active
    c.updated_at = utcnow()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A campaign with this name already exists")
    return _to_out(db, c)


@router.delete("/campaigns/{campaign_id}", status_code=204)
def delete_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(404, "Campaign not found")
    db.delete(c)  # leads keep existing: campaign_id is SET NULL
    db.commit()


# ---------------------------------------------------------------- search tasks (manual search checklist)
@router.post("/campaigns/{campaign_id}/generate-searches", response_model=list[SearchTaskOut])
def generate_searches(campaign_id: int, payload: GenerateSearchesIn | None = None, db: Session = Depends(get_db)):
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(404, "Campaign not found")
    payload = payload or GenerateSearchesIn()
    if not c.service_categories and not c.keywords:
        raise HTTPException(422, "Add at least one service category or keyword to the campaign first")

    existing = set(
        db.scalars(select(SearchTask.query_text).where(SearchTask.campaign_id == c.id)).all()
    )
    queries = generate_queries(c.service_categories, c.keywords, c.locations, payload.max_queries)
    created: list[SearchTask] = []
    for q, cat in queries:
        if q in existing:
            continue
        t = SearchTask(
            campaign_id=c.id,
            query_text=q,
            service_category=cat,
            search_url=build_search_url(q, payload.date_posted),
        )
        db.add(t)
        created.append(t)
    db.commit()
    return created


@router.get("/campaigns/{campaign_id}/search-tasks", response_model=list[SearchTaskOut])
def list_search_tasks(campaign_id: int, status: str | None = None, db: Session = Depends(get_db)):
    if not db.get(Campaign, campaign_id):
        raise HTTPException(404, "Campaign not found")
    stmt = select(SearchTask).where(SearchTask.campaign_id == campaign_id).order_by(SearchTask.id)
    if status:
        stmt = stmt.where(SearchTask.status == status)
    return db.scalars(stmt).all()


@router.patch("/search-tasks/{task_id}", response_model=SearchTaskOut)
def patch_search_task(task_id: int, payload: SearchTaskPatch, db: Session = Depends(get_db)):
    t = db.get(SearchTask, task_id)
    if not t:
        raise HTTPException(404, "Search task not found")
    t.status = payload.status
    t.completed_at = utcnow() if payload.status != "pending" else None
    db.commit()
    return t
