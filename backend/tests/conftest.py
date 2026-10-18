import os

# Must be set before the app is imported so the engine points at a throwaway DB.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_leads.db")

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    with TestClient(app) as c:  # lifespan creates tables
        yield c
    Base.metadata.drop_all(bind=engine)


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    if os.path.exists("test_leads.db"):
        try:
            os.remove("test_leads.db")
        except OSError:
            pass


def post_url(n: int, slug: str = "jane-doe-1a2b") -> str:
    return f"https://www.linkedin.com/posts/{slug}_hello-activity-71234567890123456{n:02d}-AbCd"
