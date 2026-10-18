from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import LEAD_STATUSES

VALID_CATEGORIES = ("influencer_marketing", "ad_agency", "production_house", "brand_film", "other")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- campaigns
class CampaignIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    service_categories: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    exclude_keywords: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    is_active: bool = True


class CampaignOut(ORM, CampaignIn):
    id: int
    created_at: datetime
    updated_at: datetime
    lead_count: int = 0
    pending_searches: int = 0


class SearchTaskOut(ORM):
    id: int
    campaign_id: int
    query_text: str
    search_url: str
    service_category: str | None
    status: str
    posts_added: int
    created_at: datetime
    completed_at: datetime | None


class SearchTaskPatch(BaseModel):
    status: str = Field(pattern="^(pending|done|skipped)$")


class GenerateSearchesIn(BaseModel):
    date_posted: str = Field(default="past-week", pattern="^(past-24h|past-week|past-month)$")
    max_queries: int = Field(default=40, ge=1, le=200)


# ---------------------------------------------------------------- import
class ImportItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    url: str | None = None
    text: str | None = None
    author_name: str | None = None
    author_headline: str | None = None
    author_profile_url: str | None = None
    company: str | None = None
    location: str | None = None
    posted_at: str | None = None


class ImportIn(BaseModel):
    campaign_id: int | None = None
    search_task_id: int | None = None
    items: list[ImportItem] = Field(min_length=1, max_length=500)


class BulkTextIn(BaseModel):
    campaign_id: int | None = None
    search_task_id: int | None = None
    raw_text: str = Field(min_length=1, max_length=2_000_000)


class ErrorLogOut(ORM):
    id: int
    run_id: int | None
    level: str
    stage: str
    message: str
    payload: dict | None
    resolved: bool
    created_at: datetime


class RunOut(ORM):
    id: int
    campaign_id: int | None
    search_task_id: int | None
    source: str
    status: str
    total: int
    created: int
    duplicates: int
    near_duplicates: int
    failed: int
    started_at: datetime
    finished_at: datetime | None


class RunDetailOut(RunOut):
    errors: list[ErrorLogOut] = []


# ---------------------------------------------------------------- leads
class LeadOut(ORM):
    id: int
    campaign_id: int | None
    import_run_id: int | None
    source_url: str
    post_id: str | None
    content: str
    author_name: str | None
    author_display: str | None
    author_headline: str | None
    author_profile_url: str | None
    company: str | None
    location: str | None
    posted_at: datetime | None
    captured_at: datetime
    service_category: str
    relevance_score: float
    intent_score: float
    intent_label: str
    is_india: bool
    matched_signals: list
    status: str
    notes: str | None
    is_duplicate: bool
    duplicate_of_id: int | None
    created_at: datetime
    updated_at: datetime


class LeadPatch(BaseModel):
    status: str | None = None
    notes: str | None = None
    service_category: str | None = None

    def validate_values(self) -> None:
        if self.status is not None and self.status not in LEAD_STATUSES:
            raise ValueError(f"status must be one of {LEAD_STATUSES}")
        if self.service_category is not None and self.service_category not in VALID_CATEGORIES:
            raise ValueError(f"service_category must be one of {VALID_CATEGORIES}")


class LeadPage(BaseModel):
    items: list[LeadOut]
    total: int
    page: int
    page_size: int


class BulkStatusIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    status: str = Field(pattern="^(new|reviewed|shortlisted|rejected)$")
