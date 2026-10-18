from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ErrorLog, ImportRun
from ..schemas import ErrorLogOut, RunDetailOut, RunOut
from ..services.importer import retry_run

router = APIRouter(tags=["runs"])


@router.get("/runs", response_model=list[RunOut])
def list_runs(
    status: str | None = None,
    campaign_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    stmt = select(ImportRun).order_by(ImportRun.started_at.desc(), ImportRun.id.desc()).limit(limit)
    if status:
        stmt = stmt.where(ImportRun.status == status)
    if campaign_id:
        stmt = stmt.where(ImportRun.campaign_id == campaign_id)
    return db.scalars(stmt).all()


@router.get("/runs/{run_id}", response_model=RunDetailOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(ImportRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.post("/runs/{run_id}/retry", response_model=RunDetailOut)
def retry(run_id: int, db: Session = Depends(get_db)):
    """Re-process this run's failed items from the payloads saved in the error log."""
    try:
        return retry_run(db, run_id)
    except LookupError:
        raise HTTPException(404, "Run not found")


@router.get("/errors", response_model=list[ErrorLogOut])
def list_errors(
    run_id: int | None = None,
    level: str | None = Query(None, pattern="^(error|warning|info)$"),
    unresolved_only: bool = False,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(ErrorLog).order_by(ErrorLog.created_at.desc(), ErrorLog.id.desc()).limit(limit)
    if run_id:
        stmt = stmt.where(ErrorLog.run_id == run_id)
    if level:
        stmt = stmt.where(ErrorLog.level == level)
    if unresolved_only:
        stmt = stmt.where(ErrorLog.resolved.is_(False))
    return db.scalars(stmt).all()
