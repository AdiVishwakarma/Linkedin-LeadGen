import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import campaigns, dashboard, imports, leads, runs
from .services.importer import recover_interrupted_runs

logger = logging.getLogger("leads")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        n = recover_interrupted_runs(db)
        if n:
            logger.warning("Marked %d interrupted run(s) from a previous process", n)
    yield


app = FastAPI(
    title="LinkedIn Lead Discovery",
    description="Assisted lead discovery: users capture public LinkedIn posts, the backend "
    "classifies, scores, deduplicates and stores them. No scraping, no automation of LinkedIn.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (campaigns.router, imports.router, leads.router, runs.router, dashboard.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}
