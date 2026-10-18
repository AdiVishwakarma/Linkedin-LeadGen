from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Campaign, SearchTask
from ..schemas import BulkTextIn, ImportIn, RunOut
from ..services.importer import run_import
from ..services.parsers import MAX_ITEMS_PER_BATCH, parse_bulk_text, parse_csv

router = APIRouter(prefix="/imports", tags=["imports"])


def _check_refs(db: Session, campaign_id: int | None, search_task_id: int | None) -> None:
    if campaign_id and not db.get(Campaign, campaign_id):
        raise HTTPException(404, "Campaign not found")
    if search_task_id and not db.get(SearchTask, search_task_id):
        raise HTTPException(404, "Search task not found")


@router.post("", response_model=RunOut, status_code=201)
def import_items(payload: ImportIn, db: Session = Depends(get_db)):
    """Structured import: a list of {url, text, author_name, ...}."""
    _check_refs(db, payload.campaign_id, payload.search_task_id)
    items = [i.model_dump() for i in payload.items]
    return run_import(
        db,
        items,
        source="manual" if len(items) == 1 else "bulk",
        campaign_id=payload.campaign_id,
        search_task_id=payload.search_task_id,
    )


@router.post("/bulk-text", response_model=RunOut, status_code=201)
def import_bulk_text(payload: BulkTextIn, db: Session = Depends(get_db)):
    """Paste many posts at once. Blocks separated by a line of '---'; each block has the post URL,
    optional 'Author:/Company:/Posted:' lines, then the post text."""
    _check_refs(db, payload.campaign_id, payload.search_task_id)
    items = parse_bulk_text(payload.raw_text)
    if not items:
        raise HTTPException(422, "No posts found in the pasted text")
    if len(items) > MAX_ITEMS_PER_BATCH:
        raise HTTPException(422, f"Too many posts in one paste (max {MAX_ITEMS_PER_BATCH})")
    return run_import(
        db, items, source="bulk", campaign_id=payload.campaign_id, search_task_id=payload.search_task_id
    )


@router.post("/csv", response_model=RunOut, status_code=201)
async def import_csv(
    file: UploadFile = File(...),
    campaign_id: int | None = Form(default=None),
    search_task_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
):
    _check_refs(db, campaign_id, search_task_id)
    data = await file.read()
    try:
        items = parse_csv(data)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if not items:
        raise HTTPException(422, "CSV has no data rows")
    return run_import(db, items, source="csv", campaign_id=campaign_id, search_task_id=search_task_id)
